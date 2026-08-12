import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { bumpCallRealtimeTopics } from "@/lib/realtime/call-topics";
import { createPhoneCommunication } from "@/lib/telephony/twilio-voice";
import { queueTranscriptForCallLog } from "@/lib/telephony/transcripts";
import { verifyTwilioWebhookRequest } from "@/lib/telephony/twilio-webhooks";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const verification = await verifyTwilioWebhookRequest(request, { formData });

  if (!verification.ok) {
    return verification.response;
  }

  const callLogId = request.nextUrl.searchParams.get("callLogId");
  const recordingSid = String(formData.get("RecordingSid") ?? "");
  const recordingUrl = String(formData.get("RecordingUrl") ?? "");
  const recordingStatus = String(formData.get("RecordingStatus") ?? "");
  const recordingDuration = String(formData.get("RecordingDuration") ?? "");
  const callSid = String(formData.get("CallSid") ?? "");

  if (!callLogId && !callSid && !recordingSid) {
    return NextResponse.json({ ok: true });
  }

  const callLog = callLogId
    ? await prisma.callLog.findUnique({ where: { id: callLogId } })
    : callSid
      ? await prisma.callLog.findFirst({
          where: { OR: [{ callSid }, { parentCallSid: callSid }] },
        })
      : null;

  if (!callLog) {
    return NextResponse.json({ ok: true });
  }

  const callMetadata =
    typeof callLog.metadata === "object" && callLog.metadata && !Array.isArray(callLog.metadata)
      ? (callLog.metadata as Record<string, unknown>)
      : {};
  const transcriptEnabled = callMetadata.transcriptEnabled === true;
  const aiAnalysisEnabled = callMetadata.aiAnalysisEnabled === true;

  await prisma.callLog.update({
    where: { id: callLog.id },
    data: {
      recordingSid: recordingSid || callLog.recordingSid,
      recordingUrl: recordingUrl || callLog.recordingUrl,
      ...(recordingUrl
        ? {
            transcriptStatus: transcriptEnabled ? "PENDING" : "DISABLED",
            aiAnalysisStatus: aiAnalysisEnabled ? "PENDING" : "DISABLED",
          }
        : {}),
      metadata: {
        ...callMetadata,
        recordingStatus: recordingStatus || null,
        recordingDuration: recordingDuration || null,
        recordingUrl: recordingUrl || null,
      },
    },
  });
  await bumpCallRealtimeTopics(callLog);

  if (recordingUrl) {
    const externalId = recordingSid || callSid || callLog.callSid;
    const playbackUrl = recordingSid
      ? `/api/twilio/voice/recordings/${recordingSid}`
      : recordingUrl;
    const existingRecordingCommunication = externalId
      ? await prisma.salesCommunication.findFirst({
          where: { externalId },
          select: { id: true },
        })
      : null;

    if (!existingRecordingCommunication) {
      await createPhoneCommunication({
        opportunityId: callLog.opportunityId,
        contactId: callLog.contactId,
        userId: callLog.userId,
        direction: callLog.direction === "INBOUND" ? "INBOUND" : "OUTBOUND",
        subject: "Call recording available",
        summary:
          recordingDuration && Number(recordingDuration) > 0
            ? `Call recording is ready (${recordingDuration}s).${
                transcriptEnabled ? " Transcript generation is enabled." : ""
              }`
            : `Call recording is ready.${
                transcriptEnabled ? " Transcript generation is enabled." : ""
              }`,
        body: playbackUrl,
        fromAddress: callLog.fromNumber ?? callLog.fromIdentity,
        toAddress: callLog.toNumber ?? callLog.toIdentity,
        externalId,
        metadata: {
          provider: "twilio",
          callLogId: callLog.id,
          recordingSid,
          recordingUrl,
          playbackUrl,
          recordingStatus: recordingStatus || null,
          recordingDuration: recordingDuration || null,
          transcriptStatus: transcriptEnabled ? "PENDING" : "DISABLED",
          aiAnalysisStatus: aiAnalysisEnabled ? "PENDING" : "DISABLED",
        },
      });
    }

    if (transcriptEnabled && recordingSid) {
      await queueTranscriptForCallLog(callLog.id);
    }
  }

  return NextResponse.json({ ok: true });
}
