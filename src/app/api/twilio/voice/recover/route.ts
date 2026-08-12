import twilio from "twilio";
import type { CallStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import {
  getStoredTwilioConfig,
  getTwilioVoiceRuntime,
} from "@/lib/integrations/twilio-server";
import { prisma } from "@/lib/prisma";
import { requireBrowserSoftphoneUser } from "@/lib/telephony/authorization";

const terminalStatuses = new Set([
  "completed",
  "failed",
  "busy",
  "no-answer",
  "canceled",
]);

const cancelableStatuses = new Set(["queued", "ringing", "initiated"]);
const staleQueuedOrRingingMs = 15 * 60 * 1000;
const staleInProgressMs = 8 * 60 * 60 * 1000;
const activeCallInclude = {
  queueEntries: {
    orderBy: { queuedAt: "desc" },
    take: 1,
  },
} as const;

type ActiveRecoverCall = Prisma.CallLogGetPayload<{
  include: typeof activeCallInclude;
}>;

function mapTerminalCallStatus(value: string) {
  if (value === "busy") return "BUSY";
  if (value === "no-answer") return "NO_ANSWER";
  if (value === "canceled") return "CANCELED";
  if (value === "failed") return "FAILED";
  return "COMPLETED";
}

function staleActiveReason(call: ActiveRecoverCall) {
  const ageMs = Date.now() - call.startedAt.getTime();

  if ((call.status === "QUEUED" || call.status === "RINGING") && ageMs > staleQueuedOrRingingMs) {
    return "stale-ringing-call";
  }

  if (call.status === "IN_PROGRESS" && ageMs > staleInProgressMs) {
    return "stale-in-progress-call";
  }

  return null;
}

function metadataString(
  metadata: Prisma.JsonValue | null | undefined,
  key: string,
) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Prisma.JsonObject)[key];
  return typeof value === "string" ? value : null;
}

function transferMetadata(
  metadata: Prisma.JsonValue | null | undefined,
): Prisma.JsonObject | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Prisma.JsonObject).transfer;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Prisma.JsonObject;
}

async function endTwilioCall(
  client: ReturnType<typeof twilio>,
  sid: string | null | undefined,
) {
  if (!sid) {
    return;
  }

  try {
    const call = await client.calls(sid).fetch();

    if (terminalStatuses.has(call.status)) {
      return;
    }

    await client.calls(sid).update({
      status: cancelableStatuses.has(call.status) ? "canceled" : "completed",
    });
  } catch (error) {
    const candidate = error as { code?: number; status?: number };

    if (candidate.code === 20404 || candidate.status === 404) {
      return;
    }

    throw error;
  }
}

async function completeTwilioConference(
  client: ReturnType<typeof twilio>,
  sid: string | null | undefined,
) {
  if (!sid) {
    return;
  }

  try {
    await client.conferences(sid).update({ status: "completed" });
  } catch (error) {
    const candidate = error as { code?: number; status?: number };

    if (candidate.code === 20404 || candidate.status === 404) {
      return;
    }

    throw error;
  }
}

async function completeRecoverCall({
  activeCall,
  client,
  terminalCallStatus = "completed",
  userId,
}: {
  activeCall: ActiveRecoverCall;
  client: ReturnType<typeof twilio>;
  terminalCallStatus?: string;
  userId: string;
}) {
  if (activeCall.conferenceSid) {
    await completeTwilioConference(client, activeCall.conferenceSid);
  } else if (activeCall.conferenceName) {
    const conferences = await client.conferences.list({
      friendlyName: activeCall.conferenceName,
      status: "in-progress",
      limit: 1,
    });

    await completeTwilioConference(client, conferences[0]?.sid);
  }

  const queueEntry = activeCall.queueEntries[0];
  const agentCallSid =
    metadataString(queueEntry?.metadata, "agentCallSid") ??
    metadataString(activeCall.metadata, "agentCallSid");

  await endTwilioCall(client, activeCall.parentCallSid);
  await endTwilioCall(client, activeCall.callSid);
  await endTwilioCall(client, agentCallSid);

  await prisma.$transaction([
    prisma.callLog.update({
      where: { id: activeCall.id },
      data: {
        status: mapTerminalCallStatus(terminalCallStatus),
        endedAt: new Date(),
      },
    }),
    prisma.callQueueEntry.updateMany({
      where: { callLogId: activeCall.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { voiceAvailability: "AVAILABLE", voiceLastSeenAt: new Date() },
    }),
  ]);
}

export async function POST(request: Request) {
  const authorization = await requireBrowserSoftphoneUser();

  if (!authorization.ok) {
    return authorization.response;
  }

  const user = authorization.user;
  const payload = (await request.json().catch(() => ({}))) as {
    callLogId?: string | null;
    callSid?: string | null;
  };
  const liveStatuses: CallStatus[] = ["QUEUED", "RINGING", "IN_PROGRESS"];
  const liveStatusFilter = { in: liveStatuses };
  let activeCall: ActiveRecoverCall | null = null;

  if (payload.callLogId) {
    activeCall = await prisma.callLog.findFirst({
      where: {
        id: payload.callLogId,
        status: liveStatusFilter,
        OR: [
          { userId: user.id },
          {
            metadata: {
              path: ["transfer", "targetUserId"],
              equals: user.id,
            },
          },
          {
            direction: "INTERNAL",
            metadata: {
              path: ["targetUserId"],
              equals: user.id,
            },
          },
        ],
      },
      include: activeCallInclude,
    });
  }

  activeCall ??= await prisma.callLog.findFirst({
    where: {
      userId: user.id,
      status: liveStatusFilter,
    },
    orderBy: { startedAt: "desc" },
    include: activeCallInclude,
  });

  activeCall ??= await prisma.callLog.findFirst({
    where: {
      status: liveStatusFilter,
      metadata: {
        path: ["transfer", "targetUserId"],
        equals: user.id,
      },
    },
    orderBy: { startedAt: "desc" },
    include: activeCallInclude,
  });

  activeCall ??= await prisma.callLog.findFirst({
    where: {
      direction: "INTERNAL",
      status: liveStatusFilter,
      metadata: {
        path: ["targetUserId"],
        equals: user.id,
      },
    },
    orderBy: { startedAt: "desc" },
    include: activeCallInclude,
  });

  if (!activeCall) {
    await prisma.user.update({
      where: { id: user.id },
      data: { voiceAvailability: "AVAILABLE", voiceLastSeenAt: new Date() },
    });

    return NextResponse.json({ active: false });
  }

  try {
    const runtime = getTwilioVoiceRuntime(await getStoredTwilioConfig());
    const client = twilio(runtime.accountSid, runtime.authToken);
    const staleReason = staleActiveReason(activeCall);

    if (staleReason) {
      await completeRecoverCall({
        activeCall,
        client,
        terminalCallStatus: "completed",
        userId: user.id,
      });

      return NextResponse.json({
        active: false,
        recovered: true,
        reason: staleReason,
      });
    }

    if (activeCall.conferenceName) {
      const conferences = await client.conferences.list({
        friendlyName: activeCall.conferenceName,
        status: "in-progress",
        limit: 1,
      });

      if (conferences[0]) {
        return NextResponse.json({
          active: true,
          callLogId: activeCall.id,
          conferenceName: activeCall.conferenceName,
        });
      }
    }

    let terminalCallStatus = "completed";
    const transfer = transferMetadata(activeCall.metadata);
    const transferCallSid =
      typeof transfer?.transferCallSid === "string"
        ? transfer.transferCallSid
        : null;
    const callSidToCheck =
      payload.callSid && payload.callSid === transferCallSid
        ? payload.callSid
        : activeCall.callSid;

    if (callSidToCheck) {
      const call = await client.calls(callSidToCheck).fetch();

      if (!terminalStatuses.has(call.status)) {
        return NextResponse.json({
          active: true,
          callLogId: activeCall.id,
          callSid: callSidToCheck,
        });
      }

      terminalCallStatus = call.status;
    }

    await completeRecoverCall({
      activeCall,
      client,
      terminalCallStatus,
      userId: user.id,
    });

    return NextResponse.json({ active: false });
  } catch (error) {
    console.error("Twilio voice recovery failed", error);
    return NextResponse.json({
      active: true,
      uncertain: true,
      callLogId: activeCall.id,
    });
  }
}
