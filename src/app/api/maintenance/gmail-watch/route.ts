import { NextResponse } from "next/server";
import { renewGmailMailboxWatch } from "@/lib/integrations/gmail-watch";
import { gmailWatchRenewBeforeMs } from "@/lib/integrations/gmail-watch-policy";
import {
  gmailWatchJobName,
  gmailWatchJobType,
  gmailWatchOperationStatus,
  type GmailWatchOperationSummary,
} from "@/lib/integrations/gmail-watch-operations";
import {
  completeBackgroundJobRun,
  failBackgroundJobRun,
  startBackgroundJobRun,
} from "@/lib/maintenance/background-jobs";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function cronSecret() {
  return process.env.GMAIL_SYNC_SECRET || process.env.CRON_SECRET || "";
}

function authorized(request: Request) {
  const expected = cronSecret();
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  return Boolean(
    expected &&
      (bearer === expected || request.headers.get("x-cron-secret") === expected),
  );
}

function boundedInteger(
  value: string | null,
  defaultValue: number,
  maximum: number,
  minimum = 1,
) {
  if (!value) return defaultValue;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.min(Math.max(Math.trunc(parsed), minimum), maximum);
}

function routeUnavailable(request: Request) {
  if (!cronSecret()) {
    return NextResponse.json(
      { ok: false, message: "GMAIL_SYNC_SECRET or CRON_SECRET is not configured." },
      { status: 503 },
    );
  }
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }
  return null;
}

function dueWatchWhere(now: Date) {
  return {
    status: "CONNECTED" as const,
    syncEnabled: true,
    OR: [
      { gmailWatchExpiresAt: null },
      {
        gmailWatchExpiresAt: {
          lte: new Date(now.getTime() + gmailWatchRenewBeforeMs),
        },
      },
    ],
    AND: [
      {
        OR: [
          { gmailWatchRetryAt: null },
          { gmailWatchRetryAt: { lte: now } },
        ],
      },
    ],
  };
}

export async function GET(request: Request) {
  const unavailable = routeUnavailable(request);
  if (unavailable) return unavailable;

  const due = await prisma.emailMailbox.count({
    where: dueWatchWhere(new Date()),
  });
  return NextResponse.json({ ok: true, due });
}

export async function POST(request: Request) {
  const unavailable = routeUnavailable(request);
  if (unavailable) return unavailable;

  const url = new URL(request.url);
  const limit = boundedInteger(url.searchParams.get("limit"), 10, 25);
  const timeBudgetMs = boundedInteger(
    url.searchParams.get("timeBudgetMs"),
    20_000,
    45_000,
    5_000,
  );
  const jobRun = await startBackgroundJobRun({
    jobName: gmailWatchJobName,
    jobType: gmailWatchJobType,
    metadata: { limit, timeBudgetMs },
    trigger: "scheduled",
  });
  try {
    const now = new Date();
    const mailboxes = await prisma.emailMailbox.findMany({
      where: dueWatchWhere(now),
      orderBy: [
        { gmailWatchExpiresAt: { sort: "asc", nulls: "first" } },
        { gmailWatchRenewedAt: { sort: "asc", nulls: "first" } },
      ],
      select: {
        authConnectionId: true,
        gmailWatchFailureCount: true,
        id: true,
      },
      take: limit,
    });

    const startedAt = Date.now();
    let failed = 0;
    let renewed = 0;
    for (const mailbox of mailboxes) {
      if (renewed + failed && Date.now() - startedAt >= timeBudgetMs) break;
      const result = await renewGmailMailboxWatch(mailbox, now);
      if (result.ok) renewed += 1;
      else failed += 1;
    }

    const processed = renewed + failed;
    const summary: GmailWatchOperationSummary = {
      deferred: mailboxes.length - processed,
      failed,
      processed,
      renewed,
    };
    await completeBackgroundJobRun(jobRun, {
      message: `Processed ${processed} Gmail watch${processed === 1 ? "" : "es"}; ${renewed} renewed; ${failed} failed; ${summary.deferred} deferred.`,
      recordsRead: processed,
      recordsWritten: renewed,
      status: gmailWatchOperationStatus(summary),
      summary,
    });

    return NextResponse.json(
      { ...summary, ok: failed === 0 },
      { status: failed > 0 && failed === processed ? 502 : 200 },
    );
  } catch (error) {
    await failBackgroundJobRun(jobRun, {
      error,
      message: "Scheduled Gmail watch renewal failed before the batch completed.",
    });
    throw error;
  }
}
