import type { Prisma } from "@prisma/client";
import {
  completeEmailPlainText,
  latestInboundEmailPlainText,
} from "@/lib/email/plain-text";
import { sanitizedEmailHtmlViews } from "@/lib/email/sanitized-html";
import { resolveInboxMessageAddresses } from "@/lib/inbox/addresses";
import type { InboxMessageDetail, InboxMessageSummary } from "@/lib/inbox/types";

export const inboxMessageSummarySelect = {
  id: true,
  contact: {
    select: {
      firstName: true,
      lastName: true,
      email: true,
    },
  },
  direction: true,
  fromAddress: true,
  fromName: true,
  headers: true,
  inboundRouteId: true,
  mailbox: { select: { emailAddress: true } },
  mailboxId: true,
  metadata: true,
  opportunity: {
    select: {
      id: true,
      stage: true,
      title: true,
    },
  },
  provider: true,
  receivedAt: true,
  status: true,
  subject: true,
  summary: true,
  toAddress: true,
} satisfies Prisma.EmailMessageSelect;

export const inboxMessageDetailSelect = {
  ...inboxMessageSummarySelect,
  htmlBody: true,
  textBody: true,
} satisfies Prisma.EmailMessageSelect;

type InboxMessageSummaryRow = Prisma.EmailMessageGetPayload<{
  select: typeof inboxMessageSummarySelect;
}>;

type InboxMessageDetailRow = Prisma.EmailMessageGetPayload<{
  select: typeof inboxMessageDetailSelect;
}>;

export function serializeInboxMessageSummary(
  message: InboxMessageSummaryRow,
): InboxMessageSummary {
  const {
    fromAddress,
    fromName,
    mailboxAddress,
    replyToAddress,
    toAddress,
  } =
    resolveInboxMessageAddresses(message);

  return {
    contact: message.contact,
    direction: message.direction,
    fromAddress,
    fromName,
    id: message.id,
    inboundRouteId: message.inboundRouteId,
    mailboxId: message.mailboxId,
    mailboxAddress,
    opportunity: message.opportunity,
    provider: message.provider,
    receivedAt: message.receivedAt.toISOString(),
    replyToAddress,
    status: message.status,
    subject: message.subject,
    summary: message.summary ?? "Inbound email received",
    toAddress,
  };
}

export function serializeInboxMessageDetail(
  message: InboxMessageDetailRow,
): InboxMessageDetail {
  const fallback = message.summary ?? "Inbound email received";
  const fullTextBody = completeEmailPlainText({
    fallback,
    html: message.htmlBody,
    text: message.textBody,
  });
  const latestTextBody = latestInboundEmailPlainText({
    fallback,
    html: message.htmlBody,
    text: message.textBody,
  });
  const htmlViews = sanitizedEmailHtmlViews({
    fullText: fullTextBody,
    html: message.htmlBody,
    latestText: latestTextBody,
  });

  return {
    ...serializeInboxMessageSummary(message),
    fullHtmlBody: htmlViews.fullHtml,
    fullTextBody,
    latestHtmlBody: htmlViews.latestHtml,
    latestTextBody,
  };
}
