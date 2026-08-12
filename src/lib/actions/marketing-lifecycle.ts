"use server";

import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { revalidatePath } from "next/cache";
import { BackgroundJobRunStatus, type Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto/secrets";
import {
  runWithBackgroundJob,
  safeJobJson,
  warningStatusWhen,
} from "@/lib/maintenance/background-jobs";
import {
  marketingIntegrationProviderDefinitions,
  marketingIntegrationProviders,
  parseMarketingIntegrationProviderConfig,
  type BingAdsConfig,
  type GoogleAdsConfig,
  type GoogleAnalyticsConfig,
  type GoogleSearchConsoleConfig,
  type KlaviyoConfig,
  type LinkedInAdsConfig,
  type MarketingIntegrationProviderSlug,
  type MetaConfig,
} from "@/lib/marketing/integrations";
import { buildAuthBrokerConversionUploadPayload } from "@/lib/marketing/auth-broker-conversion-payload";
import {
  fetchMarketingAuthBrokerKlaviyoReporting,
  inspectMarketingAuthBrokerConversionUpload,
  sendMarketingAuthBrokerConversionUpload,
} from "@/lib/marketing/oauth";
import { prisma } from "@/lib/prisma";

const linkedInMarketingApiVersion =
  process.env.LINKEDIN_MARKETING_API_VERSION || "202607";
const googleAdsApiVersion = process.env.GOOGLE_ADS_API_VERSION || "v24";
const klaviyoApiRevision = process.env.KLAVIYO_API_REVISION || "2026-07-15";
const metaGraphApiVersion = process.env.META_GRAPH_API_VERSION || "v23.0";

const uploadProviderSlugs = [
  "google-ads",
  "bing-ads",
  "linkedin-ads",
  "meta",
] as const;

export type UploadProviderSlug = (typeof uploadProviderSlugs)[number];

const reportingImportProviderSlugs = [
  ...uploadProviderSlugs,
  "google-analytics",
  "google-search-console",
  "klaviyo",
] as const;

type ReportingImportProviderSlug =
  (typeof reportingImportProviderSlugs)[number];

type ReportingImportConfig =
  | BingAdsConfig
  | GoogleAdsConfig
  | GoogleAnalyticsConfig
  | GoogleSearchConsoleConfig
  | KlaviyoConfig
  | LinkedInAdsConfig
  | MetaConfig;

type ReportingImportConnection = {
  authBrokerConnectionId?: string | null;
  id: string;
  provider: string;
  slug: ReportingImportProviderSlug;
  config: ReportingImportConfig;
  storedConfig: unknown;
};

type UploadCandidate = {
  conversionType: string;
  entityType: string;
  entityId: string;
  occurredAt: Date;
  valueCents: number | null;
  currency: string;
  attribution: unknown;
  payload: Prisma.InputJsonObject;
};

type UploadProvider = {
  connectionId: string;
  name: string;
  provider: string;
  slug: UploadProviderSlug;
  config: BingAdsConfig | GoogleAdsConfig | LinkedInAdsConfig | MetaConfig;
  storedConfig: unknown;
};

type ConversionUploadRow = {
  id: string;
  provider: string;
  conversionType: string;
  entityType: string;
  entityId: string;
  valueCents: number | null;
  currency: string;
  occurredAt: Date;
  clickId: string | null;
  clickIdSource: string | null;
  conversionName: string | null;
  payload: unknown;
};

type ProviderCredentialMap = Record<string, string>;

type UploadProviderContext = {
  authBrokerConnectionId?: string | null;
  connectionId: string;
  provider: string;
  slug: UploadProviderSlug;
  config: BingAdsConfig | GoogleAdsConfig | LinkedInAdsConfig | MetaConfig;
  credentials: ProviderCredentialMap | null;
};

type ProviderUploadResult = {
  status: "FAILED" | "READY" | "SENT" | "SKIPPED" | "WAITING";
  message: string;
  response?: Prisma.InputJsonValue;
};

type UploadJobCounters = {
  failed: number;
  read: number;
  ready: number;
  sent: number;
  skipped: number;
  waiting: number;
};

export type PrepareMarketingConversionUploadsResult = {
  candidateCount: number;
  prepared: number;
  providerCount: number;
  providers: Array<{
    candidateCount: number;
    prepared: number;
    provider: string;
    providerSlug: UploadProviderSlug;
    skippedMissingClickId: number;
  }>;
  skippedMissingClickId: number;
};

type ProcessMarketingConversionUploadsOptions = {
  actorId?: string | null;
  dryRun?: boolean;
  logEmptyProvider?: boolean;
  provider?: string;
  recordJobRun?: boolean;
  trigger?: string;
};

type PrepareMarketingConversionUploadsOptions = {
  actorId?: string | null;
  recordJobRun?: boolean;
  trigger?: string;
};

type SpendImportCounters = {
  message?: string;
  read: number;
  source?: string;
  written: number;
};

type SpendImportJobCounters = SpendImportCounters & {
  errors: number;
  providers: number;
  skipped: number;
  warnings: number;
};

function isUploadProviderSlug(
  slug: MarketingIntegrationProviderSlug,
): slug is UploadProviderSlug {
  return uploadProviderSlugs.includes(slug as UploadProviderSlug);
}

function isReportingImportProviderSlug(
  slug: MarketingIntegrationProviderSlug,
): slug is ReportingImportProviderSlug {
  return reportingImportProviderSlugs.includes(
    slug as ReportingImportProviderSlug,
  );
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return jsonObject(value) ?? {};
}

function jsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function authBrokerConnectionId(config: unknown) {
  const authBroker = jsonRecord(jsonRecord(config).authBroker);

  return stringValue(authBroker.status) === "connected"
    ? stringValue(authBroker.connectionId)
    : null;
}

function safeJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function providerSlugFromProvider(provider: string): UploadProviderSlug | null {
  if (provider === marketingIntegrationProviders.googleAds) return "google-ads";
  if (provider === marketingIntegrationProviders.bingAds) return "bing-ads";
  if (provider === marketingIntegrationProviders.linkedInAds) return "linkedin-ads";
  if (provider === marketingIntegrationProviders.meta) return "meta";

  return null;
}

function reportingImportSlugFromProvider(
  provider: string,
): ReportingImportProviderSlug | null {
  const uploadSlug = providerSlugFromProvider(provider);
  if (uploadSlug) return uploadSlug;
  if (provider === marketingIntegrationProviders.googleAnalytics) {
    return "google-analytics";
  }
  if (provider === marketingIntegrationProviders.googleSearchConsole) {
    return "google-search-console";
  }
  if (provider === marketingIntegrationProviders.klaviyo) return "klaviyo";

  return null;
}

function uploadProviderDefinitionFromSlug(slug: string) {
  return marketingIntegrationProviderDefinitions.find(
    (provider) => provider.slug === slug && isUploadProviderSlug(provider.slug),
  );
}

function decryptProviderCredentials(
  storedConfig: unknown,
  keys: string[],
): ProviderCredentialMap | null {
  const credentials = jsonRecord(jsonRecord(storedConfig).credentials);
  if (!credentials) return null;

  const decrypted: ProviderCredentialMap = {};

  for (const key of keys) {
    const encryptedValue = stringValue(credentials[key]);
    if (!encryptedValue) return null;
    decrypted[key] = decryptSecret(encryptedValue);
  }

  return decrypted;
}

function centsToUnit(valueCents: number | null) {
  return valueCents === null ? 0 : Number((valueCents / 100).toFixed(2));
}

function formatGoogleAdsDate(date: Date) {
  const pad = (value: number) => value.toString().padStart(2, "0");

  return [
    date.getUTCFullYear(),
    "-",
    pad(date.getUTCMonth() + 1),
    "-",
    pad(date.getUTCDate()),
    " ",
    pad(date.getUTCHours()),
    ":",
    pad(date.getUTCMinutes()),
    ":",
    pad(date.getUTCSeconds()),
    "+00:00",
  ].join("");
}

function providerCredentialKeys(slug: UploadProviderSlug) {
  if (slug === "linkedin-ads" || slug === "meta") return ["accessToken"];

  return ["developerToken", "refreshToken"];
}

function providerOAuthEnvCredentials(slug: UploadProviderSlug) {
  if (slug === "meta") {
    return {
      clientId: process.env.META_ADS_OAUTH_CLIENT_ID,
      clientSecret: process.env.META_ADS_OAUTH_CLIENT_SECRET,
    };
  }

  if (slug === "bing-ads") {
    return {
      clientId: process.env.MICROSOFT_ADS_OAUTH_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_ADS_OAUTH_CLIENT_SECRET,
    };
  }

  if (slug === "linkedin-ads") {
    return {
      clientId: process.env.LINKEDIN_ADS_OAUTH_CLIENT_ID,
      clientSecret: process.env.LINKEDIN_ADS_OAUTH_CLIENT_SECRET,
    };
  }

  return {
    clientId: process.env.GOOGLE_ADS_OAUTH_CLIENT_ID,
    clientSecret: process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET,
  };
}

function providerOAuthClientCredentials(
  slug: UploadProviderSlug,
  storedConfig: unknown,
) {
  const credentials = jsonRecord(jsonRecord(storedConfig).credentials);
  const encryptedClientId = stringValue(credentials?.oauthClientId);
  const encryptedClientSecret = stringValue(credentials?.oauthClientSecret);

  if (encryptedClientId && encryptedClientSecret) {
    return {
      clientId: decryptSecret(encryptedClientId),
      clientSecret: decryptSecret(encryptedClientSecret),
    };
  }

  const envCredentials = providerOAuthEnvCredentials(slug);
  if (envCredentials.clientId && envCredentials.clientSecret) {
    return {
      clientId: envCredentials.clientId,
      clientSecret: envCredentials.clientSecret,
    };
  }

  return null;
}

function parseMoneyToMicros(value: unknown) {
  const amount = typeof value === "string" ? Number(value) : Number(value ?? 0);
  if (!Number.isFinite(amount)) return BigInt(0);
  return BigInt(Math.round(amount * 1_000_000));
}

function parseIntMetric(value: unknown) {
  const number = typeof value === "string" ? Number(value) : Number(value ?? 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function parseFloatMetric(value: unknown) {
  const number = typeof value === "string" ? Number(value) : Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function isoDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function dateFromIsoDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function defaultSpendImportWindow() {
  const until = new Date();
  until.setUTCHours(0, 0, 0, 0);
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - 29);

  return { since, until };
}

function endExclusiveDate(value: Date) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function shortLabel(value: string, maxLength = 160) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function stableMetricId(prefix: string, parts: unknown[]) {
  const hash = createHash("sha1")
    .update(JSON.stringify(parts))
    .digest("hex")
    .slice(0, 16);

  return `${prefix}:${hash}`;
}

async function upsertMarketingPerformanceRow({
  accountId,
  campaignId,
  campaignName,
  clicks = 0,
  conversions = 0,
  costMicros = BigInt(0),
  currency = "GBP",
  date,
  impressions = 0,
  metadata,
  provider,
}: {
  accountId: string;
  campaignId: string;
  campaignName?: string | null;
  clicks?: number;
  conversions?: number;
  costMicros?: bigint;
  currency?: string;
  date: Date;
  impressions?: number;
  metadata: Record<string, unknown>;
  provider: string;
}) {
  const payload = {
    campaignName,
    clicks,
    conversions,
    costMicros,
    currency,
    impressions,
    metadata: safeJson({
      ...metadata,
      importedAt: new Date().toISOString(),
    }),
  };

  await prisma.marketingCampaignSpend.upsert({
    where: {
      provider_accountId_campaignId_date: {
        provider,
        accountId,
        campaignId,
        date,
      },
    },
    update: payload,
    create: {
      provider,
      accountId,
      campaignId,
      date,
      ...payload,
    },
  });
}

function metaActionConversions(actions: unknown) {
  return jsonArray(actions).reduce<number>((total, item) => {
    const action = jsonObject(item);
    const actionType = stringValue(action?.action_type) ?? "";
    const value = parseFloatMetric(action?.value);

    return /lead|contact|complete_registration|submit_application/.test(actionType)
      ? total + value
      : total;
  }, 0);
}

function bingReportDate(value: Date) {
  return {
    Day: value.getUTCDate(),
    Month: value.getUTCMonth() + 1,
    Year: value.getUTCFullYear(),
  };
}

async function microsoftAdsAccessToken(
  credentials: ProviderCredentialMap,
  storedConfig: unknown,
) {
  if (!credentials.refreshToken) {
    throw new Error("Bing Ads refresh token is required before cost import can run.");
  }

  const clientCredentials = providerOAuthClientCredentials("bing-ads", storedConfig);
  if (!clientCredentials) {
    throw new Error("Bing Ads OAuth client credentials are required before cost import can run.");
  }

  const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientCredentials.clientId,
      client_secret: clientCredentials.clientSecret,
      grant_type: "refresh_token",
      refresh_token: credentials.refreshToken,
      scope: "https://ads.microsoft.com/msads.manage offline_access",
    }),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const accessToken = stringValue(payload.access_token);

  if (!response.ok || !accessToken) {
    throw new Error(
      stringValue(payload.error_description) ||
        stringValue(payload.error) ||
        "Bing Ads OAuth token refresh failed.",
    );
  }

  return accessToken;
}

function bingAdsReportingHeaders({
  accessToken,
  config,
  credentials,
}: {
  accessToken: string;
  config: BingAdsConfig;
  credentials: ProviderCredentialMap;
}) {
  return {
    Authorization: `Bearer ${accessToken}`,
    CustomerAccountId: config.accountId,
    CustomerId: config.customerId,
    DeveloperToken: credentials.developerToken,
    "Content-Type": "application/json",
  };
}

async function submitBingAdsSpendReport({
  accessToken,
  config,
  credentials,
}: {
  accessToken: string;
  config: BingAdsConfig;
  credentials: ProviderCredentialMap;
}) {
  const { since, until } = defaultSpendImportWindow();
  const response = await fetch(
    "https://reporting.api.bingads.microsoft.com/Reporting/v13/GenerateReport/Submit",
    {
      method: "POST",
      headers: bingAdsReportingHeaders({ accessToken, config, credentials }),
      body: JSON.stringify({
        ReportRequest: {
          Type: "CampaignPerformanceReportRequest",
          Aggregation: "Daily",
          Columns: [
            "TimePeriod",
            "AccountId",
            "CampaignId",
            "CampaignName",
            "CurrencyCode",
            "Spend",
            "Impressions",
            "Clicks",
            "Conversions",
          ],
          ExcludeColumnHeaders: false,
          ExcludeReportFooter: true,
          ExcludeReportHeader: true,
          Format: "Csv",
          FormatVersion: "2.0",
          ReportName: "iD30 CRM campaign spend import",
          ReturnOnlyCompleteData: false,
          Scope: {
            AccountIds: [Number(config.accountId)],
          },
          Time: {
            CustomDateRangeStart: bingReportDate(since),
            CustomDateRangeEnd: bingReportDate(until),
            ReportTimeZone: "GreenwichMeanTimeDublinEdinburghLisbonLondon",
          },
        },
      }),
      cache: "no-store",
    },
  );
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const requestId = stringValue(payload.ReportRequestId);

  if (!response.ok || !requestId) {
    throw new Error(
      stringValue(payload.Message) ||
        stringValue(jsonObject(payload.error)?.message) ||
        `Bing Ads report submit failed with HTTP ${response.status}.`,
    );
  }

  return requestId;
}

async function pollBingAdsSpendReport({
  accessToken,
  config,
  credentials,
  requestId,
}: {
  accessToken: string;
  config: BingAdsConfig;
  credentials: ProviderCredentialMap;
  requestId: string;
}) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(
      "https://reporting.api.bingads.microsoft.com/Reporting/v13/GenerateReport/Poll",
      {
        method: "POST",
        headers: bingAdsReportingHeaders({ accessToken, config, credentials }),
        body: JSON.stringify({ ReportRequestId: requestId }),
        cache: "no-store",
      },
    );
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const status = jsonObject(payload.ReportRequestStatus);
    const state = stringValue(status?.Status);
    const downloadUrl = stringValue(status?.ReportDownloadUrl);

    if (!response.ok) {
      throw new Error(
        stringValue(payload.Message) ||
          stringValue(jsonObject(payload.error)?.message) ||
          `Bing Ads report polling failed with HTTP ${response.status}.`,
      );
    }

    if (state === "Success" && downloadUrl) return downloadUrl;
    if (state === "Error") throw new Error("Bing Ads report generation failed.");

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error("Bing Ads report was not ready before the import timeout.");
}

function firstZipTextFile(bytes: Uint8Array) {
  let offset = 0;

  while (offset + 30 < bytes.length) {
    const signature = readUInt32(bytes, offset);
    if (signature !== 0x04034b50) break;

    const compression = readUInt16(bytes, offset + 8);
    const compressedSize = readUInt32(bytes, offset + 18);
    const fileNameLength = readUInt16(bytes, offset + 26);
    const extraLength = readUInt16(bytes, offset + 28);
    const dataStart = offset + 30 + fileNameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    const compressed = bytes.slice(dataStart, dataEnd);
    const content =
      compression === 0
        ? compressed
        : compression === 8
          ? inflateRawSync(compressed)
          : null;

    if (content) return new TextDecoder().decode(content);

    offset = dataEnd;
  }

  throw new Error("Bing Ads report ZIP did not contain a readable CSV file.");
}

function readUInt16(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUInt32(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

function bingReportRows(csv: string) {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

async function importBingAdsCampaignSpend({
  config,
  credentials,
  storedConfig,
}: {
  config: BingAdsConfig;
  credentials: ProviderCredentialMap;
  storedConfig: unknown;
}): Promise<SpendImportCounters> {
  if (!credentials.developerToken) {
    throw new Error("Bing Ads developer token is required before cost import can run.");
  }

  const accessToken = await microsoftAdsAccessToken(credentials, storedConfig);
  const requestId = await submitBingAdsSpendReport({ accessToken, config, credentials });
  const downloadUrl = await pollBingAdsSpendReport({
    accessToken,
    config,
    credentials,
    requestId,
  });
  const response = await fetch(downloadUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Bing Ads report download failed with HTTP ${response.status}.`);
  }

  const csv = firstZipTextFile(new Uint8Array(await response.arrayBuffer()));
  const rows = bingReportRows(csv);
  let written = 0;

  for (const row of rows) {
    const campaignId = stringValue(row.CampaignId);
    const date = dateFromIsoDate(stringValue(row.TimePeriod) ?? "");

    if (!campaignId || !date) continue;

    await prisma.marketingCampaignSpend.upsert({
      where: {
        provider_accountId_campaignId_date: {
          provider: marketingIntegrationProviders.bingAds,
          accountId: config.accountId,
          campaignId,
          date,
        },
      },
      update: {
        campaignName: stringValue(row.CampaignName),
        currency: stringValue(row.CurrencyCode) ?? "GBP",
        costMicros: parseMoneyToMicros(row.Spend),
        impressions: parseIntMetric(row.Impressions),
        clicks: parseIntMetric(row.Clicks),
        conversions: parseFloatMetric(row.Conversions),
        metadata: safeJson({
          importedAt: new Date().toISOString(),
          reportRequestId: requestId,
          source: "bing-ads-campaign-performance-report",
        }),
      },
      create: {
        provider: marketingIntegrationProviders.bingAds,
        accountId: config.accountId,
        campaignId,
        campaignName: stringValue(row.CampaignName),
        date,
        currency: stringValue(row.CurrencyCode) ?? "GBP",
        costMicros: parseMoneyToMicros(row.Spend),
        impressions: parseIntMetric(row.Impressions),
        clicks: parseIntMetric(row.Clicks),
        conversions: parseFloatMetric(row.Conversions),
        metadata: safeJson({
          importedAt: new Date().toISOString(),
          reportRequestId: requestId,
          source: "bing-ads-campaign-performance-report",
        }),
      },
    });
    written += 1;
  }

  return { read: rows.length, written };
}

async function googleAdsAccessToken(
  credentials: ProviderCredentialMap,
  storedConfig: unknown,
) {
  if (!credentials.refreshToken) {
    throw new Error("Google Ads refresh token is required before cost import can run.");
  }

  const clientCredentials = providerOAuthClientCredentials("google-ads", storedConfig);
  if (!clientCredentials) {
    throw new Error("Google Ads OAuth client credentials are required before cost import can run.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientCredentials.clientId,
      client_secret: clientCredentials.clientSecret,
      grant_type: "refresh_token",
      refresh_token: credentials.refreshToken,
    }),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const accessToken = stringValue(payload.access_token);

  if (!response.ok || !accessToken) {
    throw new Error(
      stringValue(payload.error_description) ||
        stringValue(payload.error) ||
        "Google Ads OAuth token refresh failed.",
    );
  }

  return accessToken;
}

function googleAdsMetricValue(metric: unknown, key: string) {
  const record = jsonObject(metric);
  return record?.[key];
}

async function importGoogleAdsCampaignSpend({
  config,
  credentials,
  storedConfig,
}: {
  config: GoogleAdsConfig;
  credentials: ProviderCredentialMap;
  storedConfig: unknown;
}): Promise<SpendImportCounters> {
  if (!credentials.developerToken) {
    throw new Error("Google Ads developer token is required before cost import can run.");
  }

  const { since, until } = defaultSpendImportWindow();
  const accessToken = await googleAdsAccessToken(credentials, storedConfig);
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      segments.date,
      customer.currency_code,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions
    FROM campaign
    WHERE segments.date BETWEEN '${isoDateOnly(since)}' AND '${isoDateOnly(until)}'
  `.replace(/\s+/g, " ").trim();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "developer-token": credentials.developerToken,
  };

  if (config.managerCustomerId) {
    headers["login-customer-id"] = config.managerCustomerId;
  }

  const response = await fetch(
    `https://googleads.googleapis.com/${googleAdsApiVersion}/customers/${config.customerId}/googleAds:searchStream`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ query }),
      cache: "no-store",
    },
  );
  const payload = (await response.json().catch(() => ({}))) as unknown;

  if (!response.ok) {
    const error = jsonObject(payload);
    throw new Error(
      stringValue(error?.message) ||
        stringValue(jsonObject(error?.error)?.message) ||
        `Google Ads spend import failed with HTTP ${response.status}.`,
    );
  }

  const rows = jsonArray(payload).flatMap((batch) => jsonArray(jsonObject(batch)?.results));
  let written = 0;

  for (const item of rows) {
    const row = jsonObject(item);
    const campaign = jsonObject(row?.campaign);
    const metrics = jsonObject(row?.metrics);
    const segments = jsonObject(row?.segments);
    const customer = jsonObject(row?.customer);
    const campaignId = stringValue(campaign?.id);
    const date = dateFromIsoDate(stringValue(segments?.date) ?? "");

    if (!campaignId || !date) continue;

    await prisma.marketingCampaignSpend.upsert({
      where: {
        provider_accountId_campaignId_date: {
          provider: marketingIntegrationProviders.googleAds,
          accountId: config.customerId,
          campaignId,
          date,
        },
      },
      update: {
        campaignName: stringValue(campaign?.name),
        currency: stringValue(customer?.currencyCode) ?? "GBP",
        costMicros: BigInt(parseIntMetric(googleAdsMetricValue(metrics, "costMicros"))),
        impressions: parseIntMetric(googleAdsMetricValue(metrics, "impressions")),
        clicks: parseIntMetric(googleAdsMetricValue(metrics, "clicks")),
        conversions: parseFloatMetric(googleAdsMetricValue(metrics, "conversions")),
        metadata: safeJson({
          importedAt: new Date().toISOString(),
          source: "google-ads-search-stream",
        }),
      },
      create: {
        provider: marketingIntegrationProviders.googleAds,
        accountId: config.customerId,
        campaignId,
        campaignName: stringValue(campaign?.name),
        date,
        currency: stringValue(customer?.currencyCode) ?? "GBP",
        costMicros: BigInt(parseIntMetric(googleAdsMetricValue(metrics, "costMicros"))),
        impressions: parseIntMetric(googleAdsMetricValue(metrics, "impressions")),
        clicks: parseIntMetric(googleAdsMetricValue(metrics, "clicks")),
        conversions: parseFloatMetric(googleAdsMetricValue(metrics, "conversions")),
        metadata: safeJson({
          importedAt: new Date().toISOString(),
          source: "google-ads-search-stream",
        }),
      },
    });
    written += 1;
  }

  return { read: rows.length, written };
}

async function importMetaCampaignSpend({
  config,
  credentials,
}: {
  config: MetaConfig;
  credentials: ProviderCredentialMap;
}): Promise<SpendImportCounters> {
  const { since, until } = defaultSpendImportWindow();
  const params = new URLSearchParams({
    access_token: credentials.accessToken,
    fields: [
      "campaign_id",
      "campaign_name",
      "date_start",
      "spend",
      "impressions",
      "clicks",
      "actions",
    ].join(","),
    level: "campaign",
    time_increment: "1",
  });
  params.set(
    "time_range",
    JSON.stringify({
      since: isoDateOnly(since),
      until: isoDateOnly(until),
    }),
  );

  const rows: unknown[] = [];
  let nextUrl: string | null = `https://graph.facebook.com/${metaGraphApiVersion}/act_${config.adAccountId}/insights?${params.toString()}`;

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      const error = jsonObject(payload.error);
      const message =
        stringValue(error?.message) ||
        `Meta spend import failed with HTTP ${response.status}.`;
      throw new Error(message);
    }

    rows.push(...jsonArray(payload.data));
    nextUrl = stringValue(jsonObject(payload.paging)?.next);
  }

  let written = 0;

  for (const item of rows) {
    const row = jsonObject(item);
    const campaignId = stringValue(row?.campaign_id);
    const date = dateFromIsoDate(stringValue(row?.date_start) ?? "");

    if (!campaignId || !date) continue;

    await prisma.marketingCampaignSpend.upsert({
      where: {
        provider_accountId_campaignId_date: {
          provider: marketingIntegrationProviders.meta,
          accountId: config.adAccountId,
          campaignId,
          date,
        },
      },
      update: {
        campaignName: stringValue(row?.campaign_name),
        costMicros: parseMoneyToMicros(row?.spend),
        impressions: parseIntMetric(row?.impressions),
        clicks: parseIntMetric(row?.clicks),
        conversions: metaActionConversions(row?.actions),
        metadata: safeJson({
          importedAt: new Date().toISOString(),
          source: "meta-insights",
        }),
      },
      create: {
        provider: marketingIntegrationProviders.meta,
        accountId: config.adAccountId,
        campaignId,
        campaignName: stringValue(row?.campaign_name),
        date,
        currency: "GBP",
        costMicros: parseMoneyToMicros(row?.spend),
        impressions: parseIntMetric(row?.impressions),
        clicks: parseIntMetric(row?.clicks),
        conversions: metaActionConversions(row?.actions),
        metadata: safeJson({
          importedAt: new Date().toISOString(),
          source: "meta-insights",
        }),
      },
    });
    written += 1;
  }

  return { read: rows.length, written };
}

function linkedInApiUrl(path: string, params: Record<string, string> = {}) {
  const url = new URL(`https://api.linkedin.com/rest/${path}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url;
}

function linkedInApiError(payload: unknown, fallback: string) {
  const record = jsonObject(payload);
  const errors = jsonArray(record?.errors);
  const firstError = jsonObject(errors[0]);

  return (
    stringValue(record?.message) ||
    stringValue(firstError?.message) ||
    stringValue(record?.error_description) ||
    stringValue(record?.error) ||
    fallback
  );
}

async function fetchLinkedInRest({
  accessToken,
  path,
  params = {},
}: {
  accessToken: string;
  path: string;
  params?: Record<string, string>;
}) {
  const response = await fetch(linkedInApiUrl(path, params), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Linkedin-Version": linkedInMarketingApiVersion,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    throw new Error(
      linkedInApiError(payload, `LinkedIn API request failed with HTTP ${response.status}.`),
    );
  }

  return payload;
}

function linkedInSponsoredAccountUrn(accountId: string) {
  return accountId.startsWith("urn:")
    ? accountId
    : `urn:li:sponsoredAccount:${accountId}`;
}

function linkedInAccountIdFromUrn(value: string | null) {
  if (!value) return null;

  return value.split(":").pop() || value;
}

function linkedInDateParts(value: Date) {
  return {
    day: value.getUTCDate(),
    month: value.getUTCMonth() + 1,
    year: value.getUTCFullYear(),
  };
}

function linkedInDateRange({ since, until }: { since: Date; until: Date }) {
  const start = linkedInDateParts(since);
  const end = linkedInDateParts(until);

  return [
    "(start:",
    `(year:${start.year},month:${start.month},day:${start.day})`,
    ",end:",
    `(year:${end.year},month:${end.month},day:${end.day})`,
    ")",
  ].join("");
}

function linkedInAnalyticsCampaignId(row: Record<string, unknown>) {
  const pivotValues = jsonArray(row.pivotValues)
    .map(stringValue)
    .filter((value): value is string => Boolean(value));
  const campaigns = jsonArray(row.campaigns)
    .map(stringValue)
    .filter((value): value is string => Boolean(value));
  const campaign =
    stringValue(row.campaign) ||
    stringValue(row.campaignUrn) ||
    pivotValues.find((value) => value.includes(":sponsoredCampaign:")) ||
    campaigns[0] ||
    pivotValues[0];

  return linkedInAccountIdFromUrn(campaign);
}

function linkedInAnalyticsDate(row: Record<string, unknown>) {
  const range = jsonObject(row.dateRange);
  const start = jsonObject(range?.start);
  const year = parseIntMetric(start?.year);
  const month = parseIntMetric(start?.month);
  const day = parseIntMetric(start?.day);

  if (year > 0 && month > 0 && day > 0) {
    const date = new Date(Date.UTC(year, month - 1, day));

    return Number.isNaN(date.getTime()) ? null : date;
  }

  return dateFromIsoDate(stringValue(row.date) ?? "");
}

function linkedInCampaignSpendCurrency(config: LinkedInAdsConfig) {
  const accountId = linkedInAccountIdFromUrn(config.adAccountId);

  if (!accountId) return "GBP";

  const account = config.selectorOptions?.accounts?.find((option) => {
    const optionId = linkedInAccountIdFromUrn(option.id) ?? option.id;

    return optionId === accountId;
  });
  const currency = account?.description?.match(/\b[A-Z]{3}\b/)?.[0];

  return currency || "GBP";
}

function requiredLinkedInAdAccountId(config: LinkedInAdsConfig) {
  const accountId = linkedInAccountIdFromUrn(config.adAccountId);

  if (!accountId) {
    throw new Error("Select a LinkedIn Ads account before campaign cost import can run.");
  }

  return accountId;
}

async function importLinkedInAdsCampaignSpend({
  config,
  credentials,
}: {
  config: LinkedInAdsConfig;
  credentials: ProviderCredentialMap;
}): Promise<SpendImportCounters> {
  if (!credentials.accessToken) {
    throw new Error("LinkedIn Ads access token is required before cost import can run.");
  }

  const { since, until } = defaultSpendImportWindow();
  const accountId = requiredLinkedInAdAccountId(config);
  const account = linkedInSponsoredAccountUrn(accountId);
  const rows: unknown[] = [];
  let pageToken: string | null = null;

  while (rows.length < 5000) {
    const payload = await fetchLinkedInRest({
      accessToken: credentials.accessToken,
      path: "adAnalytics",
      params: {
        accounts: `List(${account})`,
        dateRange: linkedInDateRange({ since, until }),
        fields: [
          "dateRange",
          "pivotValues",
          "impressions",
          "clicks",
          "costInLocalCurrency",
          "externalWebsiteConversions",
        ].join(","),
        pageSize: "1000",
        pivot: "CAMPAIGN",
        q: "analytics",
        timeGranularity: "DAILY",
        ...(pageToken ? { pageToken } : {}),
      },
    });

    rows.push(...jsonArray(payload.elements));
    pageToken = stringValue(jsonObject(payload.metadata)?.nextPageToken);
    if (!pageToken) break;
  }

  const currency = linkedInCampaignSpendCurrency(config);
  let written = 0;

  for (const item of rows) {
    const row = jsonObject(item);
    if (!row) continue;

    const campaignId = linkedInAnalyticsCampaignId(row);
    const date = linkedInAnalyticsDate(row);

    if (!campaignId || !date) continue;

    await prisma.marketingCampaignSpend.upsert({
      where: {
        provider_accountId_campaignId_date: {
          provider: marketingIntegrationProviders.linkedInAds,
          accountId,
          campaignId,
          date,
        },
      },
      update: {
        campaignName: stringValue(row.campaignName),
        currency,
        costMicros: parseMoneyToMicros(row.costInLocalCurrency),
        impressions: parseIntMetric(row.impressions),
        clicks: parseIntMetric(row.clicks),
        conversions: parseFloatMetric(row.externalWebsiteConversions),
        metadata: safeJson({
          account,
          importedAt: new Date().toISOString(),
          source: "linkedin-ad-analytics",
        }),
      },
      create: {
        provider: marketingIntegrationProviders.linkedInAds,
        accountId,
        campaignId,
        campaignName: stringValue(row.campaignName),
        date,
        currency,
        costMicros: parseMoneyToMicros(row.costInLocalCurrency),
        impressions: parseIntMetric(row.impressions),
        clicks: parseIntMetric(row.clicks),
        conversions: parseFloatMetric(row.externalWebsiteConversions),
        metadata: safeJson({
          account,
          importedAt: new Date().toISOString(),
          source: "linkedin-ad-analytics",
        }),
      },
    });
    written += 1;
  }

  return { read: rows.length, written };
}

function googleAnalyticsOAuthClientCredentials(storedConfig: unknown) {
  const credentials = jsonRecord(jsonRecord(storedConfig).credentials);
  const encryptedClientId = stringValue(credentials.oauthClientId);
  const encryptedClientSecret = stringValue(credentials.oauthClientSecret);

  if (encryptedClientId && encryptedClientSecret) {
    return {
      clientId: decryptSecret(encryptedClientId),
      clientSecret: decryptSecret(encryptedClientSecret),
    };
  }

  const clientId = process.env.GOOGLE_ANALYTICS_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ANALYTICS_OAUTH_CLIENT_SECRET;

  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

async function googleAnalyticsAccessToken({
  credentials,
  storedConfig,
}: {
  credentials: ProviderCredentialMap;
  storedConfig: unknown;
}) {
  if (!credentials.refreshToken) {
    throw new Error(
      "Google Analytics refresh token is required before GA4 reporting import can run.",
    );
  }

  const clientCredentials = googleAnalyticsOAuthClientCredentials(storedConfig);
  if (!clientCredentials) {
    throw new Error(
      "Google Analytics OAuth client credentials are required before GA4 reporting import can run.",
    );
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientCredentials.clientId,
      client_secret: clientCredentials.clientSecret,
      grant_type: "refresh_token",
      refresh_token: credentials.refreshToken,
      scope: "https://www.googleapis.com/auth/analytics.readonly",
    }),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const accessToken = stringValue(payload.access_token);

  if (!response.ok || !accessToken) {
    throw new Error(
      stringValue(payload.error_description) ||
        stringValue(payload.error) ||
        "Google Analytics OAuth token refresh failed.",
    );
  }

  return accessToken;
}

function googleAnalyticsDate(value: string | null) {
  if (!value || !/^\d{8}$/.test(value)) return dateFromIsoDate(value ?? "");

  return dateFromIsoDate(
    `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`,
  );
}

function googleAnalyticsEventNames(config: GoogleAnalyticsConfig) {
  return Array.from(
    new Set([
      config.primaryConversionEvent,
      config.callConversionEvent,
      ...config.matchedEventNames,
    ]),
  ).filter(Boolean);
}

async function importGoogleAnalyticsReporting({
  config,
  credentials,
  storedConfig,
}: {
  config: GoogleAnalyticsConfig;
  credentials: ProviderCredentialMap;
  storedConfig: unknown;
}): Promise<SpendImportCounters> {
  const { since, until } = defaultSpendImportWindow();
  const eventNames = googleAnalyticsEventNames(config);
  const accessToken = await googleAnalyticsAccessToken({
    credentials,
    storedConfig,
  });
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${config.propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [
          {
            endDate: isoDateOnly(until),
            startDate: isoDateOnly(since),
          },
        ],
        dimensionFilter: eventNames.length
          ? {
              filter: {
                fieldName: "eventName",
                inListFilter: { values: eventNames },
              },
            }
          : undefined,
        dimensions: [
          { name: "date" },
          { name: "sessionSourceMedium" },
          { name: "sessionCampaignName" },
          { name: "eventName" },
        ],
        limit: "10000",
        metrics: [{ name: "eventCount" }, { name: "sessions" }],
      }),
      cache: "no-store",
    },
  );
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    throw new Error(
      stringValue(jsonRecord(payload.error).message) ||
        `Google Analytics Data API import failed with HTTP ${response.status}.`,
    );
  }

  const rows = jsonArray(payload.rows);
  let written = 0;

  for (const item of rows) {
    const row = jsonRecord(item);
    const dimensionValues = jsonArray(row.dimensionValues)
      .map(jsonRecord)
      .map((dimension) => stringValue(dimension.value) ?? "");
    const metricValues = jsonArray(row.metricValues)
      .map(jsonRecord)
      .map((metric) => stringValue(metric.value) ?? "0");
    const date = googleAnalyticsDate(dimensionValues[0] ?? null);
    if (!date) continue;

    const sourceMedium = dimensionValues[1] || "(not set)";
    const campaignName = dimensionValues[2] || "(not set)";
    const eventName = dimensionValues[3] || "(not set)";
    const eventCount = parseFloatMetric(metricValues[0]);
    const sessions = parseIntMetric(metricValues[1]);

    await upsertMarketingPerformanceRow({
      accountId: config.propertyId,
      campaignId: stableMetricId("ga4", [
        config.propertyId,
        sourceMedium,
        campaignName,
        eventName,
      ]),
      campaignName: shortLabel(`${campaignName} | ${eventName}`),
      clicks: sessions,
      conversions: eventCount,
      date,
      metadata: {
        dataStreamName: config.dataStreamName,
        eventCount,
        eventName,
        measurementId: config.measurementId,
        source: "google-analytics-data-api",
        sourceMedium,
      },
      provider: marketingIntegrationProviders.googleAnalytics,
    });
    written += 1;
  }

  return {
    message: `Imported ${written} Google Analytics event reporting row${written === 1 ? "" : "s"}.`,
    read: rows.length,
    source: "google-analytics-data-api",
    written,
  };
}

function googleSearchConsoleOAuthClientCredentials(storedConfig: unknown) {
  const credentials = jsonObject(jsonRecord(storedConfig).credentials);
  const encryptedClientId = stringValue(credentials?.oauthClientId);
  const encryptedClientSecret = stringValue(credentials?.oauthClientSecret);

  if (encryptedClientId && encryptedClientSecret) {
    return {
      clientId: decryptSecret(encryptedClientId),
      clientSecret: decryptSecret(encryptedClientSecret),
    };
  }

  const clientId = process.env.GOOGLE_SEARCH_CONSOLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_SEARCH_CONSOLE_OAUTH_CLIENT_SECRET;

  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

async function googleSearchConsoleAccessToken({
  credentials,
  storedConfig,
}: {
  credentials: ProviderCredentialMap;
  storedConfig: unknown;
}) {
  if (!credentials.refreshToken) {
    throw new Error(
      "Google Search Console refresh token is required before search performance import can run.",
    );
  }

  const clientCredentials = googleSearchConsoleOAuthClientCredentials(storedConfig);
  if (!clientCredentials) {
    throw new Error(
      "Google Search Console OAuth client credentials are required before search performance import can run.",
    );
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientCredentials.clientId,
      client_secret: clientCredentials.clientSecret,
      grant_type: "refresh_token",
      refresh_token: credentials.refreshToken,
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
    }),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const accessToken = stringValue(payload.access_token);

  if (!response.ok || !accessToken) {
    throw new Error(
      stringValue(payload.error_description) ||
        stringValue(payload.error) ||
        "Google Search Console OAuth token refresh failed.",
    );
  }

  return accessToken;
}

function googleSearchConsoleImportDimensions(config: GoogleSearchConsoleConfig) {
  const allowed = new Set([
    "country",
    "date",
    "device",
    "page",
    "query",
    "searchAppearance",
  ]);
  const configured = config.dimensions
    .filter((dimension) => allowed.has(dimension))
    .filter((dimension) => dimension !== "date");

  return ["date", ...configured].slice(0, 5);
}

async function importGoogleSearchConsolePerformance({
  config,
  credentials,
  storedConfig,
}: {
  config: GoogleSearchConsoleConfig;
  credentials: ProviderCredentialMap;
  storedConfig: unknown;
}): Promise<SpendImportCounters> {
  const { since, until } = defaultSpendImportWindow();
  const dimensions = googleSearchConsoleImportDimensions(config);
  const accessToken = await googleSearchConsoleAccessToken({
    credentials,
    storedConfig,
  });
  const response = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
      config.siteUrl,
    )}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dataState: "all",
        dimensions,
        endDate: isoDateOnly(until),
        rowLimit: 25000,
        type: config.searchType,
        startDate: isoDateOnly(since),
      }),
      cache: "no-store",
    },
  );
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    throw new Error(
      stringValue(jsonRecord(payload.error).message) ||
        `Google Search Console import failed with HTTP ${response.status}.`,
    );
  }

  const rows = jsonArray(payload.rows);
  let written = 0;

  for (const item of rows) {
    const row = jsonObject(item);
    if (!row) continue;

    const keys = jsonArray(row.keys)
      .map(stringValue)
      .map((value) => value ?? "");
    const date = dateFromIsoDate(keys[0] ?? "");
    if (!date) continue;

    const dimensionValues = dimensions
      .map((dimension, index) => ({
        dimension,
        value: keys[index] ?? "",
      }))
      .filter((entry) => entry.dimension !== "date");
    const label = dimensionValues
      .map((entry) => entry.value)
      .filter(Boolean)
      .join(" | ");

    await upsertMarketingPerformanceRow({
      accountId: config.siteUrl,
      campaignId: stableMetricId("gsc", [
        config.siteUrl,
        config.searchType,
        dimensionValues,
      ]),
      campaignName: shortLabel(label || "All search performance"),
      clicks: parseIntMetric(row.clicks),
      conversions: 0,
      date,
      impressions: parseIntMetric(row.impressions),
      metadata: {
        ctr: parseFloatMetric(row.ctr),
        dimensions,
        dimensionValues,
        position: parseFloatMetric(row.position),
        propertyName: config.propertyName,
        searchType: config.searchType,
        source: "google-search-console-search-analytics",
      },
      provider: marketingIntegrationProviders.googleSearchConsole,
    });
    written += 1;
  }

  return {
    message: `Imported ${written} Google Search Console search performance row${written === 1 ? "" : "s"}.`,
    read: rows.length,
    source: "google-search-console-search-analytics",
    written,
  };
}

function klaviyoApiKey(storedConfig: unknown) {
  const envKey = process.env.KLAVIYO_PRIVATE_API_KEY?.trim();
  if (envKey) return envKey;

  const credentials = jsonRecord(jsonRecord(storedConfig).credentials);
  const encryptedApiKey = stringValue(credentials.privateApiKey);

  return encryptedApiKey ? decryptSecret(encryptedApiKey) : null;
}

function klaviyoApiUrl(path: string) {
  return path.startsWith("http")
    ? path
    : `https://a.klaviyo.com/api/${path.replace(/^\//, "")}`;
}

function klaviyoApiError(payload: unknown, fallback: string) {
  const record = jsonRecord(payload);
  const errors = jsonArray(record.errors);
  const firstError = jsonRecord(errors[0]);

  return (
    stringValue(record.message) ||
    stringValue(firstError?.detail) ||
    stringValue(firstError?.title) ||
    stringValue(record.error) ||
    fallback
  );
}

async function fetchKlaviyoApi({
  apiKey,
  body,
  method = "GET",
  path,
}: {
  apiKey: string;
  body?: Record<string, unknown>;
  method?: "GET" | "POST";
  path: string;
}) {
  const response = await fetch(klaviyoApiUrl(path), {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Klaviyo-API-Key ${apiKey}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      Revision: klaviyoApiRevision,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      klaviyoApiError(payload, `Klaviyo API request failed with HTTP ${response.status}.`),
    );
  }

  return payload;
}

async function fetchKlaviyoList({
  apiKey,
  maxItems = 100,
  path,
}: {
  apiKey: string;
  maxItems?: number;
  path: string;
}) {
  const rows: Record<string, unknown>[] = [];
  let nextPath: string | null = path;

  while (nextPath && rows.length < maxItems) {
    const payload = await fetchKlaviyoApi({ apiKey, path: nextPath });
    rows.push(
      ...jsonArray(payload.data)
        .map(jsonRecord)
        .filter((item) => Object.keys(item).length),
    );
    nextPath = stringValue(jsonRecord(payload.links).next);
  }

  return rows.slice(0, maxItems);
}

function klaviyoOptionFromRow(row: Record<string, unknown>) {
  const id = stringValue(row.id);
  const attributes = jsonRecord(row.attributes);
  if (!id) return null;

  return {
    id,
    name: stringValue(attributes.name) ?? id,
  };
}

function klaviyoConfiguredOptions(
  config: KlaviyoConfig,
  key: "campaigns" | "events" | "flows",
) {
  const selectorOptions = config.selectorOptions;
  const values = selectorOptions?.[key] ?? [];

  return values
    .map((option) => ({
      id: option.id,
      name: option.name ?? option.id,
    }))
    .filter((option) => option.id);
}

function normalisedKlaviyoName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

async function klaviyoMetricOptions({
  apiKey,
  config,
}: {
  apiKey: string;
  config: KlaviyoConfig;
}) {
  const configured = klaviyoConfiguredOptions(config, "events");
  if (configured.length) return configured;

  const rows = await fetchKlaviyoList({
    apiKey,
    maxItems: 250,
    path: "metrics/?page[size]=100",
  });

  return rows
    .map(klaviyoOptionFromRow)
    .filter(Boolean) as Array<{ id: string; name: string }>;
}

function klaviyoAttributionMetrics({
  config,
  metrics,
}: {
  config: KlaviyoConfig;
  metrics: Array<{ id: string; name: string }>;
}) {
  const requestedNames = new Set(
    config.attributionEventNames.map(normalisedKlaviyoName),
  );
  const matched = metrics.filter((metric) =>
    requestedNames.has(normalisedKlaviyoName(metric.name)),
  );

  return matched.length ? matched : metrics.slice(0, 1);
}

function klaviyoContainsAnyFilter(field: string, values: string[]) {
  const escaped = values
    .map((value) => value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\""))
    .map((value) => `"${value}"`)
    .join(",");

  return `contains-any(${field},[${escaped}])`;
}

function klaviyoStatistic(row: Record<string, unknown>, key: string) {
  const attributes = jsonRecord(row.attributes);
  const statistics = jsonRecord(attributes.statistics);

  return statistics[key] ?? attributes[key] ?? row[key];
}

function klaviyoGrouping(row: Record<string, unknown>, key: string) {
  const attributes = jsonRecord(row.attributes);
  const groupings = jsonRecord(attributes.groupings);

  return stringValue(groupings[key] ?? attributes[key] ?? row[key]);
}

async function importKlaviyoValuesReport({
  accountId,
  apiKey,
  metric,
  resourceKey,
  resourceOptions,
}: {
  accountId: string;
  apiKey: string;
  metric: { id: string; name: string };
  resourceKey: "campaign" | "flow";
  resourceOptions: Array<{ id: string; name: string }>;
}): Promise<SpendImportCounters> {
  if (!resourceOptions.length) {
    return {
      message: `No Klaviyo ${resourceKey}s are available for performance import.`,
      read: 0,
      source: `klaviyo-${resourceKey}-values-report`,
      written: 0,
    };
  }

  const { until } = defaultSpendImportWindow();
  const date = until;
  const nameById = new Map(resourceOptions.map((option) => [option.id, option.name]));
  let read = 0;
  let written = 0;

  for (let index = 0; index < resourceOptions.length; index += 50) {
    const batch = resourceOptions.slice(index, index + 50);
    const payload = await fetchKlaviyoApi({
      apiKey,
      method: "POST",
      path:
        resourceKey === "campaign"
          ? "campaign-values-reports/"
          : "flow-values-reports/",
      body: {
        data: {
          type:
            resourceKey === "campaign"
              ? "campaign-values-report"
              : "flow-values-report",
          attributes: {
            conversion_metric_id: metric.id,
            filter: klaviyoContainsAnyFilter(
              `${resourceKey}_id`,
              batch.map((option) => option.id),
            ),
            group_by:
              resourceKey === "campaign"
                ? ["campaign_id", "campaign_message_id"]
                : ["flow_id", "flow_message_id"],
            statistics: [
              "clicks",
              "conversion_value",
              "conversions",
              "delivered",
              "opens",
              "recipients",
            ],
            timeframe: { key: "last_30_days" },
          },
        },
      },
    });
    const rows = jsonArray(jsonRecord(jsonRecord(payload.data).attributes).results);
    read += rows.length;

    for (const item of rows) {
      const row = jsonObject(item);
      if (!row) continue;

      const resourceId = klaviyoGrouping(row, `${resourceKey}_id`);
      if (!resourceId) continue;

      const messageId = klaviyoGrouping(row, `${resourceKey}_message_id`);
      const resourceName = nameById.get(resourceId) ?? resourceId;
      const source = `klaviyo-${resourceKey}-values-report`;

      await upsertMarketingPerformanceRow({
        accountId,
        campaignId: stableMetricId(`klaviyo:${resourceKey}`, [
          resourceId,
          messageId,
        ]),
        campaignName: shortLabel(resourceName),
        clicks: parseIntMetric(klaviyoStatistic(row, "clicks")),
        conversions: parseFloatMetric(klaviyoStatistic(row, "conversions")),
        date,
        impressions:
          parseIntMetric(klaviyoStatistic(row, "delivered")) ||
          parseIntMetric(klaviyoStatistic(row, "recipients")),
        metadata: {
          conversionMetricId: metric.id,
          conversionMetricName: metric.name,
          conversionValue: parseFloatMetric(
            klaviyoStatistic(row, "conversion_value"),
          ),
          groupings: jsonRecord(jsonRecord(row.attributes).groupings),
          messageId,
          resourceId,
          resourceKey,
          source,
          statistics: jsonRecord(jsonRecord(row.attributes).statistics),
          timeframe: "last_30_days",
        },
        provider: marketingIntegrationProviders.klaviyo,
      });
      written += 1;
    }
  }

  return {
    message: `Imported ${written} Klaviyo ${resourceKey} performance row${written === 1 ? "" : "s"}.`,
    read,
    source: `klaviyo-${resourceKey}-values-report`,
    written,
  };
}

async function importKlaviyoMetricAggregate({
  accountId,
  apiKey,
  metric,
}: {
  accountId: string;
  apiKey: string;
  metric: { id: string; name: string };
}): Promise<SpendImportCounters> {
  const { since, until } = defaultSpendImportWindow();
  const source = "klaviyo-metric-aggregate";
  const payload = await fetchKlaviyoApi({
    apiKey,
    method: "POST",
    path: "metric-aggregates/",
    body: {
      data: {
        type: "metric-aggregate",
        attributes: {
          filter: [
            `greater-or-equal(datetime,${since.toISOString()})`,
            `less-than(datetime,${endExclusiveDate(until).toISOString()})`,
          ],
          interval: "day",
          measurements: ["count"],
          metric_id: metric.id,
          page_size: 500,
          timezone: "UTC",
        },
      },
    },
  });
  const attributes = jsonRecord(jsonRecord(payload.data).attributes);
  const dates = jsonArray(attributes.dates).map(stringValue);
  const series = jsonArray(attributes.data);
  let read = 0;
  let written = 0;

  for (const item of series) {
    const row = jsonObject(item);
    if (!row) continue;

    const measurements = jsonRecord(row.measurements);
    const counts = jsonArray(measurements.count);

    for (let index = 0; index < dates.length; index += 1) {
      const date = dateFromIsoDate(dates[index] ?? "");
      if (!date) continue;

      const count = parseFloatMetric(counts[index]);
      read += 1;
      if (count <= 0) continue;

      await upsertMarketingPerformanceRow({
        accountId,
        campaignId: stableMetricId("klaviyo:event", [metric.id, metric.name]),
        campaignName: shortLabel(metric.name),
        conversions: count,
        date,
        metadata: {
          dimensions: jsonArray(row.dimensions),
          metricId: metric.id,
          metricName: metric.name,
          source,
        },
        provider: marketingIntegrationProviders.klaviyo,
      });
      written += 1;
    }
  }

  return {
    message: `Imported ${written} Klaviyo ${metric.name} event row${written === 1 ? "" : "s"}.`,
    read,
    source,
    written,
  };
}

async function klaviyoResourceOptions({
  apiKey,
  config,
  resourceKey,
}: {
  apiKey: string;
  config: KlaviyoConfig;
  resourceKey: "campaign" | "flow";
}) {
  const selectorOptions = klaviyoConfiguredOptions(
    config,
    resourceKey === "campaign" ? "campaigns" : "flows",
  );
  if (selectorOptions.length) return selectorOptions;

  const rows = await fetchKlaviyoList({
    apiKey,
    maxItems: 100,
    path:
      resourceKey === "campaign"
        ? "campaigns/?page[size]=100"
        : "flows/?page[size]=100",
  });

  return rows
    .map(klaviyoOptionFromRow)
    .filter(Boolean) as Array<{ id: string; name: string }>;
}

async function importKlaviyoLifecyclePerformance({
  apiKey,
  config,
}: {
  apiKey: string;
  config: KlaviyoConfig;
}): Promise<SpendImportCounters> {
  const accountId = config.accountId ?? "klaviyo";
  const metrics = await klaviyoMetricOptions({ apiKey, config });
  const attributionMetrics = klaviyoAttributionMetrics({ config, metrics });
  const primaryMetric = attributionMetrics[0] ?? null;
  const results: SpendImportCounters[] = [];

  if (config.importCampaignPerformanceEnabled && primaryMetric) {
    const campaigns = await klaviyoResourceOptions({
      apiKey,
      config,
      resourceKey: "campaign",
    });
    results.push(
      await importKlaviyoValuesReport({
        accountId,
        apiKey,
        metric: primaryMetric,
        resourceKey: "campaign",
        resourceOptions: campaigns,
      }),
    );
  }

  if (config.importFlowPerformanceEnabled && primaryMetric) {
    const flows = await klaviyoResourceOptions({
      apiKey,
      config,
      resourceKey: "flow",
    });
    results.push(
      await importKlaviyoValuesReport({
        accountId,
        apiKey,
        metric: primaryMetric,
        resourceKey: "flow",
        resourceOptions: flows,
      }),
    );
  }

  if (config.importProfileEventsEnabled) {
    for (const metric of attributionMetrics) {
      results.push(
        await importKlaviyoMetricAggregate({
          accountId,
          apiKey,
          metric,
        }),
      );
    }
  }

  if (!results.length && !primaryMetric) {
    return {
      message:
        "Klaviyo reporting import needs a matching metric for the configured attribution event names.",
      read: 0,
      source: "klaviyo-reporting",
      written: 0,
    };
  }

  const total = results.reduce<SpendImportCounters>(
    (summary, result) => ({
      message: result.message,
      read: summary.read + result.read,
      source: result.source,
      written: summary.written + result.written,
    }),
    { read: 0, written: 0 },
  );

  return {
    ...total,
    message: `Imported ${total.written} Klaviyo lifecycle reporting row${total.written === 1 ? "" : "s"}.`,
    source: "klaviyo-reporting",
  };
}

async function importKlaviyoAuthBrokerLifecyclePerformance({
  config,
  connectionId,
}: {
  config: KlaviyoConfig;
  connectionId: string;
}): Promise<SpendImportCounters> {
  const result = await fetchMarketingAuthBrokerKlaviyoReporting({
    config,
    connectionId,
  });

  if (!result.ok) {
    throw new Error(result.message);
  }

  if (result.result.status === "WAITING") {
    return {
      message: result.result.message,
      read: result.result.read,
      source: result.result.source ?? "klaviyo-reporting",
      written: 0,
    };
  }

  let written = 0;

  for (const row of result.result.rows) {
    const date = dateFromIsoDate(row.date);
    if (!date) continue;

    const metadata = jsonRecord(row.metadata);

    await upsertMarketingPerformanceRow({
      accountId: row.accountId,
      campaignId: row.campaignId,
      campaignName: row.campaignName,
      clicks: parseIntMetric(row.clicks),
      conversions: parseFloatMetric(row.conversions),
      date,
      impressions: parseIntMetric(row.impressions),
      metadata: {
        ...metadata,
        authBrokerConnectionId: connectionId,
        authBrokerSource: result.result.source ?? "klaviyo-reporting",
        source:
          stringValue(metadata.source) ??
          result.result.source ??
          "klaviyo-reporting",
      },
      provider: marketingIntegrationProviders.klaviyo,
    });
    written += 1;
  }

  return {
    message: `Imported ${written} Klaviyo lifecycle reporting row${written === 1 ? "" : "s"} through iD30 Auth.`,
    read: result.result.read,
    source: result.result.source ?? "klaviyo-reporting",
    written,
  };
}

function touchParams(touch: unknown) {
  const params = jsonObject(touch)?.params;
  return jsonObject(params);
}

function touchCapturedAt(touch: unknown) {
  const value = jsonObject(touch)?.capturedAt;
  return typeof value === "string" ? value : null;
}

function clickIdKeys(provider: UploadProviderSlug) {
  if (provider === "google-ads") return ["gclid", "gbraid", "wbraid"];
  if (provider === "bing-ads") return ["msclkid"];
  if (provider === "linkedin-ads") return ["li_fat_id"];
  return ["fbclid"];
}

function findProviderClickId(
  provider: UploadProviderSlug,
  attribution: unknown,
) {
  const data = jsonObject(attribution);
  if (!data) return null;

  const touches = [
    data.lastTouch,
    ...jsonArray(data.timeline).slice().reverse(),
    data.firstTouch,
  ];

  for (const touch of touches) {
    const params = touchParams(touch);
    if (!params) continue;

    for (const key of clickIdKeys(provider)) {
      const value = params[key];
      if (typeof value === "string" && value.trim()) {
        return {
          clickId: value.trim(),
          clickIdSource: key,
          capturedAt: touchCapturedAt(touch),
        };
      }
    }
  }

  return null;
}

function providerUploadEnabled(
  slug: UploadProviderSlug,
  config: BingAdsConfig | GoogleAdsConfig | LinkedInAdsConfig | MetaConfig,
) {
  if (slug === "meta") return (config as MetaConfig).uploadConversionsEnabled;
  return (config as BingAdsConfig | GoogleAdsConfig | LinkedInAdsConfig)
    .uploadOfflineConversionsEnabled;
}

function uploadProviderName(slug: UploadProviderSlug) {
  return (
    marketingIntegrationProviderDefinitions.find((provider) => provider.slug === slug)
      ?.name ?? slug
  );
}

function costImportSource(slug: UploadProviderSlug) {
  if (slug === "google-ads") return "google-ads-search-stream";
  if (slug === "bing-ads") return "bing-ads-campaign-performance-report";
  if (slug === "linkedin-ads") return "linkedin-ad-analytics";
  return "meta-insights";
}

function reportingImportProviderName(slug: ReportingImportProviderSlug) {
  return (
    marketingIntegrationProviderDefinitions.find((provider) => provider.slug === slug)
      ?.name ?? slug
  );
}

function reportingImportSource(slug: ReportingImportProviderSlug) {
  if (slug === "google-analytics") return "google-analytics-data-api";
  if (slug === "google-search-console") {
    return "google-search-console-search-analytics";
  }
  if (slug === "klaviyo") return "klaviyo-reporting";

  return costImportSource(slug);
}

function reportingImportSyncType(slug: ReportingImportProviderSlug) {
  return slug === "google-analytics" ||
    slug === "google-search-console" ||
    slug === "klaviyo"
    ? "reporting-import"
    : "cost-import";
}

function reportingImportEnabled(
  slug: ReportingImportProviderSlug,
  config: ReportingImportConfig,
) {
  if (slug === "google-analytics") {
    return (config as GoogleAnalyticsConfig).importAnalyticsReportingEnabled;
  }

  if (slug === "google-search-console") {
    return (config as GoogleSearchConsoleConfig).importSearchPerformanceEnabled;
  }

  if (slug === "klaviyo") {
    const klaviyoConfig = config as KlaviyoConfig;

    return (
      klaviyoConfig.importCampaignPerformanceEnabled ||
      klaviyoConfig.importFlowPerformanceEnabled ||
      klaviyoConfig.importProfileEventsEnabled
    );
  }

  return (config as BingAdsConfig | GoogleAdsConfig | LinkedInAdsConfig | MetaConfig)
    .importCostEnabled;
}

function reportingImportCredentialKeys(slug: ReportingImportProviderSlug) {
  if (slug === "google-analytics") return ["refreshToken"];
  if (slug === "google-search-console") return ["refreshToken"];
  if (slug === "klaviyo") return ["privateApiKey"];

  return providerCredentialKeys(slug);
}

function reportingCredentialWarningMessage(slug: ReportingImportProviderSlug) {
  if (slug === "google-analytics") {
    return "Google Analytics OAuth access is required before GA4 reporting import can run.";
  }
  if (slug === "google-search-console") {
    return "Google Search Console OAuth access is required before search performance import can run.";
  }
  if (slug === "klaviyo") {
    return "Connect Klaviyo through iD30 Auth or add an advanced private API key fallback before lifecycle reporting import can run.";
  }
  if (slug === "google-ads") {
    return "Google Ads credentials are required before cost import can run.";
  }
  if (slug === "bing-ads") {
    return "Bing Ads credentials are required before cost import can run.";
  }
  if (slug === "linkedin-ads") {
    return "LinkedIn Ads access token is required before cost import can run.";
  }

  return "Meta access token is required before cost import can run.";
}

async function importMarketingProviderReportingData(
  provider: ReportingImportConnection,
  credentials: ProviderCredentialMap | null,
) {
  if (provider.slug === "google-analytics") {
    if (!credentials) {
      throw new Error(reportingCredentialWarningMessage(provider.slug));
    }

    return importGoogleAnalyticsReporting({
      config: provider.config as GoogleAnalyticsConfig,
      credentials,
      storedConfig: provider.storedConfig,
    });
  }

  if (provider.slug === "google-search-console") {
    if (!credentials) {
      throw new Error(reportingCredentialWarningMessage(provider.slug));
    }

    return importGoogleSearchConsolePerformance({
      config: provider.config as GoogleSearchConsoleConfig,
      credentials,
      storedConfig: provider.storedConfig,
    });
  }

  if (provider.slug === "klaviyo") {
    if (provider.authBrokerConnectionId) {
      return importKlaviyoAuthBrokerLifecyclePerformance({
        config: provider.config as KlaviyoConfig,
        connectionId: provider.authBrokerConnectionId,
      });
    }

    const apiKey = credentials?.privateApiKey ?? klaviyoApiKey(provider.storedConfig);
    if (!apiKey) {
      throw new Error(reportingCredentialWarningMessage(provider.slug));
    }

    return importKlaviyoLifecyclePerformance({
      apiKey,
      config: provider.config as KlaviyoConfig,
    });
  }

  if (!credentials) {
    throw new Error(reportingCredentialWarningMessage(provider.slug));
  }

  if (provider.slug === "google-ads") {
    return importGoogleAdsCampaignSpend({
      config: provider.config as GoogleAdsConfig,
      credentials,
      storedConfig: provider.storedConfig,
    });
  }

  if (provider.slug === "bing-ads") {
    return importBingAdsCampaignSpend({
      config: provider.config as BingAdsConfig,
      credentials,
      storedConfig: provider.storedConfig,
    });
  }

  if (provider.slug === "linkedin-ads") {
    return importLinkedInAdsCampaignSpend({
      config: provider.config as LinkedInAdsConfig,
      credentials,
    });
  }

  return importMetaCampaignSpend({
    config: provider.config as MetaConfig,
    credentials,
  });
}

function conversionName(
  provider: UploadProvider,
  conversionType: string,
) {
  if (provider.slug === "google-ads") {
    const config = provider.config as GoogleAdsConfig;
    return conversionType === "CALL"
      ? config.callConversionActionId
      : config.leadConversionActionId;
  }

  if (provider.slug === "bing-ads") {
    const config = provider.config as BingAdsConfig;
    return conversionType === "CALL"
      ? config.callConversionGoalName
      : config.leadConversionGoalName;
  }

  if (provider.slug === "linkedin-ads") {
    const config = provider.config as LinkedInAdsConfig;
    return conversionType === "CALL"
      ? config.callConversionRuleId
      : config.leadConversionRuleId;
  }

  const config = provider.config as MetaConfig;
  return conversionType === "CALL" ? config.callEventName : config.leadEventName;
}

export async function remapPendingMarketingConversionUploadsForProvider(
  providerSlug: UploadProviderSlug,
  config: BingAdsConfig | GoogleAdsConfig | LinkedInAdsConfig | MetaConfig,
) {
  const providerDefinition = uploadProviderDefinitionFromSlug(providerSlug);
  if (!providerDefinition) return 0;

  const mappingProvider: UploadProvider = {
    connectionId: "",
    name: providerDefinition.name,
    provider: providerDefinition.provider,
    slug: providerSlug,
    config,
    storedConfig: {},
  };
  const pendingRows = await prisma.marketingConversionUpload.findMany({
    where: {
      provider: providerDefinition.provider,
      status: "PENDING",
    },
    select: {
      id: true,
      conversionName: true,
      conversionType: true,
      payload: true,
    },
  });
  let remapped = 0;

  for (const row of pendingRows) {
    const nextConversionName =
      conversionName(mappingProvider, row.conversionType) ?? null;

    if (row.conversionName === nextConversionName) continue;

    await prisma.marketingConversionUpload.update({
      where: { id: row.id },
      data: {
        conversionName: nextConversionName,
        message: nextConversionName
          ? "Ready for provider upload worker."
          : "Ready for upload once a provider conversion mapping is configured.",
        payload: safeJson({
          ...jsonRecord(row.payload),
          configuredConversionName: nextConversionName,
        }),
      },
    });
    remapped += 1;
  }

  if (remapped > 0) {
    revalidatePath("/marketing");
    revalidatePath("/marketing/conversion-reporting");
    revalidatePath("/settings/integrations");
    revalidatePath(`/settings/integrations/${providerSlug}`);
  }

  return remapped;
}

function attributionRecordPayload(record: {
  firstTouch: unknown;
  lastTouch: unknown;
  timeline: unknown;
  landingPage: string | null;
  currentPage: string | null;
  referrer: string | null;
}) {
  return {
    firstTouch: record.firstTouch,
    lastTouch: record.lastTouch,
    timeline: record.timeline,
    landingPage: record.landingPage,
    currentPage: record.currentPage,
    referrer: record.referrer,
  };
}

function candidatePayload(
  type: string,
  source: Record<string, unknown>,
): Prisma.InputJsonObject {
  return {
    lifecycleSource: "crm",
    conversionType: type,
    ...source,
  };
}

async function loadUploadProviders(): Promise<UploadProvider[]> {
  const connections = await prisma.integrationConnection.findMany({
    where: {
      provider: {
        in: marketingIntegrationProviderDefinitions
          .filter((provider) => isUploadProviderSlug(provider.slug))
          .map((provider) => provider.provider),
      },
      status: "CONNECTED",
    },
    select: {
      id: true,
      provider: true,
      config: true,
    },
  });
  const byProvider = new Map(
    connections.map((connection) => [connection.provider, connection]),
  );

  return marketingIntegrationProviderDefinitions.flatMap((definition) => {
    if (!isUploadProviderSlug(definition.slug)) return [];

    const connection = byProvider.get(definition.provider);
    if (!connection) return [];

    const parsedConfig = parseMarketingIntegrationProviderConfig(
      definition.slug,
      connection.config,
    );
    if (!parsedConfig.success) return [];

    const config = parsedConfig.data as
      | BingAdsConfig
      | GoogleAdsConfig
      | LinkedInAdsConfig
      | MetaConfig;
    if (!providerUploadEnabled(definition.slug, config)) return [];

    return [
      {
        connectionId: connection.id,
        name: definition.name,
        provider: definition.provider,
        slug: definition.slug,
        config,
        storedConfig: connection.config,
      },
    ];
  });
}

async function loadUploadCandidates(): Promise<UploadCandidate[]> {
  const [opportunities, callLogs, orphanAttributionRecords] = await Promise.all([
    prisma.salesOpportunity.findMany({
      orderBy: { updatedAt: "desc" },
      take: 500,
      select: {
        id: true,
        title: true,
        stage: true,
        valueCents: true,
        currency: true,
        source: true,
        attribution: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.callLog.findMany({
      orderBy: { startedAt: "desc" },
      take: 300,
      select: {
        id: true,
        status: true,
        durationSeconds: true,
        attribution: true,
        startedAt: true,
        opportunityId: true,
        contactId: true,
      },
    }),
    prisma.attributionRecord.findMany({
      where: {
        opportunityId: null,
        callLogId: null,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        source: true,
        firstTouch: true,
        lastTouch: true,
        timeline: true,
        landingPage: true,
        currentPage: true,
        referrer: true,
        createdAt: true,
      },
    }),
  ]);
  const candidates: UploadCandidate[] = [];

  for (const opportunity of opportunities) {
    if (!opportunity.attribution) continue;

    const basePayload = {
      opportunityId: opportunity.id,
      title: opportunity.title,
      stage: opportunity.stage,
      source: opportunity.source,
    };

    candidates.push({
      conversionType: "LEAD",
      entityType: "SalesOpportunity",
      entityId: opportunity.id,
      occurredAt: opportunity.createdAt,
      valueCents: opportunity.valueCents,
      currency: opportunity.currency,
      attribution: opportunity.attribution,
      payload: candidatePayload("LEAD", basePayload),
    });

    if (["QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON"].includes(opportunity.stage)) {
      candidates.push({
        conversionType: "QUALIFIED_LEAD",
        entityType: "SalesOpportunity",
        entityId: opportunity.id,
        occurredAt: opportunity.updatedAt,
        valueCents: opportunity.valueCents,
        currency: opportunity.currency,
        attribution: opportunity.attribution,
        payload: candidatePayload("QUALIFIED_LEAD", basePayload),
      });
    }

    if (opportunity.stage === "WON") {
      candidates.push({
        conversionType: "WON_DEAL",
        entityType: "SalesOpportunity",
        entityId: opportunity.id,
        occurredAt: opportunity.updatedAt,
        valueCents: opportunity.valueCents,
        currency: opportunity.currency,
        attribution: opportunity.attribution,
        payload: candidatePayload("WON_DEAL", basePayload),
      });
    }
  }

  for (const call of callLogs) {
    if (!call.attribution) continue;

    candidates.push({
      conversionType: "CALL",
      entityType: "CallLog",
      entityId: call.id,
      occurredAt: call.startedAt,
      valueCents: null,
      currency: "GBP",
      attribution: call.attribution,
      payload: candidatePayload("CALL", {
        callLogId: call.id,
        status: call.status,
        durationSeconds: call.durationSeconds,
        opportunityId: call.opportunityId,
        contactId: call.contactId,
      }),
    });
  }

  for (const record of orphanAttributionRecords) {
    const attribution = attributionRecordPayload(record);

    candidates.push({
      conversionType: record.source === "PHONE" ? "CALL" : "LEAD",
      entityType: "AttributionRecord",
      entityId: record.id,
      occurredAt: record.createdAt,
      valueCents: null,
      currency: "GBP",
      attribution,
      payload: candidatePayload(record.source === "PHONE" ? "CALL" : "LEAD", {
        attributionRecordId: record.id,
        source: record.source,
      }),
    });
  }

  return candidates;
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

async function refreshOAuthAccessToken({
  clientId,
  clientSecret,
  refreshToken,
  scope,
  tokenUrl,
}: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  scope?: string;
  tokenUrl: string;
}) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  if (scope) body.set("scope", scope);

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = await readJsonResponse(response);
  const accessToken = stringValue(data.access_token);

  if (!response.ok || !accessToken) {
    throw new Error(
      stringValue(data.error_description) ||
        stringValue(data.error) ||
        "OAuth refresh failed.",
    );
  }

  return accessToken;
}

function googleAdsClickField(clickIdSource: string | null) {
  if (clickIdSource === "gbraid") return "gbraid";
  if (clickIdSource === "wbraid") return "wbraid";

  return "gclid";
}

function inspectGoogleAdsConversion(
  row: ConversionUploadRow,
  context: UploadProviderContext,
): ProviderUploadResult | null {
  if (!row.clickId) {
    return {
      status: "SKIPPED",
      message: "Skipped because no Google click ID is available.",
    };
  }

  if (!row.conversionName) {
    return {
      status: "WAITING",
      message: "Waiting for a Google Ads conversion action mapping.",
    };
  }

  if (!context.credentials) {
    return {
      status: "WAITING",
      message: "Waiting for encrypted Google Ads API credentials.",
    };
  }

  return null;
}

async function uploadGoogleAdsConversion(
  row: ConversionUploadRow,
  context: UploadProviderContext,
): Promise<ProviderUploadResult> {
  const config = context.config as GoogleAdsConfig;
  const inspection = inspectGoogleAdsConversion(row, context);

  if (inspection) return inspection;

  const credentials = context.credentials;
  const conversionName = row.conversionName;
  const clickId = row.clickId;

  if (!credentials || !conversionName || !clickId) {
    return {
      status: "WAITING",
      message: "Waiting for Google Ads upload requirements.",
    };
  }

  try {
    const accessToken = await refreshOAuthAccessToken({
      clientId: credentials.oauthClientId,
      clientSecret: credentials.oauthClientSecret,
      refreshToken: credentials.refreshToken,
      tokenUrl: "https://oauth2.googleapis.com/token",
    });
    const customerId = config.customerId;
    const conversionAction = conversionName.includes("/")
      ? conversionName
      : `customers/${customerId}/conversionActions/${conversionName}`;
    const clickField = googleAdsClickField(row.clickIdSource);
    const response = await fetch(
      `https://googleads.googleapis.com/${googleAdsApiVersion}/customers/${customerId}:uploadClickConversions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
          "developer-token": credentials.developerToken,
          ...(config.managerCustomerId
            ? { "login-customer-id": config.managerCustomerId }
            : {}),
        },
        body: JSON.stringify({
          conversions: [
            {
              conversionAction,
              conversionDateTime: formatGoogleAdsDate(row.occurredAt),
              conversionValue: centsToUnit(row.valueCents),
              currencyCode: row.currency,
              orderId: row.entityId,
              [clickField]: clickId,
            },
          ],
          partialFailure: true,
        }),
      },
    );
    const data = await readJsonResponse(response);

    if (!response.ok || data.partialFailureError) {
      return {
        status: "FAILED",
        message:
          stringValue(jsonRecord(data.error).message) ||
          stringValue(jsonRecord(data.partialFailureError).message) ||
          "Google Ads rejected the conversion upload.",
        response: safeJson(data),
      };
    }

    return {
      status: "SENT",
      message: "Uploaded to Google Ads.",
      response: safeJson(data),
    };
  } catch (error) {
    return {
      status: "FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Google Ads upload failed before a provider response.",
    };
  }
}

async function uploadBingAdsConversion(
  row: ConversionUploadRow,
  context: UploadProviderContext,
): Promise<ProviderUploadResult> {
  const config = context.config as BingAdsConfig;
  const inspection = inspectBingAdsConversion(row, context);

  if (inspection) return inspection;

  const credentials = context.credentials;
  const clickId = row.clickId;
  const conversionName = row.conversionName;

  if (!credentials || !clickId || !conversionName) {
    return {
      status: "WAITING",
      message: "Waiting for Bing Ads upload requirements.",
    };
  }

  try {
    const accessToken = await refreshOAuthAccessToken({
      clientId: credentials.oauthClientId,
      clientSecret: credentials.oauthClientSecret,
      refreshToken: credentials.refreshToken,
      scope: "https://ads.microsoft.com/msads.manage offline_access",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    });
    const endpoint =
      process.env.MICROSOFT_ADVERTISING_OFFLINE_CONVERSIONS_URL ||
      "https://campaign.api.bingads.microsoft.com/CampaignManagement/v13/OfflineConversions/Apply";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        CustomerAccountId: config.accountId,
        CustomerId: config.customerId,
        DeveloperToken: credentials.developerToken,
      },
      body: JSON.stringify({
        OfflineConversions: [
          {
            ConversionCurrencyCode: row.currency,
            ConversionName: conversionName,
            ConversionTime: row.occurredAt.toISOString(),
            ConversionValue: centsToUnit(row.valueCents),
            MicrosoftClickId: clickId,
          },
        ],
      }),
    });
    const data = await readJsonResponse(response);

    if (!response.ok) {
      return {
        status: "FAILED",
        message:
          stringValue(jsonRecord(data.error).message) ||
          stringValue(data.message) ||
          "Bing Ads rejected the conversion upload.",
        response: safeJson(data),
      };
    }

    return {
      status: "SENT",
      message: "Uploaded to Bing Ads.",
      response: safeJson(data),
    };
  } catch (error) {
    return {
      status: "FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Bing Ads upload failed before a provider response.",
    };
  }
}

function inspectBingAdsConversion(
  row: ConversionUploadRow,
  context: UploadProviderContext,
): ProviderUploadResult | null {
  if (!row.clickId) {
    return {
      status: "SKIPPED",
      message: "Skipped because no Microsoft click ID is available.",
    };
  }

  if (!row.conversionName) {
    return {
      status: "WAITING",
      message: "Waiting for a Bing Ads conversion goal mapping.",
    };
  }

  if (!context.credentials) {
    return {
      status: "WAITING",
      message: "Waiting for encrypted Bing Ads API credentials.",
    };
  }

  return null;
}

function metaFbc(clickId: string, occurredAt: Date) {
  return `fb.1.${Math.floor(occurredAt.getTime() / 1000)}.${clickId}`;
}

function inspectMetaConversion(
  row: ConversionUploadRow,
  context: UploadProviderContext,
): ProviderUploadResult | null {
  const eventAgeMs = Date.now() - row.occurredAt.getTime();

  if (!row.clickId) {
    return {
      status: "SKIPPED",
      message: "Skipped because no Meta click ID is available.",
    };
  }

  if (eventAgeMs > 7 * 24 * 60 * 60 * 1000) {
    return {
      status: "SKIPPED",
      message: "Skipped because Meta only accepts conversion events from the last 7 days.",
    };
  }

  if (!context.credentials) {
    return {
      status: "WAITING",
      message: "Waiting for encrypted Meta access token.",
    };
  }

  return null;
}

async function uploadMetaConversion(
  row: ConversionUploadRow,
  context: UploadProviderContext,
): Promise<ProviderUploadResult> {
  const config = context.config as MetaConfig;
  const inspection = inspectMetaConversion(row, context);

  if (inspection) return inspection;

  const credentials = context.credentials;
  const clickId = row.clickId;

  if (!credentials || !clickId) {
    return {
      status: "WAITING",
      message: "Waiting for Meta upload requirements.",
    };
  }

  try {
    const endpoint = new URL(
      `https://graph.facebook.com/${metaGraphApiVersion}/${config.pixelId}/events`,
    );
    endpoint.searchParams.set("access_token", credentials.accessToken);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        data: [
          {
            event_name: row.conversionName || config.leadEventName,
            event_time: Math.floor(row.occurredAt.getTime() / 1000),
            action_source:
              row.conversionType === "CALL" ? "phone_call" : "system_generated",
            event_id: row.id,
            user_data: {
              fbc: metaFbc(clickId, row.occurredAt),
            },
            custom_data: {
              currency: row.currency,
              value: centsToUnit(row.valueCents),
              content_name: row.conversionType,
            },
          },
        ],
        ...(config.testEventCode ? { test_event_code: config.testEventCode } : {}),
      }),
    });
    const data = await readJsonResponse(response);

    if (!response.ok || jsonRecord(data.error).message) {
      return {
        status: "FAILED",
        message:
          stringValue(jsonRecord(data.error).message) ||
          "Meta rejected the conversion upload.",
        response: safeJson(data),
      };
    }

    return {
      status: "SENT",
      message: "Uploaded to Meta.",
      response: safeJson(data),
    };
  } catch (error) {
    return {
      status: "FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Meta upload failed before a provider response.",
    };
  }
}

async function uploadQueuedConversion(
  row: ConversionUploadRow,
  context: UploadProviderContext,
) {
  if (context.slug === "google-ads") {
    return uploadGoogleAdsConversion(row, context);
  }

  if (context.slug === "bing-ads") {
    return uploadBingAdsConversion(row, context);
  }

  if (context.slug === "linkedin-ads") {
    return {
      status: "WAITING",
      message:
        "LinkedIn Ads conversion uploads use iD30 Auth. Reconnect LinkedIn Ads through Auth before upload.",
    } satisfies ProviderUploadResult;
  }

  return uploadMetaConversion(row, context);
}

function inspectQueuedConversion(
  row: ConversionUploadRow,
  context: UploadProviderContext,
): ProviderUploadResult {
  if (context.slug === "linkedin-ads") {
    if (!row.clickId) {
      return {
        status: "SKIPPED",
        message: "Skipped because no LinkedIn click ID is available.",
      };
    }

    if (!row.conversionName) {
      return {
        status: "WAITING",
        message: "Waiting for a LinkedIn Ads conversion rule mapping.",
      };
    }

    return {
      status: "WAITING",
      message:
        "LinkedIn Ads conversion uploads use iD30 Auth. Reconnect LinkedIn Ads through Auth before upload.",
    };
  }

  const inspection =
    context.slug === "google-ads"
      ? inspectGoogleAdsConversion(row, context)
      : context.slug === "bing-ads"
        ? inspectBingAdsConversion(row, context)
        : inspectMetaConversion(row, context);

  if (inspection) return inspection;

  return {
    status: "READY",
    message: `Dry run passed for ${uploadProviderName(context.slug)}. No provider upload was sent.`,
  };
}

function authBrokerConversionInspectPayload(
  row: ConversionUploadRow,
  context: UploadProviderContext,
) {
  return buildAuthBrokerConversionUploadPayload({ context, row });
}

async function inspectQueuedConversionDryRun(
  row: ConversionUploadRow,
  context: UploadProviderContext,
): Promise<ProviderUploadResult> {
  if (!context.authBrokerConnectionId) {
    return inspectQueuedConversion(row, context);
  }

  const result = await inspectMarketingAuthBrokerConversionUpload({
    connectionId: context.authBrokerConnectionId,
    payload: authBrokerConversionInspectPayload(row, context),
  });

  if (!result.ok) {
    return {
      status: "WAITING",
      message: result.message,
    };
  }

  return {
    status: result.result.status,
    message: `iD30 Auth dry run: ${result.result.message}`,
    response: safeJson({
      provider: result.provider,
      checks: result.result.checks,
    }),
  };
}

async function uploadQueuedConversionWithAuth(
  row: ConversionUploadRow,
  context: UploadProviderContext,
): Promise<ProviderUploadResult> {
  if (!context.authBrokerConnectionId) {
    return uploadQueuedConversion(row, context);
  }

  const result = await sendMarketingAuthBrokerConversionUpload({
    connectionId: context.authBrokerConnectionId,
    payload: {
      ...authBrokerConversionInspectPayload(row, context),
      dryRun: false,
    },
  });

  if (!result.ok) {
    return {
      status: "WAITING",
      message: result.message,
    };
  }

  return {
    status: result.result.status,
    message: `iD30 Auth send: ${result.result.message}`,
    response: safeJson({
      provider: result.provider,
      checks: result.result.checks,
      response: result.result.response,
    }),
  };
}

export async function prepareMarketingConversionUploadsJob(
  options: PrepareMarketingConversionUploadsOptions = {},
): Promise<PrepareMarketingConversionUploadsResult> {
  if (options.recordJobRun === false) {
    return prepareMarketingConversionUploadsJobCore();
  }

  return runWithBackgroundJob({
    actorId: options.actorId ?? null,
    dryRun: false,
    jobName: "marketing-conversion-upload-prep",
    jobType: "marketing",
    trigger: options.trigger ?? "manual",
    run: prepareMarketingConversionUploadsJobCore,
    complete: (result) => ({
      message: result.prepared
        ? `Prepared ${result.prepared} marketing conversion upload row${
            result.prepared === 1 ? "" : "s"
          }.`
        : `No marketing conversion upload rows prepared from ${result.candidateCount} candidate${
            result.candidateCount === 1 ? "" : "s"
          }.`,
      recordsRead: result.candidateCount,
      recordsWritten: result.prepared,
      status: warningStatusWhen(result.prepared === 0),
      summary: safeJobJson(result),
    }),
  });
}

async function prepareMarketingConversionUploadsJobCore(): Promise<PrepareMarketingConversionUploadsResult> {
  const [providers, candidates] = await Promise.all([
    loadUploadProviders(),
    loadUploadCandidates(),
  ]);
  const summary: PrepareMarketingConversionUploadsResult = {
    candidateCount: candidates.length,
    prepared: 0,
    providerCount: providers.length,
    providers: [],
    skippedMissingClickId: 0,
  };

  if (!providers.length) {
    revalidatePath("/marketing");
    revalidatePath("/settings/integrations");
    return summary;
  }

  for (const provider of providers) {
    const rows: Prisma.MarketingConversionUploadCreateManyInput[] = [];
    let skippedMissingClickId = 0;

    for (const candidate of candidates) {
      const click = findProviderClickId(provider.slug, candidate.attribution);

      if (!click) {
        skippedMissingClickId += 1;
        continue;
      }

      const mappedConversionName = conversionName(provider, candidate.conversionType);

      rows.push({
        provider: provider.provider,
        conversionType: candidate.conversionType,
        entityType: candidate.entityType,
        entityId: candidate.entityId,
        status: "PENDING",
        valueCents: candidate.valueCents,
        currency: candidate.currency,
        occurredAt: click.capturedAt ? new Date(click.capturedAt) : candidate.occurredAt,
        clickId: click.clickId,
        clickIdSource: click.clickIdSource,
        conversionName: mappedConversionName ?? null,
        payload: {
          ...candidate.payload,
          provider: provider.provider,
          providerSlug: provider.slug,
          providerName: provider.name,
          clickIdSource: click.clickIdSource,
          configuredConversionName: mappedConversionName ?? null,
        },
        message: mappedConversionName
          ? "Ready for provider upload worker."
          : "Ready for upload once a provider conversion mapping is configured.",
      });
    }

    const result = rows.length
      ? await prisma.marketingConversionUpload.createMany({
          data: rows,
          skipDuplicates: true,
        })
      : { count: 0 };

    await prisma.marketingIntegrationSyncLog.create({
      data: {
        integrationId: provider.connectionId,
        provider: provider.provider,
        status: result.count > 0 ? "SUCCESS" : "WARNING",
        syncType: "conversion-queue-prep",
        recordsRead: candidates.length,
        recordsWritten: result.count,
        message:
          result.count > 0
            ? `Prepared ${result.count} lifecycle conversion upload${result.count === 1 ? "" : "s"}.`
            : `No new lifecycle conversions prepared. ${skippedMissingClickId} candidate${skippedMissingClickId === 1 ? "" : "s"} missing provider click IDs.`,
        metadata: {
          skippedMissingClickId,
          candidateCount: candidates.length,
          providerSlug: provider.slug,
        },
        finishedAt: new Date(),
      },
    });

    summary.prepared += result.count;
    summary.skippedMissingClickId += skippedMissingClickId;
    summary.providers.push({
      candidateCount: candidates.length,
      prepared: result.count,
      provider: provider.provider,
      providerSlug: provider.slug,
      skippedMissingClickId,
    });
  }

  revalidatePath("/marketing");
  revalidatePath("/settings/integrations");
  return summary;
}

export async function prepareMarketingConversionUploadsAction() {
  const user = await requireAdmin();
  await prepareMarketingConversionUploadsJob({
    actorId: user.id,
    trigger: "manual",
  });
}

export async function processMarketingConversionUploadsJob(
  limit = 50,
  options: ProcessMarketingConversionUploadsOptions = {},
) {
  const dryRun = Boolean(options.dryRun);
  const providerFilter = options.provider?.trim();

  if (options.recordJobRun === false) {
    return processMarketingConversionUploadsJobCore(limit, options);
  }

  return runWithBackgroundJob({
    actorId: options.actorId ?? null,
    dryRun,
    jobName: dryRun
      ? "marketing-conversion-upload-dry-run"
      : "marketing-conversion-upload-process",
    jobType: "marketing",
    metadata: safeJobJson({
      limit: Math.min(Math.max(limit, 1), 250),
      logEmptyProvider: options.logEmptyProvider ?? false,
      provider: providerFilter || null,
    }),
    trigger: options.trigger ?? "manual",
    run: () => processMarketingConversionUploadsJobCore(limit, options),
    complete: (result) => ({
      message: dryRun
        ? `${result.ready} ready, ${result.failed} failed, ${result.skipped} skipped, ${result.waiting} waiting. Dry run only.`
        : `${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped, ${result.waiting} waiting.`,
      recordsRead: result.read,
      recordsWritten: dryRun ? 0 : result.sent,
      status:
        result.failed > 0
          ? BackgroundJobRunStatus.ERROR
          : warningStatusWhen(
              dryRun ||
                result.waiting > 0 ||
                result.skipped > 0 ||
                result.read === 0,
            ),
      summary: safeJobJson(result),
    }),
  });
}

async function processMarketingConversionUploadsJobCore(
  limit = 50,
  options: ProcessMarketingConversionUploadsOptions = {},
) {
  const dryRun = Boolean(options.dryRun);
  const providerFilter = options.provider?.trim();
  const pendingUploads = await prisma.marketingConversionUpload.findMany({
    where: {
      status: "PENDING",
      ...(providerFilter ? { provider: providerFilter } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: Math.min(Math.max(limit, 1), 250),
    select: {
      id: true,
      provider: true,
      conversionType: true,
      entityType: true,
      entityId: true,
      valueCents: true,
      currency: true,
      occurredAt: true,
      clickId: true,
      clickIdSource: true,
      conversionName: true,
      payload: true,
    },
  });

  if (!pendingUploads.length) {
    if (dryRun && providerFilter && options.logEmptyProvider) {
      const providerSlug = providerSlugFromProvider(providerFilter);
      const connection = await prisma.integrationConnection.findUnique({
        where: { provider: providerFilter },
        select: { id: true, status: true },
      });

      if (connection) {
        await prisma.marketingIntegrationSyncLog.create({
          data: {
            integrationId: connection.id,
            provider: providerFilter,
            status: "WARNING",
            syncType: "conversion-upload-dry-run",
            recordsRead: 0,
            recordsWritten: 0,
            message:
              connection.status === "CONNECTED"
                ? "No pending conversion uploads are queued for this provider. Prepare lifecycle conversions before running a dry-run inspection."
                : "Provider connection is not connected yet, so no conversion upload dry-run could run.",
            metadata: {
              dryRun,
              emptyQueue: true,
              providerSlug,
            },
            finishedAt: new Date(),
          },
        });
      }
    }

    revalidatePath("/marketing");
    revalidatePath("/settings/integrations");
    return {
      dryRun,
      failed: 0,
      read: 0,
      ready: 0,
      sent: 0,
      skipped: 0,
      waiting: 0,
    };
  }

  const providers = Array.from(new Set(pendingUploads.map((upload) => upload.provider)));
  const connections = await prisma.integrationConnection.findMany({
    where: { provider: { in: providers } },
    select: {
      id: true,
      provider: true,
      status: true,
      config: true,
    },
  });
  const connectionMap = new Map(
    connections.map((connection) => [connection.provider, connection]),
  );
  const contextMap = new Map<string, UploadProviderContext>();

  for (const provider of providers) {
    const slug = providerSlugFromProvider(provider);
    const connection = connectionMap.get(provider);

    if (!slug || !connection || connection.status !== "CONNECTED") continue;

    const parsedConfig = parseMarketingIntegrationProviderConfig(
      slug,
      connection.config,
    );
    if (!parsedConfig.success) continue;

    let credentials: ProviderCredentialMap | null = null;
    try {
      credentials = decryptProviderCredentials(
        connection.config,
        providerCredentialKeys(slug),
      );
    } catch {
      credentials = null;
    }

    if (credentials && slug !== "meta" && slug !== "linkedin-ads") {
      try {
        const oauthCredentials = providerOAuthClientCredentials(slug, connection.config);

        credentials = oauthCredentials
          ? {
              ...credentials,
              oauthClientId: oauthCredentials.clientId,
              oauthClientSecret: oauthCredentials.clientSecret,
            }
          : null;
      } catch {
        credentials = null;
      }
    }

    contextMap.set(provider, {
      authBrokerConnectionId: authBrokerConnectionId(connection.config),
      connectionId: connection.id,
      provider,
      slug,
      config: parsedConfig.data as
        | BingAdsConfig
        | GoogleAdsConfig
        | LinkedInAdsConfig
        | MetaConfig,
      credentials,
    });
  }

  const resultsByProvider = new Map<
    string,
    UploadJobCounters
  >();
  const totals: UploadJobCounters & { dryRun: boolean } = {
    dryRun,
    failed: 0,
    read: 0,
    ready: 0,
    sent: 0,
    skipped: 0,
    waiting: 0,
  };

  for (const upload of pendingUploads) {
    const context = contextMap.get(upload.provider);
    const attemptedAt = new Date();
    const current = resultsByProvider.get(upload.provider) ?? {
      failed: 0,
      read: 0,
      ready: 0,
      sent: 0,
      skipped: 0,
      waiting: 0,
    };

    current.read += 1;
    totals.read += 1;

    if (!context) {
      current.waiting += 1;
      totals.waiting += 1;
      if (!dryRun) {
        await prisma.marketingConversionUpload.update({
          where: { id: upload.id },
          data: {
            attemptCount: { increment: 1 },
            lastAttemptAt: attemptedAt,
            message:
              "Waiting for a connected provider configuration before upload can run.",
          },
        });
      }
      resultsByProvider.set(upload.provider, current);
      continue;
    }

    const result = dryRun
      ? await inspectQueuedConversionDryRun(upload, context)
      : await uploadQueuedConversionWithAuth(upload, context);
    if (result.status === "SENT") {
      current.sent += 1;
      totals.sent += 1;
    }
    if (result.status === "FAILED") {
      current.failed += 1;
      totals.failed += 1;
    }
    if (result.status === "SKIPPED") {
      current.skipped += 1;
      totals.skipped += 1;
    }
    if (result.status === "WAITING") {
      current.waiting += 1;
      totals.waiting += 1;
    }
    if (result.status === "READY") {
      current.ready += 1;
      totals.ready += 1;
    }

    if (!dryRun) {
      const persistedStatus =
        result.status === "READY" || result.status === "WAITING" ? null : result.status;

      await prisma.marketingConversionUpload.update({
        where: { id: upload.id },
        data: {
          attemptCount: { increment: 1 },
          lastAttemptAt: attemptedAt,
          message: result.message,
          ...(result.response ? { response: result.response } : {}),
          ...(persistedStatus
            ? {
                status: persistedStatus,
                uploadedAt: persistedStatus === "SENT" ? new Date() : null,
              }
            : {}),
        },
      });
    }

    resultsByProvider.set(upload.provider, current);
  }

  for (const [provider, result] of resultsByProvider.entries()) {
    const context = contextMap.get(provider);
    const connection = connectionMap.get(provider);
    if (!connection) continue;

    await prisma.marketingIntegrationSyncLog.create({
      data: {
        integrationId: context?.connectionId ?? connection.id,
        provider,
        status:
          !context
            ? "WARNING"
            : result.failed > 0
            ? "ERROR"
            : dryRun
              ? result.ready > 0
                ? "SUCCESS"
                : "WARNING"
              : result.sent > 0
              ? "SUCCESS"
              : "WARNING",
        syncType: dryRun ? "conversion-upload-dry-run" : "conversion-upload",
        recordsRead: result.read,
        recordsWritten: dryRun ? 0 : result.sent,
        message: !context
          ? "Provider connection is not connected, so queued conversions are waiting for setup."
          : dryRun
            ? `${result.ready} ready, ${result.failed} failed, ${result.skipped} skipped, ${result.waiting} waiting. Dry run only; no provider uploads sent.`
            : `${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped, ${result.waiting} waiting.`,
        metadata: {
          dryRun,
          providerSlug: context?.slug ?? providerSlugFromProvider(provider),
          failed: result.failed,
          ready: result.ready,
          skipped: result.skipped,
          waiting: result.waiting,
        },
        finishedAt: new Date(),
      },
    });
  }

  revalidatePath("/marketing");
  revalidatePath("/settings/integrations");

  return totals;
}

export async function processMarketingConversionUploadsAction() {
  const user = await requireAdmin();
  await processMarketingConversionUploadsJob(50, {
    actorId: user.id,
    trigger: "manual",
  });
}

export async function importMarketingAdSpendAction() {
  const user = await requireAdmin();

  await importMarketingAdSpendJob({
    actorId: user.id,
    trigger: "manual",
  });
}

async function importMarketingAdSpendJob(options: {
  actorId?: string | null;
  trigger?: string;
}) {
  return runWithBackgroundJob({
    actorId: options.actorId ?? null,
    dryRun: false,
    jobName: "marketing-ad-spend-import",
    jobType: "marketing",
    trigger: options.trigger ?? "manual",
    run: importMarketingAdSpendJobCore,
    complete: (result) => ({
      message: result.providers
        ? `Imported ${result.written} provider reporting row${
            result.written === 1 ? "" : "s"
          } from ${result.providers} provider${result.providers === 1 ? "" : "s"}.`
        : "No connected marketing providers were available for reporting import.",
      recordsRead: result.read,
      recordsWritten: result.written,
      status:
        result.errors > 0
          ? BackgroundJobRunStatus.ERROR
          : warningStatusWhen(
              result.providers === 0 ||
                result.warnings > 0 ||
                result.skipped > 0 ||
                result.written === 0,
            ),
      summary: safeJobJson(result),
    }),
  });
}

async function importMarketingAdSpendJobCore(): Promise<SpendImportJobCounters> {
  const providerDefinitions = marketingIntegrationProviderDefinitions.filter(
    (provider) => isReportingImportProviderSlug(provider.slug),
  );
  const connections = await prisma.integrationConnection.findMany({
    where: {
      provider: {
        in: providerDefinitions.map((provider) => provider.provider),
      },
      status: "CONNECTED",
    },
    select: {
      id: true,
      provider: true,
      config: true,
    },
  });
  const counters: SpendImportJobCounters = {
    errors: 0,
    providers: connections.length,
    read: 0,
    skipped: 0,
    warnings: 0,
    written: 0,
  };

  for (const connection of connections) {
    const slug = reportingImportSlugFromProvider(connection.provider);
    const startedAt = new Date();

    if (!slug) {
      counters.skipped += 1;
      continue;
    }

    const parsedConfig = parseMarketingIntegrationProviderConfig(slug, connection.config);
    if (!parsedConfig.success) {
      counters.errors += 1;
      await prisma.marketingIntegrationSyncLog.create({
        data: {
          integrationId: connection.id,
          provider: connection.provider,
          status: "ERROR",
          syncType: "reporting-import",
          message:
            "Provider config is invalid. Save integration settings before importing provider data.",
          metadata: { providerSlug: slug },
          startedAt,
          finishedAt: new Date(),
        },
      });
      continue;
    }

    const config = parsedConfig.data as ReportingImportConfig;
    if (!reportingImportEnabled(slug, config)) {
      counters.warnings += 1;
      await prisma.marketingIntegrationSyncLog.create({
        data: {
          integrationId: connection.id,
          provider: connection.provider,
          status: "WARNING",
          syncType: reportingImportSyncType(slug),
          message:
            slug === "google-analytics"
              ? "Google Analytics reporting import is disabled for this provider."
              : slug === "google-search-console"
              ? "Search Console performance import is disabled for this provider."
              : slug === "klaviyo"
                ? "Klaviyo lifecycle reporting import is disabled for this provider."
                : "Cost import is disabled for this provider.",
          metadata: { providerSlug: slug },
          startedAt,
          finishedAt: new Date(),
        },
      });
      continue;
    }

    const authBrokerId =
      slug === "klaviyo" ? authBrokerConnectionId(connection.config) : null;
    let credentials: ProviderCredentialMap | null = null;
    try {
      if (slug === "klaviyo") {
        const apiKey = klaviyoApiKey(connection.config);
        credentials = apiKey ? { privateApiKey: apiKey } : null;
      } else {
        credentials = decryptProviderCredentials(
          connection.config,
          reportingImportCredentialKeys(slug),
        );
      }
    } catch {
      credentials = null;
    }

    if (!credentials && !authBrokerId) {
      counters.warnings += 1;
      await prisma.marketingIntegrationSyncLog.create({
        data: {
          integrationId: connection.id,
          provider: connection.provider,
          status: "WARNING",
          syncType: reportingImportSyncType(slug),
          message: reportingCredentialWarningMessage(slug),
          metadata: { providerSlug: slug },
          startedAt,
          finishedAt: new Date(),
        },
      });
      continue;
    }

    try {
      const result = await importMarketingProviderReportingData(
        {
          id: connection.id,
          provider: connection.provider,
          slug,
          authBrokerConnectionId: authBrokerId,
          config,
          storedConfig: connection.config,
        },
        credentials,
      );
      const providerName = reportingImportProviderName(slug);
      counters.read += result.read;
      counters.written += result.written;
      if (result.written === 0) counters.warnings += 1;

      await prisma.marketingIntegrationSyncLog.create({
        data: {
          integrationId: connection.id,
          provider: connection.provider,
          status: result.written > 0 ? "SUCCESS" : "WARNING",
          syncType: reportingImportSyncType(slug),
          recordsRead: result.read,
          recordsWritten: result.written,
          message:
            result.message ??
            `Imported ${result.written} ${providerName} campaign reporting row${result.written === 1 ? "" : "s"}.`,
          metadata: {
            providerSlug: slug,
            source: result.source ?? reportingImportSource(slug),
          },
          startedAt,
          finishedAt: new Date(),
        },
      });
    } catch (error) {
      counters.errors += 1;
      await prisma.marketingIntegrationSyncLog.create({
        data: {
          integrationId: connection.id,
          provider: connection.provider,
          status: "ERROR",
          syncType: reportingImportSyncType(slug),
          message:
            error instanceof Error
              ? error.message
              : `${reportingImportProviderName(slug)} provider data import failed.`,
          metadata: {
            providerSlug: slug,
            source: reportingImportSource(slug),
          },
          startedAt,
          finishedAt: new Date(),
        },
      });
    }
  }

  revalidatePath("/marketing");
  revalidatePath("/marketing/ad-platforms");
  revalidatePath("/marketing/lead-sources");
  revalidatePath("/marketing/attribution-reports");
  revalidatePath("/settings/integrations");

  return counters;
}

export async function dryRunMarketingConversionUploadsAction() {
  const user = await requireAdmin();
  await processMarketingConversionUploadsJob(50, {
    actorId: user.id,
    dryRun: true,
    trigger: "manual",
  });
}

export async function dryRunMarketingProviderConversionUploadsAction(
  formData: FormData,
) {
  const user = await requireAdmin();

  const providerSlug = String(formData.get("providerSlug") ?? "").trim();
  const provider = uploadProviderDefinitionFromSlug(providerSlug);

  if (!provider) return;

  await processMarketingConversionUploadsJob(50, {
    actorId: user.id,
    dryRun: true,
    logEmptyProvider: true,
    provider: provider.provider,
    trigger: "manual",
  });
  revalidatePath(`/settings/integrations/${provider.slug}`);
}

export async function retryFailedMarketingConversionUploadsAction() {
  await requireAdmin();

  await prisma.marketingConversionUpload.updateMany({
    where: { status: "FAILED" },
    data: {
      status: "PENDING",
      message: "Queued for retry.",
      uploadedAt: null,
    },
  });

  revalidatePath("/marketing");
  revalidatePath("/settings/integrations");
}
