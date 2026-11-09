import "server-only";

import crypto from "node:crypto";
import twilio from "twilio";
import {
  getMailerSendOpportunityReplyAddress,
  sendMailerSendEmail,
} from "@/lib/integrations/mailersend";
import {
  findGmailMailboxForSend,
  sendGmailEmail,
} from "@/lib/integrations/gmail-send";
import { reconciledGmailSendMetadata } from "@/lib/integrations/gmail-message-identity";
import { sanitizeOutboundEmailHtml } from "@/lib/email/outbound-html";
import {
  getStoredTwilioConfig,
  getTwilioMessagingRuntime,
  normalizeCallableNumber,
} from "@/lib/integrations/twilio-server";
import { prisma } from "@/lib/prisma";
import { bumpRealtimeTopics, realtimeTopics } from "@/lib/realtime/topics";
import {
  salesOpportunityIdAccessWhere,
} from "@/lib/crm-resource-access";
import { runSalesAutomationTrigger } from "@/lib/sales/automation";
import { markOpportunityFirstContacted } from "@/lib/sales/lifecycle";
import { personaliseOutboundMessage } from "@/lib/sales/message-personalisation";
import type { CurrentUser } from "@/lib/auth";

type OutboundMessageUser = Pick<CurrentUser, "id" | "role">;

type SendSalesLeadEmailInput = {
  body: string;
  htmlBody?: string | null;
  contactId?: string | null;
  gmailThreadId?: string | null;
  inReplyTo?: string | null;
  opportunityId: string;
  source: string;
  subject: string;
  to?: string | null;
  mailboxId?: string | null;
  user: OutboundMessageUser;
};

type SendSalesLeadSmsInput = {
  body: string;
  contactId?: string | null;
  opportunityId: string;
  source: string;
  statusCallbackBaseUrl?: string | null;
  to?: string | null;
  user: OutboundMessageUser;
};

type OpportunityContact = {
  additionalEmails: Array<{ email: string }>;
  additionalPhones: Array<{ phone: string; phoneNormalized: string | null }>;
  companyName: string | null;
  email: string | null;
  firstName: string;
  id: string;
  lastName: string;
  phone: string | null;
  phoneNormalized: string | null;
};

export class OutboundMessageAccessError extends Error {
  constructor(message = "You do not have access to send this message.") {
    super(message);
    this.name = "OutboundMessageAccessError";
  }
}

function messageSummary(body: string, maxLength = 180) {
  const trimmed = body.trim().replace(/\s+/g, " ");
  return trimmed.length > maxLength
    ? `${trimmed.slice(0, maxLength - 3)}...`
    : trimmed;
}

function safeGmailFailureReason(error: unknown) {
  return outboundMessageError(error, "Gmail rejected the send request.")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

async function recordGmailSendFailure({
  body,
  contactId,
  error,
  fromAddress,
  htmlBody,
  mailboxId,
  opportunityId,
  source,
  subject,
  toAddress,
  userId,
}: {
  body: string;
  contactId: string | null;
  error: unknown;
  fromAddress: string;
  htmlBody: string;
  mailboxId: string;
  opportunityId: string;
  source: string;
  subject: string;
  toAddress: string;
  userId: string;
}) {
  const failedAt = new Date();
  const failureReason = safeGmailFailureReason(error);
  const attemptId = `gmail-failed:${crypto.randomUUID()}`;
  const metadata = {
    failedAt: failedAt.toISOString(),
    failureReason,
    fromEmail: fromAddress,
    mailboxId,
    provider: "gmail",
    sendState: "failed",
    source,
  };

  const communication = await prisma.$transaction(async (tx) => {
    const created = await tx.salesCommunication.create({
      data: {
        body,
        channel: "EMAIL",
        contactId,
        direction: "OUTBOUND",
        externalId: attemptId,
        fromAddress,
        metadata,
        occurredAt: failedAt,
        opportunityId,
        subject,
        summary: messageSummary(body),
        toAddress,
        userId,
      },
    });

    const email = await tx.emailMessage.create({
      data: {
        contactId,
        direction: "OUTBOUND",
        fromAddress,
        htmlBody,
        mailboxId,
        metadata,
        opportunityId,
        provider: "gmail",
        receivedAt: failedAt,
        salesCommunicationId: created.id,
        status: "READ",
        subject,
        summary: messageSummary(body),
        textBody: body,
        toAddress,
      },
      select: { id: true },
    });

    await tx.auditLog.create({
      data: {
        action: "gmail.send.failed",
        actorId: userId,
        entity: "EmailMessage",
        entityId: email.id,
        metadata: {
          failureReason,
          mailboxId,
          opportunityId,
          source,
          toAddress,
        },
      },
    });

    return created;
  });

  await bumpRealtimeTopics([
    realtimeTopics.saleConversation(opportunityId),
    contactId ? realtimeTopics.contactConversation(contactId) : null,
  ]);

  return communication;
}

function statusCallbackOrigin(configuredBaseUrl?: string | null) {
  const fallbackBaseUrl = ["https://crm", "epc-improvements.co.uk"].join(".");

  return (
    configuredBaseUrl?.replace(/\/$/, "") ||
    process.env.APP_BASE_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    fallbackBaseUrl
  );
}

function contactName(
  contact: { firstName: string; lastName: string } | null | undefined,
) {
  return contact ? `${contact.firstName} ${contact.lastName}`.trim() : null;
}

async function messageContextForOpportunity({
  opportunity,
  userId,
}: {
  opportunity: {
    company: { name: string } | null;
    contact: {
      companyName: string | null;
      firstName: string;
      lastName: string;
    } | null;
    owner: {
      email: string;
      landline: string | null;
      mobile: string | null;
      name: string;
    } | null;
    title: string;
  };
  userId: string;
}) {
  const sender =
    opportunity.owner ??
    (await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, landline: true, mobile: true, name: true },
    }));

  return {
    companyName: opportunity.company?.name ?? opportunity.contact?.companyName,
    customerFirstName: opportunity.contact?.firstName,
    customerName: contactName(opportunity.contact),
    leadTitle: opportunity.title,
    ownerEmail: sender?.email,
    ownerName: sender?.name,
    ownerPhone: sender?.mobile ?? sender?.landline,
  };
}

export function outboundMessageError(error: unknown, fallback: string) {
  const candidate = error as {
    code?: number | string;
    message?: string;
  };

  if (candidate?.message) {
    return candidate.code
      ? `${candidate.message} (${candidate.code})`
      : candidate.message;
  }

  return fallback;
}

export function outboundMessageStatus(error: unknown) {
  return error instanceof OutboundMessageAccessError ? 403 : 502;
}

function assertOpportunityContact({
  contactId,
  opportunityContactId,
}: {
  contactId?: string | null;
  opportunityContactId: string | null;
}) {
  if (contactId && contactId !== opportunityContactId) {
    throw new OutboundMessageAccessError(
      "The selected contact is not linked to this lead.",
    );
  }
}

function normalizedEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

function contactEmailRecipients(contact: OpportunityContact | null) {
  if (!contact) return new Set<string>();

  return new Set(
    [contact.email, ...contact.additionalEmails.map((item) => item.email)]
      .map(normalizedEmail)
      .filter((item): item is string => Boolean(item)),
  );
}

function assertAllowedEmailRecipient({
  contact,
  recipient,
  user,
}: {
  contact: OpportunityContact | null;
  recipient: string;
  user: OutboundMessageUser;
}) {
  if (user.role === "ADMIN") return;

  const allowed = contactEmailRecipients(contact);

  if (!allowed.has(normalizedEmail(recipient) ?? "")) {
    throw new OutboundMessageAccessError(
      "Choose an email address linked to this lead contact.",
    );
  }
}

function contactSmsRecipients(contact: OpportunityContact | null) {
  if (!contact) return new Set<string>();

  return new Set(
    [
      contact.phoneNormalized ?? normalizeCallableNumber(contact.phone ?? ""),
      ...contact.additionalPhones.map(
        (item) => item.phoneNormalized ?? normalizeCallableNumber(item.phone),
      ),
    ].filter((item): item is string => Boolean(item)),
  );
}

function assertAllowedSmsRecipient({
  contact,
  recipient,
  user,
}: {
  contact: OpportunityContact | null;
  recipient: string;
  user: OutboundMessageUser;
}) {
  if (user.role === "ADMIN") return;

  if (!contactSmsRecipients(contact).has(recipient)) {
    throw new OutboundMessageAccessError(
      "Choose a phone number linked to this lead contact.",
    );
  }
}

export async function sendSalesLeadEmail(input: SendSalesLeadEmailInput) {
  const opportunity = await prisma.salesOpportunity.findFirst({
    where: salesOpportunityIdAccessWhere(input.opportunityId, input.user),
    include: {
      company: true,
      contact: {
        include: {
          additionalEmails: {
            select: { email: true },
          },
          additionalPhones: {
            select: { phone: true, phoneNormalized: true },
          },
        },
      },
      owner: true,
    },
  });

  if (!opportunity) {
    throw new OutboundMessageAccessError("Lead not found or access denied.");
  }

  assertOpportunityContact({
    contactId: input.contactId,
    opportunityContactId: opportunity.contactId,
  });

  const recipient = input.to?.trim() || opportunity.contact?.email;

  if (!recipient) {
    throw new Error("This lead does not have an email address.");
  }

  assertAllowedEmailRecipient({
    contact: opportunity.contact,
    recipient,
    user: input.user,
  });

  const messageContext = await messageContextForOpportunity({
    opportunity,
    userId: input.user.id,
  });
  const subject =
    personaliseOutboundMessage(input.subject, messageContext) ||
    `Follow-up on ${opportunity.title}`;
  const body = personaliseOutboundMessage(input.body, messageContext);

  if (!body) {
    throw new Error("Message became empty after resolving placeholders.");
  }
  const htmlBody = sanitizeOutboundEmailHtml(
    input.htmlBody
      ? personaliseOutboundMessage(input.htmlBody, messageContext)
      : null,
    body,
  );

  const gmailMailbox = await findGmailMailboxForSend({
    mailboxId: input.mailboxId,
    user: input.user,
  });
  let gmailResult: Awaited<ReturnType<typeof sendGmailEmail>> | null = null;
  if (gmailMailbox) {
    try {
      gmailResult = await sendGmailEmail({
        body,
        htmlBody,
        inReplyTo: input.inReplyTo,
        mailbox: gmailMailbox,
        opportunityId: opportunity.id,
        providerThreadId: input.gmailThreadId,
        subject,
        to: recipient,
        toName: contactName(opportunity.contact),
      });
    } catch (error) {
      try {
        await recordGmailSendFailure({
          body,
          contactId: input.contactId ?? opportunity.contactId,
          error,
          fromAddress: gmailMailbox.emailAddress,
          htmlBody,
          mailboxId: gmailMailbox.id,
          opportunityId: opportunity.id,
          source: input.source,
          subject,
          toAddress: recipient,
          userId: input.user.id,
        });
      } catch (recordError) {
        console.error("Gmail send failure could not be recorded", recordError);
      }
      throw error;
    }
  }
  const mailerSendResult = gmailResult
    ? null
    : await (async () => {
        const replyToEmail = await getMailerSendOpportunityReplyAddress(
          opportunity.id,
        );
        return sendMailerSendEmail({
          html: htmlBody,
          subject,
          text: body,
          replyToEmail,
          to: {
            email: recipient,
            name: contactName(opportunity.contact),
          },
          tags: ["crm", "sales-lead"],
        });
      })();
  const provider = gmailResult ? "gmail" : "mailersend";
  const fromEmail = gmailResult?.fromEmail ?? mailerSendResult!.fromEmail;
  const externalId = gmailResult?.messageId ?? mailerSendResult!.messageId;

  const communication = await prisma.$transaction(async (tx) => {
    const communicationData = {
      opportunityId: opportunity.id,
      contactId: input.contactId ?? opportunity.contactId,
      userId: input.user.id,
      channel: "EMAIL" as const,
      direction: "OUTBOUND" as const,
      subject,
      summary: messageSummary(body),
      body,
      fromAddress: fromEmail,
      toAddress: recipient,
      externalId,
    };

    if (!gmailResult) {
      return tx.salesCommunication.create({
        data: {
          ...communicationData,
          metadata: {
            provider,
            fromEmail,
            messageId: externalId,
            replyToEmail: mailerSendResult!.replyToEmail,
            statusCode: mailerSendResult!.statusCode,
            source: input.source,
          },
        },
        include: { contact: true, user: true },
      });
    }

    const claimedEmail = await tx.emailMessage.upsert({
      where: { providerMessageId: gmailResult.messageId },
      update: {
        contactId: communicationData.contactId,
        direction: "OUTBOUND",
        fromAddress: gmailResult.fromEmail,
        inReplyTo: input.inReplyTo ?? null,
        internetMessageId: gmailResult.internetMessageId,
        mailboxId: gmailResult.mailboxId,
        opportunityId: opportunity.id,
        provider: "gmail",
        providerThreadId: gmailResult.providerThreadId,
        status: "READ",
        subject,
        summary: messageSummary(body),
        htmlBody,
        textBody: body,
        toAddress: recipient,
      },
      create: {
        contactId: communicationData.contactId,
        direction: "OUTBOUND",
        fromAddress: gmailResult.fromEmail,
        inReplyTo: input.inReplyTo ?? null,
        internetMessageId: gmailResult.internetMessageId,
        mailboxId: gmailResult.mailboxId,
        metadata: reconciledGmailSendMetadata({
          acceptedAt: gmailResult.acceptedAt,
          fromEmail: gmailResult.fromEmail,
          gmailMessageId: gmailResult.providerMessageId,
          gmailThreadId: gmailResult.providerThreadId,
          mailboxId: gmailResult.mailboxId,
          source: input.source,
        }),
        opportunityId: opportunity.id,
        provider: "gmail",
        providerMessageId: gmailResult.messageId,
        providerThreadId: gmailResult.providerThreadId,
        status: "READ",
        subject,
        summary: messageSummary(body),
        htmlBody,
        textBody: body,
        toAddress: recipient,
      },
      select: {
        id: true,
        metadata: true,
        salesCommunicationId: true,
      },
    });

    const existingCommunication = claimedEmail.salesCommunicationId
      ? await tx.salesCommunication.findUnique({
          where: { id: claimedEmail.salesCommunicationId },
          select: { id: true, metadata: true },
        })
      : null;
    const gmailMetadata = reconciledGmailSendMetadata({
      acceptedAt: gmailResult.acceptedAt,
      existing: existingCommunication?.metadata ?? claimedEmail.metadata,
      fromEmail: gmailResult.fromEmail,
      gmailMessageId: gmailResult.providerMessageId,
      gmailThreadId: gmailResult.providerThreadId,
      mailboxId: gmailResult.mailboxId,
      source: input.source,
    });
    const created = existingCommunication
      ? await tx.salesCommunication.update({
          where: { id: existingCommunication.id },
          data: { ...communicationData, metadata: gmailMetadata },
          include: { contact: true, user: true },
        })
      : await tx.salesCommunication.create({
          data: { ...communicationData, metadata: gmailMetadata },
          include: { contact: true, user: true },
        });

    await tx.emailMessage.update({
      where: { id: claimedEmail.id },
      data: {
        metadata: reconciledGmailSendMetadata({
          acceptedAt: gmailResult.acceptedAt,
          existing: claimedEmail.metadata,
          fromEmail: gmailResult.fromEmail,
          gmailMessageId: gmailResult.providerMessageId,
          gmailThreadId: gmailResult.providerThreadId,
          mailboxId: gmailResult.mailboxId,
          source: input.source,
        }),
        salesCommunicationId: created.id,
      },
    });

    await tx.emailThreadLink.upsert({
      where: {
        mailboxId_providerThreadId: {
          mailboxId: gmailResult.mailboxId,
          providerThreadId: gmailResult.providerThreadId,
        },
      },
      update: {
        contactId: created.contactId,
        opportunityId: opportunity.id,
        source: "crm-send",
      },
      create: {
        contactId: created.contactId,
        mailboxId: gmailResult.mailboxId,
        opportunityId: opportunity.id,
        providerThreadId: gmailResult.providerThreadId,
        source: "crm-send",
      },
    });

    if (existingCommunication) {
      await tx.auditLog.create({
        data: {
          action: "gmail.send.reconciled",
          actorId: input.user.id,
          entity: "EmailMessage",
          entityId: claimedEmail.id,
          metadata: {
            mailboxId: gmailResult.mailboxId,
            opportunityId: opportunity.id,
            providerMessageId: gmailResult.messageId,
            salesCommunicationId: created.id,
          },
        },
      });
    }

    return created;
  });

  await markOpportunityFirstContacted(prisma, {
    opportunityId: opportunity.id,
    occurredAt: communication.occurredAt,
    userId: input.user.id,
    channel: "EMAIL",
    communicationId: communication.id,
    source: input.source,
  });

  await runSalesAutomationTrigger(prisma, {
    communicationId: communication.id,
    opportunityId: opportunity.id,
    salesPipelineStageId: opportunity.salesPipelineStageId,
    trigger: "EMAIL_SENT",
    userId: input.user.id,
    metadata: {
      provider,
      source: input.source,
    },
  });

  await bumpRealtimeTopics([
    realtimeTopics.saleConversation(opportunity.id),
    communication.contactId
      ? realtimeTopics.contactConversation(communication.contactId)
      : null,
  ]);

  return {
    communicationId: communication.id,
    messageId: externalId,
    recipient,
  };
}

export async function sendSalesLeadSms(input: SendSalesLeadSmsInput) {
  const opportunity = await prisma.salesOpportunity.findFirst({
    where: salesOpportunityIdAccessWhere(input.opportunityId, input.user),
    include: {
      company: true,
      contact: {
        include: {
          additionalEmails: {
            select: { email: true },
          },
          additionalPhones: {
            select: { phone: true, phoneNormalized: true },
          },
        },
      },
      owner: true,
    },
  });

  if (!opportunity) {
    throw new OutboundMessageAccessError("Lead not found or access denied.");
  }

  assertOpportunityContact({
    contactId: input.contactId,
    opportunityContactId: opportunity.contactId,
  });

  const recipient = normalizeCallableNumber(
    input.to ?? opportunity.contact?.phone ?? "",
  );

  if (!recipient) {
    throw new Error("This lead does not have a callable mobile number.");
  }

  assertAllowedSmsRecipient({
    contact: opportunity.contact,
    recipient,
    user: input.user,
  });

  const messageContext = await messageContextForOpportunity({
    opportunity,
    userId: input.user.id,
  });
  const body = personaliseOutboundMessage(input.body, messageContext);

  if (!body) {
    throw new Error("Message became empty after resolving placeholders.");
  }

  const runtime = getTwilioMessagingRuntime(await getStoredTwilioConfig());
  const statusCallback = new URL(
    "/api/webhooks/twilio/messaging",
    statusCallbackOrigin(input.statusCallbackBaseUrl ?? runtime.webhookBaseUrl),
  );
  const client = twilio(runtime.accountSid, runtime.authToken);
  const message = await client.messages.create({
    to: recipient,
    body,
    statusCallback: statusCallback.toString(),
    ...(runtime.messagingServiceSid
      ? { messagingServiceSid: runtime.messagingServiceSid }
      : { from: runtime.smsFromNumber }),
  });

  const communication = await prisma.salesCommunication.create({
    data: {
      opportunityId: opportunity.id,
      contactId: input.contactId ?? opportunity.contactId,
      userId: input.user.id,
      channel: "SMS",
      direction: "OUTBOUND",
      subject: "SMS sent",
      summary: messageSummary(body, 140),
      body,
      fromAddress: runtime.messagingServiceSid || runtime.smsFromNumber,
      toAddress: recipient,
      externalId: message.sid,
      metadata: {
        provider: "twilio",
        messageSid: message.sid,
        status: message.status,
        messagingServiceSid: runtime.messagingServiceSid || null,
        source: input.source,
      },
    },
    include: { contact: true, user: true },
  });

  await markOpportunityFirstContacted(prisma, {
    opportunityId: opportunity.id,
    occurredAt: communication.occurredAt,
    userId: input.user.id,
    channel: "SMS",
    communicationId: communication.id,
    source: input.source,
  });

  await runSalesAutomationTrigger(prisma, {
    communicationId: communication.id,
    opportunityId: opportunity.id,
    salesPipelineStageId: opportunity.salesPipelineStageId,
    trigger: "SMS_SENT",
    userId: input.user.id,
    metadata: {
      provider: "twilio",
      source: input.source,
    },
  });

  await bumpRealtimeTopics([
    realtimeTopics.saleConversation(opportunity.id),
    communication.contactId
      ? realtimeTopics.contactConversation(communication.contactId)
      : null,
  ]);

  return {
    communicationId: communication.id,
    recipient,
    status: message.status,
  };
}
