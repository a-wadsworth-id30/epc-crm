"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import {
  decryptSecret,
  encryptSecret,
  hasCredentialEncryptionKey,
} from "@/lib/crypto/secrets";
import {
  remapPendingMarketingConversionUploadsForProvider,
  type UploadProviderSlug,
} from "@/lib/actions/marketing-lifecycle";
import {
  hasStoredId30AuthCredentials,
  id30AuthProvider,
} from "@/lib/integrations/id30-auth";
import { recordIntegrationHealthChecks } from "@/lib/integrations/health-snapshots";
import { hasId30AuthEnvironmentConfig } from "@/lib/integrations/system-services";
import {
  bingAdsConfigSchema,
  findMarketingIntegrationProvider,
  getMarketingIntegrationCredentialState,
  getMarketingIntegrationProviderState,
  googleAdsConfigSchema,
  googleAnalyticsConfigSchema,
  googleSearchConsoleConfigSchema,
  getMarketingIntegrationDeveloperTokenSource,
  getMarketingIntegrationOAuthCredentialSource,
  klaviyoConfigSchema,
  linkedInAdsConfigSchema,
  marketingProviderSelectorOptionsFromConfig,
  marketingIntegrationProviders,
  type BingAdsConfig,
  type GoogleAdsConfig,
  type LinkedInAdsConfig,
  type MarketingIntegrationProviderDefinition,
  type MarketingIntegrationProviderSlug,
  type MetaConfig,
  metaConfigSchema,
} from "@/lib/marketing/integrations";
import {
  disconnectMarketingAuthBrokerConnection,
  fetchMarketingAuthBrokerConnection,
  fetchMarketingAuthBrokerProviderReadiness,
  findMarketingOAuthProvider,
  marketingAuthBrokerConfigured,
  refreshMarketingAuthBrokerSelectors,
} from "@/lib/marketing/oauth";
import {
  withConfiguredMarketingProviderSelections,
  type AccountSelectableMarketingProviderSlug,
} from "@/lib/marketing/selector-options";
import {
  combinedMarketingProviderSelectorOptions,
  numericMarketingProviderSelectorOptions,
} from "@/lib/marketing/selector-option-lists";
import { prisma } from "@/lib/prisma";

type MarketingIntegrationActionState = {
  ok: boolean;
  message: string;
  savedAt: number | null;
  connected: boolean;
};

export type MarketingProviderConnectionTestState = {
  checkedAt: number | null;
  checks: Array<{
    detail: string;
    label: string;
    ready: boolean;
  }>;
  message: string;
  ok: boolean;
};

type CredentialField = {
  key: string;
  value: string;
};

type ProviderSelectorOption = {
  id: string;
  name?: string | null;
  description?: string | null;
  status?: string | null;
};

type MarketingIntegrationProviderValue =
  (typeof marketingIntegrationProviders)[keyof typeof marketingIntegrationProviders];

type ExistingIntegrationConnection = {
  config: unknown;
  id?: string;
  status: string;
};

type LiveProviderApiTestResult = {
  detail: string;
  ready: boolean;
  selectorCount?: number;
};

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function jsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numericStringValue(value: unknown) {
  const trimmed = stringValue(value);

  return trimmed && /^\d+$/.test(trimmed) ? trimmed : null;
}

function existingCredentials(config: unknown) {
  return jsonObject(jsonObject(config).credentials);
}

function authBrokerConnectionId(config: unknown) {
  const authBroker = jsonObject(jsonObject(config).authBroker);

  return stringValue(authBroker.status) === "connected"
    ? stringValue(authBroker.connectionId)
    : null;
}

function marketingConfigJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function preservedSelectorOptions(config: unknown) {
  const selectorOptions = marketingProviderSelectorOptionsFromConfig(config);

  return selectorOptions ? { selectorOptions } : {};
}

function preservedAuthBroker(config: unknown) {
  const authBroker = jsonObject(jsonObject(config).authBroker);

  return Object.keys(authBroker).length ? { authBroker } : {};
}

function preservedProviderRuntimeConfig(config: unknown) {
  return {
    ...preservedSelectorOptions(config),
    ...preservedAuthBroker(config),
  };
}

function providerFormConfigCandidate({
  autoMap = true,
  existingConfig,
  provider,
  values,
}: {
  autoMap?: boolean;
  existingConfig: unknown;
  provider: AccountSelectableMarketingProviderSlug;
  values: Record<string, unknown>;
}) {
  const currentConfig = {
    ...values,
    ...preservedProviderRuntimeConfig(existingConfig),
  };

  if (!autoMap) return currentConfig;

  return autoMapProviderConfig({
    currentConfig,
    provider,
    selectorOptions: jsonObject(currentConfig.selectorOptions),
  }).config;
}

function selectedLinkedInAccountName({
  currentConfig,
  nextAccountId,
  submittedAccountName,
}: {
  currentConfig: Record<string, unknown>;
  nextAccountId: string | null;
  submittedAccountName: string | null;
}) {
  if (!nextAccountId) return null;

  const currentAccountName = stringValue(currentConfig.accountName);

  if (submittedAccountName && submittedAccountName !== currentAccountName) {
    return submittedAccountName;
  }

  const accountOptions =
    marketingProviderSelectorOptionsFromConfig(currentConfig)?.accounts ?? [];
  const selectedOption = accountOptions.find(
    (option) =>
      linkedInAccountIdFromUrn(option.id) === linkedInAccountIdFromUrn(nextAccountId),
  );

  return selectedOption?.name ?? submittedAccountName;
}

function linkedInAccountScopedValue({
  accountChanged,
  currentValue,
  submittedValue,
}: {
  accountChanged: boolean;
  currentValue: string | null;
  submittedValue: string | null;
}) {
  if (accountChanged && submittedValue === currentValue) return null;

  return submittedValue;
}

function selectorCount(options: Record<string, unknown>, key: string) {
  const value = options[key];

  return Array.isArray(value) ? value.length : 0;
}

function selectorRefreshSummary(
  providerName: string,
  selectorOptions: Record<string, unknown>,
) {
  const labels = [
    ["accounts", "account"],
    ["campaigns", "campaign"],
    ["managerAccounts", "manager account"],
    ["conversionActions", "conversion action"],
    ["conversionGoals", "conversion goal"],
    ["conversionRules", "conversion rule"],
    ["events", "event"],
    ["flows", "flow"],
    ["forms", "form"],
    ["insightTags", "Insight Tag"],
    ["lists", "list"],
    ["pixels", "pixel"],
    ["segments", "segment"],
    ["sites", "site"],
    ["uetTags", "UET tag"],
  ]
    .map(([key, label]) => {
      const count = selectorCount(selectorOptions, key);

      if (!count) return null;

      return `${count} ${label}${count === 1 ? "" : "s"}`;
    })
    .filter(Boolean);

  return labels.length
    ? `${providerName} options refreshed from iD30 Auth: ${labels.join(", ")}.`
    : `${providerName} connection refreshed from iD30 Auth; no account options were returned yet.`;
}

function authBrokerSelectorRefreshError(providerName: string, message: string) {
  if (
    message.includes("googleads.googleapis.com") ||
    message.includes("Google Ads API has not been used") ||
    (message.includes("Google Ads API") && message.includes("disabled"))
  ) {
    return `${providerName} is linked, but account options cannot load until the Google Ads API is enabled on the Google Cloud project used by iD30 Auth. Enable the API, wait a few minutes, then refresh options again. Google message: ${message}`;
  }

  return message;
}

function providerSelectorOptionCount(config: unknown) {
  const selectorOptions = marketingProviderSelectorOptionsFromConfig(config);

  if (!selectorOptions) return 0;

  return Object.values(selectorOptions).reduce<number>((count, value) => {
    return Array.isArray(value) ? count + value.length : count;
  }, 0);
}

function directCredentialDecryptionError(providerName: string) {
  return `Set CREDENTIAL_ENCRYPTION_KEY so saved ${providerName} credentials can be decrypted for the live provider test.`;
}

function hasDirectLiveProviderCredentials({
  config,
  provider,
}: {
  config: unknown;
  provider: MarketingIntegrationProviderSlug;
}) {
  const credentials = existingCredentials(config);

  if (provider === "google-ads") {
    return Boolean(
      stringValue(credentials.refreshToken) &&
        (stringValue(credentials.developerToken) ||
          stringValue(process.env.GOOGLE_ADS_DEVELOPER_TOKEN)),
    );
  }

  if (provider === "bing-ads") {
    return Boolean(
      stringValue(credentials.refreshToken) &&
        (stringValue(credentials.developerToken) ||
          stringValue(process.env.MICROSOFT_ADS_DEVELOPER_TOKEN)),
    );
  }

  if (provider === "linkedin-ads" || provider === "meta") {
    return Boolean(stringValue(credentials.accessToken));
  }

  if (provider === "klaviyo") {
    return Boolean(
      stringValue(credentials.privateApiKey) ||
        stringValue(process.env.KLAVIYO_PRIVATE_API_KEY),
    );
  }

  return false;
}

function selectorCountDetail(count: number, source: string) {
  return `${count} selector option${count === 1 ? "" : "s"} loaded from ${source}.`;
}

async function testAuthBrokerProviderApi({
  connectionId,
  providerName,
}: {
  connectionId: string;
  providerName: string;
}): Promise<LiveProviderApiTestResult> {
  const result = await fetchMarketingAuthBrokerConnection({ connectionId });

  if (!result.ok) {
    return {
      detail: `iD30 Auth could not confirm ${providerName} access. ${result.message}`,
      ready: false,
    };
  }

  const selectorCount = providerSelectorOptionCount({
    selectorOptions: result.selectorOptions,
  });
  const ready = !result.connection.reconnectRequired;

  return {
    detail: ready
      ? selectorCount
        ? selectorCountDetail(selectorCount, "the iD30 Auth cache")
        : `${providerName} is connected through iD30 Auth. Use Refresh options to load account options if selectors are missing.`
      : result.connection.lastError ||
        `${providerName} needs to be reconnected in iD30 Auth.`,
    ready,
    selectorCount,
  };
}

async function testGoogleAdsProviderApi(config: unknown) {
  const credentials = existingCredentials(config);
  const encryptedRefreshToken = stringValue(credentials.refreshToken);
  const developerToken = secretCredentialOrEnv({
    credentials,
    envKey: "GOOGLE_ADS_DEVELOPER_TOKEN",
    key: "developerToken",
  });

  if (!encryptedRefreshToken || !developerToken) {
    return {
      detail:
        "Connect Google Ads OAuth and save a developer token before the live API test can run.",
      ready: false,
    };
  }

  if (!hasCredentialEncryptionKey()) {
    return {
      detail: directCredentialDecryptionError("Google Ads"),
      ready: false,
    };
  }

  const accessToken = await googleAdsAccessToken({
    refreshToken: decryptSecret(encryptedRefreshToken),
    storedConfig: config,
  });
  const customers = await listGoogleAdsAccessibleCustomers({
    accessToken,
    developerToken,
  });

  return {
    detail: `${customers.length} accessible Google Ads customer${customers.length === 1 ? "" : "s"} returned by the live API.`,
    ready: customers.length > 0,
    selectorCount: customers.length,
  };
}

async function testBingAdsProviderApi(config: unknown) {
  const credentials = existingCredentials(config);
  const encryptedRefreshToken = stringValue(credentials.refreshToken);
  const developerToken = secretCredentialOrEnv({
    credentials,
    envKey: "MICROSOFT_ADS_DEVELOPER_TOKEN",
    key: "developerToken",
  });

  if (!encryptedRefreshToken || !developerToken) {
    return {
      detail:
        "Connect Bing Ads OAuth and save a developer token before the live API test can run.",
      ready: false,
    };
  }

  if (!hasCredentialEncryptionKey()) {
    return {
      detail: directCredentialDecryptionError("Bing Ads"),
      ready: false,
    };
  }

  const accessToken = await microsoftAdsAccessToken({
    refreshToken: decryptSecret(encryptedRefreshToken),
    storedConfig: config,
  });
  const userPayload = await getMicrosoftAdsCurrentUser({
    accessToken,
    developerToken,
  });
  const customerRoles = jsonArray(userPayload.CustomerRoles);

  return {
    detail: `${customerRoles.length} Microsoft Advertising customer role${customerRoles.length === 1 ? "" : "s"} returned by the live API.`,
    ready: Boolean(stringOrNumberValue(jsonObject(userPayload.User).Id)),
    selectorCount: customerRoles.length,
  };
}

async function testGoogleSearchConsoleProviderApi(config: unknown) {
  const credentials = existingCredentials(config);
  const encryptedRefreshToken = stringValue(credentials.refreshToken);

  if (!encryptedRefreshToken) {
    return {
      detail: "Connect Google Search Console OAuth before the live API test can run.",
      ready: false,
    };
  }

  if (!hasCredentialEncryptionKey()) {
    return {
      detail: directCredentialDecryptionError("Google Search Console"),
      ready: false,
    };
  }

  const accessToken = await googleSearchConsoleAccessToken({
    refreshToken: decryptSecret(encryptedRefreshToken),
    storedConfig: config,
  });
  const sites = await listGoogleSearchConsoleSites(accessToken);

  return {
    detail: `${sites.length} Search Console propert${sites.length === 1 ? "y" : "ies"} returned by the live API.`,
    ready: sites.length > 0,
    selectorCount: sites.length,
  };
}

async function testGoogleAnalyticsProviderApi(config: unknown) {
  const parsed = googleAnalyticsConfigSchema.safeParse(config ?? {});
  const credentials = existingCredentials(config);
  const encryptedRefreshToken = stringValue(credentials.refreshToken);

  if (!parsed.success) {
    return {
      detail: "Save the GA4 Measurement ID and property ID before the live API test can run.",
      ready: false,
    };
  }

  if (!encryptedRefreshToken) {
    return {
      detail: "Connect Google Analytics OAuth before the live Data API test can run.",
      ready: false,
    };
  }

  if (!hasCredentialEncryptionKey()) {
    return {
      detail: directCredentialDecryptionError("Google Analytics"),
      ready: false,
    };
  }

  const accessToken = await googleAnalyticsAccessToken({
    refreshToken: decryptSecret(encryptedRefreshToken),
    storedConfig: config,
  });
  const rowCount = await testGoogleAnalyticsDataApi({
    accessToken,
    propertyId: parsed.data.propertyId,
  });

  return {
    detail: `GA4 Data API responded for property ${parsed.data.propertyId} with ${rowCount} sampled row${rowCount === 1 ? "" : "s"}.`,
    ready: true,
    selectorCount: rowCount,
  };
}

async function testKlaviyoProviderApi(config: unknown) {
  const apiKey = klaviyoApiKey(config);

  if (!apiKey) {
    return {
      detail: "Save a Klaviyo private API key before the live API test can run.",
      ready: false,
    };
  }

  const accounts = await fetchKlaviyoList({
    apiKey,
    maxItems: 1,
    path: "accounts/?page[size]=1",
  });

  return {
    detail: `${accounts.length} Klaviyo account${accounts.length === 1 ? "" : "s"} returned by the live API.`,
    ready: accounts.length > 0,
    selectorCount: accounts.length,
  };
}

async function testLinkedInProviderApi(config: unknown) {
  const encryptedAccessToken = stringValue(existingCredentials(config).accessToken);

  if (!encryptedAccessToken) {
    return {
      detail: "Save a LinkedIn Marketing API access token before the live API test can run.",
      ready: false,
    };
  }

  if (!hasCredentialEncryptionKey()) {
    return {
      detail: directCredentialDecryptionError("LinkedIn Ads"),
      ready: false,
    };
  }

  const accounts = await fetchLinkedInAdAccounts({
    accessToken: decryptSecret(encryptedAccessToken),
    maxItems: 1,
  });

  return {
    detail: `${accounts.length} LinkedIn ad account${accounts.length === 1 ? "" : "s"} returned by the live API.`,
    ready: accounts.length > 0,
    selectorCount: accounts.length,
  };
}

async function testMetaProviderApi(config: unknown) {
  const encryptedAccessToken = stringValue(existingCredentials(config).accessToken);

  if (!encryptedAccessToken) {
    return {
      detail: "Save a Meta access token before the live API test can run.",
      ready: false,
    };
  }

  if (!hasCredentialEncryptionKey()) {
    return {
      detail: directCredentialDecryptionError("Meta"),
      ready: false,
    };
  }

  const accounts = await fetchMetaGraphList({
    accessToken: decryptSecret(encryptedAccessToken),
    maxItems: 1,
    params: { fields: "id,name,account_status", limit: "1" },
    path: "me/adaccounts",
  });

  return {
    detail: `${accounts.length} Meta ad account${accounts.length === 1 ? "" : "s"} returned by the live API.`,
    ready: accounts.length > 0,
    selectorCount: accounts.length,
  };
}

async function testLiveMarketingProviderApi({
  connection,
  provider,
}: {
  connection: ExistingIntegrationConnection | null;
  provider: MarketingIntegrationProviderDefinition;
}): Promise<LiveProviderApiTestResult> {
  const config = connection?.config ?? {};

  try {
    const authBrokerConnection = authBrokerConnectionId(config);

    if (authBrokerConnection) {
      return testAuthBrokerProviderApi({
        connectionId: authBrokerConnection,
        providerName: provider.name,
      });
    }

    const oauthProvider = findMarketingOAuthProvider(provider.slug);

    if (
      oauthProvider?.authBroker &&
      !hasDirectLiveProviderCredentials({ config, provider: provider.slug }) &&
      (await marketingAuthBrokerConfigured())
    ) {
      const authReadiness = await fetchMarketingAuthBrokerProviderReadiness();

      if (!authReadiness.ok) {
        return {
          detail: authReadiness.message,
          ready: false,
        };
      }

      const brokerProvider = authReadiness.providers.find(
        (item) => item.slug === provider.slug,
      );

      if (!brokerProvider) {
        return {
          detail: `${provider.name} is not available in iD30 Auth.`,
          ready: false,
        };
      }

      if (!brokerProvider.ready) {
        return {
          detail: `iD30 Auth is missing ${brokerProvider.missingEnv.join(", ")} for ${provider.name}. Ask iD30 to update Auth provider credentials.`,
          ready: false,
        };
      }

      return {
        detail: `iD30 Auth is ready to start ${provider.name} OAuth. Connect ${provider.name} to create provider access and load account options.`,
        ready: false,
        selectorCount: 0,
      };
    }

    if (provider.slug === "google-ads") return testGoogleAdsProviderApi(config);
    if (provider.slug === "google-analytics") {
      return testGoogleAnalyticsProviderApi(config);
    }
    if (provider.slug === "bing-ads") return testBingAdsProviderApi(config);
    if (provider.slug === "google-search-console") {
      return testGoogleSearchConsoleProviderApi(config);
    }
    if (provider.slug === "klaviyo") return testKlaviyoProviderApi(config);
    if (provider.slug === "linkedin-ads") return testLinkedInProviderApi(config);

    return testMetaProviderApi(config);
  } catch (error) {
    return {
      detail:
        error instanceof Error
          ? error.message
          : `${provider.name} live provider API test failed.`,
      ready: false,
    };
  }
}

function connectionUpdatedDetail(updatedAt: Date | null | undefined) {
  return updatedAt
    ? `Last saved ${updatedAt.toLocaleString("en-GB")}`
    : "No saved provider setup yet.";
}

function remappedUploadMessage(count: number) {
  if (!count) return "";

  return ` Remapped ${count} pending conversion upload${count === 1 ? "" : "s"} to the latest provider mapping.`;
}

function bingAdsSetupGapMessage(config: BingAdsConfig) {
  const goalIdMapped = Boolean(
    config.leadConversionGoalId || config.callConversionGoalId,
  );
  const goalNameMapped = Boolean(
    config.leadConversionGoalName || config.callConversionGoalName,
  );

  if (goalIdMapped || goalNameMapped) {
    if (config.uploadOfflineConversionsEnabled && !goalNameMapped) {
      return " Refresh options or reselect the conversion goal so uploads can store the Microsoft conversion goal name.";
    }

    return "";
  }

  return " Select the lead and/or call conversion goal mapping next.";
}

function removeConfigKeys(
  config: Record<string, unknown>,
  keys: string[],
) {
  for (const key of keys) {
    delete config[key];
  }
}

function resetAuthManagedProviderConfig(
  provider: MarketingIntegrationProviderSlug,
  config: Record<string, unknown>,
) {
  const nextConfig = { ...config };
  const credentials = { ...jsonObject(nextConfig.credentials) };

  delete nextConfig.authBroker;
  delete nextConfig.selectorOptions;
  delete credentials.authConnectionId;
  delete credentials.oauthConnectedAt;

  if (Object.keys(credentials).length) {
    nextConfig.credentials = credentials;
  } else {
    delete nextConfig.credentials;
  }

  if (provider === "google-ads") {
    removeConfigKeys(nextConfig, [
      "accountName",
      "callConversionActionId",
      "customerId",
      "leadConversionActionId",
      "managerCustomerId",
    ]);
  }

  if (provider === "bing-ads") {
    removeConfigKeys(nextConfig, [
      "accountId",
      "accountName",
      "callConversionGoalId",
      "callConversionGoalName",
      "customerId",
      "leadConversionGoalId",
      "leadConversionGoalName",
      "managerAccountId",
      "uetTagId",
    ]);
  }

  if (provider === "linkedin-ads") {
    removeConfigKeys(nextConfig, [
      "accountMappingResetAt",
      "accountName",
      "adAccountId",
      "callConversionRuleId",
      "insightTagId",
      "leadConversionRuleId",
    ]);
  }

  if (provider === "meta") {
    removeConfigKeys(nextConfig, [
      "accountName",
      "adAccountId",
      "pixelId",
    ]);
  }

  if (provider === "klaviyo") {
    removeConfigKeys(nextConfig, [
      "accountId",
      "accountName",
      "defaultListId",
      "defaultListName",
    ]);
  }

  return nextConfig;
}

async function remapPendingUploadsForSavedConfig({
  config,
  provider,
}: {
  config: BingAdsConfig | GoogleAdsConfig | LinkedInAdsConfig | MetaConfig;
  provider: UploadProviderSlug;
}) {
  return remapPendingMarketingConversionUploadsForProvider(provider, config);
}

export async function resetMarketingAuthProviderConnectionAction(
  _: MarketingIntegrationActionState,
  formData: FormData,
): Promise<MarketingIntegrationActionState> {
  await requireAdmin();

  const providerSlug = stringValue(formData.get("providerSlug"));
  const provider = providerSlug ? findMarketingIntegrationProvider(providerSlug) : null;
  const oauthProvider = providerSlug ? findMarketingOAuthProvider(providerSlug) : null;

  if (!provider || !oauthProvider?.authBroker) {
    return {
      ok: false,
      message: "This marketing provider cannot be reset through iD30 Auth.",
      savedAt: null,
      connected: false,
    };
  }

  const existing = await prisma.integrationConnection.findUnique({
    where: { provider: provider.provider },
    select: { config: true },
  });

  if (!existing) {
    return {
      ok: true,
      message: `${provider.name} has no saved provider access to reset.`,
      savedAt: Date.now(),
      connected: false,
    };
  }

  const currentConfig = jsonObject(existing.config);
  const connectionId = authBrokerConnectionId(currentConfig);

  if (connectionId) {
    const disconnectResult = await disconnectMarketingAuthBrokerConnection({
      connectionId,
    });

    if (!disconnectResult.ok && disconnectResult.status !== 404) {
      return {
        ok: false,
        message: `${provider.name} provider access could not be disconnected in iD30 Auth. ${disconnectResult.message}`,
        savedAt: null,
        connected: true,
      };
    }
  }

  const nextConfig = resetAuthManagedProviderConfig(provider.slug, currentConfig);
  const directAccessConnected = hasDirectLiveProviderCredentials({
    config: nextConfig,
    provider: provider.slug,
  });

  await prisma.integrationConnection.update({
    where: { provider: provider.provider },
    data: {
      status: directAccessConnected ? "CONNECTED" : "NOT_CONNECTED",
      config: marketingConfigJson(nextConfig),
    },
  });

  revalidatePath("/settings/integrations");
  revalidatePath(`/settings/integrations/${provider.slug}`);

  return {
    ok: true,
    message: `${provider.name} provider access disconnected. Connect again with the correct provider account.`,
    savedAt: Date.now(),
    connected: directAccessConnected,
  };
}

export async function testMarketingProviderConnectionAction(
  _: MarketingProviderConnectionTestState,
  formData: FormData,
): Promise<MarketingProviderConnectionTestState> {
  await requireAdmin();

  const providerSlug = stringValue(formData.get("providerSlug"));
  const provider = providerSlug ? findMarketingIntegrationProvider(providerSlug) : null;

  if (!provider) {
    return {
      checkedAt: Date.now(),
      checks: [],
      message: "Marketing provider was not recognised.",
      ok: false,
    };
  }

  const [connection, id30AuthConnection] = await Promise.all([
    prisma.integrationConnection.findUnique({
      where: { provider: provider.provider },
      select: {
        id: true,
        config: true,
        status: true,
        updatedAt: true,
      },
    }),
    prisma.integrationConnection.findUnique({
      where: { provider: id30AuthProvider },
      select: {
        config: true,
        status: true,
      },
    }),
  ]);
  const hasSavedAuthBroker =
    (id30AuthConnection?.status === "CONNECTED" &&
      hasStoredId30AuthCredentials(id30AuthConnection.config)) ||
    hasId30AuthEnvironmentConfig();
  const providerState = getMarketingIntegrationProviderState(provider, connection);
  const credentialState = getMarketingIntegrationCredentialState(
    provider.slug,
    connection?.config ?? {},
    { authBrokerConfigured: hasSavedAuthBroker },
  );
  const selectorCount = providerSelectorOptionCount(connection?.config ?? {});
  const config = jsonObject(connection?.config);
  const authBroker = jsonObject(config.authBroker);
  const authBrokerStatus = stringValue(authBroker.status);
  const authBrokerLastError = stringValue(authBroker.lastError);
  const authBrokerErrorRef = stringValue(authBroker.errorRef);
  const authBrokerConnection = authBrokerConnectionId(config);
  const checks: MarketingProviderConnectionTestState["checks"] = [
    {
      label: "CRM setup",
      ready: Boolean(connection),
      detail: connection
        ? connectionUpdatedDetail(connection.updatedAt)
        : "Save this provider before testing its connection.",
    },
    {
      label: "Provider access",
      ready: credentialState.providerAccessConnected,
      detail: credentialState.providerAccessConnected
        ? credentialState.uploadCredentialMode === "auth-broker"
          ? "Connected through iD30 Auth."
          : "Direct CRM fallback credentials are saved."
        : "Provider login or API access is still needed.",
    },
  ];

  if (authBrokerConnection) {
    const authResult = await fetchMarketingAuthBrokerConnection({
      connectionId: authBrokerConnection,
    });

    checks.push({
      label: "iD30 Auth status",
      ready: authResult.ok && !authResult.connection.reconnectRequired,
      detail: authResult.ok
        ? authResult.connection.reconnectRequired
          ? authResult.connection.lastError ||
            `${provider.name} needs to be reconnected in iD30 Auth.`
          : `Auth reports ${authResult.connection.status}.`
        : authResult.message,
    });
  } else if (authBrokerStatus || authBrokerLastError || authBrokerErrorRef) {
    checks.push({
      label: "iD30 Auth status",
      ready: false,
      detail:
        authBrokerLastError ||
        (authBrokerErrorRef
          ? `Auth issue reference ${authBrokerErrorRef}.`
          : `Auth status is ${authBrokerStatus}.`),
    });
  }

  const liveProviderApi = await testLiveMarketingProviderApi({
    connection,
    provider,
  });

  checks.push({
    label: "Live provider API",
    ready: liveProviderApi.ready,
    detail: liveProviderApi.detail,
  });

  const effectiveSelectorCount = Math.max(
    selectorCount,
    liveProviderApi.selectorCount ?? 0,
  );

  checks.push({
    label: "Loaded options",
    ready: effectiveSelectorCount > 0,
    detail:
      selectorCount > 0
        ? `${selectorCount} selector option${selectorCount === 1 ? "" : "s"} cached.`
        : liveProviderApi.selectorCount
          ? `${liveProviderApi.selectorCount} selector option${liveProviderApi.selectorCount === 1 ? "" : "s"} returned by the live provider API. Refresh options to cache them.`
          : "Refresh options after provider access is connected.",
  });

  checks.push({
    label:
      provider.slug === "google-search-console"
        ? "Property mapping"
        : provider.slug === "klaviyo"
          ? "Account mapping"
          : "Account mapping",
    ready: providerState.connected,
    detail: providerState.connected
      ? "Saved mapping is valid."
      : "Choose and save the account or property mapping.",
  });

  if (provider.slug === "google-search-console") {
    checks.push({
      label: "Search setup",
      ready: credentialState.providerAccessConnected && providerState.connected,
      detail:
        credentialState.providerAccessConnected && providerState.connected
          ? "Search Console access and property mapping are saved; provider data import can pull performance rows."
          : "Connect access and save the property mapping.",
    });
  } else if (provider.slug === "klaviyo") {
    checks.push({
      label: "Lifecycle setup",
      ready: credentialState.providerAccessConnected && providerState.connected,
      detail:
        credentialState.providerAccessConnected && providerState.connected
          ? "Klaviyo API access and account mapping are saved; provider data import can pull lifecycle rows."
          : "Save API access and account mapping.",
    });
  } else {
    checks.push({
      label: "Conversion mapping",
      ready: credentialState.conversionMapped,
      detail: credentialState.conversionMapped
        ? "Lead or call conversion mapping is saved."
        : "Map lead/call conversions before upload readiness is complete.",
    });
  }

  const ok = checks.every((check) => check.ready);
  const checkedAt = new Date();

  await recordIntegrationHealthChecks({
    checkedAt,
    checks,
    integrationId: connection?.id,
    provider: provider.provider,
    source: "connection-test",
  });

  return {
    checkedAt: checkedAt.getTime(),
    checks,
    message: ok
      ? `${provider.name} connection test passed.`
      : `${provider.name} connection test found setup gaps.`,
    ok,
  };
}

function selectableOptions(options: ProviderSelectorOption[] | undefined) {
  return (options ?? []).filter((option) => {
    const status = option.status?.trim().toUpperCase();

    return status !== "REMOVED" && status !== "CANCELED";
  });
}

function singleOption(options: ProviderSelectorOption[] | undefined) {
  const selectable = selectableOptions(options);

  return selectable.length === 1 ? selectable[0] : null;
}

function optionText(option: ProviderSelectorOption) {
  return [option.name, option.description, option.id]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}

function uniqueKeywordMatch({
  exclude = [],
  include,
  options,
}: {
  exclude?: string[];
  include: string[];
  options: ProviderSelectorOption[] | undefined;
}) {
  const matches = selectableOptions(options).filter((option) => {
    const text = optionText(option);

    return (
      include.some((keyword) => text.includes(keyword)) &&
      !exclude.some((keyword) => text.includes(keyword))
    );
  });

  return matches.length === 1 ? matches[0] : null;
}

function autoMapSummary(mappedFields: string[]) {
  if (!mappedFields.length) return "";

  if (mappedFields.length === 1) {
    return ` Auto-mapped ${mappedFields[0]}.`;
  }

  return ` Auto-mapped ${mappedFields.slice(0, -1).join(", ")} and ${mappedFields.at(-1)}.`;
}

function autoMapGoogleAdsConfig({
  currentConfig,
  selectorOptions,
}: {
  currentConfig: Record<string, unknown>;
  selectorOptions: Record<string, unknown>;
}) {
  const parsedOptions = marketingProviderSelectorOptionsFromConfig({
    selectorOptions,
  });
  const nextConfig = { ...currentConfig };
  const mappedFields: string[] = [];
  const accounts = parsedOptions?.accounts ?? [];
  const managerAccounts = parsedOptions?.managerAccounts ?? [];
  const conversionActions = parsedOptions?.conversionActions ?? [];
  const configuredCustomerId = stringValue(nextConfig.customerId);

  if (!configuredCustomerId) {
    const account = singleOption(accounts);

    if (account) {
      nextConfig.customerId = googleAdsCustomerId(account.id);
      mappedFields.push("customer ID");

      if (!stringValue(nextConfig.accountName) && account.name) {
        nextConfig.accountName = account.name;
        mappedFields.push("account name");
      }
    }
  } else if (!stringValue(nextConfig.accountName)) {
    const account = accounts.find(
      (option) => googleAdsCustomerId(option.id) === googleAdsCustomerId(configuredCustomerId),
    );

    if (account?.name) {
      nextConfig.accountName = account.name;
      mappedFields.push("account name");
    }
  }

  if (!stringValue(nextConfig.managerCustomerId)) {
    const managerAccount = singleOption(managerAccounts);

    if (managerAccount) {
      nextConfig.managerCustomerId = googleAdsCustomerId(managerAccount.id);
      mappedFields.push("manager customer ID");
    }
  }

  if (!stringValue(nextConfig.leadConversionActionId)) {
    const leadAction =
      singleOption(conversionActions) ??
      uniqueKeywordMatch({
        exclude: ["call", "phone", "telephone"],
        include: [
          "qualified lead",
          "crm lead",
          "form lead",
          "website lead",
          "lead",
          "enquiry",
          "inquiry",
          "quote",
          "project",
          "contact form",
        ],
        options: conversionActions,
      });

    if (leadAction) {
      nextConfig.leadConversionActionId = leadAction.id;
      mappedFields.push("lead conversion action");
    }
  }

  if (!stringValue(nextConfig.callConversionActionId)) {
    const callAction =
      conversionActions.length > 1
        ? uniqueKeywordMatch({
            include: ["phone call", "crm call", "call", "phone", "telephone"],
            options: conversionActions,
          })
        : null;

    if (callAction) {
      nextConfig.callConversionActionId = callAction.id;
      mappedFields.push("call conversion action");
    }
  }

  return { config: nextConfig, mappedFields };
}

function microsoftAdsCustomerIdFromAccountOption(option: ProviderSelectorOption) {
  const customerId = stringValue((option as Record<string, unknown>).customerId);

  if (customerId) return customerId;

  const description = option.description ?? "";
  const match = description.match(/\bCustomer\s+([A-Za-z0-9-]+)/i);

  return match?.[1] ?? null;
}

function microsoftAdsConversionGoalNameFromOption(
  option: ProviderSelectorOption | null | undefined,
) {
  return stringValue(option?.name);
}

function applyBingAdsConversionGoalNames({
  conversionGoals,
  mappedFields,
  nextConfig,
}: {
  conversionGoals: ProviderSelectorOption[];
  mappedFields: string[];
  nextConfig: Record<string, unknown>;
}) {
  const fields = [
    {
      idKey: "leadConversionGoalId",
      label: "lead conversion goal name",
      nameKey: "leadConversionGoalName",
    },
    {
      idKey: "callConversionGoalId",
      label: "call conversion goal name",
      nameKey: "callConversionGoalName",
    },
  ] as const;

  for (const field of fields) {
    const id = numericStringValue(nextConfig[field.idKey]);
    const option = id
      ? conversionGoals.find((candidate) => candidate.id === id)
      : null;
    const name = microsoftAdsConversionGoalNameFromOption(option);

    if (!name || stringValue(nextConfig[field.nameKey]) === name) continue;

    nextConfig[field.nameKey] = name;
    mappedFields.push(field.label);
  }
}

function autoMapBingAdsConfig({
  currentConfig,
  selectorOptions,
}: {
  currentConfig: Record<string, unknown>;
  selectorOptions: Record<string, unknown>;
}) {
  const parsedOptions = marketingProviderSelectorOptionsFromConfig({
    selectorOptions,
  });
  const nextConfig = { ...currentConfig };
  const mappedFields: string[] = [];
  const accounts = parsedOptions?.accounts ?? [];
  const managerAccounts = parsedOptions?.managerAccounts ?? [];
  const uetTags = parsedOptions?.uetTags ?? [];
  const conversionGoals = numericMarketingProviderSelectorOptions(
    combinedMarketingProviderSelectorOptions(parsedOptions, [
      "conversionGoals",
      "conversionActions",
    ]),
  );
  const configuredAccountId = stringValue(nextConfig.accountId);

  if (!configuredAccountId) {
    const account = singleOption(accounts);

    if (account) {
      nextConfig.accountId = account.id;
      mappedFields.push("account ID");

      if (!stringValue(nextConfig.accountName) && account.name) {
        nextConfig.accountName = account.name;
        mappedFields.push("account name");
      }

      if (!stringValue(nextConfig.customerId)) {
        const customerId = microsoftAdsCustomerIdFromAccountOption(account);

        if (customerId) {
          nextConfig.customerId = customerId;
          mappedFields.push("customer ID");
        }
      }
    }
  } else {
    const account = accounts.find((option) => option.id === configuredAccountId);

    if (!stringValue(nextConfig.accountName) && account?.name) {
      nextConfig.accountName = account.name;
      mappedFields.push("account name");
    }

    if (!stringValue(nextConfig.customerId) && account) {
      const customerId = microsoftAdsCustomerIdFromAccountOption(account);

      if (customerId) {
        nextConfig.customerId = customerId;
        mappedFields.push("customer ID");
      }
    }
  }

  if (!stringValue(nextConfig.customerId)) {
    const managerAccount = singleOption(managerAccounts);

    if (managerAccount) {
      nextConfig.customerId = managerAccount.id;
      mappedFields.push("customer ID");
    }
  }

  if (!stringValue(nextConfig.managerAccountId)) {
    const managerAccount = singleOption(managerAccounts);

    if (managerAccount) {
      nextConfig.managerAccountId = managerAccount.id;
      mappedFields.push("manager account ID");
    }
  }

  if (!numericStringValue(nextConfig.uetTagId)) {
    const uetTag = singleOption(uetTags);

    if (uetTag) {
      nextConfig.uetTagId = uetTag.id;
      mappedFields.push("UET tag");
    }
  }

  if (!numericStringValue(nextConfig.leadConversionGoalId)) {
    const leadGoal =
      singleOption(conversionGoals) ??
      uniqueKeywordMatch({
        exclude: ["call", "phone", "telephone"],
        include: [
          "qualified lead",
          "crm lead",
          "form lead",
          "website lead",
          "lead",
          "enquiry",
          "inquiry",
          "quote",
          "project",
          "contact form",
          "offline conversion",
        ],
        options: conversionGoals,
      });

    if (leadGoal) {
      nextConfig.leadConversionGoalId = leadGoal.id;
      mappedFields.push("lead conversion goal");
    }
  }

  if (!numericStringValue(nextConfig.callConversionGoalId)) {
    const callGoal =
      conversionGoals.length > 1
        ? uniqueKeywordMatch({
            include: ["phone call", "crm call", "call", "phone", "telephone"],
            options: conversionGoals,
          })
        : null;

    if (callGoal) {
      nextConfig.callConversionGoalId = callGoal.id;
      mappedFields.push("call conversion goal");
    }
  }

  applyBingAdsConversionGoalNames({
    conversionGoals,
    mappedFields,
    nextConfig,
  });

  return { config: nextConfig, mappedFields };
}

function autoMapLinkedInAdsConfig({
  currentConfig,
  selectorOptions,
}: {
  currentConfig: Record<string, unknown>;
  selectorOptions: Record<string, unknown>;
}) {
  const parsedOptions = marketingProviderSelectorOptionsFromConfig({
    selectorOptions,
  });
  const nextConfig = { ...currentConfig };
  const mappedFields: string[] = [];
  const accounts = parsedOptions?.accounts ?? [];
  const insightTags = parsedOptions?.insightTags ?? [];
  const conversionRules = combinedMarketingProviderSelectorOptions(parsedOptions, [
    "conversionRules",
    "conversionActions",
  ]);
  const configuredAccountId = stringValue(nextConfig.adAccountId);
  const accountAutoMapDisabled = Boolean(
    stringValue(nextConfig.accountMappingResetAt),
  );

  if (!configuredAccountId && !accountAutoMapDisabled) {
    const account = singleOption(accounts);

    if (account) {
      nextConfig.adAccountId = account.id;
      delete nextConfig.accountMappingResetAt;
      mappedFields.push("ad account ID");

      if (!stringValue(nextConfig.accountName) && account.name) {
        nextConfig.accountName = account.name;
        mappedFields.push("account name");
      }
    }
  } else if (!stringValue(nextConfig.accountName)) {
    const account = accounts.find(
      (option) =>
        linkedInAccountIdFromUrn(option.id) ===
        linkedInAccountIdFromUrn(configuredAccountId),
    );

    if (account?.name) {
      nextConfig.accountName = account.name;
      mappedFields.push("account name");
    }
  }

  if (!stringValue(nextConfig.insightTagId)) {
    const insightTag = singleOption(insightTags);

    if (insightTag) {
      nextConfig.insightTagId = insightTag.id;
      mappedFields.push("Insight Tag");
    }
  }

  if (!stringValue(nextConfig.leadConversionRuleId)) {
    const leadRule =
      singleOption(conversionRules) ??
      uniqueKeywordMatch({
        exclude: ["call", "phone", "telephone"],
        include: [
          "qualified lead",
          "crm lead",
          "form lead",
          "website lead",
          "lead",
          "enquiry",
          "inquiry",
          "quote",
          "project",
          "contact form",
          "offline conversion",
        ],
        options: conversionRules,
      });

    if (leadRule) {
      nextConfig.leadConversionRuleId = leadRule.id;
      mappedFields.push("lead conversion rule");
    }
  }

  if (!stringValue(nextConfig.callConversionRuleId)) {
    const callRule =
      conversionRules.length > 1
        ? uniqueKeywordMatch({
            include: ["phone call", "crm call", "call", "phone", "telephone"],
            options: conversionRules,
          })
        : null;

    if (callRule) {
      nextConfig.callConversionRuleId = callRule.id;
      mappedFields.push("call conversion rule");
    }
  }

  return { config: nextConfig, mappedFields };
}

function autoMapMetaConfig({
  currentConfig,
  selectorOptions,
}: {
  currentConfig: Record<string, unknown>;
  selectorOptions: Record<string, unknown>;
}) {
  const parsedOptions = marketingProviderSelectorOptionsFromConfig({
    selectorOptions,
  });
  const nextConfig = { ...currentConfig };
  const mappedFields: string[] = [];
  const accounts = parsedOptions?.accounts ?? [];
  const pixels = parsedOptions?.pixels ?? [];
  const configuredAccountId = stringValue(nextConfig.adAccountId);

  if (!configuredAccountId) {
    const account = singleOption(accounts);

    if (account) {
      nextConfig.adAccountId = account.id.replace(/^act_/, "");
      mappedFields.push("ad account ID");

      if (!stringValue(nextConfig.accountName) && account.name) {
        nextConfig.accountName = account.name;
        mappedFields.push("account name");
      }
    }
  } else if (!stringValue(nextConfig.accountName)) {
    const normalizedAccountId = configuredAccountId.replace(/^act_/, "");
    const account = accounts.find(
      (option) => option.id.replace(/^act_/, "") === normalizedAccountId,
    );

    if (account?.name) {
      nextConfig.accountName = account.name;
      mappedFields.push("account name");
    }
  }

  if (!stringValue(nextConfig.pixelId)) {
    const pixel = singleOption(pixels);

    if (pixel) {
      nextConfig.pixelId = pixel.id;
      mappedFields.push("pixel ID");
    }
  }

  return { config: nextConfig, mappedFields };
}

function autoMapProviderConfig({
  currentConfig,
  provider,
  selectorOptions,
}: {
  currentConfig: Record<string, unknown>;
  provider: AccountSelectableMarketingProviderSlug;
  selectorOptions: Record<string, unknown>;
}) {
  if (provider === "google-ads") {
    return autoMapGoogleAdsConfig({ currentConfig, selectorOptions });
  }

  if (provider === "bing-ads") {
    return autoMapBingAdsConfig({ currentConfig, selectorOptions });
  }

  if (provider === "linkedin-ads") {
    return autoMapLinkedInAdsConfig({ currentConfig, selectorOptions });
  }

  return autoMapMetaConfig({ currentConfig, selectorOptions });
}

async function refreshAuthBrokerSelectorOptions({
  existing,
  provider,
  providerName,
  revalidateSlug,
}: {
  existing: ExistingIntegrationConnection;
  provider: MarketingIntegrationProviderValue;
  providerName: string;
  revalidateSlug: AccountSelectableMarketingProviderSlug;
}): Promise<MarketingIntegrationActionState | null> {
  const currentConfig = jsonObject(existing.config);
  const connectionId = authBrokerConnectionId(currentConfig);

  if (!connectionId) return null;

  const result = await refreshMarketingAuthBrokerSelectors({ connectionId });

  if (!result.ok) {
    return {
      ok: false,
      message: authBrokerSelectorRefreshError(providerName, result.message),
      savedAt: null,
      connected: existing.status === "CONNECTED",
    };
  }

  const now = new Date().toISOString();
  const selectorOptions = {
    ...jsonObject(currentConfig.selectorOptions),
    ...result.selectorOptions,
  };
  const autoMap = autoMapProviderConfig({
    currentConfig,
    provider: revalidateSlug,
    selectorOptions,
  });
  const authBroker = jsonObject(currentConfig.authBroker);
  const nextStatus = result.connection.reconnectRequired
    ? "reconnect_required"
    : result.connection.status;
  const nextConfig = withConfiguredMarketingProviderSelections(revalidateSlug, {
    ...autoMap.config,
    selectorOptions,
    authBroker: {
      ...authBroker,
      lastError: result.connection.lastError ?? null,
      lastSelectorSyncAt: now,
      lastStatusAt: now,
      status: nextStatus,
    },
  });
  const nextSelectorOptions = jsonObject(nextConfig.selectorOptions);

  await prisma.integrationConnection.update({
    where: { provider },
    data: {
      status: result.connection.reconnectRequired ? "ERROR" : "CONNECTED",
      config: marketingConfigJson(nextConfig),
    },
  });

  const remappedUploads = await remapPendingUploadsForSavedConfig({
    config: nextConfig as BingAdsConfig | GoogleAdsConfig | LinkedInAdsConfig | MetaConfig,
    provider: revalidateSlug as UploadProviderSlug,
  });

  revalidatePath("/settings/integrations");
  revalidatePath(`/settings/integrations/${revalidateSlug}`);

  if (result.connection.reconnectRequired) {
    return {
      ok: false,
      message:
        result.connection.lastError ||
        `${providerName} needs to be reconnected in iD30 Auth.`,
      savedAt: null,
      connected: false,
    };
  }

  return {
    ok: true,
    message: `${selectorRefreshSummary(providerName, nextSelectorOptions)}${autoMapSummary(autoMap.mappedFields)}${remappedUploadMessage(remappedUploads)}`,
    savedAt: Date.now(),
    connected: true,
  };
}

export async function refreshGoogleAnalyticsSelectorOptionsAction(
  previousState: MarketingIntegrationActionState,
): Promise<MarketingIntegrationActionState> {
  void previousState;
  await requireAdmin();

  const existing = await prisma.integrationConnection.findUnique({
    where: { provider: marketingIntegrationProviders.googleAnalytics },
    select: { config: true, status: true },
  });

  if (!existing) {
    return {
      ok: false,
      message: "Connect Google Analytics before refreshing options.",
      savedAt: null,
      connected: false,
    };
  }

  const currentConfig = jsonObject(existing.config);
  const connectionId = authBrokerConnectionId(currentConfig);

  if (!connectionId) {
    return {
      ok: false,
      message:
        "Connect Google Analytics through iD30 Auth before refreshing account and property options.",
      savedAt: null,
      connected: existing.status === "CONNECTED",
    };
  }

  const result = await refreshMarketingAuthBrokerSelectors({ connectionId });

  if (!result.ok) {
    return {
      ok: false,
      message: authBrokerSelectorRefreshError("Google Analytics", result.message),
      savedAt: null,
      connected: existing.status === "CONNECTED",
    };
  }

  const now = new Date().toISOString();
  const selectorOptions = {
    ...jsonObject(currentConfig.selectorOptions),
    ...result.selectorOptions,
  };
  const authBroker = jsonObject(currentConfig.authBroker);
  const nextStatus = result.connection.reconnectRequired
    ? "reconnect_required"
    : result.connection.status;
  const nextConfig = {
    ...currentConfig,
    selectorOptions,
    authBroker: {
      ...authBroker,
      lastError: result.connection.lastError ?? null,
      lastSelectorSyncAt: now,
      lastStatusAt: now,
      status: nextStatus,
    },
  };
  const nextSelectorOptions = jsonObject(nextConfig.selectorOptions);

  await prisma.integrationConnection.update({
    where: { provider: marketingIntegrationProviders.googleAnalytics },
    data: {
      status: result.connection.reconnectRequired ? "ERROR" : "CONNECTED",
      config: marketingConfigJson(nextConfig),
    },
  });

  revalidatePath("/settings/integrations");
  revalidatePath("/settings/integrations/google-analytics");

  if (result.connection.reconnectRequired) {
    return {
      ok: false,
      message:
        result.connection.lastError ||
        "Google Analytics needs to be reconnected in iD30 Auth.",
      savedAt: null,
      connected: false,
    };
  }

  return {
    ok: true,
    message: selectorRefreshSummary("Google Analytics", nextSelectorOptions),
    savedAt: Date.now(),
    connected: true,
  };
}

const googleAdsApiVersion = process.env.GOOGLE_ADS_API_VERSION || "v24";
const klaviyoApiRevision = process.env.KLAVIYO_API_REVISION || "2026-07-15";
const linkedInMarketingApiVersion =
  process.env.LINKEDIN_MARKETING_API_VERSION || "202607";
const metaGraphApiVersion = process.env.META_GRAPH_API_VERSION || "v23.0";

function stringOrNumberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);

  return stringValue(value);
}

function microsoftAdsApiError(payload: unknown, fallback: string) {
  const record = jsonObject(payload);
  const error = jsonObject(record.error);
  const errors = jsonArray(record.Errors);
  const partialErrors = jsonArray(record.PartialErrors);
  const firstError = jsonObject(errors[0] ?? partialErrors[0]);

  return (
    stringValue(record.Message) ||
    stringValue(error.message) ||
    stringValue(firstError.Message) ||
    stringValue(firstError.ErrorCode) ||
    stringValue(record.error_description) ||
    stringValue(record.error) ||
    fallback
  );
}

function microsoftAdsOAuthClientCredentials(storedConfig: unknown) {
  const credentials = existingCredentials(storedConfig);
  const encryptedClientId = stringValue(credentials.oauthClientId);
  const encryptedClientSecret = stringValue(credentials.oauthClientSecret);

  if (encryptedClientId && encryptedClientSecret) {
    return {
      clientId: decryptSecret(encryptedClientId),
      clientSecret: decryptSecret(encryptedClientSecret),
    };
  }

  const clientId = process.env.MICROSOFT_ADS_OAUTH_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_ADS_OAUTH_CLIENT_SECRET;

  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

async function microsoftAdsAccessToken({
  refreshToken,
  storedConfig,
}: {
  refreshToken: string;
  storedConfig: unknown;
}) {
  const clientCredentials = microsoftAdsOAuthClientCredentials(storedConfig);
  if (!clientCredentials) {
    throw new Error(
      "Add Bing Ads OAuth client ID and secret in app settings or env before refreshing options.",
    );
  }

  const response = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientCredentials.clientId,
        client_secret: clientCredentials.clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: "https://ads.microsoft.com/msads.manage offline_access",
      }),
      cache: "no-store",
    },
  );
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const accessToken = stringValue(payload.access_token);

  if (!response.ok || !accessToken) {
    throw new Error(microsoftAdsApiError(payload, "Bing Ads OAuth token refresh failed."));
  }

  return accessToken;
}

function microsoftAdsHeaders({
  accessToken,
  accountId,
  customerId,
  developerToken,
}: {
  accessToken: string;
  accountId?: string | null;
  customerId?: string | null;
  developerToken: string;
}) {
  return {
    Authorization: `Bearer ${accessToken}`,
    ...(accountId ? { CustomerAccountId: accountId } : {}),
    ...(customerId ? { CustomerId: customerId } : {}),
    DeveloperToken: developerToken,
    "Content-Type": "application/json",
  };
}

async function microsoftAdsJsonRequest({
  accessToken,
  accountId,
  body,
  customerId,
  developerToken,
  fallbackMessage,
  url,
}: {
  accessToken: string;
  accountId?: string | null;
  body: Record<string, unknown>;
  customerId?: string | null;
  developerToken: string;
  fallbackMessage: string;
  url: string;
}) {
  const response = await fetch(url, {
    method: "POST",
    headers: microsoftAdsHeaders({
      accessToken,
      accountId,
      customerId,
      developerToken,
    }),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    throw new Error(
      microsoftAdsApiError(payload, `${fallbackMessage} HTTP ${response.status}.`),
    );
  }

  return payload;
}

async function getMicrosoftAdsCurrentUser({
  accessToken,
  developerToken,
}: {
  accessToken: string;
  developerToken: string;
}) {
  return microsoftAdsJsonRequest({
    accessToken,
    developerToken,
    body: {},
    fallbackMessage: "Bing Ads user lookup failed with",
    url: "https://clientcenter.api.bingads.microsoft.com/CustomerManagement/v13/User/Query",
  });
}

async function searchMicrosoftAdsAccounts({
  accessToken,
  developerToken,
  userId,
}: {
  accessToken: string;
  developerToken: string;
  userId: string;
}) {
  return microsoftAdsJsonRequest({
    accessToken,
    developerToken,
    body: {
      Predicates: [
        {
          Field: "UserId",
          Operator: "Equals",
          Value: userId,
        },
      ],
      Ordering: [
        {
          Field: "Name",
          Order: "Ascending",
        },
      ],
      PageInfo: {
        Index: 0,
        Size: 100,
      },
    },
    fallbackMessage: "Bing Ads account lookup failed with",
    url: "https://clientcenter.api.bingads.microsoft.com/CustomerManagement/v13/Accounts/Search",
  });
}

async function getMicrosoftAdsUetTags({
  accessToken,
  accountId,
  customerId,
  developerToken,
}: {
  accessToken: string;
  accountId: string;
  customerId: string;
  developerToken: string;
}) {
  return microsoftAdsJsonRequest({
    accessToken,
    accountId,
    customerId,
    developerToken,
    body: {
      TagIds: [],
    },
    fallbackMessage: "Bing Ads UET tag lookup failed with",
    url: "https://campaign.api.bingads.microsoft.com/CampaignManagement/v13/UetTags/QueryByIds",
  });
}

async function getMicrosoftAdsConversionGoals({
  accessToken,
  accountId,
  customerId,
  developerToken,
}: {
  accessToken: string;
  accountId: string;
  customerId: string;
  developerToken: string;
}) {
  return microsoftAdsJsonRequest({
    accessToken,
    accountId,
    customerId,
    developerToken,
    body: {
      ConversionGoalIds: [],
      ConversionGoalTypes:
        "Url Duration PagesViewedPerVisit Event AppInstall OfflineConversion InStoreTransaction AppDownload",
    },
    fallbackMessage: "Bing Ads conversion goal lookup failed with",
    url: "https://campaign.api.bingads.microsoft.com/CampaignManagement/v13/ConversionGoals/QueryByIds",
  });
}

function microsoftAdsAccountOption(row: Record<string, unknown>) {
  const id = stringOrNumberValue(row.Id);
  if (!id) return null;
  const customerId =
    stringOrNumberValue(row.ParentCustomerId) || stringOrNumberValue(row.BillToCustomerId);

  return {
    id,
    name: stringValue(row.Name),
    description: [
      customerId ? `Customer ${customerId}` : null,
      stringValue(row.CurrencyCode),
    ]
      .filter(Boolean)
      .join(" - "),
    status: stringValue(row.AccountLifeCycleStatus),
    customerId,
  };
}

function microsoftAdsCustomerRoleOption(row: Record<string, unknown>) {
  const id = stringOrNumberValue(row.CustomerId);
  if (!id) return null;

  const accountCount =
    jsonArray(row.AccountIds).length + jsonArray(row.LinkedAccountIds).length;

  return {
    id,
    name: null,
    description: accountCount
      ? `${accountCount} accessible account${accountCount === 1 ? "" : "s"}`
      : "Accessible customer",
    status: stringOrNumberValue(row.RoleId)
      ? `Role ${stringOrNumberValue(row.RoleId)}`
      : null,
  };
}

function microsoftAdsUetTagOption(row: Record<string, unknown>) {
  const id = stringOrNumberValue(row.Id);
  if (!id) return null;

  return {
    id,
    name: stringValue(row.Name),
    description: stringValue(row.Description) || stringValue(row.Industry),
    status: stringValue(row.TrackingStatus),
  };
}

function microsoftAdsConversionGoalOption(
  row: Record<string, unknown>,
  accountOption: ProviderSelectorOption | null,
) {
  const id = stringOrNumberValue(row.Id);
  if (!id) return null;

  return {
    id,
    name: stringValue(row.Name),
    description: [
      stringValue(row.Type),
      accountOption?.name || accountOption?.id,
      stringOrNumberValue(row.TagId) ? `Tag ${stringOrNumberValue(row.TagId)}` : null,
    ]
      .filter(Boolean)
      .join(" - "),
    status: stringValue(row.Status) || stringValue(row.TrackingStatus),
  };
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
  const errors = jsonArray(record.errors);
  const firstError = jsonObject(errors[0]);

  return (
    stringValue(record.message) ||
    stringValue(firstError.message) ||
    stringValue(record.error_description) ||
    stringValue(record.error) ||
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

async function fetchLinkedInAdAccounts({
  accessToken,
  maxItems = 100,
}: {
  accessToken: string;
  maxItems?: number;
}) {
  const rows: Record<string, unknown>[] = [];
  let pageToken: string | null = null;

  while (rows.length < maxItems) {
    const payload = await fetchLinkedInRest({
      accessToken,
      path: "adAccounts",
      params: {
        q: "search",
        pageSize: "100",
        ...(pageToken ? { pageToken } : {}),
      },
    });

    rows.push(
      ...jsonArray(payload.elements)
        .map(jsonObject)
        .filter((item) => Object.keys(item).length),
    );
    pageToken = stringValue(jsonObject(payload.metadata).nextPageToken);
    if (!pageToken) break;
  }

  return rows.slice(0, maxItems);
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

function linkedInAdAccountOption(row: Record<string, unknown>) {
  const id = stringOrNumberValue(row.id);
  if (!id) return null;

  const servingStatuses = jsonArray(row.servingStatuses)
    .map(stringValue)
    .filter((value): value is string => Boolean(value));

  return {
    id,
    name: stringValue(row.name),
    description: [
      stringValue(row.currency),
      stringValue(row.type),
      stringValue(row.reference),
    ]
      .filter(Boolean)
      .join(" - "),
    status: stringValue(row.status) || servingStatuses.join(", ") || null,
  };
}

function linkedInInsightTagOption(
  row: Record<string, unknown>,
  accountOption: ProviderSelectorOption | null,
) {
  const id =
    stringOrNumberValue(row.id) ||
    linkedInAccountIdFromUrn(stringValue(row.insightTag));
  if (!id) return null;

  return {
    id,
    name: `Insight Tag ${id}`,
    description: [stringValue(row.domainName), accountOption?.name || accountOption?.id]
      .filter(Boolean)
      .join(" - "),
    status: row.blocked === true ? "Blocked" : row.blocked === false ? "Active" : null,
  };
}

function linkedInConversionRuleOption(
  row: Record<string, unknown>,
  accountOption: ProviderSelectorOption | null,
) {
  const id = stringOrNumberValue(row.id);
  if (!id) return null;

  return {
    id,
    name: stringValue(row.name),
    description: [
      stringValue(row.type),
      stringValue(row.attributionType),
      accountOption?.name || linkedInAccountIdFromUrn(stringValue(row.account)),
    ]
      .filter(Boolean)
      .join(" - "),
    status:
      row.enabled === true ? "Enabled" : row.enabled === false ? "Disabled" : null,
  };
}

function googleAdsCustomerId(value: string) {
  return value.replace(/\D/g, "");
}

function googleAdsApiUrl(path: string) {
  return `https://googleads.googleapis.com/${googleAdsApiVersion}/${path}`;
}

function googleAdsApiError(payload: unknown, fallback: string) {
  const record = jsonObject(payload);
  const error = jsonObject(record.error);

  return (
    stringValue(error.message) ||
    stringValue(record.message) ||
    stringValue(record.error_description) ||
    stringValue(record.error) ||
    fallback
  );
}

function googleAdsOAuthClientCredentials(storedConfig: unknown) {
  const credentials = existingCredentials(storedConfig);
  const encryptedClientId = stringValue(credentials.oauthClientId);
  const encryptedClientSecret = stringValue(credentials.oauthClientSecret);

  if (encryptedClientId && encryptedClientSecret) {
    return {
      clientId: decryptSecret(encryptedClientId),
      clientSecret: decryptSecret(encryptedClientSecret),
    };
  }

  const clientId = process.env.GOOGLE_ADS_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET;

  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

async function googleAdsAccessToken({
  refreshToken,
  storedConfig,
}: {
  refreshToken: string;
  storedConfig: unknown;
}) {
  const clientCredentials = googleAdsOAuthClientCredentials(storedConfig);
  if (!clientCredentials) {
    throw new Error(
      "Add Google Ads OAuth client ID and secret in app settings or env before refreshing options.",
    );
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientCredentials.clientId,
      client_secret: clientCredentials.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const accessToken = stringValue(payload.access_token);

  if (!response.ok || !accessToken) {
    throw new Error(googleAdsApiError(payload, "Google Ads OAuth token refresh failed."));
  }

  return accessToken;
}

function googleAnalyticsOAuthClientCredentials(storedConfig: unknown) {
  const credentials = existingCredentials(storedConfig);
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
  refreshToken,
  storedConfig,
}: {
  refreshToken: string;
  storedConfig: unknown;
}) {
  const clientCredentials = googleAnalyticsOAuthClientCredentials(storedConfig);
  if (!clientCredentials) {
    throw new Error(
      "Add Google Analytics OAuth client ID and secret in app settings or env before testing Data API access.",
    );
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientCredentials.clientId,
      client_secret: clientCredentials.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
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
      googleAdsApiError(payload, "Google Analytics OAuth token refresh failed."),
    );
  }

  return accessToken;
}

async function testGoogleAnalyticsDataApi({
  accessToken,
  propertyId,
}: {
  accessToken: string;
  propertyId: string;
}) {
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ endDate: "today", startDate: "7daysAgo" }],
        limit: "1",
        metrics: [{ name: "eventCount" }],
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
      googleAdsApiError(
        payload,
        `Google Analytics Data API test failed with HTTP ${response.status}.`,
      ),
    );
  }

  return jsonArray(payload.rows).length;
}

function googleSearchConsoleOAuthClientCredentials(storedConfig: unknown) {
  const credentials = existingCredentials(storedConfig);
  const encryptedClientId = stringValue(credentials.oauthClientId);
  const encryptedClientSecret = stringValue(credentials.oauthClientSecret);

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
  refreshToken,
  storedConfig,
}: {
  refreshToken: string;
  storedConfig: unknown;
}) {
  const clientCredentials = googleSearchConsoleOAuthClientCredentials(storedConfig);
  if (!clientCredentials) {
    throw new Error(
      "Add Google Search Console OAuth client ID and secret in app settings or env before refreshing options.",
    );
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientCredentials.clientId,
      client_secret: clientCredentials.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
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
      googleAdsApiError(
        payload,
        "Google Search Console OAuth token refresh failed.",
      ),
    );
  }

  return accessToken;
}

async function listGoogleSearchConsoleSites(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    throw new Error(
      googleAdsApiError(
        payload,
        `Google Search Console site lookup failed with HTTP ${response.status}.`,
      ),
    );
  }

  const options: ProviderSelectorOption[] = [];

  for (const item of jsonArray(payload.siteEntry)) {
    const site = jsonObject(item);
    const siteUrl = stringValue(site.siteUrl);
    if (!siteUrl) continue;

    options.push({
      id: siteUrl,
      name: siteUrl,
      description: stringValue(site.permissionLevel),
      status: "Verified",
    });
  }

  return options;
}

function googleAdsHeaders({
  accessToken,
  developerToken,
  managerCustomerId,
}: {
  accessToken: string;
  developerToken: string;
  managerCustomerId?: string | null;
}) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "developer-token": developerToken,
  };

  if (managerCustomerId) {
    headers["login-customer-id"] = googleAdsCustomerId(managerCustomerId);
  }

  return headers;
}

async function listGoogleAdsAccessibleCustomers({
  accessToken,
  developerToken,
}: {
  accessToken: string;
  developerToken: string;
}) {
  const response = await fetch(googleAdsApiUrl("customers:listAccessibleCustomers"), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    throw new Error(
      googleAdsApiError(
        payload,
        `Google Ads accessible customer lookup failed with HTTP ${response.status}.`,
      ),
    );
  }

  return (Array.isArray(payload.resourceNames) ? payload.resourceNames : [])
    .map((value) => stringValue(value)?.split("/").pop())
    .filter((value): value is string => Boolean(value))
    .map(googleAdsCustomerId);
}

async function googleAdsSearchStream({
  accessToken,
  customerId,
  developerToken,
  managerCustomerId,
  query,
}: {
  accessToken: string;
  customerId: string;
  developerToken: string;
  managerCustomerId?: string | null;
  query: string;
}) {
  const response = await fetch(
    googleAdsApiUrl(`customers/${googleAdsCustomerId(customerId)}/googleAds:searchStream`),
    {
      method: "POST",
      headers: googleAdsHeaders({
        accessToken,
        developerToken,
        managerCustomerId,
      }),
      body: JSON.stringify({ query: query.replace(/\s+/g, " ").trim() }),
      cache: "no-store",
    },
  );
  const payload = (await response.json().catch(() => ({}))) as unknown;

  if (!response.ok) {
    throw new Error(
      googleAdsApiError(
        payload,
        `Google Ads search failed with HTTP ${response.status}.`,
      ),
    );
  }

  return (Array.isArray(payload) ? payload : []).flatMap((batch) => {
    const results = jsonObject(batch).results;

    return Array.isArray(results) ? results : [];
  });
}

function googleAdsCustomerClientOption(row: Record<string, unknown>) {
  const customerClient = jsonObject(row.customerClient);
  const id =
    stringOrNumberValue(customerClient.id) ||
    stringValue(customerClient.clientCustomer)?.split("/").pop();
  if (!id) return null;

  const manager = customerClient.manager === true;

  return {
    manager,
    option: {
      id: googleAdsCustomerId(id),
      name: stringValue(customerClient.descriptiveName),
      description: manager ? "Manager account" : stringValue(customerClient.currencyCode),
      status: stringValue(customerClient.status),
    },
  };
}

function googleAdsConversionActionOption(
  row: Record<string, unknown>,
  accountOption: ProviderSelectorOption | null,
): ProviderSelectorOption | null {
  const conversionAction = jsonObject(row.conversionAction);
  const id = stringOrNumberValue(conversionAction.id);
  if (!id) return null;

  return {
    id,
    name: stringValue(conversionAction.name),
    description: [
      stringValue(conversionAction.type),
      accountOption?.name || accountOption?.id,
    ]
      .filter(Boolean)
      .join(" - "),
    status: stringValue(conversionAction.status),
  };
}

function googleAdsCustomerOption(row: Record<string, unknown>) {
  const customer = jsonObject(row.customer);
  const id = stringOrNumberValue(customer.id);
  if (!id) return null;

  return {
    id: googleAdsCustomerId(id),
    name: stringValue(customer.descriptiveName),
    description: stringValue(customer.currencyCode) || "Accessible customer",
    status: stringValue(customer.status),
  };
}

async function fetchGoogleAdsCustomerOption({
  accessToken,
  customerId,
  developerToken,
}: {
  accessToken: string;
  customerId: string;
  developerToken: string;
}) {
  const rows = await googleAdsSearchStream({
    accessToken,
    customerId,
    developerToken,
    query: `
      SELECT
        customer.currency_code,
        customer.descriptive_name,
        customer.id,
        customer.status
      FROM customer
      LIMIT 1
    `,
  });

  return googleAdsCustomerOption(jsonObject(rows[0]));
}

function klaviyoApiKey(storedConfig: unknown) {
  const envApiKey = process.env.KLAVIYO_PRIVATE_API_KEY?.trim();

  if (envApiKey) return envApiKey;

  const credentials = existingCredentials(storedConfig);
  const encryptedPrivateApiKey = stringValue(credentials.privateApiKey);

  if (encryptedPrivateApiKey) {
    return decryptSecret(encryptedPrivateApiKey);
  }

  return null;
}

function klaviyoApiError(payload: unknown, fallback: string) {
  const record = jsonObject(payload);
  const errors = jsonArray(record.errors);
  const firstError = jsonObject(errors[0]);

  return (
    stringValue(firstError.detail) ||
    stringValue(firstError.title) ||
    stringValue(record.message) ||
    fallback
  );
}

function klaviyoApiUrl(path: string) {
  return path.startsWith("http")
    ? path
    : `https://a.klaviyo.com/api/${path.replace(/^\//, "")}`;
}

async function fetchKlaviyoApi({
  apiKey,
  path,
}: {
  apiKey: string;
  path: string;
}) {
  const response = await fetch(klaviyoApiUrl(path), {
    headers: {
      Accept: "application/json",
      Authorization: `Klaviyo-API-Key ${apiKey}`,
      Revision: klaviyoApiRevision,
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

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
        .map(jsonObject)
        .filter((item) => Object.keys(item).length),
    );
    nextPath = stringValue(jsonObject(payload.links).next);
  }

  return rows.slice(0, maxItems);
}

function klaviyoOption(row: Record<string, unknown>) {
  const id = stringValue(row.id);
  const attributes = jsonObject(row.attributes);
  if (!id) return null;

  return {
    id,
    name: stringValue(attributes.name),
    description:
      stringValue(attributes.status) ||
      stringValue(attributes.channel) ||
      stringValue(attributes.type),
    status: stringValue(attributes.status),
  };
}

function klaviyoAccountOption(row: Record<string, unknown>) {
  const id = stringValue(row.id);
  const attributes = jsonObject(row.attributes);
  const contactInformation = jsonObject(attributes.contactInformation);
  if (!id) return null;

  return {
    id,
    name:
      stringValue(attributes.name) ||
      stringValue(contactInformation.organizationName) ||
      stringValue(attributes.publicApiKey) ||
      id,
    description: stringValue(attributes.websiteUrl),
    status: "Connected",
  };
}

async function fetchKlaviyoCampaigns(apiKey: string) {
  const channels = ["email", "sms", "mobile_push"];
  const batches = await Promise.all(
    channels.map((channel) => {
      const filter = encodeURIComponent(`equals(messages.channel,'${channel}')`);

      return fetchKlaviyoList({
        apiKey,
        maxItems: 50,
        path: `campaigns/?filter=${filter}&page[size]=20`,
      });
    }),
  );
  const byId = new Map<string, Record<string, unknown>>();

  for (const campaign of batches.flat()) {
    const id = stringValue(campaign.id);
    if (id && !byId.has(id)) {
      byId.set(id, campaign);
    }
  }

  return Array.from(byId.values());
}

function sortedSelectorOptions(options: Iterable<ProviderSelectorOption>) {
  return Array.from(options).sort((left, right) =>
    (left.name ?? left.id).localeCompare(right.name ?? right.id),
  );
}

function selectorOptionList(value: unknown) {
  return sortedSelectorOptions(
    jsonArray(value).filter(
      (option): option is ProviderSelectorOption =>
        Boolean(option) &&
        typeof option === "object" &&
        !Array.isArray(option) &&
        typeof (option as Record<string, unknown>).id === "string",
    ),
  );
}

function metaGraphUrl(path: string, params: Record<string, string>) {
  const url = new URL(`https://graph.facebook.com/${metaGraphApiVersion}/${path}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url;
}

function metaApiError(payload: Record<string, unknown>, fallback: string) {
  const error = jsonObject(payload.error);

  return stringValue(error.message) || stringValue(payload.error) || fallback;
}

function metaAdAccountId(value: string) {
  return value.startsWith("act_") ? value : `act_${value}`;
}

async function fetchMetaGraphList({
  accessToken,
  path,
  params,
  maxItems = 100,
}: {
  accessToken: string;
  path: string;
  params: Record<string, string>;
  maxItems?: number;
}) {
  const rows: Record<string, unknown>[] = [];
  let nextUrl: string | null = metaGraphUrl(path, {
    ...params,
    access_token: accessToken,
  }).toString();

  while (nextUrl && rows.length < maxItems) {
    const response = await fetch(nextUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (!response.ok) {
      throw new Error(
        metaApiError(payload, `Meta Graph request failed with HTTP ${response.status}.`),
      );
    }

    const data = Array.isArray(payload.data) ? payload.data : [];
    rows.push(
      ...data.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      ),
    );
    nextUrl = stringValue(jsonObject(payload.paging).next);
  }

  return rows.slice(0, maxItems);
}

function metaAccountOption(row: Record<string, unknown>): ProviderSelectorOption | null {
  const id = stringValue(row.id)?.replace(/^act_/, "");
  if (!id) return null;

  const statusValue = row.account_status;

  return {
    id,
    name: stringValue(row.name),
    status:
      typeof statusValue === "number" || typeof statusValue === "string"
        ? `Status ${statusValue}`
        : null,
  };
}

function metaPixelOption(
  row: Record<string, unknown>,
  accountName: string | null,
): ProviderSelectorOption | null {
  const id = stringValue(row.id);
  if (!id) return null;

  return {
    id,
    name: stringValue(row.name),
    description: accountName ? `Ad account: ${accountName}` : null,
  };
}

function hasCredentialSet(
  credentials: Record<string, unknown>,
  requiredKeys: string[],
) {
  return requiredKeys.every((key) => Boolean(stringValue(credentials[key])));
}

function mergeEncryptedCredentials({
  existingConfig,
  fields,
}: {
  existingConfig: unknown;
  fields: CredentialField[];
}) {
  const suppliedFields = fields.filter((field) => field.value);
  const current = existingCredentials(existingConfig);

  if (!suppliedFields.length) {
    return Object.keys(current).length ? current : null;
  }

  if (!hasCredentialEncryptionKey()) {
    throw new Error("Set CREDENTIAL_ENCRYPTION_KEY before saving provider credentials.");
  }

  return {
    ...current,
    ...Object.fromEntries(
      suppliedFields.map((field) => [field.key, encryptSecret(field.value)]),
    ),
    savedAt: new Date().toISOString(),
  };
}

function credentialError(
  provider: string,
  credentials: Record<string, unknown> | null,
  requiredKeys: string[],
) {
  if (!credentials || !hasCredentialSet(credentials, requiredKeys)) {
    return `Add ${provider} API credentials before enabling conversion uploads.`;
  }

  return null;
}

function paidSearchUploadCredentialError(
  provider: string,
  providerSlug: Extract<MarketingIntegrationProviderSlug, "bing-ads" | "google-ads">,
  credentials: Record<string, unknown> | null,
) {
  const config = { credentials: credentials ?? {} };

  if (!getMarketingIntegrationOAuthCredentialSource(providerSlug, config)) {
    return `Add ${provider} OAuth app credentials in env or advanced setup before enabling conversion uploads.`;
  }

  if (!getMarketingIntegrationDeveloperTokenSource(providerSlug, config)) {
    return `Add a ${provider} developer token in env or advanced setup before enabling conversion uploads.`;
  }

  if (!hasCredentialSet(credentials ?? {}, ["refreshToken"])) {
    return `Connect ${provider} OAuth before enabling conversion uploads.`;
  }

  return null;
}

function secretCredentialOrEnv({
  credentials,
  envKey,
  key,
}: {
  credentials: Record<string, unknown>;
  envKey: string;
  key: string;
}) {
  const encryptedValue = stringValue(credentials[key]);

  if (encryptedValue) {
    return decryptSecret(encryptedValue);
  }

  return stringValue(process.env[envKey]);
}

export async function updateBingAdsIntegrationAction(
  _: MarketingIntegrationActionState,
  formData: FormData,
): Promise<MarketingIntegrationActionState> {
  await requireAdmin();

  const existing = await prisma.integrationConnection.findUnique({
    where: { provider: marketingIntegrationProviders.bingAds },
    select: { config: true },
  });
  const currentConfig = jsonObject(existing?.config);
  const submittedLeadGoalId = String(formData.get("leadConversionGoalId") ?? "").trim();
  const submittedCallGoalId = String(formData.get("callConversionGoalId") ?? "").trim();
  const configCandidate = providerFormConfigCandidate({
    existingConfig: existing?.config,
    provider: "bing-ads",
    values: {
      customerId: formData.get("customerId"),
      accountId: formData.get("accountId"),
      managerAccountId: formData.get("managerAccountId"),
      accountName: formData.get("accountName"),
      uetTagId: formData.get("uetTagId"),
      leadConversionGoalId: formData.get("leadConversionGoalId"),
      leadConversionGoalName:
        submittedLeadGoalId &&
        submittedLeadGoalId === stringValue(currentConfig.leadConversionGoalId)
          ? currentConfig.leadConversionGoalName
          : null,
      callConversionGoalId: formData.get("callConversionGoalId"),
      callConversionGoalName:
        submittedCallGoalId &&
        submittedCallGoalId === stringValue(currentConfig.callConversionGoalId)
          ? currentConfig.callConversionGoalName
          : null,
      importCostEnabled: formData.get("importCostEnabled") === "on",
      uploadOfflineConversionsEnabled:
        formData.get("uploadOfflineConversionsEnabled") === "on",
      trackedClickIds: formData.get("trackedClickIds"),
    },
  });
  const parsed = bingAdsConfigSchema.safeParse(configCandidate);

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Enter valid Bing Ads settings.",
      savedAt: null,
      connected: false,
    };
  }

  let credentials: Record<string, unknown> | null;

  try {
    credentials = mergeEncryptedCredentials({
      existingConfig: existing?.config,
      fields: [
        {
          key: "developerToken",
          value: String(formData.get("developerToken") ?? "").trim(),
        },
        {
          key: "oauthClientId",
          value: String(formData.get("oauthClientId") ?? "").trim(),
        },
        {
          key: "oauthClientSecret",
          value: String(formData.get("oauthClientSecret") ?? "").trim(),
        },
        {
          key: "refreshToken",
          value: String(formData.get("refreshToken") ?? "").trim(),
        },
      ],
    });
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Could not save Bing Ads credentials.",
      savedAt: null,
      connected: false,
    };
  }

  const authBrokerReady = await marketingAuthBrokerConfigured();
  const missingCredentialMessage =
    parsed.data.uploadOfflineConversionsEnabled && !authBrokerReady
      ? paidSearchUploadCredentialError("Bing Ads", "bing-ads", credentials)
      : null;

  if (missingCredentialMessage) {
    return {
      ok: false,
      message: missingCredentialMessage,
      savedAt: null,
      connected: false,
    };
  }

  const nextConfig = withConfiguredMarketingProviderSelections("bing-ads", {
    ...parsed.data,
    ...preservedProviderRuntimeConfig(existing?.config),
    ...(credentials ? { credentials } : {}),
  });

  await prisma.integrationConnection.upsert({
    where: { provider: marketingIntegrationProviders.bingAds },
    update: {
      name: "Bing Ads",
      description:
        "Microsoft Advertising account, UET and offline conversion mapping for CRM attribution.",
      status: "CONNECTED",
      config: marketingConfigJson(nextConfig),
    },
    create: {
      provider: marketingIntegrationProviders.bingAds,
      name: "Bing Ads",
      description:
        "Microsoft Advertising account, UET and offline conversion mapping for CRM attribution.",
      status: "CONNECTED",
      config: marketingConfigJson(nextConfig),
    },
  });

  const remappedUploads = await remapPendingUploadsForSavedConfig({
    config: parsed.data,
    provider: "bing-ads",
  });

  revalidatePath("/settings/integrations");
  revalidatePath("/settings/integrations/bing-ads");

  return {
    ok: true,
    message: `Bing Ads settings saved.${bingAdsSetupGapMessage(parsed.data)}${remappedUploadMessage(remappedUploads)}`,
    savedAt: Date.now(),
    connected: true,
  };
}

export async function refreshBingAdsSelectorOptionsAction(
  previousState: MarketingIntegrationActionState,
): Promise<MarketingIntegrationActionState> {
  void previousState;
  await requireAdmin();

  const existing = await prisma.integrationConnection.findUnique({
    where: { provider: marketingIntegrationProviders.bingAds },
    select: { config: true, status: true },
  });

  if (!existing) {
    return {
      ok: false,
      message: "Save Bing Ads settings before refreshing options.",
      savedAt: null,
      connected: false,
    };
  }

  const authBrokerResult = await refreshAuthBrokerSelectorOptions({
    existing,
    provider: marketingIntegrationProviders.bingAds,
    providerName: "Bing Ads",
    revalidateSlug: "bing-ads",
  });

  if (authBrokerResult) return authBrokerResult;

  if (!hasCredentialEncryptionKey()) {
    return {
      ok: false,
      message: "Set CREDENTIAL_ENCRYPTION_KEY before refreshing Bing Ads options.",
      savedAt: null,
      connected: false,
    };
  }

  const currentConfig = jsonObject(existing.config);
  const credentials = existingCredentials(existing.config);
  const encryptedRefreshToken = stringValue(credentials.refreshToken);

  if (!encryptedRefreshToken) {
    return {
      ok: false,
      message:
        "Connect Bing Ads OAuth before refreshing options.",
      savedAt: null,
      connected: existing.status === "CONNECTED",
    };
  }

  let developerToken: string;
  let refreshToken: string;
  let accessToken: string;

  try {
    developerToken =
      secretCredentialOrEnv({
        credentials,
        envKey: "MICROSOFT_ADS_DEVELOPER_TOKEN",
        key: "developerToken",
      }) ?? "";
    if (!developerToken) {
      throw new Error(
        "Add a Bing Ads developer token in env or advanced setup before refreshing options.",
      );
    }
    refreshToken = decryptSecret(encryptedRefreshToken);
    accessToken = await microsoftAdsAccessToken({
      refreshToken,
      storedConfig: existing.config,
    });
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Bing Ads credentials could not be decrypted or refreshed.",
      savedAt: null,
      connected: existing.status === "CONNECTED",
    };
  }

  let userPayload: Record<string, unknown>;

  try {
    userPayload = await getMicrosoftAdsCurrentUser({
      accessToken,
      developerToken,
    });
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Bing Ads user lookup failed.",
      savedAt: null,
      connected: existing.status === "CONNECTED",
    };
  }

  const userId = stringOrNumberValue(jsonObject(userPayload.User).Id);

  if (!userId) {
    return {
      ok: false,
      message: "Bing Ads user lookup did not return a user ID.",
      savedAt: null,
      connected: existing.status === "CONNECTED",
    };
  }

  let accountPayload: Record<string, unknown>;

  try {
    accountPayload = await searchMicrosoftAdsAccounts({
      accessToken,
      developerToken,
      userId,
    });
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Bing Ads account option refresh failed.",
      savedAt: null,
      connected: existing.status === "CONNECTED",
    };
  }

  const configuredCustomerId = stringValue(currentConfig.customerId);
  const configuredAccountId = stringValue(currentConfig.accountId);
  const configuredManagerAccountId = stringValue(currentConfig.managerAccountId);
  const configuredAccountName = stringValue(currentConfig.accountName);
  const accountsById = new Map<string, ProviderSelectorOption>();
  const managerAccountsById = new Map<string, ProviderSelectorOption>();
  const customerIdByAccountId = new Map<string, string>();

  for (const item of jsonArray(userPayload.CustomerRoles)) {
    const role = jsonObject(item);
    const option = microsoftAdsCustomerRoleOption(role);
    const customerId = option?.id;
    if (!customerId) continue;

    managerAccountsById.set(customerId, option);

    for (const accountId of [
      ...jsonArray(role.AccountIds),
      ...jsonArray(role.LinkedAccountIds),
    ]) {
      const id = stringOrNumberValue(accountId);
      if (id) customerIdByAccountId.set(id, customerId);
    }
  }

  for (const item of jsonArray(accountPayload.Accounts)) {
    const row = jsonObject(item);
    const option = microsoftAdsAccountOption(row);
    if (!option) continue;

    accountsById.set(option.id, option);

    const parentCustomerId =
      stringOrNumberValue(row.ParentCustomerId) || stringOrNumberValue(row.BillToCustomerId);
    if (parentCustomerId) {
      customerIdByAccountId.set(option.id, parentCustomerId);

      if (!managerAccountsById.has(parentCustomerId)) {
        managerAccountsById.set(parentCustomerId, {
          id: parentCustomerId,
          name: null,
          description: "Parent customer",
        });
      }
    }
  }

  if (configuredCustomerId) {
    managerAccountsById.set(configuredCustomerId, {
      id: configuredCustomerId,
      name: null,
      description: "Configured customer",
    });
  }

  if (configuredManagerAccountId) {
    managerAccountsById.set(configuredManagerAccountId, {
      id: configuredManagerAccountId,
      name: null,
      description: "Configured manager account",
    });
  }

  if (configuredAccountId) {
    accountsById.set(configuredAccountId, {
      id: configuredAccountId,
      name: configuredAccountName,
      description: "Configured account",
    });

    if (configuredCustomerId) {
      customerIdByAccountId.set(configuredAccountId, configuredCustomerId);
    }
  }

  const uetTagsById = new Map<string, ProviderSelectorOption>();
  const conversionGoalsById = new Map<string, ProviderSelectorOption>();
  const accountIdsForMetadata = [
    ...(configuredAccountId ? [configuredAccountId] : []),
    ...Array.from(accountsById.keys()).filter((id) => id !== configuredAccountId),
  ];
  let uetTagErrorCount = 0;
  let conversionGoalErrorCount = 0;
  let missingCustomerCount = 0;

  for (const accountId of accountIdsForMetadata.slice(0, 10)) {
    const customerId =
      customerIdByAccountId.get(accountId) ||
      configuredCustomerId ||
      configuredManagerAccountId;

    if (!customerId) {
      missingCustomerCount += 1;
      continue;
    }

    try {
      const payload = await getMicrosoftAdsUetTags({
        accessToken,
        accountId,
        customerId,
        developerToken,
      });

      for (const item of jsonArray(payload.UetTags)) {
        const option = microsoftAdsUetTagOption(jsonObject(item));
        if (option) uetTagsById.set(option.id, option);
      }
    } catch {
      uetTagErrorCount += 1;
    }

    try {
      const payload = await getMicrosoftAdsConversionGoals({
        accessToken,
        accountId,
        customerId,
        developerToken,
      });
      const accountOption = accountsById.get(accountId) ?? null;

      for (const item of jsonArray(payload.ConversionGoals)) {
        const option = microsoftAdsConversionGoalOption(
          jsonObject(item),
          accountOption,
        );
        if (option?.status === "Deleted") continue;
        if (option) conversionGoalsById.set(option.id, option);
      }
    } catch {
      conversionGoalErrorCount += 1;
    }
  }

  const selectorOptions = {
    ...(marketingProviderSelectorOptionsFromConfig(existing.config) ?? {}),
    accounts: sortedSelectorOptions(accountsById.values()),
    managerAccounts: sortedSelectorOptions(managerAccountsById.values()),
    uetTags: sortedSelectorOptions(uetTagsById.values()),
    conversionGoals: sortedSelectorOptions(conversionGoalsById.values()),
  };
  const autoMap = autoMapProviderConfig({
    currentConfig,
    provider: "bing-ads",
    selectorOptions,
  });
  const nextConfig = withConfiguredMarketingProviderSelections("bing-ads", {
    ...autoMap.config,
    selectorOptions,
  });

  await prisma.integrationConnection.update({
    where: { provider: marketingIntegrationProviders.bingAds },
    data: {
      config: marketingConfigJson(nextConfig),
    },
  });

  const remappedUploads = await remapPendingUploadsForSavedConfig({
    config: nextConfig as BingAdsConfig,
    provider: "bing-ads",
  });

  revalidatePath("/settings/integrations");
  revalidatePath("/settings/integrations/bing-ads");

  const warningMessages = [
    missingCustomerCount
      ? ` Customer IDs were missing for ${missingCustomerCount} account${missingCustomerCount === 1 ? "" : "s"}.`
      : "",
    uetTagErrorCount
      ? ` UET tag lookup skipped for ${uetTagErrorCount} account${uetTagErrorCount === 1 ? "" : "s"}.`
      : "",
    conversionGoalErrorCount
      ? ` Conversion goal lookup skipped for ${conversionGoalErrorCount} account${conversionGoalErrorCount === 1 ? "" : "s"}.`
      : "",
  ].join("");

  return {
    ok: true,
    message: `Bing Ads options refreshed: ${selectorOptions.accounts.length} account${selectorOptions.accounts.length === 1 ? "" : "s"}, ${selectorOptions.managerAccounts.length} customer${selectorOptions.managerAccounts.length === 1 ? "" : "s"}, ${selectorOptions.uetTags.length} UET tag${selectorOptions.uetTags.length === 1 ? "" : "s"} and ${selectorOptions.conversionGoals.length} conversion goal${selectorOptions.conversionGoals.length === 1 ? "" : "s"}.${warningMessages}${autoMapSummary(autoMap.mappedFields)}${remappedUploadMessage(remappedUploads)}`,
    savedAt: Date.now(),
    connected: existing.status === "CONNECTED",
  };
}

export async function updateGoogleAnalyticsIntegrationAction(
  _: MarketingIntegrationActionState,
  formData: FormData,
): Promise<MarketingIntegrationActionState> {
  await requireAdmin();
  const existing = await prisma.integrationConnection.findUnique({
    where: { provider: marketingIntegrationProviders.googleAnalytics },
    select: { config: true },
  });

  const parsed = googleAnalyticsConfigSchema.safeParse({
    measurementId: formData.get("measurementId"),
    propertyId: formData.get("propertyId"),
    dataStreamName: formData.get("dataStreamName"),
    primaryConversionEvent: formData.get("primaryConversionEvent"),
    callConversionEvent: formData.get("callConversionEvent"),
    matchedEventNames: formData.get("matchedEventNames"),
    importAnalyticsReportingEnabled:
      formData.get("importAnalyticsReportingEnabled") === "on",
  });

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ??
        "Enter valid Google Analytics settings.",
      savedAt: null,
      connected: false,
    };
  }

  let credentials: Record<string, unknown> | null;

  try {
    credentials = mergeEncryptedCredentials({
      existingConfig: existing?.config,
      fields: [
        {
          key: "oauthClientId",
          value: String(formData.get("oauthClientId") ?? "").trim(),
        },
        {
          key: "oauthClientSecret",
          value: String(formData.get("oauthClientSecret") ?? "").trim(),
        },
        {
          key: "refreshToken",
          value: String(formData.get("refreshToken") ?? "").trim(),
        },
      ],
    });
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Could not save Google Analytics credentials.",
      savedAt: null,
      connected: false,
    };
  }

  const nextConfig = {
    ...parsed.data,
    ...preservedProviderRuntimeConfig(existing?.config),
    ...(credentials ? { credentials } : {}),
  };

  await prisma.integrationConnection.upsert({
    where: { provider: marketingIntegrationProviders.googleAnalytics },
    update: {
      name: "Google Analytics",
      description:
        "GA4 visitor and event matching for CRM attribution reporting.",
      status: "CONNECTED",
      config: marketingConfigJson(nextConfig),
    },
    create: {
      provider: marketingIntegrationProviders.googleAnalytics,
      name: "Google Analytics",
      description:
        "GA4 visitor and event matching for CRM attribution reporting.",
      status: "CONNECTED",
      config: marketingConfigJson(nextConfig),
    },
  });

  revalidatePath("/settings/integrations");
  revalidatePath("/settings/integrations/google-analytics");

  return {
    ok: true,
    message: "Google Analytics settings saved.",
    savedAt: Date.now(),
    connected: true,
  };
}

export async function updateGoogleSearchConsoleIntegrationAction(
  _: MarketingIntegrationActionState,
  formData: FormData,
): Promise<MarketingIntegrationActionState> {
  await requireAdmin();

  const parsed = googleSearchConsoleConfigSchema.safeParse({
    siteUrl: formData.get("siteUrl"),
    propertyName: formData.get("propertyName"),
    searchType: formData.get("searchType") || "web",
    dimensions: formData.get("dimensions"),
    importSearchPerformanceEnabled:
      formData.get("importSearchPerformanceEnabled") === "on",
  });

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ??
        "Enter valid Google Search Console settings.",
      savedAt: null,
      connected: false,
    };
  }

  const existing = await prisma.integrationConnection.findUnique({
    where: { provider: marketingIntegrationProviders.googleSearchConsole },
    select: { config: true },
  });
  let credentials: Record<string, unknown> | null;

  try {
    credentials = mergeEncryptedCredentials({
      existingConfig: existing?.config,
      fields: [
        {
          key: "oauthClientId",
          value: String(formData.get("oauthClientId") ?? "").trim(),
        },
        {
          key: "oauthClientSecret",
          value: String(formData.get("oauthClientSecret") ?? "").trim(),
        },
        {
          key: "refreshToken",
          value: String(formData.get("refreshToken") ?? "").trim(),
        },
      ],
    });
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Could not save Google Search Console credentials.",
      savedAt: null,
      connected: false,
    };
  }

  const nextConfig = {
    ...parsed.data,
    ...preservedProviderRuntimeConfig(existing?.config),
    ...(credentials ? { credentials } : {}),
  };
  const connected =
    Boolean(authBrokerConnectionId(nextConfig)) ||
    Boolean(jsonObject(nextConfig.credentials).refreshToken);

  await prisma.integrationConnection.upsert({
    where: { provider: marketingIntegrationProviders.googleSearchConsole },
    update: {
      name: "Google Search Console",
      description:
        "Organic search query and landing-page performance for SEO attribution.",
      status: connected ? "CONNECTED" : "NOT_CONNECTED",
      config: marketingConfigJson(nextConfig),
    },
    create: {
      provider: marketingIntegrationProviders.googleSearchConsole,
      name: "Google Search Console",
      description:
        "Organic search query and landing-page performance for SEO attribution.",
      status: connected ? "CONNECTED" : "NOT_CONNECTED",
      config: marketingConfigJson(nextConfig),
    },
  });

  revalidatePath("/settings/integrations");
  revalidatePath("/settings/integrations/google-search-console");

  return {
    ok: true,
    message: connected
      ? "Google Search Console settings saved."
      : "Google Search Console property saved. Connect through iD30 Auth before organic performance imports can run.",
    savedAt: Date.now(),
    connected,
  };
}

export async function refreshGoogleSearchConsoleSelectorOptionsAction(
  previousState: MarketingIntegrationActionState,
): Promise<MarketingIntegrationActionState> {
  void previousState;
  await requireAdmin();

  const existing = await prisma.integrationConnection.findUnique({
    where: { provider: marketingIntegrationProviders.googleSearchConsole },
    select: { config: true, status: true },
  });

  if (!existing) {
    return {
      ok: false,
      message: "Connect Google Search Console before refreshing site options.",
      savedAt: null,
      connected: false,
    };
  }

  const currentConfig = jsonObject(existing.config);
  const connectionId = authBrokerConnectionId(currentConfig);

  if (connectionId) {
    const result = await refreshMarketingAuthBrokerSelectors({ connectionId });

    if (!result.ok) {
      return {
        ok: false,
        message: authBrokerSelectorRefreshError(
          "Google Search Console",
          result.message,
        ),
        savedAt: null,
        connected: existing.status === "CONNECTED",
      };
    }

    const now = new Date().toISOString();
    const selectorOptions = {
      ...jsonObject(currentConfig.selectorOptions),
      ...result.selectorOptions,
    };
    const currentSiteUrl = stringValue(currentConfig.siteUrl);
    const sites = sortedSelectorOptions(
      jsonArray(selectorOptions.sites).filter(
        (option): option is ProviderSelectorOption =>
          Boolean(option) &&
          typeof option === "object" &&
          !Array.isArray(option) &&
          typeof (option as Record<string, unknown>).id === "string",
      ),
    );
    const singleSite = sites.length === 1 ? sites[0] : null;
    const authBroker = jsonObject(currentConfig.authBroker);
    const nextStatus = result.connection.reconnectRequired
      ? "reconnect_required"
      : result.connection.status;
    const nextConfig = {
      ...currentConfig,
      ...(currentSiteUrl || !singleSite
        ? {}
        : {
            propertyName: singleSite.name,
            siteUrl: singleSite.id,
          }),
      selectorOptions: {
        ...selectorOptions,
        sites,
      },
      authBroker: {
        ...authBroker,
        lastError: result.connection.lastError ?? null,
        lastSelectorSyncAt: now,
        lastStatusAt: now,
        status: nextStatus,
      },
    };
    const parsed = googleSearchConsoleConfigSchema.safeParse(nextConfig);

    await prisma.integrationConnection.update({
      where: { provider: marketingIntegrationProviders.googleSearchConsole },
      data: {
        status: result.connection.reconnectRequired
          ? "ERROR"
          : parsed.success
            ? "CONNECTED"
            : existing.status,
        config: marketingConfigJson(nextConfig),
      },
    });

    revalidatePath("/settings/integrations");
    revalidatePath("/settings/integrations/google-search-console");

    if (result.connection.reconnectRequired) {
      return {
        ok: false,
        message:
          result.connection.lastError ||
          "Google Search Console needs to be reconnected in iD30 Auth.",
        savedAt: null,
        connected: false,
      };
    }

    return {
      ok: true,
      message: `Google Search Console options refreshed: ${sites.length} site${sites.length === 1 ? "" : "s"}.${singleSite && !currentSiteUrl ? " Auto-mapped search property." : ""}`,
      savedAt: Date.now(),
      connected: parsed.success || existing.status === "CONNECTED",
    };
  }

  const credentials = existingCredentials(existing.config);
  const encryptedRefreshToken = stringValue(credentials.refreshToken);

  if (!hasCredentialEncryptionKey()) {
    return {
      ok: false,
      message:
        "Set CREDENTIAL_ENCRYPTION_KEY before refreshing Google Search Console options.",
      savedAt: null,
      connected: false,
    };
  }

  if (!encryptedRefreshToken) {
    return {
      ok: false,
      message:
        "Connect Google Search Console OAuth before refreshing site options.",
      savedAt: null,
      connected: existing.status === "CONNECTED",
    };
  }

  const accessToken = await googleSearchConsoleAccessToken({
    refreshToken: decryptSecret(encryptedRefreshToken),
    storedConfig: existing.config,
  });
  const sites = await listGoogleSearchConsoleSites(accessToken);
  const selectorOptions = {
    ...jsonObject(currentConfig.selectorOptions),
    sites: sortedSelectorOptions(sites),
  };
  const currentSiteUrl = stringValue(currentConfig.siteUrl);
  const singleSite = selectorOptions.sites.length === 1 ? selectorOptions.sites[0] : null;
  const nextConfig = {
    ...currentConfig,
    ...(currentSiteUrl || !singleSite
      ? {}
      : {
          propertyName: singleSite.name,
          siteUrl: singleSite.id,
        }),
    selectorOptions,
  };
  const parsed = googleSearchConsoleConfigSchema.safeParse(nextConfig);

  await prisma.integrationConnection.update({
    where: { provider: marketingIntegrationProviders.googleSearchConsole },
    data: {
      status: parsed.success ? "CONNECTED" : existing.status,
      config: marketingConfigJson(nextConfig),
    },
  });

  revalidatePath("/settings/integrations");
  revalidatePath("/settings/integrations/google-search-console");

  return {
    ok: true,
    message: `Google Search Console options refreshed: ${selectorOptions.sites.length} site${selectorOptions.sites.length === 1 ? "" : "s"}.${singleSite && !currentSiteUrl ? " Auto-mapped search property." : ""}`,
    savedAt: Date.now(),
    connected: parsed.success || existing.status === "CONNECTED",
  };
}

export async function updateKlaviyoIntegrationAction(
  _: MarketingIntegrationActionState,
  formData: FormData,
): Promise<MarketingIntegrationActionState> {
  await requireAdmin();

  const parsed = klaviyoConfigSchema.safeParse({
    accountId: formData.get("accountId"),
    accountName: formData.get("accountName"),
    defaultListId: formData.get("defaultListId"),
    defaultListName: formData.get("defaultListName"),
    attributionEventNames: formData.get("attributionEventNames"),
    importCampaignPerformanceEnabled:
      formData.get("importCampaignPerformanceEnabled") === "on",
    importFlowPerformanceEnabled:
      formData.get("importFlowPerformanceEnabled") === "on",
    importProfileEventsEnabled:
      formData.get("importProfileEventsEnabled") === "on",
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Enter valid Klaviyo settings.",
      savedAt: null,
      connected: false,
    };
  }

  const existing = await prisma.integrationConnection.findUnique({
    where: { provider: marketingIntegrationProviders.klaviyo },
    select: { config: true },
  });
  let credentials: Record<string, unknown> | null;

  try {
    credentials = mergeEncryptedCredentials({
      existingConfig: existing?.config,
      fields: [
        {
          key: "privateApiKey",
          value: String(formData.get("privateApiKey") ?? "").trim(),
        },
      ],
    });
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Could not save Klaviyo credentials.",
      savedAt: null,
      connected: false,
    };
  }

  const nextConfig = {
    ...parsed.data,
    ...preservedProviderRuntimeConfig(existing?.config),
    ...(credentials ? { credentials } : {}),
  };
  const apiAccessConnected =
    Boolean(authBrokerConnectionId(nextConfig)) ||
    Boolean(jsonObject(nextConfig.credentials).privateApiKey) ||
    Boolean(process.env.KLAVIYO_PRIVATE_API_KEY);
  const connected = Boolean(apiAccessConnected && parsed.data.accountId);

  await prisma.integrationConnection.upsert({
    where: { provider: marketingIntegrationProviders.klaviyo },
    update: {
      name: "Klaviyo",
      description:
        "Email, SMS and lifecycle automation data for CRM marketing attribution.",
      status: connected ? "CONNECTED" : "NOT_CONNECTED",
      config: marketingConfigJson(nextConfig),
    },
    create: {
      provider: marketingIntegrationProviders.klaviyo,
      name: "Klaviyo",
      description:
        "Email, SMS and lifecycle automation data for CRM marketing attribution.",
      status: connected ? "CONNECTED" : "NOT_CONNECTED",
      config: marketingConfigJson(nextConfig),
    },
  });

  revalidatePath("/settings/integrations");
  revalidatePath("/settings/integrations/klaviyo");

  return {
    ok: true,
    message: connected
      ? "Klaviyo settings saved."
      : apiAccessConnected
        ? "Klaviyo access saved. Refresh options and save the account mapping next."
        : "Klaviyo settings saved. Connect through iD30 Auth before refreshing options.",
    savedAt: Date.now(),
    connected,
  };
}

export async function refreshKlaviyoSelectorOptionsAction(
  previousState: MarketingIntegrationActionState,
): Promise<MarketingIntegrationActionState> {
  void previousState;
  await requireAdmin();

  const existing = await prisma.integrationConnection.findUnique({
    where: { provider: marketingIntegrationProviders.klaviyo },
    select: { config: true, status: true },
  });

  if (!existing) {
    return {
      ok: false,
      message: "Save Klaviyo settings before refreshing options.",
      savedAt: null,
      connected: false,
    };
  }

  const currentConfig = jsonObject(existing.config);
  const connectionId = authBrokerConnectionId(currentConfig);

  if (connectionId) {
    const result = await refreshMarketingAuthBrokerSelectors({ connectionId });

    if (!result.ok) {
      return {
        ok: false,
        message: authBrokerSelectorRefreshError("Klaviyo", result.message),
        savedAt: null,
        connected: existing.status === "CONNECTED",
      };
    }

    const now = new Date().toISOString();
    const selectorOptions = {
      ...jsonObject(currentConfig.selectorOptions),
      ...result.selectorOptions,
    };
    const accountOptions = selectorOptionList(selectorOptions.accounts);
    const listOptions = selectorOptionList(selectorOptions.lists);
    const singleAccount = accountOptions.length === 1 ? accountOptions[0] : null;
    const singleList = listOptions.length === 1 ? listOptions[0] : null;
    const authBroker = jsonObject(currentConfig.authBroker);
    const nextStatus = result.connection.reconnectRequired
      ? "reconnect_required"
      : result.connection.status;
    const nextConfig = {
      ...currentConfig,
      ...(stringValue(currentConfig.accountId) || !singleAccount
        ? {}
        : {
            accountId: singleAccount.id,
            accountName: singleAccount.name ?? singleAccount.id,
          }),
      ...(stringValue(currentConfig.defaultListId) || !singleList
        ? {}
        : {
            defaultListId: singleList.id,
            defaultListName: singleList.name ?? singleList.id,
          }),
      selectorOptions: {
        ...selectorOptions,
        accounts: accountOptions,
        lists: listOptions,
        campaigns: selectorOptionList(selectorOptions.campaigns),
        events: selectorOptionList(selectorOptions.events),
        flows: selectorOptionList(selectorOptions.flows),
        forms: selectorOptionList(selectorOptions.forms),
        segments: selectorOptionList(selectorOptions.segments),
      },
      authBroker: {
        ...authBroker,
        lastError: result.connection.lastError ?? null,
        lastSelectorSyncAt: now,
        lastStatusAt: now,
        status: nextStatus,
      },
    };
    const parsed = klaviyoConfigSchema.safeParse(nextConfig);
    const accountMapped = Boolean(stringValue(nextConfig.accountId));
    const nextSelectorOptions = jsonObject(nextConfig.selectorOptions);

    await prisma.integrationConnection.update({
      where: { provider: marketingIntegrationProviders.klaviyo },
      data: {
        status: result.connection.reconnectRequired
          ? "ERROR"
          : parsed.success && accountMapped
            ? "CONNECTED"
            : existing.status,
        config: marketingConfigJson(nextConfig),
      },
    });

    revalidatePath("/settings/integrations");
    revalidatePath("/settings/integrations/klaviyo");

    if (result.connection.reconnectRequired) {
      return {
        ok: false,
        message:
          result.connection.lastError ||
          "Klaviyo needs to be reconnected in iD30 Auth.",
        savedAt: null,
        connected: false,
      };
    }

    return {
      ok: true,
      message: `${selectorRefreshSummary("Klaviyo", nextSelectorOptions)}${singleAccount && !stringValue(currentConfig.accountId) ? " Auto-mapped account." : ""}${singleList && !stringValue(currentConfig.defaultListId) ? " Auto-mapped list." : ""}`,
      savedAt: Date.now(),
      connected:
        (parsed.success && accountMapped) || existing.status === "CONNECTED",
    };
  }

  if (!hasCredentialEncryptionKey() && !process.env.KLAVIYO_PRIVATE_API_KEY) {
    return {
      ok: false,
      message: "Set CREDENTIAL_ENCRYPTION_KEY or KLAVIYO_PRIVATE_API_KEY before refreshing Klaviyo options.",
      savedAt: null,
      connected: false,
    };
  }

  const apiKey = klaviyoApiKey(existing.config);
  if (!apiKey) {
    return {
      ok: false,
      message: "Add a Klaviyo private API key before refreshing options.",
      savedAt: null,
      connected: existing.status === "CONNECTED",
    };
  }

  const [accounts, lists, campaigns, flows, forms, segments, metrics] = await Promise.all([
    fetchKlaviyoList({ apiKey, maxItems: 20, path: "accounts/?page[size]=20" }),
    fetchKlaviyoList({ apiKey, maxItems: 50, path: "lists/?page[size]=10" }),
    fetchKlaviyoCampaigns(apiKey),
    fetchKlaviyoList({ apiKey, maxItems: 50, path: "flows/?page[size]=50" }),
    fetchKlaviyoList({ apiKey, maxItems: 50, path: "forms/?page[size]=50" }),
    fetchKlaviyoList({ apiKey, maxItems: 50, path: "segments/?page[size]=10" }),
    fetchKlaviyoList({ apiKey, maxItems: 250, path: "metrics/?page[size]=100" }),
  ]);
  const accountOptions = sortedSelectorOptions(
    accounts.map(klaviyoAccountOption).filter(Boolean) as ProviderSelectorOption[],
  );
  const listOptions = sortedSelectorOptions(
    lists.map(klaviyoOption).filter(Boolean) as ProviderSelectorOption[],
  );
  const selectorOptions = {
    ...jsonObject(currentConfig.selectorOptions),
    accounts: accountOptions,
    campaigns: sortedSelectorOptions(
      campaigns.map(klaviyoOption).filter(Boolean) as ProviderSelectorOption[],
    ),
    flows: sortedSelectorOptions(
      flows.map(klaviyoOption).filter(Boolean) as ProviderSelectorOption[],
    ),
    forms: sortedSelectorOptions(
      forms.map(klaviyoOption).filter(Boolean) as ProviderSelectorOption[],
    ),
    events: sortedSelectorOptions(
      metrics.map(klaviyoOption).filter(Boolean) as ProviderSelectorOption[],
    ),
    lists: listOptions,
    segments: sortedSelectorOptions(
      segments.map(klaviyoOption).filter(Boolean) as ProviderSelectorOption[],
    ),
  };
  const singleAccount = accountOptions.length === 1 ? accountOptions[0] : null;
  const singleList = listOptions.length === 1 ? listOptions[0] : null;
  const nextConfig = {
    ...currentConfig,
    ...(stringValue(currentConfig.accountId) || !singleAccount
      ? {}
      : {
          accountId: singleAccount.id,
          accountName: singleAccount.name ?? singleAccount.id,
        }),
    ...(stringValue(currentConfig.defaultListId) || !singleList
      ? {}
      : {
          defaultListId: singleList.id,
          defaultListName: singleList.name ?? singleList.id,
        }),
    selectorOptions,
  };
  const parsed = klaviyoConfigSchema.safeParse(nextConfig);
  const accountMapped = Boolean(stringValue(nextConfig.accountId));

  await prisma.integrationConnection.update({
    where: { provider: marketingIntegrationProviders.klaviyo },
    data: {
      status: parsed.success && accountMapped ? "CONNECTED" : existing.status,
      config: marketingConfigJson(nextConfig),
    },
  });

  revalidatePath("/settings/integrations");
  revalidatePath("/settings/integrations/klaviyo");

  return {
    ok: true,
    message: `Klaviyo options refreshed: ${accountOptions.length} account${accountOptions.length === 1 ? "" : "s"}, ${listOptions.length} list${listOptions.length === 1 ? "" : "s"}, ${selectorOptions.campaigns.length} campaign${selectorOptions.campaigns.length === 1 ? "" : "s"}, ${selectorOptions.flows.length} flow${selectorOptions.flows.length === 1 ? "" : "s"}, ${selectorOptions.events.length} metric${selectorOptions.events.length === 1 ? "" : "s"}, ${selectorOptions.forms.length} form${selectorOptions.forms.length === 1 ? "" : "s"} and ${selectorOptions.segments.length} segment${selectorOptions.segments.length === 1 ? "" : "s"}.${singleAccount && !stringValue(currentConfig.accountId) ? " Auto-mapped account." : ""}${singleList && !stringValue(currentConfig.defaultListId) ? " Auto-mapped list." : ""}`,
    savedAt: Date.now(),
    connected:
      (parsed.success && accountMapped) || existing.status === "CONNECTED",
  };
}

export async function updateGoogleAdsIntegrationAction(
  _: MarketingIntegrationActionState,
  formData: FormData,
): Promise<MarketingIntegrationActionState> {
  await requireAdmin();

  const existing = await prisma.integrationConnection.findUnique({
    where: { provider: marketingIntegrationProviders.googleAds },
    select: { config: true },
  });
  const configCandidate = providerFormConfigCandidate({
    existingConfig: existing?.config,
    provider: "google-ads",
    values: {
      customerId: formData.get("customerId"),
      managerCustomerId: formData.get("managerCustomerId"),
      accountName: formData.get("accountName"),
      leadConversionActionId: formData.get("leadConversionActionId"),
      callConversionActionId: formData.get("callConversionActionId"),
      importCostEnabled: formData.get("importCostEnabled") === "on",
      uploadOfflineConversionsEnabled:
        formData.get("uploadOfflineConversionsEnabled") === "on",
      trackedClickIds: formData.get("trackedClickIds"),
    },
  });
  const parsed = googleAdsConfigSchema.safeParse(configCandidate);

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Enter valid Google Ads settings.",
      savedAt: null,
      connected: false,
    };
  }

  let credentials: Record<string, unknown> | null;

  try {
    credentials = mergeEncryptedCredentials({
      existingConfig: existing?.config,
      fields: [
        {
          key: "developerToken",
          value: String(formData.get("developerToken") ?? "").trim(),
        },
        {
          key: "oauthClientId",
          value: String(formData.get("oauthClientId") ?? "").trim(),
        },
        {
          key: "oauthClientSecret",
          value: String(formData.get("oauthClientSecret") ?? "").trim(),
        },
        {
          key: "refreshToken",
          value: String(formData.get("refreshToken") ?? "").trim(),
        },
      ],
    });
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Could not save Google Ads credentials.",
      savedAt: null,
      connected: false,
    };
  }

  const authBrokerReady = await marketingAuthBrokerConfigured();
  const missingCredentialMessage =
    parsed.data.uploadOfflineConversionsEnabled && !authBrokerReady
      ? paidSearchUploadCredentialError("Google Ads", "google-ads", credentials)
    : null;

  if (missingCredentialMessage) {
    return {
      ok: false,
      message: missingCredentialMessage,
      savedAt: null,
      connected: false,
    };
  }

  const nextConfig = withConfiguredMarketingProviderSelections("google-ads", {
    ...parsed.data,
    ...preservedProviderRuntimeConfig(existing?.config),
    ...(credentials ? { credentials } : {}),
  });

  await prisma.integrationConnection.upsert({
    where: { provider: marketingIntegrationProviders.googleAds },
    update: {
      name: "Google Ads",
      description:
        "Campaign cost and offline conversion mapping for CRM attribution.",
      status: "CONNECTED",
      config: marketingConfigJson(nextConfig),
    },
    create: {
      provider: marketingIntegrationProviders.googleAds,
      name: "Google Ads",
      description:
        "Campaign cost and offline conversion mapping for CRM attribution.",
      status: "CONNECTED",
      config: marketingConfigJson(nextConfig),
    },
  });

  const remappedUploads = await remapPendingUploadsForSavedConfig({
    config: parsed.data,
    provider: "google-ads",
  });

  revalidatePath("/settings/integrations");
  revalidatePath("/settings/integrations/google-ads");

  return {
    ok: true,
    message: `Google Ads settings saved.${remappedUploadMessage(remappedUploads)}`,
    savedAt: Date.now(),
    connected: true,
  };
}

export async function refreshGoogleAdsSelectorOptionsAction(
  previousState: MarketingIntegrationActionState,
): Promise<MarketingIntegrationActionState> {
  void previousState;
  await requireAdmin();

  const existing = await prisma.integrationConnection.findUnique({
    where: { provider: marketingIntegrationProviders.googleAds },
    select: { config: true, status: true },
  });

  if (!existing) {
    return {
      ok: false,
      message: "Save Google Ads settings before refreshing options.",
      savedAt: null,
      connected: false,
    };
  }

  const authBrokerResult = await refreshAuthBrokerSelectorOptions({
    existing,
    provider: marketingIntegrationProviders.googleAds,
    providerName: "Google Ads",
    revalidateSlug: "google-ads",
  });

  if (authBrokerResult) return authBrokerResult;

  if (!hasCredentialEncryptionKey()) {
    return {
      ok: false,
      message: "Set CREDENTIAL_ENCRYPTION_KEY before refreshing Google Ads options.",
      savedAt: null,
      connected: false,
    };
  }

  const currentConfig = jsonObject(existing.config);
  const credentials = existingCredentials(existing.config);
  const encryptedRefreshToken = stringValue(credentials.refreshToken);

  if (!encryptedRefreshToken) {
    return {
      ok: false,
      message:
        "Connect Google Ads OAuth before refreshing options.",
      savedAt: null,
      connected: existing.status === "CONNECTED",
    };
  }

  let developerToken: string;
  let refreshToken: string;
  let accessToken: string;

  try {
    developerToken =
      secretCredentialOrEnv({
        credentials,
        envKey: "GOOGLE_ADS_DEVELOPER_TOKEN",
        key: "developerToken",
      }) ?? "";
    if (!developerToken) {
      throw new Error(
        "Add a Google Ads developer token in env or advanced setup before refreshing options.",
      );
    }
    refreshToken = decryptSecret(encryptedRefreshToken);
    accessToken = await googleAdsAccessToken({
      refreshToken,
      storedConfig: existing.config,
    });
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Google Ads credentials could not be decrypted or refreshed.",
      savedAt: null,
      connected: existing.status === "CONNECTED",
    };
  }

  let accessibleCustomerIds: string[];

  try {
    accessibleCustomerIds = await listGoogleAdsAccessibleCustomers({
      accessToken,
      developerToken,
    });
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Google Ads account option refresh failed.",
      savedAt: null,
      connected: existing.status === "CONNECTED",
    };
  }

  const configuredCustomerId = stringValue(currentConfig.customerId);
  const configuredManagerCustomerId = stringValue(currentConfig.managerCustomerId);
  const configuredAccountName = stringValue(currentConfig.accountName);
  const rootCustomerIds = new Set(accessibleCustomerIds);

  if (configuredCustomerId) rootCustomerIds.add(googleAdsCustomerId(configuredCustomerId));
  if (configuredManagerCustomerId) {
    rootCustomerIds.add(googleAdsCustomerId(configuredManagerCustomerId));
  }

  const accountsById = new Map<string, ProviderSelectorOption>();
  const managerAccountsById = new Map<string, ProviderSelectorOption>();
  const loginCustomerIdByAccountId = new Map<string, string>();

  for (const customerId of accessibleCustomerIds) {
    let rootAccount: ProviderSelectorOption = {
      id: customerId,
      name: null,
      description: "Accessible customer",
    };

    try {
      rootAccount =
        (await fetchGoogleAdsCustomerOption({
          accessToken,
          customerId,
          developerToken,
        })) ?? rootAccount;
    } catch {
      // Keep the accessible-customer fallback when Google will not expose details.
    }

    accountsById.set(rootAccount.id, rootAccount);
  }

  if (configuredCustomerId) {
    const id = googleAdsCustomerId(configuredCustomerId);
    accountsById.set(id, {
      id,
      name: configuredAccountName,
      description: "Configured customer",
    });
  }

  if (configuredManagerCustomerId) {
    const id = googleAdsCustomerId(configuredManagerCustomerId);
    managerAccountsById.set(id, {
      id,
      name: null,
      description: "Configured manager account",
    });
  }

  const customerClientQuery = `
    SELECT
      customer_client.client_customer,
      customer_client.currency_code,
      customer_client.descriptive_name,
      customer_client.hidden,
      customer_client.id,
      customer_client.manager,
      customer_client.status
    FROM customer_client
    WHERE customer_client.hidden = false
    LIMIT 200
  `;
  let customerLookupErrorCount = 0;

  for (const customerId of Array.from(rootCustomerIds).slice(0, 25)) {
    try {
      const rows = await googleAdsSearchStream({
        accessToken,
        customerId,
        developerToken,
        query: customerClientQuery,
      });

      for (const item of rows) {
        const row = jsonObject(item);
        const result = googleAdsCustomerClientOption(row);
        if (!result) continue;

        if (result.manager) {
          accountsById.delete(result.option.id);
          managerAccountsById.set(result.option.id, result.option);
        } else {
          accountsById.set(result.option.id, result.option);
        }

        if (customerId !== result.option.id) {
          loginCustomerIdByAccountId.set(result.option.id, customerId);
        }
      }
    } catch {
      customerLookupErrorCount += 1;
    }
  }

  const conversionActionsById = new Map<string, ProviderSelectorOption>();
  const configuredAccountId = configuredCustomerId
    ? googleAdsCustomerId(configuredCustomerId)
    : null;
  const conversionAccountIds = [
    ...(configuredAccountId ? [configuredAccountId] : []),
    ...Array.from(accountsById.keys()).filter((id) => id !== configuredAccountId),
  ];
  const conversionActionQuery = `
    SELECT
      conversion_action.id,
      conversion_action.name,
      conversion_action.status,
      conversion_action.type
    FROM conversion_action
    ORDER BY conversion_action.name
    LIMIT 100
  `;
  let conversionActionErrorCount = 0;

  for (const accountId of conversionAccountIds.slice(0, 10)) {
    const managerCustomerId =
      configuredManagerCustomerId &&
      googleAdsCustomerId(configuredManagerCustomerId) !== accountId
        ? configuredManagerCustomerId
        : loginCustomerIdByAccountId.get(accountId) ?? null;

    try {
      const rows = await googleAdsSearchStream({
        accessToken,
        customerId: accountId,
        developerToken,
        managerCustomerId,
        query: conversionActionQuery,
      });
      const accountOption = accountsById.get(accountId) ?? null;

      for (const item of rows) {
        const option = googleAdsConversionActionOption(jsonObject(item), accountOption);
        if (option?.status === "REMOVED") continue;
        if (option) conversionActionsById.set(option.id, option);
      }
    } catch {
      conversionActionErrorCount += 1;
    }
  }

  const selectorOptions = {
    ...(marketingProviderSelectorOptionsFromConfig(existing.config) ?? {}),
    accounts: sortedSelectorOptions(accountsById.values()),
    managerAccounts: sortedSelectorOptions(managerAccountsById.values()),
    conversionActions: sortedSelectorOptions(conversionActionsById.values()),
  };
  const autoMap = autoMapProviderConfig({
    currentConfig,
    provider: "google-ads",
    selectorOptions,
  });
  const nextConfig = withConfiguredMarketingProviderSelections("google-ads", {
    ...autoMap.config,
    selectorOptions,
  });

  await prisma.integrationConnection.update({
    where: { provider: marketingIntegrationProviders.googleAds },
    data: {
      config: marketingConfigJson(nextConfig),
    },
  });

  const remappedUploads = await remapPendingUploadsForSavedConfig({
    config: nextConfig as GoogleAdsConfig,
    provider: "google-ads",
  });

  revalidatePath("/settings/integrations");
  revalidatePath("/settings/integrations/google-ads");

  const warningMessages = [
    customerLookupErrorCount
      ? ` Customer lookup skipped for ${customerLookupErrorCount} customer${customerLookupErrorCount === 1 ? "" : "s"}.`
      : "",
    conversionActionErrorCount
      ? ` Conversion actions skipped for ${conversionActionErrorCount} account${conversionActionErrorCount === 1 ? "" : "s"}.`
      : "",
  ].join("");

  return {
    ok: true,
    message: `Google Ads options refreshed: ${selectorOptions.accounts.length} account${selectorOptions.accounts.length === 1 ? "" : "s"}, ${selectorOptions.managerAccounts.length} manager account${selectorOptions.managerAccounts.length === 1 ? "" : "s"} and ${selectorOptions.conversionActions.length} conversion action${selectorOptions.conversionActions.length === 1 ? "" : "s"}.${warningMessages}${autoMapSummary(autoMap.mappedFields)}${remappedUploadMessage(remappedUploads)}`,
    savedAt: Date.now(),
    connected: existing.status === "CONNECTED",
  };
}

export async function updateMetaIntegrationAction(
  _: MarketingIntegrationActionState,
  formData: FormData,
): Promise<MarketingIntegrationActionState> {
  await requireAdmin();

  const existing = await prisma.integrationConnection.findUnique({
    where: { provider: marketingIntegrationProviders.meta },
    select: { config: true },
  });
  const configCandidate = providerFormConfigCandidate({
    existingConfig: existing?.config,
    provider: "meta",
    values: {
      adAccountId: formData.get("adAccountId"),
      pixelId: formData.get("pixelId"),
      accountName: formData.get("accountName"),
      leadEventName: formData.get("leadEventName"),
      callEventName: formData.get("callEventName"),
      testEventCode: formData.get("testEventCode"),
      importCostEnabled: formData.get("importCostEnabled") === "on",
      uploadConversionsEnabled: formData.get("uploadConversionsEnabled") === "on",
      trackedClickIds: formData.get("trackedClickIds"),
    },
  });
  const parsed = metaConfigSchema.safeParse(configCandidate);

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Enter valid Meta settings.",
      savedAt: null,
      connected: false,
    };
  }

  let credentials: Record<string, unknown> | null;

  try {
    credentials = mergeEncryptedCredentials({
      existingConfig: existing?.config,
      fields: [
        {
          key: "accessToken",
          value: String(formData.get("accessToken") ?? "").trim(),
        },
        {
          key: "oauthClientId",
          value: String(formData.get("oauthClientId") ?? "").trim(),
        },
        {
          key: "oauthClientSecret",
          value: String(formData.get("oauthClientSecret") ?? "").trim(),
        },
      ],
    });
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Could not save Meta credentials.",
      savedAt: null,
      connected: false,
    };
  }

  const authBrokerReady = await marketingAuthBrokerConfigured();
  const missingCredentialMessage =
    parsed.data.uploadConversionsEnabled && !authBrokerReady
      ? credentialError("Meta", credentials, ["accessToken"])
    : null;

  if (missingCredentialMessage) {
    return {
      ok: false,
      message: missingCredentialMessage,
      savedAt: null,
      connected: false,
    };
  }

  const nextConfig = withConfiguredMarketingProviderSelections("meta", {
    ...parsed.data,
    ...preservedProviderRuntimeConfig(existing?.config),
    ...(credentials ? { credentials } : {}),
  });

  await prisma.integrationConnection.upsert({
    where: { provider: marketingIntegrationProviders.meta },
    update: {
      name: "Meta",
      description: "Meta ad account, pixel and conversion mapping for CRM attribution.",
      status: "CONNECTED",
      config: marketingConfigJson(nextConfig),
    },
    create: {
      provider: marketingIntegrationProviders.meta,
      name: "Meta",
      description: "Meta ad account, pixel and conversion mapping for CRM attribution.",
      status: "CONNECTED",
      config: marketingConfigJson(nextConfig),
    },
  });

  const remappedUploads = await remapPendingUploadsForSavedConfig({
    config: parsed.data,
    provider: "meta",
  });

  revalidatePath("/settings/integrations");
  revalidatePath("/settings/integrations/meta");

  return {
    ok: true,
    message: `Meta settings saved.${remappedUploadMessage(remappedUploads)}`,
    savedAt: Date.now(),
    connected: true,
  };
}

export async function refreshMetaSelectorOptionsAction(
  previousState: MarketingIntegrationActionState,
): Promise<MarketingIntegrationActionState> {
  void previousState;
  await requireAdmin();

  const existing = await prisma.integrationConnection.findUnique({
    where: { provider: marketingIntegrationProviders.meta },
    select: { config: true, status: true },
  });

  if (!existing) {
    return {
      ok: false,
      message: "Save Meta settings before refreshing options.",
      savedAt: null,
      connected: false,
    };
  }

  const authBrokerResult = await refreshAuthBrokerSelectorOptions({
    existing,
    provider: marketingIntegrationProviders.meta,
    providerName: "Meta",
    revalidateSlug: "meta",
  });

  if (authBrokerResult) return authBrokerResult;

  if (!hasCredentialEncryptionKey()) {
    return {
      ok: false,
      message: "Set CREDENTIAL_ENCRYPTION_KEY before refreshing Meta options.",
      savedAt: null,
      connected: false,
    };
  }

  const currentConfig = jsonObject(existing.config);
  const credentials = existingCredentials(existing.config);
  const encryptedAccessToken = stringValue(credentials.accessToken);

  if (!encryptedAccessToken) {
    return {
      ok: false,
      message: "Connect Meta OAuth or save an access token before refreshing options.",
      savedAt: null,
      connected: existing.status === "CONNECTED",
    };
  }

  let accessToken: string;

  try {
    accessToken = decryptSecret(encryptedAccessToken);
  } catch {
    return {
      ok: false,
      message: "Meta access token could not be decrypted with the current encryption key.",
      savedAt: null,
      connected: existing.status === "CONNECTED",
    };
  }

  let accountRows: Record<string, unknown>[];

  try {
    accountRows = await fetchMetaGraphList({
      accessToken,
      path: "me/adaccounts",
      params: {
        fields: "id,name,account_status",
        limit: "50",
      },
    });
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Meta account option refresh failed.",
      savedAt: null,
      connected: existing.status === "CONNECTED",
    };
  }

  const accounts = accountRows
    .map(metaAccountOption)
    .filter((option): option is ProviderSelectorOption => Boolean(option));
  const accountNameById = new Map(
    accounts.map((account) => [metaAdAccountId(account.id), account.name]),
  );
  const accountIds = new Set(accounts.map((account) => metaAdAccountId(account.id)));
  const configuredAccountId = stringValue(currentConfig.adAccountId);

  if (configuredAccountId) {
    accountIds.add(metaAdAccountId(configuredAccountId));
  }

  const pixelsById = new Map<string, ProviderSelectorOption>();
  let pixelErrorCount = 0;

  for (const accountId of Array.from(accountIds).slice(0, 25)) {
    try {
      const pixelRows = await fetchMetaGraphList({
        accessToken,
        path: `${accountId}/adspixels`,
        params: {
          fields: "id,name",
          limit: "50",
        },
        maxItems: 50,
      });

      for (const row of pixelRows) {
        const option = metaPixelOption(row, accountNameById.get(accountId) ?? null);
        if (option) pixelsById.set(option.id, option);
      }
    } catch {
      pixelErrorCount += 1;
    }
  }

  const selectorOptions = {
    ...(marketingProviderSelectorOptionsFromConfig(existing.config) ?? {}),
    accounts,
    pixels: Array.from(pixelsById.values()).sort((left, right) =>
      (left.name ?? left.id).localeCompare(right.name ?? right.id),
    ),
  };
  const autoMap = autoMapProviderConfig({
    currentConfig,
    provider: "meta",
    selectorOptions,
  });
  const nextConfig = withConfiguredMarketingProviderSelections("meta", {
    ...autoMap.config,
    selectorOptions,
  });

  await prisma.integrationConnection.update({
    where: { provider: marketingIntegrationProviders.meta },
    data: {
      config: marketingConfigJson(nextConfig),
    },
  });

  const remappedUploads = await remapPendingUploadsForSavedConfig({
    config: nextConfig as MetaConfig,
    provider: "meta",
  });

  revalidatePath("/settings/integrations");
  revalidatePath("/settings/integrations/meta");

  const pixelMessage = pixelErrorCount
    ? ` Pixel discovery skipped for ${pixelErrorCount} account${pixelErrorCount === 1 ? "" : "s"}.`
    : "";

  return {
    ok: true,
    message: `Meta options refreshed: ${accounts.length} account${accounts.length === 1 ? "" : "s"} and ${selectorOptions.pixels.length} pixel${selectorOptions.pixels.length === 1 ? "" : "s"}.${pixelMessage}${autoMapSummary(autoMap.mappedFields)}${remappedUploadMessage(remappedUploads)}`,
    savedAt: Date.now(),
    connected: existing.status === "CONNECTED",
  };
}

export async function updateLinkedInAdsIntegrationAction(
  _: MarketingIntegrationActionState,
  formData: FormData,
): Promise<MarketingIntegrationActionState> {
  await requireAdmin();

  const existing = await prisma.integrationConnection.findUnique({
    where: { provider: marketingIntegrationProviders.linkedInAds },
    select: { config: true },
  });
  const currentConfig = jsonObject(existing?.config);
  const submittedAdAccountId = linkedInAccountIdFromUrn(
    stringValue(formData.get("adAccountId")),
  );
  const currentAdAccountId = linkedInAccountIdFromUrn(
    stringValue(currentConfig.adAccountId),
  );
  const accountChanged = submittedAdAccountId !== currentAdAccountId;
  const submittedInsightTagId = stringValue(formData.get("insightTagId"));
  const submittedLeadConversionRuleId = stringValue(
    formData.get("leadConversionRuleId"),
  );
  const submittedCallConversionRuleId = stringValue(
    formData.get("callConversionRuleId"),
  );
  const configCandidate = providerFormConfigCandidate({
    autoMap: Boolean(submittedAdAccountId),
    existingConfig: existing?.config,
    provider: "linkedin-ads",
    values: {
      accountMappingResetAt: submittedAdAccountId ? null : new Date().toISOString(),
      adAccountId: submittedAdAccountId,
      insightTagId: submittedAdAccountId
        ? linkedInAccountScopedValue({
            accountChanged,
            currentValue: stringValue(currentConfig.insightTagId),
            submittedValue: submittedInsightTagId,
          })
        : null,
      accountName: selectedLinkedInAccountName({
        currentConfig,
        nextAccountId: submittedAdAccountId,
        submittedAccountName: stringValue(formData.get("accountName")),
      }),
      leadConversionRuleId: submittedAdAccountId
        ? linkedInAccountScopedValue({
            accountChanged,
            currentValue: stringValue(currentConfig.leadConversionRuleId),
            submittedValue: submittedLeadConversionRuleId,
          })
        : null,
      callConversionRuleId: submittedAdAccountId
        ? linkedInAccountScopedValue({
            accountChanged,
            currentValue: stringValue(currentConfig.callConversionRuleId),
            submittedValue: submittedCallConversionRuleId,
          })
        : null,
      importCostEnabled: formData.get("importCostEnabled") === "on",
      uploadOfflineConversionsEnabled:
        formData.get("uploadOfflineConversionsEnabled") === "on",
      trackedClickIds: formData.get("trackedClickIds"),
    },
  });
  const parsed = linkedInAdsConfigSchema.safeParse(configCandidate);

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Enter valid LinkedIn Ads settings.",
      savedAt: null,
      connected: false,
    };
  }

  let credentials: Record<string, unknown> | null;

  try {
    credentials = mergeEncryptedCredentials({
      existingConfig: existing?.config,
      fields: [
        {
          key: "accessToken",
          value: String(formData.get("accessToken") ?? "").trim(),
        },
        {
          key: "oauthClientId",
          value: String(formData.get("oauthClientId") ?? "").trim(),
        },
        {
          key: "oauthClientSecret",
          value: String(formData.get("oauthClientSecret") ?? "").trim(),
        },
      ],
    });
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Could not save LinkedIn Ads credentials.",
      savedAt: null,
      connected: false,
    };
  }

  const authBrokerReady = await marketingAuthBrokerConfigured();
  const missingCredentialMessage =
    parsed.data.uploadOfflineConversionsEnabled && !authBrokerReady
      ? credentialError("LinkedIn Ads", credentials, ["accessToken"]) ??
        (!getMarketingIntegrationOAuthCredentialSource("linkedin-ads", {
          credentials: credentials ?? {},
        })
          ? "Add LinkedIn Ads OAuth app credentials in app settings or env before enabling conversion uploads."
          : null)
      : null;

  if (missingCredentialMessage) {
    return {
      ok: false,
      message: missingCredentialMessage,
      savedAt: null,
      connected: false,
    };
  }

  const nextConfig = withConfiguredMarketingProviderSelections("linkedin-ads", {
    ...parsed.data,
    ...preservedProviderRuntimeConfig(existing?.config),
    ...(credentials ? { credentials } : {}),
  });
  const connected = Boolean(parsed.data.adAccountId);

  await prisma.integrationConnection.upsert({
    where: { provider: marketingIntegrationProviders.linkedInAds },
    update: {
      name: "LinkedIn Ads",
      description:
        "LinkedIn Ads account, Insight Tag and conversion mapping for CRM attribution.",
      status: connected ? "CONNECTED" : "NOT_CONNECTED",
      config: marketingConfigJson(nextConfig),
    },
    create: {
      provider: marketingIntegrationProviders.linkedInAds,
      name: "LinkedIn Ads",
      description:
        "LinkedIn Ads account, Insight Tag and conversion mapping for CRM attribution.",
      status: connected ? "CONNECTED" : "NOT_CONNECTED",
      config: marketingConfigJson(nextConfig),
    },
  });

  const remappedUploads = await remapPendingUploadsForSavedConfig({
    config: parsed.data,
    provider: "linkedin-ads",
  });

  revalidatePath("/settings/integrations");
  revalidatePath("/settings/integrations/linkedin-ads");

  return {
    ok: true,
    message: connected
      ? `LinkedIn Ads settings saved.${remappedUploadMessage(remappedUploads)}`
      : "LinkedIn Ads account mapping cleared. Provider access can be reconnected or a new ad account can be selected.",
    savedAt: Date.now(),
    connected,
  };
}

export async function refreshLinkedInAdsSelectorOptionsAction(
  previousState: MarketingIntegrationActionState,
): Promise<MarketingIntegrationActionState> {
  void previousState;
  await requireAdmin();

  const existing = await prisma.integrationConnection.findUnique({
    where: { provider: marketingIntegrationProviders.linkedInAds },
    select: { config: true, status: true },
  });

  if (!existing) {
    return {
      ok: false,
      message: "Save LinkedIn Ads settings before refreshing options.",
      savedAt: null,
      connected: false,
    };
  }

  const authBrokerResult = await refreshAuthBrokerSelectorOptions({
    existing,
    provider: marketingIntegrationProviders.linkedInAds,
    providerName: "LinkedIn Ads",
    revalidateSlug: "linkedin-ads",
  });

  if (authBrokerResult) return authBrokerResult;

  if (!hasCredentialEncryptionKey()) {
    return {
      ok: false,
      message: "Set CREDENTIAL_ENCRYPTION_KEY before refreshing LinkedIn Ads options.",
      savedAt: null,
      connected: false,
    };
  }

  const currentConfig = jsonObject(existing.config);
  const credentials = existingCredentials(existing.config);
  const encryptedAccessToken = stringValue(credentials.accessToken);

  if (!encryptedAccessToken) {
    return {
      ok: false,
      message:
        "Save a LinkedIn Marketing API access token before refreshing options.",
      savedAt: null,
      connected: existing.status === "CONNECTED",
    };
  }

  let accessToken: string;

  try {
    accessToken = decryptSecret(encryptedAccessToken);
  } catch {
    return {
      ok: false,
      message:
        "LinkedIn access token could not be decrypted with the current encryption key.",
      savedAt: null,
      connected: existing.status === "CONNECTED",
    };
  }

  let accountRows: Record<string, unknown>[];

  try {
    accountRows = await fetchLinkedInAdAccounts({ accessToken });
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "LinkedIn Ads account option refresh failed.",
      savedAt: null,
      connected: existing.status === "CONNECTED",
    };
  }

  const configuredAccountId = stringValue(currentConfig.adAccountId);
  const configuredAccountName = stringValue(currentConfig.accountName);
  const accountsById = new Map<string, ProviderSelectorOption>();

  for (const row of accountRows) {
    const option = linkedInAdAccountOption(row);
    if (option) accountsById.set(option.id, option);
  }

  if (configuredAccountId) {
    accountsById.set(configuredAccountId, {
      id: configuredAccountId,
      name: configuredAccountName,
      description: "Configured ad account",
    });
  }

  const insightTagsById = new Map<string, ProviderSelectorOption>();
  const conversionRulesById = new Map<string, ProviderSelectorOption>();
  const accountIds = [
    ...(configuredAccountId ? [configuredAccountId] : []),
    ...Array.from(accountsById.keys()).filter((id) => id !== configuredAccountId),
  ];
  let insightTagErrorCount = 0;
  let conversionRuleErrorCount = 0;

  for (const accountId of accountIds.slice(0, 10)) {
    const accountOption = accountsById.get(accountId) ?? null;
    const account = linkedInSponsoredAccountUrn(accountId);

    try {
      const payload = await fetchLinkedInRest({
        accessToken,
        path: "insightTagDomains",
        params: {
          q: "account",
          account,
        },
      });

      for (const item of jsonArray(payload.elements)) {
        const option = linkedInInsightTagOption(jsonObject(item), accountOption);
        if (option) insightTagsById.set(option.id, option);
      }
    } catch {
      insightTagErrorCount += 1;
    }

    try {
      const payload = await fetchLinkedInRest({
        accessToken,
        path: "conversions",
        params: {
          q: "account",
          account,
        },
      });

      for (const item of jsonArray(payload.elements)) {
        const option = linkedInConversionRuleOption(jsonObject(item), accountOption);
        if (option) conversionRulesById.set(option.id, option);
      }
    } catch {
      conversionRuleErrorCount += 1;
    }
  }

  const selectorOptions = {
    ...(marketingProviderSelectorOptionsFromConfig(existing.config) ?? {}),
    accounts: sortedSelectorOptions(accountsById.values()),
    insightTags: sortedSelectorOptions(insightTagsById.values()),
    conversionRules: sortedSelectorOptions(conversionRulesById.values()),
  };
  const autoMap = autoMapProviderConfig({
    currentConfig,
    provider: "linkedin-ads",
    selectorOptions,
  });
  const nextConfig = withConfiguredMarketingProviderSelections("linkedin-ads", {
    ...autoMap.config,
    selectorOptions,
  });

  await prisma.integrationConnection.update({
    where: { provider: marketingIntegrationProviders.linkedInAds },
    data: {
      config: marketingConfigJson(nextConfig),
    },
  });

  const remappedUploads = await remapPendingUploadsForSavedConfig({
    config: nextConfig as LinkedInAdsConfig,
    provider: "linkedin-ads",
  });

  revalidatePath("/settings/integrations");
  revalidatePath("/settings/integrations/linkedin-ads");

  const warningMessages = [
    insightTagErrorCount
      ? ` Insight Tag lookup skipped for ${insightTagErrorCount} account${insightTagErrorCount === 1 ? "" : "s"}.`
      : "",
    conversionRuleErrorCount
      ? ` Conversion rule lookup skipped for ${conversionRuleErrorCount} account${conversionRuleErrorCount === 1 ? "" : "s"}.`
      : "",
  ].join("");

  return {
    ok: true,
    message: `LinkedIn Ads options refreshed: ${selectorOptions.accounts.length} account${selectorOptions.accounts.length === 1 ? "" : "s"}, ${selectorOptions.insightTags.length} Insight Tag${selectorOptions.insightTags.length === 1 ? "" : "s"} and ${selectorOptions.conversionRules.length} conversion rule${selectorOptions.conversionRules.length === 1 ? "" : "s"}.${warningMessages}${autoMapSummary(autoMap.mappedFields)}${remappedUploadMessage(remappedUploads)}`,
    savedAt: Date.now(),
    connected: existing.status === "CONNECTED",
  };
}
