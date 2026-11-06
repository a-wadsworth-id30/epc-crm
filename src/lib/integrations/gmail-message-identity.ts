type GmailSendMetadataInput = {
  existing?: unknown;
  fromEmail: string;
  gmailMessageId: string;
  gmailThreadId: string;
  mailboxId: string;
  source: string;
};

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function gmailProviderMessageId(
  mailboxId: string,
  gmailMessageId: string,
) {
  return `gmail:${mailboxId}:${gmailMessageId}`;
}

export function reconciledGmailSendMetadata({
  existing,
  fromEmail,
  gmailMessageId,
  gmailThreadId,
  mailboxId,
  source,
}: GmailSendMetadataInput) {
  return {
    ...jsonObject(existing),
    fromEmail,
    gmailMessageId,
    gmailThreadId,
    mailboxId,
    messageId: gmailProviderMessageId(mailboxId, gmailMessageId),
    provider: "gmail",
    sendState: "sent",
    source,
  };
}
