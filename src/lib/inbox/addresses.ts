import { emailHeaderName, firstEmailAddress } from "@/lib/email/addresses";

type InboxAddressSource = {
  contact?: { email?: string | null } | null;
  direction: string;
  fromAddress: string | null;
  fromName?: string | null;
  headers?: unknown;
  mailbox?: { emailAddress?: string | null } | null;
  metadata?: unknown;
  toAddress: string | null;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function resolveInboxMessageAddresses(message: InboxAddressSource) {
  const headers = objectValue(message.headers);
  const metadata = objectValue(message.metadata);
  const fromHeader =
    typeof headers.from === "string"
      ? headers.from
      : typeof headers.From === "string"
        ? headers.From
        : null;
  const replyTo =
    typeof metadata.replyTo === "string" ? metadata.replyTo : null;
  const fromAddress =
    firstEmailAddress(message.fromAddress, fromHeader) ??
    (message.direction === "INBOUND"
      ? firstEmailAddress(replyTo, message.contact?.email)
      : firstEmailAddress(message.mailbox?.emailAddress));
  const toAddress =
    firstEmailAddress(message.toAddress) ??
    (message.direction === "INBOUND"
      ? firstEmailAddress(message.mailbox?.emailAddress)
      : firstEmailAddress(message.contact?.email));

  return {
    fromAddress,
    fromName: message.fromName ?? emailHeaderName(fromHeader),
    toAddress,
  };
}
