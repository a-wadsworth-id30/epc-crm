import "server-only";

import { headers } from "next/headers";

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function originFromHost(host: string, proto: string | null) {
  const protocol = proto === "http" ? "http" : "https";

  return `${protocol}://${host}`.replace(/\/+$/, "");
}

function configuredOrigin(value: string | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.origin.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function trustedAppBaseUrl(fallback = "https://crm.epc-improvements.co.uk") {
  return (
    configuredOrigin(process.env.APP_BASE_URL) ??
    configuredOrigin(process.env.NEXT_PUBLIC_APP_URL) ??
    configuredOrigin(fallback) ??
    "https://crm.epc-improvements.co.uk"
  );
}

export function appBaseUrlFromRequest(request: Request) {
  const requestUrl = new URL(request.url);
  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));

  if (forwardedHost) {
    return originFromHost(
      forwardedHost,
      firstHeaderValue(request.headers.get("x-forwarded-proto")),
    );
  }

  return requestUrl.origin.replace(/\/+$/, "");
}

export async function appBaseUrlFromHeaders(
  fallback = trustedAppBaseUrl(),
) {
  const headerStore = await headers();
  const host =
    firstHeaderValue(headerStore.get("x-forwarded-host")) ??
    firstHeaderValue(headerStore.get("host"));

  if (host) {
    return originFromHost(
      host,
      firstHeaderValue(headerStore.get("x-forwarded-proto")),
    );
  }

  return fallback.replace(/\/+$/, "");
}
