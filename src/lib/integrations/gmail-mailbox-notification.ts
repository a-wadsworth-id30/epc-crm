import {
  gmailMailboxHealth,
  type GmailMailboxHealthState,
} from "@/lib/integrations/gmail-mailbox-health";
import type { NotificationSeverity } from "@/lib/notification-defaults";

export type GmailMailboxNotificationInput = {
  lastError: string | null;
  lastSyncAt: Date | string | null;
  status: "CONNECTED" | "NEEDS_REAUTH" | "DISCONNECTED" | "ERROR";
  syncEnabled: boolean;
};

export type GmailMailboxHealthNotification = {
  detail: string;
  severity: NotificationSeverity;
  title: string;
};

const actionableStates = new Set<GmailMailboxHealthState>([
  "attention",
  "delayed",
  "warning",
]);

export function gmailMailboxHealthNotification(
  mailboxes: GmailMailboxNotificationInput[],
  now = new Date(),
): GmailMailboxHealthNotification | null {
  const states = mailboxes
    .map((mailbox) => gmailMailboxHealth(mailbox, now).state)
    .filter((state) => actionableStates.has(state));
  if (!states.length) return null;

  const attention = states.filter((state) => state === "attention").length;
  const delayed = states.filter((state) => state === "delayed").length;
  const warnings = states.filter((state) => state === "warning").length;
  const detail = [
    attention
      ? `${attention} require${attention === 1 ? "s" : ""} reconnection or connection review`
      : null,
    delayed ? `${delayed} ${delayed === 1 ? "is" : "are"} delayed` : null,
    warnings
      ? `${warnings} ${warnings === 1 ? "has" : "have"} a sync warning`
      : null,
  ]
    .filter(Boolean)
    .join("; ");

  return {
    detail: `${detail}. Open Gmail settings to review the affected mailbox${states.length === 1 ? "" : "es"}.`,
    severity: attention ? "critical" : "warning",
    title:
      states.length === 1
        ? "Gmail mailbox needs attention"
        : "Gmail mailboxes need attention",
  };
}
