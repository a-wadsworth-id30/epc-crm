import twilio from "twilio";
import { NextResponse } from "next/server";
import {
  getStoredTwilioConfig,
  getTwilioVoiceRuntime,
} from "@/lib/integrations/twilio-server";
import { requireBrowserSoftphoneUser } from "@/lib/telephony/authorization";
import { voiceIdentity } from "@/lib/telephony/twilio-voice";

const tokenTtlSeconds = 900;

export async function GET() {
  const authorization = await requireBrowserSoftphoneUser();

  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const { user } = authorization;
    const runtime = getTwilioVoiceRuntime(await getStoredTwilioConfig());
    const AccessToken = twilio.jwt.AccessToken;
    const VoiceGrant = AccessToken.VoiceGrant;
    const token = new AccessToken(
      runtime.accountSid,
      runtime.apiKeySid,
      runtime.apiKeySecret,
      {
        identity: voiceIdentity(user.id),
        ttl: tokenTtlSeconds,
      },
    );

    token.addGrant(
      new VoiceGrant({
        outgoingApplicationSid: runtime.twimlAppSid,
        incomingAllow: true,
      }),
    );

    return NextResponse.json({
      identity: voiceIdentity(user.id),
      token: token.toJwt(),
      expiresIn: tokenTtlSeconds,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Twilio voice is not configured.",
      },
      { status: 400 },
    );
  }
}
