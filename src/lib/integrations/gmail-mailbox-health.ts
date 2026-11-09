export const GMAIL_SYNC_STALE_AFTER_MS = 30 * 60 * 1000;

export type GmailMailboxHealthState =
  | "healthy"
  | "attention"
  | "paused"
  | "pending"
  | "delayed"
  | "warning";

export type GmailMailboxHealth = {
  canReconnect: boolean;
  detail: string;
  label: string;
  state: GmailMailboxHealthState;
};

type GmailMailboxHealthInput = {
  lastError: string | null;
  lastSyncAt: string | Date | null;
  status: "CONNECTED" | "NEEDS_REAUTH" | "DISCONNECTED" | "ERROR";
  syncEnabled: boolean;
};

function timestamp(value: string | Date | null) {
  if (!value) return null;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function gmailMailboxHealth(
  mailbox: GmailMailboxHealthInput,
  now = new Date(),
): GmailMailboxHealth {
  if (mailbox.status === "NEEDS_REAUTH") {
    return {
      canReconnect: true,
      detail:
        mailbox.lastError ||
        "Google authorisation has expired or was revoked. Reconnect this mailbox to resume sync and sending.",
      label: "Reconnect required",
      state: "attention",
    };
  }

  if (mailbox.status === "ERROR") {
    return {
      canReconnect: true,
      detail:
        mailbox.lastError ||
        "The Gmail connection reported an error. Reconnect the mailbox, then run a manual sync.",
      label: "Connection error",
      state: "attention",
    };
  }

  if (mailbox.status === "DISCONNECTED") {
    return {
      canReconnect: true,
      detail:
        "This mailbox is disconnected. Existing CRM email history is retained, but new messages are not synced and sending is unavailable.",
      label: "Disconnected",
      state: "attention",
    };
  }

  if (!mailbox.syncEnabled) {
    return {
      canReconnect: false,
      detail:
        "The Google connection is available, but automatic email import is switched off for this mailbox.",
      label: "Sync paused",
      state: "paused",
    };
  }

  if (mailbox.lastError) {
    return {
      canReconnect: false,
      detail: mailbox.lastError,
      label: "Sync warning",
      state: "warning",
    };
  }

  const lastSyncAt = timestamp(mailbox.lastSyncAt);
  if (lastSyncAt === null) {
    return {
      canReconnect: false,
      detail:
        "The mailbox is connected and waiting for its first successful Gmail sync.",
      label: "Awaiting first sync",
      state: "pending",
    };
  }

  if (now.getTime() - lastSyncAt > GMAIL_SYNC_STALE_AFTER_MS) {
    return {
      canReconnect: false,
      detail:
        "The last successful sync is older than 30 minutes. Run a manual sync and check scheduled sync operations if the delay continues.",
      label: "Sync delayed",
      state: "delayed",
    };
  }

  return {
    canReconnect: false,
    detail:
      "The Gmail connection is active and has synced successfully within the last 30 minutes.",
    label: "Healthy",
    state: "healthy",
  };
}
