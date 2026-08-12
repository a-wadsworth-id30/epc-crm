import "server-only";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  decryptSecret,
  encryptSecret,
  hasCredentialEncryptionKey,
} from "@/lib/crypto/secrets";
import { appBaseUrlFromRequest } from "@/lib/http/origin";
import {
  getId30AuthRuntimeConfig,
  id30AuthIdentifierSchema,
} from "@/lib/integrations/id30-auth";
import {
  marketingIntegrationProviders,
  marketingProviderSelectorOptionsSchema,
  type MarketingProviderSelectorOptions,
  type MarketingIntegrationProviderSlug,
} from "@/lib/marketing/integrations";
import {
  isAccountSelectableMarketingProviderSlug,
  withConfiguredMarketingProviderSelections,
} from "@/lib/marketing/selector-options";
import { prisma } from "@/lib/prisma";

type MarketingOAuthProvider = {
  authBroker: boolean;
  authUrl: string;
  description: string;
  envPrefix: string;
  name: string;
  provider: string;
  scopes: string[];
  slug: MarketingIntegrationProviderSlug;
  tokenUrl: string;
};

type OAuthCredentials = {
  clientId: string;
  clientSecret: string;
};

type OAuthCredentialSource = OAuthCredentials & {
  source: "app" | "env";
};

type ResolvedId30AuthRuntimeConfig = NonNullable<
  Awaited<ReturnType<typeof getId30AuthRuntimeConfig>>
>;

const authBrokerCompletionStatuses = [
  "connected",
  "failed",
  "reconnect_required",
] as const;

const authBrokerCompletionPayloadSchema = z
  .object({
    crmClientId: id30AuthIdentifierSchema,
    workspaceId: id30AuthIdentifierSchema,
    provider: z.string().trim().min(1),
    connectionId: z.string().trim().min(1).optional(),
    status: z.enum(authBrokerCompletionStatuses),
    selectorOptions: z.record(z.string(), z.unknown()).optional(),
    connectedAt: z.string().datetime().optional(),
    errorRef: z.string().trim().min(1).optional(),
    issuedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
  })
  .passthrough()
  .superRefine((payload, context) => {
    if (payload.status === "connected" && !payload.connectionId) {
      context.addIssue({
        code: "custom",
        message: "Connected callbacks must include an Auth connection ID.",
        path: ["connectionId"],
      });
    }
  });

type MarketingAuthBrokerCompletionStatus =
  (typeof authBrokerCompletionStatuses)[number];

type MarketingAuthBrokerCompletionPayload = z.infer<
  typeof authBrokerCompletionPayloadSchema
>;

type MarketingAuthBrokerCompletionVerification =
  | {
      ok: true;
      payload: MarketingAuthBrokerCompletionPayload;
      provider: MarketingOAuthProvider;
    }
  | {
      ok: false;
      status: number;
      message: string;
    };

type MarketingAuthBrokerConnectionResult =
  | {
      ok: true;
      connection: {
        id: string;
        provider: string;
        reconnectRequired: boolean;
        status: string;
        authStatus?: string;
        lastError?: string | null;
      };
      selectorOptions: MarketingProviderSelectorOptions;
    }
  | {
      ok: false;
      status: number;
      message: string;
    };

type MarketingAuthBrokerProviderReadinessResult =
  | {
      ok: true;
      checkedAt: string | null;
      providers: Array<{
        callbackUrl?: string;
        missingEnv: string[];
        name: string;
        ready: boolean;
        scopes: string[];
        slug: string;
      }>;
    }
  | {
      ok: false;
      status: number;
      message: string;
    };

const authBrokerProviderDiagnosticStatuses = [
  "error",
  "needed",
  "planned",
  "ready",
  "warning",
] as const;

type MarketingAuthBrokerProviderDiagnosticStatus =
  (typeof authBrokerProviderDiagnosticStatuses)[number];

export type MarketingAuthBrokerProviderDiagnosticsResult =
  | {
      ok: true;
      checkedAt: string;
      provider: {
        callbackUrl?: string;
        missingEnv: string[];
        name: string;
        ready: boolean;
        scopes: string[];
        slug: string;
      };
      connection: {
        id: string;
        providerAccountId?: string | null;
        providerAccountName?: string | null;
        status: string;
        authStatus?: string;
        reconnectRequired: boolean;
        selectorCounts: Record<string, number>;
        selectorOptionCount: number;
        selectorWarning?: string | null;
        lastError?: string | null;
        lastRefreshAt?: string | null;
        connectedAt?: string | null;
        updatedAt?: string | null;
      } | null;
      checks: Array<{
        createdAt?: string | null;
        detail: string;
        label: string;
        stage: string;
        status: MarketingAuthBrokerProviderDiagnosticStatus;
      }>;
      audits: Array<{
        action: string;
        connectionId?: string | null;
        createdAt: string;
        id: string;
        level: string;
        message: string;
      }>;
    }
  | {
      ok: false;
      status: number;
      message: string;
    };

type MarketingAuthBrokerConversionUploadStatus =
  | "FAILED"
  | "READY"
  | "SENT"
  | "SKIPPED"
  | "WAITING";

type MarketingAuthBrokerConversionUploadResult =
  | {
      ok: true;
      provider: string;
      result: {
        status: MarketingAuthBrokerConversionUploadStatus;
        message: string;
        checks: Array<{
          detail: string;
          label: string;
          ready: boolean;
        }>;
        response?: Record<string, unknown>;
      };
    }
  | {
      ok: false;
      status: number;
      message: string;
    };

type MarketingAuthBrokerKlaviyoReportingStatus = "READY" | "WAITING";

type MarketingAuthBrokerKlaviyoReportingRow = {
  accountId: string;
  campaignId: string;
  campaignName?: string | null;
  clicks?: number;
  conversions?: number;
  date: string;
  impressions?: number;
  metadata: Record<string, unknown>;
};

type MarketingAuthBrokerKlaviyoReportingResult =
  | {
      ok: true;
      provider: "klaviyo";
      result: {
        status: MarketingAuthBrokerKlaviyoReportingStatus;
        message: string;
        read: number;
        rows: MarketingAuthBrokerKlaviyoReportingRow[];
        source?: string;
        written: number;
      };
    }
  | {
      ok: false;
      status: number;
      message: string;
    };

const authBrokerConnectionResponseSchema = z.object({
  ok: z.literal(true),
  connection: z
    .object({
      id: z.string().trim().min(1),
      provider: z.string().trim().min(1),
      reconnectRequired: z.boolean().default(false),
      status: z.string().trim().min(1),
      authStatus: z.string().trim().optional(),
      lastError: z.string().nullable().optional(),
    })
    .passthrough(),
  selectorOptions: marketingProviderSelectorOptionsSchema.optional(),
});

const authBrokerProviderReadinessResponseSchema = z.object({
  ok: z.literal(true),
  checkedAt: z.string().datetime().nullable().optional(),
  providers: z.array(
    z
      .object({
        callbackUrl: z.string().url().optional(),
        missingEnv: z.array(z.string().trim().min(1)).default([]),
        name: z.string().trim().min(1),
        ready: z.boolean(),
        scopes: z.array(z.string()).default([]),
        slug: z.string().trim().min(1),
      })
      .passthrough(),
  ),
});

const authBrokerProviderDiagnosticsResponseSchema = z.object({
  ok: z.literal(true),
  checkedAt: z.string().datetime(),
  provider: z
    .object({
      callbackUrl: z.string().url().optional(),
      missingEnv: z.array(z.string().trim().min(1)).default([]),
      name: z.string().trim().min(1),
      ready: z.boolean(),
      scopes: z.array(z.string()).default([]),
      slug: z.string().trim().min(1),
    })
    .passthrough(),
  connection: z
    .object({
      id: z.string().trim().min(1),
      providerAccountId: z.string().nullable().optional(),
      providerAccountName: z.string().nullable().optional(),
      status: z.string().trim().min(1),
      authStatus: z.string().trim().optional(),
      reconnectRequired: z.boolean().default(false),
      selectorCounts: z.record(z.string(), z.number()).default({}),
      selectorOptionCount: z.number().default(0),
      selectorWarning: z.string().nullable().optional(),
      lastError: z.string().nullable().optional(),
      lastRefreshAt: z.string().datetime().nullable().optional(),
      connectedAt: z.string().datetime().nullable().optional(),
      updatedAt: z.string().datetime().nullable().optional(),
    })
    .passthrough()
    .nullable(),
  checks: z.array(
    z
      .object({
        createdAt: z.string().datetime().nullable().optional(),
        detail: z.string(),
        label: z.string().trim().min(1),
        stage: z.string().trim().min(1),
        status: z.enum(authBrokerProviderDiagnosticStatuses),
      })
      .passthrough(),
  ),
  audits: z
    .array(
      z
        .object({
          action: z.string().trim().min(1),
          connectionId: z.string().nullable().optional(),
          createdAt: z.string().datetime(),
          id: z.string().trim().min(1),
          level: z.string().trim().min(1),
          message: z.string(),
        })
        .passthrough(),
    )
    .default([]),
});

const authBrokerConversionUploadResponseSchema = z.object({
  ok: z.literal(true),
  provider: z.string().trim().min(1),
  result: z.object({
    status: z.enum(["READY", "SKIPPED", "WAITING", "SENT", "FAILED"]),
    message: z.string().trim().min(1),
    checks: z
      .array(
        z.object({
          detail: z.string(),
          label: z.string(),
          ready: z.boolean(),
        }),
      )
      .default([]),
    response: z.record(z.string(), z.unknown()).optional(),
  }),
});

const authBrokerKlaviyoReportingResponseSchema = z.object({
  ok: z.literal(true),
  provider: z.literal("klaviyo"),
  result: z.object({
    status: z.enum(["READY", "WAITING"]),
    message: z.string().trim().min(1),
    read: z.number().int().nonnegative().default(0),
    rows: z
      .array(
        z
          .object({
            accountId: z.string().trim().min(1),
            campaignId: z.string().trim().min(1),
            campaignName: z.string().nullable().optional(),
            clicks: z.number().finite().optional(),
            conversions: z.number().finite().optional(),
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            impressions: z.number().finite().optional(),
            metadata: z.record(z.string(), z.unknown()).default({}),
          })
          .passthrough(),
      )
      .default([]),
    source: z.string().trim().min(1).optional(),
    written: z.number().int().nonnegative().default(0),
  }),
});

const graphApiVersion = process.env.META_GRAPH_API_VERSION || "v23.0";

function envFlag(key: string) {
  const value = process.env[key]?.trim().toLowerCase();

  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function linkedinAdsScopes() {
  const scopes = ["r_ads", "rw_ads", "r_ads_reporting"];

  if (envFlag("LINKEDIN_ADS_REQUEST_CONVERSION_SCOPE")) {
    scopes.push("rw_conversions");
  }

  return scopes;
}

const oauthProviders: MarketingOAuthProvider[] = [
  {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    authBroker: true,
    description:
      "Google OAuth credentials used for Ads API offline conversion uploads.",
    envPrefix: "GOOGLE_ADS",
    name: "Google Ads",
    provider: marketingIntegrationProviders.googleAds,
    scopes: ["https://www.googleapis.com/auth/adwords"],
    slug: "google-ads",
    tokenUrl: "https://oauth2.googleapis.com/token",
  },
  {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    authBroker: true,
    description:
      "Google OAuth credentials used for GA4 Data API reporting access.",
    envPrefix: "GOOGLE_ANALYTICS",
    name: "Google Analytics",
    provider: marketingIntegrationProviders.googleAnalytics,
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
    slug: "google-analytics",
    tokenUrl: "https://oauth2.googleapis.com/token",
  },
  {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    authBroker: true,
    description:
      "Google OAuth credentials used for Search Console site and organic performance access.",
    envPrefix: "GOOGLE_SEARCH_CONSOLE",
    name: "Google Search Console",
    provider: marketingIntegrationProviders.googleSearchConsole,
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
    slug: "google-search-console",
    tokenUrl: "https://oauth2.googleapis.com/token",
  },
  {
    authUrl: "https://www.klaviyo.com/oauth/authorize",
    authBroker: true,
    description:
      "Klaviyo OAuth credentials used for lifecycle marketing account, list and reporting access.",
    envPrefix: "KLAVIYO",
    name: "Klaviyo",
    provider: marketingIntegrationProviders.klaviyo,
    scopes: [
      "accounts:read",
      "campaigns:read",
      "flows:read",
      "forms:read",
      "lists:read",
      "metrics:read",
      "segments:read",
    ],
    slug: "klaviyo",
    tokenUrl: "https://a.klaviyo.com/oauth/token",
  },
  {
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    authBroker: true,
    description:
      "Microsoft OAuth credentials used for Bing Ads offline conversion uploads.",
    envPrefix: "MICROSOFT_ADS",
    name: "Bing Ads",
    provider: marketingIntegrationProviders.bingAds,
    scopes: ["offline_access", "https://ads.microsoft.com/msads.manage"],
    slug: "bing-ads",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
  },
  {
    authUrl: `https://www.facebook.com/${graphApiVersion}/dialog/oauth`,
    authBroker: true,
    description:
      "Meta OAuth credentials used for Conversions API event uploads.",
    envPrefix: "META_ADS",
    name: "Meta",
    provider: marketingIntegrationProviders.meta,
    scopes: ["ads_management", "business_management"],
    slug: "meta",
    tokenUrl: `https://graph.facebook.com/${graphApiVersion}/oauth/access_token`,
  },
  {
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    authBroker: true,
    description:
      "LinkedIn OAuth credentials used for Ads account, Insight Tag and conversion mapping.",
    envPrefix: "LINKEDIN_ADS",
    name: "LinkedIn Ads",
    provider: marketingIntegrationProviders.linkedInAds,
    scopes: linkedinAdsScopes(),
    slug: "linkedin-ads",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
  },
];

export function findMarketingOAuthProvider(slug: string) {
  return oauthProviders.find((provider) => provider.slug === slug) ?? null;
}

export function marketingOAuthStateCookie(provider: MarketingOAuthProvider) {
  return `id30_marketing_oauth_${provider.slug}`;
}

export function marketingOAuthRedirectPath(
  provider: Pick<MarketingOAuthProvider, "slug">,
  status: string,
) {
  return `/settings/integrations/${provider.slug}?oauth=${encodeURIComponent(status)}`;
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function marketingConfigJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function oauthEnv(provider: MarketingOAuthProvider): OAuthCredentialSource | null {
  const clientId = process.env[`${provider.envPrefix}_OAUTH_CLIENT_ID`];
  const clientSecret = process.env[`${provider.envPrefix}_OAUTH_CLIENT_SECRET`];

  if (!clientId || !clientSecret) return null;

  return { clientId, clientSecret, source: "env" };
}

function encryptedCredential(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function oauthAppCredentials(
  provider: MarketingOAuthProvider,
): Promise<OAuthCredentialSource | null> {
  const connection = await prisma.integrationConnection.findUnique({
    where: { provider: provider.provider },
    select: { config: true },
  });
  const credentials = jsonObject(jsonObject(connection?.config).credentials);
  const encryptedClientId = encryptedCredential(credentials.oauthClientId);
  const encryptedClientSecret = encryptedCredential(credentials.oauthClientSecret);

  if (!encryptedClientId || !encryptedClientSecret) return null;

  return {
    clientId: decryptSecret(encryptedClientId),
    clientSecret: decryptSecret(encryptedClientSecret),
    source: "app",
  };
}

async function marketingOAuthCredentials(provider: MarketingOAuthProvider) {
  return oauthEnv(provider) ?? (await oauthAppCredentials(provider));
}

export async function marketingOAuthConfigured(provider: MarketingOAuthProvider) {
  if (provider.slug === "klaviyo") {
    return provider.authBroker && (await marketingAuthBrokerConfigured());
  }

  return (
    (provider.authBroker && (await marketingAuthBrokerConfigured())) ||
    Boolean(await marketingOAuthCredentials(provider))
  );
}

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
}

function signAuthBrokerPayload(payloadSegment: string, secret: string) {
  return base64UrlEncode(
    crypto.createHmac("sha256", secret).update(payloadSegment).digest(),
  );
}

function sha256Base64Url(value: string | Buffer) {
  return crypto.createHash("sha256").update(value).digest("base64url");
}

function authBrokerApiSignature({
  connectionId,
  contentDigest,
  crmClientId,
  expiresAt,
  issuedAt,
  method,
  pathname,
  requestId,
  secret,
  workspaceId,
}: {
  connectionId: string;
  contentDigest?: string;
  crmClientId: string;
  expiresAt: string;
  issuedAt: string;
  method: string;
  pathname: string;
  requestId?: string;
  secret: string;
  workspaceId: string;
}) {
  return signAuthBrokerPayload(
    [
      method.toUpperCase(),
      pathname,
      crmClientId,
      workspaceId,
      connectionId,
      ...(requestId ? [requestId] : []),
      issuedAt,
      expiresAt,
      ...(contentDigest ? [contentDigest] : []),
    ].join("\n"),
    secret,
  );
}

function authBrokerSignedHeaders({
  authBroker,
  body,
  connectionId,
  contentType,
  expiresAt,
  issuedAt,
  method,
  pathname,
}: {
  authBroker: ResolvedId30AuthRuntimeConfig;
  body?: string;
  connectionId: string;
  contentType?: string;
  expiresAt: string;
  issuedAt: string;
  method: "DELETE" | "GET" | "POST";
  pathname: string;
}) {
  const contentDigest = body === undefined ? undefined : sha256Base64Url(body);
  const requestId = crypto.randomUUID();

  return {
    ...(contentType ? { "content-type": contentType } : {}),
    ...(contentDigest ? { "x-id30-content-sha256": contentDigest } : {}),
    "x-id30-crm-client-id": authBroker.crmClientId,
    "x-id30-crm-request-id": requestId,
    "x-id30-workspace-id": authBroker.workspaceId,
    "x-id30-issued-at": issuedAt,
    "x-id30-expires-at": expiresAt,
    "x-id30-signature": authBrokerApiSignature({
      connectionId,
      contentDigest,
      crmClientId: authBroker.crmClientId,
      expiresAt,
      issuedAt,
      method,
      pathname,
      requestId,
      secret: authBroker.sharedSecret,
      workspaceId: authBroker.workspaceId,
    }),
  };
}

function signaturesMatch(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

export async function marketingAuthBrokerConfigured() {
  return Boolean(await getId30AuthRuntimeConfig());
}

export async function marketingAuthBrokerStartUrl({
  provider,
  request,
  userId,
}: {
  provider: Pick<MarketingOAuthProvider, "authBroker" | "slug">;
  request: Request;
  userId: string;
}) {
  if (!provider.authBroker) return null;

  const authBroker = await getId30AuthRuntimeConfig();

  if (!authBroker) {
    return null;
  }

  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 10 * 60_000);
  const payload = {
    crmClientId: authBroker.crmClientId,
    workspaceId: authBroker.workspaceId,
    provider: provider.slug,
    returnUrl: `${appBaseUrlFromRequest(request)}/settings/integrations/${provider.slug}`,
    requestedByUserId: userId,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  const payloadSegment = base64UrlEncode(JSON.stringify(payload));
  const signatureSegment = signAuthBrokerPayload(
    payloadSegment,
    authBroker.sharedSecret,
  );
  const url = new URL(`/connect/${provider.slug}`, authBroker.baseUrl);
  url.searchParams.set("request", `${payloadSegment}.${signatureSegment}`);

  return url;
}

async function marketingAuthBrokerConnectionRequest({
  connectionId,
  method,
  pathname,
}: {
  connectionId: string;
  method: "DELETE" | "GET" | "POST";
  pathname: string;
}): Promise<MarketingAuthBrokerConnectionResult> {
  const authBroker = await getId30AuthRuntimeConfig();

  if (!authBroker) {
    return {
      ok: false,
      status: 503,
      message: "iD30 Auth broker is not configured.",
    };
  }

  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 10 * 60_000);
  const issuedAtIso = issuedAt.toISOString();
  const expiresAtIso = expiresAt.toISOString();
  const url = new URL(pathname, authBroker.baseUrl);
  const response = await fetch(url, {
    method,
    headers: authBrokerSignedHeaders({
      authBroker,
      connectionId,
      expiresAt: expiresAtIso,
      issuedAt: issuedAtIso,
      method,
      pathname,
    }),
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message:
        stringValue(body.message) ||
        `iD30 Auth connection request failed with HTTP ${response.status}.`,
    };
  }

  const parsed = authBrokerConnectionResponseSchema.safeParse(body);

  if (!parsed.success) {
    return {
      ok: false,
      status: 502,
      message: "iD30 Auth connection response was incomplete.",
    };
  }

  return {
    ok: true,
    connection: parsed.data.connection,
    selectorOptions: parsed.data.selectorOptions ?? {},
  };
}

export async function fetchMarketingAuthBrokerConnection({
  connectionId,
}: {
  connectionId: string;
}) {
  return marketingAuthBrokerConnectionRequest({
    connectionId,
    method: "GET",
    pathname: `/api/crm/connections/${encodeURIComponent(connectionId)}`,
  });
}

export async function disconnectMarketingAuthBrokerConnection({
  connectionId,
}: {
  connectionId: string;
}) {
  return marketingAuthBrokerConnectionRequest({
    connectionId,
    method: "DELETE",
    pathname: `/api/crm/connections/${encodeURIComponent(connectionId)}`,
  });
}

export async function refreshMarketingAuthBrokerSelectors({
  connectionId,
}: {
  connectionId: string;
}) {
  return marketingAuthBrokerConnectionRequest({
    connectionId,
    method: "POST",
    pathname: `/api/crm/connections/${encodeURIComponent(connectionId)}/selectors/refresh`,
  });
}

export async function fetchMarketingAuthBrokerProviderReadiness(): Promise<
  MarketingAuthBrokerProviderReadinessResult
> {
  const authBroker = await getId30AuthRuntimeConfig();

  if (!authBroker) {
    return {
      ok: false,
      status: 503,
      message: "iD30 Auth broker is not configured.",
    };
  }

  const pathname = "/api/crm/providers";
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 10 * 60_000);
  const issuedAtIso = issuedAt.toISOString();
  const expiresAtIso = expiresAt.toISOString();
  const response = await fetch(new URL(pathname, authBroker.baseUrl), {
    method: "GET",
    headers: authBrokerSignedHeaders({
      authBroker,
      connectionId: "__providers__",
      expiresAt: expiresAtIso,
      issuedAt: issuedAtIso,
      method: "GET",
      pathname,
    }),
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message:
        stringValue(body.message) ||
        `iD30 Auth provider readiness lookup failed with HTTP ${response.status}.`,
    };
  }

  const parsed = authBrokerProviderReadinessResponseSchema.safeParse(body);

  if (!parsed.success) {
    return {
      ok: false,
      status: 502,
      message: "iD30 Auth provider readiness response was incomplete.",
    };
  }

  return {
    ok: true,
    checkedAt: parsed.data.checkedAt ?? null,
    providers: parsed.data.providers,
  };
}

export async function fetchMarketingAuthBrokerProviderDiagnostics({
  provider,
}: {
  provider: MarketingIntegrationProviderSlug;
}): Promise<MarketingAuthBrokerProviderDiagnosticsResult> {
  const oauthProvider = findMarketingOAuthProvider(provider);

  if (!oauthProvider?.authBroker) {
    return {
      ok: false,
      status: 400,
      message: "This marketing provider is not managed by iD30 Auth.",
    };
  }

  const authBroker = await getId30AuthRuntimeConfig();

  if (!authBroker) {
    return {
      ok: false,
      status: 503,
      message: "iD30 Auth broker is not configured.",
    };
  }

  const pathname = `/api/crm/providers/${encodeURIComponent(provider)}/diagnostics`;
  const signatureScope = `__provider_diagnostics__:${provider}`;
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 10 * 60_000);
  const issuedAtIso = issuedAt.toISOString();
  const expiresAtIso = expiresAt.toISOString();
  const response = await fetch(new URL(pathname, authBroker.baseUrl), {
    method: "GET",
    headers: authBrokerSignedHeaders({
      authBroker,
      connectionId: signatureScope,
      expiresAt: expiresAtIso,
      issuedAt: issuedAtIso,
      method: "GET",
      pathname,
    }),
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message:
        stringValue(body.message) ||
        `iD30 Auth provider diagnostics failed with HTTP ${response.status}.`,
    };
  }

  const parsed = authBrokerProviderDiagnosticsResponseSchema.safeParse(body);

  if (!parsed.success) {
    return {
      ok: false,
      status: 502,
      message: "iD30 Auth provider diagnostics response was incomplete.",
    };
  }

  return parsed.data;
}

async function marketingAuthBrokerConversionUploadRequest({
  action,
  connectionId,
  payload,
}: {
  action: "inspect" | "send";
  connectionId: string;
  payload: Record<string, unknown>;
}): Promise<MarketingAuthBrokerConversionUploadResult> {
  const authBroker = await getId30AuthRuntimeConfig();

  if (!authBroker) {
    return {
      ok: false,
      status: 503,
      message: "iD30 Auth broker is not configured.",
    };
  }

  const pathname = `/api/crm/connections/${encodeURIComponent(connectionId)}/conversion-uploads/${action}`;
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 10 * 60_000);
  const issuedAtIso = issuedAt.toISOString();
  const expiresAtIso = expiresAt.toISOString();
  const requestBody = JSON.stringify(payload);
  const response = await fetch(new URL(pathname, authBroker.baseUrl), {
    method: "POST",
    headers: authBrokerSignedHeaders({
      authBroker,
      body: requestBody,
      connectionId,
      contentType: "application/json",
      expiresAt: expiresAtIso,
      issuedAt: issuedAtIso,
      method: "POST",
      pathname,
    }),
    body: requestBody,
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message:
        stringValue(body.message) ||
        `iD30 Auth conversion ${action} failed with HTTP ${response.status}.`,
    };
  }

  const parsed = authBrokerConversionUploadResponseSchema.safeParse(body);

  if (!parsed.success) {
    return {
      ok: false,
      status: 502,
      message: `iD30 Auth conversion ${action} response was incomplete.`,
    };
  }

  return parsed.data;
}

export async function inspectMarketingAuthBrokerConversionUpload({
  connectionId,
  payload,
}: {
  connectionId: string;
  payload: Record<string, unknown>;
}) {
  return marketingAuthBrokerConversionUploadRequest({
    action: "inspect",
    connectionId,
    payload,
  });
}

export async function sendMarketingAuthBrokerConversionUpload({
  connectionId,
  payload,
}: {
  connectionId: string;
  payload: Record<string, unknown>;
}) {
  return marketingAuthBrokerConversionUploadRequest({
    action: "send",
    connectionId,
    payload,
  });
}

export async function fetchMarketingAuthBrokerKlaviyoReporting({
  config,
  connectionId,
}: {
  config: unknown;
  connectionId: string;
}): Promise<MarketingAuthBrokerKlaviyoReportingResult> {
  const authBroker = await getId30AuthRuntimeConfig();

  if (!authBroker) {
    return {
      ok: false,
      status: 503,
      message: "iD30 Auth broker is not configured.",
    };
  }

  const pathname = `/api/crm/connections/${encodeURIComponent(connectionId)}/reporting/klaviyo`;
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 10 * 60_000);
  const issuedAtIso = issuedAt.toISOString();
  const expiresAtIso = expiresAt.toISOString();
  const requestBody = JSON.stringify({ config });
  const response = await fetch(new URL(pathname, authBroker.baseUrl), {
    method: "POST",
    headers: authBrokerSignedHeaders({
      authBroker,
      body: requestBody,
      connectionId,
      contentType: "application/json",
      expiresAt: expiresAtIso,
      issuedAt: issuedAtIso,
      method: "POST",
      pathname,
    }),
    body: requestBody,
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message:
        stringValue(body.message) ||
        `iD30 Auth Klaviyo reporting import failed with HTTP ${response.status}.`,
    };
  }

  const parsed = authBrokerKlaviyoReportingResponseSchema.safeParse(body);

  if (!parsed.success) {
    return {
      ok: false,
      status: 502,
      message: "iD30 Auth Klaviyo reporting response was incomplete.",
    };
  }

  return parsed.data;
}

function authBrokerCompletionSegmentsFromBody(body: unknown):
  | {
      payloadSegment: string;
      signatureSegment: string;
    }
  | null {
  if (typeof body === "string" && body.trim()) {
    const [payloadSegment, signatureSegment] = body.trim().split(".");
    return payloadSegment && signatureSegment
      ? { payloadSegment, signatureSegment }
      : null;
  }

  const objectBody = jsonObject(body);
  const token = stringValue(objectBody.token);

  if (token) {
    const [payloadSegment, signatureSegment] = token.split(".");
    return payloadSegment && signatureSegment
      ? { payloadSegment, signatureSegment }
      : null;
  }

  const signatureSegment = stringValue(objectBody.signature);
  const rawPayload = objectBody.payload;

  if (!signatureSegment) {
    return null;
  }

  if (typeof rawPayload === "string" && rawPayload.trim()) {
    return {
      payloadSegment: rawPayload.trim(),
      signatureSegment,
    };
  }

  if (rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)) {
    return {
      payloadSegment: base64UrlEncode(JSON.stringify(rawPayload)),
      signatureSegment,
    };
  }

  return null;
}

function timestampValidationError(payload: MarketingAuthBrokerCompletionPayload) {
  const now = Date.now();
  const issuedAt = Date.parse(payload.issuedAt);
  const expiresAt = Date.parse(payload.expiresAt);

  if (Number.isNaN(issuedAt) || Number.isNaN(expiresAt)) {
    return "Completion callback timestamps are invalid.";
  }

  if (issuedAt > now + 60_000) {
    return "Completion callback was issued in the future.";
  }

  if (expiresAt <= now) {
    return "Completion callback has expired.";
  }

  if (expiresAt - issuedAt > 10 * 60_000) {
    return "Completion callback expiry window is too long.";
  }

  return null;
}

export async function verifyMarketingAuthBrokerCompletion(
  body: unknown,
): Promise<MarketingAuthBrokerCompletionVerification> {
  const authBroker = await getId30AuthRuntimeConfig();

  if (!authBroker) {
    return {
      ok: false,
      status: 503,
      message: "iD30 Auth shared secret is not configured.",
    };
  }

  const segments = authBrokerCompletionSegmentsFromBody(body);

  if (!segments) {
    return {
      ok: false,
      status: 400,
      message: "Signed completion callback is missing or malformed.",
    };
  }

  const expectedSignature = signAuthBrokerPayload(
    segments.payloadSegment,
    authBroker.sharedSecret,
  );

  if (!signaturesMatch(expectedSignature, segments.signatureSegment)) {
    return {
      ok: false,
      status: 401,
      message: "Signed completion callback signature is invalid.",
    };
  }

  let decodedPayload: unknown;

  try {
    decodedPayload = JSON.parse(base64UrlDecode(segments.payloadSegment));
  } catch {
    return {
      ok: false,
      status: 400,
      message: "Signed completion callback payload is invalid JSON.",
    };
  }

  const parsed = authBrokerCompletionPayloadSchema.safeParse(decodedPayload);

  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      message: "Signed completion callback payload is incomplete.",
    };
  }

  const payload = parsed.data;

  if (payload.crmClientId !== authBroker.crmClientId) {
    return {
      ok: false,
      status: 403,
      message: "Signed completion callback CRM client does not match this app.",
    };
  }

  if (payload.workspaceId !== authBroker.workspaceId) {
    return {
      ok: false,
      status: 403,
      message: "Signed completion callback workspace does not match this app.",
    };
  }

  const timestampError = timestampValidationError(payload);

  if (timestampError) {
    return {
      ok: false,
      status: 400,
      message: timestampError,
    };
  }

  const provider = findMarketingOAuthProvider(payload.provider);

  if (!provider) {
    return {
      ok: false,
      status: 400,
      message: "Signed completion callback provider is not supported.",
    };
  }

  return {
    ok: true,
    payload,
    provider,
  };
}

export function marketingOAuthRedirectUri(
  request: Request,
  provider: MarketingOAuthProvider,
) {
  return `${appBaseUrlFromRequest(request)}/api/marketing/oauth/${provider.slug}/callback`;
}

export async function marketingOAuthStartUrl(
  request: Request,
  provider: MarketingOAuthProvider,
  state: string,
) {
  const credentials = await marketingOAuthCredentials(provider);
  if (!credentials) return null;

  const url = new URL(provider.authUrl);
  url.searchParams.set("client_id", credentials.clientId);
  url.searchParams.set("redirect_uri", marketingOAuthRedirectUri(request, provider));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", provider.scopes.join(" "));
  url.searchParams.set("state", state);

  if (
    provider.slug === "google-ads" ||
    provider.slug === "google-analytics" ||
    provider.slug === "google-search-console"
  ) {
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
  }

  return url;
}

export function createMarketingOAuthState() {
  return crypto.randomBytes(24).toString("base64url");
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

async function exchangeCodeForToken({
  code,
  provider,
  request,
}: {
  code: string;
  provider: MarketingOAuthProvider;
  request: Request;
}) {
  const credentials = await marketingOAuthCredentials(provider);
  if (!credentials) {
    throw new Error("OAuth client ID and secret are not configured.");
  }

  const body = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: marketingOAuthRedirectUri(request, provider),
  });

  const response = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      stringValue(data.error_description) ||
        stringValue(data.error_message) ||
        stringValue(data.error) ||
        "OAuth token exchange failed.",
    );
  }

  return data;
}

async function exchangeMetaLongLivedToken(
  provider: MarketingOAuthProvider,
  shortLivedToken: string,
) {
  const credentials = await marketingOAuthCredentials(provider);
  if (!credentials) return shortLivedToken;

  const url = new URL(provider.tokenUrl);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", credentials.clientId);
  url.searchParams.set("client_secret", credentials.clientSecret);
  url.searchParams.set("fb_exchange_token", shortLivedToken);

  const response = await fetch(url);
  const data = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      stringValue(data.error_description) ||
        stringValue(jsonObject(data.error).message) ||
        "Meta long-lived token exchange failed.",
    );
  }

  return stringValue(data.access_token) || shortLivedToken;
}

export async function saveMarketingOAuthCredentials({
  code,
  provider,
  request,
}: {
  code: string;
  provider: MarketingOAuthProvider;
  request: Request;
}) {
  if (!hasCredentialEncryptionKey()) {
    throw new Error("Set CREDENTIAL_ENCRYPTION_KEY before connecting OAuth.");
  }

  const tokenData = await exchangeCodeForToken({ code, provider, request });
  const credentials = await marketingOAuthCredentials(provider);
  if (!credentials) {
    throw new Error("OAuth client ID and secret are not configured.");
  }

  const existing = await prisma.integrationConnection.findUnique({
    where: { provider: provider.provider },
    select: { config: true },
  });
  const currentConfig = jsonObject(existing?.config);
  const currentCredentials = jsonObject(currentConfig.credentials);
  const nextCredentials: Record<string, unknown> = {
    ...currentCredentials,
    oauthConnectedAt: new Date().toISOString(),
  };

  if (credentials.source === "app") {
    nextCredentials.oauthClientId = encryptSecret(credentials.clientId);
    nextCredentials.oauthClientSecret = encryptSecret(credentials.clientSecret);
  } else {
    delete nextCredentials.oauthClientId;
    delete nextCredentials.oauthClientSecret;
  }

  if (provider.slug === "meta" || provider.slug === "linkedin-ads") {
    const shortLivedToken = stringValue(tokenData.access_token);
    if (!shortLivedToken) {
      throw new Error(`${provider.name} did not return an access token.`);
    }

    const accessToken =
      provider.slug === "meta"
        ? await exchangeMetaLongLivedToken(provider, shortLivedToken)
        : shortLivedToken;
    nextCredentials.accessToken = encryptSecret(accessToken);
  } else {
    const refreshToken = stringValue(tokenData.refresh_token);
    if (!refreshToken) {
      throw new Error(
        `${provider.name} did not return a refresh token. Reconnect and grant offline access.`,
      );
    }

    nextCredentials.refreshToken = encryptSecret(refreshToken);
  }

  await prisma.integrationConnection.upsert({
    where: { provider: provider.provider },
    update: {
      name: provider.name,
      description: provider.description,
      config: marketingConfigJson({
        ...currentConfig,
        credentials: nextCredentials,
      }),
    },
    create: {
      provider: provider.provider,
      name: provider.name,
      description: provider.description,
      status: "NOT_CONNECTED",
      config: marketingConfigJson({
        credentials: nextCredentials,
      }),
    },
  });

  revalidatePath("/settings/integrations");
  revalidatePath(`/settings/integrations/${provider.slug}`);
}

function integrationStatusFromAuthBrokerStatus(
  status: MarketingAuthBrokerCompletionStatus,
): "CONNECTED" | "ERROR" | "NOT_CONNECTED" {
  if (status === "connected") return "CONNECTED";
  if (status === "failed") return "ERROR";
  return "NOT_CONNECTED";
}

function mergedSelectorOptions({
  currentConfig,
  selectorOptions,
}: {
  currentConfig: Record<string, unknown>;
  selectorOptions: Record<string, unknown> | undefined;
}) {
  if (!selectorOptions) {
    return currentConfig.selectorOptions;
  }

  return {
    ...jsonObject(currentConfig.selectorOptions),
    ...selectorOptions,
  };
}

export async function saveMarketingAuthBrokerCompletion({
  payload,
  provider,
}: {
  payload: MarketingAuthBrokerCompletionPayload;
  provider: MarketingOAuthProvider;
}) {
  const existing = await prisma.integrationConnection.findUnique({
    where: { provider: provider.provider },
    select: { config: true },
  });
  const now = new Date().toISOString();
  const currentConfig = jsonObject(existing?.config);
  const currentAuthBroker = jsonObject(currentConfig.authBroker);
  const currentCredentials = jsonObject(currentConfig.credentials);
  const connectedAt =
    payload.status === "connected"
      ? payload.connectedAt ?? now
      : stringValue(currentAuthBroker.connectedAt);
  const connectionId =
    payload.connectionId ?? stringValue(currentAuthBroker.connectionId);
  const nextCredentials: Record<string, unknown> = {
    ...currentCredentials,
  };

  if (payload.status === "connected") {
    nextCredentials.oauthConnectedAt = connectedAt;
    nextCredentials.authConnectionId = connectionId;
  }

  const nextConfig: Record<string, unknown> = {
    ...currentConfig,
    authBroker: {
      ...currentAuthBroker,
      crmClientId: payload.crmClientId,
      workspaceId: payload.workspaceId,
      provider: payload.provider,
      connectionId,
      status: payload.status,
      connectedAt,
      lastCallbackAt: now,
      errorRef: payload.status === "connected" ? null : payload.errorRef ?? null,
    },
    credentials: nextCredentials,
  };
  const selectorOptions = mergedSelectorOptions({
    currentConfig,
    selectorOptions: payload.selectorOptions,
  });

  if (selectorOptions) {
    nextConfig.selectorOptions = selectorOptions;
  }

  const storedConfig = isAccountSelectableMarketingProviderSlug(provider.slug)
    ? withConfiguredMarketingProviderSelections(provider.slug, nextConfig)
    : nextConfig;

  await prisma.integrationConnection.upsert({
    where: { provider: provider.provider },
    update: {
      name: provider.name,
      description: provider.description,
      status: integrationStatusFromAuthBrokerStatus(payload.status),
      config: marketingConfigJson(storedConfig),
    },
    create: {
      provider: provider.provider,
      name: provider.name,
      description: provider.description,
      status: integrationStatusFromAuthBrokerStatus(payload.status),
      config: marketingConfigJson(storedConfig),
    },
  });

  revalidatePath("/settings/integrations");
  revalidatePath(`/settings/integrations/${provider.slug}`);
}

export function marketingOAuthRedirect(
  request: Request,
  provider: Pick<MarketingOAuthProvider, "slug">,
  status: string,
) {
  return NextResponse.redirect(
    new URL(marketingOAuthRedirectPath(provider, status), request.url),
  );
}
