import { NextResponse } from "next/server";
import {
  pipedriveWebhookRegistrationApproval,
  planPipedriveWebhookRegistration,
  runPipedriveWebhookRegistration,
} from "@/lib/integrations/pipedrive-webhook-registration";

export const dynamic = "force-dynamic";

function registrationSecret() {
  return (
    process.env.PIPEDRIVE_WEBHOOK_REGISTRATION_SECRET ||
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
  const secret = registrationSecret();
  if (!secret) return false;

  return (
    bearerToken(request) === secret ||
    request.headers.get("x-cron-secret") === secret
  );
}

function booleanQuery(request: Request, key: string) {
  const value = new URL(request.url).searchParams.get(key) ?? "";

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function providerWriteApproval(request: Request) {
  const url = new URL(request.url);

  return (
    request.headers.get("x-provider-write-approval")?.trim() ||
    url.searchParams.get("providerWriteApproval")?.trim() ||
    null
  );
}

async function responseForRegistration(request: Request, apply: boolean) {
  if (!registrationSecret()) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "PIPEDRIVE_WEBHOOK_REGISTRATION_SECRET, PIPEDRIVE_LEAD_IMPORT_SECRET or CRON_SECRET is not configured.",
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

  const result = apply
    ? await runPipedriveWebhookRegistration({
        providerWriteApproval: providerWriteApproval(request),
      })
    : await planPipedriveWebhookRegistration();

  return NextResponse.json(
    {
      approvalRequiredForApply: pipedriveWebhookRegistrationApproval,
      ok: result.status !== "ERROR",
      result,
    },
    { status: result.status === "ERROR" ? 502 : 200 },
  );
}

export async function GET(request: Request) {
  return responseForRegistration(request, false);
}

export async function POST(request: Request) {
  return responseForRegistration(request, booleanQuery(request, "apply"));
}
