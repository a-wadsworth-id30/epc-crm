import twilio from "twilio";
import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { normalizeCallableNumber } from "@/lib/integrations/twilio-server";
import { prisma } from "@/lib/prisma";
import { bumpRealtimeTopics, realtimeTopics } from "@/lib/realtime/topics";
import { runSalesAutomationTrigger } from "@/lib/sales/automation";
import { verifyTwilioWebhookRequest } from "@/lib/telephony/twilio-webhooks";
import { findContactContext } from "@/lib/telephony/twilio-voice";

function messagingResponse() {
  const response = new twilio.twiml.MessagingResponse();

  return new Response(response.toString(), {
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
    },
  });
}

function mergeMetadata(
  metadata: Prisma.JsonValue | null | undefined,
  patch: Record<string, Prisma.InputJsonValue | null | undefined>,
): Prisma.InputJsonObject {
  const base: Record<string, Prisma.InputJsonValue> =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? ({ ...(metadata as Prisma.JsonObject) } as Record<
          string,
          Prisma.InputJsonValue
        >)
      : {};

  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined && value !== null) {
      base[key] = value;
    }
  }

  return base as Prisma.InputJsonObject;
}

function messageSummary(body: string) {
  const trimmed = body.trim().replace(/\s+/g, " ");
  return trimmed.length > 140 ? `${trimmed.slice(0, 137)}...` : trimmed;
}

function mediaFromFormData(formData: FormData) {
  const mediaCount = Number(formData.get("NumMedia") ?? "0");

  if (!Number.isFinite(mediaCount) || mediaCount <= 0) {
    return [];
  }

  return Array.from({ length: mediaCount }, (_, index) => ({
    url: String(formData.get(`MediaUrl${index}`) ?? ""),
    contentType: String(formData.get(`MediaContentType${index}`) ?? ""),
  })).filter((item) => item.url);
}

async function handleStatusCallback(formData: FormData) {
  const messageSid =
    String(formData.get("MessageSid") ?? "") ||
    String(formData.get("SmsSid") ?? "");
  const messageStatus =
    String(formData.get("MessageStatus") ?? "") ||
    String(formData.get("SmsStatus") ?? "");
  const errorCode = String(formData.get("ErrorCode") ?? "");
  const errorMessage = String(formData.get("ErrorMessage") ?? "");

  if (!messageSid || !messageStatus) {
    return NextResponse.json({ ok: true });
  }

  const communication = await prisma.salesCommunication.findFirst({
    where: { externalId: messageSid },
  });

  if (!communication) {
    return NextResponse.json({ ok: true });
  }

  await prisma.salesCommunication.update({
    where: { id: communication.id },
    data: {
      metadata: mergeMetadata(communication.metadata, {
        status: messageStatus,
        errorCode: errorCode || null,
        errorMessage: errorMessage || null,
        statusUpdatedAt: new Date().toISOString(),
      }),
    },
  });

  await bumpRealtimeTopics([
    realtimeTopics.saleConversation(communication.opportunityId),
    communication.contactId
      ? realtimeTopics.contactConversation(communication.contactId)
      : null,
  ]);

  return NextResponse.json({ ok: true });
}

async function handleInboundMessage(formData: FormData) {
  const messageSid =
    String(formData.get("MessageSid") ?? "") ||
    String(formData.get("SmsSid") ?? "");
  const from = normalizeCallableNumber(String(formData.get("From") ?? ""));
  const to = normalizeCallableNumber(String(formData.get("To") ?? ""));
  const body = String(formData.get("Body") ?? "").trim();
  const media = mediaFromFormData(formData);

  if (!messageSid || (!body && media.length === 0)) {
    return messagingResponse();
  }

  const existing = await prisma.salesCommunication.findFirst({
    where: { externalId: messageSid },
    select: { id: true },
  });

  if (existing) {
    return messagingResponse();
  }

  const { contact, opportunity } = await findContactContext(from);

  if (!opportunity) {
    return messagingResponse();
  }

  const communication = await prisma.salesCommunication.create({
    data: {
      opportunityId: opportunity.id,
      contactId: contact?.id ?? null,
      channel: "SMS",
      direction: "INBOUND",
      subject: "SMS received",
      summary: body ? messageSummary(body) : "Media message received",
      body: body || null,
      fromAddress: from,
      toAddress: to,
      externalId: messageSid,
      metadata: {
        provider: "twilio",
        messageSid,
        status: "received",
        media,
      },
    },
  });

  await runSalesAutomationTrigger(prisma, {
    communicationId: communication.id,
    opportunityId: opportunity.id,
    salesPipelineStageId: opportunity.salesPipelineStageId,
    trigger: "SMS_RECEIVED",
    metadata: {
      provider: "twilio",
      source: "twilio-inbound-sms",
    },
  });

  const realtimeContactId = contact?.id ?? opportunity.contactId ?? null;
  await bumpRealtimeTopics([
    realtimeTopics.saleConversation(opportunity.id),
    realtimeContactId ? realtimeTopics.contactConversation(realtimeContactId) : null,
  ]);

  return messagingResponse();
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const verification = await verifyTwilioWebhookRequest(request, { formData });

  if (!verification.ok) {
    return verification.response;
  }

  const body = String(formData.get("Body") ?? "").trim();
  const mediaCount = Number(formData.get("NumMedia") ?? "0");
  const hasInboundContent =
    Boolean(body) || (Number.isFinite(mediaCount) && mediaCount > 0);
  const hasInboundAddressing =
    Boolean(formData.get("From")) && Boolean(formData.get("To"));
  const hasStatus =
    formData.has("MessageStatus") ||
    formData.has("SmsStatus") ||
    formData.has("ErrorCode");

  if (hasInboundAddressing && hasInboundContent) {
    return handleInboundMessage(formData);
  }

  if (hasStatus) {
    return handleStatusCallback(formData);
  }

  return handleInboundMessage(formData);
}
