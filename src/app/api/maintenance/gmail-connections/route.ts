import { NextResponse } from "next/server";
import {
  gmailConnectionReconciliationJobName,
  gmailConnectionReconciliationJobType,
  gmailConnectionReconciliationStatus,
  type GmailConnectionReconciliationSummary,
} from "@/lib/integrations/gmail-connection-operations";
import { reconcileGmailMailboxConnection } from "@/lib/integrations/gmail-connection-reconciliation";
import { refreshGmailIntegrationSummary } from "@/lib/integrations/gmail";
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
  return Boolean(expected && bearer === expected);
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

function unavailable(request: Request) {
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

export async function GET(request: Request) {
  const routeUnavailable = unavailable(request);
  if (routeUnavailable) return routeUnavailable;

  const mailboxCount = await prisma.emailMailbox.count({
    where: { provider: "gmail" },
  });
  return NextResponse.json({ ok: true, mailboxCount });
}

export async function POST(request: Request) {
  const routeUnavailable = unavailable(request);
  if (routeUnavailable) return routeUnavailable;

  const url = new URL(request.url);
  const limit = boundedInteger(url.searchParams.get("limit"), 25, 50);
  const timeBudgetMs = boundedInteger(
    url.searchParams.get("timeBudgetMs"),
    20_000,
    45_000,
    5_000,
  );
  const jobRun = await startBackgroundJobRun({
    jobName: gmailConnectionReconciliationJobName,
    jobType: gmailConnectionReconciliationJobType,
    metadata: { limit, timeBudgetMs },
    trigger: "scheduled",
  });

  try {
    const mailboxes = await prisma.emailMailbox.findMany({
      where: { provider: "gmail" },
      orderBy: [
        { authStatusCheckedAt: { sort: "asc", nulls: "first" } },
        { createdAt: "asc" },
      ],
      select: {
        authConnectionId: true,
        id: true,
        lastError: true,
        status: true,
      },
      take: limit,
    });
    const startedAt = Date.now();
    const results = [];
    for (const mailbox of mailboxes) {
      if (results.length && Date.now() - startedAt >= timeBudgetMs) break;
      results.push(await reconcileGmailMailboxConnection(mailbox));
    }

    const summary: GmailConnectionReconciliationSummary = {
      changed: results.filter((result) => result.changed).length,
      checked: results.length,
      connected: results.filter(
        (result) => result.ok && result.status === "CONNECTED",
      ).length,
      deferred: mailboxes.length - results.length,
      disconnected: results.filter(
        (result) => result.ok && result.status === "DISCONNECTED",
      ).length,
      failed: results.filter((result) => !result.ok).length,
      reconnectRequired: results.filter(
        (result) => result.ok && result.status === "NEEDS_REAUTH",
      ).length,
    };
    if (summary.changed) await refreshGmailIntegrationSummary();

    await completeBackgroundJobRun(jobRun, {
      message: `Checked ${summary.checked} Gmail connection${summary.checked === 1 ? "" : "s"}; ${summary.changed} changed; ${summary.failed} failed; ${summary.deferred} deferred.`,
      recordsRead: summary.checked,
      recordsWritten: summary.changed,
      status: gmailConnectionReconciliationStatus(summary),
      summary,
    });

    return NextResponse.json(
      { ok: summary.failed === 0, ...summary },
      {
        status:
          summary.checked > 0 && summary.failed === summary.checked ? 502 : 200,
      },
    );
  } catch (error) {
    await failBackgroundJobRun(jobRun, {
      error,
      message: "Gmail connection reconciliation failed before completion.",
    });
    throw error;
  }
}
