import { gmailSyncRetryState } from "@/lib/integrations/gmail-sync-retry-policy";

type GmailSyncMailboxCandidate = {
  id: string;
  lastHistoryId: string | null;
  lastSyncAt: Date | null;
  metadata: unknown;
};

function metadataObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function gmailMailboxHasContinuation(
  mailbox: Pick<GmailSyncMailboxCandidate, "lastHistoryId" | "metadata">,
) {
  const metadata = metadataObject(mailbox.metadata);
  const token = mailbox.lastHistoryId
    ? metadata.historySyncPageToken
    : metadata.initialSyncPageToken;

  return typeof token === "string" && token.trim().length > 0;
}

export function prioritizeGmailSyncMailboxes<
  T extends GmailSyncMailboxCandidate,
>(mailboxes: T[]) {
  return [...mailboxes].sort((left, right) => {
    const continuationDifference =
      Number(gmailMailboxHasContinuation(right)) -
      Number(gmailMailboxHasContinuation(left));
    if (continuationDifference) return continuationDifference;

    const leftTime = left.lastSyncAt?.getTime() ?? 0;
    const rightTime = right.lastSyncAt?.getTime() ?? 0;
    if (leftTime !== rightTime) return leftTime - rightTime;

    return left.id.localeCompare(right.id);
  });
}

export function scheduledGmailSyncCandidates<
  T extends GmailSyncMailboxCandidate,
>(mailboxes: T[], now = new Date()) {
  const prioritized = prioritizeGmailSyncMailboxes(mailboxes);
  const eligible = prioritized.filter(
    (mailbox) => !gmailSyncRetryState(mailbox.metadata, now).coolingDown,
  );

  return {
    coolingDown: prioritized.length - eligible.length,
    eligible,
  };
}
