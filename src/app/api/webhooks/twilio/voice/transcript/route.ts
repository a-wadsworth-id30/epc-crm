import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  fetchTwilioTranscriptText,
  storeTranscriptForCallLog,
} from "@/lib/telephony/transcripts";
import { verifyTwilioWebhookRequest } from "@/lib/telephony/twilio-webhooks";

function valueFromPayload(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return null;
}

function payloadFromJsonBody(body: string) {
  return (JSON.parse(body || "{}") ?? {}) as Record<string, unknown>;
}

function payloadFromFormData(formData: FormData) {
  return Object.fromEntries(formData.entries()) as Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  let payload: Record<string, unknown>;

  if (contentType.includes("application/json")) {
    const rawBody = await request.text();
    const verification = await verifyTwilioWebhookRequest(request, { rawBody });

    if (!verification.ok) {
      return verification.response;
    }

    try {
      payload = payloadFromJsonBody(rawBody);
    } catch {
      return NextResponse.json(
        { ok: false, message: "Invalid JSON." },
        { status: 400 },
      );
    }
  } else {
    const formData = await request.formData();
    const verification = await verifyTwilioWebhookRequest(request, { formData });

    if (!verification.ok) {
      return verification.response;
    }

    payload = payloadFromFormData(formData);
  }

  const transcriptSid = valueFromPayload(payload, [
    "TranscriptSid",
    "transcript_sid",
    "transcriptSid",
    "Sid",
    "sid",
  ]);
  const callLogId =
    request.nextUrl.searchParams.get("callLogId") ||
    valueFromPayload(payload, ["CustomerKey", "customer_key", "customerKey", "callLogId"]);
  let transcript = valueFromPayload(payload, [
    "Transcript",
    "transcript",
    "Text",
    "text",
    "body",
  ]);

  if (!transcript && transcriptSid) {
    transcript = await fetchTwilioTranscriptText(transcriptSid).catch((error) => {
      console.error("Fetching Twilio transcript sentences failed", error);
      return null;
    });
  }

  const transcriptCallLog = transcriptSid
    ? await findCallLogByTranscriptSid(transcriptSid)
    : null;
  const resolvedCallLogId = callLogId || transcriptCallLog?.id || null;

  if (!resolvedCallLogId || !transcript) {
    return NextResponse.json({ ok: true, stored: false });
  }

  await storeTranscriptForCallLog({
    callLogId: resolvedCallLogId,
    transcript,
    transcriptSid,
  });

  return NextResponse.json({ ok: true, stored: true });
}

async function findCallLogByTranscriptSid(transcriptSid: string) {
  const indexedCallLog = await prisma.callLog.findFirst({
    where: { transcriptSid },
    select: { id: true },
  });

  if (indexedCallLog) return indexedCallLog;

  return prisma.callLog.findFirst({
    where: { metadata: { path: ["transcriptSid"], equals: transcriptSid } },
    select: { id: true },
  });
}
