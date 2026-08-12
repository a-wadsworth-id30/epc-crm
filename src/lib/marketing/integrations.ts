import { z } from "zod";

export const marketingIntegrationProviders = {
  bingAds: "marketing-bing-ads",
  googleAnalytics: "marketing-google-analytics",
  googleAds: "marketing-google-ads",
  googleSearchConsole: "marketing-google-search-console",
  klaviyo: "marketing-klaviyo",
  linkedInAds: "marketing-linkedin-ads",
  meta: "marketing-meta",
} as const;

export const marketingIntegrationProviderGroups = [
  {
    key: "analytics",
    title: "Analytics",
    description:
      "Measurement platforms used to compare CRM attribution with website traffic and event data.",
  },
  {
    key: "advertising",
    title: "Advertising",
    description:
      "Ad platforms used for spend import, click matching and conversion feedback.",
  },
  {
    key: "email-automation",
    title: "Email & Automation",
    description:
      "Lifecycle messaging platforms used for email, SMS, audience and automation attribution.",
  },
] as const;

export const marketingIntegrationProviderDefinitions = [
  {
    name: "Google Analytics",
    shortName: "GA4",
    slug: "google-analytics",
    group: "analytics",
    provider: marketingIntegrationProviders.googleAnalytics,
    status: "Not Connected",
    accent:
      "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-900/20 dark:text-amber-200 dark:ring-amber-800",
    description:
      "Match visitor sessions with GA4 events so CRM attribution can be compared against website analytics.",
    data: [
      "Measurement ID",
      "Traffic source",
      "Event matching",
      "Session enrichment",
    ],
    setupTitle: "Google Analytics setup",
    setupDescription:
      "Store the GA4 identifiers used to match CRM visitor sessions with website events.",
    next: "GA4 measurement, property and event mapping. OAuth property discovery is not required for the tracking script.",
  },
  {
    name: "Google Search Console",
    shortName: "GSC",
    slug: "google-search-console",
    group: "analytics",
    provider: marketingIntegrationProviders.googleSearchConsole,
    status: "Not Connected",
    accent:
      "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-900/20 dark:text-blue-200 dark:ring-blue-800",
    description:
      "Connect organic search query and landing-page performance for SEO attribution and lead quality reporting.",
    data: [
      "Search property",
      "Organic queries",
      "Landing pages",
      "SEO performance",
    ],
    setupTitle: "Google Search Console setup",
    setupDescription:
      "Store the verified Search Console property used for organic search performance reporting.",
    next: "OAuth access, verified Search Console property and search performance import settings.",
  },
  {
    name: "Google Ads",
    shortName: "Ads",
    slug: "google-ads",
    group: "advertising",
    provider: marketingIntegrationProviders.googleAds,
    status: "Not Connected",
    accent:
      "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-900/20 dark:text-blue-200 dark:ring-blue-800",
    description:
      "Import campaign, keyword and cost data, then send qualified leads and calls back as conversions.",
    data: [
      "Campaign cost",
      "Click IDs",
      "Conversion upload",
      "Keyword performance",
    ],
    setupTitle: "Google Ads setup",
    setupDescription:
      "Store account and conversion mapping used for spend import and offline conversion uploads.",
    next: "OAuth app, Ads account selector and offline conversion mapping.",
  },
  {
    name: "Klaviyo",
    shortName: "Klaviyo",
    slug: "klaviyo",
    group: "email-automation",
    provider: marketingIntegrationProviders.klaviyo,
    status: "Not Connected",
    accent:
      "bg-lime-50 text-lime-700 ring-lime-200 dark:bg-lime-900/20 dark:text-lime-200 dark:ring-lime-800",
    description:
      "Connect email, SMS, list, campaign and flow data for lifecycle marketing attribution.",
    data: [
      "Lists",
      "Campaigns",
      "Flows",
      "Profile events",
    ],
    setupTitle: "Klaviyo setup",
    setupDescription:
      "Store Klaviyo account, list and lifecycle event settings for email and SMS attribution reporting.",
    next: "iD30 Auth login, account selector refresh and lifecycle event mapping.",
  },
  {
    name: "Bing Ads",
    shortName: "Bing",
    slug: "bing-ads",
    group: "advertising",
    provider: marketingIntegrationProviders.bingAds,
    status: "Not Connected",
    accent:
      "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-200 dark:ring-emerald-800",
    description:
      "Import Microsoft Advertising campaign spend, track MSCLKIDs and send qualified CRM conversions back to Bing Ads.",
    data: [
      "Campaign cost",
      "MSCLKID matching",
      "Conversion upload",
      "UET goal mapping",
    ],
    setupTitle: "Bing Ads setup",
    setupDescription:
      "Store Microsoft Advertising account, UET and conversion goal mapping used for spend import and offline conversion uploads.",
    next: "OAuth app, Microsoft Advertising account selector and UET conversion goal mapping.",
  },
  {
    name: "LinkedIn Ads",
    shortName: "LinkedIn",
    slug: "linkedin-ads",
    group: "advertising",
    provider: marketingIntegrationProviders.linkedInAds,
    status: "Not Connected",
    accent:
      "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-900/20 dark:text-blue-200 dark:ring-blue-800",
    description:
      "Connect LinkedIn campaign, lead quality and conversion mapping for B2B attribution reporting.",
    data: [
      "Campaign cost",
      "LI FAT ID matching",
      "Conversion upload",
      "B2B lead quality",
    ],
    setupTitle: "LinkedIn Ads setup",
    setupDescription:
      "Store LinkedIn Ads account, insight tag and conversion mapping used for B2B attribution and future conversion uploads.",
    next: "OAuth connection, LinkedIn Ads account selector, Insight Tag mapping and conversion rule setup.",
  },
  {
    name: "Meta",
    shortName: "Meta",
    slug: "meta",
    group: "advertising",
    provider: marketingIntegrationProviders.meta,
    status: "Not Connected",
    accent:
      "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-900/20 dark:text-sky-200 dark:ring-sky-800",
    description:
      "Connect Meta ads and pixel data for campaign reporting, lead matching and conversion feedback.",
    data: ["Ad account", "Pixel ID", "Lead matching", "Cost import"],
    setupTitle: "Meta setup",
    setupDescription:
      "Store Meta ad account, pixel and event mapping used for spend and conversion reporting.",
    next: "Meta app credentials, ad account permissions and conversion event mapping.",
  },
] as const;

export type MarketingIntegrationProviderDefinition =
  (typeof marketingIntegrationProviderDefinitions)[number];

export type MarketingIntegrationProviderSlug =
  MarketingIntegrationProviderDefinition["slug"];

export type MarketingIntegrationConnectionStatus =
  | "CONNECTED"
  | "NOT_CONNECTED"
  | "ERROR";

export function findMarketingIntegrationProvider(slug: string) {
  return marketingIntegrationProviderDefinitions.find(
    (provider) => provider.slug === slug,
  );
}

export function getMarketingIntegrationProviderState(
  provider: MarketingIntegrationProviderDefinition,
  connection:
    | {
        status: MarketingIntegrationConnectionStatus;
        config: unknown;
      }
    | null
    | undefined,
) {
  const config = parseMarketingIntegrationProviderConfig(
    provider.slug,
    connection?.config ?? {},
  );
  const connected =
    connection?.status === "CONNECTED" &&
    config.success &&
    hasMarketingProviderRequiredMapping(provider.slug, config.data);

  return {
    ...provider,
    connected,
    status: connected ? "Connected" : provider.status,
    next: connected
      ? getConnectedMarketingIntegrationNextStep(provider.slug, config.data)
      : provider.next,
  };
}

function hasMarketingProviderRequiredMapping(
  provider: MarketingIntegrationProviderSlug,
  config:
    | BingAdsConfig
    | GoogleAdsConfig
    | GoogleAnalyticsConfig
    | GoogleSearchConsoleConfig
    | KlaviyoConfig
    | LinkedInAdsConfig
    | MetaConfig,
) {
  if (provider === "linkedin-ads") {
    return hasString((config as LinkedInAdsConfig).adAccountId);
  }

  return true;
}

const nullableOptionalStringSchema = z.union([
  z.string(),
  z.null(),
  z.undefined(),
]);

const commaListSchema = z
  .union([z.string(), z.array(z.string()), z.null(), z.undefined()])
  .transform((value) => {
    const values = Array.isArray(value) ? value : value ? value.split(",") : [];

    return values.map((item) => item.trim()).filter(Boolean);
  });

function optionalTrimmedStringSchema() {
  return nullableOptionalStringSchema.transform((value) => {
    if (typeof value !== "string") return null;

    const trimmed = value.trim();

    return trimmed || null;
  });
}

function defaultedTrimmedStringSchema(defaultValue: string) {
  return nullableOptionalStringSchema.transform((value) => {
    if (typeof value !== "string") return defaultValue;

    return value.trim() || defaultValue;
  });
}

const microsoftAdsNumericIdPattern = /^\d+$/;

function microsoftAdsRequiredNumericIdSchema(message: string) {
  return z.string().trim().regex(microsoftAdsNumericIdPattern, message);
}

function microsoftAdsOptionalNumericIdSchema() {
  return nullableOptionalStringSchema.transform((value) => {
    if (typeof value !== "string") return null;

    const trimmed = value.trim();

    return microsoftAdsNumericIdPattern.test(trimmed) ? trimmed : null;
  });
}

function googleAdsOptionalCustomerIdSchema() {
  return nullableOptionalStringSchema.transform((value) => {
    if (typeof value !== "string") return null;

    const trimmed = value.trim().replaceAll("-", "");

    return trimmed || null;
  });
}

const marketingProviderSelectorOptionSchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.string().trim().nullable().optional(),
    description: z.string().trim().nullable().optional(),
    status: z.string().trim().nullable().optional(),
  })
  .passthrough();

const marketingProviderSelectorOptionListSchema = z
  .array(marketingProviderSelectorOptionSchema)
  .catch([]);

export const marketingProviderSelectorOptionsSchema = z
  .object({
    accounts: marketingProviderSelectorOptionListSchema.optional(),
    campaigns: marketingProviderSelectorOptionListSchema.optional(),
    managerAccounts: marketingProviderSelectorOptionListSchema.optional(),
    conversionActions: marketingProviderSelectorOptionListSchema.optional(),
    conversionGoals: marketingProviderSelectorOptionListSchema.optional(),
    conversionRules: marketingProviderSelectorOptionListSchema.optional(),
    events: marketingProviderSelectorOptionListSchema.optional(),
    flows: marketingProviderSelectorOptionListSchema.optional(),
    forms: marketingProviderSelectorOptionListSchema.optional(),
    insightTags: marketingProviderSelectorOptionListSchema.optional(),
    lists: marketingProviderSelectorOptionListSchema.optional(),
    pixels: marketingProviderSelectorOptionListSchema.optional(),
    properties: marketingProviderSelectorOptionListSchema.optional(),
    segments: marketingProviderSelectorOptionListSchema.optional(),
    streams: marketingProviderSelectorOptionListSchema.optional(),
    sites: marketingProviderSelectorOptionListSchema.optional(),
    uetTags: marketingProviderSelectorOptionListSchema.optional(),
  })
  .passthrough()
  .catch({});

export type MarketingProviderSelectorOption = z.infer<
  typeof marketingProviderSelectorOptionSchema
>;
export type MarketingProviderSelectorOptions = z.infer<
  typeof marketingProviderSelectorOptionsSchema
>;

export const googleAnalyticsConfigSchema = z.object({
  measurementId: z
    .string()
    .trim()
    .regex(/^G-[A-Z0-9]+$/i, "Enter a GA4 Measurement ID such as G-ABC123XYZ.")
    .transform((value) => value.toUpperCase()),
  propertyId: z.string().trim().min(4, "Enter the GA4 property ID."),
  dataStreamName: optionalTrimmedStringSchema(),
  primaryConversionEvent: defaultedTrimmedStringSchema("generate_lead"),
  callConversionEvent: defaultedTrimmedStringSchema("phone_call_lead"),
  matchedEventNames: commaListSchema,
  importAnalyticsReportingEnabled: z.boolean().default(false),
  selectorOptions: marketingProviderSelectorOptionsSchema.optional(),
});

export type GoogleAnalyticsConfig = z.infer<typeof googleAnalyticsConfigSchema>;

export function hasGoogleAnalyticsConnection(config: unknown) {
  return googleAnalyticsConfigSchema.safeParse(config ?? {}).success;
}

export const googleSearchConsoleConfigSchema = z.object({
  siteUrl: z
    .string()
    .trim()
    .min(4, "Enter a Search Console URL-prefix or domain property.")
    .refine(
      (value) => value.startsWith("sc-domain:") || /^https?:\/\//i.test(value),
      "Enter a verified URL-prefix property such as https://example.com/ or a domain property such as sc-domain:example.com.",
    ),
  propertyName: optionalTrimmedStringSchema(),
  searchType: z
    .enum(["web", "image", "video", "news", "googleNews"])
    .default("web"),
  dimensions: commaListSchema.transform((values) =>
    values.length ? values : ["query", "page"],
  ),
  importSearchPerformanceEnabled: z.boolean().default(false),
  selectorOptions: marketingProviderSelectorOptionsSchema.optional(),
});

export type GoogleSearchConsoleConfig = z.infer<
  typeof googleSearchConsoleConfigSchema
>;

export function hasGoogleSearchConsoleConnection(config: unknown) {
  return googleSearchConsoleConfigSchema.safeParse(config ?? {}).success;
}

export const klaviyoConfigSchema = z.object({
  accountId: optionalTrimmedStringSchema(),
  accountName: optionalTrimmedStringSchema(),
  defaultListId: optionalTrimmedStringSchema(),
  defaultListName: optionalTrimmedStringSchema(),
  attributionEventNames: commaListSchema.transform((values) =>
    values.length ? values : ["Submitted Form", "Placed Order"],
  ),
  importCampaignPerformanceEnabled: z.boolean().default(false),
  importFlowPerformanceEnabled: z.boolean().default(false),
  importProfileEventsEnabled: z.boolean().default(false),
  selectorOptions: marketingProviderSelectorOptionsSchema.optional(),
});

export type KlaviyoConfig = z.infer<typeof klaviyoConfigSchema>;

export function hasKlaviyoConnection(config: unknown) {
  return klaviyoConfigSchema.safeParse(config ?? {}).success;
}

export const bingAdsConfigSchema = z.object({
  customerId: microsoftAdsRequiredNumericIdSchema(
    "Enter the numeric Microsoft Advertising customer ID.",
  ),
  accountId: microsoftAdsRequiredNumericIdSchema(
    "Enter the numeric Microsoft Advertising account ID.",
  ),
  managerAccountId: microsoftAdsOptionalNumericIdSchema(),
  accountName: optionalTrimmedStringSchema(),
  uetTagId: microsoftAdsOptionalNumericIdSchema(),
  leadConversionGoalId: microsoftAdsOptionalNumericIdSchema(),
  leadConversionGoalName: optionalTrimmedStringSchema(),
  callConversionGoalId: microsoftAdsOptionalNumericIdSchema(),
  callConversionGoalName: optionalTrimmedStringSchema(),
  importCostEnabled: z.boolean().default(false),
  uploadOfflineConversionsEnabled: z.boolean().default(false),
  trackedClickIds: commaListSchema,
  selectorOptions: marketingProviderSelectorOptionsSchema.optional(),
});

export type BingAdsConfig = z.infer<typeof bingAdsConfigSchema>;

export function hasBingAdsConnection(config: unknown) {
  return bingAdsConfigSchema.safeParse(config ?? {}).success;
}

export const googleAdsConfigSchema = z.object({
  customerId: z
    .string()
    .trim()
    .regex(/^\d{3}-?\d{3}-?\d{4}$/, "Enter a Google Ads customer ID such as 123-456-7890.")
    .transform((value) => value.replaceAll("-", "")),
  managerCustomerId: googleAdsOptionalCustomerIdSchema(),
  accountName: optionalTrimmedStringSchema(),
  leadConversionActionId: optionalTrimmedStringSchema(),
  callConversionActionId: optionalTrimmedStringSchema(),
  importCostEnabled: z.boolean().default(false),
  uploadOfflineConversionsEnabled: z.boolean().default(false),
  trackedClickIds: commaListSchema,
  selectorOptions: marketingProviderSelectorOptionsSchema.optional(),
});

export type GoogleAdsConfig = z.infer<typeof googleAdsConfigSchema>;

export function hasGoogleAdsConnection(config: unknown) {
  return googleAdsConfigSchema.safeParse(config ?? {}).success;
}

export const linkedInAdsConfigSchema = z.object({
  adAccountId: nullableOptionalStringSchema.transform((value) => {
    if (typeof value !== "string") return null;

    const trimmed = value.trim();

    return trimmed ? trimmed.split(":").pop() || trimmed : null;
  }),
  insightTagId: optionalTrimmedStringSchema(),
  accountName: optionalTrimmedStringSchema(),
  accountMappingResetAt: optionalTrimmedStringSchema(),
  leadConversionRuleId: optionalTrimmedStringSchema(),
  callConversionRuleId: optionalTrimmedStringSchema(),
  importCostEnabled: z.boolean().default(false),
  uploadOfflineConversionsEnabled: z.boolean().default(false),
  trackedClickIds: commaListSchema,
  selectorOptions: marketingProviderSelectorOptionsSchema.optional(),
});

export type LinkedInAdsConfig = z.infer<typeof linkedInAdsConfigSchema>;

export function hasLinkedInAdsConnection(config: unknown) {
  const parsed = linkedInAdsConfigSchema.safeParse(config ?? {});

  return Boolean(parsed.success && parsed.data.adAccountId);
}

export const metaConfigSchema = z.object({
  adAccountId: z
    .string()
    .trim()
    .min(4, "Enter the Meta ad account ID.")
    .transform((value) => value.replace(/^act_/, "")),
  pixelId: optionalTrimmedStringSchema(),
  accountName: optionalTrimmedStringSchema(),
  leadEventName: defaultedTrimmedStringSchema("Lead"),
  callEventName: defaultedTrimmedStringSchema("Contact"),
  testEventCode: optionalTrimmedStringSchema(),
  importCostEnabled: z.boolean().default(false),
  uploadConversionsEnabled: z.boolean().default(false),
  trackedClickIds: commaListSchema,
  selectorOptions: marketingProviderSelectorOptionsSchema.optional(),
});

export type MetaConfig = z.infer<typeof metaConfigSchema>;

export function hasMetaConnection(config: unknown) {
  return metaConfigSchema.safeParse(config ?? {}).success;
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hasString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

export function marketingProviderSelectorOptionsFromConfig(config: unknown) {
  const rawOptions = jsonObject(jsonObject(config).selectorOptions);
  if (!Object.keys(rawOptions).length) return null;

  const parsed = marketingProviderSelectorOptionsSchema.safeParse(rawOptions);

  return parsed.success ? parsed.data : null;
}

function hasCredentialKeys(config: unknown, keys: string[]) {
  const credentials = jsonObject(jsonObject(config).credentials);

  return keys.every((key) => hasString(credentials[key]));
}

function authBrokerConnection(config: unknown) {
  const authBroker = jsonObject(jsonObject(config).authBroker);
  const status = typeof authBroker.status === "string" ? authBroker.status : null;
  const connectionId = hasString(authBroker.connectionId);

  return {
    connected: status === "connected" && connectionId,
    connectionId,
  };
}

function providerAccessDetail({
  authBrokerConnected,
  directAccessSaved,
  directDetail,
}: {
  authBrokerConnected: boolean;
  directAccessSaved: boolean;
  directDetail: string;
}) {
  if (authBrokerConnected) return "Connected through iD30 Auth";
  if (directAccessSaved) return directDetail;
  return "Provider login needed";
}

type MarketingCredentialStateOptions = {
  authBrokerConfigured?: boolean;
};

function authBrokerConfigured(options?: MarketingCredentialStateOptions) {
  if (options?.authBrokerConfigured) return true;

  const baseUrl = process.env.ID30_AUTH_BASE_URL?.trim();
  const crmClientId = process.env.ID30_AUTH_CRM_CLIENT_ID?.trim();
  const workspaceId =
    process.env.ID30_AUTH_WORKSPACE_ID?.trim() ||
    process.env.ID30_AUTH_CRM_CLIENT_ID?.trim();
  const sharedSecret = process.env.ID30_AUTH_SHARED_SECRET?.trim();
  const validBaseUrl = (value: string | undefined) => {
    if (!value) return false;

    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  };
  const validIdentifier = (value: string | undefined) =>
    Boolean(value && !value.includes("*"));

  return Boolean(
    validBaseUrl(baseUrl) &&
      validIdentifier(crmClientId) &&
      validIdentifier(workspaceId) &&
      sharedSecret &&
      sharedSecret.length >= 32,
  );
}

function authBrokerOAuthSupported(provider: MarketingIntegrationProviderSlug) {
  return (
    provider === "bing-ads" ||
    provider === "google-analytics" ||
    provider === "google-ads" ||
    provider === "google-search-console" ||
    provider === "klaviyo" ||
    provider === "linkedin-ads" ||
    provider === "meta"
  );
}

function oauthAppConfigured(
  provider: MarketingIntegrationProviderSlug,
  options?: MarketingCredentialStateOptions,
) {
  if (authBrokerOAuthSupported(provider) && authBrokerConfigured(options)) {
    return true;
  }

  if (provider === "google-ads") {
    return Boolean(
      process.env.GOOGLE_ADS_OAUTH_CLIENT_ID &&
        process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET,
    );
  }

  if (provider === "google-search-console") {
    return Boolean(
      process.env.GOOGLE_SEARCH_CONSOLE_OAUTH_CLIENT_ID &&
        process.env.GOOGLE_SEARCH_CONSOLE_OAUTH_CLIENT_SECRET,
    );
  }

  if (provider === "google-analytics") {
    return Boolean(
      process.env.GOOGLE_ANALYTICS_OAUTH_CLIENT_ID &&
        process.env.GOOGLE_ANALYTICS_OAUTH_CLIENT_SECRET,
    );
  }

  if (provider === "bing-ads") {
    return Boolean(
      process.env.MICROSOFT_ADS_OAUTH_CLIENT_ID &&
        process.env.MICROSOFT_ADS_OAUTH_CLIENT_SECRET,
    );
  }

  if (provider === "meta") {
    return Boolean(
      process.env.META_ADS_OAUTH_CLIENT_ID &&
        process.env.META_ADS_OAUTH_CLIENT_SECRET,
    );
  }

  if (provider === "linkedin-ads") {
    return Boolean(
      process.env.LINKEDIN_ADS_OAUTH_CLIENT_ID &&
        process.env.LINKEDIN_ADS_OAUTH_CLIENT_SECRET,
    );
  }

  if (provider === "klaviyo") {
    return Boolean(
      process.env.KLAVIYO_OAUTH_CLIENT_ID &&
        process.env.KLAVIYO_OAUTH_CLIENT_SECRET,
    );
  }

  return true;
}

function developerTokenEnvConfigured(provider: MarketingIntegrationProviderSlug) {
  if (provider === "google-ads") {
    return Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN);
  }

  if (provider === "bing-ads") {
    return Boolean(process.env.MICROSOFT_ADS_DEVELOPER_TOKEN);
  }

  return false;
}

function klaviyoApiKeySource(
  config: unknown,
): "app" | "env" | null {
  if (process.env.KLAVIYO_PRIVATE_API_KEY) {
    return "env";
  }

  return hasCredentialKeys(config, ["privateApiKey"]) ? "app" : null;
}

export function getMarketingIntegrationOAuthCredentialSource(
  provider: MarketingIntegrationProviderSlug,
  config: unknown,
  options?: MarketingCredentialStateOptions,
): "app" | "auth-broker" | "env" | null {
  if (authBrokerOAuthSupported(provider) && authBrokerConfigured(options)) {
    return "auth-broker";
  }

  if (oauthAppConfigured(provider, options)) {
    return "env";
  }

  if (hasCredentialKeys(config, ["oauthClientId", "oauthClientSecret"])) {
    return "app";
  }

  return null;
}

export function getMarketingIntegrationDeveloperTokenSource(
  provider: MarketingIntegrationProviderSlug,
  config: unknown,
): "app" | "env" | null {
  if (provider !== "google-ads" && provider !== "bing-ads") return null;

  if (developerTokenEnvConfigured(provider)) {
    return "env";
  }

  return hasCredentialKeys(config, ["developerToken"]) ? "app" : null;
}

function oauthCredentialSourceDetail(source: "app" | "auth-broker" | "env" | null) {
  if (source === "app") return "App credentials saved";
  if (source === "auth-broker") return "Using iD30 Auth";
  if (source === "env") return "Using workspace OAuth app";
  return "Client ID and secret needed";
}

function developerTokenSourceDetail(source: "app" | "env" | null) {
  if (source === "app") return "Developer token saved";
  if (source === "env") return "Using workspace developer token";
  return "Developer token needed";
}

function apiCredentialDetail({
  developerTokenSource,
  refreshTokenSaved,
}: {
  developerTokenSource: "app" | "env" | null;
  refreshTokenSaved: boolean;
}) {
  if (developerTokenSource && refreshTokenSaved) {
    return `${developerTokenSourceDetail(developerTokenSource)} and OAuth refresh token saved`;
  }

  if (!developerTokenSource && !refreshTokenSaved) {
    return "Developer token and OAuth refresh token needed";
  }

  if (!developerTokenSource) return "Developer token needed";

  return "OAuth refresh token needed";
}

function authManagedUploadCredentialDetail({
  authBrokerConnected,
  detail,
  ready,
}: {
  authBrokerConnected: boolean;
  detail: string;
  ready: boolean;
}) {
  if (authBrokerConnected) return "Managed by iD30 Auth";
  if (ready) return detail;

  return detail;
}

export function getMarketingIntegrationCredentialState(
  provider: MarketingIntegrationProviderSlug,
  config: unknown,
  options?: MarketingCredentialStateOptions,
) {
  if (provider === "google-analytics") {
    const parsed = googleAnalyticsConfigSchema.safeParse(config ?? {});
    const oauthSource = getMarketingIntegrationOAuthCredentialSource(
      provider,
      config,
      options,
    );
    const refreshTokenSaved = hasCredentialKeys(config, ["refreshToken"]);
    const authBrokerConnected = authBrokerConnection(config).connected;
    const providerAccessConnected = authBrokerConnected || refreshTokenSaved;
    const importEnabled = Boolean(
      parsed.success && parsed.data.importAnalyticsReportingEnabled,
    );

    return {
      oauthConfigured: Boolean(oauthSource),
      credentialsSaved: providerAccessConnected,
      providerAccessConnected,
      conversionMapped: parsed.success,
      uploadEnabled: importEnabled,
      uploadCredentialMode: authBrokerConnected
        ? ("auth-broker" as const)
        : refreshTokenSaved
          ? ("direct" as const)
          : ("missing" as const),
      uploadReady:
        Boolean(oauthSource) &&
        parsed.success &&
        (!importEnabled || providerAccessConnected),
      items: [
        {
          label: "OAuth app",
          ready: Boolean(oauthSource),
          detail: oauthCredentialSourceDetail(oauthSource),
        },
        {
          label: "Data API access",
          ready: providerAccessConnected,
          detail: providerAccessDetail({
            authBrokerConnected,
            directAccessSaved: refreshTokenSaved,
            directDetail: "OAuth refresh token saved",
          }),
        },
        {
          label: "Property mapping",
          ready: parsed.success,
          detail: parsed.success ? "GA4 property saved" : "GA4 property needed",
        },
        {
          label: "Event mapping",
          ready: parsed.success,
          detail: parsed.success ? "Lead and call events saved" : "Event names needed",
        },
        {
          label: "Import settings",
          ready: importEnabled,
          detail: importEnabled
            ? "GA4 Data API reporting import enabled"
            : "GA4 reporting import disabled",
        },
      ],
    };
  }

  if (provider === "google-search-console") {
    const parsed = googleSearchConsoleConfigSchema.safeParse(config ?? {});
    const oauthSource = getMarketingIntegrationOAuthCredentialSource(
      provider,
      config,
      options,
    );
    const refreshTokenSaved = hasCredentialKeys(config, ["refreshToken"]);
    const authBrokerConnected = authBrokerConnection(config).connected;
    const providerAccessConnected = authBrokerConnected || refreshTokenSaved;
    const searchPropertyMapped = parsed.success;
    const importEnabled = Boolean(
      parsed.success && parsed.data.importSearchPerformanceEnabled,
    );

    return {
      oauthConfigured: Boolean(oauthSource),
      credentialsSaved: providerAccessConnected,
      providerAccessConnected,
      conversionMapped: searchPropertyMapped,
      uploadEnabled: importEnabled,
      uploadCredentialMode: authBrokerConnected
        ? ("auth-broker" as const)
        : refreshTokenSaved
          ? ("direct" as const)
          : ("missing" as const),
      uploadReady:
        Boolean(oauthSource) &&
        searchPropertyMapped &&
        (!importEnabled || providerAccessConnected),
      items: [
        {
          label: "OAuth app",
          ready: Boolean(oauthSource),
          detail: oauthCredentialSourceDetail(oauthSource),
        },
        {
          label: "Provider access",
          ready: providerAccessConnected,
          detail: providerAccessDetail({
            authBrokerConnected,
            directAccessSaved: refreshTokenSaved,
            directDetail: "OAuth refresh token saved",
          }),
        },
        {
          label: "Search property",
          ready: searchPropertyMapped,
          detail: searchPropertyMapped
            ? "Verified property saved"
            : "Verified property needed",
        },
        {
          label: "Import settings",
          ready: importEnabled,
          detail: importEnabled
            ? "Organic performance import enabled"
            : "Organic performance import disabled",
        },
      ],
    };
  }

  if (provider === "klaviyo") {
    const parsed = klaviyoConfigSchema.safeParse(config ?? {});
    const oauthSource = getMarketingIntegrationOAuthCredentialSource(
      provider,
      config,
      options,
    );
    const apiKeySource = klaviyoApiKeySource(config);
    const authBrokerConnected = authBrokerConnection(config).connected;
    const providerAccessConnected = authBrokerConnected || Boolean(apiKeySource);
    const hasAccount = Boolean(parsed.success && parsed.data.accountId);
    const hasList = Boolean(parsed.success && parsed.data.defaultListId);
    const importEnabled = Boolean(
      parsed.success &&
        (parsed.data.importCampaignPerformanceEnabled ||
          parsed.data.importFlowPerformanceEnabled ||
          parsed.data.importProfileEventsEnabled),
    );

    return {
      oauthConfigured: Boolean(oauthSource),
      credentialsSaved: providerAccessConnected,
      providerAccessConnected,
      conversionMapped: hasAccount,
      uploadEnabled: importEnabled,
      uploadCredentialMode: authBrokerConnected
        ? ("auth-broker" as const)
        : apiKeySource
          ? ("direct" as const)
          : ("missing" as const),
      uploadReady: false,
      items: [
        {
          label: "OAuth app",
          ready: Boolean(oauthSource),
          detail: oauthCredentialSourceDetail(oauthSource),
        },
        {
          label: "Provider access",
          ready: providerAccessConnected,
          detail: providerAccessDetail({
            authBrokerConnected,
            directAccessSaved: Boolean(apiKeySource),
            directDetail:
              apiKeySource === "env"
                ? "Using workspace API key"
                : "Encrypted API key saved",
          }),
        },
        {
          label: "Account",
          ready: hasAccount,
          detail: hasAccount ? "Account details saved" : "Refresh account options",
        },
        {
          label: "Default list",
          ready: hasList,
          detail: hasList ? "Default list mapped" : "List mapping optional",
        },
        {
          label: "Import settings",
          ready: importEnabled,
          detail: importEnabled
            ? "Lifecycle marketing imports enabled"
            : "Lifecycle marketing imports disabled",
        },
      ],
    };
  }

  const parsed = parseMarketingIntegrationProviderConfig(provider, config ?? {});

  if (provider === "google-ads") {
    const data = parsed.success ? (parsed.data as GoogleAdsConfig) : null;
    const oauthSource = getMarketingIntegrationOAuthCredentialSource(
      provider,
      config,
      options,
    );
    const developerTokenSource = getMarketingIntegrationDeveloperTokenSource(
      provider,
      config,
    );
    const refreshTokenSaved = hasCredentialKeys(config, ["refreshToken"]);
    const authBrokerConnected = authBrokerConnection(config).connected;
    const credentialsSaved = Boolean(developerTokenSource) && refreshTokenSaved;
    const providerAccessConnected = authBrokerConnected || refreshTokenSaved;
    const conversionMapped = Boolean(
      data?.leadConversionActionId || data?.callConversionActionId,
    );
    const uploadEnabled = Boolean(data?.uploadOfflineConversionsEnabled);
    const uploadCredentialsReady = authBrokerConnected || credentialsSaved;

    return {
      oauthConfigured: Boolean(oauthSource),
      credentialsSaved,
      providerAccessConnected,
      conversionMapped,
      uploadEnabled,
      uploadCredentialMode: authBrokerConnected
        ? ("auth-broker" as const)
        : credentialsSaved
          ? ("direct" as const)
          : ("missing" as const),
      uploadReady:
        uploadEnabled &&
        Boolean(oauthSource) &&
        uploadCredentialsReady &&
        conversionMapped,
      items: [
        {
          label: "OAuth app",
          ready: Boolean(oauthSource),
          detail: oauthCredentialSourceDetail(oauthSource),
        },
        {
          label: "Provider access",
          ready: providerAccessConnected,
          detail: providerAccessDetail({
            authBrokerConnected,
            directAccessSaved: refreshTokenSaved,
            directDetail: "OAuth refresh token saved",
          }),
        },
        {
          label: "Upload credentials",
          ready: uploadCredentialsReady,
          detail: authManagedUploadCredentialDetail({
            authBrokerConnected,
            ready: credentialsSaved,
            detail: apiCredentialDetail({
              developerTokenSource,
              refreshTokenSaved,
            }),
          }),
        },
        {
          label: "Conversion mapping",
          ready: conversionMapped,
          detail: conversionMapped ? "Conversion action mapped" : "Action ID needed",
        },
      ],
    };
  }

  if (provider === "bing-ads") {
    const data = parsed.success ? (parsed.data as BingAdsConfig) : null;
    const oauthSource = getMarketingIntegrationOAuthCredentialSource(
      provider,
      config,
      options,
    );
    const developerTokenSource = getMarketingIntegrationDeveloperTokenSource(
      provider,
      config,
    );
    const refreshTokenSaved = hasCredentialKeys(config, ["refreshToken"]);
    const authBrokerConnected = authBrokerConnection(config).connected;
    const credentialsSaved = Boolean(developerTokenSource) && refreshTokenSaved;
    const providerAccessConnected = authBrokerConnected || refreshTokenSaved;
    const conversionGoalIdMapped = Boolean(
      data?.leadConversionGoalId || data?.callConversionGoalId,
    );
    const conversionGoalNameMapped = Boolean(
      data?.leadConversionGoalName || data?.callConversionGoalName,
    );
    const conversionMapped = conversionGoalIdMapped || conversionGoalNameMapped;
    const uploadEnabled = Boolean(data?.uploadOfflineConversionsEnabled);
    const uploadCredentialsReady = authBrokerConnected || credentialsSaved;

    return {
      oauthConfigured: Boolean(oauthSource),
      credentialsSaved,
      providerAccessConnected,
      conversionMapped,
      uploadEnabled,
      uploadCredentialMode: authBrokerConnected
        ? ("auth-broker" as const)
        : credentialsSaved
          ? ("direct" as const)
          : ("missing" as const),
      uploadReady:
        uploadEnabled &&
        Boolean(oauthSource) &&
        uploadCredentialsReady &&
        conversionGoalNameMapped,
      items: [
        {
          label: "OAuth app",
          ready: Boolean(oauthSource),
          detail: oauthCredentialSourceDetail(oauthSource),
        },
        {
          label: "Provider access",
          ready: providerAccessConnected,
          detail: providerAccessDetail({
            authBrokerConnected,
            directAccessSaved: refreshTokenSaved,
            directDetail: "OAuth refresh token saved",
          }),
        },
        {
          label: "Upload credentials",
          ready: uploadCredentialsReady,
          detail: authManagedUploadCredentialDetail({
            authBrokerConnected,
            ready: credentialsSaved,
            detail: apiCredentialDetail({
              developerTokenSource,
              refreshTokenSaved,
            }),
          }),
        },
        {
          label: "Conversion mapping",
          ready: conversionMapped,
          detail: conversionMapped
            ? conversionGoalIdMapped
              ? "Conversion goal ID mapped"
              : "Conversion goal name mapped"
            : "Goal ID needed",
        },
        ...(uploadEnabled
          ? [
              {
                label: "Upload conversion name",
                ready: conversionGoalNameMapped,
                detail: conversionGoalNameMapped
                  ? "Microsoft conversion goal name saved"
                  : "Refresh options or reselect the conversion goal so uploads can use the Microsoft goal name",
              },
            ]
          : []),
      ],
    };
  }

  if (provider === "linkedin-ads") {
    const data = parsed.success ? (parsed.data as LinkedInAdsConfig) : null;
    const oauthSource = getMarketingIntegrationOAuthCredentialSource(
      provider,
      config,
      options,
    );
    const authBrokerConnected = authBrokerConnection(config).connected;
    const credentialsSaved = hasCredentialKeys(config, ["accessToken"]);
    const providerAccessConnected = authBrokerConnected || credentialsSaved;
    const conversionMapped = Boolean(
      data?.leadConversionRuleId || data?.callConversionRuleId,
    );
    const uploadEnabled = Boolean(data?.uploadOfflineConversionsEnabled);
    const uploadCredentialsReady = authBrokerConnected || credentialsSaved;

    return {
      oauthConfigured: Boolean(oauthSource),
      credentialsSaved,
      providerAccessConnected,
      conversionMapped,
      uploadEnabled,
      uploadCredentialMode: authBrokerConnected
        ? ("auth-broker" as const)
        : credentialsSaved
          ? ("direct" as const)
          : ("missing" as const),
      uploadReady:
        uploadEnabled && Boolean(oauthSource) && uploadCredentialsReady && conversionMapped,
      items: [
        {
          label: "OAuth app",
          ready: Boolean(oauthSource),
          detail: oauthCredentialSourceDetail(oauthSource),
        },
        {
          label: "Provider access",
          ready: providerAccessConnected,
          detail: providerAccessDetail({
            authBrokerConnected,
            directAccessSaved: credentialsSaved,
            directDetail: "Encrypted access token saved",
          }),
        },
        {
          label: "Upload credentials",
          ready: uploadCredentialsReady,
          detail: authManagedUploadCredentialDetail({
            authBrokerConnected,
            ready: credentialsSaved,
            detail: credentialsSaved
              ? "Encrypted access token saved"
              : "Access token needed",
          }),
        },
        {
          label: "Conversion mapping",
          ready: conversionMapped,
          detail: conversionMapped ? "Conversion rule mapped" : "Rule ID needed",
        },
      ],
    };
  }

  const data = parsed.success ? (parsed.data as MetaConfig) : null;
  const oauthSource = getMarketingIntegrationOAuthCredentialSource(
    provider,
    config,
    options,
  );
  const authBrokerConnected = authBrokerConnection(config).connected;
  const credentialsSaved = hasCredentialKeys(config, ["accessToken"]);
  const providerAccessConnected = authBrokerConnected || credentialsSaved;
  const conversionMapped = Boolean(data?.pixelId && data?.leadEventName);
  const uploadEnabled = Boolean(data?.uploadConversionsEnabled);
  const uploadCredentialsReady = authBrokerConnected || credentialsSaved;

  return {
    oauthConfigured: Boolean(oauthSource),
    credentialsSaved,
    providerAccessConnected,
    conversionMapped,
    uploadEnabled,
    uploadCredentialMode: authBrokerConnected
      ? ("auth-broker" as const)
      : credentialsSaved
        ? ("direct" as const)
        : ("missing" as const),
    uploadReady: uploadEnabled && uploadCredentialsReady && conversionMapped,
    items: [
      {
        label: "OAuth app",
        ready: Boolean(oauthSource),
        detail: oauthCredentialSourceDetail(oauthSource),
      },
      {
        label: "Provider access",
        ready: providerAccessConnected,
        detail: providerAccessDetail({
          authBrokerConnected,
          directAccessSaved: credentialsSaved,
          directDetail: "Encrypted access token saved",
        }),
      },
      {
        label: "Upload credentials",
        ready: uploadCredentialsReady,
        detail: authManagedUploadCredentialDetail({
          authBrokerConnected,
          ready: credentialsSaved,
          detail: credentialsSaved ? "Encrypted access token saved" : "Access token needed",
        }),
      },
      {
        label: "Conversion mapping",
        ready: conversionMapped,
        detail: conversionMapped ? "Pixel and event mapped" : "Pixel or event needed",
      },
    ],
  };
}

export function parseMarketingIntegrationProviderConfig(
  provider: MarketingIntegrationProviderSlug,
  config: unknown,
) {
  if (provider === "bing-ads") {
    return bingAdsConfigSchema.safeParse(config ?? {});
  }

  if (provider === "google-ads") {
    return googleAdsConfigSchema.safeParse(config ?? {});
  }

  if (provider === "google-analytics") {
    return googleAnalyticsConfigSchema.safeParse(config ?? {});
  }

  if (provider === "google-search-console") {
    return googleSearchConsoleConfigSchema.safeParse(config ?? {});
  }

  if (provider === "klaviyo") {
    return klaviyoConfigSchema.safeParse(config ?? {});
  }

  if (provider === "linkedin-ads") {
    return linkedInAdsConfigSchema.safeParse(config ?? {});
  }

  return metaConfigSchema.safeParse(config ?? {});
}

function getConnectedMarketingIntegrationNextStep(
  provider: MarketingIntegrationProviderSlug,
  config:
    | BingAdsConfig
    | GoogleAdsConfig
    | GoogleAnalyticsConfig
    | GoogleSearchConsoleConfig
    | KlaviyoConfig
    | LinkedInAdsConfig
    | MetaConfig,
) {
  if (provider === "bing-ads") {
    return (config as BingAdsConfig).uploadOfflineConversionsEnabled
      ? "Offline conversion upload is enabled for mapped Bing Ads conversion goals."
      : "Account and UET mapping is saved. Enable conversion upload when ready.";
  }

  if (provider === "google-ads") {
    return (config as GoogleAdsConfig).uploadOfflineConversionsEnabled
      ? "Offline conversion upload is enabled for mapped conversion actions."
      : "Account mapping is saved. Enable conversion upload when ready.";
  }

  if (provider === "google-analytics") {
    const analyticsConfig = config as GoogleAnalyticsConfig;
    return analyticsConfig.importAnalyticsReportingEnabled
      ? `GA4 Data API reporting is enabled for ${analyticsConfig.primaryConversionEvent} and ${analyticsConfig.callConversionEvent}.`
      : `Tracking ${analyticsConfig.primaryConversionEvent} and ${analyticsConfig.callConversionEvent}. Enable GA4 reporting import when ready.`;
  }

  if (provider === "google-search-console") {
    const searchConsoleConfig = config as GoogleSearchConsoleConfig;
    return searchConsoleConfig.importSearchPerformanceEnabled
      ? `Organic performance import is enabled for ${searchConsoleConfig.siteUrl}.`
      : `Search Console property ${searchConsoleConfig.siteUrl} is mapped. Enable performance import when ready.`;
  }

  if (provider === "klaviyo") {
    const klaviyoConfig = config as KlaviyoConfig;
    return klaviyoConfig.importCampaignPerformanceEnabled ||
      klaviyoConfig.importFlowPerformanceEnabled ||
      klaviyoConfig.importProfileEventsEnabled
      ? "Klaviyo lifecycle marketing imports are enabled."
      : "Klaviyo account settings are saved. Enable campaign, flow or event imports when ready.";
  }

  if (provider === "linkedin-ads") {
    return (config as LinkedInAdsConfig).uploadOfflineConversionsEnabled
      ? "Offline conversion upload is enabled for mapped LinkedIn conversion rules."
      : "Account and Insight Tag mapping is saved. Enable conversion upload when ready.";
  }

  return (config as MetaConfig).uploadConversionsEnabled
    ? "Conversion event upload is enabled for lead and call events."
    : "Ad account and pixel mapping are saved. Enable uploads when ready.";
}
