const baseRetryDelayMs = 5 * 60 * 1_000;
const maximumRetryDelayMs = 60 * 60 * 1_000;

function metadataObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function positiveInteger(value: unknown) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : 0;
}

export function gmailSyncRetryDelayMs(failureCount: number) {
  const exponent = Math.max(0, Math.min(10, Math.trunc(failureCount) - 1));
  return Math.min(baseRetryDelayMs * 2 ** exponent, maximumRetryDelayMs);
}

export function gmailSyncRetryState(metadata: unknown, now = new Date()) {
  const value = metadataObject(metadata);
  const failureCount = positiveInteger(value.gmailSyncFailureCount);
  const retryAfterValue =
    typeof value.gmailSyncRetryAfter === "string"
      ? new Date(value.gmailSyncRetryAfter)
      : null;
  const retryAfter =
    retryAfterValue && Number.isFinite(retryAfterValue.getTime())
      ? retryAfterValue
      : null;

  return {
    coolingDown: Boolean(retryAfter && retryAfter.getTime() > now.getTime()),
    failureCount,
    retryAfter,
  };
}

export function gmailSyncFailureMetadata(
  metadata: unknown,
  now = new Date(),
) {
  const value = metadataObject(metadata);
  const failureCount = gmailSyncRetryState(value, now).failureCount + 1;
  const retryAfter = new Date(
    now.getTime() + gmailSyncRetryDelayMs(failureCount),
  );

  return {
    ...value,
    gmailSyncFailureCount: failureCount,
    gmailSyncRetryAfter: retryAfter.toISOString(),
  };
}

export function clearGmailSyncRetryMetadata(metadata: unknown) {
  const remaining = { ...metadataObject(metadata) };
  delete remaining.gmailSyncFailureCount;
  delete remaining.gmailSyncRetryAfter;

  return remaining;
}
