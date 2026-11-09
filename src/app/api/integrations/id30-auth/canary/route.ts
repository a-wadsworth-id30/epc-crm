import { NextResponse } from "next/server";
import { verifyId30AuthCanary } from "@/lib/integrations/id30-auth-canary-contract";
import { getId30AuthRuntimeConfig } from "@/lib/integrations/id30-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const runtime = await getId30AuthRuntimeConfig();
  if (!runtime) {
    return NextResponse.json({ ok: false, message: "Auth broker is not configured." }, { status: 503 });
  }
  const body = await request.json().catch(() => null);
  const verified = verifyId30AuthCanary({
    body,
    crmClientId: runtime.crmClientId,
    verificationSecrets: runtime.verificationSecrets,
    workspaceId: runtime.workspaceId,
  });
  if (!verified.ok) {
    return NextResponse.json(
      { ok: false, message: verified.message },
      { status: verified.status },
    );
  }
  return NextResponse.json({ ok: true, received: true });
}
