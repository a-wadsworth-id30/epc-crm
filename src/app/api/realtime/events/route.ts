import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const maxTopics = 24;
const pollMs = 5000;
const heartbeatMs = 25000;
const topicPattern = /^[a-z0-9:_-]{1,160}$/i;

function parseTopics(request: NextRequest) {
  const values = [
    ...request.nextUrl.searchParams.getAll("topic"),
    ...(request.nextUrl.searchParams.get("topics") ?? "").split(","),
  ];

  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value && topicPattern.test(value)),
    ),
  ).slice(0, maxTopics);
}

async function loadVersions(topics: string[]) {
  if (!topics.length) return {};

  const rows = await prisma.realtimeVersion.findMany({
    where: { topic: { in: topics } },
    select: { topic: true, updatedAt: true, version: true },
  });

  return Object.fromEntries(
    topics.map((topic) => {
      const row = rows.find((item) => item.topic === topic);
      return [
        topic,
        row ? `${row.version}:${row.updatedAt.getTime()}` : "0:0",
      ];
    }),
  );
}

function versionSignature(versions: Record<string, string>) {
  return Object.entries(versions)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([topic, version]) => `${topic}=${version}`)
    .join("|");
}

export async function GET(request: NextRequest) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const topics = parseTopics(request);
  if (!topics.length) {
    return NextResponse.json(
      { error: "At least one realtime topic is required." },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();
  let lastSignature = "";
  let isClosed = false;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        if (isClosed) return;
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      }

      async function checkVersions({ initial = false } = {}) {
        if (isClosed) return;

        try {
          const versions = await loadVersions(topics);
          const signature = versionSignature(versions);

          if (initial) {
            lastSignature = signature;
            send("ready", { topics, versions });
            return;
          }

          if (signature !== lastSignature) {
            lastSignature = signature;
            send("update", { topics, versions });
          }
        } catch (error) {
          send("error", {
            message:
              error instanceof Error
                ? error.message
                : "Unable to check realtime updates.",
          });
        }
      }

      await checkVersions({ initial: true });
      pollTimer = setInterval(() => void checkVersions(), pollMs);
      heartbeatTimer = setInterval(
        () => send("heartbeat", { at: Date.now() }),
        heartbeatMs,
      );
    },
    cancel() {
      isClosed = true;
      if (pollTimer) clearInterval(pollTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
    },
  });
}
