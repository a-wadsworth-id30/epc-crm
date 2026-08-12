import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { appBaseUrlFromRequest } from "@/lib/http/origin";
import { id30AuthIdentifierSchema } from "@/lib/integrations/id30-auth";
import { saveId30AuthIntegrationConfig } from "@/lib/integrations/id30-auth-admin";

const stateCookieName = "id30_auth_bootstrap_state";

const bootstrapExchangeResponseSchema = z.object({
  ok: z.literal(true),
  setup: z.object({
    authBaseUrl: z.string().trim().url().optional(),
    baseUrl: z.string().trim().url().optional(),
    crmClientId: id30AuthIdentifierSchema,
    sharedSecret: z.string().trim().min(32),
    workspaceId: id30AuthIdentifierSchema.optional(),
  }),
});

function authBaseUrl() {
  return (process.env.ID30_AUTH_BASE_URL || "https://auth.id30.com").replace(/\/+$/, "");
}

function redirectToSettings(request: Request, status: string, message?: string) {
  const url = new URL("/settings/integrations/id30-auth", appBaseUrlFromRequest(request));
  url.searchParams.set("authSetup", status);

  if (message) {
    url.searchParams.set("message", message);
  }

  const response = NextResponse.redirect(url);
  response.cookies.delete({
    name: stateCookieName,
    path: "/api/integrations/id30-auth/bootstrap",
  });

  return response;
}

function errorMessage(value: unknown, fallback: string) {
  if (value && typeof value === "object" && "message" in value) {
    const message = (value as { message?: unknown }).message;

    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }

  return fallback;
}

export async function GET(request: Request) {
  await requireAdmin();

  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim();
  const state = url.searchParams.get("state")?.trim();
  const cookieState = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${stateCookieName}=`))
    ?.slice(stateCookieName.length + 1);

  if (!code || !state || !cookieState || state !== decodeURIComponent(cookieState)) {
    return redirectToSettings(
      request,
      "failed",
      "iD30 Auth bootstrap state could not be verified. Start the setup again.",
    );
  }

  let body: unknown;

  try {
    const response = await fetch(new URL("/api/crm/bootstrap/exchange", authBaseUrl()), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code,
        state,
        crmOrigin: appBaseUrlFromRequest(request),
      }),
      cache: "no-store",
    });

    body = await response.json().catch(() => ({}));

    if (!response.ok) {
      return redirectToSettings(
        request,
        "failed",
        errorMessage(body, `iD30 Auth bootstrap failed with HTTP ${response.status}.`),
      );
    }
  } catch (error) {
    return redirectToSettings(
      request,
      "failed",
      error instanceof Error ? error.message : "iD30 Auth bootstrap exchange failed.",
    );
  }

  const parsed = bootstrapExchangeResponseSchema.safeParse(body);

  if (!parsed.success) {
    return redirectToSettings(
      request,
      "failed",
      "iD30 Auth bootstrap response was incomplete.",
    );
  }

  const result = await saveId30AuthIntegrationConfig({
    baseUrl:
      parsed.data.setup.baseUrl ??
      parsed.data.setup.authBaseUrl ??
      authBaseUrl(),
    crmClientId: parsed.data.setup.crmClientId,
    sharedSecret: parsed.data.setup.sharedSecret,
    source: "bootstrap",
    workspaceId:
      parsed.data.setup.workspaceId ?? parsed.data.setup.crmClientId,
  });

  return redirectToSettings(
    request,
    result.ok ? "connected" : "failed",
    result.ok ? undefined : result.message,
  );
}
