import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import {
  outboundMessageError,
  outboundMessageStatus,
  sendSalesLeadEmail,
} from "@/lib/sales/outbound-messages";

const sendEmailSchema = z.object({
  opportunityId: z.string().trim().min(1),
  contactId: z.string().trim().optional().nullable(),
  to: z.string().trim().email().optional(),
  subject: z.string().trim().min(1).max(191),
  body: z.string().trim().min(1).max(20_000),
});

export async function POST(request: Request) {
  const user = await requireUser();
  const payload = (await request.json().catch(() => ({}))) as unknown;
  const parsed = sendEmailSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ??
          "Enter a recipient, subject and message.",
      },
      { status: 400 },
    );
  }

  try {
    const result = await sendSalesLeadEmail({
      body: parsed.data.body,
      contactId: parsed.data.contactId,
      opportunityId: parsed.data.opportunityId,
      source: "sales-lead-email",
      subject: parsed.data.subject,
      to: parsed.data.to,
      user,
    });

    return NextResponse.json({
      ok: true,
      communication: {
        id: result.communicationId,
        messageId: result.messageId,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: outboundMessageError(error, "Email could not be sent.") },
      { status: outboundMessageStatus(error) },
    );
  }
}
