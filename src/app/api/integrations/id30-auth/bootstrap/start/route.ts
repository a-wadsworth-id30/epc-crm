import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { hasCredentialEncryptionKey } from "@/lib/crypto/secrets";
import { appBaseUrlFromRequest } from "@/lib/http/origin";

const stateCookieName = "id30_auth_bootstrap_state";
const bootstrapTtlMs = 10 * 60_000;

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function authBaseUrl() {
  return (process.env.ID30_AUTH_BASE_URL || "https://auth.id30.com").replace(/\/+$/, "");
}

function redirectToSettings(request: Request, status: string, message?: string) {
  const url = new URL("/settings/integrations/id30-auth", appBaseUrlFromRequest(request));
  url.searchParams.set("authSetup", status);

  if (message) {
    url.searchParams.set("message", message);
  }

  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const user = await requireAdmin();

  if (!hasCredentialEncryptionKey()) {
    return redirectToSettings(
      request,
      "failed",
      "Set CREDENTIAL_ENCRYPTION_KEY before connecting iD30 Auth.",
    );
  }

  const crmBaseUrl = appBaseUrlFromRequest(request);
  const state = crypto.randomBytes(24).toString("base64url");
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + bootstrapTtlMs);
  const payload = {
    appName: process.env.NEXT_PUBLIC_APP_NAME || "iD30 CRM",
    bootstrapCallbackUrl: `${crmBaseUrl}/api/integrations/id30-auth/bootstrap/callback`,
    callbackUrl: `${crmBaseUrl}/api/integrations/oauth/complete`,
    crmOrigin: crmBaseUrl,
    requestedByEmail: user.email,
    requestedByUserId: user.id,
    returnUrl: `${crmBaseUrl}/settings/integrations/id30-auth`,
    state,
    suggestedClientId: crmBaseUrl
      .replace(/^https?:\/\//, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase(),
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  const url = new URL("/crm/bootstrap", authBaseUrl());
  url.searchParams.set("request", base64UrlEncode(JSON.stringify(payload)));

  const response = NextResponse.redirect(url);
  response.cookies.set(stateCookieName, state, {
    httpOnly: true,
    maxAge: Math.floor(bootstrapTtlMs / 1000),
    path: "/api/integrations/id30-auth/bootstrap",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
