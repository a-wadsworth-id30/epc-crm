import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBrowserSoftphoneUser } from "@/lib/telephony/authorization";

const desktopPresenceTtlMs = 10 * 60_000;
const desktopPresenceWriteGuardMs = 4 * 60_000;

function isActive(lastSeenAt: Date | null | undefined) {
  return Boolean(
    lastSeenAt && Date.now() - lastSeenAt.getTime() <= desktopPresenceTtlMs,
  );
}

export async function GET() {
  const authorization = await requireBrowserSoftphoneUser();

  if (!authorization.ok) {
    return authorization.response;
  }

  const user = await prisma.user.findUnique({
    where: { id: authorization.user.id },
    select: { desktopSoftphoneLastSeenAt: true },
  });
  const lastSeenAt = user?.desktopSoftphoneLastSeenAt ?? null;

  return NextResponse.json({
    active: isActive(lastSeenAt),
    lastSeenAt: lastSeenAt?.toISOString() ?? null,
  });
}

export async function POST(request: Request) {
  const authorization = await requireBrowserSoftphoneUser();

  if (!authorization.ok) {
    return authorization.response;
  }

  const payload = (await request.json().catch(() => ({}))) as {
    active?: boolean;
  };
  const lastSeenAt = payload.active === false ? null : new Date();

  if (payload.active === false) {
    await prisma.user.update({
      where: { id: authorization.user.id },
      data: { desktopSoftphoneLastSeenAt: null },
    });
  } else {
    await prisma.user.updateMany({
      where: {
        id: authorization.user.id,
        OR: [
          { desktopSoftphoneLastSeenAt: null },
          {
            desktopSoftphoneLastSeenAt: {
              lt: new Date(Date.now() - desktopPresenceWriteGuardMs),
            },
          },
        ],
      },
      data: { desktopSoftphoneLastSeenAt: lastSeenAt },
    });
  }

  return NextResponse.json({
    ok: true,
    active: isActive(lastSeenAt),
    lastSeenAt: lastSeenAt?.toISOString() ?? null,
  });
}
