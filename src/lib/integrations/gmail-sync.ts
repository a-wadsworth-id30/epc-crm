import "server-only";

import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { emailTextSummary, latestInboundEmailPlainText } from "@/lib/email/plain-text";
import { id30AuthBrokerRequest } from "@/lib/integrations/id30-auth-oauth";
import { prisma } from "@/lib/prisma";
import { bumpRealtimeTopics, realtimeTopics } from "@/lib/realtime/topics";
import { runSalesAutomationTrigger } from "@/lib/sales/automation";
import { getR2Config, putR2Object } from "@/lib/storage/r2";

const attachmentSchema = z.object({
  attachmentId: z.string().nullable(),
  fileName: z.string().min(1),
  inlineData: z.string().nullable().default(null),
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

const attachmentResponseSchema = z.object({
  ok: z.literal(true),
  provider: z.literal("gmail"),
  result: z.object({
    data: z.string().min(1).nullable(),
    size: z.number().int().nonnegative().nullable(),
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

function emailAddresses(value: string | null | undefined) {
  const matches = value?.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return [...new Set(matches.map((item) => item.toLowerCase()))];
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
  mailboxId,
  message,
}: {
  direction: "INBOUND" | "OUTBOUND";
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

  const candidates = emailAddresses(
    direction === "INBOUND" ? message.headers.from : message.headers.to,
  );
  if (!candidates.length) return { contactId: null, opportunityId: null };

  const contact = await prisma.contact.findFirst({
    where: { OR: candidates.map(contactMatchesEmail) },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!contact) return { contactId: null, opportunityId: null };

  const opportunities = await prisma.salesOpportunity.findMany({
    where: {
      contactId: contact.id,
      stage: { notIn: ["WON", "LOST"] },
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
    take: 2,
  });

  return {
    contactId: contact.id,
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
    mailboxId: mailbox.id,
    message,
  });
  const providerMessageId = `gmail:${mailbox.id}:${message.id}`;
  const existing = await prisma.emailMessage.findUnique({
    where: { providerMessageId },
    select: { id: true, salesCommunicationId: true },
  });
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
  const metadata = jsonValue({
    bcc: emailAddresses(message.headers.bcc),
    gmailHistoryId: message.historyId,
    gmailLabelIds: message.labelIds,
    gmailMessageId: message.id,
    gmailThreadId: message.threadId,
    references: message.headers.references,
    replyTo: message.headers.replyTo,
    sizeEstimate: message.sizeEstimate,
    source: "gmail-sync",
  });

  const result = await prisma.$transaction(async (tx) => {
    let communicationId = existing?.salesCommunicationId ?? null;
    if (context.opportunityId) {
      const communicationData = {
        body: body || null,
        channel: "EMAIL" as const,
        contactId: context.contactId,
        direction: direction as "INBOUND" | "OUTBOUND",
        fromAddress: emailAddresses(message.headers.from)[0] ?? message.headers.from,
        metadata,
        occurredAt: date,
        opportunityId: context.opportunityId,
        subject: message.headers.subject ?? "Email",
        summary,
        toAddress: emailAddresses(message.headers.to)[0] ?? message.headers.to,
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
          source: existing ? "existing-message" : "automatic",
        },
      });
    }

    const emailData = {
      attachments: jsonValue(
        message.attachments.map(
          ({ attachmentId, fileName, mimeType, sizeBytes }) => ({
            attachmentId,
            fileName,
            mimeType,
            sizeBytes,
          }),
        ),
      ),
      ccAddresses: jsonValue(emailAddresses(message.headers.cc)),
      contactId: context.contactId,
      direction: direction as "INBOUND" | "OUTBOUND",
      fromAddress: emailAddresses(message.headers.from)[0] ?? message.headers.from,
      htmlBody: message.htmlBody,
      inReplyTo: message.headers.inReplyTo,
      internetMessageId: message.headers.messageId,
      mailboxId: mailbox.id,
      metadata,
      opportunityId: context.opportunityId,
      provider: "gmail",
      providerThreadId: message.threadId,
      receivedAt: date,
      salesCommunicationId: communicationId,
      subject: message.headers.subject,
      summary,
      textBody: body || message.textBody,
      toAddress: emailAddresses(message.headers.to)[0] ?? message.headers.to,
    };
    const email = existing
      ? await tx.emailMessage.update({ where: { id: existing.id }, data: emailData })
      : await tx.emailMessage.create({
          data: {
            ...emailData,
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

  return { ...result, contactId: context.contactId, opportunityId: context.opportunityId };
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "attachment";
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
  const r2Config = await getR2Config();
  if (!r2Config) return { archived: 0, failed: 0 };
  const maxBytes = r2Config.maxUploadMb * 1024 * 1024;
  let archived = 0;
  let failed = 0;

  for (const [index, attachment] of message.attachments.entries()) {
    if (
      (!attachment.attachmentId && !attachment.inlineData) ||
      (attachment.sizeBytes ?? 0) > maxBytes
    ) {
      continue;
    }
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
      let encodedData = attachment.inlineData;
      if (!encodedData && attachment.attachmentId) {
        const pathname = `/api/crm/connections/${encodeURIComponent(mailbox.authConnectionId)}/gmail/attachment`;
        const response = await id30AuthBrokerRequest({
          body: { attachmentId: attachment.attachmentId, messageId: message.id },
          connectionId: mailbox.authConnectionId,
          method: "POST",
          pathname,
        });
        if (!response.ok) throw new Error(response.message);
        const parsed = attachmentResponseSchema.safeParse(response.body);
        if (!parsed.success || !parsed.data.result.data) {
          throw new Error("Gmail attachment response was incomplete.");
        }
        encodedData = parsed.data.result.data;
      }
      if (!encodedData) throw new Error("Gmail attachment data was unavailable.");
      const buffer = Buffer.from(encodedData, "base64url");
      if (buffer.byteLength > maxBytes) throw new Error("Attachment exceeds the R2 upload limit.");
      const key = `${r2Config.uploadPrefix || "crm-assets"}/gmail/${mailbox.id}/${message.id}/${crypto.randomUUID()}-${safeFileName(attachment.fileName)}`;
      const upload = await putR2Object({
        body: buffer,
        contentType: attachment.mimeType ?? "application/octet-stream",
        key,
      });
      const file = await prisma.fileAsset.create({
        data: {
          bucket: upload.bucketName,
          entityId: opportunityId ?? contactId ?? emailId,
          entityType: opportunityId
            ? "sales_opportunity"
            : contactId
              ? "contact"
              : "email_message",
          key: upload.key,
          mimeType: attachment.mimeType ?? "application/octet-stream",
          originalName: attachment.fileName,
          sizeBytes: buffer.byteLength,
          tags: ["email-attachment", "gmail"],
        },
      });
      await prisma.emailAttachment.update({
        where: { id: row.id },
        data: { archiveStatus: "STORED", fileAssetId: file.id, lastError: null },
      });
      archived += 1;
    } catch (error) {
      failed += 1;
      await prisma.emailAttachment.update({
        where: { id: row.id },
        data: {
          archiveStatus: "FAILED",
          lastError:
            error instanceof Error ? error.message.slice(0, 500) : "Attachment archive failed.",
        },
      });
    }
  }

  return { archived, failed };
}

export async function syncGmailMailbox(mailboxId: string) {
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
      maxResults: 25,
      pageToken: mailbox.lastHistoryId ? historyPageToken : initialPageToken,
      query: mailbox.lastHistoryId ? null : "newer_than:1y",
    },
    connectionId: mailbox.authConnectionId,
    method: "POST",
    pathname,
  });

  if (!response.ok && response.status === 409 && response.body?.code === "history_expired") {
    response = await id30AuthBrokerRequest({
      body: { historyId: null, maxResults: 25, pageToken: null, query: "newer_than:1y" },
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
  let archivedAttachments = 0;
  let failedAttachments = 0;
  const realtimeTopicsToBump = new Set<string>([realtimeTopics.inbox]);
  for (const message of parsed.data.result.messages) {
    const imported = await importGmailMessage({ mailbox, message });
    if (imported.created) created += 1;
    else updated += 1;
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
    ...metadata,
    initialSyncPageToken: mailbox.lastHistoryId ? null : nextPageToken,
    historySyncPageToken: mailbox.lastHistoryId ? nextPageToken : null,
  };
  await prisma.emailMailbox.update({
    where: { id: mailbox.id },
    data: {
      emailAddress: parsed.data.result.emailAddress?.toLowerCase() ?? mailbox.emailAddress,
      lastError: failedAttachments
        ? `${failedAttachments} Gmail attachment${failedAttachments === 1 ? "" : "s"} could not be archived.`
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
