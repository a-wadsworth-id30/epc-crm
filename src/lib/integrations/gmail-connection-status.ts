import type { EmailMailboxStatus } from "@prisma/client";

export type GmailAuthConnectionStatus =
  | "CONNECTED"
  | "NEEDS_REAUTH"
  | "DISCONNECTED"
  | "FAILED";

export function gmailMailboxStatusFromAuth(
  authStatus: GmailAuthConnectionStatus,
  reconnectRequired: boolean,
): EmailMailboxStatus {
  if (authStatus === "CONNECTED") return "CONNECTED";
  if (authStatus === "DISCONNECTED") return "DISCONNECTED";
  if (authStatus === "NEEDS_REAUTH" || reconnectRequired) {
    return "NEEDS_REAUTH";
  }
  return "ERROR";
}

export function gmailMailboxErrorFromAuth({
  authStatus,
  lastError,
  reconnectRequired,
}: {
  authStatus: GmailAuthConnectionStatus;
  lastError: string | null;
  reconnectRequired: boolean;
}) {
  if (authStatus === "CONNECTED" || authStatus === "DISCONNECTED") return null;
  const fallback = reconnectRequired
    ? "Reconnect this Gmail mailbox through iD30 Auth."
    : "iD30 Auth reported a Gmail connection error.";
  return (lastError?.trim() || fallback).slice(0, 500);
}
