"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import {
  parseDocumentLibrarySettings,
  isDocumentUploadType,
  type DocumentUploadType,
} from "@/lib/document-library";
import { prisma } from "@/lib/prisma";
import { canAccessRecordDocumentEntity } from "@/lib/record-document-records";
import { getCrmSettings } from "@/lib/settings";
import {
  recordDocumentPath,
  uploadRecordDocumentFile,
} from "@/lib/record-document-upload";
import {
  normaliseFileAssetNotes,
  parseFileAssetTags,
} from "@/lib/storage/file-metadata";
import {
  documentExpiryReminderAt,
  documentExpiryReminderDayOptions,
  parseDocumentExpiryDate,
  parseDocumentIssueDate,
} from "@/lib/documents/expiry";
import { documentRenewalTaskData } from "@/lib/documents/renewal-task";
import { revalidateHeaderNotifications } from "@/lib/notifications";

export type RecordDocumentActionState = {
  ok: boolean;
  message: string;
};

function optionalFormString(schema: z.ZodString) {
  return z.preprocess(
    (value) => (value === null ? undefined : value),
    schema.optional(),
  );
}

const documentExpiryDateSchema = z
  .string()
  .trim()
  .refine(
    (value) => parseDocumentExpiryDate(value) !== undefined,
    "Enter a valid document expiry date.",
  )
  .transform((value) => parseDocumentExpiryDate(value) ?? null);

const documentIssueDateSchema = z
  .string()
  .trim()
  .refine(
    (value) => parseDocumentIssueDate(value) !== undefined,
    "Enter a valid document issue date.",
  )
  .transform((value) => parseDocumentIssueDate(value) ?? null);

const documentExpiryReminderDaysSchema = z.preprocess(
  (value) => (value === null || value === "" ? null : value),
  z
    .coerce.number()
    .int()
    .refine(
      (value) =>
        documentExpiryReminderDayOptions.includes(
          value as (typeof documentExpiryReminderDayOptions)[number],
        ),
      "Choose a supported reminder window.",
    )
    .nullable(),
);

const uploadRecordDocumentSchema = z.object({
  createRenewalTask: z.boolean(),
  documentIssuedAt: documentIssueDateSchema,
  documentExpiresAt: documentExpiryDateSchema,
  documentExpiryReminderDays: documentExpiryReminderDaysSchema,
  entityId: z.string().trim().min(1),
  entityType: z.enum(["Contact", "Company", "SalesOpportunity"]),
  folderSlug: optionalFormString(z.string().trim().max(80)).transform(
    (value) => value || null,
  ),
  documentType: z
    .unknown()
    .optional()
    .transform((value) =>
      isDocumentUploadType(value) ? (value as DocumentUploadType) : null,
    ),
});

const updateRecordDocumentMetadataSchema = z.object({
  createRenewalTask: z.boolean(),
  documentIssuedAt: documentIssueDateSchema,
  documentExpiresAt: documentExpiryDateSchema,
  documentExpiryReminderDays: documentExpiryReminderDaysSchema,
  fileId: z.string().trim().min(1),
  entityId: z.string().trim().min(1),
  entityType: z.enum(["Contact", "Company", "SalesOpportunity"]),
  documentType: z
    .preprocess(
      (value) => (value === null ? "" : value),
      z.string().refine(
        (value) => value === "" || isDocumentUploadType(value),
        "Choose a supported document type.",
      ),
    )
    .transform((value) =>
      value ? (value as DocumentUploadType) : null,
    ),
  notes: optionalFormString(
    z.string().max(2000, "Notes must be 2000 characters or fewer."),
  ).transform((value) => normaliseFileAssetNotes(value)),
  tagsText: optionalFormString(
    z.string().max(1200, "Tags must be shorter."),
  ).transform((value) => parseFileAssetTags(value)),
});

const bulkRecordDocumentSchema = z.object({
  action: z.enum(["move", "add-tags", "replace-tags"]),
  documentFolder: optionalFormString(
    z
      .string()
      .trim()
      .max(80, "Document folder must be 80 characters or fewer."),
  ).transform((value) => {
    if (!value || value === "__unfiled") return null;
    return value;
  }),
  entityId: z.string().trim().min(1),
  entityType: z.enum(["Contact", "Company", "SalesOpportunity"]),
  tagsText: optionalFormString(
    z.string().max(1200, "Tags must be shorter."),
  ).transform((value) => parseFileAssetTags(value)),
});

const maxBulkRecordDocuments = 100;

function uploadFilesFromFormData(formData: FormData) {
  const files = formData
    .getAll("files")
    .filter((file): file is File => file instanceof File && file.size > 0);

  if (files.length) return files;

  const legacyFile = formData.get("file");
  return legacyFile instanceof File && legacyFile.size > 0 ? [legacyFile] : [];
}

function selectedDocumentIds(formData: FormData) {
  const ids: string[] = [];
  const seen = new Set<string>();

  formData.getAll("fileIds").forEach((value) => {
    if (typeof value !== "string") return;
    const id = value.trim();

    if (!id || seen.has(id)) return;

    seen.add(id);
    ids.push(id);
  });

  return ids;
}

export async function uploadRecordDocumentAction(
  _: RecordDocumentActionState,
  formData: FormData,
): Promise<RecordDocumentActionState> {
  const user = await requireUser();
  const files = uploadFilesFromFormData(formData);
  const parsed = uploadRecordDocumentSchema.safeParse({
    createRenewalTask: formData.get("createRenewalTask") === "on",
    documentIssuedAt: formData.get("documentIssuedAt") ?? "",
    documentExpiresAt: formData.get("documentExpiresAt") ?? "",
    documentExpiryReminderDays: formData.get("documentExpiryReminderDays"),
    documentType: formData.get("documentType"),
    entityId: formData.get("entityId"),
    entityType: formData.get("entityType"),
    folderSlug: formData.get("folderSlug"),
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

  if (!parsed.data.folderSlug && !parsed.data.documentType) {
    return { ok: false, message: "Choose a document type." };
  }

  if (
    parsed.data.documentIssuedAt &&
    parsed.data.documentExpiresAt &&
    parsed.data.documentIssuedAt > parsed.data.documentExpiresAt
  ) {
    return { ok: false, message: "The issue date must be on or before the expiry date." };
  }

  if (parsed.data.createRenewalTask && !parsed.data.documentExpiresAt) {
    return { ok: false, message: "Add an expiry date before creating a renewal task." };
  }

  const record = await canAccessRecordDocumentEntity({
    entityId: parsed.data.entityId,
    entityType: parsed.data.entityType,
    user,
  });

  if (!record) {
    return { ok: false, message: "Record not found." };
  }

  const notes = normaliseFileAssetNotes(formData.get("notes"));
  const tags = parseFileAssetTags(formData.get("tagsText"));
  const reminderDays = parsed.data.documentExpiresAt
    ? parsed.data.documentExpiryReminderDays
    : null;
  const reminderAt = documentExpiryReminderAt(
    parsed.data.documentExpiresAt,
    reminderDays,
  );
  let uploadedCount = 0;
  const folders = new Set<string>();
  const failures: string[] = [];

  for (const file of files) {
    try {
      const upload = await uploadRecordDocumentFile({
        documentExpiresAt: parsed.data.documentExpiresAt,
        documentIssuedAt: parsed.data.documentIssuedAt,
        documentExpiryReminderAt: reminderAt,
        documentExpiryReminderDays: reminderDays,
        entityId: parsed.data.entityId,
        entityType: parsed.data.entityType,
        file,
        folderSlug: parsed.data.folderSlug,
        notes,
        tags,
        uploadedById: user.id,
        uploadType: parsed.data.documentType,
      });

      if (parsed.data.createRenewalTask && parsed.data.documentExpiresAt) {
        const task = await prisma.task.create({
          data: documentRenewalTaskData({
            creatorId: user.id,
            dueDate: reminderAt ?? parsed.data.documentExpiresAt,
            entityId: parsed.data.entityId,
            entityType: parsed.data.entityType,
            fileAssetId: upload.fileAsset.id,
            fileName: upload.fileAsset.originalName,
          }),
          select: { id: true },
        });
        await prisma.fileAsset.update({
          where: { id: upload.fileAsset.id },
          data: { documentRenewalTaskId: task.id },
        });
      }

      uploadedCount += 1;
      folders.add(upload.folderName);
    } catch (error) {
      failures.push(
        `${file.name}: ${
          error instanceof Error ? error.message : "Document upload failed."
        }`,
      );
    }
  }

  if (uploadedCount) {
    revalidateHeaderNotifications();
    revalidatePath(
      recordDocumentPath(parsed.data.entityType, parsed.data.entityId),
    );
    revalidatePath("/storage");
    if (parsed.data.createRenewalTask) revalidatePath("/tasks");
  }

  if (failures.length) {
    return {
      ok: false,
      message: uploadedCount
        ? `${uploadedCount} uploaded. ${failures[0]}`
        : (failures[0] ?? "Document upload failed."),
    };
  }

  const folderLabel = folders.size === 1 ? ` to ${Array.from(folders)[0]}` : "";
  return {
    ok: true,
    message: `${uploadedCount} document${uploadedCount === 1 ? "" : "s"} uploaded${folderLabel}.`,
  };
}

export async function updateRecordDocumentMetadataAction(
  _: RecordDocumentActionState,
  formData: FormData,
): Promise<RecordDocumentActionState> {
  const user = await requireUser();
  const parsed = updateRecordDocumentMetadataSchema.safeParse({
    createRenewalTask: formData.get("createRenewalTask") === "on",
    documentIssuedAt: formData.get("documentIssuedAt") ?? "",
    documentExpiresAt: formData.get("documentExpiresAt") ?? "",
    documentExpiryReminderDays: formData.get("documentExpiryReminderDays"),
    documentType: formData.get("documentType"),
    entityId: formData.get("entityId"),
    entityType: formData.get("entityType"),
    fileId: formData.get("fileId"),
    notes: formData.get("notes"),
    tagsText: formData.get("tagsText"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the document details.",
    };
  }

  if (
    parsed.data.documentIssuedAt &&
    parsed.data.documentExpiresAt &&
    parsed.data.documentIssuedAt > parsed.data.documentExpiresAt
  ) {
    return { ok: false, message: "The issue date must be on or before the expiry date." };
  }

  if (parsed.data.createRenewalTask && !parsed.data.documentExpiresAt) {
    return { ok: false, message: "Add an expiry date before creating a renewal task." };
  }

  const record = await canAccessRecordDocumentEntity({
    entityId: parsed.data.entityId,
    entityType: parsed.data.entityType,
    user,
  });

  if (!record) {
    return { ok: false, message: "Record not found." };
  }

  const file = await prisma.fileAsset.findFirst({
    where: {
      entityId: parsed.data.entityId,
      entityType: parsed.data.entityType,
      id: parsed.data.fileId,
    },
    select: {
      documentExpiresAt: true,
      documentIssuedAt: true,
      documentExpiryReminderDays: true,
      documentRenewalTaskId: true,
      documentRenewalTask: { select: { status: true } },
      documentUploadType: true,
      id: true,
      originalName: true,
    },
  });

  if (!file) {
    return { ok: false, message: "Document not found." };
  }

  try {
    const reminderDays = parsed.data.documentExpiresAt
      ? parsed.data.documentExpiryReminderDays
      : null;
    const reminderAt = documentExpiryReminderAt(
      parsed.data.documentExpiresAt,
      reminderDays,
    );

    await prisma.$transaction(async (tx) => {
      let renewalTaskId = file.documentRenewalTaskId;
      if (parsed.data.createRenewalTask && parsed.data.documentExpiresAt) {
        const taskData = documentRenewalTaskData({
          creatorId: user.id,
          dueDate: reminderAt ?? parsed.data.documentExpiresAt,
          entityId: parsed.data.entityId,
          entityType: parsed.data.entityType,
          fileAssetId: file.id,
          fileName: file.originalName,
        });
        if (renewalTaskId && file.documentRenewalTask?.status !== "DONE") {
          await tx.task.update({ where: { id: renewalTaskId }, data: taskData });
        } else {
          const task = await tx.task.create({ data: taskData, select: { id: true } });
          renewalTaskId = task.id;
        }
      } else if (renewalTaskId && file.documentRenewalTask?.status !== "DONE") {
        await tx.task.update({ where: { id: renewalTaskId }, data: { status: "DONE" } });
        renewalTaskId = null;
      } else if (!parsed.data.createRenewalTask) {
        renewalTaskId = null;
      }

      await tx.fileAsset.update({
        where: { id: file.id },
        data: {
          documentIssuedAt: parsed.data.documentIssuedAt,
          documentExpiresAt: parsed.data.documentExpiresAt,
          documentExpiryReminderAt: reminderAt,
          documentExpiryReminderDays: reminderDays,
          documentUploadType: parsed.data.documentType,
          documentRenewalTaskId: renewalTaskId,
          notes: parsed.data.notes,
          tags: parsed.data.tagsText,
        },
      });
      await tx.auditLog.create({
        data: {
          action: "record_document.metadata_updated",
          actorId: user.id,
          entity: "FileAsset",
          entityId: file.id,
          metadata: {
            documentTypeAfter: parsed.data.documentType,
            documentTypeBefore: file.documentUploadType,
            issuedAtAfter: parsed.data.documentIssuedAt?.toISOString() ?? null,
            issuedAtBefore: file.documentIssuedAt?.toISOString() ?? null,
            expiresAtAfter: parsed.data.documentExpiresAt?.toISOString() ?? null,
            expiresAtBefore: file.documentExpiresAt?.toISOString() ?? null,
            reminderDaysAfter: reminderDays,
            reminderDaysBefore: file.documentExpiryReminderDays,
            renewalTaskAfter: renewalTaskId,
            renewalTaskBefore: file.documentRenewalTaskId,
            parentEntityId: parsed.data.entityId,
            parentEntityType: parsed.data.entityType,
          },
        },
      });
    });

    revalidatePath(
      recordDocumentPath(parsed.data.entityType, parsed.data.entityId),
    );
    revalidatePath("/storage");
    revalidatePath("/tasks");
    revalidateHeaderNotifications();
    return {
      ok: true,
      message: "Document details saved.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Document update failed.",
    };
  }
}

export async function bulkUpdateRecordDocumentsAction(
  _: RecordDocumentActionState,
  formData: FormData,
): Promise<RecordDocumentActionState> {
  const user = await requireUser();
  const fileIds = selectedDocumentIds(formData);
  const parsed = bulkRecordDocumentSchema.safeParse({
    action: formData.get("action"),
    documentFolder: formData.get("documentFolder"),
    entityId: formData.get("entityId"),
    entityType: formData.get("entityType"),
    tagsText: formData.get("tagsText"),
  });

  if (!fileIds.length) {
    return { ok: false, message: "Select at least one document." };
  }

  if (fileIds.length > maxBulkRecordDocuments) {
    return {
      ok: false,
      message: `Select ${maxBulkRecordDocuments} documents or fewer at once.`,
    };
  }

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the bulk action.",
    };
  }

  const record = await canAccessRecordDocumentEntity({
    entityId: parsed.data.entityId,
    entityType: parsed.data.entityType,
    user,
  });

  if (!record) {
    return { ok: false, message: "Record not found." };
  }

  if (parsed.data.action === "move" && parsed.data.documentFolder) {
    const settings = await getCrmSettings();
    const documentLibrary = parseDocumentLibrarySettings(
      settings.documentLibrary,
    );
    const isConfiguredFolder = documentLibrary.folders.some(
      (folder) => folder.slug === parsed.data.documentFolder,
    );

    if (!isConfiguredFolder) {
      return { ok: false, message: "Choose a configured document folder." };
    }
  }

  const files = await prisma.fileAsset.findMany({
    where: {
      entityId: parsed.data.entityId,
      entityType: parsed.data.entityType,
      id: { in: fileIds },
    },
    select: {
      id: true,
      tags: true,
    },
  });

  if (files.length !== fileIds.length) {
    return {
      ok: false,
      message: "Some selected documents were not found on this record.",
    };
  }

  const recordPath = recordDocumentPath(
    parsed.data.entityType,
    parsed.data.entityId,
  );

  try {
    if (parsed.data.action === "move") {
      await prisma.fileAsset.updateMany({
        where: { id: { in: fileIds } },
        data: { documentFolder: parsed.data.documentFolder },
      });
      revalidatePath(recordPath);
      revalidatePath("/storage");

      return {
        ok: true,
        message: `${files.length} document${files.length === 1 ? "" : "s"} moved.`,
      };
    }

    if (parsed.data.action === "replace-tags") {
      await prisma.fileAsset.updateMany({
        where: { id: { in: fileIds } },
        data: { tags: parsed.data.tagsText },
      });
      revalidatePath(recordPath);
      revalidatePath("/storage");

      return {
        ok: true,
        message: `${files.length} document${files.length === 1 ? "" : "s"} updated.`,
      };
    }

    if (!parsed.data.tagsText.length) {
      return { ok: false, message: "Enter at least one tag to add." };
    }

    await Promise.all(
      files.map((file) => {
        const tags = parseFileAssetTags(
          [...file.tags, ...parsed.data.tagsText].join("\n"),
        );

        return prisma.fileAsset.update({
          where: { id: file.id },
          data: { tags },
        });
      }),
    );
    revalidatePath(recordPath);
    revalidatePath("/storage");

    return {
      ok: true,
      message: `${files.length} document${files.length === 1 ? "" : "s"} tagged.`,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Bulk document update failed.",
    };
  }
}
