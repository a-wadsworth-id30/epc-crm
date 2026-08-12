import { NextResponse } from "next/server";
import {
  defaultMarketingRollupWindowDays,
  maxMarketingRollupWindowDays,
  refreshMarketingDailyRollups,
} from "@/lib/marketing/daily-rollups";
import { isPrismaMissingSchemaError } from "@/lib/prisma-errors";

export const dynamic = "force-dynamic";

function rollupSecret() {
  return process.env.MARKETING_ROLLUP_SECRET || process.env.CRON_SECRET || "";
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";

  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

function isAuthorized(request: Request) {
  const secret = rollupSecret();
  if (!secret) return false;

  return (
    bearerToken(request) === secret ||
    request.headers.get("x-cron-secret") === secret
  );
}

function booleanQuery(request: Request, key: string, defaultValue = false) {
  const value = new URL(request.url).searchParams.get(key) ?? "";
  if (!value) return defaultValue;

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function windowDays(request: Request) {
  const value = Number(new URL(request.url).searchParams.get("windowDays") ?? "");
  if (!Number.isFinite(value)) return defaultMarketingRollupWindowDays;

  return Math.min(
    Math.max(Math.floor(value), 1),
    maxMarketingRollupWindowDays,
  );
}

async function rollupResponse(request: Request, dryRun: boolean) {
  if (!rollupSecret()) {
    return NextResponse.json(
      {
        ok: false,
        message: "MARKETING_ROLLUP_SECRET or CRON_SECRET is not configured.",
      },
      { status: 503 },
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        ok: false,
        message: "Unauthorized.",
      },
      { status: 401 },
    );
  }

  let result;

  try {
    result = await refreshMarketingDailyRollups({
      dryRun,
      trigger: dryRun ? "api-dry-run" : "api",
      windowDays: windowDays(request),
    });
  } catch (error) {
    if (
      isPrismaMissingSchemaError(error, {
        modelName: "MarketingDailyRollup",
        tableName: "MarketingDailyRollup",
      })
    ) {
      return NextResponse.json(
        {
          ok: false,
          code: "MARKETING_ROLLUP_SCHEMA_PENDING",
          message:
            "Marketing rollup storage is not available yet. Apply the latest Prisma migrations, then retry.",
        },
        { status: 503 },
      );
    }

    throw error;
  }

  return NextResponse.json({
    ok: true,
    result,
  });
}

export async function GET(request: Request) {
  return rollupResponse(request, true);
}

export async function POST(request: Request) {
  return rollupResponse(request, booleanQuery(request, "dryRun"));
}
