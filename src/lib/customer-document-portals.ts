import crypto from "node:crypto";

export const customerDocumentPortalDefaultExpiryDays = 30;
export const customerDocumentPortalMaxExpiryDays = 90;

export function generateCustomerDocumentPortalToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function customerDocumentPortalTokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function customerDocumentPortalUrl({
  baseUrl,
  token,
}: {
  baseUrl: string;
  token: string;
}) {
  return new URL(`/portal/${encodeURIComponent(token)}`, baseUrl).toString();
}

export function customerDocumentPortalExpiryDate({
  days,
  now = new Date(),
}: {
  days: number;
  now?: Date;
}) {
  const safeDays = Math.min(
    Math.max(
      Math.trunc(
        Number.isFinite(days) ? days : customerDocumentPortalDefaultExpiryDays,
      ),
      1,
    ),
    customerDocumentPortalMaxExpiryDays,
  );

  return new Date(now.getTime() + safeDays * 24 * 60 * 60 * 1000);
}

export function customerDocumentPortalState({
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

export function customerDocumentPortalStateLabel(state: string) {
  if (state === "revoked") return "Revoked";
  if (state === "expired") return "Expired";

  return "Open";
}
