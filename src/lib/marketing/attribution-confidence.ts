export type AttributionConfidenceLevel = "High" | "Medium" | "Low" | "Unknown";

export type AttributionConfidenceFactorKey =
  | "click-id"
  | "utm-source"
  | "utm-campaign"
  | "landing-page"
  | "journey"
  | "conversion-evidence"
  | "crm-match"
  | "consent";

export type AttributionConfidenceFactorStatus =
  | "present"
  | "missing"
  | "not-applicable";

export type AttributionConfidenceFactor = {
  key: AttributionConfidenceFactorKey;
  label: string;
  status: AttributionConfidenceFactorStatus;
  weight: number;
  score: number;
  internalDetail: string;
  clientSummary: string;
};

export type AttributionConfidenceInput = {
  firstTouch?: unknown;
  lastTouch?: unknown;
  timeline?: unknown;
  landingPage?: string | null;
  currentPage?: string | null;
  referrer?: string | null;
  attributionSource?: string | null;
  attributionMedium?: string | null;
  attributionCampaign?: string | null;
  attributionClickId?: string | null;
  attributionClickIdType?: string | null;
  recordsCount?: number | null;
  formConversionsCount?: number | null;
  phoneConversionsCount?: number | null;
  manualConversionsCount?: number | null;
  matchedContactId?: string | null;
  matchedOpportunityId?: string | null;
  consentRequired?: boolean | null;
  consentGranted?: boolean | null;
};

export type AttributionConfidenceResult = {
  level: AttributionConfidenceLevel;
  score: number;
  maxScore: number;
  percentage: number;
  factors: AttributionConfidenceFactor[];
  presentFactors: AttributionConfidenceFactor[];
  missingFactors: AttributionConfidenceFactor[];
  internalReasons: string[];
  clientSummary: string;
};

type TouchEvidence = {
  landingPage: string | null;
  params: Record<string, string>;
  referrer: string | null;
  url: string | null;
};

const clickIdParamLabels = [
  ["gclid", "GCLID"],
  ["gbraid", "GBRAID"],
  ["wbraid", "WBRAID"],
  ["msclkid", "MSCLKID"],
  ["fbclid", "FBCLID"],
  ["ttclid", "TTCLID"],
  ["li_fat_id", "LinkedIn click ID"],
] as const;

export function calculateAttributionConfidence(
  input: AttributionConfidenceInput,
): AttributionConfidenceResult {
  const firstTouch = touchEvidence(input.firstTouch);
  const lastTouch = touchEvidence(input.lastTouch);
  const mergedParams = {
    ...firstTouch.params,
    ...lastTouch.params,
  };
  const clickId =
    cleanString(input.attributionClickId) ??
    clickIdParamLabels
      .map(([key]) => cleanString(mergedParams[key]))
      .find((value): value is string => Boolean(value));
  const clickIdType =
    cleanString(input.attributionClickIdType) ??
    clickIdParamLabels.find(([key]) => cleanString(mergedParams[key]))?.[1] ??
    null;
  const source =
    cleanString(input.attributionSource) ??
    cleanString(mergedParams.utm_source) ??
    cleanString(input.referrer) ??
    firstTouch.referrer ??
    lastTouch.referrer;
  const campaign =
    cleanString(input.attributionCampaign) ?? cleanString(mergedParams.utm_campaign);
  const landingPage =
    cleanString(input.landingPage) ??
    firstTouch.landingPage ??
    firstTouch.url ??
    lastTouch.landingPage ??
    cleanString(input.currentPage);
  const journeyEvents = timelineLength(input.timeline);
  const explicitRecordCount =
    typeof input.recordsCount === "number" && Number.isFinite(input.recordsCount)
      ? nonNegativeNumber(input.recordsCount)
      : null;
  const conversionCount =
    explicitRecordCount ??
    nonNegativeNumber(input.formConversionsCount) +
      nonNegativeNumber(input.phoneConversionsCount) +
      nonNegativeNumber(input.manualConversionsCount);
  const hasCrmMatch =
    Boolean(cleanString(input.matchedContactId)) ||
    Boolean(cleanString(input.matchedOpportunityId));

  const factors = [
    confidenceFactor({
      key: "click-id",
      label: "Ad click ID",
      passed: Boolean(clickId),
      weight: 25,
      presentInternal: clickIdType ? `${clickIdType} captured.` : "Ad click ID captured.",
      missingInternal: "No recognised ad click ID was captured.",
      presentClient: "Ad platform click evidence captured.",
      missingClient: "No ad click ID captured.",
    }),
    confidenceFactor({
      key: "utm-source",
      label: "Source",
      passed: Boolean(source),
      weight: 15,
      presentInternal: `Source evidence captured${source ? `: ${source}.` : "."}`,
      missingInternal: "No UTM source, stored source or referrer source was available.",
      presentClient: "Traffic source captured.",
      missingClient: "Traffic source missing.",
    }),
    confidenceFactor({
      key: "utm-campaign",
      label: "Campaign",
      passed: Boolean(campaign),
      weight: 10,
      presentInternal: `Campaign captured${campaign ? `: ${campaign}.` : "."}`,
      missingInternal: "No UTM campaign or stored campaign was available.",
      presentClient: "Campaign captured.",
      missingClient: "Campaign missing.",
    }),
    confidenceFactor({
      key: "landing-page",
      label: "Landing page",
      passed: Boolean(landingPage),
      weight: 10,
      presentInternal: `Landing page captured${landingPage ? `: ${landingPage}.` : "."}`,
      missingInternal: "No landing page or current page was available.",
      presentClient: "Landing page captured.",
      missingClient: "Landing page missing.",
    }),
    confidenceFactor({
      key: "journey",
      label: "Journey",
      passed: journeyEvents > 0,
      weight: 15,
      presentInternal: `${journeyEvents} journey touchpoint${journeyEvents === 1 ? "" : "s"} captured.`,
      missingInternal: "No journey timeline touchpoints were captured.",
      presentClient: "Journey evidence captured.",
      missingClient: "Journey evidence missing.",
    }),
    confidenceFactor({
      key: "conversion-evidence",
      label: "Conversion evidence",
      passed: conversionCount > 0,
      weight: 15,
      presentInternal: `${conversionCount} conversion record${conversionCount === 1 ? "" : "s"} linked.`,
      missingInternal: "No form, phone or manual conversion record was linked.",
      presentClient: "Conversion evidence linked.",
      missingClient: "No conversion evidence linked.",
    }),
    confidenceFactor({
      key: "crm-match",
      label: "CRM match",
      passed: hasCrmMatch,
      weight: 10,
      presentInternal: "A CRM contact or opportunity match is available.",
      missingInternal: "No matched CRM contact or opportunity was provided.",
      presentClient: "CRM match available.",
      missingClient: "CRM match missing.",
    }),
    consentFactor(input),
  ];
  const applicableFactors = factors.filter((factor) => factor.status !== "not-applicable");
  const maxScore = applicableFactors.reduce((total, factor) => total + factor.weight, 0);
  const score = applicableFactors.reduce((total, factor) => total + factor.score, 0);
  const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  const presentFactors = applicableFactors.filter((factor) => factor.status === "present");
  const missingFactors = applicableFactors.filter((factor) => factor.status === "missing");

  return {
    level: confidenceLevel(percentage, presentFactors.length, applicableFactors.length),
    score,
    maxScore,
    percentage,
    factors,
    presentFactors,
    missingFactors,
    internalReasons: applicableFactors.map((factor) => factor.internalDetail),
    clientSummary: confidenceClientSummary(percentage, presentFactors, missingFactors),
  };
}

function confidenceFactor(options: {
  key: AttributionConfidenceFactorKey;
  label: string;
  passed: boolean;
  weight: number;
  presentInternal: string;
  missingInternal: string;
  presentClient: string;
  missingClient: string;
}): AttributionConfidenceFactor {
  return {
    key: options.key,
    label: options.label,
    status: options.passed ? "present" : "missing",
    weight: options.weight,
    score: options.passed ? options.weight : 0,
    internalDetail: options.passed ? options.presentInternal : options.missingInternal,
    clientSummary: options.passed ? options.presentClient : options.missingClient,
  };
}

function consentFactor(input: AttributionConfidenceInput): AttributionConfidenceFactor {
  if (!input.consentRequired) {
    return {
      key: "consent",
      label: "Consent",
      status: "not-applicable",
      weight: 0,
      score: 0,
      internalDetail: "Consent is not required for this attribution context.",
      clientSummary: "Consent requirement not applicable.",
    };
  }

  const granted = input.consentGranted === true;

  return {
    key: "consent",
    label: "Consent",
    status: granted ? "present" : "missing",
    weight: 10,
    score: granted ? 10 : 0,
    internalDetail: granted
      ? "Consent was required and granted."
      : "Consent was required but was not confirmed.",
    clientSummary: granted
      ? "Consent confirmed."
      : "Consent not confirmed.",
  };
}

function confidenceLevel(
  percentage: number,
  presentFactors: number,
  applicableFactors: number,
): AttributionConfidenceLevel {
  if (applicableFactors === 0 || presentFactors === 0) return "Unknown";
  if (percentage >= 75) return "High";
  if (percentage >= 45) return "Medium";
  if (percentage >= 15) return "Low";
  return "Unknown";
}

function confidenceClientSummary(
  percentage: number,
  presentFactors: AttributionConfidenceFactor[],
  missingFactors: AttributionConfidenceFactor[],
) {
  if (!presentFactors.length) {
    return "Attribution evidence is not strong enough to rely on yet.";
  }

  const strongest = presentFactors
    .slice()
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 2)
    .map((factor) => factor.clientSummary);
  const missing = missingFactors
    .slice()
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 2)
    .map((factor) => factor.clientSummary);
  const evidence = strongest.join(" ");
  const gaps = missing.length ? ` Gaps: ${missing.join(" ")}` : "";

  return `${percentage}% confidence. ${evidence}${gaps}`.trim();
}

function touchEvidence(value: unknown): TouchEvidence {
  const record = objectRecord(value);
  const paramsRecord = objectRecord(record?.params);
  const params = Object.fromEntries(
    Object.entries(paramsRecord ?? {})
      .map(([key, item]) => [key, cleanString(item)])
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  );

  return {
    landingPage: cleanString(record?.landingPage),
    params,
    referrer: cleanString(record?.referrer),
    url: cleanString(record?.url),
  };
}

function timelineLength(value: unknown) {
  if (Array.isArray(value)) return value.length;

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  }

  return 0;
}

function nonNegativeNumber(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
