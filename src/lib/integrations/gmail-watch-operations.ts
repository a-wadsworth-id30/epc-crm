import { BackgroundJobRunStatus } from "@prisma/client";

export const gmailWatchJobName = "gmail-watch-renewal";
export const gmailWatchJobType = "integration-maintenance";

export type GmailWatchOperationSummary = {
  deferred: number;
  failed: number;
  processed: number;
  renewed: number;
};

export function gmailWatchOperationStatus(
  summary: GmailWatchOperationSummary,
) {
  if (summary.processed > 0 && summary.failed === summary.processed) {
    return BackgroundJobRunStatus.ERROR;
  }
  if (summary.failed > 0 || summary.deferred > 0) {
    return BackgroundJobRunStatus.WARNING;
  }
  return BackgroundJobRunStatus.SUCCESS;
}

export function parseGmailWatchOperationSummary(
  value: unknown,
): GmailWatchOperationSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const summary = value as Record<string, unknown>;
  const keys = ["deferred", "failed", "processed", "renewed"] as const;

  if (
    keys.some(
      (key) =>
        !Number.isInteger(summary[key]) || Number(summary[key]) < 0,
    )
  ) {
    return null;
  }

  return Object.fromEntries(
    keys.map((key) => [key, Number(summary[key])]),
  ) as GmailWatchOperationSummary;
}
