import {
  marketingProviderSelectorOptionsFromConfig,
  type MarketingIntegrationProviderSlug,
  type MarketingProviderSelectorOption,
} from "@/lib/marketing/integrations";
import {
  combinedMarketingProviderSelectorOptions,
  numericMarketingProviderSelectorOptions,
} from "@/lib/marketing/selector-option-lists";

type ProviderSelectorOption = MarketingProviderSelectorOption;

export type AccountSelectableMarketingProviderSlug = Extract<
  MarketingIntegrationProviderSlug,
  "bing-ads" | "google-ads" | "linkedin-ads" | "meta"
>;

export function isAccountSelectableMarketingProviderSlug(
  provider: MarketingIntegrationProviderSlug,
): provider is AccountSelectableMarketingProviderSlug {
  return (
    provider === "bing-ads" ||
    provider === "google-ads" ||
    provider === "linkedin-ads" ||
    provider === "meta"
  );
}

export function withConfiguredMarketingProviderSelections(
  provider: AccountSelectableMarketingProviderSlug,
  config: Record<string, unknown>,
) {
  const selectorOptions = selectorOptionsFromConfig(config);
  const nextConfig = { ...config };

  if (provider === "google-ads") {
    const customerId = stringValue(nextConfig.customerId);
    const managerCustomerId = stringValue(nextConfig.managerCustomerId);
    const leadConversionActionId = stringValue(nextConfig.leadConversionActionId);
    const callConversionActionId = stringValue(nextConfig.callConversionActionId);
    const account = findSelectorOption({
      id: customerId,
      normalise: googleAdsCustomerId,
      options: selectorOptions.accounts,
    });

    selectorOptions.accounts = withConfiguredOption({
      description: "Configured Google Ads account",
      id: customerId ? googleAdsCustomerId(customerId) : null,
      name: stringValue(nextConfig.accountName) ?? account?.name ?? null,
      normalise: googleAdsCustomerId,
      options: selectorOptions.accounts,
    });
    selectorOptions.managerAccounts = withConfiguredOption({
      description: "Configured manager account",
      id: managerCustomerId ? googleAdsCustomerId(managerCustomerId) : null,
      normalise: googleAdsCustomerId,
      options: selectorOptions.managerAccounts,
    });
    selectorOptions.conversionActions = withConfiguredOption({
      description: "Configured lead conversion action",
      id: leadConversionActionId,
      options: selectorOptions.conversionActions,
    });
    selectorOptions.conversionActions = withConfiguredOption({
      description: "Configured call conversion action",
      id: callConversionActionId,
      options: selectorOptions.conversionActions,
    });
  }

  if (provider === "bing-ads") {
    const accountId = stringValue(nextConfig.accountId);
    const customerId = stringValue(nextConfig.customerId);
    const managerAccountId = stringValue(nextConfig.managerAccountId);
    const uetTagId = stringValue(nextConfig.uetTagId);
    const leadConversionGoalId = stringValue(nextConfig.leadConversionGoalId);
    const leadConversionGoalName = stringValue(nextConfig.leadConversionGoalName);
    const callConversionGoalId = stringValue(nextConfig.callConversionGoalId);
    const callConversionGoalName = stringValue(nextConfig.callConversionGoalName);
    const conversionGoalOptions = numericMarketingProviderSelectorOptions(
      combinedMarketingProviderSelectorOptions(selectorOptions, [
        "conversionGoals",
        "conversionActions",
      ]),
    );
    selectorOptions.conversionActions = numericMarketingProviderSelectorOptions(
      selectorOptions.conversionActions ?? [],
    );
    const account = findSelectorOption({
      id: accountId,
      options: selectorOptions.accounts,
    });

    selectorOptions.accounts = withConfiguredOption({
      description: "Configured Microsoft Advertising account",
      id: accountId,
      name: stringValue(nextConfig.accountName) ?? account?.name ?? null,
      options: selectorOptions.accounts,
    });
    selectorOptions.managerAccounts = withConfiguredOption({
      description: "Configured customer account",
      id: customerId,
      options: selectorOptions.managerAccounts,
    });
    selectorOptions.managerAccounts = withConfiguredOption({
      description: "Configured manager account",
      id: managerAccountId,
      options: selectorOptions.managerAccounts,
    });
    selectorOptions.uetTags = withConfiguredOption({
      description: "Configured UET tag",
      id: uetTagId,
      options: selectorOptions.uetTags,
    });
    selectorOptions.conversionGoals = withConfiguredOption({
      description: "Configured lead conversion goal",
      id: leadConversionGoalId,
      name: leadConversionGoalName,
      options: conversionGoalOptions,
    });
    selectorOptions.conversionGoals = withConfiguredOption({
      description: "Configured call conversion goal",
      id: callConversionGoalId,
      name: callConversionGoalName,
      options: selectorOptions.conversionGoals,
    });
  }

  if (provider === "linkedin-ads") {
    const adAccountId = stringValue(nextConfig.adAccountId);
    const insightTagId = stringValue(nextConfig.insightTagId);
    const leadConversionRuleId = stringValue(nextConfig.leadConversionRuleId);
    const callConversionRuleId = stringValue(nextConfig.callConversionRuleId);
    const conversionRuleOptions = combinedMarketingProviderSelectorOptions(
      selectorOptions,
      ["conversionRules", "conversionActions"],
    );
    const account = findSelectorOption({
      id: adAccountId,
      normalise: linkedInSelectorId,
      options: selectorOptions.accounts,
    });

    selectorOptions.accounts = withConfiguredOption({
      description: "Configured LinkedIn Ads account",
      id: adAccountId ? linkedInSelectorId(adAccountId) : null,
      name: stringValue(nextConfig.accountName) ?? account?.name ?? null,
      normalise: linkedInSelectorId,
      options: selectorOptions.accounts,
    });
    selectorOptions.insightTags = withConfiguredOption({
      description: "Configured Insight Tag",
      id: insightTagId,
      options: selectorOptions.insightTags,
    });
    selectorOptions.conversionRules = withConfiguredOption({
      description: "Configured lead conversion rule",
      id: leadConversionRuleId,
      options: conversionRuleOptions,
    });
    selectorOptions.conversionRules = withConfiguredOption({
      description: "Configured call conversion rule",
      id: callConversionRuleId,
      options: selectorOptions.conversionRules,
    });
  }

  if (provider === "meta") {
    const adAccountId = stringValue(nextConfig.adAccountId);
    const pixelId = stringValue(nextConfig.pixelId);
    const leadEventName = stringValue(nextConfig.leadEventName);
    const callEventName = stringValue(nextConfig.callEventName);
    const account = findSelectorOption({
      id: adAccountId,
      normalise: metaSelectorId,
      options: selectorOptions.accounts,
    });

    selectorOptions.accounts = withConfiguredOption({
      description: "Configured Meta ad account",
      id: adAccountId ? metaSelectorId(adAccountId) : null,
      name: stringValue(nextConfig.accountName) ?? account?.name ?? null,
      normalise: metaSelectorId,
      options: selectorOptions.accounts,
    });
    selectorOptions.pixels = withConfiguredOption({
      description: "Configured Meta pixel",
      id: pixelId,
      options: selectorOptions.pixels,
    });
    selectorOptions.events = withConfiguredOption({
      description: "Configured lead event",
      id: leadEventName,
      name: leadEventName,
      options: selectorOptions.events,
    });
    selectorOptions.events = withConfiguredOption({
      description: "Configured call event",
      id: callEventName,
      name: callEventName,
      options: selectorOptions.events,
    });
  }

  if (Object.keys(selectorOptions).length) {
    nextConfig.selectorOptions = selectorOptions;
  }

  return nextConfig;
}

function selectorOptionsFromConfig(
  config: unknown,
): Record<string, ProviderSelectorOption[]> {
  const selectorOptions = marketingProviderSelectorOptionsFromConfig(config);

  if (!selectorOptions) return {};

  return Object.fromEntries(
    Object.entries(selectorOptions).map(([key, value]) => [
      key,
      Array.isArray(value) ? [...value] : [],
    ]),
  );
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normaliseSelectorId(value: string, normalise: (id: string) => string) {
  return normalise(value.trim());
}

function findSelectorOption({
  id,
  normalise = (value) => value,
  options,
}: {
  id: string | null;
  normalise?: (value: string) => string;
  options: ProviderSelectorOption[] | undefined;
}) {
  if (!id) return null;

  const normalisedId = normaliseSelectorId(id, normalise);

  return (
    options?.find(
      (option) => normaliseSelectorId(option.id, normalise) === normalisedId,
    ) ?? null
  );
}

function withConfiguredOption({
  description,
  id,
  name,
  normalise = (value) => value,
  options,
}: {
  description: string;
  id: string | null;
  name?: string | null;
  normalise?: (value: string) => string;
  options: ProviderSelectorOption[] | undefined;
}) {
  if (!id) return options ?? [];

  if (findSelectorOption({ id, normalise, options })) {
    return options ?? [];
  }

  return [
    ...(options ?? []),
    {
      id,
      name: name || null,
      description,
      status: "Configured",
    },
  ];
}

function googleAdsCustomerId(value: string) {
  return value.replace(/\D/g, "");
}

function linkedInSelectorId(value: string) {
  return value.split(":").pop() || value;
}

function metaSelectorId(value: string) {
  return value.replace(/^act_/, "");
}
