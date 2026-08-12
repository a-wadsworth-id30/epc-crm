import { NextResponse } from "next/server";
import { runOperationalDataRetention } from "@/lib/maintenance/retention";

export const dynamic = "force-dynamic";

function retentionSecret() {
  return process.env.OPERATIONAL_RETENTION_SECRET || process.env.CRON_SECRET || "";
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";

  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

function isAuthorized(request: Request) {
  const secret = retentionSecret();
  if (!secret) return false;

  return (
    bearerToken(request) === secret ||
    request.headers.get("x-cron-secret") === secret
  );
}

function wantsDryRun(request: Request) {
  const value = new URL(request.url).searchParams.get("dryRun") ?? "";

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

async function retentionResponse(request: Request, dryRun: boolean) {
  if (!retentionSecret()) {
    return NextResponse.json(
      {
        ok: false,
        message: "OPERATIONAL_RETENTION_SECRET or CRON_SECRET is not configured.",
      },
      { status: 503 },
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        ok: false,
        message: "Unauthorized.",
      },
      { status: 401 },
    );
  }

  const result = await runOperationalDataRetention({
    dryRun,
    trigger: dryRun ? "api-dry-run" : "api",
  });

  return NextResponse.json({
    ok: true,
    result,
  });
}

export async function GET(request: Request) {
  return retentionResponse(request, true);
}

export async function POST(request: Request) {
  return retentionResponse(request, wantsDryRun(request));
}
