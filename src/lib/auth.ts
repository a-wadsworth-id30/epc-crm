import "server-only";

import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isBrowserSoftphoneCapable } from "@/lib/telephony/softphone-capability";

export type CurrentUser = {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  landline: string | null;
  mobile: string | null;
  email: string;
  role: "ADMIN" | "USER";
  browserSoftphoneEnabled?: boolean;
};

export const sessionCookieName =
  process.env.SESSION_COOKIE_NAME ?? "id30_crm_session";

function sessionTtlMs() {
  const days = Number(process.env.SESSION_TTL_DAYS ?? "7");
  return days * 24 * 60 * 60 * 1000;
}

function maxActiveSessionsPerUser() {
  const value = Number(process.env.SESSION_MAX_ACTIVE_PER_USER ?? "10");

  return Number.isInteger(value) && value > 0 ? value : 10;
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function shouldRefreshLastSeen(lastSeenAt: Date) {
  return Date.now() - lastSeenAt.getTime() > 30 * 60 * 1000;
}

export function createSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function firstForwardedIp(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

async function pruneUserSessions(userId: string, currentSessionId: string) {
  const now = new Date();
  const maxActiveSessions = maxActiveSessionsPerUser();

  await prisma.session.deleteMany({
    where: { userId, expiresAt: { lte: now } },
  });

  const oldSessions = await prisma.session.findMany({
    where: {
      userId,
      id: { not: currentSessionId },
      expiresAt: { gt: now },
    },
    orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
    skip: Math.max(0, maxActiveSessions - 1),
    select: { id: true },
  });

  if (oldSessions.length) {
    await prisma.session.deleteMany({
      where: { id: { in: oldSessions.map((session) => session.id) } },
    });
  }
}

export async function createSession(userId: string) {
  const token = createSessionToken();
  const headerStore = await headers();
  const expiresAt = new Date(Date.now() + sessionTtlMs());

  const session = await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      userAgent: headerStore.get("user-agent"),
      ipAddress: firstForwardedIp(
        headerStore.get("x-forwarded-for") || headerStore.get("x-real-ip"),
      ),
    },
  });

  await pruneUserSessions(userId, session.id);

  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    maxAge: Math.floor(sessionTtlMs() / 1000),
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroyCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }

  cookieStore.delete(sessionCookieName);
}

export async function getCurrentSessionId() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      expiresAt: true,
      id: true,
      user: {
        select: { status: true },
      },
    },
  });

  if (
    !session ||
    session.expiresAt <= new Date() ||
    session.user.status !== "ACTIVE"
  ) {
    return null;
  }

  return session.id;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (!token) return null;

  let session;

  try {
    session = await prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        expiresAt: true,
        id: true,
        lastSeenAt: true,
        user: {
          select: {
            avatarUrl: true,
            email: true,
            firstName: true,
            id: true,
            landline: true,
            lastName: true,
            mobile: true,
            name: true,
            role: true,
            status: true,
            voiceExtension: true,
            voiceRoutingMode: true,
          },
        },
      },
    });
  } catch (error) {
    console.error("Session lookup failed", error);
    return null;
  }

  if (!session || session.expiresAt <= new Date() || session.user.status !== "ACTIVE") {
    if (session) {
      await prisma.session.deleteMany({ where: { id: session.id } });
    }
    return null;
  }

  if (shouldRefreshLastSeen(session.lastSeenAt)) {
    await prisma.session
      .update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() },
      })
      .catch((error) => console.error("Session lastSeen update failed", error));
  }

  return {
    id: session.user.id,
    name: session.user.name,
    firstName: session.user.firstName,
    lastName: session.user.lastName,
    avatarUrl: session.user.avatarUrl,
    landline: session.user.landline,
    mobile: session.user.mobile,
    email: session.user.email,
    role: session.user.role,
    browserSoftphoneEnabled: isBrowserSoftphoneCapable(session.user),
  };
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/signin");
  }

  return user;
}

export async function requireAdmin() {
  const user = await requireUser();

  if (user.role !== "ADMIN") {
    redirect("/");
  }

  return user;
}
