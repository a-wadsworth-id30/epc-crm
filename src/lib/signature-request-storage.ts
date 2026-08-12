import "server-only";

import crypto from "node:crypto";
import { FileAssetVisibility } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveRecordDocumentUploadDestination } from "@/lib/record-document-upload";
import type { RecordDocumentEntityType } from "@/lib/record-document-records";
import {
  createStoredMediaFileAsset,
  mediaObjectKey,
  validateMediaObjectHead,
} from "@/lib/storage/media";
import { getR2Config, putR2Object } from "@/lib/storage/r2";

const docusignAutoStoredNote =
  "Stored automatically from a completed DocuSign envelope.";

export async function storeSignatureRequestPdf({
  body,
  contentType,
  createdByUserId,
  entityId,
  entityType,
  originalName,
  tags,
}: {
  body: Buffer;
  contentType: string;
  createdByUserId?: string | null;
  entityId: string;
  entityType: RecordDocumentEntityType;
  originalName: string;
  tags: string[];
}) {
  if (!body.length) {
    throw new Error("DocuSign returned an empty document.");
  }

  const config = await getR2Config();

  if (!config) {
    throw new Error("Cloudflare R2 is not configured.");
  }

  const { effectiveMimeType } = validateMediaObjectHead({
    allowedMimeTypes: "application/pdf",
    body,
    fileName: originalName,
    mimeType: contentType || "application/pdf",
  });

  const destination = await resolveRecordDocumentUploadDestination({
    entityId,
    entityType,
    uploadType: "contract",
  });
  const checksum = crypto.createHash("sha256").update(body).digest("hex");
  const existingAsset = await prisma.fileAsset.findFirst({
    where: {
      checksum,
      documentFolder: destination.folder.slug,
      documentUploadType: "contract",
      entityId,
      entityType,
      mimeType: effectiveMimeType,
      notes: docusignAutoStoredNote,
      originalName,
      tags: { hasEvery: tags },
    },
    orderBy: { createdAt: "asc" },
  });

  if (existingAsset) {
    return existingAsset;
  }

  const key = mediaObjectKey({
    contentType: effectiveMimeType,
    fileName: originalName,
    folder: destination.storageFolder,
    uploadPrefix: config.uploadPrefix,
  });
  const upload = await putR2Object({
    body,
    contentType: effectiveMimeType,
    key,
  });

  return createStoredMediaFileAsset({
    bucket: upload.bucketName,
    checksum,
    documentFolder: destination.folder.slug,
    documentUploadType: "contract",
    entityId,
    entityType,
    key: upload.key,
    mimeType: effectiveMimeType,
    notes: docusignAutoStoredNote,
    originalName,
    sizeBytes: body.length,
    tags,
    uploadedById: createdByUserId ?? null,
    visibility: FileAssetVisibility.PRIVATE,
  });
}
