import type { MarketingProviderSelectorOption } from "@/lib/marketing/integrations";

type SelectorOptionBag = Record<string, unknown>;

export function uniqueMarketingProviderSelectorOptions(
  options: MarketingProviderSelectorOption[],
) {
  const byId = new Map<string, MarketingProviderSelectorOption>();

  for (const option of options) {
    if (!byId.has(option.id)) {
      byId.set(option.id, option);
    }
  }

  return Array.from(byId.values());
}

export function combinedMarketingProviderSelectorOptions(
  selectorOptions: SelectorOptionBag | null | undefined,
  keys: string[],
) {
  if (!selectorOptions) return [];

  return uniqueMarketingProviderSelectorOptions(
    keys.flatMap((key) => selectorOptionList(selectorOptions[key])),
  );
}

export function numericMarketingProviderSelectorOptions(
  options: MarketingProviderSelectorOption[],
) {
  return options.filter((option) => /^\d+$/.test(option.id.trim()));
}

function selectorOptionList(value: unknown): MarketingProviderSelectorOption[] {
  if (!Array.isArray(value)) return [];

  return value.filter(isMarketingProviderSelectorOption);
}

function isMarketingProviderSelectorOption(
  value: unknown,
): value is MarketingProviderSelectorOption {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).id === "string" &&
    Boolean((value as Record<string, unknown>).id)
  );
}
