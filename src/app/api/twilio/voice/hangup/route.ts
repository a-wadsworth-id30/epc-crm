import twilio from "twilio";
import { NextResponse } from "next/server";
import {
  getStoredTwilioConfig,
  getTwilioVoiceRuntime,
} from "@/lib/integrations/twilio-server";
import { prisma } from "@/lib/prisma";
import { requireBrowserSoftphoneUser } from "@/lib/telephony/authorization";

const cancelableCallStatuses = new Set(["queued", "ringing", "initiated"]);
const terminalCallStatuses = new Set([
  "completed",
  "failed",
  "busy",
  "no-answer",
  "canceled",
]);

async function completeTwilioResource(
  complete: () => Promise<unknown>,
  sid: string | null | undefined,
) {
  if (!sid) {
    return null;
  }

  try {
    await complete();
    return sid;
  } catch (error) {
    const candidate = error as { code?: number; status?: number };

    if (candidate.code === 20404 || candidate.status === 404) {
      return null;
    }

    throw error;
  }
}

async function endTwilioCall(
  client: ReturnType<typeof twilio>,
  sid: string | null | undefined,
) {
  if (!sid) {
    return null;
  }

  try {
    const call = await client.calls(sid).fetch();

    if (terminalCallStatuses.has(call.status)) {
      return sid;
    }

    await client.calls(sid).update({
      status: cancelableCallStatuses.has(call.status) ? "canceled" : "completed",
    });
    return sid;
  } catch (error) {
    const candidate = error as { code?: number; status?: number };

    if (candidate.code === 20404 || candidate.status === 404) {
      return null;
    }

    throw error;
  }
}

async function findCallToHangUp(
  userId: string,
  payload: { opportunityId?: string | null; contactId?: string | null },
) {
  const activeCall = await prisma.callLog.findFirst({
    where: {
      userId,
      status: { in: ["QUEUED", "RINGING", "IN_PROGRESS"] },
      ...(payload.opportunityId ? { opportunityId: payload.opportunityId } : {}),
      ...(payload.contactId ? { contactId: payload.contactId } : {}),
    },
    orderBy: { startedAt: "desc" },
  });

  if (activeCall) {
    return activeCall;
  }

  const recentAssignedQueueEntry = await prisma.callQueueEntry.findFirst({
    where: {
      assignedUserId: userId,
      queuedAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
      ...(payload.opportunityId ? { opportunityId: payload.opportunityId } : {}),
      ...(payload.contactId ? { contactId: payload.contactId } : {}),
      callLog: { isNot: null },
    },
    include: { callLog: true },
    orderBy: [{ answeredAt: "desc" }, { queuedAt: "desc" }],
  });

  return recentAssignedQueueEntry?.callLog ?? null;
}

export async function POST(request: Request) {
  const authorization = await requireBrowserSoftphoneUser();

  if (!authorization.ok) {
    return authorization.response;
  }

  const currentUser = authorization.user;
  const payload = (await request.json().catch(() => ({}))) as {
    opportunityId?: string | null;
    contactId?: string | null;
  };

  const activeCall = await findCallToHangUp(currentUser.id, payload);

  if (!activeCall) {
    return NextResponse.json({ ok: true, message: "No active call found." });
  }

  const runtime = getTwilioVoiceRuntime(await getStoredTwilioConfig());
  const client = twilio(runtime.accountSid, runtime.authToken);
  const completedTargets = new Set<string>();

  if (activeCall.conferenceSid) {
    const completedTarget = await completeTwilioResource(
      () =>
        client.conferences(activeCall.conferenceSid as string).update({
          status: "completed",
        }),
      activeCall.conferenceSid,
    );

    if (completedTarget) completedTargets.add(completedTarget);
  } else if (activeCall.conferenceName) {
    const conferences = await client.conferences.list({
      friendlyName: activeCall.conferenceName,
      status: "in-progress",
      limit: 1,
    });
    const conference = conferences[0];

    if (conference?.sid) {
      const completedTarget = await completeTwilioResource(
        () => client.conferences(conference.sid).update({ status: "completed" }),
        conference.sid,
      );

      if (completedTarget) completedTargets.add(completedTarget);
    }
  }

  const parentTarget = await endTwilioCall(client, activeCall.parentCallSid);
  if (parentTarget) {
    completedTargets.add(parentTarget);
  }

  const agentTarget = await endTwilioCall(client, activeCall.callSid);
  if (agentTarget) {
    completedTargets.add(agentTarget);
  }

  await prisma.callLog.update({
    where: { id: activeCall.id },
    data: {
      status: "COMPLETED",
      endedAt: new Date(),
    },
  });
  await prisma.callQueueEntry.updateMany({
    where: { callLogId: activeCall.id },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });
  await prisma.user.update({
    where: { id: currentUser.id },
    data: { voiceAvailability: "AVAILABLE", voiceLastSeenAt: new Date() },
  });

  return NextResponse.json({
    ok: true,
    completedTargets: Array.from(completedTargets),
  });
}
