import type { Prisma } from "@prisma/client";
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
  return {
    ...serializeInboxMessageSummary(message),
    htmlBody: message.htmlBody,
    textBody: message.textBody,
  };
}
