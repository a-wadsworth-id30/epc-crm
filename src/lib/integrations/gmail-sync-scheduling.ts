import { gmailSyncRetryState } from "@/lib/integrations/gmail-sync-retry-policy";
import { gmailSyncLeaseIsActive } from "@/lib/integrations/gmail-sync-lease-policy";

type GmailSyncMailboxCandidate = {
  id: string;
  lastHistoryId: string | null;
  lastSyncAt: Date | null;
  metadata: unknown;
  pushPending?: boolean;
  syncLeaseUntil?: Date | null;
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

    const pushDifference =
      Number(Boolean(right.pushPending)) - Number(Boolean(left.pushPending));
    if (pushDifference) return pushDifference;

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
  let coolingDown = 0;
  let leased = 0;
  const eligible = prioritized.filter((mailbox) => {
    if (gmailSyncRetryState(mailbox.metadata, now).coolingDown) {
      coolingDown += 1;
      return false;
    }
    if (gmailSyncLeaseIsActive(mailbox.syncLeaseUntil, now)) {
      leased += 1;
      return false;
    }
    return true;
  });

  return {
    coolingDown,
    eligible,
    leased,
  };
}
