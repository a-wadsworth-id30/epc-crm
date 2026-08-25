import { NextResponse } from "next/server";
import {
  readPipedriveLeadPullPreview,
  readPipedriveLeadPullReadiness,
  runPipedriveApprovedLeadPageImport,
  runPipedriveDirectLeadImport,
  runPipedriveLeadPull,
} from "@/lib/integrations/pipedrive-lead-sync";
import { runPipedriveLinkedSaleBackfillContinuation } from "@/lib/integrations/pipedrive-linked-sale-backfill";

type PipedriveLeadPullResult = Awaited<ReturnType<typeof runPipedriveLeadPull>>;
type PipedriveLinkedSaleBackfillResult = Awaited<
  ReturnType<typeof runPipedriveLinkedSaleBackfillContinuation>
>;
type PipedriveApprovedLeadPageImportResult = Awaited<
  ReturnType<typeof runPipedriveApprovedLeadPageImport>
>;
type PipedriveDirectLeadImportResult = Awaited<
  ReturnType<typeof runPipedriveDirectLeadImport>
>;

export const dynamic = "force-dynamic";

function pipedriveLeadImportSecret() {
  return (
    process.env.PIPEDRIVE_LEAD_IMPORT_SECRET || process.env.CRON_SECRET || ""
  );
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

function integerQuery(
  request: Request,
  key: string,
  { max, min }: { max: number; min: number },
) {
  const value = Number(new URL(request.url).searchParams.get(key) ?? "");
  if (!Number.isFinite(value)) return null;

  return Math.min(Math.max(Math.trunc(value), min), max);
}

function textQuery(request: Request, key: string) {
  const value = new URL(request.url).searchParams.get(key)?.trim() ?? "";

  return value || null;
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
        message:
          "PIPEDRIVE_LEAD_IMPORT_SECRET or CRON_SECRET is not configured.",
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

  if (booleanQuery(request, "preview")) {
    return NextResponse.json({
      dryRun: true,
      ok: true,
      preview: true,
      result: await readPipedriveLeadPullPreview({
        limit: integerQuery(request, "limit", { max: 50, min: 1 }),
        start: integerQuery(request, "start", { max: 50_000, min: 0 }),
      }),
    });
  }

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      ok: true,
      result: await readPipedriveLeadPullReadiness(),
    });
  }

  if (booleanQuery(request, "approvedImport")) {
    const result = await runPipedriveApprovedLeadPageImport({
      expectedWouldCreate: integerQuery(request, "expectedWouldCreate", {
        max: 10,
        min: 1,
      }),
      limit: integerQuery(request, "limit", { max: 10, min: 1 }),
      recordBackgroundJob: true,
      start: integerQuery(request, "start", { max: 50_000, min: 0 }),
      trigger: jobTrigger(request),
    });

    return NextResponse.json(
      {
        approvedImport: true,
        ok: result.status !== "ERROR",
        result: compactApprovedPageImportResult(result),
      },
      { status: result.status === "ERROR" ? 502 : 200 },
    );
  }

  if (booleanQuery(request, "directLeadImport")) {
    const result = await runPipedriveDirectLeadImport({
      leadInput:
        textQuery(request, "leadId") ?? textQuery(request, "leadUrl") ?? null,
      recordBackgroundJob: true,
      trigger: jobTrigger(request),
    });

    return NextResponse.json(
      {
        directLeadImport: true,
        ok: result.status !== "ERROR",
        result: compactDirectLeadImportResult(result),
      },
      { status: result.status === "ERROR" ? 502 : 200 },
    );
  }

  const result = await runPipedriveLeadPull({
    recordBackgroundJob: true,
    trigger: jobTrigger(request),
  });
  const linkedSaleBackfill =
    await runPipedriveLinkedSaleBackfillContinuation({
      fileMaxPages: integerQuery(request, "linkedSaleFileMaxPages", {
        max: 10,
        min: 1,
      }),
      limit: integerQuery(request, "linkedSaleLimit", { max: 25, min: 1 }),
      recordBackgroundJob: true,
      trigger: `${jobTrigger(request)}-linked-sale-backfill`,
    });
  const ok =
    result.status !== "ERROR" && linkedSaleBackfill.status !== "ERROR";

  return NextResponse.json(
    {
      ok,
      result: {
        ...compactResult(result),
        linkedSaleBackfill: compactLinkedSaleBackfillResult(
          linkedSaleBackfill,
        ),
        recordsRead: result.recordsRead + linkedSaleBackfill.recordsRead,
        recordsWritten:
          result.recordsWritten + linkedSaleBackfill.recordsWritten,
      },
    },
    { status: ok ? 200 : 502 },
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

function compactLinkedSaleBackfillResult(
  result: PipedriveLinkedSaleBackfillResult,
) {
  return {
    batchLimit: result.batchLimit,
    emailCreated: result.emailCreated,
    emailRead: result.emailRead,
    emailSkipped: result.emailSkipped,
    emailUpdated: result.emailUpdated,
    fileCreated: result.fileCreated,
    fileRead: result.fileRead,
    fileUpdated: result.fileUpdated,
    linkedSales: result.linkedSales,
    message: result.message,
    mode: result.mode,
    moreAvailable: result.moreAvailable,
    nextCursor: result.nextCursor ? "present" : null,
    noteCreated: result.noteCreated,
    noteRead: result.noteRead,
    noteUpdated: result.noteUpdated,
    processed: result.processed,
    pullOnly: true,
    recordsRead: result.recordsRead,
    recordsWritten: result.recordsWritten,
    status: result.status,
    warningCount: result.warningCount,
  };
}

function compactApprovedPageImportResult(
  result: PipedriveApprovedLeadPageImportResult,
) {
  return {
    approvedLeadCount: result.approvedLeadCount,
    connectionId: result.connectionId,
    created: result.created,
    expectedWouldCreate: result.expectedWouldCreate,
    linkedExisting: result.linkedExisting,
    message: result.message,
    mode: result.mode,
    pageLimit: result.pageLimit,
    pagesRead: result.pagesRead,
    pageStart: result.pageStart,
    pullOnly: true,
    recordsRead: result.recordsRead,
    recordsWritten: result.recordsWritten,
    skipped: result.skipped,
    status: result.status,
    warningCount: result.warningCount,
  };
}

function compactDirectLeadImportResult(
  result: PipedriveDirectLeadImportResult,
) {
  return {
    connectionId: result.connectionId,
    created: result.created,
    linkedExisting: result.linkedExisting,
    message: result.message,
    mode: result.mode,
    pullOnly: true,
    recordsRead: result.recordsRead,
    recordsWritten: result.recordsWritten,
    requestedLeadId: result.requestedLeadId,
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
