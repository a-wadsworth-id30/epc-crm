import "server-only";

import { FileAssetVisibility } from "@prisma/client";
import {
  documentFolderName,
  parseDocumentLibrarySettings,
  resolveDocumentFolderForUpload,
  type DocumentUploadType,
} from "@/lib/document-library";
import {
  recordDocumentPath,
  type RecordDocumentEntityType,
} from "@/lib/record-document-records";
import { getCrmSettings } from "@/lib/settings";
import { uploadMediaFile } from "@/lib/storage/media";

function recordDocumentStorageFolder({
  entityId,
  entityType,
  folderSlug,
}: {
  entityId: string;
  entityType: RecordDocumentEntityType;
  folderSlug: string;
}) {
  return `documents/${entityType}/${entityId}/${folderSlug}`;
}

export { recordDocumentPath, type RecordDocumentEntityType };

export async function resolveRecordDocumentUploadDestination({
  entityId,
  entityType,
  folderSlug,
  uploadType,
}: {
  entityId: string;
  entityType: RecordDocumentEntityType;
  folderSlug?: string | null;
  uploadType?: DocumentUploadType | null;
}) {
  if (!folderSlug && !uploadType) {
    throw new Error("Choose a document type.");
  }

  const settings = await getCrmSettings();
  const documentLibrary = parseDocumentLibrarySettings(settings.documentLibrary);
  const folder = resolveDocumentFolderForUpload({
    folders: documentLibrary.folders,
    folderSlug,
    uploadType,
  });

  if (!folder) {
    throw new Error("Choose a configured document folder.");
  }

  return {
    folder,
    folderName: documentFolderName(documentLibrary.folders, folder.slug),
    storageFolder: recordDocumentStorageFolder({
      entityId,
      entityType,
      folderSlug: folder.slug,
    }),
  };
}

export async function uploadRecordDocumentFile({
  documentExpiresAt,
  documentIssuedAt,
  documentExpiryReminderAt,
  documentExpiryReminderDays,
  entityId,
  entityType,
  file,
  folderSlug,
  notes,
  tags,
  uploadedById,
  uploadType,
}: {
  documentExpiresAt?: Date | null;
  documentIssuedAt?: Date | null;
  documentExpiryReminderAt?: Date | null;
  documentExpiryReminderDays?: number | null;
  entityId: string;
  entityType: RecordDocumentEntityType;
  file: File;
  folderSlug?: string | null;
  notes?: string | null;
  tags?: string[];
  uploadedById?: string | null;
  uploadType?: DocumentUploadType | null;
}) {
  const destination = await resolveRecordDocumentUploadDestination({
    entityId,
    entityType,
    folderSlug,
    uploadType,
  });

  const fileAsset = await uploadMediaFile({
    documentExpiresAt,
    documentIssuedAt,
    documentExpiryReminderAt,
    documentExpiryReminderDays,
    documentFolder: destination.folder.slug,
    documentUploadType: uploadType ?? null,
    entityId,
    entityType,
    file,
    folder: destination.storageFolder,
    notes,
    tags,
    uploadedById: uploadedById ?? undefined,
    visibility: FileAssetVisibility.PRIVATE,
  });

  return {
    fileAsset,
    folder: destination.folder,
    folderName: destination.folderName,
  };
}
