"use server";

import { FileAssetVisibility } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  normaliseFileAssetNotes,
  parseFileAssetTags,
} from "@/lib/storage/file-metadata";
import { mediaAssetUrl, uploadMediaFile } from "@/lib/storage/media";
import { deleteR2Object } from "@/lib/storage/r2";
import { revalidateStorageSupportData } from "@/lib/storage/support-data";

export type StorageActionState = {
  ok: boolean;
  message: string;
};

const updateFileSchema = z.object({
  id: z.string().min(1),
  originalName: z.string().trim().min(1, "File name is required."),
  visibility: z.nativeEnum(FileAssetVisibility),
  entityType: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null),
  entityId: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null),
  documentFolder: z
    .string()
    .trim()
    .max(80, "Document folder must be 80 characters or fewer.")
    .optional()
    .transform((value) => value || null),
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
});
const uploadFileSchema = z.object({
  folder: z
    .string()
    .trim()
    .max(120, "Folder must be 120 characters or fewer.")
    .optional()
    .transform((value) => value || "manual"),
  visibility: z.nativeEnum(FileAssetVisibility),
  entityType: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null),
  entityId: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null),
  documentFolder: z
    .string()
    .trim()
    .max(80, "Document folder must be 80 characters or fewer.")
    .optional()
    .transform((value) => value || null),
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
});

function uploadFilesFromFormData(formData: FormData) {
  const files = formData
    .getAll("files")
    .filter((file): file is File => file instanceof File && file.size > 0);

  if (files.length) return files;

  const legacyFile = formData.get("file");
  return legacyFile instanceof File && legacyFile.size > 0 ? [legacyFile] : [];
}

export async function uploadFileAssetAction(
  _: StorageActionState,
  formData: FormData,
): Promise<StorageActionState> {
  const user = await requireAdmin();
  const files = uploadFilesFromFormData(formData);
  const parsed = uploadFileSchema.safeParse({
    documentFolder: formData.get("documentFolder"),
    entityId: formData.get("entityId"),
    entityType: formData.get("entityType"),
    folder: formData.get("folder"),
    notes: formData.get("notes"),
    tagsText: formData.get("tagsText"),
    visibility: formData.get("visibility"),
  });

  if (!files.length) {
    return { ok: false, message: "Choose at least one file to upload." };
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

  let uploadedCount = 0;
  const failures: string[] = [];

  for (const file of files) {
    try {
      await uploadMediaFile({
        documentFolder: parsed.data.documentFolder ?? undefined,
        entityId: parsed.data.entityId ?? undefined,
        entityType: parsed.data.entityType ?? undefined,
        file,
        folder: `storage/${parsed.data.folder}`,
        notes: parsed.data.notes,
        tags: parsed.data.tagsText,
        uploadedById: user.id,
        visibility: parsed.data.visibility,
      });
      uploadedCount += 1;
    } catch (error) {
      failures.push(
        `${file.name}: ${
          error instanceof Error ? error.message : "File upload failed."
        }`,
      );
    }
  }

  if (uploadedCount) {
    revalidatePath("/storage");
  }

  if (failures.length) {
    return {
      ok: false,
      message: uploadedCount
        ? `${uploadedCount} uploaded. ${failures[0]}`
        : failures[0] ?? "File upload failed.",
    };
  }

  return {
    ok: true,
    message: `${uploadedCount} file${uploadedCount === 1 ? "" : "s"} uploaded.`,
  };
}

export async function updateFileAssetAction(
  _: StorageActionState,
  formData: FormData,
): Promise<StorageActionState> {
  await requireAdmin();

  const parsed = updateFileSchema.safeParse({
    documentFolder: formData.get("documentFolder"),
    id: formData.get("id"),
    originalName: formData.get("originalName"),
    notes: formData.get("notes"),
    tagsText: formData.get("tagsText"),
    visibility: formData.get("visibility"),
    entityType: formData.get("entityType"),
    entityId: formData.get("entityId"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the file details.",
    };
  }

  await prisma.fileAsset.update({
    where: { id: parsed.data.id },
    data: {
      documentFolder: parsed.data.documentFolder,
      originalName: parsed.data.originalName,
      notes: parsed.data.notes,
      tags: parsed.data.tagsText,
      visibility: parsed.data.visibility,
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
    },
  });

  revalidatePath("/storage");
  revalidateStorageSupportData();
  return { ok: true, message: "File updated." };
}

export async function deleteFileAssetAction(
  formData: FormData,
): Promise<StorageActionState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");

  if (!id) {
    return { ok: false, message: "File ID is missing." };
  }

  const fileAsset = await prisma.fileAsset.findUnique({
    where: { id },
  });

  if (!fileAsset) {
    return { ok: false, message: "File not found." };
  }

  try {
    await deleteR2Object({ key: fileAsset.key });
  } catch (error) {
    console.error("R2 delete failed", error);
    return {
      ok: false,
      message: "The file could not be deleted from R2.",
    };
  }

  await prisma.$transaction([
    prisma.user.updateMany({
      where: { avatarUrl: mediaAssetUrl(fileAsset.id) },
      data: { avatarUrl: null },
    }),
    prisma.fileAsset.delete({
      where: { id: fileAsset.id },
    }),
  ]);

  revalidatePath("/storage");
  revalidatePath("/", "layout");
  revalidateStorageSupportData();
  return { ok: true, message: "File deleted." };
}
