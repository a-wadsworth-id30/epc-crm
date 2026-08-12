import { NextResponse } from "next/server";
import {
  attributionDomainAccessForRequest,
  type AttributionDomainAccess,
} from "@/lib/attribution/domain-access";

export const defaultAttributionPayloadLimitBytes = 256 * 1024;

export class AttributionRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AttributionRequestError";
    this.status = status;
  }
}

function allowedOrigins() {
  return (process.env.ATTRIBUTION_ALLOWED_ORIGINS ?? "*")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function attributionCorsHeaders(request: Request) {
  const requestOrigin = request.headers.get("origin") ?? "";
  const origins = allowedOrigins();
  const allowOrigin =
    origins.includes("*") || !requestOrigin
      ? "*"
      : origins.includes(requestOrigin)
        ? requestOrigin
        : origins[0] ?? "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Accept",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function attributionOptionsResponse(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: attributionCorsHeaders(request),
  });
}

export function attributionJsonResponse(
  request: Request,
  body: unknown,
  init?: ResponseInit,
) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...attributionCorsHeaders(request),
      ...(init?.headers ?? {}),
    },
  });
}

export function attributionRequestErrorResponse(
  request: Request,
  error: unknown,
) {
  const status =
    error instanceof AttributionRequestError ? error.status : 400;
  const message =
    error instanceof Error ? error.message : "Invalid attribution request.";

  return attributionJsonResponse(request, { error: message }, { status });
}

export async function readAttributionRequestPayload(
  request: Request,
  {
    maxBytes = defaultAttributionPayloadLimitBytes,
  }: {
    maxBytes?: number;
  } = {},
) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);

  if (
    Number.isFinite(contentLength) &&
    contentLength > 0 &&
    contentLength > maxBytes
  ) {
    throw new AttributionRequestError("Attribution payload is too large.", 413);
  }

  const text = await request.text().catch(() => {
    throw new AttributionRequestError("Attribution payload could not be read.", 400);
  });

  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new AttributionRequestError("Attribution payload is too large.", 413);
  }

  const trimmed = text.trim();
  if (!trimmed) return {};

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const looksJson = trimmed.startsWith("{") || trimmed.startsWith("[");

  if (contentType.includes("application/json") || looksJson) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      throw new AttributionRequestError("Invalid attribution JSON payload.", 400);
    }
  }

  return Object.fromEntries(new URLSearchParams(text));
}

export async function requireAttributionDomainAccess(
  request: Request,
): Promise<
  | { ok: true; domainAccess: AttributionDomainAccess }
  | { ok: false; response: NextResponse }
> {
  const domainAccess = await attributionDomainAccessForRequest(request);

  if (domainAccess.enabled) {
    return { ok: true, domainAccess };
  }

  return {
    ok: false,
    response: attributionJsonResponse(
      request,
      {
        error: "Attribution is not enabled for this domain.",
        domain: {
          hostname: domainAccess.hostname,
          registered: domainAccess.registered,
          enabled: domainAccess.enabled,
          reason: domainAccess.reason,
        },
      },
      { status: 403 },
    ),
  };
}

export function requestIpAddress(request: Request) {
  return (
    request.headers.get("x-id30-geo-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}

export type AttributionRequestLocation = {
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  timezone: string | null;
  source: "netlify-geo" | "cdn-header" | "ip-geolocation" | "combined";
};

function headerString(request: Request, key: string) {
  const value = request.headers.get(key);
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "unknown") return null;

  try {
    return decodeURIComponent(trimmed.replace(/\+/g, " "));
  } catch {
    return trimmed;
  }
}

function firstString(...values: Array<unknown>) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function parseGeoHeader(value: string | null) {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function nestedGeoValue(
  geo: Record<string, unknown>,
  key: string,
  nestedKey?: string,
) {
  const value = geo[key];
  if (!nestedKey) return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return (value as Record<string, unknown>)[nestedKey];
}

function publicIpAddress(value: string | null) {
  if (!value) return null;

  const ip = value
    .trim()
    .replace(/^\[|\]$/g, "")
    .replace(/^::ffff:/i, "");

  if (!ip || ip === "::1" || ip.toLowerCase().startsWith("fe80:")) return null;
  if (/^f[cd][0-9a-f]{2}:/i.test(ip)) return null;

  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part))) {
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return null;
    if (a === 169 && b === 254) return null;
    if (a === 172 && b >= 16 && b <= 31) return null;
    if (a === 192 && b === 168) return null;
  }

  return ip;
}

function countryName(countryCode: string | null) {
  if (!countryCode) return null;

  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(countryCode) ?? null;
  } catch {
    return null;
  }
}

function ipGeolocationUrl(ipAddress: string) {
  const template = process.env.ATTRIBUTION_IP_GEOLOCATION_URL?.trim();
  if (!template) return null;

  if (template.includes("{ip}")) {
    return template.replaceAll("{ip}", encodeURIComponent(ipAddress));
  }

  const separator = template.includes("?") ? "&" : "?";
  return `${template}${separator}ip=${encodeURIComponent(ipAddress)}`;
}

function responseString(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

async function ipLocation(
  ipAddress: string | null,
): Promise<AttributionRequestLocation | null> {
  const ip = publicIpAddress(ipAddress);
  if (!ip) return null;

  const url = ipGeolocationUrl(ip);
  if (!url) return null;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(1200),
    });
    if (!response.ok) return null;

    const parsed = (await response.json()) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

    const record = parsed as Record<string, unknown>;
    const countryCode = responseString(
      record,
      "countryCode",
      "country_code",
      "country_code2",
      "country",
    )?.toUpperCase() ?? null;
    const explicitCountry = responseString(record, "countryName", "country_name");
    const location = {
      city: responseString(record, "city", "locality"),
      region: responseString(record, "regionName", "region_name", "region"),
      country: explicitCountry ?? countryName(countryCode),
      countryCode,
      timezone: responseString(record, "timezone", "time_zone"),
      source: "ip-geolocation" as const,
    };

    return Object.entries(location).some(
      ([key, value]) => key !== "source" && Boolean(value),
    )
      ? location
      : null;
  } catch {
    return null;
  }
}

export async function requestLocation(
  request: Request,
): Promise<AttributionRequestLocation | null> {
  const netlifyGeo = parseGeoHeader(request.headers.get("x-nf-geo"));
  const id30GeoSource = headerString(request, "x-id30-geo-source");
  const cloudflareCountry = headerString(request, "cf-ipcountry");
  const countryCode = firstString(
    headerString(request, "x-id30-geo-country-code"),
    nestedGeoValue(netlifyGeo, "country", "code"),
    netlifyGeo.countryCode,
    netlifyGeo.country_code,
    headerString(request, "x-vercel-ip-country"),
    cloudflareCountry,
    headerString(request, "x-country-code"),
  )?.toUpperCase() ?? null;
  const headerLocation = {
    city: firstString(
      headerString(request, "x-id30-geo-city"),
      netlifyGeo.city,
      nestedGeoValue(netlifyGeo, "city", "name"),
      headerString(request, "x-vercel-ip-city"),
      headerString(request, "x-city"),
      headerString(request, "cf-ipcity"),
    ),
    region: firstString(
      headerString(request, "x-id30-geo-region"),
      netlifyGeo.region,
      netlifyGeo.subdivision,
      nestedGeoValue(netlifyGeo, "subdivision", "name"),
      headerString(request, "x-vercel-ip-country-region"),
      headerString(request, "x-region"),
      headerString(request, "cf-region"),
    ),
    country: firstString(
      headerString(request, "x-id30-geo-country"),
      nestedGeoValue(netlifyGeo, "country", "name"),
      netlifyGeo.country,
      headerString(request, "x-country"),
    ) ?? countryName(countryCode),
    countryCode,
    timezone: firstString(
      headerString(request, "x-id30-geo-timezone"),
      netlifyGeo.timezone,
      headerString(request, "x-vercel-ip-timezone"),
      headerString(request, "x-timezone"),
    ),
    source:
      id30GeoSource === "netlify-geo"
        ? ("netlify-geo" as const)
        : ("cdn-header" as const),
  };
  const hasHeaderLocation = Object.entries(headerLocation).some(
    ([key, value]) => key !== "source" && Boolean(value),
  );
  const fallbackLocation = await ipLocation(requestIpAddress(request));

  if (!hasHeaderLocation) {
    return fallbackLocation;
  }

  const location = {
    city: headerLocation.city ?? fallbackLocation?.city ?? null,
    region: headerLocation.region ?? fallbackLocation?.region ?? null,
    country: headerLocation.country ?? fallbackLocation?.country ?? null,
    countryCode: headerLocation.countryCode ?? fallbackLocation?.countryCode ?? null,
    timezone: headerLocation.timezone ?? fallbackLocation?.timezone ?? null,
    source: fallbackLocation ? "combined" : headerLocation.source,
  } satisfies AttributionRequestLocation;

  return Object.values(location).some(Boolean) ? location : null;
}
