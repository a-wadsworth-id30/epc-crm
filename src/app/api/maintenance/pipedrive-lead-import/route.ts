import { NextResponse } from "next/server";
import {
  readPipedriveLeadPullReadiness,
  runPipedriveLeadPull,
} from "@/lib/integrations/pipedrive-lead-sync";

type PipedriveLeadPullResult = Awaited<ReturnType<typeof runPipedriveLeadPull>>;

export const dynamic = "force-dynamic";

function pipedriveLeadImportSecret() {
  return process.env.PIPEDRIVE_LEAD_IMPORT_SECRET || process.env.CRON_SECRET || "";
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";

  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

function isAuthorized(request: Request) {
  const secret = pipedriveLeadImportSecret();
  if (!secret) return false;

  return (
    bearerToken(request) === secret ||
    request.headers.get("x-cron-secret") === secret
  );
}

function booleanQuery(request: Request, key: string, defaultValue = false) {
  const value = new URL(request.url).searchParams.get(key) ?? "";
  if (!value) return defaultValue;

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function jobTrigger(request: Request) {
  const trigger = request.headers.get("x-crm-job-trigger")?.trim() || "api";

  return trigger.slice(0, 40) || "api";
}

async function pipedriveLeadImportResponse(request: Request, dryRun: boolean) {
  if (!pipedriveLeadImportSecret()) {
    return NextResponse.json(
      {
        ok: false,
        message: "PIPEDRIVE_LEAD_IMPORT_SECRET or CRON_SECRET is not configured.",
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

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      ok: true,
      result: await readPipedriveLeadPullReadiness(),
    });
  }

  const result = await runPipedriveLeadPull({
    recordBackgroundJob: true,
    trigger: jobTrigger(request),
  });

  return NextResponse.json(
    {
      ok: result.status !== "ERROR",
      result: compactResult(result),
    },
    { status: result.status === "ERROR" ? 502 : 200 },
  );
}

function compactResult(result: PipedriveLeadPullResult) {
  return {
    connectionId: result.connectionId,
    created: result.created,
    linkedExisting: result.linkedExisting,
    message: result.message,
    mode: result.mode,
    moreAvailable: result.moreAvailable,
    pagesRead: result.pagesRead,
    pullOnly: true,
    recordsRead: result.recordsRead,
    recordsWritten: result.recordsWritten,
    skipped: result.skipped,
    status: result.status,
    warningCount: result.warningCount,
  };
}

export async function GET(request: Request) {
  return pipedriveLeadImportResponse(request, true);
}

export async function POST(request: Request) {
  return pipedriveLeadImportResponse(request, booleanQuery(request, "dryRun"));
}
