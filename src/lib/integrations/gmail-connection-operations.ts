export const gmailConnectionReconciliationJobName =
  "gmail-connection-reconciliation";
export const gmailConnectionReconciliationJobType = "integration-health";

export type GmailConnectionReconciliationSummary = {
  changed: number;
  checked: number;
  connected: number;
  deferred: number;
  disconnected: number;
  failed: number;
  reconnectRequired: number;
};

export function gmailConnectionReconciliationStatus(
  summary: GmailConnectionReconciliationSummary,
) {
  if (summary.failed && summary.failed === summary.checked) return "ERROR" as const;
  if (summary.failed || summary.deferred || summary.reconnectRequired) {
    return "WARNING" as const;
  }
  return "SUCCESS" as const;
}
