import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import {
  CustomerUploadRequestStatus,
  FileAssetVisibility,
  Prisma,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  customerUploadAccessTokenHashes,
  findOpenCustomerUploadAccessItem,
} from "@/lib/customer-upload-access";
import { tagsForCustomerUpload } from "@/lib/customer-upload-documents";
import { hasCredentialEncryptionKey } from "@/lib/crypto/secrets";
import { prisma } from "@/lib/prisma";
import { recordDocumentPath } from "@/lib/record-document-records";
import { resolveRecordDocumentUploadDestination } from "@/lib/record-document-upload";
import {
  abortR2MultipartUpload,
  completeR2MultipartUpload,
  createR2MultipartUpload,
  deleteR2Object,
  getR2Config,
  getR2ObjectRangeBytes,
  headR2Object,
  uploadR2MultipartPart,
} from "@/lib/storage/r2";
import {
  createStoredMediaFileAsset,
  mediaMimeMatches,
  mediaObjectKey,
  normaliseMediaMimeType,
  validateMediaObjectHead,
} from "@/lib/storage/media";
import {
  normaliseFileAssetNotes,
  parseFileAssetTags,
} from "@/lib/storage/file-metadata";
import {
  customerUploadEffectiveMaxUploadMb,
  customerUploadMegabyte,
  customerUploadMultipartPartSizeBytes,
} from "@/lib/customer-upload-multipart-config";

const customerUploadMultipartSessionTtlMs = 2 * 60 * 60 * 1000;
const maxMultipartParts = 1000;
const uploadSessionVersion = 1;

const uploadSessionPayloadSchema = z.object({
  bucketName: z.string().trim().min(1),
  deferRequestCompletion: z.boolean().default(false),
  documentFolder: z.string().trim().min(1),
  documentUploadType: z.string().trim().min(1),
  entityId: z.string().trim().min(1),
  entityType: z.enum(["Contact", "Company", "SalesOpportunity"]),
  expiresAt: z.string().datetime(),
  fileName: z.string().trim().min(1),
  fileSize: z.number().int().positive(),
  itemId: z.string().trim().min(1),
  itemLabel: z.string().trim().min(1),
  key: z.string().trim().min(1),
  mimeType: z.string().trim(),
  notes: z.string().nullable(),
  partCount: z.number().int().positive().max(maxMultipartParts),
  partSize: z
    .number()
    .int()
    .min(5 * customerUploadMegabyte),
  requestId: z.string().trim().min(1),
  tags: z.array(z.string()),
  tokenHash: z.string().trim().min(64).max(64),
  uploadId: z.string().trim().min(1),
  v: z.literal(uploadSessionVersion),
});

type UploadSessionPayload = z.infer<typeof uploadSessionPayloadSchema>;

export type StartCustomerUploadMultipartInput = {
  deferRequestCompletion?: boolean;
  fileName: string;
  fileSize: number;
  itemId: string;
  mimeType: string;
  notes?: string | null;
  tagsText?: string | null;
  token: string;
};

export type CompleteCustomerUploadMultipartInput = {
  parts: Array<{
    eTag: string;
    partNumber: number;
  }>;
  token: string;
  uploadSession: string;
};

function uploadSessionSecret() {
  const secret = process.env.CREDENTIAL_ENCRYPTION_KEY?.trim();

  if (!hasCredentialEncryptionKey() || !secret || secret.length < 32) {
    throw new Error("Upload session signing is not configured.");
  }

  return secret;
}

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payloadSegment: string) {
  return base64UrlEncode(
    createHmac("sha256", uploadSessionSecret()).update(payloadSegment).digest(),
  );
}

function signaturesMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function signUploadSession(payload: UploadSessionPayload) {
  const payloadSegment = base64UrlEncode(JSON.stringify(payload));
  return `${payloadSegment}.${signPayload(payloadSegment)}`;
}

function readUploadSession(value: string, token: string) {
  const [payloadSegment, signature] = value.split(".");

  if (!payloadSegment || !signature) {
    throw new Error("Upload session is invalid.");
  }

  if (!signaturesMatch(signPayload(payloadSegment), signature)) {
    throw new Error("Upload session signature is invalid.");
  }

  const parsed = uploadSessionPayloadSchema.safeParse(
    JSON.parse(base64UrlDecode(payloadSegment)) as unknown,
  );

  if (!parsed.success) {
    throw new Error("Upload session payload is invalid.");
  }

  if (parsed.data.expiresAt <= new Date().toISOString()) {
    throw new Error("Upload session has expired.");
  }

  if (!customerUploadAccessTokenHashes(token).includes(parsed.data.tokenHash)) {
    throw new Error("Upload session does not match this upload link.");
  }

  return parsed.data;
}

function normalizeUploadFileName(value: string) {
  const fileName = value.trim().replace(/[/\\]+/g, "-");

  if (!fileName || fileName.length > 191) {
    throw new Error("Enter a valid file name.");
  }

  return fileName;
}

function normalizeUploadMimeType(value: string) {
  return normaliseMediaMimeType(value || "application/octet-stream");
}

function assertNotSvgUpload({
  fileName,
  mimeType,
}: {
  fileName: string;
  mimeType: string;
}) {
  if (mimeType === "image/svg+xml" || fileName.toLowerCase().endsWith(".svg")) {
    throw new Error(
      "SVG uploads are not supported. Upload a raster image file.",
    );
  }
}

function partCountForFile(fileSize: number, partSize: number) {
  return Math.ceil(fileSize / partSize);
}

function expectedPartSize({
  fileSize,
  partCount,
  partNumber,
  partSize,
}: {
  fileSize: number;
  partCount: number;
  partNumber: number;
  partSize: number;
}) {
  if (partNumber < partCount) return partSize;

  return fileSize - partSize * (partCount - 1);
}

async function writeAuditLog({
  action,
  entityId,
  metadata,
}: {
  action: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  await prisma.auditLog.create({
    data: {
      action,
      actorId: null,
      entity: "CustomerUploadRequest",
      entityId: entityId ?? null,
      metadata,
    },
  });
}

export async function startCustomerUploadMultipartUpload({
  deferRequestCompletion = false,
  fileName,
  fileSize,
  itemId,
  mimeType,
  notes,
  tagsText,
  token,
}: StartCustomerUploadMultipartInput) {
  const safeFileName = normalizeUploadFileName(fileName);
  const safeMimeType = normalizeUploadMimeType(mimeType);
  const safeNotes = normaliseFileAssetNotes(notes);
  const submittedTags = parseFileAssetTags(tagsText);
  const sizeBytes = Number(fileSize);

  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw new Error("File size is invalid.");
  }

  assertNotSvgUpload({ fileName: safeFileName, mimeType: safeMimeType });

  const config = await getR2Config();

  if (!config) {
    throw new Error("Cloudflare R2 is not configured.");
  }

  const maxUploadMb = customerUploadEffectiveMaxUploadMb(config.maxUploadMb);
  const maxBytes = maxUploadMb * customerUploadMegabyte;

  if (sizeBytes > maxBytes) {
    throw new Error(`File must be ${maxUploadMb}MB or smaller.`);
  }

  if (
    safeMimeType &&
    safeMimeType !== "application/octet-stream" &&
    !mediaMimeMatches(safeMimeType, config.allowedMimeTypes)
  ) {
    throw new Error(
      "This file type is not allowed by the R2 integration settings.",
    );
  }

  const partSize = customerUploadMultipartPartSizeBytes;
  const partCount = partCountForFile(sizeBytes, partSize);

  if (partCount > maxMultipartParts) {
    throw new Error("File is too large for chunked upload.");
  }

  const context = await findOpenCustomerUploadAccessItem({ itemId, token });
  const destination = await resolveRecordDocumentUploadDestination({
    entityId: context.request.entityId,
    entityType: context.request.entityType,
    uploadType: context.item.uploadType,
  });
  const key = mediaObjectKey({
    contentType: safeMimeType,
    fileName: safeFileName,
    folder: destination.storageFolder,
    uploadPrefix: config.uploadPrefix,
  });
  const upload = await createR2MultipartUpload({
    contentType: safeMimeType || "application/octet-stream",
    key,
  });
  const expiresAt = new Date(
    Date.now() + customerUploadMultipartSessionTtlMs,
  ).toISOString();
  const payload: UploadSessionPayload = {
    bucketName: upload.bucketName,
    deferRequestCompletion,
    documentFolder: destination.folder.slug,
    documentUploadType: context.item.uploadType,
    entityId: context.request.entityId,
    entityType: context.request.entityType,
    expiresAt,
    fileName: safeFileName,
    fileSize: sizeBytes,
    itemId: context.item.id,
    itemLabel: context.item.label,
    key: upload.key,
    mimeType: safeMimeType,
    notes: safeNotes,
    partCount,
    partSize,
    requestId: context.request.id,
    tags: tagsForCustomerUpload(context.item.label, submittedTags),
    tokenHash: context.accessTokenHash,
    uploadId: upload.uploadId,
    v: uploadSessionVersion,
  };

  return {
    expiresAt,
    partCount,
    partSize,
    uploadSession: signUploadSession(payload),
  };
}

export async function uploadCustomerUploadMultipartPart({
  body,
  partNumber,
  token,
  uploadSession,
}: {
  body: Buffer;
  partNumber: number;
  token: string;
  uploadSession: string;
}) {
  const session = readUploadSession(uploadSession, token);

  await findOpenCustomerUploadAccessItem({ itemId: session.itemId, token });

  if (
    !Number.isSafeInteger(partNumber) ||
    partNumber < 1 ||
    partNumber > session.partCount
  ) {
    throw new Error("Upload part number is invalid.");
  }

  const expectedBytes = expectedPartSize({
    fileSize: session.fileSize,
    partCount: session.partCount,
    partNumber,
    partSize: session.partSize,
  });

  if (body.byteLength !== expectedBytes) {
    throw new Error("Upload chunk size does not match the upload session.");
  }

  return uploadR2MultipartPart({
    body,
    key: session.key,
    partNumber,
    uploadId: session.uploadId,
  });
}

export async function abortCustomerUploadMultipartUpload({
  token,
  uploadSession,
}: {
  token: string;
  uploadSession: string;
}) {
  const session = readUploadSession(uploadSession, token);

  await abortR2MultipartUpload({
    key: session.key,
    uploadId: session.uploadId,
  });
}

function normalizeCompletedParts(
  parts: CompleteCustomerUploadMultipartInput["parts"],
) {
  const normalized = parts
    .map((part) => ({
      ETag: part.eTag.trim(),
      PartNumber: Number(part.partNumber),
    }))
    .sort((left, right) => left.PartNumber - right.PartNumber);

  normalized.forEach((part, index) => {
    if (part.PartNumber !== index + 1 || !part.ETag || part.ETag.length > 200) {
      throw new Error("Upload parts are invalid.");
    }
  });

  return normalized;
}

export async function completeCustomerUploadMultipartUpload({
  parts,
  token,
  uploadSession,
}: CompleteCustomerUploadMultipartInput) {
  const session = readUploadSession(uploadSession, token);

  await findOpenCustomerUploadAccessItem({ itemId: session.itemId, token });

  if (parts.length !== session.partCount) {
    throw new Error("Upload is missing one or more chunks.");
  }

  const completed = await completeR2MultipartUpload({
    key: session.key,
    parts: normalizeCompletedParts(parts),
    uploadId: session.uploadId,
  });

  try {
    const head = await headR2Object({ key: session.key });

    if (
      typeof head.contentLength === "number" &&
      head.contentLength !== session.fileSize
    ) {
      throw new Error("Uploaded file size does not match the upload session.");
    }

    const config = await getR2Config();

    if (!config) {
      throw new Error("Cloudflare R2 is not configured.");
    }

    const headBytes = await getR2ObjectRangeBytes({
      end: 4095,
      key: session.key,
    });
    const { effectiveMimeType } = validateMediaObjectHead({
      allowedMimeTypes: config.allowedMimeTypes,
      body: headBytes,
      fileName: session.fileName,
      mimeType: head.contentType || session.mimeType,
    });

    const uploadedAt = new Date();
    const fileAsset = await createStoredMediaFileAsset({
      bucket: completed.bucketName,
      checksum: completed.eTag
        ? `multipart-etag:${completed.eTag.replaceAll('"', "")}`
        : null,
      documentFolder: session.documentFolder,
      documentUploadType: session.documentUploadType,
      entityId: session.entityId,
      entityType: session.entityType,
      key: session.key,
      mimeType: effectiveMimeType,
      notes: session.notes,
      originalName: session.fileName,
      sizeBytes: session.fileSize,
      tags: session.tags,
      uploadedById: null,
      visibility: FileAssetVisibility.PRIVATE,
    });

    await prisma.customerUploadRequestItem.update({
      where: { id: session.itemId },
      data: {
        files: {
          create: [{ fileAssetId: fileAsset.id }],
        },
        fulfilledAt: uploadedAt,
      },
    });

    const remainingRequired = await prisma.customerUploadRequestItem.count({
      where: {
        fulfilledAt: null,
        requestId: session.requestId,
        required: true,
      },
    });

    if (!session.deferRequestCompletion && !remainingRequired) {
      await prisma.customerUploadRequest.update({
        where: { id: session.requestId },
        data: {
          completedAt: uploadedAt,
          status: CustomerUploadRequestStatus.COMPLETED,
        },
      });
    }

    await writeAuditLog({
      action: "customer_upload_request.uploaded",
      entityId: session.requestId,
      metadata: {
        chunked: true,
        entityId: session.entityId,
        entityType: session.entityType,
        fileCount: 1,
        itemId: session.itemId,
        uploadType: session.documentUploadType,
      },
    });

    revalidatePath(`/upload/${token}`);
    revalidatePath(`/portal/${token}`);
    revalidatePath(recordDocumentPath(session.entityType, session.entityId));
    revalidatePath("/storage");

    return {
      fileAssetId: fileAsset.id,
      savedAt: uploadedAt.toISOString(),
    };
  } catch (error) {
    await deleteR2Object({ key: session.key }).catch(() => undefined);
    throw error;
  }
}
