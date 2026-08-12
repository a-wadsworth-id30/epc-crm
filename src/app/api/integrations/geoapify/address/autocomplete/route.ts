import { NextResponse, type NextRequest } from "next/server";
import {
  authRateLimitContext,
  authRateLimitKey,
  checkAuthRateLimits,
  recordAuthRateLimitAttempt,
  type AuthRateLimitRule,
} from "@/lib/auth-rate-limit";
import { requireApiUser } from "@/lib/api-auth";
import { getGeoapifyRuntimeConfig } from "@/lib/integrations/geoapify";
import { normalizeGeoapifyAddressResults } from "@/lib/integrations/geoapify-addresses";
import { getCrmSettings } from "@/lib/settings";
import { parseWorkspaceDefaults } from "@/lib/workspace-defaults";

const defaultLimit = 6;
const geoapifyTimeoutMs = 5_000;
const maxLimit = 8;
const minQueryLength = 3;

function parseLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultLimit;

  return Math.max(1, Math.min(Math.floor(parsed), maxLimit));
}

function isIsoCountryCode(value: string | null) {
  return Boolean(value && /^[A-Z]{2}$/.test(value));
}

function isLanguageCode(value: string) {
  return /^[a-z]{2}$/.test(value);
}

function addressLookupRateLimitRules({
  ipAddress,
  userId,
}: {
  ipAddress: string;
  userId: string;
}): AuthRateLimitRule[] {
  return [
    {
      key: authRateLimitKey("geoapify-address:user", userId),
      policy: {
        blockMs: 60 * 1000,
        maxAttempts: 90,
        windowMs: 5 * 60 * 1000,
      },
    },
    {
      key: authRateLimitKey("geoapify-address:ip", ipAddress),
      policy: {
        blockMs: 60 * 1000,
        maxAttempts: 180,
        windowMs: 5 * 60 * 1000,
      },
    },
  ];
}

function rateLimitedResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    {
      ok: false,
      message: "Address lookup is temporarily rate limited.",
      retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser();

  if (!auth.ok) {
    return auth.response;
  }

  const [settings, rateLimitContext] = await Promise.all([
    getCrmSettings(),
    authRateLimitContext(),
  ]);
  const user = auth.user;
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim();
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));

  if (query.length < minQueryLength) {
    return NextResponse.json(
      { ok: true, query, suggestions: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const rateLimitRules = addressLookupRateLimitRules({
    ipAddress: rateLimitContext.ipAddress,
    userId: user.id,
  });
  const limitCheck = await checkAuthRateLimits(rateLimitRules);
  if (!limitCheck.ok) {
    return rateLimitedResponse(limitCheck.retryAfterSeconds);
  }

  const attempt = await recordAuthRateLimitAttempt(rateLimitRules);
  if (attempt.blocked) {
    return rateLimitedResponse(attempt.retryAfterSeconds);
  }

  const workspaceDefaults = parseWorkspaceDefaults(settings.workspaceDefaults);
  const runtimeConfig = await getGeoapifyRuntimeConfig({
    workspaceCountry: workspaceDefaults.country,
  });

  if (!runtimeConfig.apiKey) {
    return NextResponse.json(
      {
        ok: false,
        message: "Address lookup is not configured.",
        suggestions: [],
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  const lookupUrl = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
  lookupUrl.searchParams.set("text", query.slice(0, 160));
  lookupUrl.searchParams.set("format", "json");
  lookupUrl.searchParams.set("limit", String(limit));
  lookupUrl.searchParams.set(
    "lang",
    isLanguageCode(runtimeConfig.language) ? runtimeConfig.language : "en",
  );
  if (isIsoCountryCode(runtimeConfig.countryFilter)) {
    lookupUrl.searchParams.set(
      "filter",
      `countrycode:${runtimeConfig.countryFilter?.toLowerCase()}`,
    );
  }
  lookupUrl.searchParams.set("apiKey", runtimeConfig.apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), geoapifyTimeoutMs);

  try {
    const response = await fetch(lookupUrl, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as {
      results?: unknown;
    } | null;

    if (!response.ok) {
      const credentialRejected =
        response.status === 401 || response.status === 403;

      return NextResponse.json(
        {
          ok: false,
          message: credentialRejected
            ? "Address lookup credentials were rejected."
            : "Address lookup provider returned an error.",
          suggestions: [],
        },
        {
          status: credentialRejected ? 502 : response.status,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    const suggestions = normalizeGeoapifyAddressResults(
      payload?.results,
      limit,
    );

    return NextResponse.json(
      { ok: true, query, suggestions },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";

    if (timedOut) {
      console.warn("Geoapify address lookup timed out");
    } else {
      console.error("Geoapify address lookup failed", error);
    }

    return NextResponse.json(
      {
        ok: false,
        message: timedOut
          ? "Address lookup provider timed out."
          : "Address lookup provider is unavailable.",
        suggestions: [],
      },
      {
        status: timedOut ? 504 : 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } finally {
    clearTimeout(timeout);
  }
}
