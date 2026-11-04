import crypto from "node:crypto";

export const gmailSharedImageEntityType = "gmail_attachment_image";
export const gmailSharedImageTag = "content-deduplicated";

export function attachmentChecksum(body: Buffer) {
  return crypto.createHash("sha256").update(body).digest("hex");
}

export function isImageAttachment(mimeType: string | null | undefined) {
  return mimeType?.trim().toLowerCase().startsWith("image/") ?? false;
}

export function gmailSharedImageKey({
  checksum,
  uploadPrefix,
}: {
  checksum: string;
  uploadPrefix?: string | null;
}) {
  const prefix = uploadPrefix?.replace(/^\/+|\/+$/g, "") || "crm-assets";

  return `${prefix}/gmail/shared-images/${checksum}`;
}
