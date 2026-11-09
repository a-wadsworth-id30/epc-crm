import "server-only";

import type { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  emailAddresses,
  emailHeaderName,
  firstEmailAddress,
} from "@/lib/email/addresses";
import {
  emailMessagesAreDuplicates,
  normalizeInternetMessageId,
} from "@/lib/email/deduplication";
import { shouldRetainGmailAttachmentDuringSync } from "@/lib/email/attachment-policy";
import { archiveGmailAttachmentSource } from "@/lib/email/gmail-attachment-storage";
import { emailTextSummary, latestInboundEmailPlainText } from "@/lib/email/plain-text";
import { newEmailWorkflowState } from "@/lib/inbox/team-workflow";
import { id30AuthBrokerRequest } from "@/lib/integrations/id30-auth-oauth";
import {
  gmailParticipantAddressesForMatch,
  unambiguousContactId,
} from "@/lib/integrations/gmail-contact-matching";
import { gmailProviderMessageId as gmailMessageKey } from "@/lib/integrations/gmail-message-identity";
import { clearGmailSyncRetryMetadata } from "@/lib/integrations/gmail-sync-retry-policy";
import { withGmailSyncLease } from "@/lib/integrations/gmail-sync-lease";
import { prisma } from "@/lib/prisma";
import { revalidateHeaderNotifications } from "@/lib/notifications";
import { bumpRealtimeTopics, realtimeTopics } from "@/lib/realtime/topics";
import { runSalesAutomationTrigger } from "@/lib/sales/automation";
import { getR2Config } from "@/lib/storage/r2";

const attachmentSchema = z.object({
  attachmentId: z.string().nullable(),
  contentId: z.string().nullable().optional(),
  contentDisposition: z.string().nullable().optional(),
  disposition: z.string().nullable().optional(),
  fileName: z.string().min(1),
  inlineData: z.string().nullable().default(null),
  isInline: z.boolean().optional(),
  mimeType: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
});

const gmailMessageSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  historyId: z.string().nullable(),
  internalDate: z.string().nullable(),
  labelIds: z.array(z.string()).default([]),
  sizeEstimate: z.number().nullable(),
  snippet: z.string().nullable(),
  textBody: z.string().nullable(),
  htmlBody: z.string().nullable(),
  attachments: z.array(attachmentSchema).default([]),
  headers: z.object({
    bcc: z.string().nullable(),
    cc: z.string().nullable(),
    date: z.string().nullable(),
    from: z.string().nullable(),
    inReplyTo: z.string().nullable(),
    messageId: z.string().nullable(),
    references: z.string().nullable(),
    replyTo: z.string().nullable(),
    subject: z.string().nullable(),
    to: z.string().nullable(),
  }),
});

const syncResponseSchema = z.object({
  ok: z.literal(true),
  provider: z.literal("gmail"),
  result: z.object({
    emailAddress: z.string().email().nullable(),
    historyId: z.string().nullable(),
    messages: z.array(gmailMessageSchema),
    nextPageToken: z.string().nullable(),
  }),
});

type GmailMessage = z.infer<typeof gmailMessageSchema>;

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function occurredAt(message: GmailMessage) {
  const millis = Number(message.internalDate);
  if (Number.isFinite(millis) && millis > 0) return new Date(millis);
  const date = message.headers.date ? new Date(message.headers.date) : null;
  return date && Number.isFinite(date.getTime()) ? date : new Date();
}

const contactMatchesEmail = (email: string) => ({
  OR: [
    { email: { equals: email, mode: "insensitive" as const } },
    {
      additionalEmails: {
        some: { email: { equals: email, mode: "insensitive" as const } },
      },
    },
  ],
});

async function resolveMessageContext({
  direction,
  mailboxAddress,
  mailboxId,
  message,
}: {
  direction: "INBOUND" | "OUTBOUND";
  mailboxAddress: string;
  mailboxId: string;
  message: GmailMessage;
}) {
  const threadLink = await prisma.emailThreadLink.findUnique({
    where: {
      mailboxId_providerThreadId: {
        mailboxId,
        providerThreadId: message.threadId,
      },
    },
    select: { contactId: true, opportunityId: true },
  });
  if (threadLink?.opportunityId || threadLink?.contactId) return threadLink;

  const candidates = gmailParticipantAddressesForMatch({
    direction,
    from: message.headers.from,
    mailboxAddress,
    replyTo: message.headers.replyTo,
    to: message.headers.to,
  });
  if (!candidates.length) return { contactId: null, opportunityId: null };

  const contactMatches = await prisma.contact.findMany({
    where: { OR: candidates.map(contactMatchesEmail) },
    select: { id: true },
    take: 2,
  });
  const contactId = unambiguousContactId(contactMatches);
  if (!contactId) return { contactId: null, opportunityId: null };

  const opportunities = await prisma.salesOpportunity.findMany({
    where: {
      contactId,
      stage: { notIn: ["WON", "LOST"] },
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
    take: 2,
  });

  return {
    contactId,
    opportunityId: opportunities.length === 1 ? opportunities[0].id : null,
  };
}

async function importGmailMessage({
  mailbox,
  message,
}: {
  mailbox: {
    authConnectionId: string;
    emailAddress: string;
    id: string;
  };
  message: GmailMessage;
}) {
  const sent =
    message.labelIds.includes("SENT") ||
    emailAddresses(message.headers.from).includes(mailbox.emailAddress.toLowerCase());
  const direction = sent ? "OUTBOUND" : "INBOUND";
  const context = await resolveMessageContext({
    direction,
    mailboxAddress: mailbox.emailAddress,
    mailboxId: mailbox.id,
    message,
  });
  const providerMessageId = gmailMessageKey(mailbox.id, message.id);
  const existing = await prisma.emailMessage.findUnique({
    where: { providerMessageId },
    select: { id: true, metadata: true, salesCommunicationId: true },
  });
  const threadWorkflow = !existing
    ? await prisma.emailMessage.findFirst({
        where: {
          mailboxId: mailbox.id,
          provider: "gmail",
          providerThreadId: message.threadId,
        },
        orderBy: { receivedAt: "desc" },
        select: {
          assignedAt: true,
          assignedUserId: true,
          teamStatus: true,
        },
      })
    : null;
  const body =
    direction === "INBOUND"
      ? latestInboundEmailPlainText({
          fallback: message.snippet,
          html: message.htmlBody,
          text: message.textBody,
        })
      : message.textBody ?? message.snippet ?? "";
  const summary = emailTextSummary(body || message.headers.subject || "Email");
  const date = occurredAt(message);
  const fromAddress =
    firstEmailAddress(
      message.headers.from,
      direction === "INBOUND" ? message.headers.replyTo : null,
    ) ?? (direction === "OUTBOUND" ? mailbox.emailAddress : null);
  const fromName = emailHeaderName(message.headers.from);
  const toAddress =
    firstEmailAddress(message.headers.to) ??
    (direction === "INBOUND" ? mailbox.emailAddress : null);
  const existingMetadata = jsonObject(existing?.metadata);
  const metadata = jsonValue({
    ...existingMetadata,
    bcc: emailAddresses(message.headers.bcc),
    gmailHistoryId: message.historyId,
    gmailLabelIds: message.labelIds,
    gmailMessageId: message.id,
    gmailThreadId: message.threadId,
    references: message.headers.references,
    replyTo: message.headers.replyTo,
    sizeEstimate: message.sizeEstimate,
    source:
      typeof existingMetadata.sendState === "string"
        ? existingMetadata.source ?? "crm-send"
        : "gmail-sync",
  });
  const internetMessageId = normalizeInternetMessageId(
    message.headers.messageId,
  );
  const crossProviderCandidates =
    !existing && context.opportunityId
      ? await prisma.emailMessage.findMany({
          where: {
            opportunityId: context.opportunityId,
            provider: { not: "gmail" },
            OR: [
              ...(internetMessageId
                ? [{ internetMessageId }]
                : []),
              {
                direction,
                receivedAt: {
                  gte: new Date(date.getTime() - 2 * 60 * 1000),
                  lte: new Date(date.getTime() + 2 * 60 * 1000),
                },
                subject: message.headers.subject,
              },
            ],
          },
          orderBy: { receivedAt: "desc" },
          take: 10,
          select: {
            direction: true,
            fromAddress: true,
            headers: true,
            id: true,
            internetMessageId: true,
            metadata: true,
            receivedAt: true,
            salesCommunicationId: true,
            subject: true,
            textBody: true,
            toAddress: true,
          },
        })
      : [];
  const crossProviderDuplicate = crossProviderCandidates.find((candidate) =>
    emailMessagesAreDuplicates(
      {
        body: candidate.textBody,
        direction: candidate.direction,
        fromAddress: candidate.fromAddress,
        headers: candidate.headers,
        internetMessageId: candidate.internetMessageId,
        metadata: candidate.metadata,
        occurredAt: candidate.receivedAt,
        subject: candidate.subject,
        toAddress: candidate.toAddress,
      },
      {
        body: message.textBody ?? body,
        direction,
        fromAddress,
        internetMessageId,
        occurredAt: date,
        subject: message.headers.subject,
        toAddress,
      },
    ),
  );

  const result = await prisma.$transaction(async (tx) => {
    let communicationId =
      existing?.salesCommunicationId ??
      crossProviderDuplicate?.salesCommunicationId ??
      null;
    if (context.opportunityId) {
      const communicationData = {
        body: body || null,
        channel: "EMAIL" as const,
        contactId: context.contactId,
        direction: direction as "INBOUND" | "OUTBOUND",
        fromAddress,
        metadata,
        occurredAt: date,
        opportunityId: context.opportunityId,
        subject: message.headers.subject ?? "Email",
        summary,
        toAddress,
      };
      if (communicationId) {
        await tx.salesCommunication.update({
          where: { id: communicationId },
          data: communicationData,
        });
      } else {
        const communication = await tx.salesCommunication.create({
          data: { ...communicationData, externalId: providerMessageId },
        });
        communicationId = communication.id;
      }

      await tx.emailThreadLink.upsert({
        where: {
          mailboxId_providerThreadId: {
            mailboxId: mailbox.id,
            providerThreadId: message.threadId,
          },
        },
        update: {
          contactId: context.contactId,
          opportunityId: context.opportunityId,
        },
        create: {
          contactId: context.contactId,
          mailboxId: mailbox.id,
          opportunityId: context.opportunityId,
          providerThreadId: message.threadId,
          source: existing
            ? "existing-message"
            : crossProviderDuplicate
              ? "cross-provider-match"
              : "automatic",
        },
      });
    }

    const emailData = {
      attachments: jsonValue(
        message.attachments.map(
          ({ attachmentId, contentDisposition, contentId, disposition, fileName, isInline, mimeType, sizeBytes }, index) => ({
            attachmentId,
            contentId: contentId ?? null,
            disposition:
              disposition ?? contentDisposition ?? (isInline ? "inline" : null),
            fileName,
            providerAttachmentId:
              attachmentId ?? `inline:${index}:${fileName}`,
            mimeType,
            sizeBytes,
          }),
        ),
      ),
      ccAddresses: jsonValue(emailAddresses(message.headers.cc)),
      contactId: context.contactId,
      direction: direction as "INBOUND" | "OUTBOUND",
      fromAddress,
      fromName,
      htmlBody: message.htmlBody,
      inReplyTo: message.headers.inReplyTo,
      internetMessageId,
      mailboxId: mailbox.id,
      metadata,
      opportunityId: context.opportunityId,
      provider: "gmail",
      providerThreadId: message.threadId,
      receivedAt: date,
      salesCommunicationId: communicationId,
      subject: message.headers.subject,
      summary,
      textBody: message.textBody ?? body,
      toAddress,
    };
    if (
      !existing &&
      crossProviderDuplicate?.salesCommunicationId &&
      crossProviderDuplicate.salesCommunicationId === communicationId
    ) {
      await tx.emailMessage.update({
        where: { id: crossProviderDuplicate.id },
        data: { salesCommunicationId: null },
      });
    }

    if (!existing && direction === "INBOUND") {
      await tx.emailMessage.updateMany({
        where: {
          mailboxId: mailbox.id,
          provider: "gmail",
          providerThreadId: message.threadId,
        },
        data: { teamStatus: "OPEN" },
      });
    }

    const newWorkflowState = newEmailWorkflowState(direction, threadWorkflow);
    const email = existing
      ? await tx.emailMessage.update({ where: { id: existing.id }, data: emailData })
      : await tx.emailMessage.create({
          data: {
            ...emailData,
            ...newWorkflowState,
            providerMessageId,
            status: direction === "INBOUND" ? "UNREAD" : "READ",
          },
        });

    for (const [index, attachment] of message.attachments.entries()) {
      const providerAttachmentId =
        attachment.attachmentId ?? `inline:${index}:${attachment.fileName}`;
      await tx.emailAttachment.upsert({
        where: {
          emailMessageId_providerAttachmentId: {
            emailMessageId: email.id,
            providerAttachmentId,
          },
        },
        update: {
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
        },
        create: {
          emailMessageId: email.id,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          providerAttachmentId,
          sizeBytes: attachment.sizeBytes,
        },
      });
    }

    return { communicationId, created: !existing, emailId: email.id };
  });

  if (result.created && direction === "INBOUND" && context.opportunityId) {
    const opportunity = await prisma.salesOpportunity.findUnique({
      where: { id: context.opportunityId },
      select: { salesPipelineStageId: true },
    });
    await runSalesAutomationTrigger(prisma, {
      communicationId: result.communicationId,
      opportunityId: context.opportunityId,
      salesPipelineStageId: opportunity?.salesPipelineStageId ?? null,
      trigger: "EMAIL_RECEIVED",
      metadata: { provider: "gmail", source: "gmail-sync" },
    });
  }

  return {
    ...result,
    contactId: context.contactId,
    direction,
    opportunityId: context.opportunityId,
  };
}

async function archiveMessageAttachments({
  mailbox,
  message,
  emailId,
  contactId,
  opportunityId,
}: {
  mailbox: { authConnectionId: string; id: string };
  message: GmailMessage;
  emailId: string;
  contactId: string | null;
  opportunityId: string | null;
}) {
  if (!(await getR2Config())) return { archived: 0, failed: 0 };

  let archived = 0;
  let failed = 0;

  for (const [index, attachment] of message.attachments.entries()) {
    // Gmail-backed attachments stay provider-hosted until a user downloads or
    // explicitly saves them. Only MIME parts with no retrievable Gmail ID must
    // be retained during sync, otherwise their bytes would be lost.
    if (!shouldRetainGmailAttachmentDuringSync(attachment)) continue;

    const providerAttachmentId =
      attachment.attachmentId ?? `inline:${index}:${attachment.fileName}`;
    const row = await prisma.emailAttachment.findUnique({
      where: {
        emailMessageId_providerAttachmentId: {
          emailMessageId: emailId,
          providerAttachmentId,
        },
      },
      select: { fileAssetId: true, id: true },
    });
    if (!row || row.fileAssetId) continue;

    try {
      await archiveGmailAttachmentSource({
        authConnectionId: mailbox.authConnectionId,
        contactId,
        emailAttachmentId: row.id,
        emailMessageId: emailId,
        fileName: attachment.fileName,
        gmailMessageId: message.id,
        inlineData: attachment.inlineData,
        mailboxId: mailbox.id,
        mimeType: attachment.mimeType,
        opportunityId,
        providerAttachmentId,
        sizeBytes: attachment.sizeBytes,
      });
      archived += 1;
    } catch (error) {
      failed += 1;
      console.error("Inline Gmail attachment archive failed", {
        attachmentId: row.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return { archived, failed };
}

async function syncGmailMailboxWithoutLease(
  mailboxId: string,
  options: { maxResults?: number } = {},
) {
  const maxResults = Math.min(
    Math.max(Math.trunc(options.maxResults ?? 25), 1),
    25,
  );
  const mailbox = await prisma.emailMailbox.findUnique({
    where: { id: mailboxId },
    select: {
      authConnectionId: true,
      emailAddress: true,
      id: true,
      lastHistoryId: true,
      metadata: true,
      status: true,
      syncEnabled: true,
    },
  });
  if (!mailbox || mailbox.status !== "CONNECTED" || !mailbox.syncEnabled) {
    throw new Error("Gmail mailbox is not available for sync.");
  }

  const metadata = jsonObject(mailbox.metadata);
  const initialPageToken =
    typeof metadata.initialSyncPageToken === "string"
      ? metadata.initialSyncPageToken
      : null;
  const historyPageToken =
    typeof metadata.historySyncPageToken === "string"
      ? metadata.historySyncPageToken
      : null;
  const pathname = `/api/crm/connections/${encodeURIComponent(mailbox.authConnectionId)}/gmail/sync`;
  let response = await id30AuthBrokerRequest({
    body: {
      historyId: mailbox.lastHistoryId,
      maxResults,
      pageToken: mailbox.lastHistoryId ? historyPageToken : initialPageToken,
      query: mailbox.lastHistoryId ? null : "newer_than:1y",
    },
    connectionId: mailbox.authConnectionId,
    method: "POST",
    pathname,
  });

  if (!response.ok && response.status === 409 && response.body?.code === "history_expired") {
    response = await id30AuthBrokerRequest({
      body: { historyId: null, maxResults, pageToken: null, query: "newer_than:1y" },
      connectionId: mailbox.authConnectionId,
      method: "POST",
      pathname,
    });
  }
  if (!response.ok) {
    await prisma.emailMailbox.update({
      where: { id: mailbox.id },
      data: {
        lastError: response.message,
        status: response.status === 409 ? "NEEDS_REAUTH" : undefined,
      },
    });
    throw new Error(response.message);
  }

  const parsed = syncResponseSchema.safeParse(response.body);
  if (!parsed.success) throw new Error("iD30 Auth Gmail sync response was incomplete.");

  let created = 0;
  let updated = 0;
  let createdInbound = 0;
  let archivedAttachments = 0;
  let failedAttachments = 0;
  const realtimeTopicsToBump = new Set<string>([realtimeTopics.inbox]);
  for (const message of parsed.data.result.messages) {
    const imported = await importGmailMessage({ mailbox, message });
    if (imported.created) created += 1;
    else updated += 1;
    if (imported.created && imported.direction === "INBOUND") {
      createdInbound += 1;
    }
    if (imported.opportunityId) {
      realtimeTopicsToBump.add(realtimeTopics.saleConversation(imported.opportunityId));
    }
    if (imported.contactId) {
      realtimeTopicsToBump.add(realtimeTopics.contactConversation(imported.contactId));
    }
    const archive = await archiveMessageAttachments({
      mailbox,
      message,
      emailId: imported.emailId,
      contactId: imported.contactId,
      opportunityId: imported.opportunityId,
    });
    archivedAttachments += archive.archived;
    failedAttachments += archive.failed;
  }

  const nextPageToken = parsed.data.result.nextPageToken;
  const nextMetadata = {
    ...clearGmailSyncRetryMetadata(metadata),
    initialSyncPageToken: mailbox.lastHistoryId ? null : nextPageToken,
    historySyncPageToken: mailbox.lastHistoryId ? nextPageToken : null,
  };
  await prisma.emailMailbox.update({
    where: { id: mailbox.id },
    data: {
      emailAddress: parsed.data.result.emailAddress?.toLowerCase() ?? mailbox.emailAddress,
      lastError: failedAttachments
        ? `${failedAttachments} inline Gmail attachment${failedAttachments === 1 ? "" : "s"} could not be retained.`
        : null,
      lastFullSyncAt: !mailbox.lastHistoryId && !nextPageToken ? new Date() : undefined,
      lastHistoryId: nextPageToken
        ? mailbox.lastHistoryId
        : parsed.data.result.historyId ?? mailbox.lastHistoryId,
      lastSyncAt: new Date(),
      metadata: jsonValue(nextMetadata),
      status: "CONNECTED",
    },
  });
  if (createdInbound > 0) {
    revalidateHeaderNotifications();
    realtimeTopicsToBump.add(realtimeTopics.notifications);
  }
  await bumpRealtimeTopics([...realtimeTopicsToBump]);

  return {
    archivedAttachments,
    created,
    failedAttachments,
    hasMore: Boolean(nextPageToken),
    read: parsed.data.result.messages.length,
    updated,
  };
}

export async function syncGmailMailbox(
  mailboxId: string,
  options: { maxResults?: number } = {},
) {
  return withGmailSyncLease(mailboxId, () =>
    syncGmailMailboxWithoutLease(mailboxId, options),
  );
}
