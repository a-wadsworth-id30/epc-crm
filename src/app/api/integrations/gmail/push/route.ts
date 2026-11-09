import { NextResponse } from "next/server";
import { getId30AuthRuntimeConfig } from "@/lib/integrations/id30-auth";
import { verifyGmailPushPayload } from "@/lib/integrations/gmail-push-contract";
import { recordGmailPushReceipt } from "@/lib/integrations/gmail-push-receiver";

export const dynamic = "force-dynamic";

const maximumBodyBytes = 16 * 1024;

async function boundedJson(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maximumBodyBytes) {
    return { ok: false as const, status: 413, message: "Request is too large." };
  }

  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maximumBodyBytes) {
    return { ok: false as const, status: 413, message: "Request is too large." };
  }

  try {
    return { ok: true as const, body: JSON.parse(text) as unknown };
  } catch {
    return { ok: false as const, status: 400, message: "Request must be valid JSON." };
  }
}

export async function POST(request: Request) {
  const runtime = await getId30AuthRuntimeConfig();
  if (!runtime) {
    return NextResponse.json(
      { ok: false, message: "iD30 Auth shared secret is not configured." },
      { status: 503 },
    );
  }

  const parsedBody = await boundedJson(request);
  if (!parsedBody.ok) {
    return NextResponse.json(
      { ok: false, message: parsedBody.message },
      { status: parsedBody.status },
    );
  }

  const verification = verifyGmailPushPayload({
    body: parsedBody.body,
    crmClientId: runtime.crmClientId,
    sharedSecret: runtime.sharedSecret,
    workspaceId: runtime.workspaceId,
  });
  if (!verification.ok) {
    return NextResponse.json(
      { ok: false, message: verification.message },
      { status: verification.status },
    );
  }

  try {
    const result = await recordGmailPushReceipt(verification.payload);

    return NextResponse.json(
      { ok: true, status: result.status },
      { status: result.status === "accepted" ? 202 : 200 },
    );
  } catch (error) {
    console.error("Signed Gmail push event could not be recorded", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { ok: false, message: "Signed Gmail event could not be recorded." },
      { status: 503 },
    );
  }
}
