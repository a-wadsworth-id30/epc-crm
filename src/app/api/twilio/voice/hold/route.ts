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
  const payload = (await request.json()) as {
    hold?: boolean;
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

  if (!activeCall?.conferenceName || !activeCall.parentCallSid) {
    return NextResponse.json(
      { error: "The customer call leg is not ready for hold yet." },
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

  await client
    .conferences(conference.sid)
    .participants(activeCall.parentCallSid)
    .update({ hold: Boolean(payload.hold) });

  return NextResponse.json({
    ok: true,
    hold: Boolean(payload.hold),
  });
}
