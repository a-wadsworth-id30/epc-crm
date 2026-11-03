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

function sameParticipant(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  const normalizedLeft = left?.trim().toLocaleLowerCase();
  const normalizedRight = right?.trim().toLocaleLowerCase();
  return Boolean(
    normalizedLeft && normalizedRight && normalizedLeft === normalizedRight,
  );
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
  const contactRecipient =
    message.direction === "OUTBOUND" &&
    !sameParticipant(message.contactName, message.fromName) &&
    !sameParticipant(message.contactName, message.fromAddress)
      ? message.contactName
      : null;
  const recipient =
    message.toName ||
    message.toAddress ||
    contactRecipient ||
    (message.direction === "INBOUND" ? "CRM" : "Recipient unavailable");

  return `${sender} → ${recipient}`;
}

export function outboundEmailRoute(message: EmailConversationDisplay) {
  if (message.direction !== "OUTBOUND") return null;
  return emailParticipantRoute(message);
}
