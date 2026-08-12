"use server";

import { CustomerUploadRequestStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import {
  customerUploadDefaultExpiryDays,
  customerUploadExpiryDate,
  customerUploadRequestUrl,
  customerUploadTokenHash,
  generateCustomerUploadToken,
} from "@/lib/customer-upload-requests";
import { findOpenCustomerUploadAccessItem } from "@/lib/customer-upload-access";
import { tagsForCustomerUpload } from "@/lib/customer-upload-documents";
import { sendCustomerUploadRequestEmail } from "@/lib/customer-upload-request-email";
import {
  documentUploadTypeDefinition,
  isDocumentUploadType,
  type DocumentUploadType,
} from "@/lib/document-library";
import { trustedAppBaseUrl } from "@/lib/http/origin";
import { prisma } from "@/lib/prisma";
import {
  canAccessRecordDocumentEntity,
  isRecordDocumentEntityType,
  recordDocumentPath,
  type RecordDocumentEntityType,
} from "@/lib/record-document-records";
import { uploadRecordDocumentFile } from "@/lib/record-document-upload";
import {
  normaliseFileAssetNotes,
  parseFileAssetTags,
} from "@/lib/storage/file-metadata";

export type CustomerUploadRequestActionState = {
  ok: boolean;
  message: string;
  expiresAt?: string;
  savedAt?: string;
  uploadUrl?: string;
};

export type CustomerUploadDocumentActionState = {
  ok: boolean;
  message: string;
  savedAt?: string;
};

const createCustomerUploadRequestSchema = z.object({
  entityId: z.string().trim().min(1),
  entityType: z
    .unknown()
    .refine(isRecordDocumentEntityType, "Choose a valid CRM record."),
  expiresInDays: z.coerce
    .number()
    .int()
    .min(1)
    .max(60)
    .default(customerUploadDefaultExpiryDays),
  message: z
    .string()
    .trim()
    .max(1000, "Message must be 1000 characters or fewer.")
    .optional()
    .transform((value) => value || null),
  recipientEmail: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null)
    .pipe(z.string().email().nullable()),
  recipientName: z
    .string()
    .trim()
    .max(120, "Recipient name must be 120 characters or fewer.")
    .optional()
    .transform((value) => value || null),
});

const revokeCustomerUploadRequestSchema = z.object({
  entityId: z.string().trim().min(1),
  entityType: z
    .unknown()
    .refine(isRecordDocumentEntityType, "Choose a valid CRM record."),
  requestId: z.string().trim().min(1),
});

const uploadCustomerRequestDocumentSchema = z.object({
  itemId: z.string().trim().min(1),
  notes: z
    .string()
    .max(2000, "Notes must be 2000 characters or fewer.")
    .optional()
    .transform((value) => normaliseFileAssetNotes(value)),
  tagsText: z
    .string()
    .max(1200, "Tags must be shorter.")
    .optional()
    .transform((value) => parseFileAssetTags(value)),
  token: z.string().trim().min(30).max(160),
});

function selectedDocumentTypes(formData: FormData) {
  const seen = new Set<DocumentUploadType>();
  const selected: DocumentUploadType[] = [];

  formData.getAll("documentTypes").forEach((value) => {
    if (!isDocumentUploadType(value) || seen.has(value)) return;
    seen.add(value);
    selected.push(value);
  });

  return selected;
}

function uploadFilesFromFormData(formData: FormData) {
  return formData
    .getAll("files")
    .filter((file): file is File => file instanceof File && file.size > 0);
}

function uploadRequestItemData(types: DocumentUploadType[]) {
  return types.map((type) => {
    const definition = documentUploadTypeDefinition(type);

    return {
      description: definition?.description ?? null,
      label: definition?.label ?? type,
      required: true,
      uploadType: type,
    };
  });
}

function uploadRequestDocumentLabels(types: DocumentUploadType[]) {
  return types.map((type) => documentUploadTypeDefinition(type)?.label ?? type);
}

function customerUploadEmailFailureReason(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("not connected")) return "MailerSend is not connected.";
  if (message.includes("sender email")) {
    return "MailerSend sender email is not configured.";
  }

  const statusMatch = message.match(/status (\d+)/i);
  if (statusMatch?.[1]) {
    return `MailerSend send failed with status ${statusMatch[1]}.`;
  }

  return "Customer upload email could not be sent.";
}

async function writeAuditLog({
  action,
  actorId,
  entityId,
  metadata,
}: {
  action: string;
  actorId?: string | null;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  await prisma.auditLog.create({
    data: {
      action,
      actorId: actorId ?? null,
      entity: "CustomerUploadRequest",
      entityId: entityId ?? null,
      metadata,
    },
  });
}

export async function createCustomerUploadRequestAction(
  _: CustomerUploadRequestActionState,
  formData: FormData,
): Promise<CustomerUploadRequestActionState> {
  const user = await requireUser();
  const documentTypes = selectedDocumentTypes(formData);
  const parsed = createCustomerUploadRequestSchema.safeParse({
    entityId: formData.get("entityId"),
    entityType: formData.get("entityType"),
    expiresInDays: formData.get("expiresInDays"),
    message: formData.get("message"),
    recipientEmail: formData.get("recipientEmail"),
    recipientName: formData.get("recipientName"),
  });

  if (!documentTypes.length) {
    return { ok: false, message: "Choose at least one required document." };
  }

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Check the upload request details.",
    };
  }

  const entityType = parsed.data.entityType as RecordDocumentEntityType;
  const record = await canAccessRecordDocumentEntity({
    entityId: parsed.data.entityId,
    entityType,
    user,
  });

  if (!record) {
    return { ok: false, message: "Record not found." };
  }

  const token = generateCustomerUploadToken();
  const tokenHash = customerUploadTokenHash(token);
  const expiresAt = customerUploadExpiryDate({
    days: parsed.data.expiresInDays,
  });
  const uploadUrl = customerUploadRequestUrl({
    baseUrl: trustedAppBaseUrl(),
    token,
  });
  const request = await prisma.customerUploadRequest.create({
    data: {
      createdByUserId: user.id,
      entityId: parsed.data.entityId,
      entityType,
      expiresAt,
      items: { create: uploadRequestItemData(documentTypes) },
      message: parsed.data.message,
      recipientEmail: parsed.data.recipientEmail,
      recipientName: parsed.data.recipientName,
      tokenHash,
    },
    select: { id: true },
  });
  let emailDelivery:
    | {
        attempted: true;
        error?: string;
        messageId?: string | null;
        sent: boolean;
        statusCode?: number;
      }
    | { attempted: false } = { attempted: false };

  if (parsed.data.recipientEmail) {
    try {
      const result = await sendCustomerUploadRequestEmail({
        documentLabels: uploadRequestDocumentLabels(documentTypes),
        expiresAt,
        message: parsed.data.message,
        recipientEmail: parsed.data.recipientEmail,
        recipientName: parsed.data.recipientName,
        uploadUrl,
      });

      emailDelivery = {
        attempted: true,
        messageId: result.messageId,
        sent: true,
        statusCode: result.statusCode,
      };
    } catch (error) {
      emailDelivery = {
        attempted: true,
        error: customerUploadEmailFailureReason(error),
        sent: false,
      };
    }
  }

  await writeAuditLog({
    action: "customer_upload_request.created",
    actorId: user.id,
    entityId: request.id,
    metadata: {
      documentTypes,
      entityId: parsed.data.entityId,
      entityType,
      email: emailDelivery,
      expiresAt: expiresAt.toISOString(),
      itemCount: documentTypes.length,
    },
  });

  revalidatePath(recordDocumentPath(entityType, parsed.data.entityId));

  return {
    ok: true,
    expiresAt: expiresAt.toISOString(),
    message:
      emailDelivery.attempted && emailDelivery.sent
        ? "Customer upload link created and emailed to the recipient."
        : emailDelivery.attempted
          ? "Customer upload link created, but the email could not be sent. Copy it now; it cannot be recovered later."
          : "Customer upload link created. Copy it now; it cannot be recovered later.",
    savedAt: new Date().toISOString(),
    uploadUrl,
  };
}

export async function revokeCustomerUploadRequestAction(
  _: CustomerUploadRequestActionState,
  formData: FormData,
): Promise<CustomerUploadRequestActionState> {
  const user = await requireUser();
  const parsed = revokeCustomerUploadRequestSchema.safeParse({
    entityId: formData.get("entityId"),
    entityType: formData.get("entityType"),
    requestId: formData.get("requestId"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Check the upload request details.",
    };
  }

  const entityType = parsed.data.entityType as RecordDocumentEntityType;
  const record = await canAccessRecordDocumentEntity({
    entityId: parsed.data.entityId,
    entityType,
    user,
  });

  if (!record) {
    return { ok: false, message: "Record not found." };
  }

  const request = await prisma.customerUploadRequest.findFirst({
    where: {
      entityId: parsed.data.entityId,
      entityType,
      id: parsed.data.requestId,
    },
    select: { id: true, status: true },
  });

  if (!request) {
    return { ok: false, message: "Upload request not found." };
  }

  if (request.status !== CustomerUploadRequestStatus.OPEN) {
    return { ok: false, message: "Only open upload requests can be revoked." };
  }

  await prisma.customerUploadRequest.update({
    where: { id: request.id },
    data: {
      revokedAt: new Date(),
      status: CustomerUploadRequestStatus.REVOKED,
    },
  });

  await writeAuditLog({
    action: "customer_upload_request.revoked",
    actorId: user.id,
    entityId: request.id,
    metadata: {
      entityId: parsed.data.entityId,
      entityType,
    },
  });

  revalidatePath(recordDocumentPath(entityType, parsed.data.entityId));

  return {
    ok: true,
    message: "Customer upload link revoked.",
    savedAt: new Date().toISOString(),
  };
}

export async function uploadCustomerRequestDocumentAction(
  _: CustomerUploadDocumentActionState,
  formData: FormData,
): Promise<CustomerUploadDocumentActionState> {
  const files = uploadFilesFromFormData(formData);
  const parsed = uploadCustomerRequestDocumentSchema.safeParse({
    itemId: formData.get("itemId"),
    notes: formData.get("notes"),
    tagsText: formData.get("tagsText"),
    token: formData.get("token"),
  });

  if (!files.length) {
    return { ok: false, message: "Choose at least one document to upload." };
  }

  if (files.length > 20) {
    return { ok: false, message: "Upload 20 files or fewer at once." };
  }

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the upload details.",
    };
  }

  let context: Awaited<ReturnType<typeof findOpenCustomerUploadAccessItem>>;

  try {
    context = await findOpenCustomerUploadAccessItem({
      itemId: parsed.data.itemId,
      token: parsed.data.token,
    });
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "This upload link is not available.",
    };
  }

  const uploadedFileIds: string[] = [];
  const failures: string[] = [];
  const uploadedAt = new Date();

  for (const file of files) {
    try {
      const upload = await uploadRecordDocumentFile({
        entityId: context.request.entityId,
        entityType: context.request.entityType,
        file,
        notes: parsed.data.notes,
        tags: tagsForCustomerUpload(context.item.label, parsed.data.tagsText),
        uploadedById: null,
        uploadType: context.item.uploadType,
      });

      uploadedFileIds.push(upload.fileAsset.id);
    } catch (error) {
      failures.push(
        `${file.name}: ${
          error instanceof Error ? error.message : "Document upload failed."
        }`,
      );
    }
  }

  if (!uploadedFileIds.length) {
    return {
      ok: false,
      message: failures[0] ?? "Document upload failed.",
    };
  }

  await prisma.customerUploadRequestItem.update({
    where: { id: context.item.id },
    data: {
      files: {
        create: uploadedFileIds.map((fileAssetId) => ({ fileAssetId })),
      },
      fulfilledAt: uploadedAt,
    },
  });

  const remainingRequired = await prisma.customerUploadRequestItem.count({
    where: {
      fulfilledAt: null,
      requestId: context.request.id,
      required: true,
    },
  });

  if (!remainingRequired) {
    await prisma.customerUploadRequest.update({
      where: { id: context.request.id },
      data: {
        completedAt: uploadedAt,
        status: CustomerUploadRequestStatus.COMPLETED,
      },
    });
  }

  await writeAuditLog({
    action: "customer_upload_request.uploaded",
    entityId: context.request.id,
    metadata: {
      accessPath: context.accessPath.startsWith("/portal/")
        ? "customer-document-portal"
        : "customer-upload-link",
      entityId: context.request.entityId,
      entityType: context.request.entityType,
      fileCount: uploadedFileIds.length,
      itemId: context.item.id,
      uploadType: context.item.uploadType,
    },
  });

  revalidatePath(context.accessPath);
  revalidatePath(
    recordDocumentPath(context.request.entityType, context.request.entityId),
  );
  revalidatePath("/storage");

  return {
    ok: failures.length === 0,
    message: failures.length
      ? `${uploadedFileIds.length} uploaded. ${failures[0]}`
      : `${uploadedFileIds.length} document${uploadedFileIds.length === 1 ? "" : "s"} uploaded.`,
    savedAt: uploadedAt.toISOString(),
  };
}
