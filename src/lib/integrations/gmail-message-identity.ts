type GmailSendMetadataInput = {
  acceptedAt?: string;
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
  acceptedAt,
  existing,
  fromEmail,
  gmailMessageId,
  gmailThreadId,
  mailboxId,
  source,
}: GmailSendMetadataInput) {
  const existingMetadata = jsonObject(existing);
  const existingAcceptedAt = existingMetadata.acceptedAt;

  return {
    ...existingMetadata,
    fromEmail,
    gmailMessageId,
    gmailThreadId,
    mailboxId,
    messageId: gmailProviderMessageId(mailboxId, gmailMessageId),
    provider: "gmail",
    sendState: "accepted",
    acceptedAt:
      acceptedAt ??
      (typeof existingAcceptedAt === "string"
        ? existingAcceptedAt
        : null),
    source,
  };
}
