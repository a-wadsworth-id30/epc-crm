import twilio from "twilio";
import {
  getStoredTwilioConfig,
  getTwilioVoiceRuntime,
  normalizeCallableNumber,
} from "@/lib/integrations/twilio-server";
import { twilioRecordingSettingsSchema } from "@/lib/integrations/twilio";
import { prisma } from "@/lib/prisma";
import {
  attributionRecordMetadata,
  createAttributionRecord,
  findPhoneAttribution,
} from "@/lib/attribution/tracking";
import {
  conferenceNameFromCallSid,
  createMissedCallTask,
  createPhoneCommunication,
  displayUserName,
  findContactContext,
  twimlResponse,
  voiceIdentity,
  browserAvailabilityTtlMs,
  userIdFromClientIdentity,
  webhookOrigin,
} from "@/lib/telephony/twilio-voice";
import { verifyTwilioWebhookRequest } from "@/lib/telephony/twilio-webhooks";
import { resolveInboundRoute } from "@/lib/telephony/phone-system-routing";
import { appendRoutingTransition } from "@/lib/telephony/call-routing";
import {
  bumpCallRealtimeTopics,
  callRealtimeSelect,
} from "@/lib/realtime/call-topics";

function isBrowserOutbound(fromIdentity: string) {
  return fromIdentity.replace(/^client:/, "").startsWith("agent_");
}

const terminalCallStatuses = new Set([
  "completed",
  "failed",
  "busy",
  "no-answer",
  "canceled",
]);

async function callHasEnded(
  client: ReturnType<typeof twilio>,
  callSid: string,
) {
  try {
    const call = await client.calls(callSid).fetch();
    return terminalCallStatuses.has(call.status);
  } catch {
    return false;
  }
}

async function handleBrowserInternalCall(request: Request, formData: FormData) {
  const callSid = String(formData.get("CallSid") ?? "");
  const fromIdentity = String(formData.get("From") ?? "");
  const targetUserId = String(formData.get("InternalUserId") ?? "");
  const response = new twilio.twiml.VoiceResponse();

  try {
    const storedConfig = await getStoredTwilioConfig();
    const runtime = getTwilioVoiceRuntime(storedConfig);
    const callerUserId = userIdFromClientIdentity(fromIdentity);

    if (!callSid || !callerUserId || !targetUserId) {
      response.say("No internal call target was provided.");
      response.hangup();
      return twimlResponse(response.toString());
    }

    if (callerUserId === targetUserId) {
      response.say("You cannot call your own softphone.");
      response.hangup();
      return twimlResponse(response.toString());
    }

    const [caller, target] = await Promise.all([
      prisma.user.findUnique({
        where: { id: callerUserId },
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
          voiceExtension: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: targetUserId },
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
          status: true,
          voiceRoutingMode: true,
          voiceExtension: true,
          voiceAvailability: true,
          voiceLastSeenAt: true,
        },
      }),
    ]);

    const targetIsBrowserAgent =
      target?.status === "ACTIVE" &&
      target.voiceAvailability === "AVAILABLE" &&
      Boolean(target.voiceExtension) &&
      (target.voiceRoutingMode === "BROWSER" ||
        target.voiceRoutingMode === "FLEX") &&
      Boolean(
        target.voiceLastSeenAt &&
        Date.now() - target.voiceLastSeenAt.getTime() <=
          browserAvailabilityTtlMs,
      );

    if (!caller || !target || !targetIsBrowserAgent) {
      response.say("That agent is not available on their softphone.");
      response.hangup();
      return twimlResponse(response.toString());
    }

    const origin = webhookOrigin(request, runtime.webhookBaseUrl);
    const statusUrl = new URL("/api/webhooks/twilio/voice/status", origin);
    const callerName = displayUserName(caller);
    const targetName = displayUserName(target);
    const callerExtension = caller.voiceExtension ?? "";
    const targetExtension = target.voiceExtension ?? "";

    const callLog = await prisma.callLog.upsert({
      where: { callSid },
      update: {
        direction: "INTERNAL",
        status: "RINGING",
        fromIdentity,
        toIdentity: voiceIdentity(target.id),
        fromNumber: callerExtension || null,
        toNumber: targetExtension || null,
        userId: caller.id,
        metadata: {
          source: "softphone-internal",
          callerUserId: caller.id,
          callerName,
          callerExtension,
          targetUserId: target.id,
          targetName,
          targetExtension,
        },
      },
      create: {
        direction: "INTERNAL",
        status: "RINGING",
        callSid,
        fromIdentity,
        toIdentity: voiceIdentity(target.id),
        fromNumber: callerExtension || null,
        toNumber: targetExtension || null,
        userId: caller.id,
        recordingConsent: "NOT_REQUIRED",
        metadata: {
          source: "softphone-internal",
          callerUserId: caller.id,
          callerName,
          callerExtension,
          targetUserId: target.id,
          targetName,
          targetExtension,
        },
      },
      select: callRealtimeSelect(),
    });
    await bumpCallRealtimeTopics(callLog);

    statusUrl.searchParams.set("callLogId", callLog.id);

    await prisma.user.update({
      where: { id: caller.id },
      data: { voiceAvailability: "BUSY", voiceLastSeenAt: new Date() },
    });

    const dial = response.dial({
      answerOnBridge: true,
      timeout: 30,
    });
    const client = dial.client(
      {
        statusCallback: statusUrl.toString(),
        statusCallbackMethod: "POST",
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      },
      voiceIdentity(target.id),
    );

    client.parameter({ name: "CallLogId", value: callLog.id });
    client.parameter({ name: "InternalCall", value: "true" });
    client.parameter({ name: "CallerName", value: callerName });
    client.parameter({
      name: "CallerNumber",
      value: callerExtension ? `Ext ${callerExtension}` : "Internal call",
    });
    client.parameter({ name: "FromUserId", value: caller.id });
    client.parameter({ name: "From", value: callerExtension || callerName });
  } catch (error) {
    console.error("Twilio internal voice webhook failed", error);
    response.say("The internal softphone call could not be started.");
    response.hangup();
  }

  return twimlResponse(response.toString());
}

async function handleBrowserOutbound(request: Request, formData: FormData) {
  if (String(formData.get("InternalUserId") ?? "")) {
    return handleBrowserInternalCall(request, formData);
  }

  const to = normalizeCallableNumber(String(formData.get("To") ?? ""));
  const callSid = String(formData.get("CallSid") ?? "");
  const fromIdentity = String(formData.get("From") ?? "");
  const opportunityId = String(formData.get("OpportunityId") ?? "") || null;
  const contactId = String(formData.get("ContactId") ?? "") || null;
  const response = new twilio.twiml.VoiceResponse();

  try {
    const storedConfig = await getStoredTwilioConfig();
    const runtime = getTwilioVoiceRuntime(storedConfig);
    const recordingSettings = twilioRecordingSettingsSchema.parse(
      storedConfig?.recording ?? {},
    );

    if (!to || !callSid) {
      response.say("No destination number was provided.");
      response.hangup();
      return twimlResponse(response.toString());
    }

    const origin = webhookOrigin(request, runtime.webhookBaseUrl);
    const conferenceName = conferenceNameFromCallSid(callSid);
    const userId = userIdFromClientIdentity(fromIdentity);
    const restClient = twilio(runtime.accountSid, runtime.authToken);
    let callLog: {
      contactId: string | null;
      id: string;
      opportunityId: string | null;
    } | null = null;

    try {
      callLog = await prisma.callLog.upsert({
        where: { callSid },
        update: {
          status: "RINGING",
          toNumber: to,
          fromIdentity,
          conferenceName,
          userId,
          contactId,
          opportunityId,
        },
        create: {
          direction: "OUTBOUND",
          status: "RINGING",
          callSid,
          toNumber: to,
          fromNumber: runtime.voiceCallerId,
          fromIdentity,
          conferenceName,
          userId,
          contactId,
          opportunityId,
          recordingConsent: recordingSettings.enabled
            ? "CONSENTED"
            : "NOT_REQUIRED",
          metadata: {
            source: opportunityId ? "sale-softphone" : "softphone",
            recordingEnabled: recordingSettings.enabled,
            transcriptEnabled: recordingSettings.transcriptEnabled,
            aiAnalysisEnabled: recordingSettings.aiAnalysisEnabled,
            recordingRetentionDays: recordingSettings.retentionDays,
            recordingNotice: recordingSettings.notice,
          },
        },
        select: callRealtimeSelect(),
      });
      await bumpCallRealtimeTopics(callLog);

      if (userId) {
        await prisma.user.update({
          where: { id: userId },
          data: { voiceAvailability: "BUSY", voiceLastSeenAt: new Date() },
        });
      }
    } catch (callLogError) {
      console.error("Twilio outbound call logging failed", callLogError);
    }

    if (await callHasEnded(restClient, callSid)) {
      if (callLog?.id) {
        const canceledCallLog = await prisma.callLog.update({
          where: { id: callLog.id },
          data: { status: "CANCELED", endedAt: new Date() },
          select: callRealtimeSelect(),
        });
        await bumpCallRealtimeTopics(canceledCallLog);
      }

      response.hangup();
      return twimlResponse(response.toString());
    }

    await createPhoneCommunication({
      opportunityId,
      contactId,
      userId,
      direction: "OUTBOUND",
      subject: "Outbound phone call",
      summary: `Started an outbound phone call to ${to}.`,
      fromAddress: runtime.voiceCallerId,
      toAddress: to,
      externalId: callSid,
    });

    const conferenceUrl = new URL(
      "/api/webhooks/twilio/voice/conference",
      origin,
    );
    conferenceUrl.searchParams.set("conferenceName", conferenceName);
    conferenceUrl.searchParams.set("role", "customer");

    const statusUrl = new URL("/api/webhooks/twilio/voice/status", origin);
    const recordingStatusUrl = new URL(
      "/api/webhooks/twilio/voice/recording",
      origin,
    );
    if (callLog?.id) {
      conferenceUrl.searchParams.set("callLogId", callLog.id);
      statusUrl.searchParams.set("callLogId", callLog.id);
      recordingStatusUrl.searchParams.set("callLogId", callLog.id);
    }
    conferenceUrl.searchParams.set("statusCallbackUrl", statusUrl.toString());

    const outboundCall = await restClient.calls.create({
      to,
      from: runtime.voiceCallerId,
      url: conferenceUrl.toString(),
      method: "POST",
      statusCallback: statusUrl.toString(),
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    });

    if (callLog?.id) {
      const updatedCallLog = await prisma.callLog.update({
        where: { id: callLog.id },
        data: { parentCallSid: outboundCall.sid },
        select: callRealtimeSelect(),
      });
      await bumpCallRealtimeTopics(updatedCallLog);
    }

    if (await callHasEnded(restClient, callSid)) {
      await restClient.calls(outboundCall.sid).update({ status: "canceled" });

      if (callLog?.id) {
        const canceledCallLog = await prisma.callLog.update({
          where: { id: callLog.id },
          data: { status: "CANCELED", endedAt: new Date() },
          select: callRealtimeSelect(),
        });
        await bumpCallRealtimeTopics(canceledCallLog);
      }

      response.hangup();
      return twimlResponse(response.toString());
    }

    if (recordingSettings.enabled) {
      response.say(recordingSettings.notice);
    }
    const dial = response.dial();
    dial.conference(
      {
        startConferenceOnEnter: true,
        endConferenceOnExit: false,
        ...(recordingSettings.enabled
          ? {
              record: "record-from-start",
              recordingStatusCallback: recordingStatusUrl.toString(),
              recordingStatusCallbackEvent: ["completed"],
            }
          : {}),
        statusCallback: statusUrl.toString(),
        statusCallbackEvent: ["start", "end", "join", "leave"],
        participantLabel: "agent",
      },
      conferenceName,
    );
  } catch (error) {
    console.error("Twilio outbound voice webhook failed", error);
    response.say("The CRM softphone is not configured.");
    response.hangup();
  }

  return twimlResponse(response.toString());
}

async function handleInbound(request: Request, formData: FormData) {
  const response = new twilio.twiml.VoiceResponse();
  const callSid = String(formData.get("CallSid") ?? "");
  const fromNumber = normalizeCallableNumber(
    String(formData.get("From") ?? ""),
  );
  const toNumber = normalizeCallableNumber(String(formData.get("To") ?? ""));

  try {
    const storedConfig = await getStoredTwilioConfig();
    const runtime = getTwilioVoiceRuntime(storedConfig);
    const recordingSettings = twilioRecordingSettingsSchema.parse(
      storedConfig?.recording ?? {},
    );

    if (!callSid) {
      response.say("We could not identify this call.");
      response.hangup();
      return twimlResponse(response.toString());
    }

    const origin = webhookOrigin(request, runtime.webhookBaseUrl);
    const conferenceName = conferenceNameFromCallSid(callSid);
    const { contact, opportunity } = await findContactContext(fromNumber);
    const phoneAttribution = await findPhoneAttribution(toNumber);
    const attributionMetadata = phoneAttribution
      ? attributionRecordMetadata(phoneAttribution.attribution)
      : null;
    const attributionJson = attributionMetadata ?? undefined;
    const route = await resolveInboundRoute({
      contactId: contact?.id ?? null,
      fromNumber,
      opportunityId: opportunity?.id ?? null,
      opportunitySource: opportunity?.source ?? null,
      attribution: attributionJson ?? null,
      toNumber,
      trackingPhoneNumber: phoneAttribution?.trackingNumber.phoneNumber ?? null,
    });
    const preferredAgentUserId = opportunity?.ownerId ?? null;
    const routingRingStrategy =
      route.rule?.ringStrategy && route.rule.ringStrategy !== "QUEUE_DEFAULT"
        ? route.rule.ringStrategy
        : (route.queue?.ringStrategy ?? null);
    const statusUrl = new URL("/api/webhooks/twilio/voice/status", origin);
    const recordingStatusUrl = new URL(
      "/api/webhooks/twilio/voice/recording",
      origin,
    );
    const queueUrl = new URL("/api/webhooks/twilio/voice/queue", origin);
    queueUrl.searchParams.set("callSid", callSid);
    const inboundRoutingMetadata = appendRoutingTransition(
      {
        source: "twilio-inbound",
        attribution: attributionMetadata,
        trackingPhoneNumber:
          phoneAttribution?.trackingNumber.phoneNumber ?? null,
        trackingNumberAssignmentId: phoneAttribution?.assignment?.id ?? null,
        queueId: route.queue?.id ?? null,
        queueName: route.queue?.name ?? null,
        queueRingStrategy: route.queue?.ringStrategy ?? null,
        routingRuleId: route.rule?.id ?? null,
        routingRuleName: route.rule?.name ?? null,
        routingRuleRingStrategy: route.rule?.ringStrategy ?? null,
        routingRingStrategy,
        routingSource: route.routingSource,
        routingFlowNodeId: route.routingFlowNodeId,
        routingFlowNodeLabel: route.routingFlowNodeLabel,
        routingFlowNodeType: route.routingFlowNodeType,
        routingCurrentNodeId: route.routingFlowNodeId,
        routingCurrentNodeLabel: route.routingFlowNodeLabel,
        routingCurrentNodeType: route.routingFlowNodeType,
        preferredAgentUserId,
        preferredAgentReason: preferredAgentUserId ? "opportunity-owner" : null,
        afterHours: route.afterHours,
        recordingEnabled: recordingSettings.enabled,
        transcriptEnabled: recordingSettings.transcriptEnabled,
        aiAnalysisEnabled: recordingSettings.aiAnalysisEnabled,
        recordingRetentionDays: recordingSettings.retentionDays,
        recordingNotice: recordingSettings.notice,
      },
      {
        event: route.afterHours
          ? "after_hours_resolved"
          : "inbound_route_resolved",
        nodeId: route.routingFlowNodeId,
        nodeLabel: route.routingFlowNodeLabel,
        queueId: route.queue?.id ?? null,
        queueName: route.queue?.name ?? null,
        reason: route.routingSource,
        detail: route.rule?.name ?? route.queue?.name ?? null,
      },
    );

    const callLog = await prisma.callLog.upsert({
      where: { callSid },
      update: {
        status: "QUEUED",
        fromNumber,
        toNumber,
        conferenceName,
        contactId: contact?.id ?? null,
        opportunityId: opportunity?.id ?? null,
        attribution: attributionJson,
        metadata: inboundRoutingMetadata,
      },
      create: {
        direction: "INBOUND",
        status: "QUEUED",
        callSid,
        fromNumber,
        toNumber,
        conferenceName,
        contactId: contact?.id ?? null,
        opportunityId: opportunity?.id ?? null,
        attribution: attributionJson,
        recordingConsent: recordingSettings.enabled
          ? "CONSENTED"
          : "NOT_REQUIRED",
        metadata: inboundRoutingMetadata,
      },
      select: callRealtimeSelect(),
    });
    await bumpCallRealtimeTopics(callLog);

    statusUrl.searchParams.set("callLogId", callLog.id);
    recordingStatusUrl.searchParams.set("callLogId", callLog.id);

    await createPhoneCommunication({
      opportunityId: opportunity?.id,
      contactId: contact?.id,
      direction: "INBOUND",
      subject: "Inbound phone call",
      summary: `Inbound call received from ${fromNumber || "unknown number"}.`,
      fromAddress: fromNumber,
      toAddress: toNumber,
      externalId: callSid,
      metadata: {
        source: "twilio-inbound",
        attribution: attributionJson,
        trackingPhoneNumber:
          phoneAttribution?.trackingNumber.phoneNumber ?? null,
        trackingNumberAssignmentId: phoneAttribution?.assignment?.id ?? null,
        queueId: route.queue?.id ?? null,
        queueName: route.queue?.name ?? null,
        queueRingStrategy: route.queue?.ringStrategy ?? null,
        routingRuleId: route.rule?.id ?? null,
        routingRuleName: route.rule?.name ?? null,
        routingRuleRingStrategy: route.rule?.ringStrategy ?? null,
        routingRingStrategy,
        routingSource: route.routingSource,
        routingFlowNodeId: route.routingFlowNodeId,
        routingFlowNodeLabel: route.routingFlowNodeLabel,
        routingFlowNodeType: route.routingFlowNodeType,
        routingCurrentNodeId: route.routingFlowNodeId,
        routingCurrentNodeLabel: route.routingFlowNodeLabel,
        routingCurrentNodeType: route.routingFlowNodeType,
        preferredAgentUserId,
        preferredAgentReason: preferredAgentUserId ? "opportunity-owner" : null,
        afterHours: route.afterHours,
      },
    });

    if (
      route.afterHours &&
      route.config.businessHours.afterHours.destination !== "QUEUE"
    ) {
      if (route.config.businessHours.afterHours.createTask) {
        await createMissedCallTask({
          callSid,
          fromNumber,
          toNumber,
          contactId: contact?.id ?? null,
          opportunityId: opportunity?.id ?? null,
        });
      }

      if (recordingSettings.enabled) {
        response.say(recordingSettings.notice);
      }

      if (route.config.businessHours.afterHours.destination === "VOICEMAIL") {
        response.say(route.config.businessHours.afterHours.voicemailMessage);
        response.record({
          maxLength: 180,
          playBeep: true,
          recordingStatusCallback: recordingStatusUrl.toString(),
          recordingStatusCallbackEvent: ["completed"],
          trim: "trim-silence",
        });
      } else {
        response.say(route.config.businessHours.afterHours.voicemailMessage);
        response.hangup();
      }

      const updatedCallLog = await prisma.callLog.update({
        where: { id: callLog.id },
        data: {
          status:
            route.config.businessHours.afterHours.destination === "VOICEMAIL"
              ? "IN_PROGRESS"
              : "NO_ANSWER",
          endedAt:
            route.config.businessHours.afterHours.destination === "VOICEMAIL"
              ? null
              : new Date(),
        },
        select: callRealtimeSelect(),
      });
      await bumpCallRealtimeTopics(updatedCallLog);

      return twimlResponse(response.toString());
    }

    const queueEntry = await prisma.callQueueEntry.upsert({
      where: { callSid },
      update: {
        status: "WAITING",
        assignedUserId: null,
        callLogId: callLog.id,
        contactId: contact?.id ?? null,
        opportunityId: opportunity?.id ?? null,
        attribution: attributionJson,
        metadata: inboundRoutingMetadata,
      },
      create: {
        callSid,
        conferenceName,
        status: "WAITING",
        fromNumber,
        toNumber,
        assignedUserId: null,
        callLogId: callLog.id,
        contactId: contact?.id ?? null,
        opportunityId: opportunity?.id ?? null,
        attribution: attributionJson,
        metadata: inboundRoutingMetadata,
      },
      select: { id: true },
    });

    if (phoneAttribution) {
      await createAttributionRecord({
        source: "PHONE",
        attribution: phoneAttribution.attribution,
        attributionSnapshotId: phoneAttribution.snapshotId,
        trackingPhoneNumberId: phoneAttribution.trackingNumber.id,
        trackingPhoneNumber: phoneAttribution.trackingNumber.phoneNumber,
        contactId: contact?.id ?? null,
        opportunityId: opportunity?.id ?? null,
        callLogId: callLog.id,
        callQueueEntryId: queueEntry.id,
        metadata: {
          callSid,
          fromNumber,
          toNumber,
          trackingNumberAssignmentId: phoneAttribution.assignment?.id ?? null,
        },
      });
    }

    if (recordingSettings.enabled) {
      response.say(recordingSettings.notice);
    }
    response.say("Please hold while we find someone to help.");

    const dial = response.dial();
    dial.conference(
      {
        startConferenceOnEnter: false,
        endConferenceOnExit: true,
        waitUrl: queueUrl.toString(),
        ...(recordingSettings.enabled
          ? {
              record: "record-from-start",
              recordingStatusCallback: recordingStatusUrl.toString(),
              recordingStatusCallbackEvent: ["completed"],
            }
          : {}),
        statusCallback: statusUrl.toString(),
        statusCallbackEvent: ["start", "end", "join", "leave"],
        participantLabel: "customer",
      },
      conferenceName,
    );
  } catch (error) {
    console.error("Twilio inbound voice webhook failed", error);
    response.say("The CRM phone system is not available.");
    response.hangup();
  }

  return twimlResponse(response.toString());
}

export async function POST(request: Request) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    const verification = await verifyTwilioWebhookRequest(request);

    if (!verification.ok) {
      return verification.response;
    }

    return twimlResponse(new twilio.twiml.VoiceResponse().toString());
  }

  const verification = await verifyTwilioWebhookRequest(request, { formData });

  if (!verification.ok) {
    return verification.response;
  }

  const fromIdentity = String(formData.get("From") ?? "");

  if (isBrowserOutbound(fromIdentity)) {
    return handleBrowserOutbound(request, formData);
  }

  return handleInbound(request, formData);
}
