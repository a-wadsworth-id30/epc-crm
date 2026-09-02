import { NextResponse } from "next/server";
import { publicBuildMetadata } from "@/lib/build-metadata";
import { healthDatabaseCheckRequested } from "@/lib/health-check";

type HealthPayload = {
  ok: boolean;
  database: "ok" | "error" | "skipped";
  build: ReturnType<typeof publicBuildMetadata>;
};

type HealthCacheKey = "runtime" | "database";

type CachedHealth = {
  checkedAt: number;
  payload: HealthPayload;
  status: number;
};

const cachedHealth: Partial<Record<HealthCacheKey, CachedHealth>> = {};

const healthCacheTtlMs = 30_000;
const healthHeaders = { "Cache-Control": "private, max-age=30" };

export async function GET(request: Request) {
  const withDatabase = healthDatabaseCheckRequested(request.url);
  const cacheKey: HealthCacheKey = withDatabase ? "database" : "runtime";
  const cached = cachedHealth[cacheKey];

  if (cached && Date.now() - cached.checkedAt < healthCacheTtlMs) {
    return NextResponse.json(cached.payload, {
      status: cached.status,
      headers: healthHeaders,
    });
  }

  if (!withDatabase) {
    const payload: HealthPayload = {
      ok: true,
      database: "skipped",
      build: publicBuildMetadata(),
    };

    cachedHealth[cacheKey] = { checkedAt: Date.now(), payload, status: 200 };

    return NextResponse.json(payload, {
      headers: healthHeaders,
    });
  }

  try {
    const { prisma } = await import("@/lib/prisma");

    await prisma.$queryRaw`SELECT 1`;

    const payload: HealthPayload = {
      ok: true,
      database: "ok",
      build: publicBuildMetadata(),
    };

    cachedHealth[cacheKey] = { checkedAt: Date.now(), payload, status: 200 };

    return NextResponse.json(payload, {
      headers: healthHeaders,
    });
  } catch {
    const payload: HealthPayload = {
      ok: false,
      database: "error",
      build: publicBuildMetadata(),
    };

    cachedHealth[cacheKey] = { checkedAt: Date.now(), payload, status: 503 };

    return NextResponse.json(payload, {
      status: 503,
      headers: healthHeaders,
    });
  }
}
