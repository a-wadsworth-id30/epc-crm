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

function headerText(
  source: Record<string, unknown>,
  ...names: string[]
) {
  const normalizedNames = new Set(
    names.map((name) => name.toLowerCase().replace(/[^a-z0-9]/g, "")),
  );

  for (const [key, value] of Object.entries(source)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!normalizedNames.has(normalizedKey)) continue;
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
      const text = value.filter((item) => typeof item === "string").join(", ");
      if (text) return text;
    }
  }

  return null;
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
  const toHeader = headerText(headers, "to");
  const replyTo = headerText(headers, "reply-to", "replyTo") ??
    headerText(metadata, "reply-to", "replyTo");
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
    mailboxAddress: firstEmailAddress(message.mailbox?.emailAddress),
    replyToAddress: firstEmailAddress(replyTo),
    toAddress,
    toName: emailHeaderName(toHeader),
  };
}
