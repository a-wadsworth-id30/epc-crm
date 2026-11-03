export type EmailConversationDisplay = {
  channel: string;
  contactName: string | null;
  direction: string;
  emailProvider?: string | null;
  fromAddress: string | null;
  fromName?: string | null;
  toAddress: string | null;
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

export function outboundEmailRoute(message: EmailConversationDisplay) {
  if (message.channel !== "EMAIL" || message.direction !== "OUTBOUND") {
    return null;
  }

  const recipient =
    message.contactName ||
    message.toAddress ||
    message.fromAddress ||
    "Customer";
  if (message.userName) return `CRM → ${recipient}`;

  const sender =
    message.fromName ||
    message.fromAddress ||
    emailOriginLabel(message) ||
    "Mailbox";
  return `${sender} → ${recipient}`;
}
