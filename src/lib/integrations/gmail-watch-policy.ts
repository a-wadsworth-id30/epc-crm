export const gmailWatchRenewBeforeMs = 48 * 60 * 60 * 1_000;
const gmailWatchRetryBaseMs = 60 * 60 * 1_000;
const gmailWatchRetryMaximumMs = 6 * 60 * 60 * 1_000;

type GmailWatchStateInput = {
  expiresAt: Date | string | null;
  retryAt: Date | string | null;
};

function timestamp(value: Date | string | null) {
  if (!value) return null;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function gmailWatchRetryDelayMs(failureCount: number) {
  const exponent = Math.max(0, Math.trunc(failureCount) - 1);
  return Math.min(
    gmailWatchRetryBaseMs * 2 ** exponent,
    gmailWatchRetryMaximumMs,
  );
}

export function gmailWatchRenewalState(
  input: GmailWatchStateInput,
  now = new Date(),
) {
  const nowMs = now.getTime();
  const expiresAt = timestamp(input.expiresAt);
  const retryAt = timestamp(input.retryAt);

  return {
    coolingDown: retryAt !== null && retryAt > nowMs,
    due:
      expiresAt === null ||
      expiresAt <= nowMs + gmailWatchRenewBeforeMs,
    expiresAt: expiresAt === null ? null : new Date(expiresAt),
    retryAt: retryAt === null ? null : new Date(retryAt),
  };
}
