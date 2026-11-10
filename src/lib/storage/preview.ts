const safeRasterPreviewMimeTypes = new Set([
  "image/avif",
  "image/gif",
  "image/heic",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const safeTextPreviewMimeTypes = new Set([
  "text/calendar",
  "text/csv",
  "text/markdown",
  "text/plain",
]);

export function safeFilePreviewContentType({
  mimeType,
  name,
}: {
  mimeType: string;
  name: string;
}) {
  const normalizedMimeType = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
  const normalizedName = name.toLowerCase();
  const hasGenericMimeType =
    !normalizedMimeType || normalizedMimeType === "application/octet-stream";

  if (
    normalizedMimeType === "image/svg+xml" ||
    normalizedMimeType === "text/html" ||
    normalizedMimeType.includes("xml")
  ) {
    return null;
  }

  if (
    normalizedMimeType === "application/pdf" ||
    (hasGenericMimeType && normalizedName.endsWith(".pdf"))
  ) {
    return "application/pdf";
  }

  if (safeRasterPreviewMimeTypes.has(normalizedMimeType)) {
    return normalizedMimeType;
  }

  if (safeTextPreviewMimeTypes.has(normalizedMimeType)) {
    return "text/plain; charset=utf-8";
  }

  if (
    normalizedMimeType === "application/json" ||
    (hasGenericMimeType && normalizedName.endsWith(".json"))
  ) {
    return "application/json; charset=utf-8";
  }

  if (hasGenericMimeType && /\.(csv|ics|log|md|txt)$/.test(normalizedName)) {
    return "text/plain; charset=utf-8";
  }

  return null;
}
