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

const uploadRecordDocumentSchema = z.object({
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
  fileId: z.string().trim().min(1),
  entityId: z.string().trim().min(1),
  entityType: z.enum(["Contact", "Company", "SalesOpportunity"]),
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
  let uploadedCount = 0;
  const folders = new Set<string>();
  const failures: string[] = [];

  for (const file of files) {
    try {
      const upload = await uploadRecordDocumentFile({
        entityId: parsed.data.entityId,
        entityType: parsed.data.entityType,
        file,
        folderSlug: parsed.data.folderSlug,
        notes,
        tags,
        uploadedById: user.id,
        uploadType: parsed.data.documentType,
      });

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
    revalidatePath(
      recordDocumentPath(parsed.data.entityType, parsed.data.entityId),
    );
    revalidatePath("/storage");
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
    select: { id: true },
  });

  if (!file) {
    return { ok: false, message: "Document not found." };
  }

  try {
    await prisma.fileAsset.update({
      where: { id: file.id },
      data: {
        notes: parsed.data.notes,
        tags: parsed.data.tagsText,
      },
    });

    revalidatePath(
      recordDocumentPath(parsed.data.entityType, parsed.data.entityId),
    );
    revalidatePath("/storage");
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
