import { firstEmailAddress } from "@/lib/email/addresses";

export function inboxReplyRecipient(message: {
  contactAddress?: string | null;
  direction: string;
  fromAddress: string | null;
  mailboxAddress?: string | null;
  replyToAddress?: string | null;
  toAddress: string | null;
}) {
  const excludedAddresses = new Set(
    (message.direction === "OUTBOUND"
      ? [message.mailboxAddress, message.fromAddress]
      : [message.mailboxAddress, message.toAddress]
    )
      .map((value) => firstEmailAddress(value))
      .filter((value): value is string => Boolean(value)),
  );
  const candidates =
    message.direction === "OUTBOUND"
      ? [message.toAddress, message.contactAddress]
      : [
          message.replyToAddress,
          message.fromAddress,
          message.contactAddress,
        ];

  return (
    candidates
      .map((value) => firstEmailAddress(value))
      .find((value) => value && !excludedAddresses.has(value)) ?? null
  );
}

export function inboxReplySubject(subject: string | null) {
  const base = (subject ?? "Your email")
    .replace(/^(?:\s*re:\s*)+/i, "")
    .trim();

  return `Re: ${base || "Your email"}`;
}
