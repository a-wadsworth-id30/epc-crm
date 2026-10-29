import { NextResponse } from "next/server";
import { syncGmailMailbox } from "@/lib/integrations/gmail-sync";
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
) {
  if (!value) return defaultValue;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultValue;

  return Math.min(Math.max(Math.trunc(parsed), 1), maximum);
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
    5,
    5,
  );
  const maxResults = boundedInteger(
    url.searchParams.get("maxResults"),
    25,
    25,
  );
  const mailboxes = await prisma.emailMailbox.findMany({
    where: { status: "CONNECTED", syncEnabled: true },
    orderBy: [{ lastSyncAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    select: { emailAddress: true, id: true },
    take: mailboxLimit,
  });
  const results = [];
  for (const mailbox of mailboxes) {
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
  return NextResponse.json(
    { ok: failed === 0, failed, processed: results.length, results },
    { status: failed === results.length && results.length ? 502 : 200 },
  );
}
