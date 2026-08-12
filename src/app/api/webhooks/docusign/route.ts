import { NextResponse } from "next/server";
import {
  handleDocuSignWebhook,
  InvalidDocuSignSignatureError,
  InvalidDocuSignWebhookError,
} from "@/lib/docusign/webhook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.text();
  const signature =
    request.headers.get("x-docusign-signature-1") ??
    request.headers.get("x-docusign-signature");

  try {
    const result = await handleDocuSignWebhook({
      body,
      signature: signature?.trim() || null,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof InvalidDocuSignSignatureError) {
      return NextResponse.json(
        { ok: false, message: "Invalid DocuSign signature." },
        { status: 401 },
      );
    }

    if (error instanceof InvalidDocuSignWebhookError) {
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: 400 },
      );
    }

    console.error("DocuSign webhook failed", error);

    return NextResponse.json(
      { ok: false, message: "DocuSign webhook failed." },
      { status: 500 },
    );
  }
}
