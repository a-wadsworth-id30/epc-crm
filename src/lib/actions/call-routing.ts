"use server";

import twilio from "twilio";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  getStoredTwilioConfig,
  getTwilioVoiceRuntime,
} from "@/lib/integrations/twilio-server";
import { prisma } from "@/lib/prisma";
import {
  appendRoutingAttempt,
  createQueueAgentCall,
  metadataString,
} from "@/lib/telephony/call-routing";
import {
  browserAvailabilityTtlMs,
  targetForUser,
} from "@/lib/telephony/twilio-voice";

type CallRoutingActionState = {
  ok: boolean;
  message: string;
  savedAt: number | null;
};

const cancelableCallStatuses = new Set(["queued", "ringing", "initiated"]);
const terminalCallStatuses = new Set([
  "completed",
  "failed",
  "busy",
  "no-answer",
  "canceled",
]);

function hasFreshBrowserPresence(agent: {
  voiceRoutingMode: string;
  voiceLastSeenAt: Date | null;
}) {
  if (agent.voiceRoutingMode !== "BROWSER" && agent.voiceRoutingMode !== "FLEX") {
    return true;
  }

  return Boolean(
    agent.voiceLastSeenAt &&
      Date.now() - agent.voiceLastSeenAt.getTime() <= browserAvailabilityTtlMs,
  );
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

    if (terminalCallStatuses.has(call.status)) {
      return;
    }

    await client.calls(sid).update({
      status: cancelableCallStatuses.has(call.status) ? "canceled" : "completed",
    });
  } catch (error) {
    const candidate = error as { code?: number; status?: number };

    if (candidate.code === 20404 || candidate.status === 404) {
      return;
    }

    throw error;
  }
}

function publicOrigin(configuredBaseUrl: string) {
  const origin =
    configuredBaseUrl ||
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "";

  if (!origin) {
    throw new Error("Add the Twilio webhook base URL before manual routing.");
  }

  return origin.replace(/\/$/, "");
}

export async function routeQueuedCallAction(
  _: CallRoutingActionState,
  formData: FormData,
): Promise<CallRoutingActionState> {
  const currentUser = await requireAdmin();
  const queueEntryId = String(formData.get("queueEntryId") ?? "");
  const targetUserId = String(formData.get("targetUserId") ?? "");

  if (!queueEntryId || !targetUserId) {
    return {
      ok: false,
      message: "Choose a queued call and an available agent.",
      savedAt: null,
    };
  }

  const queueEntry = await prisma.callQueueEntry.findUnique({
    where: { id: queueEntryId },
    include: {
      callLog: true,
      contact: { select: { firstName: true, lastName: true } },
      opportunity: { select: { title: true } },
    },
  });

  if (!queueEntry) {
    return { ok: false, message: "Queued call not found.", savedAt: null };
  }

  if (["COMPLETED", "MISSED", "ABANDONED"].includes(queueEntry.status)) {
    return {
      ok: false,
      message: "This queued call has already ended.",
      savedAt: null,
    };
  }

  const agent = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
      mobile: true,
      landline: true,
      sipAddress: true,
      voiceExtension: true,
      voiceRoutingMode: true,
      voiceAvailability: true,
      voiceLastSeenAt: true,
      status: true,
    },
  });

  if (!agent || agent.status !== "ACTIVE") {
    return { ok: false, message: "Agent is not active.", savedAt: null };
  }

  if (agent.voiceAvailability !== "AVAILABLE") {
    return { ok: false, message: "Agent is not available.", savedAt: null };
  }

  if (!hasFreshBrowserPresence(agent)) {
    return {
      ok: false,
      message: "Agent browser is not currently online.",
      savedAt: null,
    };
  }

  if (!targetForUser(agent)) {
    return {
      ok: false,
      message: "Agent does not have a callable route configured.",
      savedAt: null,
    };
  }

  try {
    const runtime = getTwilioVoiceRuntime(await getStoredTwilioConfig());
    const client = twilio(runtime.accountSid, runtime.authToken);
    const previousAgentCallSid =
      metadataString(queueEntry.metadata, "agentCallSid") ??
      metadataString(queueEntry.callLog?.metadata, "agentCallSid");

    await endTwilioCall(client, previousAgentCallSid);

    const { agentCall, attempt } = await createQueueAgentCall({
      runtime,
      origin: publicOrigin(runtime.webhookBaseUrl),
      queueEntry,
      agent,
      mode: "manual",
    });
    const routedAttempt = {
      ...attempt,
      routedByUserId: currentUser.id,
    };

    await prisma.$transaction([
      prisma.callQueueEntry.update({
        where: { id: queueEntry.id },
        data: {
          status: "CONNECTING",
          assignedUserId: agent.id,
          metadata: appendRoutingAttempt(queueEntry.metadata, routedAttempt, {
            agentCallSid: agentCall.sid,
            agentUserId: agent.id,
            manuallyRoutedAt: new Date().toISOString(),
            manuallyRoutedBy: currentUser.id,
          }),
        },
      }),
      ...(queueEntry.callLogId
        ? [
            prisma.callLog.update({
              where: { id: queueEntry.callLogId },
              data: {
                status: "RINGING",
                userId: agent.id,
                metadata: appendRoutingAttempt(
                  queueEntry.callLog?.metadata,
                  routedAttempt,
                  {
                    agentCallSid: agentCall.sid,
                    agentUserId: agent.id,
                    manuallyRoutedAt: new Date().toISOString(),
                    manuallyRoutedBy: currentUser.id,
                  },
                ),
              },
            }),
          ]
        : []),
      prisma.user.update({
        where: { id: agent.id },
        data: { voiceAvailability: "BUSY", voiceLastSeenAt: new Date() },
      }),
    ]);

    revalidatePath("/");
    revalidatePath("/telephony");

    return {
      ok: true,
      message: "Call routed to selected agent.",
      savedAt: Date.now(),
    };
  } catch (error) {
    console.error("Manual call routing failed", error);
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to route this call.",
      savedAt: null,
    };
  }
}

export async function markQueuedCallMissedAction(
  _: CallRoutingActionState,
  formData: FormData,
): Promise<CallRoutingActionState> {
  await requireAdmin();

  const queueEntryId = String(formData.get("queueEntryId") ?? "");

  if (!queueEntryId) {
    return {
      ok: false,
      message: "Choose a queued call.",
      savedAt: null,
    };
  }

  const queueEntry = await prisma.callQueueEntry.findUnique({
    where: { id: queueEntryId },
    include: { callLog: true },
  });

  if (!queueEntry) {
    return { ok: false, message: "Queued call not found.", savedAt: null };
  }

  if (["COMPLETED", "MISSED", "ABANDONED"].includes(queueEntry.status)) {
    return {
      ok: false,
      message: "This queued call has already ended.",
      savedAt: null,
    };
  }

  await prisma.$transaction([
    prisma.callQueueEntry.update({
      where: { id: queueEntry.id },
      data: { status: "MISSED", missedAt: new Date() },
    }),
    ...(queueEntry.callLogId
      ? [
          prisma.callLog.update({
            where: { id: queueEntry.callLogId },
            data: { status: "NO_ANSWER", endedAt: new Date() },
          }),
        ]
      : []),
  ]);

  revalidatePath("/");
  revalidatePath("/telephony");

  return {
    ok: true,
    message: "Queued call marked as missed.",
    savedAt: Date.now(),
  };
}

export async function endQueuedCallAction(
  _: CallRoutingActionState,
  formData: FormData,
): Promise<CallRoutingActionState> {
  await requireAdmin();

  const queueEntryId = String(formData.get("queueEntryId") ?? "");

  if (!queueEntryId) {
    return {
      ok: false,
      message: "Choose a queued call.",
      savedAt: null,
    };
  }

  const queueEntry = await prisma.callQueueEntry.findUnique({
    where: { id: queueEntryId },
    include: { callLog: true },
  });

  if (!queueEntry) {
    return { ok: false, message: "Queued call not found.", savedAt: null };
  }

  try {
    const runtime = getTwilioVoiceRuntime(await getStoredTwilioConfig());
    const client = twilio(runtime.accountSid, runtime.authToken);
    const conferenceSid = queueEntry.callLog?.conferenceSid;

    if (conferenceSid) {
      await client.conferences(conferenceSid).update({ status: "completed" }).catch(() => null);
    }

    if (queueEntry.callLog?.conferenceName && !conferenceSid) {
      const conferences = await client.conferences.list({
        friendlyName: queueEntry.callLog.conferenceName,
        status: "in-progress",
        limit: 1,
      });

      if (conferences[0]?.sid) {
        await client.conferences(conferences[0].sid).update({ status: "completed" });
      }
    }

    await endTwilioCall(client, queueEntry.callSid);
    await endTwilioCall(client, queueEntry.callLog?.callSid);
    await endTwilioCall(client, queueEntry.callLog?.parentCallSid);
  } catch (error) {
    console.error("Ending queued call in Twilio failed", error);
  }

  await prisma.$transaction([
    prisma.callQueueEntry.update({
      where: { id: queueEntry.id },
      data: { status: "ABANDONED", completedAt: new Date() },
    }),
    ...(queueEntry.callLogId
      ? [
          prisma.callLog.update({
            where: { id: queueEntry.callLogId },
            data: { status: "CANCELED", endedAt: new Date() },
          }),
        ]
      : []),
  ]);

  revalidatePath("/");
  revalidatePath("/telephony");

  return {
    ok: true,
    message: "Queued call ended.",
    savedAt: Date.now(),
  };
}
