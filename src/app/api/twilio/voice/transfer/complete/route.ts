import twilio from "twilio";
import { NextResponse } from "next/server";
import {
  getStoredTwilioConfig,
  getTwilioVoiceRuntime,
} from "@/lib/integrations/twilio-server";
import { prisma } from "@/lib/prisma";
import { requireBrowserSoftphoneUser } from "@/lib/telephony/authorization";

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
  const activeCall = await prisma.callLog.findFirst({
    where: {
      userId: currentUser.id,
      status: { in: ["QUEUED", "RINGING", "IN_PROGRESS"] },
      ...(payload.opportunityId ? { opportunityId: payload.opportunityId } : {}),
      ...(payload.contactId ? { contactId: payload.contactId } : {}),
    },
    orderBy: { startedAt: "desc" },
  });

  if (!activeCall?.conferenceName) {
    return NextResponse.json(
      { error: "No active conference-backed call was found." },
      { status: 400 },
    );
  }

  const runtime = getTwilioVoiceRuntime(await getStoredTwilioConfig());
  const client = twilio(runtime.accountSid, runtime.authToken);
  const conferences = await client.conferences.list({
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

  if (activeCall.parentCallSid) {
    await client
      .conferences(conference.sid)
      .participants(activeCall.parentCallSid)
      .update({ hold: false });
  }

  if (activeCall.callSid) {
    await client.calls(activeCall.callSid).update({ status: "completed" });
  }

  await prisma.user.update({
    where: { id: currentUser.id },
    data: { voiceAvailability: "AVAILABLE", voiceLastSeenAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
