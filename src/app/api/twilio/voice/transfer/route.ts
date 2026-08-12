import twilio from "twilio";
import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import {
  getStoredTwilioConfig,
  getTwilioVoiceRuntime,
  normalizeCallableNumber,
} from "@/lib/integrations/twilio-server";
import { prisma } from "@/lib/prisma";
import { requireBrowserSoftphoneUser } from "@/lib/telephony/authorization";
import {
  contactDisplayName,
  jsonObject,
  withClientCallContext,
} from "@/lib/telephony/call-routing";
import {
  buildConferenceTwiML,
  targetForUser,
} from "@/lib/telephony/twilio-voice";

export async function POST(request: Request) {
  const authorization = await requireBrowserSoftphoneUser();

  if (!authorization.ok) {
    return authorization.response;
  }

  const currentUser = authorization.user;
  const payload = (await request.json()) as {
    targetUserId?: string;
    transferType?: "warm" | "cold";
    targetNumber?: string;
    opportunityId?: string | null;
    contactId?: string | null;
  };

  const targetUser = payload.targetUserId
    ? await prisma.user.findUnique({
        where: { id: payload.targetUserId },
        select: {
          id: true,
          name: true,
          mobile: true,
          landline: true,
          sipAddress: true,
          voiceExtension: true,
          voiceRoutingMode: true,
        },
      })
    : null;
  const transferTarget = targetUser
    ? targetForUser(targetUser)
    : normalizeCallableNumber(payload.targetNumber ?? "");

  if (!transferTarget) {
    return NextResponse.json(
      { error: "Choose a staff member with a browser extension, SIP address or callable number." },
      { status: 400 },
    );
  }

  const activeCall = await prisma.callLog.findFirst({
    where: {
      userId: currentUser.id,
      status: { in: ["QUEUED", "RINGING", "IN_PROGRESS"] },
      ...(payload.opportunityId ? { opportunityId: payload.opportunityId } : {}),
      ...(payload.contactId ? { contactId: payload.contactId } : {}),
    },
    orderBy: { startedAt: "desc" },
    include: {
      contact: { select: { firstName: true, lastName: true } },
      opportunity: { select: { title: true } },
    },
  });

  if (!activeCall?.conferenceName) {
    return NextResponse.json(
      { error: "No active conference-backed call was found for transfer." },
      { status: 400 },
    );
  }

  const runtime = getTwilioVoiceRuntime(await getStoredTwilioConfig());
  const restClient = twilio(runtime.accountSid, runtime.authToken);
  const origin =
    runtime.webhookBaseUrl ||
    process.env.APP_BASE_URL ||
    new URL(request.url).origin;
  const statusUrl = new URL("/api/webhooks/twilio/voice/status", origin);
  statusUrl.searchParams.set("callLogId", activeCall.id);
  if (targetUser?.id) {
    statusUrl.searchParams.set("agentUserId", targetUser.id);
  }
  const conferences = await restClient.conferences.list({
    friendlyName: activeCall.conferenceName,
    status: "in-progress",
    limit: 1,
  });
  const conference = conferences[0];

  if (!conference?.sid) {
    return NextResponse.json(
      { error: "The active conference was not found." },
      { status: 400 },
    );
  }

  if (payload.transferType === "warm" && activeCall.parentCallSid) {
    await restClient
      .conferences(conference.sid)
      .participants(activeCall.parentCallSid)
      .update({ hold: true });
  }

  const transferRecord = {
    type: payload.transferType ?? "warm",
    targetUserId: targetUser?.id ?? null,
    targetName: targetUser?.name ?? null,
    target: transferTarget,
    requestedByUserId: currentUser.id,
    requestedAt: new Date().toISOString(),
    sourceAgentCallSid: activeCall.parentCallSid ?? null,
  };
  const transferTo = targetUser
    ? withClientCallContext(transferTarget, {
        CallerNumber: activeCall.fromNumber,
        CallerName: contactDisplayName(activeCall.contact),
        ContactId: activeCall.contactId,
        OpportunityId: activeCall.opportunityId,
        OpportunityName: activeCall.opportunity?.title,
        CallLogId: activeCall.id,
        OriginalCallSid: activeCall.callSid,
      })
    : transferTarget;

  const transferCall = await restClient.calls.create({
    to: transferTo,
    from: runtime.voiceCallerId,
    twiml: buildConferenceTwiML({
      conferenceName: activeCall.conferenceName,
      statusUrl: statusUrl.toString(),
      participantLabel: targetUser ? `agent-${targetUser.id}` : undefined,
    }),
    statusCallback: statusUrl.toString(),
    statusCallbackMethod: "POST",
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
  });
  const existingMetadata = jsonObject(activeCall.metadata);
  const transferWithSid = {
    ...transferRecord,
    transferCallSid: transferCall.sid,
  } satisfies Prisma.InputJsonObject;
  const previousTransfers = Array.isArray(existingMetadata.transfers)
    ? existingMetadata.transfers
    : [];

  await prisma.callLog.update({
    where: { id: activeCall.id },
    data: {
      metadata: {
        ...existingMetadata,
        transfer: transferWithSid,
        transfers: [...previousTransfers, transferWithSid],
      },
    },
  });

  return NextResponse.json({
    ok: true,
    transferCallSid: transferCall.sid,
    warmTransferActive: payload.transferType === "warm",
    message:
      payload.transferType === "cold"
        ? "Cold transfer started."
        : "Customer is on hold. Brief the new agent, then leave the call.",
  });
}
