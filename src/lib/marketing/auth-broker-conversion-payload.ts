export type AuthBrokerConversionProviderSlug =
  | "bing-ads"
  | "google-ads"
  | "linkedin-ads"
  | "meta";

type AuthBrokerConversionUploadRow = {
  clickId: string | null;
  clickIdSource: string | null;
  conversionName: string | null;
  conversionType: string;
  currency: string;
  entityId: string;
  entityType: string;
  occurredAt: Date;
  payload: unknown;
  valueCents: number | null;
};

type AuthBrokerConversionUploadContext = {
  config: unknown;
  provider: string;
  slug: AuthBrokerConversionProviderSlug;
};

export const authBrokerConversionMappingKeys = {
  "bing-ads": [
    "accountId",
    "customerId",
    "conversionGoalId",
    "leadConversionGoalId",
    "callConversionGoalId",
  ],
  "google-ads": [
    "customerId",
    "managerCustomerId",
    "conversionActionId",
    "leadConversionActionId",
    "callConversionActionId",
  ],
  "linkedin-ads": [
    "conversionRuleId",
    "leadConversionRuleId",
    "callConversionRuleId",
  ],
  meta: [
    "pixelId",
    "eventName",
    "leadEventName",
    "callEventName",
    "testEventCode",
  ],
} as const satisfies Record<AuthBrokerConversionProviderSlug, readonly string[]>;

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function mappedValue(value: unknown) {
  if (typeof value !== "string") return value ?? null;

  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

export function buildAuthBrokerConversionUploadPayload({
  context,
  row,
}: {
  context: AuthBrokerConversionUploadContext;
  row: AuthBrokerConversionUploadRow;
}): Record<string, unknown> {
  const combinedMapping = {
    ...jsonRecord(row.payload),
    ...jsonRecord(context.config),
  };
  const mapping: Record<string, unknown> = {
    provider: context.provider,
    providerSlug: context.slug,
  };

  for (const key of authBrokerConversionMappingKeys[context.slug]) {
    const value = mappedValue(combinedMapping[key]);

    if (value !== null) {
      mapping[key] = value;
    }
  }

  return {
    conversionName: row.conversionName,
    conversionType: row.conversionType,
    currency: row.currency,
    entityId: row.entityId,
    entityType: row.entityType,
    occurredAt: row.occurredAt.toISOString(),
    clickId: row.clickId,
    clickIdSource: row.clickIdSource,
    valueCents: row.valueCents,
    mapping,
  };
}
