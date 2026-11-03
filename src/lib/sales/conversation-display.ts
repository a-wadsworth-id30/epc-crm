import { inferredEmailDirection } from "@/lib/email/direction";

export type EmailConversationDisplay = {
  channel: string;
  contactEmail?: string | null;
  contactName: string | null;
  direction: string;
  emailProvider?: string | null;
  fromAddress: string | null;
  fromName?: string | null;
  toAddress: string | null;
  toName?: string | null;
  userName: string | null;
};

export function emailDisplayDirection(message: EmailConversationDisplay) {
  if (message.channel !== "EMAIL" || message.userName) {
    return message.direction;
  }

  return inferredEmailDirection({
    contactName: message.contactName,
    fromAddress: message.fromAddress,
    fromName: message.fromName,
    storedDirection: message.direction,
  });
}

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

  const direction = emailDisplayDirection(message);
  const inferredSenderAddress =
    direction === "INBOUND" &&
    !message.fromAddress &&
    message.contactEmail &&
    sameParticipant(message.fromName, message.contactName)
      ? message.contactEmail
      : null;
  const inferredSender = inferredSenderAddress
    ? message.fromName || message.contactName
      ? `${message.fromName || message.contactName} (${inferredSenderAddress})`
      : inferredSenderAddress
    : null;

  const sender =
    direction === "OUTBOUND" && message.userName
      ? "CRM"
      : inferredSender ||
        message.fromName ||
        message.fromAddress ||
        (direction === "INBOUND" ? message.contactName : null) ||
        emailOriginLabel(message) ||
        "Mailbox";
  const contactRecipient =
    direction === "OUTBOUND" &&
    !sameParticipant(message.contactName, message.fromName) &&
    !sameParticipant(message.contactName, message.fromAddress)
      ? message.contactName
      : null;
  const recipient =
    message.toName ||
    message.toAddress ||
    contactRecipient ||
    (direction === "INBOUND" ? "CRM" : "Recipient unavailable");

  return `${sender} → ${recipient}`;
}

export function outboundEmailRoute(message: EmailConversationDisplay) {
  if (message.direction !== "OUTBOUND") return null;
  return emailParticipantRoute(message);
}
