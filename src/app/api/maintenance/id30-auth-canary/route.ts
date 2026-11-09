import { NextResponse } from "next/server";
import { BackgroundJobRunStatus } from "@prisma/client";
import { id30AuthBrokerRequest } from "@/lib/integrations/id30-auth-oauth";
import {
  completeBackgroundJobRun,
  failBackgroundJobRun,
  startBackgroundJobRun,
} from "@/lib/maintenance/background-jobs";

export const dynamic = "force-dynamic";

function secret() {
  return process.env.ID30_AUTH_CANARY_SECRET || process.env.CRON_SECRET || "";
}

function authorized(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  return Boolean(secret() && value === `Bearer ${secret()}`);
}

export async function POST(request: Request) {
  if (!secret()) return NextResponse.json({ ok: false, message: "Canary secret is not configured." }, { status: 503 });
  if (!authorized(request)) return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 });

  const run = await startBackgroundJobRun({
    jobName: "id30-auth-cross-system-canary",
    jobType: "integration-health",
    trigger: "scheduled",
  });
  const startedAt = Date.now();
  try {
    const response = await id30AuthBrokerRequest({
      connectionId: "__cross_system_canary__",
      method: "GET",
      pathname: "/api/crm/canary",
    });
    const body = response.ok ? response.body : null;
    const valid = Boolean(
      response.ok &&
        body?.ok === true &&
        body?.callbackDelivered === true &&
        body?.contract === "id30-auth-canary.v1",
    );
    const durationMs = Date.now() - startedAt;
    if (!valid) throw new Error(response.ok ? "Canary response was incomplete." : response.message);

    await completeBackgroundJobRun(run, {
      message: "Signed CRM to Auth to CRM canary succeeded.",
      status: BackgroundJobRunStatus.SUCCESS,
      summary: { durationMs, roundTrip: true },
    });
    return NextResponse.json({ ok: true, durationMs, roundTrip: true });
  } catch (error) {
    await failBackgroundJobRun(run, {
      error,
      message: "Signed CRM to Auth to CRM canary failed.",
      summary: { durationMs: Date.now() - startedAt, roundTrip: false },
    });
    return NextResponse.json({ ok: false, message: "Cross-system canary failed." }, { status: 502 });
  }
}
