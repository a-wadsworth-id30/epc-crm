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
  providerAttachmentId: true,
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
  contentId: string | null;
  disposition: string | null;
  isEmbedded: boolean;
  isImage: boolean;
  mimeType: string | null;
  name: string;
  previewUrl: string | null;
  sizeBytes: number | null;
};

type SourceAttachment = {
  attachmentId?: unknown;
  contentId?: unknown;
  disposition?: unknown;
  isInline?: unknown;
  providerAttachmentId?: unknown;
};

function sourceAttachments(value: unknown): SourceAttachment[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is SourceAttachment =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizedContentId(value: unknown) {
  return textValue(value)?.replace(/^<|>$/g, "") ?? null;
}

function htmlReferencesContentId(html: string | null | undefined, contentId: string) {
  const escaped = contentId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`cid:\\s*<?${escaped}>?`, "i").test(html ?? "");
}

function referencedContentIds(html: string | null | undefined) {
  return [
    ...new Set(
      [...(html ?? "").matchAll(/\bcid:\s*<?([^\s"'>]+)>?/gi)]
        .map((match) => normalizedContentId(match[1]))
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

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
  sourceValue?: unknown,
  html?: string | null,
): EmailAttachmentDisplay[] {
  const source = sourceAttachments(sourceValue);
  const sourceByProviderId = new Map(
    source.flatMap((candidate) => {
      const providerId =
        textValue(candidate.providerAttachmentId) ??
        textValue(candidate.attachmentId);
      return providerId ? [[providerId, candidate] as const] : [];
    }),
  );
  const claimedContentIds = new Set(
    source.flatMap((candidate) => {
      const contentId = normalizedContentId(candidate.contentId);
      return contentId ? [contentId] : [];
    }),
  );
  const unresolvedContentIds = referencedContentIds(html).filter(
    (contentId) => !claimedContentIds.has(contentId),
  );
  const unresolvedImageRows = (attachments ?? []).filter((attachment) => {
    const mimeType = normalizedMimeType(
      attachment.fileAsset?.mimeType || attachment.mimeType,
    );
    return (
      isSafeInlineImage(mimeType) &&
      !normalizedContentId(
        sourceByProviderId.get(attachment.providerAttachmentId ?? "")?.contentId,
      )
    );
  });
  const inferredContentIdByAttachment =
    unresolvedContentIds.length === unresolvedImageRows.length
      ? new Map(
          unresolvedImageRows.map((attachment, index) => [
            attachment.id,
            unresolvedContentIds[index],
          ]),
        )
      : new Map<string, string>();

  return (attachments ?? []).map((attachment) => {
    const fileAsset = attachment.fileAsset;
    const name = fileAsset?.originalName || attachment.fileName;
    const mimeType = normalizedMimeType(
      fileAsset?.mimeType || attachment.mimeType,
    );
    const stored = attachment.archiveStatus === "STORED" && Boolean(fileAsset);
    const previewable = stored && canPreviewFile(mimeType, name);
    const sourceAttachment = sourceByProviderId.get(
      attachment.providerAttachmentId ?? "",
    );
    const contentId =
      normalizedContentId(sourceAttachment?.contentId) ??
      inferredContentIdByAttachment.get(attachment.id) ??
      null;
    const disposition = textValue(sourceAttachment?.disposition)?.toLowerCase() ?? null;
    const isEmbedded = Boolean(
      stored &&
        isSafeInlineImage(mimeType) &&
        contentId &&
        htmlReferencesContentId(html, contentId),
    );

    return {
      archiveStatus: attachment.archiveStatus,
      canPreview: previewable,
      contentId,
      disposition,
      downloadUrl: fileAsset && stored
        ? `/api/media/${encodeURIComponent(fileAsset.id)}?download=1`
        : null,
      id: attachment.id,
      isEmbedded,
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

export function visibleEmailAttachments(attachments: EmailAttachmentDisplay[]) {
  return attachments.filter((attachment) => !attachment.isEmbedded);
}
