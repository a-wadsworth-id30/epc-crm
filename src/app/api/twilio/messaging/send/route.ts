import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  outboundMessageError,
  outboundMessageStatus,
  sendSalesLeadSms,
} from "@/lib/sales/outbound-messages";

export async function POST(request: Request) {
  const user = await requireUser();
  const payload = (await request.json().catch(() => ({}))) as {
    opportunityId?: string;
    contactId?: string | null;
    to?: string;
    body?: string;
  };
  const body = payload.body?.trim() ?? "";

  if (!payload.opportunityId) {
    return NextResponse.json(
      { error: "Choose a lead before sending an SMS." },
      { status: 400 },
    );
  }

  if (!body) {
    return NextResponse.json(
      { error: "Write a message before sending." },
      { status: 400 },
    );
  }

  try {
    const result = await sendSalesLeadSms({
      body,
      contactId: payload.contactId,
      opportunityId: payload.opportunityId,
      source: "twilio-sms-send",
      to: payload.to,
      user,
    });

    return NextResponse.json({
      ok: true,
      communication: {
        id: result.communicationId,
        status: result.status,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: outboundMessageError(error, "SMS could not be sent.") },
      { status: outboundMessageStatus(error) },
    );
  }
}
