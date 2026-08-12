import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBrowserSoftphoneUser } from "@/lib/telephony/authorization";

const validStatuses = ["AVAILABLE", "BUSY", "AWAY", "OFFLINE"] as const;
const heartbeatWriteGuardMs = 3 * 60 * 1000;

export async function GET() {
  const authorization = await requireBrowserSoftphoneUser();

  if (!authorization.ok) {
    return authorization.response;
  }

  const { user } = authorization;
  const current = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      voiceAvailability: true,
      voiceLastSeenAt: true,
    },
  });

  return NextResponse.json({
    availability: current?.voiceAvailability ?? "OFFLINE",
    lastSeenAt: current?.voiceLastSeenAt ?? null,
  });
}

export async function POST(request: Request) {
  const authorization = await requireBrowserSoftphoneUser();

  if (!authorization.ok) {
    return authorization.response;
  }

  const { user } = authorization;
  const payload = (await request.json().catch(() => ({}))) as {
    availability?: string;
    mode?: string;
  };
  const availability = payload.availability?.toUpperCase();
  const mode =
    payload.mode === "heartbeat" || payload.mode === "activate"
      ? payload.mode
      : null;

  if (mode) {
    const current = await prisma.user.findUnique({
      where: { id: user.id },
      select: { voiceAvailability: true, voiceLastSeenAt: true },
    });
    const shouldActivate =
      mode === "activate" && current?.voiceAvailability === "OFFLINE";
    const nextAvailability = shouldActivate
      ? "AVAILABLE"
      : current?.voiceAvailability ?? "OFFLINE";
    const now = new Date();
    const staleHeartbeatBefore = new Date(
      now.getTime() - heartbeatWriteGuardMs,
    );

    await prisma.user.updateMany({
      where: {
        id: user.id,
        OR: [
          ...(shouldActivate
            ? [{ voiceAvailability: "OFFLINE" as const }]
            : []),
          { voiceLastSeenAt: null },
          { voiceLastSeenAt: { lt: staleHeartbeatBefore } },
        ],
      },
      data: {
        ...(shouldActivate ? { voiceAvailability: "AVAILABLE" as const } : {}),
        voiceLastSeenAt: now,
      },
    });

    return NextResponse.json({
      ok: true,
      availability: nextAvailability,
    });
  }

  if (!availability || !validStatuses.includes(availability as never)) {
    return NextResponse.json(
      { error: "Choose a valid availability status." },
      { status: 400 },
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      voiceAvailability: availability as (typeof validStatuses)[number],
      voiceLastSeenAt: new Date(),
    },
  });

  return NextResponse.json({
    ok: true,
    availability,
  });
}
