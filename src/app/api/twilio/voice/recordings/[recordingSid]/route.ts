import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto/secrets";
import { getStoredTwilioConfig } from "@/lib/integrations/twilio-server";
import { authorizeCallRecordingAccess } from "@/lib/telephony/recording-authorization";

export async function GET(
  _request: Request,
  context: { params: Promise<{ recordingSid: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { recordingSid } = await context.params;

  if (!recordingSid || !/^R[A-Za-z0-9]{32,}$/.test(recordingSid)) {
    return NextResponse.json({ error: "Invalid recording." }, { status: 400 });
  }

  const access = await authorizeCallRecordingAccess(recordingSid, user);

  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status },
    );
  }

  const config = await getStoredTwilioConfig();
  const authToken = config?.credentials?.authToken
    ? decryptSecret(config.credentials.authToken)
    : null;

  if (!config?.accountSid || !authToken) {
    return NextResponse.json(
      { error: "Twilio credentials are not configured." },
      { status: 400 },
    );
  }

  const recordingResponse = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Recordings/${recordingSid}.mp3`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.accountSid}:${authToken}`).toString("base64")}`,
      },
    },
  );

  if (!recordingResponse.ok || !recordingResponse.body) {
    return NextResponse.json(
      { error: "Recording could not be loaded from Twilio." },
      { status: recordingResponse.status || 502 },
    );
  }

  return new NextResponse(recordingResponse.body, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="${recordingSid}.mp3"`,
      "Content-Type": recordingResponse.headers.get("content-type") ?? "audio/mpeg",
    },
  });
}
