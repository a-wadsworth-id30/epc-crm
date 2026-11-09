export const gmailSyncJobName = "gmail-mailbox-sync";
export const gmailSyncJobType = "integration-sync";

export type GmailSyncOperationResult = {
  ok: boolean;
  result?: {
    created: number;
    hasMore: boolean;
    read: number;
    updated: number;
  };
};

export type GmailSyncOperationSummary = {
  backlogPending: number;
  deferred: number;
  failed: number;
  messagesRead: number;
  processed: number;
  recordsWritten: number;
  succeeded: number;
};

export function summarizeGmailSyncOperation(
  results: GmailSyncOperationResult[],
  deferred: number,
): GmailSyncOperationSummary {
  const successful = results.filter(
    (result): result is GmailSyncOperationResult & { result: NonNullable<GmailSyncOperationResult["result"]> } =>
      result.ok && Boolean(result.result),
  );

  return {
    backlogPending: successful.filter((result) => result.result.hasMore).length,
    deferred,
    failed: results.length - successful.length,
    messagesRead: successful.reduce((total, result) => total + result.result.read, 0),
    processed: results.length,
    recordsWritten: successful.reduce(
      (total, result) => total + result.result.created + result.result.updated,
      0,
    ),
    succeeded: successful.length,
  };
}

export function parseGmailSyncOperationSummary(
  value: unknown,
): GmailSyncOperationSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const summary = value as Record<string, unknown>;
  const keys = [
    "backlogPending",
    "deferred",
    "failed",
    "messagesRead",
    "processed",
    "recordsWritten",
    "succeeded",
  ] as const;

  if (keys.some((key) => !Number.isInteger(summary[key]) || Number(summary[key]) < 0)) {
    return null;
  }

  return Object.fromEntries(keys.map((key) => [key, Number(summary[key])])) as GmailSyncOperationSummary;
}
