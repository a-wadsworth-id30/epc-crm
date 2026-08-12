import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function telephonyVersion() {
  const [queueEntry, callLog, agent] = await Promise.all([
    prisma.callQueueEntry.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    prisma.callLog.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    prisma.user.findFirst({
      where: {
        voiceRoutingMode: { in: ["BROWSER", "FLEX"] },
      },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ]);

  return [
    queueEntry?.updatedAt.getTime() ?? 0,
    callLog?.updatedAt.getTime() ?? 0,
    agent?.updatedAt.getTime() ?? 0,
  ].join(":");
}

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const encoder = new TextEncoder();
  let lastVersion = "";
  let isClosed = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      async function sendIfChanged() {
        if (isClosed) return;

        try {
          const version = await telephonyVersion();
          if (version !== lastVersion) {
            lastVersion = version;
            controller.enqueue(
              encoder.encode(
                `event: telephony\ndata: ${JSON.stringify({ version })}\n\n`,
              ),
            );
          }
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({
                message:
                  error instanceof Error
                    ? error.message
                    : "Unable to check telephony updates.",
              })}\n\n`,
            ),
          );
        }
      }

      await sendIfChanged();
      timer = setInterval(sendIfChanged, 5000);
    },
    cancel() {
      isClosed = true;
      if (timer) {
        clearInterval(timer);
      }
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
