import { NextResponse } from "next/server";
import { publicBuildMetadata } from "@/lib/build-metadata";
import { prisma } from "@/lib/prisma";

type HealthPayload = {
  ok: boolean;
  database: "ok" | "error";
  build: ReturnType<typeof publicBuildMetadata>;
};

let cachedHealth: {
  checkedAt: number;
  payload: HealthPayload;
  status: number;
} | null = null;

const healthCacheTtlMs = 30_000;

export async function GET() {
  if (cachedHealth && Date.now() - cachedHealth.checkedAt < healthCacheTtlMs) {
    return NextResponse.json(cachedHealth.payload, {
      status: cachedHealth.status,
      headers: { "Cache-Control": "private, max-age=30" },
    });
  }

  try {
    await prisma.$queryRaw`SELECT 1`;

    const payload: HealthPayload = {
      ok: true,
      database: "ok",
      build: publicBuildMetadata(),
    };

    cachedHealth = { checkedAt: Date.now(), payload, status: 200 };

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, max-age=30" },
    });
  } catch {
    const payload: HealthPayload = {
      ok: false,
      database: "error",
      build: publicBuildMetadata(),
    };

    cachedHealth = { checkedAt: Date.now(), payload, status: 503 };

    return NextResponse.json(payload, {
      status: 503,
      headers: { "Cache-Control": "private, max-age=30" },
    });
  }
}
