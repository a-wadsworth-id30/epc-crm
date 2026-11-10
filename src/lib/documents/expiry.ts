export const documentExpiryReminderDayOptions = [0, 7, 14, 30, 60, 90] as const;

export type DocumentExpiryStatus = "expired" | "expiring" | "valid";

const dateInputPattern = /^\d{4}-\d{2}-\d{2}$/;

export function parseDocumentExpiryDate(value: unknown) {
  if (typeof value !== "string") return null;

  const normalized = value.trim();
  if (!normalized) return null;
  if (!dateInputPattern.test(normalized)) return undefined;

  const expiresAt = new Date(`${normalized}T23:59:59.999Z`);
  if (
    Number.isNaN(expiresAt.getTime()) ||
    expiresAt.toISOString().slice(0, 10) !== normalized
  ) {
    return undefined;
  }

  return expiresAt;
}

export function parseDocumentIssueDate(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (!dateInputPattern.test(normalized)) return undefined;
  const issuedAt = new Date(`${normalized}T00:00:00.000Z`);
  if (
    Number.isNaN(issuedAt.getTime()) ||
    issuedAt.toISOString().slice(0, 10) !== normalized
  ) {
    return undefined;
  }
  return issuedAt;
}

export function documentExpiryReminderAt(
  expiresAt: Date | null,
  reminderDays: number | null,
) {
  if (!expiresAt || reminderDays === null) return null;

  return new Date(expiresAt.getTime() - reminderDays * 24 * 60 * 60 * 1000);
}

export function documentExpiryStatus({
  expiresAt,
  now = new Date(),
  reminderAt,
}: {
  expiresAt: Date;
  now?: Date;
  reminderAt: Date | null;
}): DocumentExpiryStatus {
  if (expiresAt.getTime() < now.getTime()) return "expired";
  if (reminderAt && reminderAt.getTime() <= now.getTime()) return "expiring";
  return "valid";
}

export function documentExpiryInputValue(expiresAt: Date | null) {
  return expiresAt ? expiresAt.toISOString().slice(0, 10) : "";
}
