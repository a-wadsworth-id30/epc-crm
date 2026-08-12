import twilio from "twilio";
import { type NextRequest, NextResponse } from "next/server";
import { verifyTwilioWebhookRequest } from "@/lib/telephony/twilio-webhooks";

function twimlResponse(xml: string) {
  return new NextResponse(xml, {
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
    },
  });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const verification = await verifyTwilioWebhookRequest(request, { formData });

  if (!verification.ok) {
    return verification.response;
  }

  const conferenceName = request.nextUrl.searchParams.get("conferenceName");
  const role = request.nextUrl.searchParams.get("role");
  const statusCallbackUrl =
    request.nextUrl.searchParams.get("statusCallbackUrl");
  const response = new twilio.twiml.VoiceResponse();

  if (!conferenceName) {
    response.say("No conference was provided.");
    response.hangup();
    return twimlResponse(response.toString());
  }

  const dial = response.dial();
  dial.conference(
    {
      startConferenceOnEnter: true,
      endConferenceOnExit: role === "customer",
      ...(role ? { participantLabel: role } : {}),
      ...(statusCallbackUrl
        ? {
            statusCallback: statusCallbackUrl,
            statusCallbackEvent: ["start", "end", "join", "leave"],
          }
        : {}),
    },
    conferenceName,
  );

  return twimlResponse(response.toString());
}
