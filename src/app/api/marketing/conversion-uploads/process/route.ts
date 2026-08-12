import { NextResponse } from "next/server";
import {
  prepareMarketingConversionUploadsJob,
  processMarketingConversionUploadsJob,
} from "@/lib/actions/marketing-lifecycle";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.MARKETING_UPLOAD_CRON_SECRET;
  if (!secret) return false;

  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  const headerSecret = request.headers.get("x-cron-secret") ?? "";

  return bearer === secret || headerSecret === secret;
}

function uploadLimit(request: Request) {
  const value = Number(new URL(request.url).searchParams.get("limit") ?? "50");

  if (!Number.isFinite(value)) return 50;

  return Math.min(Math.max(Math.floor(value), 1), 250);
}

function uploadDryRun(request: Request) {
  const value = new URL(request.url).searchParams.get("dryRun") ?? "";

  return ["1", "true", "yes"].includes(value.toLowerCase());
}

function uploadPrepare(request: Request) {
  const value = new URL(request.url).searchParams.get("prepare") ?? "";

  return ["1", "true", "yes"].includes(value.toLowerCase());
}

export async function POST(request: Request) {
  if (!process.env.MARKETING_UPLOAD_CRON_SECRET) {
    return NextResponse.json(
      {
        ok: false,
        message: "MARKETING_UPLOAD_CRON_SECRET is not configured.",
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

  const prepareResult = uploadPrepare(request)
    ? await prepareMarketingConversionUploadsJob({ trigger: "api" })
    : null;
  const result = await processMarketingConversionUploadsJob(uploadLimit(request), {
    dryRun: uploadDryRun(request),
    trigger: "api",
  });

  return NextResponse.json({
    ok: true,
    prepare: prepareResult,
    result,
  });
}
