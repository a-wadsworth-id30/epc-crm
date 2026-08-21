import { NextResponse } from "next/server";
import { readPipedriveValidationSummary } from "@/lib/integrations/pipedrive-validation";

export const dynamic = "force-dynamic";

function validationSecret() {
  return (
    process.env.PIPEDRIVE_VALIDATION_SECRET ||
    process.env.PIPEDRIVE_LEAD_IMPORT_SECRET ||
    process.env.CRON_SECRET ||
    ""
  );
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";

  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

function isAuthorized(request: Request) {
  const secret = validationSecret();
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

function integerQuery(
  request: Request,
  key: string,
  { max, min }: { max: number; min: number },
) {
  const value = Number(new URL(request.url).searchParams.get(key) ?? "");
  if (!Number.isFinite(value)) return null;

  return Math.min(Math.max(Math.trunc(value), min), max);
}

export async function GET(request: Request) {
  if (!validationSecret()) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "PIPEDRIVE_VALIDATION_SECRET, PIPEDRIVE_LEAD_IMPORT_SECRET or CRON_SECRET is not configured.",
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

  const result = await readPipedriveValidationSummary({
    includeWebhookRegistration: !booleanQuery(request, "skipWebhookCheck"),
    limit: integerQuery(request, "limit", { max: 50, min: 1 }),
  });

  return NextResponse.json(
    {
      ok: result.status !== "ERROR",
      result,
    },
    { status: result.status === "ERROR" ? 502 : 200 },
  );
}
