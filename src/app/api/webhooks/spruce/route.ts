import { NextResponse } from "next/server";
import { getSpruceZapierRuntimeConfig } from "@/lib/integrations/spruce-zapier";
import { processSpruceZapierWebhook } from "@/lib/integrations/spruce-zapier-webhooks";

export const dynamic = "force-dynamic";

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

function isAuthorized(request: Request, secret: string) {
  if (
    bearerToken(request) === secret ||
    request.headers.get("x-spruce-webhook-secret") === secret ||
    request.headers.get("x-zapier-webhook-secret") === secret
  ) {
    return true;
  }

  return basicCredentials(request)?.password === secret;
}

export async function POST(request: Request) {
  const config = await getSpruceZapierRuntimeConfig();

  if (!config.webhookSecret) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "SPRUCE_WEBHOOK_SECRET, ZAPIER_SPRUCE_WEBHOOK_SECRET or a saved Spruce/Zapier webhook secret is not configured.",
      },
      { status: 503 },
    );
  }

  if (!isAuthorized(request, config.webhookSecret)) {
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

  const result = await processSpruceZapierWebhook(payload);

  return NextResponse.json(
    {
      ok: result.status !== "ERROR",
      result,
    },
    { status: result.status === "ERROR" ? 502 : 200 },
  );
}
