import { NextResponse } from "next/server";
import {
  saveMarketingAuthBrokerCompletion,
  verifyMarketingAuthBrokerCompletion,
} from "@/lib/marketing/oauth";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Completion callback body must be valid JSON." },
      { status: 400 },
    );
  }

  const verification = await verifyMarketingAuthBrokerCompletion(body);

  if (!verification.ok) {
    return NextResponse.json(
      { ok: false, message: verification.message },
      { status: verification.status },
    );
  }

  try {
    await saveMarketingAuthBrokerCompletion({
      payload: verification.payload,
      provider: verification.provider,
    });
  } catch (error) {
    console.error("iD30 Auth completion callback failed", error);

    return NextResponse.json(
      { ok: false, message: "Completion callback could not be saved." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    provider: verification.provider.slug,
    status: verification.payload.status,
  });
}
