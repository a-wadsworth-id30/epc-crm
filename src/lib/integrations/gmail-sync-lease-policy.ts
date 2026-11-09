export const gmailSyncLeaseDurationMs = 5 * 60 * 1_000;

export function gmailSyncLeaseExpiresAt(now = new Date()) {
  return new Date(now.getTime() + gmailSyncLeaseDurationMs);
}

export function gmailSyncLeaseIsActive(
  syncLeaseUntil: Date | null | undefined,
  now = new Date(),
) {
  return Boolean(syncLeaseUntil && syncLeaseUntil.getTime() > now.getTime());
}
