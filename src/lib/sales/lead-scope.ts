export const leadScopeProductTypes = [
  "Website",
  "Ecommerce",
  "Branding",
  "Flyer",
  "Brochure",
  "SEO",
  "Hosting",
  "Signage",
] as const;

export type LeadScopeProductType = (typeof leadScopeProductTypes)[number];

export type LeadScope = {
  productTypes: LeadScopeProductType[];
  customProductTypes: string[];
  budget: string | null;
  timeframe: string | null;
  notes: string | null;
  source: "manual" | "inferred" | "mixed";
  confidence: "low" | "medium" | "high" | null;
  updatedAt: string | null;
};

const productKeywordMap: Record<LeadScopeProductType, string[]> = {
  Website: ["website", "web site", "site redesign", "landing page"],
  Ecommerce: ["ecommerce", "e-commerce", "shopify", "online store", "webshop"],
  Branding: ["branding", "brand identity", "logo", "brand"],
  Flyer: ["flyer", "leaflet"],
  Brochure: ["brochure"],
  SEO: ["seo", "search engine optimisation", "search engine optimization"],
  Hosting: ["hosting", "hosted", "maintenance"],
  Signage: ["signage", "sign", "vehicle graphics"],
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function uniqueClean(values: unknown[]) {
  const seen = new Set<string>();
  const cleanValues: string[] = [];

  values.forEach((value) => {
    const cleanValue = cleanString(value);
    if (!cleanValue) return;

    const key = cleanValue.toLowerCase();
    if (seen.has(key)) return;

    seen.add(key);
    cleanValues.push(cleanValue);
  });

  return cleanValues;
}

function productType(value: string): LeadScopeProductType | null {
  return (
    leadScopeProductTypes.find(
      (product) => product.toLowerCase() === value.toLowerCase(),
    ) ?? null
  );
}

function productTypesFromValues(values: unknown[]) {
  return uniqueClean(values)
    .map(productType)
    .filter((value): value is LeadScopeProductType => Boolean(value));
}

export function normaliseLeadScope(value: unknown): LeadScope {
  const data = objectValue(value);

  return {
    productTypes: productTypesFromValues(
      Array.isArray(data.productTypes) ? data.productTypes : [],
    ),
    customProductTypes: uniqueClean(
      Array.isArray(data.customProductTypes) ? data.customProductTypes : [],
    ).slice(0, 8),
    budget: cleanString(data.budget),
    timeframe: cleanString(data.timeframe),
    notes: cleanString(data.notes),
    source:
      data.source === "manual" || data.source === "inferred" || data.source === "mixed"
        ? data.source
        : "manual",
    confidence:
      data.confidence === "low" ||
      data.confidence === "medium" ||
      data.confidence === "high"
        ? data.confidence
        : null,
    updatedAt: cleanString(data.updatedAt),
  };
}

export function leadScopeHasContent(scope: LeadScope) {
  return Boolean(
    scope.productTypes.length ||
      scope.customProductTypes.length ||
      scope.budget ||
      scope.timeframe ||
      scope.notes,
  );
}

export function inferLeadScopeFromText(values: Array<string | null | undefined>): LeadScope {
  const text = values.filter(Boolean).join("\n").toLowerCase();
  const productTypes = leadScopeProductTypes.filter((product) =>
    productKeywordMap[product].some((keyword) => text.includes(keyword)),
  );
  const budgetMatch =
    text.match(/£\s?\d[\d,]*(?:\s?(?:-|to|–)\s?£?\s?\d[\d,]*)?\s?k?/i) ||
    text.match(/\b\d[\d,]*\s?(?:k|thousand)\b/i);
  const timeframeMatch =
    text.match(/\b(?:asap|urgent|next week|this week|next month|within [^.]{1,40}|by [a-z]+|monday|tuesday|wednesday|thursday|friday)\b/i);

  return {
    productTypes,
    customProductTypes: [],
    budget: budgetMatch?.[0]?.trim() ?? null,
    timeframe: timeframeMatch?.[0]?.trim() ?? null,
    notes: null,
    source: "inferred",
    confidence: productTypes.length >= 2 ? "high" : productTypes.length ? "medium" : "low",
    updatedAt: null,
  };
}

export function mergeLeadScope(existing: LeadScope, inferred: LeadScope): LeadScope {
  return {
    productTypes: Array.from(
      new Set([...existing.productTypes, ...inferred.productTypes]),
    ),
    customProductTypes: existing.customProductTypes,
    budget: existing.budget || inferred.budget,
    timeframe: existing.timeframe || inferred.timeframe,
    notes: existing.notes,
    source: leadScopeHasContent(existing) ? "mixed" : "inferred",
    confidence: inferred.confidence,
    updatedAt: new Date().toISOString(),
  };
}

export function leadScopeToJson(scope: LeadScope) {
  return {
    productTypes: scope.productTypes,
    customProductTypes: scope.customProductTypes,
    budget: scope.budget,
    timeframe: scope.timeframe,
    notes: scope.notes,
    source: scope.source,
    confidence: scope.confidence,
    updatedAt: scope.updatedAt,
  };
}
