import { NextResponse } from "next/server";
import { processPipedriveWebhook } from "@/lib/integrations/pipedrive-webhooks";

export const dynamic = "force-dynamic";

function pipedriveWebhookSecret() {
  return (
    process.env.PIPEDRIVE_WEBHOOK_SECRET ||
    process.env.PIPEDRIVE_LEAD_IMPORT_SECRET ||
    process.env.CRON_SECRET ||
    ""
  );
}

function expectedBasicUser() {
  return process.env.PIPEDRIVE_WEBHOOK_BASIC_USER?.trim() || "";
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";

  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

function basicCredentials(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Basic ")) return null;

  try {
    const decoded = Buffer.from(
      authorization.slice("Basic ".length).trim(),
      "base64",
    ).toString("utf8");
    const separator = decoded.indexOf(":");

    if (separator < 0) return null;

    return {
      password: decoded.slice(separator + 1),
      username: decoded.slice(0, separator),
    };
  } catch {
    return null;
  }
}

function isAuthorized(request: Request) {
  const secret = pipedriveWebhookSecret();
  if (!secret) return false;

  if (
    bearerToken(request) === secret ||
    request.headers.get("x-pipedrive-webhook-secret") === secret
  ) {
    return true;
  }

  const basic = basicCredentials(request);
  if (!basic || basic.password !== secret) return false;

  const user = expectedBasicUser();
  return !user || basic.username === user;
}

export async function POST(request: Request) {
  if (!pipedriveWebhookSecret()) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "PIPEDRIVE_WEBHOOK_SECRET, PIPEDRIVE_LEAD_IMPORT_SECRET or CRON_SECRET is not configured.",
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

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "Invalid JSON payload.",
      },
      { status: 400 },
    );
  }

  const result = await processPipedriveWebhook(payload);

  return NextResponse.json(
    {
      ok: result.status !== "ERROR",
      result,
    },
    { status: result.status === "ERROR" ? 502 : 200 },
  );
}
