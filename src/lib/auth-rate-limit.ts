import "server-only";

import crypto from "node:crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { isPrismaDatabaseUnavailableError } from "@/lib/prisma-errors";

type RateLimitState = {
  attempts: number;
  blockedUntil: Date | null;
  windowStartedAt: Date;
};

export type AuthRateLimitPolicy = {
  blockMs: number;
  maxAttempts: number;
  windowMs: number;
};

export type AuthRateLimitRule = {
  key: string;
  policy: AuthRateLimitPolicy;
};

export type AuthRateLimitContext = {
  ipAddress: string;
  userAgent: string | null;
};

function nowMs() {
  return Date.now();
}

function dateFromMs(value: number) {
  return new Date(value);
}

function hashIdentifier(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normaliseIdentifier(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function firstForwardedIp(value: string | null) {
  return value?.split(",")[0]?.trim() || "unknown";
}

function isExpiredState(
  state: RateLimitState | null,
  policy: AuthRateLimitPolicy,
  now: number,
) {
  if (!state) return true;

  const windowExpired = now - state.windowStartedAt.getTime() > policy.windowMs;
  const blockExpired =
    state.blockedUntil !== null && state.blockedUntil.getTime() <= now;

  return windowExpired || blockExpired;
}

function freshState(now: number): RateLimitState {
  return {
    attempts: 0,
    blockedUntil: null,
    windowStartedAt: dateFromMs(now),
  };
}

async function activeState(key: string, policy: AuthRateLimitPolicy, now: number) {
  let current: RateLimitState | null = null;

  try {
    current = await prisma.authRateLimitBucket.findUnique({
      where: { key },
      select: {
        attempts: true,
        blockedUntil: true,
        windowStartedAt: true,
      },
    });
  } catch (error) {
    if (isPrismaDatabaseUnavailableError(error)) {
      console.warn(
        "Auth rate limit database is unavailable; allowing request without persisted rate-limit state.",
      );
      return freshState(now);
    }

    throw error;
  }

  if (current && !isExpiredState(current, policy, now)) {
    return current;
  }

  try {
    return await prisma.authRateLimitBucket.upsert({
      where: { key },
      create: {
        key,
        attempts: 0,
        blockedUntil: null,
        windowStartedAt: dateFromMs(now),
      },
      update: {
        attempts: 0,
        blockedUntil: null,
        windowStartedAt: dateFromMs(now),
      },
      select: {
        attempts: true,
        blockedUntil: true,
        windowStartedAt: true,
      },
    });
  } catch (error) {
    if (isPrismaDatabaseUnavailableError(error)) {
      console.warn(
        "Auth rate limit database is unavailable; allowing request without persisted rate-limit state.",
      );
      return freshState(now);
    }

    throw error;
  }
}

export function authRateLimitKey(scope: string, identifier: string) {
  return `${scope}:${hashIdentifier(normaliseIdentifier(identifier))}`;
}

export async function authRateLimitContext(): Promise<AuthRateLimitContext> {
  const headerStore = await headers();

  return {
    ipAddress: firstForwardedIp(
      headerStore.get("x-forwarded-for") || headerStore.get("x-real-ip"),
    ),
    userAgent: headerStore.get("user-agent"),
  };
}

export async function checkAuthRateLimits(rules: AuthRateLimitRule[]) {
  const now = nowMs();
  let retryAfterMs = 0;

  for (const rule of rules) {
    const state = await activeState(rule.key, rule.policy, now);

    if (state.blockedUntil && state.blockedUntil.getTime() > now) {
      retryAfterMs = Math.max(
        retryAfterMs,
        state.blockedUntil.getTime() - now,
      );
    }
  }

  if (retryAfterMs > 0) {
    return {
      ok: false as const,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    };
  }

  return { ok: true as const };
}

export async function recordAuthRateLimitAttempt(rules: AuthRateLimitRule[]) {
  const now = nowMs();
  let retryAfterMs = 0;

  for (const rule of rules) {
    let state: { blockedUntil: Date | null };

    try {
      state = await prisma.$transaction(async (tx) => {
        const current = await tx.authRateLimitBucket.findUnique({
          where: { key: rule.key },
          select: {
            attempts: true,
            blockedUntil: true,
            windowStartedAt: true,
          },
        });
        const baseState =
          current && !isExpiredState(current, rule.policy, now)
            ? current
            : freshState(now);
        const attempts = baseState.attempts + 1;
        const blockedUntil =
          attempts >= rule.policy.maxAttempts
            ? dateFromMs(now + rule.policy.blockMs)
            : baseState.blockedUntil;

        return tx.authRateLimitBucket.upsert({
          where: { key: rule.key },
          create: {
            key: rule.key,
            attempts,
            blockedUntil,
            windowStartedAt: baseState.windowStartedAt,
          },
          update: {
            attempts,
            blockedUntil,
            windowStartedAt: baseState.windowStartedAt,
          },
          select: {
            blockedUntil: true,
          },
        });
      });
    } catch (error) {
      if (isPrismaDatabaseUnavailableError(error)) {
        console.warn(
          "Auth rate limit database is unavailable; skipping persisted rate-limit attempt.",
        );
        continue;
      }

      throw error;
    }

    if (state.blockedUntil && state.blockedUntil.getTime() > now) {
      retryAfterMs = Math.max(
        retryAfterMs,
        state.blockedUntil.getTime() - now,
      );
    }
  }

  if (retryAfterMs > 0) {
    return {
      blocked: true as const,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    };
  }

  return { blocked: false as const };
}

export async function resetAuthRateLimits(rules: AuthRateLimitRule[]) {
  try {
    await prisma.authRateLimitBucket.deleteMany({
      where: { key: { in: rules.map((rule) => rule.key) } },
    });
  } catch (error) {
    if (isPrismaDatabaseUnavailableError(error)) {
      console.warn(
        "Auth rate limit database is unavailable; skipping persisted rate-limit reset.",
      );
      return;
    }

    throw error;
  }
}

export function formatRetryAfter(seconds: number) {
  const minutes = Math.max(1, Math.ceil(seconds / 60));

  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}
