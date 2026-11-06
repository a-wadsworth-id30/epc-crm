import type { Prisma } from "@prisma/client";
import {
  emailAttachmentDisplaySelect,
  serializeEmailAttachments,
} from "@/lib/email/attachment-display";
import {
  completeEmailPlainText,
  emailPlainTextViews,
} from "@/lib/email/plain-text";
import { sanitizedEmailHtmlViews } from "@/lib/email/sanitized-html";
import { resolveInboxMessageAddresses } from "@/lib/inbox/addresses";
import type { InboxMessageDetail, InboxMessageSummary } from "@/lib/inbox/types";
import { effectiveEmailMessageStatus } from "@/lib/inbox/read-state";

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
  mailbox: {
    select: {
      emailAddress: true,
      owner: { select: { avatarUrl: true } },
    },
  },
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
  salesCommunicationId: true,
  status: true,
  subject: true,
  summary: true,
  toAddress: true,
} satisfies Prisma.EmailMessageSelect;

export const inboxMessageDetailSelect = {
  ...inboxMessageSummarySelect,
  attachments: true,
  attachmentsArchive: { select: emailAttachmentDisplaySelect },
  ccAddresses: true,
  htmlBody: true,
  textBody: true,
} satisfies Prisma.EmailMessageSelect;

export function inboxMessageSummarySelectForUser(userId: string) {
  return {
    ...inboxMessageSummarySelect,
    userStates: {
      where: { userId },
      select: { readAt: true },
      take: 1,
    },
  } satisfies Prisma.EmailMessageSelect;
}

export function inboxMessageDetailSelectForUser(userId: string) {
  return {
    ...inboxMessageDetailSelect,
    userStates: {
      where: { userId },
      select: { readAt: true },
      take: 1,
    },
  } satisfies Prisma.EmailMessageSelect;
}

type InboxMessageSummaryRow = Prisma.EmailMessageGetPayload<{
  select: typeof inboxMessageSummarySelect;
}> & { userStates?: Array<{ readAt: Date | null }> };

type InboxMessageDetailRow = Prisma.EmailMessageGetPayload<{
  select: typeof inboxMessageDetailSelect;
}> & { userStates?: Array<{ readAt: Date | null }> };

function providerLabels(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const labels = (value as { gmailLabelIds?: unknown }).gmailLabelIds;

  return Array.isArray(labels)
    ? [
        ...new Set(
          labels.filter(
            (label): label is string =>
              typeof label === "string" &&
              label !== "SENT" &&
              label !== "UNREAD",
          ),
        ),
      ]
    : [];
}

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
    avatarUrl:
      message.direction === "OUTBOUND"
        ? (message.mailbox?.owner?.avatarUrl ?? null)
        : null,
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
    providerLabels: providerLabels(message.metadata),
    receivedAt: message.receivedAt.toISOString(),
    replyToAddress,
    salesCommunicationId: message.salesCommunicationId,
    status: effectiveEmailMessageStatus(message),
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
  const plainTextViews = emailPlainTextViews(fullTextBody);
  const attachments = serializeEmailAttachments(
    message.attachmentsArchive,
    message.attachments,
    message.htmlBody,
    message.provider,
  );
  const htmlViews = sanitizedEmailHtmlViews({
    html: message.htmlBody,
    inlineImages: attachments.flatMap((attachment) =>
      attachment.isEmbedded && attachment.contentId && attachment.previewUrl
        ? [{ contentId: attachment.contentId, previewUrl: attachment.previewUrl }]
        : [],
    ),
  });

  return {
    ...serializeInboxMessageSummary(message),
    attachments,
    ccAddresses: Array.isArray(message.ccAddresses)
      ? message.ccAddresses.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
    fullHtmlBody: htmlViews.fullHtml,
    fullTextBody,
    latestHtmlBody: htmlViews.latestHtml,
    latestTextBody: plainTextViews.latestText,
    quotedHistoryHtmlBody: htmlViews.quotedHistoryHtml,
    quotedHistoryTextBody: message.htmlBody?.trim()
      ? ""
      : plainTextViews.quotedHistoryText,
  };
}
