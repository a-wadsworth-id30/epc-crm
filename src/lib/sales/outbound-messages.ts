import "server-only";

import twilio from "twilio";
import {
  getMailerSendInboundReplyAddress,
  sendMailerSendEmail,
} from "@/lib/integrations/mailersend";
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
  contactId?: string | null;
  opportunityId: string;
  source: string;
  subject: string;
  to?: string | null;
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

function statusCallbackOrigin(configuredBaseUrl?: string | null) {
  return (
    configuredBaseUrl?.replace(/\/$/, "") ||
    process.env.APP_BASE_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://crm.id30.com"
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

  const replyToEmail = await getMailerSendInboundReplyAddress();
  const result = await sendMailerSendEmail({
    subject,
    text: body,
    replyToEmail,
    to: {
      email: recipient,
      name: contactName(opportunity.contact),
    },
    tags: ["crm", "sales-lead"],
  });

  const communication = await prisma.salesCommunication.create({
    data: {
      opportunityId: opportunity.id,
      contactId: input.contactId ?? opportunity.contactId,
      userId: input.user.id,
      channel: "EMAIL",
      direction: "OUTBOUND",
      subject,
      summary: messageSummary(body),
      body,
      fromAddress: result.fromEmail,
      toAddress: recipient,
      externalId: result.messageId,
      metadata: {
        provider: "mailersend",
        fromEmail: result.fromEmail,
        messageId: result.messageId,
        replyToEmail: result.replyToEmail,
        statusCode: result.statusCode,
        source: input.source,
      },
    },
    include: { contact: true, user: true },
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
      provider: "mailersend",
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
    messageId: result.messageId,
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
