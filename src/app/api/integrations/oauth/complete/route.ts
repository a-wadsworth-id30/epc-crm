import { NextResponse } from "next/server";
import {
  findMarketingOAuthProvider,
  saveMarketingAuthBrokerCompletion,
} from "@/lib/marketing/oauth";
import { verifyId30AuthBrokerCompletion } from "@/lib/integrations/id30-auth-oauth";
import {
  gmailProvider,
  saveGmailAuthBrokerCompletion,
} from "@/lib/integrations/gmail";

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

  const verification = await verifyId30AuthBrokerCompletion(body);

  if (!verification.ok) {
    return NextResponse.json(
      { ok: false, message: verification.message },
      { status: verification.status },
    );
  }

  const provider = findMarketingOAuthProvider(verification.payload.provider);

  if (verification.payload.provider !== gmailProvider && !provider) {
    return NextResponse.json(
      { ok: false, message: "Signed completion callback provider is not supported." },
      { status: 400 },
    );
  }

  try {
    if (verification.payload.provider === gmailProvider) {
      await saveGmailAuthBrokerCompletion(verification.payload);
    } else if (provider) {
      await saveMarketingAuthBrokerCompletion({
        payload: verification.payload,
        provider,
      });
    }
  } catch (error) {
    console.error("iD30 Auth completion callback failed", error);

    return NextResponse.json(
      { ok: false, message: "Completion callback could not be saved." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    provider: verification.payload.provider,
    status: verification.payload.status,
  });
}
