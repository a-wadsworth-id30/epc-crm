import type { Prisma } from "@prisma/client";
import {
  completeEmailPlainText,
  latestInboundEmailPlainText,
} from "@/lib/email/plain-text";
import { sanitizedEmailHtmlViews } from "@/lib/email/sanitized-html";
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
  inboundRouteId: true,
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
  return {
    ...message,
    receivedAt: message.receivedAt.toISOString(),
    summary: message.summary ?? "Inbound email received",
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
