import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import twilio from "twilio";
import {
  getStoredTwilioConfig,
  getTwilioVoiceRuntime,
} from "@/lib/integrations/twilio-server";
import { prisma } from "@/lib/prisma";
import { bumpCallRealtimeTopics } from "@/lib/realtime/call-topics";
import { routingAttempts, updateRoutingAttempt } from "@/lib/telephony/call-routing";
import { resolveMissedCallTasksForSuccessfulCall } from "@/lib/telephony/twilio-voice";
import { verifyTwilioWebhookRequest } from "@/lib/telephony/twilio-webhooks";

const pendingAttemptStatuses = new Set(["queued", "initiated", "ringing", "connecting"]);
const terminalQueueStatuses = new Set(["ABANDONED", "COMPLETED", "MISSED"]);

function mapCallStatus(value: string) {
  if (!value) return null;
  if (value === "queued" || value === "initiated") return "QUEUED";
  if (value === "ringing") return "RINGING";
  if (value === "answered" || value === "in-progress") return "IN_PROGRESS";
  if (value === "completed") return "COMPLETED";
  if (value === "busy") return "BUSY";
  if (value === "no-answer") return "NO_ANSWER";
  if (value === "canceled") return "CANCELED";
  return "FAILED";
}

function isTerminalStatus(value: string | null) {
  return (
    value === "COMPLETED" ||
    value === "FAILED" ||
    value === "BUSY" ||
    value === "NO_ANSWER" ||
    value === "CANCELED"
  );
}

function jsonObject(metadata: Prisma.JsonValue | null | undefined) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return { ...(metadata as Prisma.JsonObject) } as Record<
    string,
    Prisma.InputJsonValue
  >;
}

function transferObject(metadata: Prisma.JsonValue | null | undefined) {
  const transfer = jsonObject(metadata).transfer;
  if (!transfer || typeof transfer !== "object" || Array.isArray(transfer)) {
    return null;
  }

  return transfer as Record<string, Prisma.InputJsonValue>;
}

async function cancelOtherAgentLegs({
  answeredAgentCallSid,
  metadata,
}: {
  answeredAgentCallSid: string;
  metadata: Prisma.JsonValue | null;
}) {
  const otherCallSids = routingAttempts(metadata)
    .map((attempt) => attempt.agentCallSid)
    .filter(
      (sid): sid is string => Boolean(sid && sid !== answeredAgentCallSid),
    );

  if (!otherCallSids.length) return;

  try {
    const runtime = getTwilioVoiceRuntime(await getStoredTwilioConfig());
    const client = twilio(runtime.accountSid, runtime.authToken);

    await Promise.all(
      otherCallSids.map(async (sid) => {
        try {
          const call = await client.calls(sid).fetch();
          if (["queued", "initiated", "ringing"].includes(call.status)) {
            await client.calls(sid).update({ status: "canceled" });
          }
        } catch (error) {
          const candidate = error as { code?: number; status?: number };
          if (candidate.code !== 20404 && candidate.status !== 404) {
            throw error;
          }
        }
      }),
    );
  } catch (error) {
    console.error("Unable to cancel unused agent call legs", error);
  }
}

async function cancelPendingAgentLegs(metadata: Prisma.JsonValue | null) {
  const pendingCallSids = routingAttempts(metadata)
    .filter((attempt) => pendingAttemptStatuses.has(attempt.status))
    .map((attempt) => attempt.agentCallSid)
    .filter((sid): sid is string => Boolean(sid));

  if (!pendingCallSids.length) return;

  try {
    const runtime = getTwilioVoiceRuntime(await getStoredTwilioConfig());
    const client = twilio(runtime.accountSid, runtime.authToken);

    await Promise.all(
      pendingCallSids.map(async (sid) => {
        try {
          const call = await client.calls(sid).fetch();
          if (["queued", "initiated", "ringing"].includes(call.status)) {
            await client.calls(sid).update({ status: "canceled" });
          }
        } catch (error) {
          const candidate = error as { code?: number; status?: number };
          if (candidate.code !== 20404 && candidate.status !== 404) {
            throw error;
          }
        }
      }),
    );
  } catch (error) {
    console.error("Unable to cancel pending agent call legs", error);
  }
}

function attemptedAgentUserIds(metadata: Prisma.JsonValue | null) {
  return Array.from(
    new Set(
      routingAttempts(metadata)
        .map((attempt) => attempt.agentUserId)
        .filter(Boolean),
    ),
  );
}

function markPendingAttemptsAbandoned(
  metadata: Prisma.JsonValue | null,
  endedAt: string,
) {
  let nextMetadata = jsonObject(metadata) as Prisma.InputJsonObject;

  for (const attempt of routingAttempts(metadata)) {
    if (!pendingAttemptStatuses.has(attempt.status)) {
      continue;
    }

    nextMetadata = updateRoutingAttempt(
      nextMetadata,
      {
        agentCallSid: attempt.agentCallSid,
        agentUserId: attempt.agentUserId,
      },
      { status: "abandoned", endedAt },
    );
  }

  return nextMetadata;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const verification = await verifyTwilioWebhookRequest(request, { formData });

  if (!verification.ok) {
    return verification.response;
  }

  const callLogId = request.nextUrl.searchParams.get("callLogId");
  const agentUserId = request.nextUrl.searchParams.get("agentUserId");
  const callSid = String(formData.get("CallSid") ?? "");
  const parentCallSid = String(formData.get("ParentCallSid") ?? "");
  const callStatus = String(formData.get("CallStatus") ?? "");
  const conferenceSid = String(formData.get("ConferenceSid") ?? "");
  const conferenceName = String(formData.get("FriendlyName") ?? "");
  const statusCallbackEvent = String(formData.get("StatusCallbackEvent") ?? "");
  const conferenceStatus = String(formData.get("ConferenceStatus") ?? "");
  const participantLabel = String(formData.get("ParticipantLabel") ?? "");
  const duration = Number(formData.get("CallDuration") ?? "");
  const recordingUrl = String(formData.get("RecordingUrl") ?? "");
  const nextStatus = mapCallStatus(callStatus);
  const isConferenceEvent = Boolean(statusCallbackEvent || conferenceStatus);
  const callerLeftConference =
    !agentUserId &&
    statusCallbackEvent === "participant-leave" &&
    participantLabel === "customer";
  const effectiveStatus = nextStatus;
  const now = new Date();

  if (!callLogId && !callSid && !parentCallSid && !conferenceSid && !conferenceName) {
    return NextResponse.json({ ok: true });
  }

  const existingCallLog = callLogId
    ? await prisma.callLog.findUnique({ where: { id: callLogId } })
    : null;
  const where: Prisma.CallLogWhereInput = callLogId
    ? { id: callLogId }
    : callSid
      ? { callSid }
      : parentCallSid
        ? { callSid: parentCallSid }
        : conferenceName
          ? { conferenceName }
          : { conferenceSid };
  const shouldUpdateCallLogStatus =
    !agentUserId ||
    effectiveStatus === "QUEUED" ||
    effectiveStatus === "RINGING" ||
    effectiveStatus === "IN_PROGRESS";

  if (effectiveStatus && shouldUpdateCallLogStatus) {
    await prisma.callLog.updateMany({
      where,
      data: {
        status: effectiveStatus,
        ...(agentUserId && effectiveStatus === "IN_PROGRESS"
          ? { userId: agentUserId }
          : {}),
        ...(existingCallLog?.callSid && callSid && existingCallLog.callSid !== callSid
          ? { parentCallSid: callSid }
          : parentCallSid
            ? { parentCallSid }
            : {}),
        ...(conferenceSid ? { conferenceSid } : {}),
        ...(Number.isFinite(duration) && duration > 0
          ? { durationSeconds: duration }
          : {}),
        ...(recordingUrl ? { recordingUrl } : {}),
        ...(effectiveStatus === "IN_PROGRESS" ? { answeredAt: now } : {}),
        ...(isTerminalStatus(effectiveStatus) ? { endedAt: now } : {}),
      },
    });

    if (effectiveStatus === "COMPLETED" && !agentUserId) {
      const completedCallLog = await prisma.callLog.findFirst({
        where,
        select: {
          callSid: true,
          fromNumber: true,
          toNumber: true,
          durationSeconds: true,
        },
      });

      if (completedCallLog) {
        await resolveMissedCallTasksForSuccessfulCall({
          callSid: completedCallLog.callSid,
          fromNumber: completedCallLog.fromNumber,
          toNumber: completedCallLog.toNumber,
          durationSeconds: completedCallLog.durationSeconds,
        });
      }
    }
  } else if (conferenceSid || conferenceName) {
    await prisma.callLog.updateMany({
      where: callLogId
        ? { id: callLogId }
        : conferenceName
          ? { conferenceName }
          : { conferenceSid },
      data: {
        ...(conferenceSid ? { conferenceSid } : {}),
      },
    });
    await bumpCallRealtimeTopics(existingCallLog);
  }

  if (agentUserId && effectiveStatus === "IN_PROGRESS") {
    const queueFilters = [
      callLogId ? { callLogId } : null,
      conferenceName ? { conferenceName } : null,
    ].filter(Boolean) as Array<{ callLogId: string } | { conferenceName: string }>;

    const queueEntries = queueFilters.length
      ? await prisma.callQueueEntry.findMany({
          where: { OR: queueFilters },
          select: { id: true, metadata: true },
        })
      : [];

    await Promise.all(
      queueEntries.map((entry) =>
        cancelOtherAgentLegs({
          answeredAgentCallSid: callSid,
          metadata: entry.metadata,
        }),
      ),
    );

    await prisma.$transaction([
      prisma.user.update({
        where: { id: agentUserId },
        data: { voiceAvailability: "BUSY", voiceLastSeenAt: now },
      }),
      ...(queueFilters.length
        ? [
            prisma.callQueueEntry.updateMany({
              where: { OR: queueFilters },
              data: {
                status: "ANSWERED",
                assignedUserId: agentUserId,
                answeredAt: now,
              },
            }),
          ]
        : []),
      ...(callLogId
        ? [
            prisma.callLog.update({
              where: { id: callLogId },
              data: {
                metadata: updateRoutingAttempt(
                  existingCallLog?.metadata,
                  { agentCallSid: callSid, agentUserId },
                  { status: "answered", answeredAt: now.toISOString() },
                ),
              },
            }),
          ]
        : []),
      ...queueEntries.map((entry) =>
        prisma.callQueueEntry.update({
          where: { id: entry.id },
          data: {
            metadata: updateRoutingAttempt(
              entry.metadata,
              { agentCallSid: callSid, agentUserId },
              { status: "answered", answeredAt: now.toISOString() },
            ),
          },
        }),
      ),
    ]);
  }

  if (agentUserId && isTerminalStatus(effectiveStatus)) {
    const queueFilters = [
      callLogId ? { callLogId } : null,
      conferenceName ? { conferenceName } : null,
    ].filter(Boolean) as Array<{ callLogId: string } | { conferenceName: string }>;
    const queueEntries = queueFilters.length
      ? await prisma.callQueueEntry.findMany({
          where: {
            OR: queueFilters,
            completedAt: null,
          },
          select: {
            id: true,
            status: true,
            assignedUserId: true,
            answeredAt: true,
            metadata: true,
          },
        })
      : [];
    const completedAfterAnswer =
      effectiveStatus === "COMPLETED" &&
      queueEntries.some(
        (entry) =>
          entry.assignedUserId === agentUserId &&
          (entry.status === "ANSWERED" || entry.answeredAt),
      );
    const transfer = transferObject(existingCallLog?.metadata);
    const sourceAgentCallSid =
      typeof transfer?.sourceAgentCallSid === "string"
        ? transfer.sourceAgentCallSid
        : null;
    const transferCallSid =
      typeof transfer?.transferCallSid === "string"
        ? transfer.transferCallSid
        : null;
    const isTransferSourceLeaving =
      effectiveStatus === "COMPLETED" &&
      transfer?.requestedByUserId === agentUserId &&
      Boolean(transferCallSid) &&
      (!sourceAgentCallSid || sourceAgentCallSid === callSid);

    if (isTransferSourceLeaving) {
      const nextMetadata = {
        ...jsonObject(existingCallLog?.metadata),
        transfer: {
          ...transfer,
          sourceLeftAt: now.toISOString(),
        },
      } as Prisma.InputJsonObject;

      await prisma.$transaction([
        prisma.user.update({
          where: { id: agentUserId },
          data: {
            voiceAvailability: "AVAILABLE",
            voiceLastSeenAt: now,
          },
        }),
        prisma.callLog.updateMany({
          where: callLogId
            ? { id: callLogId }
            : conferenceName
              ? { conferenceName }
              : { conferenceSid },
          data: { metadata: nextMetadata },
        }),
        ...queueEntries.map((entry) =>
          prisma.callQueueEntry.update({
            where: { id: entry.id },
            data: {
              metadata: updateRoutingAttempt(
                entry.metadata,
                { agentCallSid: callSid, agentUserId },
                { status: "transferred", endedAt: now.toISOString() },
              ),
            },
          }),
        ),
      ]);

      return NextResponse.json({ ok: true });
    }
    const terminalAttemptStatus =
      effectiveStatus === "COMPLETED" && !completedAfterAnswer
        ? "declined"
        : effectiveStatus.toLowerCase();
    const matchingAttempt = queueEntries
      .flatMap((entry) => routingAttempts(entry.metadata))
      .find((attempt) => attempt.agentCallSid === callSid);
    const attemptStartedAt = matchingAttempt?.startedAt
      ? Date.parse(matchingAttempt.startedAt)
      : Number.NaN;
    const instantNoAnswer =
      effectiveStatus === "NO_ANSWER" &&
      Number.isFinite(attemptStartedAt) &&
      now.getTime() - attemptStartedAt < 3000;
    const failedBrowserClientLeg =
      effectiveStatus === "FAILED" || instantNoAnswer;
    const attemptedAgent = failedBrowserClientLeg
      ? await prisma.user.findUnique({
          where: { id: agentUserId },
          select: { voiceRoutingMode: true },
        })
      : null;
    const agentAvailabilityUpdate =
      attemptedAgent &&
      (attemptedAgent.voiceRoutingMode === "BROWSER" ||
        attemptedAgent.voiceRoutingMode === "FLEX")
        ? {
            voiceAvailability: "OFFLINE" as const,
            voiceLastSeenAt: null,
          }
        : {
            voiceAvailability: "AVAILABLE" as const,
            voiceLastSeenAt: now,
          };
    await prisma.user.update({
      where: { id: agentUserId },
      data: agentAvailabilityUpdate,
    });

    if (queueFilters.length) {
      const assignedQueueEntries = queueEntries.filter(
        (entry) => entry.assignedUserId === agentUserId,
      );
      const shouldUpdateCallState =
        completedAfterAnswer || assignedQueueEntries.length > 0;

      await prisma.$transaction([
        ...(shouldUpdateCallState
          ? [
              prisma.callLog.updateMany({
                where: callLogId
                  ? { id: callLogId }
                  : conferenceName
                    ? { conferenceName }
                    : { conferenceSid },
                data: completedAfterAnswer
                  ? {
                      status: "COMPLETED",
                      userId: agentUserId,
                      endedAt: now,
                      metadata: updateRoutingAttempt(
                        existingCallLog?.metadata,
                        { agentCallSid: callSid, agentUserId },
                        { status: "completed", endedAt: now.toISOString() },
                      ),
                    }
                  : {
                      status: "QUEUED",
                      userId: null,
                      metadata: updateRoutingAttempt(
                        existingCallLog?.metadata,
                        { agentCallSid: callSid, agentUserId },
                        { status: terminalAttemptStatus, endedAt: now.toISOString() },
                      ),
                    },
              }),
            ]
          : []),
        ...assignedQueueEntries.map((entry) =>
          prisma.callQueueEntry.update({
            where: { id: entry.id },
            data: {
              ...(completedAfterAnswer
                ? { status: "COMPLETED" as const, completedAt: now }
                : { status: "WAITING" as const, assignedUserId: null }),
              metadata: updateRoutingAttempt(
                entry.metadata,
                { agentCallSid: callSid, agentUserId },
                { status: terminalAttemptStatus, endedAt: now.toISOString() },
              ),
            },
          }),
        ),
        ...queueEntries
          .filter((entry) => entry.assignedUserId !== agentUserId)
          .map((entry) =>
            prisma.callQueueEntry.update({
              where: { id: entry.id },
              data: {
                metadata: updateRoutingAttempt(
                  entry.metadata,
                  { agentCallSid: callSid, agentUserId },
                  { status: terminalAttemptStatus, endedAt: now.toISOString() },
                ),
              },
            }),
          ),
      ]);

      if (completedAfterAnswer) {
        const completedCallLog = await prisma.callLog.findFirst({
          where: callLogId
            ? { id: callLogId }
            : conferenceName
              ? { conferenceName }
              : { conferenceSid },
          select: {
            callSid: true,
            fromNumber: true,
            toNumber: true,
            durationSeconds: true,
          },
        });

        if (completedCallLog) {
          await resolveMissedCallTasksForSuccessfulCall({
            callSid: completedCallLog.callSid,
            fromNumber: completedCallLog.fromNumber,
            toNumber: completedCallLog.toNumber,
            durationSeconds: completedCallLog.durationSeconds,
          });
        }
      }
    }
  }

  if ((isTerminalStatus(effectiveStatus) && !agentUserId) || callerLeftConference) {
    const queueFilters = [
      callSid ? { callSid } : null,
      callLogId ? { callLogId } : null,
      conferenceName ? { conferenceName } : null,
    ].filter(Boolean) as Array<
      { callSid: string } | { callLogId: string } | { conferenceName: string }
    >;

    if (queueFilters.length && !isConferenceEvent) {
      const queueEntries = await prisma.callQueueEntry.findMany({
        where: { OR: queueFilters },
        select: {
          id: true,
          callSid: true,
        },
      });
      const callerQueueEntryIds = queueEntries
        .filter((entry) => entry.callSid === callSid)
        .map((entry) => entry.id);

      if (callerQueueEntryIds.length) {
        await prisma.callQueueEntry.updateMany({
          where: { id: { in: callerQueueEntryIds } },
          data: {
            status: "COMPLETED",
            completedAt: now,
          },
        });
      }
    }

    if (callerLeftConference && queueFilters.length) {
      const queueEntries = await prisma.callQueueEntry.findMany({
        where: {
          OR: queueFilters,
          completedAt: null,
        },
        select: {
          id: true,
          callSid: true,
          callLogId: true,
          status: true,
          assignedUserId: true,
          answeredAt: true,
          metadata: true,
          callLog: {
            select: {
              id: true,
              metadata: true,
            },
          },
        },
      });
      const callerQueueEntries = queueEntries.filter(
        (entry) =>
          entry.callSid === callSid &&
          !terminalQueueStatuses.has(entry.status),
      );

      if (callerQueueEntries.length) {
        await Promise.all(
          callerQueueEntries.map((entry) => cancelPendingAgentLegs(entry.metadata)),
        );

        const endedAt = now.toISOString();
        const attemptedUserIds = Array.from(
          new Set(callerQueueEntries.flatMap((entry) => attemptedAgentUserIds(entry.metadata))),
        );
        const answeredEntry = callerQueueEntries.find(
          (entry) => entry.status === "ANSWERED" || entry.answeredAt,
        );

        await prisma.$transaction([
          ...callerQueueEntries.map((entry) =>
            prisma.callQueueEntry.update({
              where: { id: entry.id },
              data: {
                status: answeredEntry ? "COMPLETED" : "ABANDONED",
                completedAt: now,
                assignedUserId: answeredEntry?.assignedUserId ?? null,
                metadata: markPendingAttemptsAbandoned(entry.metadata, endedAt),
              },
            }),
          ),
          ...Array.from(
            new Map(
              callerQueueEntries
                .filter((entry) => entry.callLogId)
                .map((entry) => [
                  entry.callLogId,
                  {
                    id: entry.callLogId as string,
                    metadata: entry.callLog?.metadata ?? null,
                  },
                ]),
            ).values(),
          ).map((callLog) =>
            prisma.callLog.update({
              where: { id: callLog.id },
              data: {
                status: answeredEntry ? "COMPLETED" : "CANCELED",
                userId: answeredEntry?.assignedUserId ?? null,
                endedAt: now,
                metadata: markPendingAttemptsAbandoned(callLog.metadata, endedAt),
              },
            }),
          ),
          ...(attemptedUserIds.length
            ? [
                prisma.user.updateMany({
                  where: { id: { in: attemptedUserIds } },
                  data: {
                    voiceAvailability: "AVAILABLE",
                    voiceLastSeenAt: now,
                  },
                }),
              ]
            : []),
        ]);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
