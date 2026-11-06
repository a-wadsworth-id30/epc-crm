import { NextResponse } from "next/server";
import { syncGmailMailbox } from "@/lib/integrations/gmail-sync";
import { prioritizeGmailSyncMailboxes } from "@/lib/integrations/gmail-sync-scheduling";
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

export async function GET(request: Request) {
  if (!cronSecret()) {
    return NextResponse.json(
      { ok: false, message: "GMAIL_SYNC_SECRET or CRON_SECRET is not configured." },
      { status: 503 },
    );
  }
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  const count = await prisma.emailMailbox.count({
    where: { status: "CONNECTED", syncEnabled: true },
  });
  return NextResponse.json({ ok: true, connectedSyncMailboxes: count });
}

export async function POST(request: Request) {
  if (!cronSecret()) {
    return NextResponse.json(
      { ok: false, message: "GMAIL_SYNC_SECRET or CRON_SECRET is not configured." },
      { status: 503 },
    );
  }
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const mailboxLimit = boundedInteger(
    url.searchParams.get("mailboxLimit"),
    2,
    3,
  );
  const maxResults = boundedInteger(
    url.searchParams.get("maxResults"),
    15,
    25,
  );
  const timeBudgetMs = boundedInteger(
    url.searchParams.get("timeBudgetMs"),
    20_000,
    45_000,
    5_000,
  );
  const candidates = await prisma.emailMailbox.findMany({
    where: { status: "CONNECTED", syncEnabled: true },
    orderBy: [{ lastSyncAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    select: {
      createdAt: true,
      emailAddress: true,
      id: true,
      lastHistoryId: true,
      lastSyncAt: true,
      metadata: true,
    },
    take: 50,
  });
  const mailboxes = prioritizeGmailSyncMailboxes(candidates).slice(0, mailboxLimit);
  const startedAt = Date.now();
  const results = [];
  for (const mailbox of mailboxes) {
    if (results.length && Date.now() - startedAt >= timeBudgetMs) break;

    try {
      results.push({
        emailAddress: mailbox.emailAddress,
        ok: true,
        result: await syncGmailMailbox(mailbox.id, { maxResults }),
      });
    } catch (error) {
      results.push({
        emailAddress: mailbox.emailAddress,
        ok: false,
        message: error instanceof Error ? error.message : "Gmail sync failed.",
      });
    }
  }

  const failed = results.filter((result) => !result.ok).length;
  const deferred = mailboxes.length - results.length;
  const backlogPending = results.filter(
    (result) => result.ok && result.result?.hasMore,
  ).length;
  return NextResponse.json(
    {
      backlogPending,
      deferred,
      failed,
      ok: failed === 0,
      processed: results.length,
      results,
    },
    { status: failed === results.length && results.length ? 502 : 200 },
  );
}
