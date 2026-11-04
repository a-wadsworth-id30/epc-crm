import type { Prisma } from "@prisma/client";

export const emailAttachmentDisplaySelect = {
  archiveStatus: true,
  fileAsset: {
    select: {
      id: true,
      mimeType: true,
      originalName: true,
      sizeBytes: true,
    },
  },
  fileName: true,
  id: true,
  mimeType: true,
  sizeBytes: true,
} satisfies Prisma.EmailAttachmentSelect;

type EmailAttachmentDisplayRow = Prisma.EmailAttachmentGetPayload<{
  select: typeof emailAttachmentDisplaySelect;
}>;

export type EmailAttachmentDisplay = {
  archiveStatus: string;
  canPreview: boolean;
  downloadUrl: string | null;
  id: string;
  isImage: boolean;
  mimeType: string | null;
  name: string;
  previewUrl: string | null;
  sizeBytes: number | null;
};

function normalizedMimeType(value: string | null) {
  return value?.toLowerCase().split(";")[0]?.trim() ?? "";
}

function isSafeInlineImage(mimeType: string) {
  return [
    "image/avif",
    "image/gif",
    "image/jpeg",
    "image/png",
    "image/webp",
  ].includes(mimeType);
}

function canPreviewFile(mimeType: string, name: string) {
  if (isSafeInlineImage(mimeType)) return true;
  if (mimeType === "application/pdf" || mimeType === "application/json") {
    return true;
  }
  if (mimeType.startsWith("text/")) return true;

  return /\.(csv|json|log|md|pdf|txt)$/i.test(name);
}

export function serializeEmailAttachments(
  attachments: EmailAttachmentDisplayRow[] | null | undefined,
): EmailAttachmentDisplay[] {
  return (attachments ?? []).map((attachment) => {
    const fileAsset = attachment.fileAsset;
    const name = fileAsset?.originalName || attachment.fileName;
    const mimeType = normalizedMimeType(
      fileAsset?.mimeType || attachment.mimeType,
    );
    const stored = attachment.archiveStatus === "STORED" && Boolean(fileAsset);
    const previewable = stored && canPreviewFile(mimeType, name);

    return {
      archiveStatus: attachment.archiveStatus,
      canPreview: previewable,
      downloadUrl: fileAsset && stored
        ? `/api/media/${encodeURIComponent(fileAsset.id)}?download=1`
        : null,
      id: attachment.id,
      isImage: stored && isSafeInlineImage(mimeType),
      mimeType: mimeType || null,
      name,
      previewUrl:
        fileAsset && previewable
          ? `/api/media/${encodeURIComponent(fileAsset.id)}/preview`
          : null,
      sizeBytes: fileAsset?.sizeBytes ?? attachment.sizeBytes,
    };
  });
}
