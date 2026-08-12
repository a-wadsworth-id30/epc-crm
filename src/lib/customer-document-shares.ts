import crypto from "node:crypto";

export const customerDocumentShareDefaultExpiryDays = 14;
export const customerDocumentShareMaxExpiryDays = 60;

export function generateCustomerDocumentShareToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function customerDocumentShareTokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function customerDocumentShareUrl({
  baseUrl,
  token,
}: {
  baseUrl: string;
  token: string;
}) {
  return new URL(`/share/${encodeURIComponent(token)}`, baseUrl).toString();
}

export function customerDocumentShareExpiryDate({
  days,
  now = new Date(),
}: {
  days: number;
  now?: Date;
}) {
  const safeDays = Math.min(
    Math.max(
      Math.trunc(
        Number.isFinite(days) ? days : customerDocumentShareDefaultExpiryDays,
      ),
      1,
    ),
    customerDocumentShareMaxExpiryDays,
  );

  return new Date(now.getTime() + safeDays * 24 * 60 * 60 * 1000);
}

export function customerDocumentShareState({
  expiresAt,
  now = new Date(),
  revokedAt,
  status,
}: {
  expiresAt: Date;
  now?: Date;
  revokedAt?: Date | null;
  status: string;
}) {
  if (status === "REVOKED" || revokedAt) return "revoked";
  if (expiresAt.getTime() <= now.getTime()) return "expired";

  return "open";
}

export function customerDocumentShareStateLabel(state: string) {
  if (state === "revoked") return "Revoked";
  if (state === "expired") return "Expired";

  return "Open";
}
