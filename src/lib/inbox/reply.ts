export function inboxReplyRecipient(message: {
  direction: string;
  fromAddress: string | null;
  toAddress: string | null;
}) {
  return message.direction === "OUTBOUND"
    ? message.toAddress
    : message.fromAddress;
}

export function inboxReplySubject(subject: string | null) {
  const base = (subject ?? "Your email")
    .replace(/^(?:\s*re:\s*)+/i, "")
    .trim();

  return `Re: ${base || "Your email"}`;
}
