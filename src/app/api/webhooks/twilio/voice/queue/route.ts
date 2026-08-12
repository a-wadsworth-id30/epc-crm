import twilio from "twilio";
import type { Prisma } from "@prisma/client";
import { type NextRequest } from "next/server";
import {
  getStoredTwilioConfig,
  getTwilioVoiceRuntime,
} from "@/lib/integrations/twilio-server";
import { twilioRecordingSettingsSchema } from "@/lib/integrations/twilio";
import { prisma } from "@/lib/prisma";
import { bumpCallRealtimeTopics } from "@/lib/realtime/call-topics";
import {
  appendRoutingTransition,
  appendRoutingAttempt,
  createQueueAgentCall,
  jsonObject,
  routingAttempts,
  updateRoutingAttempt,
} from "@/lib/telephony/call-routing";
import {
  createMissedCallTask,
  createPhoneCommunication,
  queueMaxAttempts,
  twimlResponse,
  webhookOrigin,
} from "@/lib/telephony/twilio-voice";
import { verifyTwilioWebhookRequest } from "@/lib/telephony/twilio-webhooks";
import {
  findAvailableQueueAgents,
  resolveRoutingFlowRuntimeAction,
  type RoutingFlowRuntimeAction,
} from "@/lib/telephony/phone-system-routing";

type TwilioClient = ReturnType<typeof twilio>;
type IvrSayVoice = "alice" | "Polly.Amy" | "Polly.Brian" | "Polly.Emma";
type IvrSayLanguage = "en-GB" | "en-US" | "en-IE";

const queueHoldMusicUrl =
  "https://com.twilio.music.classical.s3.amazonaws.com/BusyStrings.mp3";
const terminalQueueStatuses = new Set(["ABANDONED", "COMPLETED", "MISSED"]);

function safeQueueError(error: unknown) {
  if (!error || typeof error !== "object") {
    return { message: "Unknown queue routing error." };
  }

  const candidate = error as {
    code?: string | number;
    status?: string | number;
    message?: string;
  };

  return {
    code: candidate.code ? String(candidate.code) : null,
    status: candidate.status ? String(candidate.status) : null,
    message: (candidate.message ?? "Queue routing failed.").slice(0, 500),
  };
}

function ivrSayVoice(value: string): IvrSayVoice {
  return value === "Polly.Amy" ||
    value === "Polly.Brian" ||
    value === "Polly.Emma"
    ? value
    : "alice";
}

function ivrSayLanguage(value: string): IvrSayLanguage {
  return value === "en-US" || value === "en-IE" ? value : "en-GB";
}

function completeCallShortly(client: TwilioClient | null, callSid: string) {
  if (!client || !callSid) return;

  const timeout = setTimeout(() => {
    client
      .calls(callSid)
      .update({ status: "completed" })
      .catch((error) => {
        const candidate = error as { code?: number; status?: number };

        if (candidate.code !== 20404 && candidate.status !== 404) {
          console.error("Unable to complete queued caller call", error);
        }
      });
  }, 2500);

  timeout.unref?.();
}

function redirectCallToVoicemailShortly({
  callSid,
  client,
  recordingNotice,
  recordingStatusUrl,
  voicemailMessage,
}: {
  callSid: string;
  client: TwilioClient | null;
  recordingNotice: string | null;
  recordingStatusUrl: string;
  voicemailMessage: string;
}) {
  if (!client || !callSid) return;

  const voicemailResponse = new twilio.twiml.VoiceResponse();

  if (recordingNotice) {
    voicemailResponse.say(recordingNotice);
  }

  voicemailResponse.say(voicemailMessage);
  voicemailResponse.record({
    maxLength: 180,
    playBeep: true,
    recordingStatusCallback: recordingStatusUrl,
    recordingStatusCallbackEvent: ["completed"],
    trim: "trim-silence",
  });
  voicemailResponse.say("We did not receive a message. Goodbye.");

  const timeout = setTimeout(() => {
    client
      .calls(callSid)
      .update({ twiml: voicemailResponse.toString() })
      .catch((error) => {
        const candidate = error as { code?: number; status?: number };

        if (candidate.code !== 20404 && candidate.status !== 404) {
          console.error("Unable to redirect queued caller to voicemail", error);
        }
      });
  }, 250);

  timeout.unref?.();
}

function terminalWaitUrlResponse({
  callSid,
  client,
  message,
  response,
}: {
  callSid: string;
  client: TwilioClient | null;
  message: string;
  response: twilio.twiml.VoiceResponse;
}) {
  response.say(message);
  response.pause({ length: 3 });
  completeCallShortly(client, callSid);

  return twimlResponse(response.toString());
}

function appendQueueHoldAudio({
  message,
  origin,
  queue,
  response,
}: {
  message?: string;
  origin: string;
  queue: { holdAudio?: string | null; overflowSeconds?: number | null } | null;
  response: twilio.twiml.VoiceResponse;
}) {
  if (message) {
    response.say(message);
  }

  if (queue?.holdAudio === "MUSIC") {
    response.play(queueHoldMusicUrl);
    return;
  }

  response.play(new URL("/api/twilio/voice/audio/ring", origin).toString());
}

function holdWaitUrl({
  message,
  origin,
  queue,
  redirectUrl,
  response,
}: {
  message?: string;
  origin: string;
  queue: { holdAudio?: string | null; overflowSeconds?: number | null } | null;
  redirectUrl?: string;
  response: twilio.twiml.VoiceResponse;
}) {
  appendQueueHoldAudio({ message, origin, queue, response });

  if (redirectUrl) {
    response.redirect({ method: "POST" }, redirectUrl);
  }

  return twimlResponse(response.toString());
}

function queueWaitUrl({
  attempt,
  callSid,
  origin,
}: {
  attempt?: number;
  callSid: string;
  origin: string;
}) {
  const url = new URL("/api/webhooks/twilio/voice/queue", origin);
  url.searchParams.set("callSid", callSid);

  if (typeof attempt === "number") {
    url.searchParams.set("attempt", String(attempt));
  }

  return url.toString();
}

function preferredMetadataForQueueEntry(queueEntry: {
  metadata: Prisma.JsonValue | null;
  opportunity?: { ownerId?: string | null } | null;
}): Prisma.InputJsonObject {
  const metadata = jsonObject(queueEntry.metadata);

  if (!metadata.preferredAgentUserId && queueEntry.opportunity?.ownerId) {
    return {
      ...metadata,
      preferredAgentUserId: queueEntry.opportunity.ownerId,
      preferredAgentReason: "opportunity-owner",
    } as Prisma.InputJsonObject;
  }

  return metadata as Prisma.InputJsonObject;
}

function latestRoutingAttempt(
  metadata: Prisma.JsonValue | Prisma.InputJsonObject | null,
) {
  return routingAttempts(metadata).at(-1) ?? null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function syncRuntimeMetadata(
  metadata: Prisma.JsonValue | Prisma.InputJsonObject | null | undefined,
  runtimeMetadata: Prisma.JsonValue | Prisma.InputJsonObject | null | undefined,
): Prisma.InputJsonObject {
  const runtime = jsonObject(runtimeMetadata);
  const runtimeKeys = [
    "queueId",
    "queueName",
    "queueRingStrategy",
    "routingRuleId",
    "routingRuleName",
    "routingRuleRingStrategy",
    "routingRingStrategy",
    "routingSource",
    "routingFlowNodeId",
    "routingFlowNodeLabel",
    "routingFlowNodeType",
    "routingCurrentNodeId",
    "routingCurrentNodeLabel",
    "routingCurrentNodeType",
    "routingFlowConditionResult",
    "routingFlowConsumedNodeIds",
    "routingFlowIvrDigit",
    "routingFlowIvrOptionLabel",
    "routingFlowIvrPromptCounts",
    "routingFlowIvrResult",
    "routingFlowPendingMessage",
    "routingFlowPendingNodeId",
    "routingFlowWaitUntil",
    "routingRuntimeActionKey",
    "fallbackDestination",
  ];

  return {
    ...jsonObject(metadata),
    ...Object.fromEntries(
      runtimeKeys
        .filter((key) => key in runtime)
        .map((key) => [key, runtime[key]]),
    ),
  } as Prisma.InputJsonObject;
}

function appendRuntimeActionTransition(
  metadata: Prisma.JsonValue | Prisma.InputJsonObject | null | undefined,
  action: RoutingFlowRuntimeAction,
): Prisma.InputJsonObject {
  const event =
    action.kind === "wait"
      ? "flow_wait"
      : action.kind === "queue"
        ? "flow_queue"
        : action.kind === "voicemail"
          ? "flow_voicemail"
          : action.kind === "end"
            ? "flow_end"
            : action.kind === "message"
              ? "flow_message"
              : action.kind === "ivr"
                ? "flow_ivr"
                : "flow_redirect";
  const actionKey = `${event}:${action.nodeId}`;
  const current = jsonObject(metadata);

  if (current.routingRuntimeActionKey === actionKey) {
    return current as Prisma.InputJsonObject;
  }

  return appendRoutingTransition(
    metadata,
    {
      event,
      nodeId: action.nodeId,
      nodeLabel: action.nodeLabel,
      queueId: action.kind === "queue" ? action.queue.id : null,
      queueName: action.kind === "queue" ? action.queue.name : null,
      reason: "routing-flow",
      detail:
        action.kind === "wait"
          ? `Waiting ${action.seconds} seconds before continuing.`
          : action.kind === "queue"
            ? `Routing to ${action.queue.name}.`
            : action.kind === "voicemail"
              ? "Routing to voicemail."
              : action.kind === "end"
                ? "Ending the call."
                : action.kind === "message"
                  ? "Playing an audio message."
                  : action.kind === "ivr"
                    ? "Collecting caller input."
                    : "Redirecting the caller.",
    },
    {
      routingRuntimeActionKey: actionKey,
    },
  );
}

async function persistRuntimeMetadata({
  callLogId,
  callLogMetadata,
  queueEntryId,
  queueMetadata,
  status = "WAITING",
}: {
  callLogId: string | null;
  callLogMetadata: Prisma.JsonValue | null | undefined;
  queueEntryId: string;
  queueMetadata: Prisma.InputJsonObject;
  status?: "WAITING" | "COMPLETED";
}) {
  const now = new Date();

  await prisma.$transaction([
    prisma.callQueueEntry.update({
      where: { id: queueEntryId },
      data: {
        status,
        assignedUserId: null,
        ...(status === "COMPLETED" ? { completedAt: now } : {}),
        metadata: queueMetadata,
      },
    }),
    ...(callLogId
      ? [
          prisma.callLog.update({
            where: { id: callLogId },
            data: {
              status: status === "COMPLETED" ? "IN_PROGRESS" : "QUEUED",
              userId: null,
              metadata: syncRuntimeMetadata(callLogMetadata, queueMetadata),
            },
          }),
        ]
      : []),
  ]);
}

function redirectCallToDestinationShortly({
  callSid,
  client,
  destination,
}: {
  callSid: string;
  client: TwilioClient | null;
  destination: string;
}) {
  if (!client || !callSid) return;

  const redirectResponse = new twilio.twiml.VoiceResponse();
  const dial = redirectResponse.dial();

  if (destination.startsWith("sip:")) {
    dial.sip(destination);
  } else {
    dial.number(destination);
  }

  const timeout = setTimeout(() => {
    client
      .calls(callSid)
      .update({ twiml: redirectResponse.toString() })
      .catch((error) => {
        const candidate = error as { code?: number; status?: number };

        if (candidate.code !== 20404 && candidate.status !== 404) {
          console.error("Unable to redirect queued caller", error);
        }
      });
  }, 250);

  timeout.unref?.();
}

async function cancelCallIfPending(client: TwilioClient, callSid: string) {
  try {
    const call = await client.calls(callSid).fetch();

    if (["queued", "initiated", "ringing"].includes(call.status)) {
      await client.calls(callSid).update({ status: "canceled" });
    }
  } catch (error) {
    const candidate = error as { code?: number; status?: number };

    if (candidate.code !== 20404 && candidate.status !== 404) {
      throw error;
    }
  }
}

export async function POST(request: NextRequest) {
  const response = new twilio.twiml.VoiceResponse();
  const callSid = request.nextUrl.searchParams.get("callSid") ?? "";
  const attempt = Number(request.nextUrl.searchParams.get("attempt") ?? "0");
  const formData = await request.formData().catch(() => null);

  if (!formData) {
    const verification = await verifyTwilioWebhookRequest(request);

    if (!verification.ok) {
      return verification.response;
    }

    response.say("We could not read this queued call request.");
    response.pause({ length: 1 });
    return twimlResponse(response.toString());
  }

  const verification = await verifyTwilioWebhookRequest(request, { formData });

  if (!verification.ok) {
    return verification.response;
  }

  const digits = formData ? String(formData.get("Digits") ?? "") : "";

  if (!callSid) {
    response.say("We could not identify this queued call.");
    response.pause({ length: 1 });
    return twimlResponse(response.toString());
  }

  const queueEntry = await prisma.callQueueEntry.findUnique({
    where: { callSid },
    include: {
      callLog: true,
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      opportunity: {
        select: {
          id: true,
          title: true,
          ownerId: true,
          source: true,
        },
      },
    },
  });

  if (!queueEntry) {
    response.say("This queued call is no longer available.");
    response.pause({ length: 1 });
    return twimlResponse(response.toString());
  }

  if (terminalQueueStatuses.has(queueEntry.status)) {
    response.say("This queued call has already ended.");
    response.pause({ length: 1 });
    return twimlResponse(response.toString());
  }

  await bumpCallRealtimeTopics(queueEntry.callLog);

  let restClient: TwilioClient | null = null;

  try {
    const storedConfig = await getStoredTwilioConfig();
    const runtime = getTwilioVoiceRuntime(storedConfig);
    const recordingSettings = twilioRecordingSettingsSchema.parse(
      storedConfig?.recording ?? {},
    );
    restClient = twilio(runtime.accountSid, runtime.authToken);
    const origin = webhookOrigin(request, runtime.webhookBaseUrl);
    const recordingStatusUrl = new URL(
      "/api/webhooks/twilio/voice/recording",
      origin,
    );

    if (queueEntry.callLogId) {
      recordingStatusUrl.searchParams.set("callLogId", queueEntry.callLogId);
    }

    let queueMetadata = preferredMetadataForQueueEntry(queueEntry);
    let forcedFlowAction: RoutingFlowRuntimeAction | null = null;
    const routingContext = {
      attribution: queueEntry.attribution,
      contactId: queueEntry.contactId,
      fromNumber: queueEntry.fromNumber,
      opportunityId: queueEntry.opportunityId,
      opportunitySource: queueEntry.opportunity?.source ?? null,
      toNumber: queueEntry.toNumber,
      trackingPhoneNumber:
        typeof jsonObject(queueMetadata).trackingPhoneNumber === "string"
          ? (jsonObject(queueMetadata).trackingPhoneNumber as string)
          : null,
    };
    const currentFlowAction = await resolveRoutingFlowRuntimeAction({
      context: routingContext,
      digits,
      metadata: queueMetadata,
      trigger: "current",
    });

    if (currentFlowAction) {
      queueMetadata = appendRuntimeActionTransition(
        currentFlowAction.metadata,
        currentFlowAction,
      );

      if (currentFlowAction.kind === "wait") {
        await persistRuntimeMetadata({
          callLogId: queueEntry.callLogId,
          callLogMetadata: queueEntry.callLog?.metadata,
          queueEntryId: queueEntry.id,
          queueMetadata,
        });

        return holdWaitUrl({
          message: "Please hold while we route your call.",
          origin,
          queue: null,
          redirectUrl: queueWaitUrl({ attempt, callSid, origin }),
          response,
        });
      }

      if (currentFlowAction.kind === "message") {
        await persistRuntimeMetadata({
          callLogId: queueEntry.callLogId,
          callLogMetadata: queueEntry.callLog?.metadata,
          queueEntryId: queueEntry.id,
          queueMetadata,
        });

        response.say(currentFlowAction.message);
        response.redirect(
          { method: "POST" },
          queueWaitUrl({ attempt, callSid, origin }),
        );
        return twimlResponse(response.toString());
      }

      if (currentFlowAction.kind === "ivr") {
        await persistRuntimeMetadata({
          callLogId: queueEntry.callLogId,
          callLogMetadata: queueEntry.callLog?.metadata,
          queueEntryId: queueEntry.id,
          queueMetadata,
        });

        const gather = response.gather({
          action: queueWaitUrl({ attempt, callSid, origin }),
          method: "POST",
          numDigits: 1,
          timeout: 6,
        });
        if (
          currentFlowAction.promptType === "AUDIO_URL" &&
          currentFlowAction.audioUrl?.startsWith("http")
        ) {
          gather.play(currentFlowAction.audioUrl);
        } else {
          gather.say(
            {
              language: ivrSayLanguage(currentFlowAction.language),
              voice: ivrSayVoice(currentFlowAction.voice),
            },
            currentFlowAction.prompt,
          );
        }
        response.say(
          {
            language: ivrSayLanguage(currentFlowAction.language),
            voice: ivrSayVoice(currentFlowAction.voice),
          },
          currentFlowAction.retryMessage,
        );
        response.redirect(
          { method: "POST" },
          queueWaitUrl({ attempt, callSid, origin }),
        );
        return twimlResponse(response.toString());
      }

      if (currentFlowAction.kind === "redirect") {
        await persistRuntimeMetadata({
          callLogId: queueEntry.callLogId,
          callLogMetadata: queueEntry.callLog?.metadata,
          queueEntryId: queueEntry.id,
          queueMetadata,
          status: "COMPLETED",
        });
        redirectCallToDestinationShortly({
          callSid,
          client: restClient,
          destination: currentFlowAction.destination,
        });

        response.say("Transferring your call now.");
        response.pause({ length: 6 });
        return twimlResponse(response.toString());
      }

      if (
        currentFlowAction.kind === "voicemail" ||
        currentFlowAction.kind === "end"
      ) {
        forcedFlowAction = currentFlowAction;
      }
    }

    let { agents, queue } = await findAvailableQueueAgents({
      metadata: queueMetadata,
    });
    const graphControlsFallback =
      jsonObject(queueMetadata).routingSource === "routing-flow";

    if (
      !graphControlsFallback &&
      !agents.length &&
      queue?.fallbackDestination === "QUEUE" &&
      queue.fallbackQueueId
    ) {
      const fallback = await findAvailableQueueAgents({
        metadata: queueMetadata,
        queueId: queue.fallbackQueueId,
      });

      agents = fallback.agents;
      queue = fallback.queue ?? queue;
    }

    if (forcedFlowAction) {
      agents = [];
    }

    if (queueEntry.status === "CONNECTING") {
      const latestAttempt = latestRoutingAttempt(queueMetadata);
      const latestStartedAt = latestAttempt?.startedAt
        ? Date.parse(latestAttempt.startedAt)
        : Number.NaN;
      const maxConnectSeconds = Math.max(
        10,
        Math.min(queue?.overflowSeconds ?? 25, 60),
      );
      const connectExpired =
        latestAttempt &&
        Number.isFinite(latestStartedAt) &&
        Date.now() - latestStartedAt > maxConnectSeconds * 1000;

      if (connectExpired) {
        if (latestAttempt.agentCallSid) {
          await cancelCallIfPending(restClient, latestAttempt.agentCallSid);
        }

        const endedAt = new Date().toISOString();
        const nextQueueAttemptMetadata = updateRoutingAttempt(
          queueMetadata,
          {
            agentCallSid: latestAttempt.agentCallSid,
            agentUserId: latestAttempt.agentUserId,
          },
          { status: "no-answer", endedAt },
        );
        const nextCallLogAttemptMetadata = updateRoutingAttempt(
          queueEntry.callLog?.metadata,
          {
            agentCallSid: latestAttempt.agentCallSid,
            agentUserId: latestAttempt.agentUserId,
          },
          { status: "no-answer", endedAt },
        );
        let transitionedQueueMetadata = appendRoutingTransition(
          nextQueueAttemptMetadata,
          {
            event: "agent_no_answer",
            nodeId: jsonObject(nextQueueAttemptMetadata)
              .routingCurrentNodeId as string | null,
            nodeLabel: jsonObject(nextQueueAttemptMetadata)
              .routingCurrentNodeLabel as string | null,
            queueId: queue?.id ?? null,
            queueName: queue?.name ?? null,
            agentUserId: latestAttempt.agentUserId,
            reason: "connect-timeout",
            detail: `${latestAttempt.agentName} did not answer before timeout.`,
          },
        );
        let transitionedCallLogMetadata = appendRoutingTransition(
          nextCallLogAttemptMetadata,
          {
            event: "agent_no_answer",
            nodeId: jsonObject(nextCallLogAttemptMetadata)
              .routingCurrentNodeId as string | null,
            nodeLabel: jsonObject(nextCallLogAttemptMetadata)
              .routingCurrentNodeLabel as string | null,
            queueId: queue?.id ?? null,
            queueName: queue?.name ?? null,
            agentUserId: latestAttempt.agentUserId,
            reason: "connect-timeout",
            detail: `${latestAttempt.agentName} did not answer before timeout.`,
          },
        );
        const nextFlowAction = await resolveRoutingFlowRuntimeAction({
          context: routingContext,
          metadata: transitionedQueueMetadata,
          trigger: "no_answer",
        });

        if (nextFlowAction) {
          transitionedQueueMetadata = appendRuntimeActionTransition(
            nextFlowAction.metadata,
            nextFlowAction,
          );
          transitionedCallLogMetadata = appendRuntimeActionTransition(
            syncRuntimeMetadata(
              transitionedCallLogMetadata,
              transitionedQueueMetadata,
            ),
            nextFlowAction,
          );
        }

        await prisma.$transaction([
          prisma.callQueueEntry.update({
            where: { id: queueEntry.id },
            data: {
              status: "WAITING",
              assignedUserId: null,
              metadata: transitionedQueueMetadata,
            },
          }),
          ...(latestAttempt.agentUserId
            ? [
                prisma.user.update({
                  where: { id: latestAttempt.agentUserId },
                  data: {
                    voiceAvailability: "AVAILABLE",
                    voiceLastSeenAt: new Date(),
                  },
                }),
              ]
            : []),
          ...(queueEntry.callLogId
            ? [
                prisma.callLog.update({
                  where: { id: queueEntry.callLogId },
                  data: {
                    status: "QUEUED",
                    userId: null,
                    metadata: transitionedCallLogMetadata,
                  },
                }),
              ]
            : []),
        ]);

        return holdWaitUrl({
          message:
            nextFlowAction?.kind === "wait"
              ? "Please hold while we route your call."
              : nextFlowAction?.kind === "voicemail"
                ? "Sorry, nobody is available right now. Please leave a message after the beep."
                : nextFlowAction?.kind === "message"
                  ? "Please listen for more information."
                  : undefined,
          origin,
          queue,
          redirectUrl: queueWaitUrl({ attempt, callSid, origin }),
          response,
        });
      }

      return holdWaitUrl({
        origin,
        queue,
        redirectUrl: queueWaitUrl({ attempt, callSid, origin }),
        response,
      });
    }

    if (queueEntry.status === "ANSWERED") {
      return holdWaitUrl({
        origin,
        queue,
        response,
      });
    }

    if (agents.length) {
      const createdCalls = [];

      for (const agent of agents) {
        createdCalls.push(
          await createQueueAgentCall({
            runtime,
            origin,
            queueEntry,
            agent,
            mode: "auto",
          }),
        );
      }

      const firstAgent = agents[0];
      const nextQueueMetadata = createdCalls.reduce<Prisma.InputJsonObject>(
        (metadata, created) =>
          appendRoutingAttempt(metadata, created.attempt, {
            agentCallSid: created.agentCall.sid,
            agentUserId: created.attempt.agentUserId,
            queueId: queue?.id ?? null,
            queueName: queue?.name ?? null,
          }),
        queueMetadata,
      );
      const nextCallLogMetadata = createdCalls.reduce<Prisma.InputJsonObject>(
        (metadata, created) =>
          appendRoutingAttempt(metadata, created.attempt, {
            agentCallSid: created.agentCall.sid,
            agentUserId: created.attempt.agentUserId,
            queueId: queue?.id ?? null,
            queueName: queue?.name ?? null,
          }),
        syncRuntimeMetadata(queueEntry.callLog?.metadata, queueMetadata),
      );
      const transitionedQueueMetadata = appendRoutingTransition(
        nextQueueMetadata,
        {
          event: "agent_invited",
          nodeId: jsonObject(nextQueueMetadata).routingCurrentNodeId as
            | string
            | null,
          nodeLabel: jsonObject(nextQueueMetadata).routingCurrentNodeLabel as
            | string
            | null,
          queueId: queue?.id ?? null,
          queueName: queue?.name ?? null,
          agentUserId: firstAgent?.id ?? null,
          reason: "available-agent",
          detail: `${createdCalls.length} agent${createdCalls.length === 1 ? "" : "s"} invited.`,
        },
      );
      const transitionedCallLogMetadata = appendRoutingTransition(
        nextCallLogMetadata,
        {
          event: "agent_invited",
          nodeId: jsonObject(nextCallLogMetadata).routingCurrentNodeId as
            | string
            | null,
          nodeLabel: jsonObject(nextCallLogMetadata).routingCurrentNodeLabel as
            | string
            | null,
          queueId: queue?.id ?? null,
          queueName: queue?.name ?? null,
          agentUserId: firstAgent?.id ?? null,
          reason: "available-agent",
          detail: `${createdCalls.length} agent${createdCalls.length === 1 ? "" : "s"} invited.`,
        },
      );
      await prisma.$transaction([
        prisma.callQueueEntry.update({
          where: { id: queueEntry.id },
          data: {
            status: "CONNECTING",
            assignedUserId: firstAgent?.id ?? null,
            metadata: transitionedQueueMetadata,
          },
        }),
        ...(queueEntry.callLogId
          ? [
              prisma.callLog.update({
                where: { id: queueEntry.callLogId },
                data: {
                  status: "RINGING",
                  userId: firstAgent?.id ?? null,
                  metadata: transitionedCallLogMetadata,
                },
              }),
            ]
          : []),
        ...agents.map((agent) =>
          prisma.user.update({
            where: { id: agent.id },
            data: { voiceAvailability: "BUSY", voiceLastSeenAt: new Date() },
          }),
        ),
      ]);

      return holdWaitUrl({
        message: "Connecting you now.",
        origin,
        queue,
        redirectUrl: queueWaitUrl({ attempt, callSid, origin }),
        response,
      });
    }

    if (!agents.length && graphControlsFallback && !forcedFlowAction) {
      const nextFlowAction = await resolveRoutingFlowRuntimeAction({
        context: routingContext,
        metadata: queueMetadata,
        trigger: "no_answer",
      });

      if (nextFlowAction) {
        queueMetadata = appendRuntimeActionTransition(
          nextFlowAction.metadata,
          nextFlowAction,
        );
        const syncedCallLogMetadata = appendRuntimeActionTransition(
          syncRuntimeMetadata(queueEntry.callLog?.metadata, queueMetadata),
          nextFlowAction,
        );

        await prisma.$transaction([
          prisma.callQueueEntry.update({
            where: { id: queueEntry.id },
            data: {
              status: "WAITING",
              assignedUserId: null,
              metadata: queueMetadata,
            },
          }),
          ...(queueEntry.callLogId
            ? [
                prisma.callLog.update({
                  where: { id: queueEntry.callLogId },
                  data: {
                    status: "QUEUED",
                    userId: null,
                    metadata: syncedCallLogMetadata,
                  },
                }),
              ]
            : []),
        ]);

        if (
          nextFlowAction.kind === "wait" ||
          nextFlowAction.kind === "queue" ||
          nextFlowAction.kind === "message" ||
          nextFlowAction.kind === "ivr"
        ) {
          return holdWaitUrl({
            message:
              nextFlowAction.kind === "wait"
                ? "Please hold while we route your call."
                : nextFlowAction.kind === "message"
                  ? "Please listen for more information."
                  : undefined,
            origin,
            queue:
              nextFlowAction.kind === "queue" ? nextFlowAction.queue : queue,
            redirectUrl: queueWaitUrl({ attempt, callSid, origin }),
            response,
          });
        }

        forcedFlowAction = nextFlowAction;
      }
    }

    const shouldEndFromFlow = forcedFlowAction?.kind === "end";
    const shouldVoicemailFromFlow = forcedFlowAction?.kind === "voicemail";
    const shouldFallbackImmediately =
      shouldEndFromFlow ||
      shouldVoicemailFromFlow ||
      routingAttempts(queueMetadata).length > 0 ||
      queue?.fallbackDestination === "VOICEMAIL";

    if (attempt >= queueMaxAttempts || shouldFallbackImmediately) {
      const task = shouldEndFromFlow
        ? null
        : await createMissedCallTask({
            callSid,
            fromNumber: queueEntry.fromNumber,
            toNumber: queueEntry.toNumber,
            contactId: queueEntry.contactId,
            opportunityId: queueEntry.opportunityId,
          });
      const shouldSendToVoicemail =
        shouldVoicemailFromFlow ||
        (!shouldEndFromFlow &&
          (queue?.fallbackDestination === "VOICEMAIL" ||
            shouldFallbackImmediately));

      await prisma.callQueueEntry.update({
        where: { id: queueEntry.id },
        data: {
          status: shouldEndFromFlow ? "COMPLETED" : "MISSED",
          missedAt: shouldEndFromFlow ? null : new Date(),
          metadata: appendRoutingTransition(
            queueMetadata,
            {
              event: shouldEndFromFlow
                ? "flow_end"
                : shouldSendToVoicemail
                  ? "fallback_voicemail"
                  : "fallback_missed_task",
              nodeId: jsonObject(queueMetadata).routingCurrentNodeId as
                | string
                | null,
              nodeLabel: jsonObject(queueMetadata).routingCurrentNodeLabel as
                | string
                | null,
              queueId: queue?.id ?? null,
              queueName: queue?.name ?? null,
              reason: shouldEndFromFlow ? "routing-flow" : "no-eligible-agents",
              detail: shouldEndFromFlow
                ? "The published routing flow ended the call."
                : shouldSendToVoicemail
                  ? "No eligible agents remained, so the caller was sent to voicemail."
                  : "No eligible agents remained, so a missed-call task was created.",
            },
            {
              fallbackDestination: shouldEndFromFlow
                ? "HANGUP"
                : shouldSendToVoicemail
                  ? "VOICEMAIL"
                  : "MISSED_CALL_TASK",
              missedTaskId: task?.id ?? null,
            },
          ),
        },
      });

      if (queueEntry.callLogId) {
        await prisma.callLog.update({
          where: { id: queueEntry.callLogId },
          data: {
            status: "NO_ANSWER",
            endedAt: new Date(),
            metadata: appendRoutingTransition(
              syncRuntimeMetadata(queueEntry.callLog?.metadata, queueMetadata),
              {
                event: shouldEndFromFlow
                  ? "flow_end"
                  : shouldSendToVoicemail
                    ? "fallback_voicemail"
                    : "fallback_missed_task",
                nodeId: stringOrNull(
                  jsonObject(queueEntry.callLog?.metadata).routingCurrentNodeId,
                ),
                nodeLabel: stringOrNull(
                  jsonObject(queueEntry.callLog?.metadata)
                    .routingCurrentNodeLabel,
                ),
                queueId: queue?.id ?? null,
                queueName: queue?.name ?? null,
                reason: shouldEndFromFlow
                  ? "routing-flow"
                  : "no-eligible-agents",
                detail: shouldEndFromFlow
                  ? "The published routing flow ended the call."
                  : shouldSendToVoicemail
                    ? "No eligible agents remained, so the caller was sent to voicemail."
                    : "No eligible agents remained, so a missed-call task was created.",
              },
            ),
          },
        });
      } else {
        await prisma.callLog.updateMany({
          where: { callSid },
          data: {
            status: "NO_ANSWER",
            endedAt: new Date(),
          },
        });
      }

      await createPhoneCommunication({
        opportunityId: queueEntry.opportunityId,
        contactId: queueEntry.contactId,
        direction: "INBOUND",
        subject: "Missed inbound call",
        summary: `No agent was available for the call from ${
          queueEntry.fromNumber ?? "unknown number"
        }.`,
        fromAddress: queueEntry.fromNumber,
        toAddress: queueEntry.toNumber,
        externalId: callSid,
      });

      if (shouldEndFromFlow) {
        return terminalWaitUrlResponse({
          callSid,
          client: restClient,
          message: "Goodbye.",
          response,
        });
      }

      if (shouldSendToVoicemail) {
        redirectCallToVoicemailShortly({
          callSid,
          client: restClient,
          recordingNotice: recordingSettings.enabled
            ? recordingSettings.notice
            : null,
          recordingStatusUrl: recordingStatusUrl.toString(),
          voicemailMessage:
            "Sorry, nobody is available right now. Please leave a message and we will call you back.",
        });

        response.say(
          "Sorry, nobody is available right now. Please leave a message after the beep.",
        );
        response.pause({ length: 6 });
        return twimlResponse(response.toString());
      }

      return terminalWaitUrlResponse({
        callSid,
        client: restClient,
        message:
          "Sorry, nobody is available right now. We will call you back shortly.",
        response,
      });
    }

    appendQueueHoldAudio({
      message: "All agents are currently busy. Please continue to hold.",
      origin,
      queue,
      response,
    });
    response.redirect(
      { method: "POST" },
      queueWaitUrl({ attempt: attempt + 1, callSid, origin }),
    );
  } catch (error) {
    const queueError = safeQueueError(error);

    console.error("Twilio voice queue failed", queueError);

    const now = new Date();
    await prisma.$transaction([
      prisma.callQueueEntry.update({
        where: { id: queueEntry.id },
        data: {
          status: "MISSED",
          missedAt: now,
          metadata: {
            ...appendRoutingTransition(queueEntry.metadata, {
              event: "queue_error",
              nodeId: stringOrNull(
                jsonObject(queueEntry.metadata).routingCurrentNodeId,
              ),
              nodeLabel: stringOrNull(
                jsonObject(queueEntry.metadata).routingCurrentNodeLabel,
              ),
              reason: "exception",
              detail: queueError.message,
            }),
            queueError,
            queueErrorAt: now.toISOString(),
          } as Prisma.InputJsonObject,
        },
      }),
      ...(queueEntry.callLogId
        ? [
            prisma.callLog.update({
              where: { id: queueEntry.callLogId },
              data: {
                status: "NO_ANSWER",
                endedAt: now,
                metadata: {
                  ...appendRoutingTransition(queueEntry.callLog?.metadata, {
                    event: "queue_error",
                    nodeId: stringOrNull(
                      jsonObject(queueEntry.callLog?.metadata)
                        .routingCurrentNodeId,
                    ),
                    nodeLabel: stringOrNull(
                      jsonObject(queueEntry.callLog?.metadata)
                        .routingCurrentNodeLabel,
                    ),
                    reason: "exception",
                    detail: queueError.message,
                  }),
                  queueError,
                  queueErrorAt: now.toISOString(),
                } as Prisma.InputJsonObject,
              },
            }),
          ]
        : []),
    ]);

    return terminalWaitUrlResponse({
      callSid,
      client: restClient,
      message: "The phone queue is not available.",
      response,
    });
  }

  return twimlResponse(response.toString());
}
