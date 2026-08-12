import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import {
  getMailerSendInboundSecret,
  mailerSendProvider,
  mailerSendWebhookTestSecret,
  verifyMailerSendSignature,
} from "@/lib/integrations/mailersend";
import {
  emailTextSummary,
  latestInboundEmailPlainText,
} from "@/lib/email/plain-text";
import { prisma } from "@/lib/prisma";
import { bumpRealtimeTopics, realtimeTopics } from "@/lib/realtime/topics";
import { runSalesAutomationTrigger } from "@/lib/sales/automation";

export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return value as Prisma.InputJsonValue;
}

function emailFromAddress(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}

function firstRecipientEmail(recipients: JsonRecord) {
  const to = asRecord(recipients.to);
  const toData = Array.isArray(to.data) ? to.data : [];
  const firstTo = asRecord(toData[0]);
  const rcptTo = Array.isArray(recipients.rcptTo) ? recipients.rcptTo : [];
  const firstRcpt = asRecord(rcptTo[0]);

  return (
    asString(firstTo.email) ||
    asString(firstRcpt.email) ||
    emailFromAddress(asString(to.raw))
  );
}

function parseDate(value: string) {
  const parsed = value ? new Date(value) : null;

  return parsed && Number.isFinite(parsed.getTime()) ? parsed : new Date();
}

async function findEmailLeadContext(fromAddress: string) {
  if (!fromAddress) return { contact: null, opportunity: null };

  const opportunity = await prisma.salesOpportunity.findFirst({
    where: {
      stage: { notIn: ["WON", "LOST"] },
      contact: {
        OR: [
          { email: { equals: fromAddress, mode: "insensitive" } },
          {
            additionalEmails: {
              some: { email: { equals: fromAddress, mode: "insensitive" } },
            },
          },
        ],
      },
    },
    include: { contact: true },
    orderBy: { updatedAt: "desc" },
  });

  if (opportunity) {
    return { contact: opportunity.contact, opportunity };
  }

  const contact = await prisma.contact.findFirst({
    where: {
      OR: [
        { email: { equals: fromAddress, mode: "insensitive" } },
        {
          additionalEmails: {
            some: { email: { equals: fromAddress, mode: "insensitive" } },
          },
        },
      ],
    },
    orderBy: { updatedAt: "desc" },
  });

  return { contact, opportunity: null };
}

async function signatureIsValid(
  body: string,
  signature: string | null,
  type: string,
) {
  const configuredSecret = await getMailerSendInboundSecret();

  if (
    type === "webhook.test" &&
    verifyMailerSendSignature({
      body,
      secret: mailerSendWebhookTestSecret,
      signature,
    })
  ) {
    return true;
  }

  return configuredSecret
    ? verifyMailerSendSignature({ body, secret: configuredSecret, signature })
    : false;
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("signature");
  let payload: JsonRecord;

  try {
    payload = JSON.parse(body) as JsonRecord;
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid JSON." },
      { status: 400 },
    );
  }

  const type = asString(payload.type);
  const validSignature = await signatureIsValid(body, signature, type);

  if (!validSignature) {
    return NextResponse.json(
      { ok: false, message: "Invalid MailerSend signature." },
      { status: 401 },
    );
  }

  if (type === "webhook.test") {
    return NextResponse.json({ ok: true });
  }

  if (type !== "inbound.message") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const data = asRecord(payload.data);
  const providerMessageId =
    asString(data.id) || asString(asRecord(data.headers)["Message-ID"]);

  if (providerMessageId) {
    const existing = await prisma.emailMessage.findUnique({
      where: { providerMessageId },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
  }

  const from = asRecord(data.from);
  const recipients = asRecord(data.recipients);
  const headers = asRecord(data.headers);
  const fromAddress = emailFromAddress(
    asString(from.email) || asString(from.raw),
  );
  const fromName = asString(from.name) || null;
  const toAddress = firstRecipientEmail(recipients) || null;
  const subject = asString(data.subject) || null;
  const textBody = asString(data.text) || null;
  const htmlBody = asString(data.html) || null;
  const rawMessage = asString(data.raw) || null;
  const receivedAt = parseDate(
    asString(data.date) || asString(data.created_at),
  );
  const plainBody = latestInboundEmailPlainText({
    fallback: subject,
    html: htmlBody,
    text: textBody,
  });
  const summary = emailTextSummary(plainBody || subject || "");
  const { contact, opportunity } = await findEmailLeadContext(fromAddress);
  const inboundId = asString(payload.inbound_id) || null;
  const headersJson = headers as Prisma.InputJsonObject;
  const salesMetadata: Prisma.InputJsonObject = {
    provider: mailerSendProvider,
    inboundId,
    providerMessageId: providerMessageId || null,
    headers: headersJson,
  };
  const emailMetadata: Prisma.InputJsonObject = {
    type,
    url: asString(payload.url) || null,
    createdAt: asString(payload.created_at) || null,
    spfCheck: asJson(data.spf_check) ?? null,
    dkimCheck:
      typeof data.dkim_check === "boolean"
        ? data.dkim_check
        : asString(data.dkim_check) || null,
    matchedLead: Boolean(opportunity),
  };

  const created = await prisma.$transaction(async (tx) => {
    const communication = opportunity
      ? await tx.salesCommunication.create({
          data: {
            opportunityId: opportunity.id,
            contactId: contact?.id ?? opportunity.contactId,
            channel: "EMAIL",
            direction: "INBOUND",
            subject: subject ?? "Email received",
            summary,
            body: plainBody || null,
            fromAddress,
            toAddress,
            externalId: providerMessageId || null,
            metadata: salesMetadata,
            occurredAt: receivedAt,
          },
        })
      : null;

    return tx.emailMessage.create({
      data: {
        provider: mailerSendProvider,
        providerMessageId: providerMessageId || null,
        inboundRouteId: inboundId,
        status: "UNREAD",
        direction: "INBOUND",
        fromName,
        fromAddress,
        toAddress,
        ccAddresses: asJson(asRecord(recipients).cc),
        subject,
        summary,
        textBody: plainBody || textBody,
        htmlBody,
        rawMessage,
        attachments: asJson(data.attachments),
        headers: asJson(headers),
        metadata: emailMetadata,
        receivedAt,
        contactId: contact?.id ?? opportunity?.contactId ?? null,
        opportunityId: opportunity?.id ?? null,
        salesCommunicationId: communication?.id ?? null,
      },
      select: { id: true, opportunityId: true, salesCommunicationId: true },
    });
  });

  if (created.opportunityId) {
    await runSalesAutomationTrigger(prisma, {
      communicationId: created.salesCommunicationId,
      opportunityId: created.opportunityId,
      salesPipelineStageId: opportunity?.salesPipelineStageId ?? null,
      trigger: "EMAIL_RECEIVED",
      metadata: {
        inboundId,
        provider: mailerSendProvider,
        source: "mailersend-inbound",
      },
    });
  }

  const realtimeContactId = contact?.id ?? opportunity?.contactId ?? null;
  await bumpRealtimeTopics([
    realtimeTopics.inbox,
    created.opportunityId
      ? realtimeTopics.saleConversation(created.opportunityId)
      : null,
    realtimeContactId ? realtimeTopics.contactConversation(realtimeContactId) : null,
  ]);

  return NextResponse.json({
    ok: true,
    id: created.id,
    matchedLead: Boolean(created.opportunityId),
  });
}
