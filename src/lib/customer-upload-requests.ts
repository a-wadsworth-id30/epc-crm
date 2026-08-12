import crypto from "node:crypto";

export const customerUploadDefaultExpiryDays = 14;
export const customerUploadMaxExpiryDays = 60;

export function generateCustomerUploadToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function customerUploadTokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function customerUploadRequestUrl({
  baseUrl,
  token,
}: {
  baseUrl: string;
  token: string;
}) {
  return new URL(`/upload/${encodeURIComponent(token)}`, baseUrl).toString();
}

export function customerUploadExpiryDate({
  days,
  now = new Date(),
}: {
  days: number;
  now?: Date;
}) {
  const safeDays = Math.min(
    Math.max(Math.trunc(Number.isFinite(days) ? days : customerUploadDefaultExpiryDays), 1),
    customerUploadMaxExpiryDays,
  );

  return new Date(now.getTime() + safeDays * 24 * 60 * 60 * 1000);
}

export function customerUploadRequestState({
  completedAt,
  expiresAt,
  now = new Date(),
  revokedAt,
  status,
}: {
  completedAt?: Date | null;
  expiresAt: Date;
  now?: Date;
  revokedAt?: Date | null;
  status: string;
}) {
  if (status === "REVOKED" || revokedAt) return "revoked";
  if (status === "COMPLETED" || completedAt) return "completed";
  if (expiresAt.getTime() <= now.getTime()) return "expired";

  return "open";
}

export function customerUploadRequestStateLabel(state: string) {
  if (state === "revoked") return "Revoked";
  if (state === "completed") return "Completed";
  if (state === "expired") return "Expired";

  return "Open";
}
