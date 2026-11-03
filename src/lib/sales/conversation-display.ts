export type EmailConversationDisplay = {
  channel: string;
  contactName: string | null;
  direction: string;
  emailProvider?: string | null;
  fromAddress: string | null;
  fromName?: string | null;
  toAddress: string | null;
  toName?: string | null;
  userName: string | null;
};

export function emailOriginLabel(message: EmailConversationDisplay) {
  if (message.channel !== "EMAIL") return null;
  if (message.direction === "OUTBOUND" && message.userName) return "CRM";

  if (message.emailProvider === "gmail") return "Gmail";
  if (message.emailProvider === "mailersend") return "MailerSend";
  if (message.emailProvider === "pipedrive") return "Pipedrive";
  return message.emailProvider ?? null;
}

export function emailParticipantRoute(message: EmailConversationDisplay) {
  if (message.channel !== "EMAIL") return null;

  const sender =
    message.direction === "OUTBOUND" && message.userName
      ? "CRM"
      : message.fromName ||
        message.fromAddress ||
        (message.direction === "INBOUND" ? message.contactName : null) ||
        emailOriginLabel(message) ||
        "Mailbox";
  const recipient =
    message.toName ||
    message.toAddress ||
    (message.direction === "OUTBOUND" ? message.contactName : null) ||
    "CRM";

  return `${sender} → ${recipient}`;
}

export function outboundEmailRoute(message: EmailConversationDisplay) {
  if (message.direction !== "OUTBOUND") return null;
  return emailParticipantRoute(message);
}
