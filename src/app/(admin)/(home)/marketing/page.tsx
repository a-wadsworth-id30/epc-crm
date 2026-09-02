import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { AttributionSourceIconSlot } from "@/components/crm-boilerplate/AttributionSourceIcon";
import ExecutiveReportExportActions from "@/components/crm-boilerplate/ExecutiveReportExportActions";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import MarketingRouteShell from "@/components/crm-boilerplate/MarketingRouteShell";
import MetricCard from "@/components/crm-boilerplate/MetricCard";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import ResponsiveDataList, {
  ResponsiveDataField,
} from "@/components/crm-boilerplate/ResponsiveDataList";
import StatusBadge from "@/components/crm-boilerplate/StatusBadge";
import {
  dryRunMarketingConversionUploadsAction,
  importMarketingAdSpendAction,
  prepareMarketingConversionUploadsAction,
  processMarketingConversionUploadsAction,
  retryFailedMarketingConversionUploadsAction,
} from "@/lib/actions/marketing-lifecycle";
import {
  getMarketingIntegrationProviderState,
  marketingIntegrationProviderDefinitions,
} from "@/lib/marketing/integrations";
import {
  offlineCampaignChannelLabels,
  type OfflineCampaignChannelValue,
  type OfflineCampaignStatusValue,
} from "@/lib/marketing/offline-campaigns";
import {
  calculateAttributionConfidence,
  type AttributionConfidenceLevel,
  type AttributionConfidenceResult,
} from "@/lib/marketing/attribution-confidence";
import {
  getMarketingOpportunityTotals,
  type MarketingOpportunityTotals,
} from "@/lib/marketing/opportunity-totals";
import {
  marketingDailyRollupRangeFromWindow,
  readMarketingDailyRollupSummary,
  type MarketingDailyRollupSummary,
} from "@/lib/marketing/daily-rollups";
import {
  attributionModelHref,
  attributionModelOptions,
  executiveReportDownloadHref,
  executiveReportPackHref,
  flagValue,
  leadChannelOptions,
  leadStatusOptions,
  marketingPageHref,
  marketingRangeWindow,
  marketingReportHref,
  parseAttributionModel,
  parseLeadChannel,
  parseLeadStatus,
  parseMarketingRange,
  parseMarketingView,
  searchValue,
  viewActions,
  viewMeta,
  visitorLogHrefForMarketingRange,
  type AttributionModel,
  type LeadChannel,
  type MarketingRange,
} from "@/lib/marketing/report-navigation";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Marketing Overview | iD30 CRM",
  description: "Marketing source, lead, call and revenue performance.",
};

type PageProps = {
  searchParams?: Promise<{
    channel?: string | string[];
    model?: string | string[];
    print?: string | string[];
    range?: string | string[];
    q?: string | string[];
    status?: string | string[];
    view?: string | string[];
  }>;
};

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
});

const leadDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const leadTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

function formatMoney(valueCents: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(valueCents / 100);
}

function microsToCents(value: bigint | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  return Math.round(Number(value) / 10_000);
}

function campaignSpendSummaryFromRollup(summary: MarketingDailyRollupSummary) {
  return {
    _sum: {
      clicks: summary.totals.clicks,
      conversions: summary.totals.conversions,
      costMicros: BigInt(summary.totals.costMicros),
      impressions: summary.totals.impressions,
    },
  };
}

function formatRatio(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "Not available";
  return `${value.toFixed(1)}x`;
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${value.toFixed(1)}%`;
}

function formatAttributionCount(value: number) {
  if (!Number.isFinite(value)) return "0";
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(1);
}

function percentOf(value: number, total: number) {
  if (total <= 0) return null;
  return (value / total) * 100;
}

function durationMinutesBetween(later: Date | null, earlier: Date | null) {
  if (!later || !earlier) return null;

  const minutes = (later.getTime() - earlier.getTime()) / 60_000;
  return Number.isFinite(minutes) ? Math.max(0, minutes) : null;
}

function formatDurationMinutes(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "-";
  if (value < 1) return "<1m";
  if (value < 60) return `${Math.round(value)}m`;
  if (value < 1_440) return `${(value / 60).toFixed(value < 600 ? 1 : 0)}h`;
  return `${(value / 1_440).toFixed(1)}d`;
}

function formatDurationDays(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "-";
  if (value < 1) return formatDurationMinutes(value * 1_440);
  return `${value.toFixed(value < 10 ? 1 : 0)}d`;
}

function sourceFromAttribution(attribution: unknown) {
  if (
    !attribution ||
    typeof attribution !== "object" ||
    Array.isArray(attribution)
  ) {
    return "Unattributed";
  }

  const lastTouch = (attribution as { lastTouch?: unknown }).lastTouch;
  if (!lastTouch || typeof lastTouch !== "object" || Array.isArray(lastTouch)) {
    return "Unattributed";
  }

  const params = (lastTouch as { params?: unknown }).params;
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return "Unattributed";
  }

  const source = (params as Record<string, unknown>).utm_source;
  const medium = (params as Record<string, unknown>).utm_medium;

  return (
    [source, medium]
      .filter((value) => typeof value === "string" && value)
      .join(" / ") || "Unattributed"
  );
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function jsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringParam(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function attributionTouchParams(attribution: unknown) {
  const data = jsonObject(attribution);
  const lastTouchParams = jsonObject(jsonObject(data?.lastTouch)?.params);
  const firstTouchParams = jsonObject(jsonObject(data?.firstTouch)?.params);

  return lastTouchParams ?? firstTouchParams ?? {};
}

function referrerHost(referrer: unknown) {
  const value = stringParam(referrer);
  if (!value) return null;

  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function attributionDimensions(
  attribution: unknown,
  fallbackSource?: string | null,
) {
  const params = attributionTouchParams(attribution);
  const referrer = referrerHost(jsonObject(attribution)?.referrer);
  const source =
    stringParam(params.utm_source) ||
    stringParam(params.source) ||
    stringParam(fallbackSource) ||
    referrer ||
    "Unattributed";
  const medium =
    stringParam(params.utm_medium) ||
    stringParam(params.medium) ||
    (referrer ? "referral" : "Unknown");
  const campaign =
    stringParam(params.utm_campaign) ||
    stringParam(params.campaign) ||
    "Not set";
  const clickIdSource = ["gclid", "gbraid", "wbraid", "msclkid", "fbclid"].find(
    (key) => stringParam(params[key]),
  );

  return {
    campaign,
    clickIdSource: clickIdSource ?? null,
    medium,
    source,
  };
}

function attributionDimensionKey(
  dimensions: ReturnType<typeof attributionDimensions>,
) {
  return [dimensions.source, dimensions.medium, dimensions.campaign].join("::");
}

function dimensionsFromTouch(touch: unknown, fallbackSource?: string | null) {
  return attributionDimensions({ lastTouch: touch }, fallbackSource);
}

function attributionJourneyDimensions(
  attribution: unknown,
  fallbackSource?: string | null,
) {
  const data = jsonObject(attribution);
  if (!data) return [attributionDimensions(attribution, fallbackSource)];

  const touches = [
    data.firstTouch,
    ...jsonArray(data.timeline),
    data.lastTouch,
  ].filter(Boolean);
  const rows: ReturnType<typeof attributionDimensions>[] = [];
  let previousKey: string | null = null;

  for (const touch of touches) {
    const dimensions = dimensionsFromTouch(touch, fallbackSource);
    const key = attributionDimensionKey(dimensions);
    if (key === previousKey) continue;
    rows.push(dimensions);
    previousKey = key;
  }

  return rows.length
    ? rows
    : [attributionDimensions(attribution, fallbackSource)];
}

function linearWeights(count: number) {
  return normalizedWeights(Array.from({ length: Math.max(1, count) }, () => 1));
}

function positionBasedWeights(count: number) {
  if (count <= 1) return [1];
  if (count === 2) return [0.5, 0.5];

  const middleShare = 0.2 / (count - 2);
  return [0.4, ...Array.from({ length: count - 2 }, () => middleShare), 0.4];
}

function timeDecayWeights(count: number) {
  return normalizedWeights(
    Array.from({ length: Math.max(1, count) }, (_, index) => 2 ** index),
  );
}

function normalizedWeights(weights: number[]) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return total ? weights.map((weight) => weight / total) : weights;
}

function creditWeightedModel(
  journey: Array<ReturnType<typeof attributionDimensions>>,
  weights: number[],
  values: {
    calls?: number;
    journeys?: number;
    leads?: number;
    valueCents?: number;
    wonCents?: number;
  },
  ensureRow: (
    dimensions: ReturnType<typeof attributionDimensions>,
  ) => AttributionReportRow,
  model: "linear" | "position-based" | "time-decay",
) {
  journey.forEach((dimensions, index) => {
    const row = ensureRow(dimensions);
    const weight = weights[index] ?? 0;
    addModelCredit(row, model, {
      journeys: (values.journeys ?? 0) * weight,
      leads: (values.leads ?? 0) * weight,
      valueCents: (values.valueCents ?? 0) * weight,
      wonCents: (values.wonCents ?? 0) * weight,
    });
  });
}

function addModelCredit(
  row: AttributionReportRow,
  model: "linear" | "position-based" | "time-decay",
  values: {
    journeys: number;
    leads: number;
    valueCents: number;
    wonCents: number;
  },
) {
  if (model === "linear") {
    row.linearJourneys += values.journeys;
    row.linearLeads += values.leads;
    row.linearValueCents += values.valueCents;
    row.linearWonCents += values.wonCents;
    return;
  }

  if (model === "position-based") {
    row.positionBasedJourneys += values.journeys;
    row.positionBasedLeads += values.leads;
    row.positionBasedValueCents += values.valueCents;
    row.positionBasedWonCents += values.wonCents;
    return;
  }

  row.timeDecayJourneys += values.journeys;
  row.timeDecayLeads += values.leads;
  row.timeDecayValueCents += values.valueCents;
  row.timeDecayWonCents += values.wonCents;
}

function attributionModelValues(
  row: AttributionReportRow,
  model: AttributionModel,
) {
  if (model === "first-touch") {
    return {
      journeys: row.firstTouchJourneys,
      leads: row.firstTouchLeads,
      revenueCents: row.firstTouchWonCents,
      valueCents: row.firstTouchValueCents,
    };
  }

  if (model === "assisted") {
    return {
      journeys: row.assistedJourneys,
      leads: row.assistedLeads,
      revenueCents: row.assistedWonCents,
      valueCents: row.assistedValueCents,
    };
  }

  if (model === "linear") {
    return {
      journeys: row.linearJourneys,
      leads: row.linearLeads,
      revenueCents: row.linearWonCents,
      valueCents: row.linearValueCents,
    };
  }

  if (model === "position-based") {
    return {
      journeys: row.positionBasedJourneys,
      leads: row.positionBasedLeads,
      revenueCents: row.positionBasedWonCents,
      valueCents: row.positionBasedValueCents,
    };
  }

  if (model === "time-decay") {
    return {
      journeys: row.timeDecayJourneys,
      leads: row.timeDecayLeads,
      revenueCents: row.timeDecayWonCents,
      valueCents: row.timeDecayValueCents,
    };
  }

  return {
    journeys: row.lastTouchJourneys,
    leads: row.lastTouchLeads,
    revenueCents: row.lastTouchWonCents,
    valueCents: row.lastTouchValueCents,
  };
}

function confidenceForAttribution(
  attribution: unknown,
  overrides: Partial<Parameters<typeof calculateAttributionConfidence>[0]> = {},
) {
  const data = jsonObject(attribution);
  const lastTouch = data?.lastTouch;
  const firstTouch = data?.firstTouch;
  const params = attributionTouchParams(attribution);

  return calculateAttributionConfidence({
    ...overrides,
    firstTouch,
    lastTouch,
    timeline: data?.timeline,
    landingPage: stringParam(data?.landingPage),
    currentPage: stringParam(data?.currentPage),
    referrer: stringParam(data?.referrer),
    attributionSource:
      stringParam(params.utm_source) ?? overrides.attributionSource ?? null,
    attributionMedium:
      stringParam(params.utm_medium) ?? overrides.attributionMedium ?? null,
    attributionCampaign:
      stringParam(params.utm_campaign) ?? overrides.attributionCampaign ?? null,
    attributionClickId:
      stringParam(params.gclid) ??
      stringParam(params.gbraid) ??
      stringParam(params.wbraid) ??
      stringParam(params.msclkid) ??
      stringParam(params.fbclid) ??
      overrides.attributionClickId ??
      null,
    attributionClickIdType:
      clickIdTypeFromParams(params) ?? overrides.attributionClickIdType ?? null,
  });
}

function clickIdTypeFromParams(params: Record<string, unknown>) {
  const key = ["gclid", "gbraid", "wbraid", "msclkid", "fbclid"].find((item) =>
    stringParam(params[item]),
  );
  return key ? key.toUpperCase() : null;
}

function createConfidenceAccumulator(): AttributionConfidenceAccumulator {
  return {
    gaps: new Map<string, number>(),
    percentages: [],
  };
}

function addConfidenceSample(
  accumulator: AttributionConfidenceAccumulator,
  confidence: AttributionConfidenceResult,
) {
  accumulator.percentages.push(confidence.percentage);

  for (const factor of confidence.missingFactors) {
    accumulator.gaps.set(
      factor.label,
      (accumulator.gaps.get(factor.label) ?? 0) + 1,
    );
  }
}

function confidenceRollup(
  accumulator: AttributionConfidenceAccumulator,
): AttributionConfidenceRollup {
  const sampleSize = accumulator.percentages.length;
  const average = sampleSize
    ? Math.round(
        accumulator.percentages.reduce(
          (total, percentage) => total + percentage,
          0,
        ) / sampleSize,
      )
    : 0;
  const level = confidenceLevelFromAverage(average, sampleSize);
  const topGaps = Array.from(accumulator.gaps.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 2)
    .map(([label]) => label);

  return {
    average,
    level,
    sampleSize,
    summary: confidenceRollupSummary(level, average, sampleSize, topGaps),
    topGaps,
  };
}

function confidenceLevelFromAverage(
  average: number,
  sampleSize: number,
): AttributionConfidenceLevel {
  if (sampleSize === 0) return "Unknown";
  if (average >= 75) return "High";
  if (average >= 45) return "Medium";
  if (average >= 15) return "Low";
  return "Unknown";
}

function confidenceRollupSummary(
  level: AttributionConfidenceLevel,
  average: number,
  sampleSize: number,
  topGaps: string[],
) {
  if (!sampleSize) return "No scored attribution evidence yet.";

  const evidence = `${average}% average confidence across ${sampleSize} scored item${sampleSize === 1 ? "" : "s"}.`;
  const gaps = topGaps.length
    ? ` Main gaps: ${topGaps.join(", ")}.`
    : " No major gaps.";
  return `${level} confidence. ${evidence}${gaps}`;
}

function offlineMediaChannel(source: string, campaign: string) {
  const value = `${source} ${campaign}`.toLowerCase();

  if (value.includes("radio")) return "Radio";
  if (
    value.includes("print") ||
    value.includes("press") ||
    value.includes("newspaper") ||
    value.includes("magazine")
  ) {
    return "Print";
  }
  if (
    value.includes("event") ||
    value.includes("expo") ||
    value.includes("show")
  )
    return "Event";
  if (
    value.includes("direct mail") ||
    value.includes("door drop") ||
    value.includes("leaflet") ||
    value.includes("flyer")
  ) {
    return "Direct mail";
  }
  if (
    value.includes("qr") ||
    value.includes("poster") ||
    value.includes("outdoor") ||
    value.includes("billboard")
  ) {
    return "Outdoor / QR";
  }
  if (value.includes("offline") || value.includes("manual")) return "Offline";

  return null;
}

function offlineMediaDimensionKey(source: string, campaign: string) {
  return [source, campaign]
    .map((value) => value.trim().toLowerCase())
    .join("::");
}

function offlineCampaignCodeFromAttribution(attribution: unknown) {
  const params = attributionTouchParams(attribution);

  return (
    stringParam(params.id30_offline_code) ||
    stringParam(params.offline_campaign) ||
    stringParam(params.offline_campaign_code) ||
    null
  );
}

function offlineCampaignChannelLabel(channel: OfflineCampaignChannelValue) {
  return offlineCampaignChannelLabels[channel] ?? "Offline";
}

function offlineCampaignCode(
  channel: string,
  source: string,
  campaign: string,
) {
  const base = [channel, source, campaign]
    .map((value) =>
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
    )
    .filter(Boolean)
    .join("-");

  return base || "offline-campaign";
}

function offlineHasQrCue(source: string, campaign: string) {
  return /\b(qr|poster|flyer|leaflet|door-drop|door drop|print|press)\b/i.test(
    `${source} ${campaign}`,
  );
}

function offlineHasPhoneCue(source: string, campaign: string) {
  return /\b(phone|call|tracking|number|radio|print|direct mail|leaflet)\b/i.test(
    `${source} ${campaign}`,
  );
}

function offlineScheduleStatus(startDate: Date | null, endDate: Date | null) {
  const now = new Date();

  if (!startDate && !endDate) {
    return { detail: "Add campaign dates", status: "Unscheduled" };
  }

  if (startDate && now < startDate) {
    return {
      detail: `Starts ${dateFormatter.format(startDate)}`,
      status: "Planned",
    };
  }

  if (endDate && now > endDate) {
    return {
      detail: `Ended ${dateFormatter.format(endDate)}`,
      status: "Ended",
    };
  }

  if (startDate && endDate) {
    const totalDays = Math.max(
      1,
      Math.ceil((endDate.getTime() - startDate.getTime()) / 86_400_000),
    );
    const elapsedDays = Math.min(
      totalDays,
      Math.max(
        0,
        Math.ceil((now.getTime() - startDate.getTime()) / 86_400_000),
      ),
    );
    const remainingDays = Math.max(0, totalDays - elapsedDays);

    return {
      detail: `${remainingDays}d left / ${formatPercent((elapsedDays / totalDays) * 100)} elapsed`,
      status: "Active",
    };
  }

  if (startDate) {
    return {
      detail: `Started ${dateFormatter.format(startDate)}`,
      status: "Active",
    };
  }

  return {
    detail: `Ends ${dateFormatter.format(endDate as Date)}`,
    status: "Active",
  };
}

function offlineBudgetStatus(
  budgetCents: number | null,
  actualCostCents: number | null,
) {
  if (budgetCents === null && actualCostCents === null) {
    return { detail: "Add campaign budget", status: "No budget" };
  }

  if (budgetCents === null) {
    return {
      detail: `${formatMoney(actualCostCents ?? 0)} actual cost logged`,
      status: "Cost logged",
    };
  }

  if (actualCostCents === null) {
    return {
      detail: `${formatMoney(budgetCents)} planned`,
      status: "Budget set",
    };
  }

  const usedPercent =
    budgetCents > 0 ? (actualCostCents / budgetCents) * 100 : null;

  if (usedPercent !== null && usedPercent > 110) {
    return {
      detail: `${formatPercent(usedPercent)} used`,
      status: "Over budget",
    };
  }

  if (usedPercent !== null && usedPercent >= 85) {
    return {
      detail: `${formatPercent(usedPercent)} used`,
      status: "Near budget",
    };
  }

  return {
    detail:
      usedPercent === null
        ? "No planned budget"
        : `${formatPercent(usedPercent)} used`,
    status: "On budget",
  };
}

function offlineMediaNextAction(row: OfflineMediaRow) {
  if (!row.isRegisteredCampaign) {
    return "Create campaign record";
  }

  if (!row.hasQrCue && !row.hasPhoneCue) {
    return "Assign QR or tracking number";
  }

  if (row.scheduleStatus === "Unscheduled") {
    return "Add campaign dates";
  }

  if (row.budgetStatus === "No budget") {
    return "Add campaign budget";
  }

  if (row.budgetStatus === "Over budget" && row.wonDeals === 0) {
    return "Review budget pacing";
  }

  if (!row.leads && !row.calls) {
    return "Check campaign response setup";
  }

  if (row.estimatedCostCents === null) {
    return "Add campaign cost";
  }

  if (row.proposals === 0 && row.leads > 0) {
    return "Review lead quality";
  }

  if (row.wonDeals > 0) {
    return "Review repeat investment";
  }

  return "Monitor campaign";
}

function providerLabel(provider: string) {
  return (
    marketingIntegrationProviderDefinitions.find(
      (definition) => definition.provider === provider,
    )?.name ?? provider
  );
}

function conversionUploadClassification(
  upload: ConversionUploadRow,
): ConversionUploadClassification {
  const message = upload.message?.toLowerCase() ?? "";

  if (upload.status === "SENT") {
    return {
      action: "Provider accepted this conversion.",
      category: "Delivered",
      label: "Accepted",
      severity: "ready",
    };
  }

  if (
    message.includes("credential") ||
    message.includes("oauth") ||
    message.includes("access token") ||
    message.includes("developer token") ||
    message.includes("encrypted")
  ) {
    return {
      action: `Refresh ${providerLabel(upload.provider)} credentials, then retry failed uploads.`,
      category: "Provider setup",
      label: "Credentials blocked",
      severity: "error",
    };
  }

  if (
    message.includes("connected provider") ||
    message.includes("provider configuration")
  ) {
    return {
      action: `Connect and enable ${providerLabel(upload.provider)} conversion uploads.`,
      category: "Provider setup",
      label: "Provider not connected",
      severity: "error",
    };
  }

  if (!upload.conversionName) {
    return {
      action: "Map this lifecycle event to a provider conversion action.",
      category: "Mapping",
      label: "Missing conversion mapping",
      severity: "warning",
    };
  }

  if (!upload.clickIdSource) {
    return {
      action: "Confirm the original visit has a supported ad click ID.",
      category: "Attribution evidence",
      label: "Missing click ID",
      severity: "warning",
    };
  }

  if (message.includes("last 7 days") || message.includes("too old")) {
    return {
      action: "Leave this row skipped; provider upload windows have expired.",
      category: "Provider rules",
      label: "Expired event window",
      severity: "warning",
    };
  }

  if (upload.status === "FAILED" && message.includes("rejected")) {
    return {
      action:
        "Check the provider response and retry after correcting the mapping.",
      category: "Provider response",
      label: "Provider rejected",
      severity: "error",
    };
  }

  if (upload.status === "FAILED") {
    return {
      action: "Retry after reviewing the provider error message.",
      category: "Provider response",
      label: "Provider error",
      severity: "error",
    };
  }

  if (upload.status === "SKIPPED" && message.includes("dry run")) {
    return {
      action: "Dry run passed; send pending uploads when ready.",
      category: "Dry run",
      label: "Dry run checked",
      severity: "info",
    };
  }

  if (upload.status === "SKIPPED") {
    return {
      action: "Review evidence and mapping before re-queueing.",
      category: "Skipped",
      label: "Skipped",
      severity: "warning",
    };
  }

  if (upload.status === "PENDING" && upload.attemptCount > 0) {
    return {
      action:
        upload.message ?? "Review the previous attempt before sending again.",
      category: "Attempt state",
      label: "Waiting after attempt",
      severity: "warning",
    };
  }

  if (message.includes("waiting")) {
    return {
      action: upload.message ?? "Waiting for provider requirements.",
      category: "Provider setup",
      label: "Waiting for requirements",
      severity: "warning",
    };
  }

  return {
    action: "Ready for dry run or upload.",
    category: "Ready",
    label: "Ready",
    severity: "ready",
  };
}

function conversionUploadNextAction(upload: ConversionUploadRow) {
  return conversionUploadClassification(upload).action;
}

function conversionUploadMetricsFor({
  counts,
  providerSummary,
  recentUploads,
  total,
}: {
  counts: ConversionUploadCounts;
  providerSummary: ConversionUploadProviderSummary[];
  recentUploads: ConversionUploadRow[];
  total: number;
}): ConversionUploadMetrics {
  const matchedUploads = providerSummary.reduce(
    (sum, row) => sum + row._count.clickIdSource,
    0,
  );
  const mappedUploads = providerSummary.reduce(
    (sum, row) => sum + row._count.conversionName,
    0,
  );
  const attempted = counts.SENT + counts.FAILED;
  const issueCounts = new Map<
    string,
    {
      category: string;
      count: number;
      label: string;
      nextAction: string;
      severity: ConversionUploadClassification["severity"];
    }
  >();
  let attentionCount = 0;
  let blockerCount = 0;

  for (const upload of recentUploads) {
    const classification = conversionUploadClassification(upload);

    if (classification.severity === "ready") continue;

    attentionCount += 1;
    if (classification.severity === "error") blockerCount += 1;

    const key = `${classification.category}::${classification.label}`;
    const current = issueCounts.get(key) ?? {
      category: classification.category,
      count: 0,
      label: classification.label,
      nextAction: classification.action,
      severity: classification.severity,
    };

    current.count += 1;
    issueCounts.set(key, current);
  }

  return {
    attentionCount,
    blockerCount,
    failedRate: total ? (counts.FAILED / total) * 100 : null,
    issueRows: Array.from(issueCounts.values()).sort(
      (a, b) =>
        severityRank(b.severity) - severityRank(a.severity) ||
        b.count - a.count ||
        a.label.localeCompare(b.label),
    ),
    matchRate: total ? (matchedUploads / total) * 100 : null,
    providerRows: providerSummary
      .map((row) => ({
        matched: row._count.clickIdSource,
        matchRate: row._count._all
          ? (row._count.clickIdSource / row._count._all) * 100
          : null,
        mapped: row._count.conversionName,
        mappingRate: row._count._all
          ? (row._count.conversionName / row._count._all) * 100
          : null,
        provider: row.provider,
        total: row._count._all,
      }))
      .sort(
        (a, b) => b.total - a.total || a.provider.localeCompare(b.provider),
      ),
    sentRate: total ? (counts.SENT / total) * 100 : null,
    uploadedRate: attempted ? (counts.SENT / attempted) * 100 : null,
  };
}

function severityRank(severity: ConversionUploadClassification["severity"]) {
  if (severity === "error") return 3;
  if (severity === "warning") return 2;
  if (severity === "info") return 1;
  return 0;
}

type LeadAttributionRow = {
  id: string;
  campaign: string;
  channel: LeadChannel;
  company: string | null;
  createdAt: Date;
  email: string;
  firstTouch: ReturnType<typeof attributionDimensions>;
  landingPage: string;
  lastTouch: ReturnType<typeof attributionDimensions>;
  leadName: string;
  ownerAvatarUrl: string | null;
  ownerName: string;
  source: string;
  stage: string;
  valueCents: number;
};

type LeadSourceRow = {
  source: string;
  leads: number;
  qualified: number;
  opportunities: number;
  proposals: number;
  wonDeals: number;
  calls: number;
  valueCents: number;
  openPipelineCents: number;
  weightedPipelineCents: number;
  wonCents: number;
  avgLeadValueCents: number | null;
  avgDealValueCents: number | null;
  closeRate: number | null;
  costPerLeadCents: number | null;
  costPerQualifiedCents: number | null;
  costPerOpportunityCents: number | null;
  costPerWonCents: number | null;
  confidence: AttributionConfidenceRollup;
  latest: Date | null;
};

type AttributionConfidenceRollup = {
  average: number;
  level: AttributionConfidenceLevel;
  sampleSize: number;
  summary: string;
  topGaps: string[];
};

type ConversionUploadRow = {
  id: string;
  provider: string;
  conversionType: string;
  entityType: string;
  entityId: string;
  status: string;
  valueCents: number | null;
  currency: string;
  occurredAt: Date;
  clickIdSource: string | null;
  conversionName: string | null;
  message: string | null;
  attemptCount: number;
  lastAttemptAt: Date | null;
  uploadedAt: Date | null;
  createdAt: Date;
};

type ConversionUploadCounts = {
  FAILED: number;
  PENDING: number;
  SENT: number;
  SKIPPED: number;
};

type ConversionUploadProviderSummary = {
  provider: string;
  _count: {
    _all: number;
    clickIdSource: number;
    conversionName: number;
  };
};

type ConversionUploadClassification = {
  action: string;
  category: string;
  label: string;
  severity: "error" | "info" | "ready" | "warning";
};

type ConversionUploadIssueMetric = {
  category: string;
  count: number;
  label: string;
  nextAction: string;
  severity: ConversionUploadClassification["severity"];
};

type ConversionUploadMetrics = {
  attentionCount: number;
  blockerCount: number;
  failedRate: number | null;
  issueRows: ConversionUploadIssueMetric[];
  matchRate: number | null;
  providerRows: ConversionUploadProviderMetric[];
  sentRate: number | null;
  uploadedRate: number | null;
};

type ConversionUploadProviderMetric = {
  matched: number;
  matchRate: number | null;
  mapped: number;
  mappingRate: number | null;
  provider: string;
  total: number;
};

type AttributionReportRow = {
  assistedCalls: number;
  assistedJourneys: number;
  assistedLeads: number;
  assistedValueCents: number;
  assistedWonCents: number;
  campaign: string;
  calls: number;
  clickIds: Set<string>;
  firstTouchJourneys: number;
  firstTouchLeads: number;
  firstTouchValueCents: number;
  firstTouchWonCents: number;
  forms: number;
  latest: Date | null;
  lastTouchJourneys: number;
  lastTouchLeads: number;
  lastTouchValueCents: number;
  lastTouchWonCents: number;
  leads: number;
  linearJourneys: number;
  linearLeads: number;
  linearValueCents: number;
  linearWonCents: number;
  medium: string;
  positionBasedJourneys: number;
  positionBasedLeads: number;
  positionBasedValueCents: number;
  positionBasedWonCents: number;
  records: number;
  source: string;
  timeDecayJourneys: number;
  timeDecayLeads: number;
  timeDecayValueCents: number;
  timeDecayWonCents: number;
  valueCents: number;
  wonCents: number;
  confidence: AttributionConfidenceAccumulator;
};

type AttributionModelReportRow = AttributionReportRow & {
  confidenceRollup: AttributionConfidenceRollup;
  modelJourneys: number;
  modelLeads: number;
  modelRevenueCents: number;
  modelValueCents: number;
};

type AttributionConfidenceAccumulator = {
  percentages: number[];
  gaps: Map<string, number>;
};

type AssistedJourneyRow = {
  assistedCalls: number;
  assistedJourneys: number;
  assistedLeads: number;
  assistedValueCents: number;
  assistedWonCents: number;
  campaign: string;
  firstTouchJourneys: number;
  firstTouchLeads: number;
  firstTouchValueCents: number;
  firstTouchWonCents: number;
  lastTouchJourneys: number;
  lastTouchLeads: number;
  lastTouchValueCents: number;
  lastTouchWonCents: number;
  medium: string;
  source: string;
};

type OfflineMediaRow = {
  budgetDetail: string;
  budgetStatus: string;
  calls: number;
  campaign: string;
  campaignCode: string;
  campaignId: string | null;
  campaignStatus: OfflineCampaignStatusValue | null;
  channel: string;
  costPerLeadCents: number | null;
  estimatedCostCents: number | null;
  estimatedRoi: number | null;
  hasPhoneCue: boolean;
  hasQrCue: boolean;
  isRegisteredCampaign: boolean;
  latest: Date | null;
  leads: number;
  nextAction: string;
  openPipelineCents: number;
  proposals: number;
  responseRecords: number;
  scheduleDetail: string;
  scheduleStatus: string;
  source: string;
  touchpoints: number;
  trackingNumbers: number;
  valueCents: number;
  weightedPipelineCents: number;
  wonCents: number;
  wonDeals: number;
};

type SalesQualityRow = {
  avgProbability: number | null;
  avgResponseMinutes: number | null;
  avgTimeToCloseDays: number | null;
  closeRate: number | null;
  contacted: number;
  contactedRate: number | null;
  leads: number;
  lostDeals: number;
  lostReasons: Array<{ count: number; reason: string }>;
  missingCloseDate: number;
  missingNextStep: number;
  openPipelineCents: number;
  ownerName: string;
  proposals: number;
  qualified: number;
  qualityScore: number;
  source: string;
  staleOpen: number;
  weightedPipelineCents: number;
  wonCents: number;
  wonDeals: number;
};

type SalesQualityAccumulator = SalesQualityRow & {
  lostReasonCounts: Map<string, number>;
  probabilityTotal: number;
  responseMinutesCount: number;
  responseMinutesTotal: number;
  timeToCloseDaysCount: number;
  timeToCloseDaysTotal: number;
};

type CustomStageRollupRow = {
  avgProbability: number | null;
  bucket: string;
  leads: number;
  lostDeals: number;
  openPipelineCents: number;
  proposals: number;
  qualified: number;
  sortOrder: number;
  stageName: string;
  weightedPipelineCents: number;
  wonCents: number;
  wonDeals: number;
};

type CustomStageRollupAccumulator = CustomStageRollupRow & {
  probabilityTotal: number;
};

type SalesLifecycleTransitionRow = {
  count: number;
  fromLabel: string;
  latest: Date | null;
  lostReason: string | null;
  source: string;
  toLabel: string;
  valueCents: number;
};

type SalesLifecycleTransitionAccumulator = SalesLifecycleTransitionRow & {
  lostReasonCounts: Map<string, number>;
  sourceCounts: Map<string, number>;
};

type SalesLifecycleEventForRollup = {
  eventType: string;
  fromPipelineStage: { name: string } | null;
  fromStage: string | null;
  lostReason: string | null;
  occurredAt: Date;
  opportunity: { source: string | null; valueCents: number } | null;
  toPipelineStage: { name: string } | null;
  toStage: string | null;
};

function leadChannelFromDimensions(
  dimensions: ReturnType<typeof attributionDimensions>,
): LeadChannel {
  const source = dimensions.source.toLowerCase();
  const medium = dimensions.medium.toLowerCase();

  if (
    source.includes("meta") ||
    source.includes("facebook") ||
    source.includes("instagram")
  ) {
    return "meta";
  }
  if (source.includes("linkedin") || dimensions.clickIdSource === "li_fat_id")
    return "linkedin";
  if (source.includes("google") || dimensions.clickIdSource === "gclid")
    return "google";
  if (
    source.includes("bing") ||
    source.includes("microsoft") ||
    dimensions.clickIdSource === "msclkid"
  ) {
    return "bing";
  }
  if (source.includes("email") || medium.includes("email")) return "email";
  if (source.includes("sms") || medium.includes("sms")) return "sms";
  if (source === "direct" || medium === "direct") return "direct";
  if (medium.includes("organic") || source.includes("organic"))
    return "organic";
  if (source !== "unattributed" || medium.includes("referral"))
    return "referral";
  return "direct";
}

function leadLandingPage(attribution: unknown) {
  const data = jsonObject(attribution);
  const touch = jsonObject(data?.lastTouch) ?? jsonObject(data?.firstTouch);
  const page =
    stringParam(data?.landingPage) ||
    stringParam(touch?.landingPage) ||
    stringParam(touch?.url);

  if (!page) return "/";

  try {
    return new URL(page).pathname || "/";
  } catch {
    return page;
  }
}

function stageLabel(stage: string) {
  return stage
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function initials(value: string) {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "L"
  );
}

const lifecycleStageRank: Record<string, number> = {
  LEAD: 1,
  QUALIFIED: 2,
  PROPOSAL: 3,
  NEGOTIATION: 4,
  WON: 5,
  LOST: 0,
};

type LifecycleFunnelRow = {
  key: string;
  label: string;
  count: number;
  valueCents: number | null;
  costCents: number | null;
  conversionRate: number | null;
  dropOffRate: number | null;
  detail: string;
};

function isAtLeastLifecycleStage(stage: string, target: string) {
  return (lifecycleStageRank[stage] ?? 0) >= (lifecycleStageRank[target] ?? 0);
}

function buildLifecycleFunnelRows({
  sessions,
  spendCents,
  totals,
}: {
  sessions: number;
  spendCents: number;
  totals: MarketingOpportunityTotals;
}): LifecycleFunnelRow[] {
  const rows = [
    {
      key: "sessions",
      label: "Sessions",
      count: sessions,
      valueCents: null,
      detail: "Tracked visitor sessions",
    },
    {
      key: "leads",
      label: "Leads",
      count: totals.totalLeads,
      valueCents: null,
      detail: "CRM opportunities created",
    },
    {
      key: "qualified",
      label: "Qualified pipeline",
      count: totals.qualifiedLeads,
      valueCents: totals.qualifiedValueCents,
      detail: "Qualified, proposal, negotiation or won",
    },
    {
      key: "proposals",
      label: "Proposals",
      count: totals.proposalCount,
      valueCents: totals.proposalValueCents,
      detail: "Proposal, negotiation or won",
    },
    {
      key: "won",
      label: "Won deals",
      count: totals.wonDeals,
      valueCents: totals.wonRevenueCents,
      detail: "Closed won revenue",
    },
    {
      key: "revenue",
      label: "Revenue",
      count: totals.wonDeals,
      valueCents: totals.wonRevenueCents,
      detail: "Won revenue value",
    },
  ];

  return rows.map((row, index) => {
    const previous = rows[index - 1];
    const conversionRate =
      previous && previous.count > 0
        ? (row.count / previous.count) * 100
        : null;

    return {
      ...row,
      costCents:
        spendCents > 0 && row.count > 0 && row.key !== "sessions"
          ? Math.round(spendCents / row.count)
          : null,
      conversionRate,
      dropOffRate:
        conversionRate === null ? null : Math.max(0, 100 - conversionRate),
    };
  });
}

function lifecycleTransitionLabel(
  stage: string | null,
  pipelineStage: { name: string } | null,
  fallback: string,
) {
  return pipelineStage?.name || (stage ? stageLabel(stage) : fallback);
}

function topCountLabel(counts: Map<string, number>) {
  const [label] =
    Array.from(counts.entries()).sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )[0] ?? [];

  return label ?? null;
}

function buildSalesLifecycleTransitionRows(
  events: SalesLifecycleEventForRollup[],
): SalesLifecycleTransitionRow[] {
  const rows = new Map<string, SalesLifecycleTransitionAccumulator>();

  for (const event of events) {
    if (event.eventType !== "CREATED" && event.eventType !== "STAGE_CHANGED") {
      continue;
    }

    const fromLabel =
      event.eventType === "CREATED"
        ? "Created"
        : lifecycleTransitionLabel(
            event.fromStage,
            event.fromPipelineStage,
            "Unknown",
          );
    const toLabel = lifecycleTransitionLabel(
      event.toStage,
      event.toPipelineStage,
      "Unknown",
    );
    const key = `${fromLabel}::${toLabel}`;
    const current = rows.get(key) ?? {
      count: 0,
      fromLabel,
      latest: null,
      lostReason: null,
      lostReasonCounts: new Map<string, number>(),
      source: "Mixed sources",
      sourceCounts: new Map<string, number>(),
      toLabel,
      valueCents: 0,
    };
    const source = event.opportunity?.source || "Unattributed";

    current.count += 1;
    current.valueCents += event.opportunity?.valueCents ?? 0;
    current.sourceCounts.set(
      source,
      (current.sourceCounts.get(source) ?? 0) + 1,
    );

    if (event.toStage === "LOST") {
      const lostReason = event.lostReason?.trim() || "No reason recorded";
      current.lostReasonCounts.set(
        lostReason,
        (current.lostReasonCounts.get(lostReason) ?? 0) + 1,
      );
    }

    current.latest =
      !current.latest || event.occurredAt > current.latest
        ? event.occurredAt
        : current.latest;
    rows.set(key, current);
  }

  return Array.from(rows.values())
    .map(({ lostReasonCounts, sourceCounts, ...row }) => ({
      ...row,
      lostReason: topCountLabel(lostReasonCounts),
      source: topCountLabel(sourceCounts) ?? row.source,
    }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        right.valueCents - left.valueCents ||
        (right.latest?.getTime() ?? 0) - (left.latest?.getTime() ?? 0),
    );
}

export default async function MarketingPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const activeView = parseMarketingView(params.view);
  const activeRange = parseMarketingRange(params.range);
  const executivePrintMode =
    activeView === "executive-report" && flagValue(params.print);
  const activeAttributionModel = parseAttributionModel(params.model);
  const activeLeadChannel = parseLeadChannel(params.channel);
  const activeLeadStatus = parseLeadStatus(params.status);
  const leadSearchQuery = searchValue(params.q).toLowerCase();
  const activeViewMeta = viewMeta[activeView];
  const activeViewAction = viewActions[activeView];
  const activeRangeWindow = marketingRangeWindow(activeRange);
  const activeDateWhere = activeRangeWindow.startDate
    ? { gte: activeRangeWindow.startDate, lte: activeRangeWindow.endDate }
    : undefined;
  const marketingRollupRange =
    marketingDailyRollupRangeFromWindow(activeRangeWindow);
  const marketingRollupSummary = marketingRollupRange
    ? await readMarketingDailyRollupSummary(marketingRollupRange)
    : null;
  const offlineCampaignWhere = activeRangeWindow.startDate
    ? {
        OR: [
          {
            AND: [
              {
                OR: [
                  { startDate: null },
                  { startDate: { lte: activeRangeWindow.endDate } },
                ],
              },
              {
                OR: [
                  { endDate: null },
                  { endDate: { gte: activeRangeWindow.startDate } },
                ],
              },
            ],
          },
          { attributionRecords: { some: { createdAt: activeDateWhere } } },
          { touchpoints: { some: { capturedAt: activeDateWhere } } },
          {
            trackingNumbers: {
              some: { records: { some: { createdAt: activeDateWhere } } },
            },
          },
        ],
      }
    : undefined;
  const [
    opportunityTotals,
    opportunities,
    salesLifecycleEvents,
    callLogs,
    sessionCount,
    attributionRecords,
    offlineCampaigns,
    campaignSpendSummary,
    campaignSpendRows,
    latestSyncLogs,
    conversionUploads,
    conversionUploadStatusSummary,
    conversionUploadProviderSummary,
    providerConnections,
  ] = await Promise.all([
    getMarketingOpportunityTotals(activeDateWhere),
    prisma.salesOpportunity.findMany({
      where: activeDateWhere ? { createdAt: activeDateWhere } : undefined,
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true,
        title: true,
        source: true,
        stage: true,
        salesPipelineStage: {
          select: {
            id: true,
            name: true,
            bucket: true,
            sortOrder: true,
          },
        },
        valueCents: true,
        probability: true,
        currency: true,
        expectedCloseDate: true,
        firstContactedAt: true,
        closedAt: true,
        lostReason: true,
        nextStep: true,
        createdAt: true,
        updatedAt: true,
        attribution: true,
        contact: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            companyName: true,
            company: { select: { name: true } },
          },
        },
        owner: {
          select: {
            name: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
        communications: {
          where: { direction: "OUTBOUND" },
          orderBy: { occurredAt: "asc" },
          take: 1,
          select: { occurredAt: true },
        },
      },
    }),
    prisma.salesLifecycleEvent.findMany({
      where: activeDateWhere ? { occurredAt: activeDateWhere } : undefined,
      orderBy: { occurredAt: "desc" },
      take: 500,
      select: {
        eventType: true,
        fromStage: true,
        toStage: true,
        lostReason: true,
        occurredAt: true,
        fromPipelineStage: {
          select: {
            name: true,
          },
        },
        toPipelineStage: {
          select: {
            name: true,
          },
        },
        opportunity: {
          select: {
            source: true,
            valueCents: true,
          },
        },
      },
    }),
    prisma.callLog.findMany({
      where: activeDateWhere ? { startedAt: activeDateWhere } : undefined,
      orderBy: { startedAt: "desc" },
      take: 500,
      select: {
        id: true,
        direction: true,
        status: true,
        durationSeconds: true,
        startedAt: true,
        fromNumber: true,
        toNumber: true,
        attribution: true,
        contact: { select: { firstName: true, lastName: true } },
        opportunity: {
          select: { title: true, source: true, valueCents: true },
        },
      },
    }),
    marketingRollupSummary
      ? Promise.resolve(marketingRollupSummary.totals.sessions)
      : prisma.attributionSnapshot.count({
          where: activeDateWhere ? { updatedAt: activeDateWhere } : undefined,
        }),
    prisma.attributionRecord.findMany({
      where: activeDateWhere ? { createdAt: activeDateWhere } : undefined,
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true,
        source: true,
        createdAt: true,
        firstTouch: true,
        lastTouch: true,
        timeline: true,
        landingPage: true,
        currentPage: true,
        referrer: true,
        trackingPhoneNumber: true,
        opportunityId: true,
        callLogId: true,
        offlineCampaignId: true,
        trackingNumber: {
          select: {
            offlineCampaignId: true,
          },
        },
      },
    }),
    prisma.offlineCampaign.findMany({
      where: offlineCampaignWhere,
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }, { name: "asc" }],
      take: 200,
      select: {
        id: true,
        name: true,
        code: true,
        channel: true,
        status: true,
        source: true,
        campaign: true,
        destinationUrl: true,
        startDate: true,
        endDate: true,
        budgetCents: true,
        actualCostCents: true,
        updatedAt: true,
        _count: {
          select: {
            trackingNumbers: true,
            attributionRecords: true,
            touchpoints: true,
          },
        },
      },
    }),
    marketingRollupSummary
      ? Promise.resolve(campaignSpendSummaryFromRollup(marketingRollupSummary))
      : prisma.marketingCampaignSpend.aggregate({
          where: activeDateWhere ? { date: activeDateWhere } : undefined,
          _sum: {
            costMicros: true,
            clicks: true,
            impressions: true,
            conversions: true,
          },
        }),
    prisma.marketingCampaignSpend.findMany({
      where: activeDateWhere ? { date: activeDateWhere } : undefined,
      orderBy: { date: "desc" },
      take: 500,
      select: {
        id: true,
        provider: true,
        accountId: true,
        campaignName: true,
        campaignId: true,
        date: true,
        currency: true,
        costMicros: true,
        impressions: true,
        clicks: true,
        conversions: true,
      },
    }),
    prisma.marketingIntegrationSyncLog.findMany({
      orderBy: { startedAt: "desc" },
      take: 10,
      select: {
        id: true,
        provider: true,
        status: true,
        syncType: true,
        recordsRead: true,
        recordsWritten: true,
        startedAt: true,
        message: true,
      },
    }),
    prisma.marketingConversionUpload.findMany({
      where: activeDateWhere ? { occurredAt: activeDateWhere } : undefined,
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        provider: true,
        conversionType: true,
        entityType: true,
        entityId: true,
        status: true,
        valueCents: true,
        currency: true,
        occurredAt: true,
        clickIdSource: true,
        conversionName: true,
        message: true,
        attemptCount: true,
        lastAttemptAt: true,
        uploadedAt: true,
        createdAt: true,
      },
    }),
    prisma.marketingConversionUpload.groupBy({
      where: activeDateWhere ? { occurredAt: activeDateWhere } : undefined,
      by: ["status"],
      _count: {
        _all: true,
      },
    }),
    prisma.marketingConversionUpload.groupBy({
      where: activeDateWhere ? { occurredAt: activeDateWhere } : undefined,
      by: ["provider"],
      _count: {
        _all: true,
        clickIdSource: true,
        conversionName: true,
      },
    }),
    prisma.integrationConnection.findMany({
      where: {
        provider: {
          in: marketingIntegrationProviderDefinitions.map(
            (provider) => provider.provider,
          ),
        },
      },
      select: {
        provider: true,
        status: true,
        config: true,
      },
    }),
  ]);

  const totalLeads = opportunityTotals.totalLeads;
  const attributedLeads = opportunityTotals.attributedLeads;
  const wonRevenue = opportunityTotals.wonRevenueCents;
  const qualifiedLeads = opportunityTotals.qualifiedLeads;
  const opportunityCount = qualifiedLeads;
  const proposalCount = opportunityTotals.proposalCount;
  const wonDeals = opportunityTotals.wonDeals;
  const pipelineValue = opportunityTotals.pipelineValueCents;
  const weightedPipelineValue = opportunityTotals.weightedPipelineValueCents;
  const attributedCalls = callLogs.filter((call) => call.attribution).length;
  const totalCalls = callLogs.filter(
    (call) => call.direction === "INBOUND",
  ).length;
  const totalSpendCents = microsToCents(campaignSpendSummary._sum.costMicros);
  const totalClicks = campaignSpendSummary._sum.clicks ?? 0;
  const totalImpressions = campaignSpendSummary._sum.impressions ?? 0;
  const totalConversions = campaignSpendSummary._sum.conversions ?? 0;
  const costPerLeadCents =
    totalSpendCents > 0 && totalLeads > 0
      ? Math.round(totalSpendCents / totalLeads)
      : null;
  const costPerConversionCents =
    totalSpendCents > 0 && totalConversions > 0
      ? Math.round(totalSpendCents / totalConversions)
      : null;
  const roas = totalSpendCents > 0 ? wonRevenue / totalSpendCents : null;
  const lifecycleFunnelRows = buildLifecycleFunnelRows({
    sessions: sessionCount,
    spendCents: totalSpendCents,
    totals: opportunityTotals,
  });
  const sourceMap = new Map<
    string,
    {
      leads: number;
      qualified: number;
      opportunities: number;
      proposals: number;
      wonDeals: number;
      calls: number;
      valueCents: number;
      openPipelineCents: number;
      weightedPipelineCents: number;
      wonCents: number;
      confidence: AttributionConfidenceAccumulator;
      latest: Date | null;
    }
  >();

  for (const opportunity of opportunities) {
    const source =
      opportunity.source || sourceFromAttribution(opportunity.attribution);
    const current = sourceMap.get(source) ?? {
      leads: 0,
      qualified: 0,
      opportunities: 0,
      proposals: 0,
      wonDeals: 0,
      calls: 0,
      valueCents: 0,
      openPipelineCents: 0,
      weightedPipelineCents: 0,
      wonCents: 0,
      confidence: createConfidenceAccumulator(),
      latest: null,
    };
    addConfidenceSample(
      current.confidence,
      confidenceForAttribution(opportunity.attribution, {
        attributionSource: opportunity.source,
        matchedOpportunityId: opportunity.id,
        recordsCount: 1,
      }),
    );

    current.leads += 1;
    if (isAtLeastLifecycleStage(opportunity.stage, "QUALIFIED")) {
      current.qualified += 1;
      current.opportunities += 1;
    }
    if (isAtLeastLifecycleStage(opportunity.stage, "PROPOSAL")) {
      current.proposals += 1;
    }
    if (opportunity.stage === "WON") {
      current.wonDeals += 1;
    }
    current.valueCents += opportunity.valueCents;
    if (opportunity.stage !== "WON" && opportunity.stage !== "LOST") {
      current.openPipelineCents += opportunity.valueCents;
      current.weightedPipelineCents += Math.round(
        (opportunity.valueCents * opportunity.probability) / 100,
      );
    }
    current.wonCents +=
      opportunity.stage === "WON" ? opportunity.valueCents : 0;
    current.latest =
      !current.latest || opportunity.createdAt > current.latest
        ? opportunity.createdAt
        : current.latest;
    sourceMap.set(source, current);
  }

  for (const call of callLogs) {
    const source =
      call.opportunity?.source || sourceFromAttribution(call.attribution);
    const current = sourceMap.get(source) ?? {
      leads: 0,
      qualified: 0,
      opportunities: 0,
      proposals: 0,
      wonDeals: 0,
      calls: 0,
      valueCents: 0,
      openPipelineCents: 0,
      weightedPipelineCents: 0,
      wonCents: 0,
      confidence: createConfidenceAccumulator(),
      latest: null,
    };
    addConfidenceSample(
      current.confidence,
      confidenceForAttribution(call.attribution, {
        attributionSource: call.opportunity?.source,
        recordsCount: call.direction === "INBOUND" ? 1 : 0,
      }),
    );

    current.calls += 1;
    current.latest =
      !current.latest || call.startedAt > current.latest
        ? call.startedAt
        : current.latest;
    sourceMap.set(source, current);
  }

  const sourceRows = Array.from(sourceMap.entries())
    .map(([source, metrics]) => ({
      source,
      ...metrics,
      avgLeadValueCents:
        metrics.leads > 0
          ? Math.round(metrics.valueCents / metrics.leads)
          : null,
      avgDealValueCents:
        metrics.wonDeals > 0
          ? Math.round(metrics.wonCents / metrics.wonDeals)
          : null,
      closeRate: percentOf(metrics.wonDeals, metrics.opportunities),
      confidence: confidenceRollup(metrics.confidence),
      costPerLeadCents:
        totalSpendCents > 0 && metrics.leads > 0
          ? Math.round(totalSpendCents / metrics.leads)
          : null,
      costPerQualifiedCents:
        totalSpendCents > 0 && metrics.qualified > 0
          ? Math.round(totalSpendCents / metrics.qualified)
          : null,
      costPerOpportunityCents:
        totalSpendCents > 0 && metrics.opportunities > 0
          ? Math.round(totalSpendCents / metrics.opportunities)
          : null,
      costPerWonCents:
        totalSpendCents > 0 && metrics.wonDeals > 0
          ? Math.round(totalSpendCents / metrics.wonDeals)
          : null,
    }))
    .sort((a, b) => b.leads + b.calls - (a.leads + a.calls));
  const offlineMediaMap = new Map<string, OfflineMediaRow>();
  const offlineCampaignById = new Map(
    offlineCampaigns.map((campaign) => [campaign.id, campaign]),
  );
  const offlineCampaignByCode = new Map(
    offlineCampaigns.map((campaign) => [campaign.code.toLowerCase(), campaign]),
  );
  const offlineCampaignByDimensions = new Map<
    string,
    (typeof offlineCampaigns)[number]
  >();

  for (const campaign of offlineCampaigns) {
    const key = offlineMediaDimensionKey(campaign.source, campaign.campaign);
    if (!offlineCampaignByDimensions.has(key)) {
      offlineCampaignByDimensions.set(key, campaign);
    }
  }

  const ensureCampaignOfflineMediaRow = (
    campaign: (typeof offlineCampaigns)[number],
  ) => {
    const key = `campaign:${campaign.id}`;
    const budgetStatus = offlineBudgetStatus(
      campaign.budgetCents,
      campaign.actualCostCents,
    );
    const scheduleStatus = offlineScheduleStatus(
      campaign.startDate,
      campaign.endDate,
    );
    const current = offlineMediaMap.get(key) ?? {
      budgetDetail: budgetStatus.detail,
      budgetStatus: budgetStatus.status,
      calls: 0,
      campaign: campaign.campaign || campaign.name,
      campaignCode: campaign.code,
      campaignId: campaign.id,
      campaignStatus: campaign.status,
      channel: offlineCampaignChannelLabel(campaign.channel),
      costPerLeadCents: null,
      estimatedCostCents: campaign.actualCostCents ?? campaign.budgetCents,
      estimatedRoi: null,
      hasPhoneCue:
        campaign._count.trackingNumbers > 0 ||
        offlineHasPhoneCue(campaign.source, campaign.campaign),
      hasQrCue:
        Boolean(campaign.destinationUrl) ||
        campaign.channel === "QR" ||
        offlineHasQrCue(campaign.source, campaign.campaign),
      isRegisteredCampaign: true,
      latest: campaign.updatedAt,
      leads: 0,
      nextAction: "Monitor campaign",
      openPipelineCents: 0,
      proposals: 0,
      responseRecords: 0,
      scheduleDetail: scheduleStatus.detail,
      scheduleStatus: scheduleStatus.status,
      source: campaign.source,
      touchpoints: campaign._count.touchpoints,
      trackingNumbers: campaign._count.trackingNumbers,
      valueCents: 0,
      weightedPipelineCents: 0,
      wonCents: 0,
      wonDeals: 0,
    };

    offlineMediaMap.set(key, current);
    return current;
  };
  const ensureMarkerOfflineMediaRow = ({
    campaign,
    source,
  }: {
    campaign: string;
    source: string;
  }) => {
    const channel = offlineMediaChannel(source, campaign);
    if (!channel) return null;

    const key = [channel, source, campaign].join("::");
    const current = offlineMediaMap.get(key) ?? {
      budgetDetail: "Create a campaign record to track budget",
      budgetStatus: "Unknown",
      calls: 0,
      campaign,
      campaignCode: offlineCampaignCode(channel, source, campaign),
      campaignId: null,
      campaignStatus: null,
      channel,
      costPerLeadCents: null,
      estimatedCostCents: null,
      estimatedRoi: null,
      hasPhoneCue: offlineHasPhoneCue(source, campaign),
      hasQrCue: offlineHasQrCue(source, campaign),
      isRegisteredCampaign: false,
      latest: null,
      leads: 0,
      nextAction: "Add response metadata",
      openPipelineCents: 0,
      proposals: 0,
      responseRecords: 0,
      scheduleDetail: "Create a campaign record to track dates",
      scheduleStatus: "Unknown",
      source,
      touchpoints: 0,
      trackingNumbers: 0,
      valueCents: 0,
      weightedPipelineCents: 0,
      wonCents: 0,
      wonDeals: 0,
    };

    offlineMediaMap.set(key, current);
    return current;
  };

  for (const campaign of offlineCampaigns) {
    ensureCampaignOfflineMediaRow(campaign);
  }

  const offlineCampaignIdByOpportunityId = new Map<string, string>();
  const offlineCampaignIdByCallLogId = new Map<string, string>();
  const offlineCampaignForAttribution = (
    attribution: unknown,
    fallbackSource?: string | null,
  ) => {
    const code = offlineCampaignCodeFromAttribution(attribution);
    if (code) {
      const campaign = offlineCampaignByCode.get(code.toLowerCase());
      if (campaign) return campaign;
    }

    const dimensions = attributionDimensions(attribution, fallbackSource);
    return (
      offlineCampaignByDimensions.get(
        offlineMediaDimensionKey(dimensions.source, dimensions.campaign),
      ) ?? null
    );
  };
  const offlineMediaRowForDimensions = ({
    attribution,
    campaign,
    campaignId,
    source,
  }: {
    attribution?: unknown;
    campaign: string;
    campaignId?: string | null;
    source: string;
  }) => {
    const registeredCampaign =
      (campaignId ? offlineCampaignById.get(campaignId) : null) ??
      (attribution
        ? offlineCampaignForAttribution(attribution, source)
        : null) ??
      offlineCampaignByDimensions.get(
        offlineMediaDimensionKey(source, campaign),
      );

    return registeredCampaign
      ? ensureCampaignOfflineMediaRow(registeredCampaign)
      : ensureMarkerOfflineMediaRow({ campaign, source });
  };

  for (const record of attributionRecords) {
    const recordAttribution = {
      firstTouch: record.firstTouch,
      lastTouch: record.lastTouch,
      timeline: record.timeline,
      referrer: record.referrer,
    };
    const linkedCampaignId =
      record.offlineCampaignId ??
      record.trackingNumber?.offlineCampaignId ??
      offlineCampaignForAttribution(recordAttribution, record.source)?.id ??
      null;

    if (linkedCampaignId && record.opportunityId) {
      offlineCampaignIdByOpportunityId.set(
        record.opportunityId,
        linkedCampaignId,
      );
    }
    if (linkedCampaignId && record.callLogId) {
      offlineCampaignIdByCallLogId.set(record.callLogId, linkedCampaignId);
    }
  }

  for (const opportunity of opportunities) {
    const dimensions = attributionDimensions(
      opportunity.attribution,
      opportunity.source,
    );
    const source = opportunity.source || dimensions.source;
    const row = offlineMediaRowForDimensions({
      attribution: opportunity.attribution,
      campaign: dimensions.campaign,
      campaignId: offlineCampaignIdByOpportunityId.get(opportunity.id),
      source,
    });
    if (!row) continue;

    row.leads += 1;
    row.valueCents += opportunity.valueCents;
    if (isAtLeastLifecycleStage(opportunity.stage, "PROPOSAL"))
      row.proposals += 1;
    if (opportunity.stage === "WON") {
      row.wonDeals += 1;
      row.wonCents += opportunity.valueCents;
    }
    if (opportunity.stage !== "WON" && opportunity.stage !== "LOST") {
      row.openPipelineCents += opportunity.valueCents;
      row.weightedPipelineCents += Math.round(
        (opportunity.valueCents * opportunity.probability) / 100,
      );
    }
    row.latest =
      !row.latest || opportunity.createdAt > row.latest
        ? opportunity.createdAt
        : row.latest;
  }

  for (const call of callLogs) {
    const dimensions = attributionDimensions(
      call.attribution,
      call.opportunity?.source,
    );
    const source = call.opportunity?.source || dimensions.source;
    const row = offlineMediaRowForDimensions({
      attribution: call.attribution,
      campaign: dimensions.campaign,
      campaignId: offlineCampaignIdByCallLogId.get(call.id),
      source,
    });
    if (!row) continue;

    if (call.direction === "INBOUND") row.calls += 1;
    row.latest =
      !row.latest || call.startedAt > row.latest ? call.startedAt : row.latest;
  }

  for (const record of attributionRecords) {
    const dimensions = attributionDimensions(
      {
        firstTouch: record.firstTouch,
        lastTouch: record.lastTouch,
        timeline: record.timeline,
        referrer: record.referrer,
      },
      record.source,
    );
    const linkedCampaignId =
      record.offlineCampaignId ??
      record.trackingNumber?.offlineCampaignId ??
      offlineCampaignForAttribution(
        {
          firstTouch: record.firstTouch,
          lastTouch: record.lastTouch,
          timeline: record.timeline,
          referrer: record.referrer,
        },
        record.source,
      )?.id ??
      null;
    const row = offlineMediaRowForDimensions({
      campaign: dimensions.campaign,
      campaignId: linkedCampaignId,
      source: dimensions.source,
    });
    if (!row) continue;

    row.responseRecords += 1;
    row.latest =
      !row.latest || record.createdAt > row.latest
        ? record.createdAt
        : row.latest;
  }

  const offlineMediaRows = Array.from(offlineMediaMap.values()).sort(
    (a, b) =>
      b.wonCents - a.wonCents ||
      b.weightedPipelineCents - a.weightedPipelineCents ||
      b.leads + b.calls - (a.leads + a.calls),
  );
  const estimatedOfflineCostCents = offlineMediaRows.some(
    (row) => row.estimatedCostCents !== null,
  )
    ? 0
    : offlineMediaRows.length
      ? Math.round(totalSpendCents / offlineMediaRows.length)
      : 0;
  for (const row of offlineMediaRows) {
    row.estimatedCostCents =
      row.estimatedCostCents ??
      (estimatedOfflineCostCents > 0 ? estimatedOfflineCostCents : null);
    row.costPerLeadCents =
      row.estimatedCostCents !== null && row.leads > 0
        ? Math.round(row.estimatedCostCents / row.leads)
        : null;
    row.estimatedRoi =
      row.estimatedCostCents !== null && row.estimatedCostCents > 0
        ? row.wonCents / row.estimatedCostCents
        : null;
    row.nextAction = offlineMediaNextAction(row);
  }
  const offlineMediaPlanningGaps = offlineMediaRows.filter(
    (row) =>
      row.scheduleStatus === "Unscheduled" ||
      row.budgetStatus === "No budget" ||
      row.budgetStatus === "Over budget",
  ).length;
  const staleOpportunityCutoff = new Date();
  staleOpportunityCutoff.setDate(staleOpportunityCutoff.getDate() - 30);
  const salesQualityMap = new Map<string, SalesQualityAccumulator>();

  for (const opportunity of opportunities) {
    const dimensions = attributionDimensions(
      opportunity.attribution,
      opportunity.source,
    );
    const ownerName =
      [opportunity.owner?.firstName, opportunity.owner?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      opportunity.owner?.name ||
      "Unassigned";
    const source = opportunity.source || dimensions.source;
    const key = [source, ownerName].join("::");
    const row = salesQualityMap.get(key) ?? {
      avgProbability: null,
      avgResponseMinutes: null,
      avgTimeToCloseDays: null,
      closeRate: null,
      contacted: 0,
      contactedRate: null,
      leads: 0,
      lostDeals: 0,
      lostReasonCounts: new Map<string, number>(),
      lostReasons: [],
      missingCloseDate: 0,
      missingNextStep: 0,
      openPipelineCents: 0,
      ownerName,
      probabilityTotal: 0,
      proposals: 0,
      qualified: 0,
      qualityScore: 0,
      responseMinutesCount: 0,
      responseMinutesTotal: 0,
      source,
      staleOpen: 0,
      timeToCloseDaysCount: 0,
      timeToCloseDaysTotal: 0,
      weightedPipelineCents: 0,
      wonCents: 0,
      wonDeals: 0,
    };
    const firstContactedAt =
      opportunity.firstContactedAt ??
      opportunity.communications[0]?.occurredAt ??
      null;
    const responseMinutes = durationMinutesBetween(
      firstContactedAt,
      opportunity.createdAt,
    );
    const closedAt = opportunity.closedAt;
    const timeToCloseMinutes = durationMinutesBetween(
      closedAt,
      opportunity.createdAt,
    );

    row.leads += 1;
    row.probabilityTotal += opportunity.probability;
    if (firstContactedAt) row.contacted += 1;
    if (responseMinutes !== null) {
      row.responseMinutesCount += 1;
      row.responseMinutesTotal += responseMinutes;
    }
    if (isAtLeastLifecycleStage(opportunity.stage, "QUALIFIED"))
      row.qualified += 1;
    if (isAtLeastLifecycleStage(opportunity.stage, "PROPOSAL"))
      row.proposals += 1;
    if (opportunity.stage === "WON") {
      row.wonDeals += 1;
      row.wonCents += opportunity.valueCents;
    }
    if (opportunity.stage === "LOST") {
      const lostReason = opportunity.lostReason?.trim() || "No reason recorded";

      row.lostDeals += 1;
      row.lostReasonCounts.set(
        lostReason,
        (row.lostReasonCounts.get(lostReason) ?? 0) + 1,
      );
    }
    if (
      (opportunity.stage === "WON" || opportunity.stage === "LOST") &&
      timeToCloseMinutes !== null
    ) {
      row.timeToCloseDaysCount += 1;
      row.timeToCloseDaysTotal += timeToCloseMinutes / 1_440;
    }
    if (opportunity.stage !== "WON" && opportunity.stage !== "LOST") {
      row.openPipelineCents += opportunity.valueCents;
      row.weightedPipelineCents += Math.round(
        (opportunity.valueCents * opportunity.probability) / 100,
      );
      if (!opportunity.nextStep) row.missingNextStep += 1;
      if (!opportunity.expectedCloseDate) row.missingCloseDate += 1;
      if (opportunity.updatedAt < staleOpportunityCutoff) row.staleOpen += 1;
    }

    salesQualityMap.set(key, row);
  }

  const salesQualityRows = Array.from(salesQualityMap.values())
    .map((row) => {
      const incomplete =
        row.missingNextStep + row.missingCloseDate + row.staleOpen;
      const {
        lostReasonCounts,
        probabilityTotal,
        responseMinutesCount,
        responseMinutesTotal,
        timeToCloseDaysCount,
        timeToCloseDaysTotal,
        ...resultRow
      } = row;
      const missingLostReasonCount =
        lostReasonCounts.get("No reason recorded") ?? 0;
      const lifecycleScore =
        row.leads > 0
          ? ((row.qualified + row.proposals + row.wonDeals) / (row.leads * 3)) *
            55
          : 0;
      const hygieneScore =
        row.leads > 0
          ? ((row.leads * 3 - incomplete) / (row.leads * 3)) * 25
          : 0;
      const contactScore = row.leads > 0 ? (row.contacted / row.leads) * 15 : 0;
      const lostReasonScore =
        row.lostDeals > 0
          ? ((row.lostDeals - missingLostReasonCount) / row.lostDeals) * 5
          : 5;
      const qualityScore =
        row.leads > 0
          ? Math.max(
              0,
              Math.round(
                lifecycleScore + hygieneScore + contactScore + lostReasonScore,
              ),
            )
          : 0;
      const lostReasons = Array.from(lostReasonCounts.entries())
        .map(([reason, count]) => ({ count, reason }))
        .sort(
          (left, right) =>
            right.count - left.count || left.reason.localeCompare(right.reason),
        );

      return {
        ...resultRow,
        avgProbability: row.leads > 0 ? probabilityTotal / row.leads : null,
        avgResponseMinutes:
          responseMinutesCount > 0
            ? responseMinutesTotal / responseMinutesCount
            : null,
        avgTimeToCloseDays:
          timeToCloseDaysCount > 0
            ? timeToCloseDaysTotal / timeToCloseDaysCount
            : null,
        contactedRate: percentOf(row.contacted, row.leads),
        closeRate: percentOf(row.wonDeals, row.qualified),
        lostReasons,
        qualityScore,
      };
    })
    .sort(
      (a, b) =>
        b.qualityScore - a.qualityScore ||
        b.weightedPipelineCents - a.weightedPipelineCents ||
        b.wonCents - a.wonCents,
    );
  const salesLifecycleTransitionRows =
    buildSalesLifecycleTransitionRows(salesLifecycleEvents);
  const customStageMap = new Map<string, CustomStageRollupAccumulator>();

  for (const opportunity of opportunities) {
    const pipelineStage = opportunity.salesPipelineStage;
    const key = pipelineStage?.id ?? `legacy:${opportunity.stage}`;
    const current = customStageMap.get(key) ?? {
      avgProbability: null,
      bucket: pipelineStage?.bucket ?? opportunity.stage,
      leads: 0,
      lostDeals: 0,
      openPipelineCents: 0,
      probabilityTotal: 0,
      proposals: 0,
      qualified: 0,
      sortOrder:
        pipelineStage?.sortOrder ??
        ((lifecycleStageRank[opportunity.stage] ?? 0) + 1) * 100,
      stageName: pipelineStage?.name ?? stageLabel(opportunity.stage),
      weightedPipelineCents: 0,
      wonCents: 0,
      wonDeals: 0,
    };

    current.leads += 1;
    current.probabilityTotal += opportunity.probability;
    if (isAtLeastLifecycleStage(opportunity.stage, "QUALIFIED"))
      current.qualified += 1;
    if (isAtLeastLifecycleStage(opportunity.stage, "PROPOSAL"))
      current.proposals += 1;
    if (opportunity.stage === "WON") {
      current.wonDeals += 1;
      current.wonCents += opportunity.valueCents;
    } else if (opportunity.stage === "LOST") {
      current.lostDeals += 1;
    } else {
      current.openPipelineCents += opportunity.valueCents;
      current.weightedPipelineCents += Math.round(
        (opportunity.valueCents * opportunity.probability) / 100,
      );
    }

    customStageMap.set(key, current);
  }

  const customStageRollupRows = Array.from(customStageMap.values())
    .map(({ probabilityTotal, ...row }) => ({
      ...row,
      avgProbability: row.leads > 0 ? probabilityTotal / row.leads : null,
    }))
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        b.leads - a.leads ||
        a.stageName.localeCompare(b.stageName),
    );
  const leadAttributionRows = opportunities.map((opportunity) => {
    const firstTouch = attributionDimensions(
      { firstTouch: jsonObject(opportunity.attribution)?.firstTouch },
      opportunity.source,
    );
    const lastTouch = attributionDimensions(
      opportunity.attribution,
      opportunity.source,
    );
    const channel = leadChannelFromDimensions(lastTouch);
    const contactName = [
      opportunity.contact?.firstName,
      opportunity.contact?.lastName,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();
    const ownerName =
      [opportunity.owner?.firstName, opportunity.owner?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      opportunity.owner?.name ||
      "Unassigned";

    return {
      id: opportunity.id,
      campaign: lastTouch.campaign,
      channel,
      company:
        opportunity.contact?.company?.name ??
        opportunity.contact?.companyName ??
        null,
      createdAt: opportunity.createdAt,
      email: opportunity.contact?.email ?? "No email recorded",
      firstTouch,
      landingPage: leadLandingPage(opportunity.attribution),
      lastTouch,
      leadName: contactName || opportunity.title,
      ownerAvatarUrl: opportunity.owner?.avatarUrl ?? null,
      ownerName,
      source: opportunity.source || lastTouch.source,
      stage: opportunity.stage,
      valueCents: opportunity.valueCents,
    } satisfies LeadAttributionRow;
  });
  const filteredLeadAttributionRows = leadAttributionRows
    .filter(
      (row) => activeLeadChannel === "all" || row.channel === activeLeadChannel,
    )
    .filter(
      (row) => activeLeadStatus === "All" || row.stage === activeLeadStatus,
    )
    .filter((row) => {
      if (!leadSearchQuery) return true;

      return [
        row.leadName,
        row.email,
        row.company,
        row.source,
        row.campaign,
        row.landingPage,
        row.ownerName,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(leadSearchQuery));
    });
  const recentInteractions = [
    ...callLogs.slice(0, 5).map((call) => ({
      id: `call-${call.id}`,
      type: "Call",
      title:
        [call.contact?.firstName, call.contact?.lastName]
          .filter(Boolean)
          .join(" ") ||
        call.fromNumber ||
        "Unknown caller",
      source:
        call.opportunity?.source || sourceFromAttribution(call.attribution),
      date: call.startedAt,
      status: call.status,
    })),
    ...attributionRecords.slice(0, 5).map((record) => ({
      id: `attr-${record.id}`,
      type: record.source === "PHONE" ? "Tracked call" : "Tracked form",
      title: record.trackingPhoneNumber || "Website interaction",
      source: sourceFromAttribution({
        lastTouch: record.lastTouch,
        firstTouch: record.firstTouch,
      }),
      date: record.createdAt,
      status: record.source,
    })),
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 8);
  const providerConnectionMap = new Map(
    providerConnections.map((connection) => [connection.provider, connection]),
  );
  const spendByProvider = new Map<
    string,
    {
      costCents: number;
      clicks: number;
      impressions: number;
      conversions: number;
      campaigns: Set<string>;
      latestDate: Date | null;
      currency: string;
    }
  >();

  for (const row of campaignSpendRows) {
    const current = spendByProvider.get(row.provider) ?? {
      costCents: 0,
      clicks: 0,
      impressions: 0,
      conversions: 0,
      campaigns: new Set<string>(),
      latestDate: null,
      currency: row.currency,
    };

    current.costCents += microsToCents(row.costMicros);
    current.clicks += row.clicks;
    current.impressions += row.impressions;
    current.conversions += row.conversions;
    current.campaigns.add(row.campaignId);
    current.latestDate =
      !current.latestDate || row.date > current.latestDate
        ? row.date
        : current.latestDate;
    spendByProvider.set(row.provider, current);
  }

  const providerRows = marketingIntegrationProviderDefinitions.map(
    (provider) => {
      const state = getMarketingIntegrationProviderState(
        provider,
        providerConnectionMap.get(provider.provider),
      );
      const spend = spendByProvider.get(provider.provider);
      const latestLog =
        latestSyncLogs.find((log) => log.provider === provider.provider) ??
        null;

      return {
        provider,
        state,
        spend,
        latestLog,
      };
    },
  );
  const conversionUploadLogs = latestSyncLogs.filter((log) => {
    const syncType = log.syncType.toLowerCase();
    return syncType.includes("conversion") || syncType.includes("upload");
  });
  const pendingConversionUploads = conversionUploads.filter(
    (upload) => upload.status === "PENDING",
  );
  const trackedCallRecords = attributionRecords.filter(
    (record) => record.source === "PHONE",
  );
  const trackedFormRecords = attributionRecords.filter(
    (record) => record.source !== "PHONE",
  );
  const conversionUploadCounts: ConversionUploadCounts = {
    FAILED: 0,
    PENDING: 0,
    SENT: 0,
    SKIPPED: 0,
  };
  for (const row of conversionUploadStatusSummary) {
    conversionUploadCounts[row.status] = row._count._all;
  }
  const totalConversionUploads = Object.values(conversionUploadCounts).reduce(
    (total, count) => total + count,
    0,
  );
  const conversionUploadMetrics = conversionUploadMetricsFor({
    counts: conversionUploadCounts,
    providerSummary: conversionUploadProviderSummary,
    recentUploads: conversionUploads,
    total: totalConversionUploads,
  });
  const scheduledConversionUploadsEnabled =
    process.env.MARKETING_UPLOAD_CRON_ENABLED === "true";
  const scheduledConversionUploadsDryRun =
    process.env.MARKETING_UPLOAD_CRON_DRY_RUN === "true";
  const attributionReportMap = new Map<string, AttributionReportRow>();
  const reportCallLogIds = new Set(callLogs.map((call) => call.id));
  const ensureAttributionReportRow = (
    dimensions: ReturnType<typeof attributionDimensions>,
  ) => {
    const key = attributionDimensionKey(dimensions);
    const current = attributionReportMap.get(key) ?? {
      assistedCalls: 0,
      assistedJourneys: 0,
      assistedLeads: 0,
      assistedValueCents: 0,
      assistedWonCents: 0,
      campaign: dimensions.campaign,
      calls: 0,
      clickIds: new Set<string>(),
      confidence: createConfidenceAccumulator(),
      firstTouchJourneys: 0,
      firstTouchLeads: 0,
      firstTouchValueCents: 0,
      firstTouchWonCents: 0,
      forms: 0,
      latest: null,
      lastTouchJourneys: 0,
      lastTouchLeads: 0,
      lastTouchValueCents: 0,
      lastTouchWonCents: 0,
      leads: 0,
      linearJourneys: 0,
      linearLeads: 0,
      linearValueCents: 0,
      linearWonCents: 0,
      medium: dimensions.medium,
      positionBasedJourneys: 0,
      positionBasedLeads: 0,
      positionBasedValueCents: 0,
      positionBasedWonCents: 0,
      records: 0,
      source: dimensions.source,
      timeDecayJourneys: 0,
      timeDecayLeads: 0,
      timeDecayValueCents: 0,
      timeDecayWonCents: 0,
      valueCents: 0,
      wonCents: 0,
    };

    if (dimensions.clickIdSource)
      current.clickIds.add(dimensions.clickIdSource);
    attributionReportMap.set(key, current);
    return current;
  };
  const recordJourneyRoles = (
    attribution: unknown,
    fallbackSource: string | null | undefined,
    values: {
      calls?: number;
      journeys?: number;
      leads?: number;
      valueCents?: number;
      wonCents?: number;
    },
  ) => {
    const journey = attributionJourneyDimensions(attribution, fallbackSource);
    const firstKey = attributionDimensionKey(journey[0]);
    const lastKey = attributionDimensionKey(journey[journey.length - 1]);
    const assistedKeys = new Set(
      journey
        .slice(1, -1)
        .map((dimensions) => attributionDimensionKey(dimensions))
        .filter((key) => key !== firstKey && key !== lastKey),
    );

    ensureAttributionReportRow(journey[0]).firstTouchJourneys +=
      values.journeys ?? 0;
    ensureAttributionReportRow(journey[0]).firstTouchLeads += values.leads ?? 0;
    ensureAttributionReportRow(journey[0]).firstTouchValueCents +=
      values.valueCents ?? 0;
    ensureAttributionReportRow(journey[0]).firstTouchWonCents +=
      values.wonCents ?? 0;

    const lastRow = ensureAttributionReportRow(journey[journey.length - 1]);
    lastRow.lastTouchJourneys += values.journeys ?? 0;
    lastRow.lastTouchLeads += values.leads ?? 0;
    lastRow.lastTouchValueCents += values.valueCents ?? 0;
    lastRow.lastTouchWonCents += values.wonCents ?? 0;

    for (const dimensions of journey) {
      const key = attributionDimensionKey(dimensions);
      if (!assistedKeys.has(key)) continue;
      const assistedRow = ensureAttributionReportRow(dimensions);
      assistedRow.assistedCalls += values.calls ?? 0;
      assistedRow.assistedJourneys += values.journeys ?? 0;
      assistedRow.assistedLeads += values.leads ?? 0;
      assistedRow.assistedValueCents += values.valueCents ?? 0;
      assistedRow.assistedWonCents += values.wonCents ?? 0;
    }

    creditWeightedModel(
      journey,
      linearWeights(journey.length),
      values,
      ensureAttributionReportRow,
      "linear",
    );
    creditWeightedModel(
      journey,
      positionBasedWeights(journey.length),
      values,
      ensureAttributionReportRow,
      "position-based",
    );
    creditWeightedModel(
      journey,
      timeDecayWeights(journey.length),
      values,
      ensureAttributionReportRow,
      "time-decay",
    );
  };

  for (const record of attributionRecords) {
    const row = ensureAttributionReportRow(
      attributionDimensions(
        {
          firstTouch: record.firstTouch,
          lastTouch: record.lastTouch,
          timeline: record.timeline,
          referrer: record.referrer,
        },
        record.source,
      ),
    );

    row.records += 1;
    addConfidenceSample(
      row.confidence,
      confidenceForAttribution(
        {
          firstTouch: record.firstTouch,
          lastTouch: record.lastTouch,
          timeline: record.timeline,
          landingPage: record.landingPage,
          currentPage: record.currentPage,
          referrer: record.referrer,
        },
        {
          matchedOpportunityId: record.opportunityId,
          recordsCount: 1,
        },
      ),
    );
    let countedCall = 0;
    if (record.source === "PHONE") {
      if (!record.callLogId || !reportCallLogIds.has(record.callLogId)) {
        row.calls += 1;
        countedCall = 1;
      }
    } else {
      row.forms += 1;
    }
    row.latest =
      !row.latest || record.createdAt > row.latest
        ? record.createdAt
        : row.latest;
    recordJourneyRoles(
      {
        firstTouch: record.firstTouch,
        lastTouch: record.lastTouch,
        timeline: record.timeline,
        referrer: record.referrer,
      },
      record.source,
      { calls: countedCall, journeys: 1 },
    );
  }

  for (const opportunity of opportunities) {
    const row = ensureAttributionReportRow(
      attributionDimensions(opportunity.attribution, opportunity.source),
    );

    row.leads += 1;
    addConfidenceSample(
      row.confidence,
      confidenceForAttribution(opportunity.attribution, {
        attributionSource: opportunity.source,
        matchedOpportunityId: opportunity.id,
        recordsCount: 1,
      }),
    );
    row.valueCents += opportunity.valueCents;
    row.wonCents += opportunity.stage === "WON" ? opportunity.valueCents : 0;
    row.latest =
      !row.latest || opportunity.createdAt > row.latest
        ? opportunity.createdAt
        : row.latest;
    recordJourneyRoles(opportunity.attribution, opportunity.source, {
      journeys: 1,
      leads: 1,
      valueCents: opportunity.valueCents,
      wonCents: opportunity.stage === "WON" ? opportunity.valueCents : 0,
    });
  }

  for (const call of callLogs) {
    const row = ensureAttributionReportRow(
      attributionDimensions(call.attribution, call.opportunity?.source),
    );

    if (call.direction === "INBOUND") row.calls += 1;
    addConfidenceSample(
      row.confidence,
      confidenceForAttribution(call.attribution, {
        attributionSource: call.opportunity?.source,
        recordsCount: call.direction === "INBOUND" ? 1 : 0,
      }),
    );
    row.latest =
      !row.latest || call.startedAt > row.latest ? call.startedAt : row.latest;
    recordJourneyRoles(call.attribution, call.opportunity?.source, {
      calls: call.direction === "INBOUND" ? 1 : 0,
      journeys: 1,
    });
  }

  const attributionReportRows = Array.from(attributionReportMap.values()).sort(
    (a, b) => {
      const activityA = a.records + a.leads + a.calls;
      const activityB = b.records + b.leads + b.calls;

      return activityB - activityA || b.wonCents - a.wonCents;
    },
  );
  const matchedClickIdRows = attributionReportRows.filter(
    (row) => row.clickIds.size > 0,
  ).length;
  const attributedCampaignRows = attributionReportRows.filter(
    (row) => row.campaign !== "Not set",
  ).length;
  const assistedJourneyRows: AssistedJourneyRow[] = attributionReportRows
    .filter(
      (row) =>
        row.assistedJourneys > 0 ||
        row.assistedLeads > 0 ||
        row.assistedValueCents > 0 ||
        row.firstTouchJourneys > 0 ||
        row.lastTouchJourneys > 0,
    )
    .map((row) => ({
      assistedCalls: row.assistedCalls,
      assistedJourneys: row.assistedJourneys,
      assistedLeads: row.assistedLeads,
      assistedValueCents: row.assistedValueCents,
      assistedWonCents: row.assistedWonCents,
      campaign: row.campaign,
      firstTouchJourneys: row.firstTouchJourneys,
      firstTouchLeads: row.firstTouchLeads,
      firstTouchValueCents: row.firstTouchValueCents,
      firstTouchWonCents: row.firstTouchWonCents,
      lastTouchJourneys: row.lastTouchJourneys,
      lastTouchLeads: row.lastTouchLeads,
      lastTouchValueCents: row.lastTouchValueCents,
      lastTouchWonCents: row.lastTouchWonCents,
      medium: row.medium,
      source: row.source,
    }))
    .sort(
      (a, b) =>
        b.assistedWonCents - a.assistedWonCents ||
        b.assistedValueCents - a.assistedValueCents ||
        b.assistedLeads - a.assistedLeads ||
        b.assistedJourneys - a.assistedJourneys,
    );
  const totalAssistedLeads = assistedJourneyRows.reduce(
    (total, row) => total + row.assistedLeads,
    0,
  );
  const totalAssistedValueCents = assistedJourneyRows.reduce(
    (total, row) => total + row.assistedValueCents,
    0,
  );
  const attributionModelRows = attributionReportRows
    .map((row) => {
      const modelValues = attributionModelValues(row, activeAttributionModel);

      return {
        ...row,
        modelJourneys: modelValues.journeys,
        modelLeads: modelValues.leads,
        modelRevenueCents: modelValues.revenueCents,
        modelValueCents: modelValues.valueCents,
        confidenceRollup: confidenceRollup(row.confidence),
      };
    })
    .sort(
      (a, b) =>
        b.modelRevenueCents - a.modelRevenueCents ||
        b.modelValueCents - a.modelValueCents ||
        b.modelLeads - a.modelLeads ||
        b.modelJourneys - a.modelJourneys,
    );
  const totalModelLeads = attributionModelRows.reduce(
    (total, row) => total + row.modelLeads,
    0,
  );
  const totalModelValueCents = attributionModelRows.reduce(
    (total, row) => total + row.modelValueCents,
    0,
  );
  const selectedAttributionModel =
    attributionModelOptions.find(
      (option) => option.value === activeAttributionModel,
    ) ?? attributionModelOptions[1];

  return (
    <>
      {executivePrintMode ? (
        <ExecutiveClientPackHeader
          activeRangeLabel={activeRangeWindow.label}
          downloadHref={executiveReportDownloadHref(activeRange)}
          packHref={executiveReportPackHref(activeRange)}
        />
      ) : (
        <>
          <PageHeader
            title={activeViewMeta.title}
            description={activeViewMeta.description}
            actions={
              <Link
                href={activeViewAction.href}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
              >
                {activeViewAction.label}
              </Link>
            }
          />

          <MarketingRouteShell
            activeRange={activeRange}
            activeView={activeView}
          />

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Leads"
              value={totalLeads.toString()}
              detail={`${attributedLeads} attributed / ${activeRangeWindow.label}`}
            />
            <Metric
              label="Inbound calls"
              value={totalCalls.toString()}
              detail={`${attributedCalls} attributed / ${activeRangeWindow.label}`}
            />
            <Metric
              label="Won revenue"
              value={formatMoney(wonRevenue)}
              detail={`Closed opportunities / ${activeRangeWindow.label}`}
            />
            <Metric
              label="Cost per lead"
              value={
                costPerLeadCents === null
                  ? "Spend needed"
                  : formatMoney(costPerLeadCents)
              }
              detail={
                totalSpendCents > 0
                  ? `${formatMoney(totalSpendCents)} spend imported`
                  : "Connect ad spend imports"
              }
              muted={costPerLeadCents === null}
            />
          </div>
        </>
      )}

      {activeView === "overview" && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Qualified leads"
              value={qualifiedLeads.toString()}
              detail={`${formatPercent(percentOf(qualifiedLeads, totalLeads))} of leads`}
              muted={qualifiedLeads === 0}
            />
            <Metric
              label="Open pipeline"
              value={formatMoney(pipelineValue)}
              detail={`${opportunityCount} qualified opportunities`}
              muted={pipelineValue === 0}
            />
            <Metric
              label="Weighted pipeline"
              value={formatMoney(weightedPipelineValue)}
              detail="Probability-adjusted open value"
              muted={weightedPipelineValue === 0}
            />
            <Metric
              label="Won deals"
              value={wonDeals.toString()}
              detail={`${formatPercent(percentOf(wonDeals, proposalCount || totalLeads))} close rate`}
              muted={wonDeals === 0}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <Metric
              label="Imported ad spend"
              value={
                totalSpendCents > 0 ? formatMoney(totalSpendCents) : "No spend"
              }
              detail={`${totalClicks} clicks / ${Math.round(totalConversions)} conversions`}
              muted={totalSpendCents === 0}
            />
            <Metric
              label="ROAS"
              value={formatRatio(roas)}
              detail="Won revenue against imported spend"
              muted={roas === null}
            />
            <Metric
              label="Sync health"
              value={
                latestSyncLogs.length ? latestSyncLogs[0].status : "No syncs"
              }
              detail={
                latestSyncLogs.length
                  ? `${providerLabel(latestSyncLogs[0].provider)} ${latestSyncLogs[0].syncType}`
                  : "No provider jobs have run"
              }
              muted={!latestSyncLogs.length}
            />
          </div>

          <CommercialAttributionPanel
            activeRange={activeRange}
            activeRangeLabel={activeRangeWindow.label}
            attributedLeads={attributedLeads}
            pipelineValueCents={pipelineValue}
            qualifiedLeads={qualifiedLeads}
            sessionCount={sessionCount}
            totalLeads={totalLeads}
            wonDeals={wonDeals}
            wonRevenueCents={wonRevenue}
          />

          <LifecycleFunnel rows={lifecycleFunnelRows} />

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
            <LeadSourceTable rows={sourceRows.slice(0, 8)} />
            <RecentInteractions interactions={recentInteractions} />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <RecentSpendRows rows={campaignSpendRows.slice(0, 6)} />
            <ProviderSyncHealth logs={latestSyncLogs.slice(0, 5)} />
          </div>
        </>
      )}

      {activeView === "lead-sources" && (
        <LeadSourcesWorkspace
          activeChannel={activeLeadChannel}
          activeRange={activeRange}
          activeStatus={activeLeadStatus}
          query={searchValue(params.q)}
          rows={filteredLeadAttributionRows}
          sourceRows={sourceRows}
          totalRows={leadAttributionRows.length}
        />
      )}

      {activeView === "attribution-reports" && (
        <>
          <AttributionModelSwitcher
            activeModel={activeAttributionModel}
            activeRange={activeRange}
          />

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Metric
              label="Captured journeys"
              value={attributionRecords.length.toString()}
              detail={`${trackedFormRecords.length} forms / ${trackedCallRecords.length} phone records`}
            />
            <Metric
              label="Report groups"
              value={attributionReportRows.length.toString()}
              detail={`${attributedCampaignRows} with campaign data`}
            />
            <Metric
              label="Click ID coverage"
              value={matchedClickIdRows.toString()}
              detail="Groups with GCLID, MSCLKID or FBCLID evidence"
              muted={matchedClickIdRows === 0}
            />
            <Metric
              label="Assisted leads"
              value={totalAssistedLeads.toString()}
              detail={`${formatMoney(totalAssistedValueCents)} assisted pipeline`}
              muted={!totalAssistedLeads}
            />
            <Metric
              label={`${selectedAttributionModel.label} leads`}
              value={formatAttributionCount(totalModelLeads)}
              detail={`${formatMoney(totalModelValueCents)} model pipeline`}
              muted={!totalModelLeads}
            />
          </div>

          <AssistedJourneyReport rows={assistedJourneyRows.slice(0, 10)} />

          <AttributionReportTable
            activeModel={activeAttributionModel}
            rows={attributionModelRows}
          />

          <div className="mt-6 grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
            <AttributionReportQuality rows={attributionModelRows.slice(0, 8)} />
            <RecentSpendRows rows={campaignSpendRows.slice(0, 8)} />
          </div>
        </>
      )}

      {activeView === "ad-platforms" && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <Metric
              label="Imported spend"
              value={
                totalSpendCents > 0 ? formatMoney(totalSpendCents) : "No spend"
              }
              detail={`${totalImpressions} impressions / ${totalClicks} clicks`}
              muted={totalSpendCents === 0}
            />
            <Metric
              label="Campaign rows"
              value={campaignSpendRows.length.toString()}
              detail="Imported campaign/date records"
            />
            <Metric
              label="Cost per conversion"
              value={
                costPerConversionCents === null
                  ? "Spend needed"
                  : formatMoney(costPerConversionCents)
              }
              detail={`${Math.round(totalConversions)} imported conversions`}
              muted={costPerConversionCents === null}
            />
          </div>

          <section className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
            <SectionHeading
              title="Provider performance"
              detail="Shows each connected marketing platform, imported spend, organic performance, lifecycle rows and latest sync state."
              help="Use this section to confirm whether providers are connected and whether imports are giving Marketing enough data for performance reporting."
              action={
                <form action={importMarketingAdSpendAction}>
                  <button
                    type="submit"
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-brand-200 bg-brand-50 px-3 text-xs font-medium text-brand-700 hover:bg-brand-100 dark:border-brand-900/40 dark:bg-brand-900/20 dark:text-brand-300"
                  >
                    Import provider data
                  </button>
                </form>
              }
            />
            <div className="grid gap-4 p-5 xl:grid-cols-4">
              {providerRows.map((row) => (
                <ProviderPerformanceCard
                  key={row.provider.provider}
                  row={row}
                />
              ))}
            </div>
          </section>

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
            <RecentSpendRows rows={campaignSpendRows.slice(0, 12)} />
            <ProviderSyncHealth logs={latestSyncLogs.slice(0, 8)} />
          </div>
        </>
      )}

      {activeView === "offline-media" && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Offline campaigns"
              value={offlineMediaRows.length.toString()}
              detail={`${offlineMediaPlanningGaps} planning or budget gaps`}
              muted={!offlineMediaRows.length}
            />
            <Metric
              label="Offline leads"
              value={offlineMediaRows
                .reduce((total, row) => total + row.leads, 0)
                .toString()}
              detail={`${offlineMediaRows.reduce((total, row) => total + row.calls, 0)} tracked calls`}
              muted={!offlineMediaRows.some((row) => row.leads || row.calls)}
            />
            <Metric
              label="Weighted pipeline"
              value={formatMoney(
                offlineMediaRows.reduce(
                  (total, row) => total + row.weightedPipelineCents,
                  0,
                ),
              )}
              detail="Open offline campaign pipeline"
              muted={!offlineMediaRows.some((row) => row.weightedPipelineCents)}
            />
            <Metric
              label="Won revenue"
              value={formatMoney(
                offlineMediaRows.reduce(
                  (total, row) => total + row.wonCents,
                  0,
                ),
              )}
              detail={`${offlineMediaRows.reduce((total, row) => total + row.wonDeals, 0)} won deals`}
              muted={!offlineMediaRows.some((row) => row.wonCents)}
            />
          </div>

          <OfflineMediaReport rows={offlineMediaRows} />
        </>
      )}

      {activeView === "sales-quality" && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Quality groups"
              value={salesQualityRows.length.toString()}
              detail="Source and owner combinations"
              muted={!salesQualityRows.length}
            />
            <Metric
              label="Qualified leads"
              value={salesQualityRows
                .reduce((total, row) => total + row.qualified, 0)
                .toString()}
              detail={`${salesQualityRows.reduce((total, row) => total + row.proposals, 0)} proposals`}
              muted={!salesQualityRows.some((row) => row.qualified)}
            />
            <Metric
              label="Weighted pipeline"
              value={formatMoney(
                salesQualityRows.reduce(
                  (total, row) => total + row.weightedPipelineCents,
                  0,
                ),
              )}
              detail="Open weighted pipeline"
              muted={!salesQualityRows.some((row) => row.weightedPipelineCents)}
            />
            <Metric
              label="Missing follow-up"
              value={salesQualityRows
                .reduce(
                  (total, row) =>
                    total +
                    row.missingNextStep +
                    row.missingCloseDate +
                    row.staleOpen,
                  0,
                )
                .toString()}
              detail="Next step, close date or stale open issues"
              muted={
                !salesQualityRows.some(
                  (row) =>
                    row.missingNextStep ||
                    row.missingCloseDate ||
                    row.staleOpen,
                )
              }
            />
          </div>

          <SalesQualityReport rows={salesQualityRows} />
          <CustomStageRollupReport rows={customStageRollupRows} />
          <SalesLifecycleTransitionReport rows={salesLifecycleTransitionRows} />
        </>
      )}

      {activeView === "executive-report" && (
        <ExecutiveReport
          activeRangeLabel={activeRangeWindow.label}
          activeRange={activeRange}
          attributedLeads={attributedLeads}
          lifecycleRows={lifecycleFunnelRows}
          printMode={executivePrintMode}
          salesQualityRows={salesQualityRows.slice(0, 5)}
          sourceRows={sourceRows.slice(0, 5)}
          totalLeads={totalLeads}
          totalSpendCents={totalSpendCents}
          wonRevenue={wonRevenue}
        />
      )}

      {activeView === "conversion-reporting" && (
        <>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <form action={prepareMarketingConversionUploadsAction}>
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
              >
                Prepare uploads
              </button>
            </form>
            <form action={dryRunMarketingConversionUploadsAction}>
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-brand-200 bg-brand-50 px-4 text-sm font-medium text-brand-700 hover:bg-brand-100 dark:border-brand-900/40 dark:bg-brand-900/20 dark:text-brand-300"
              >
                Dry run pending
              </button>
            </form>
            <form action={processMarketingConversionUploadsAction}>
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
              >
                Send pending uploads
              </button>
            </form>
            <form action={retryFailedMarketingConversionUploadsAction}>
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-error-200 bg-error-50 px-4 text-sm font-medium text-error-700 hover:bg-error-100 dark:border-error-900/40 dark:bg-error-900/20 dark:text-error-300"
              >
                Retry failed
              </button>
            </form>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Metric
              label="Tracked forms"
              value={trackedFormRecords.length.toString()}
              detail="Attribution records from form capture"
            />
            <Metric
              label="Tracked calls"
              value={trackedCallRecords.length.toString()}
              detail="Attribution records from phone tracking"
            />
            <Metric
              label="Match rate"
              value={formatPercent(conversionUploadMetrics.matchRate)}
              detail="Rows with supported click ID evidence"
              muted={conversionUploadMetrics.matchRate === null}
            />
            <Metric
              label="Upload success"
              value={formatPercent(conversionUploadMetrics.uploadedRate)}
              detail={`${conversionUploadCounts.SENT} sent / ${conversionUploadCounts.FAILED} failed attempts`}
              muted={conversionUploadMetrics.uploadedRate === null}
            />
            <Metric
              label="Automatic uploads"
              value={
                scheduledConversionUploadsEnabled
                  ? scheduledConversionUploadsDryRun
                    ? "Dry run"
                    : "Enabled"
                  : "Disabled"
              }
              detail={
                scheduledConversionUploadsEnabled
                  ? "Netlify scheduled job is configured."
                  : "Set cron env vars to enable scheduled processing."
              }
              muted={!scheduledConversionUploadsEnabled}
            />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
            <ConversionEvidence records={attributionRecords.slice(0, 12)} />
            <ConversionUploadReadiness
              logs={conversionUploadLogs}
              providers={providerRows}
            />
          </div>

          <ConversionUploadSummary
            counts={conversionUploadCounts}
            metrics={conversionUploadMetrics}
            total={totalConversionUploads}
          />
          <ConversionUploadQueue uploads={conversionUploads} />
        </>
      )}
    </>
  );
}

function LifecycleFunnel({ rows }: { rows: LifecycleFunnelRow[] }) {
  const maxCount = Math.max(...rows.map((row) => row.count), 1);

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <SectionHeading
        title="Lifecycle funnel"
        detail="Sessions to leads, qualified pipeline, proposals and won revenue for the selected date range."
        help="Uses fixed version-one lifecycle stages. Qualified and pipeline include qualified stage or later; proposals include proposal, negotiation and won; won only counts closed won deals."
      />
      <div className="grid gap-3 p-5 xl:grid-cols-6">
        {rows.map((row, index) => (
          <article
            key={row.key}
            className="relative rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
                  {row.label}
                </p>
                <p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
                  {row.count}
                </p>
              </div>
              <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-white px-2 text-xs font-semibold text-gray-500 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-700">
                {index + 1}
              </span>
            </div>
            <div className="mt-4 h-2 rounded-full bg-white dark:bg-gray-900">
              <div
                className="h-2 rounded-full bg-brand-500"
                style={{
                  width: `${Math.max(6, Math.round((row.count / maxCount) * 100))}%`,
                }}
              />
            </div>
            <dl className="mt-4 space-y-2 text-xs">
              <FunnelFact
                label="Conversion"
                value={
                  row.conversionRate === null
                    ? "Start"
                    : formatPercent(row.conversionRate)
                }
              />
              <FunnelFact
                label="Drop-off"
                value={
                  row.dropOffRate === null
                    ? "-"
                    : formatPercent(row.dropOffRate)
                }
              />
              <FunnelFact
                label="Value"
                value={
                  row.valueCents === null ? "-" : formatMoney(row.valueCents)
                }
              />
              <FunnelFact
                label="Cost"
                value={
                  row.costCents === null ? "-" : formatMoney(row.costCents)
                }
              />
            </dl>
            <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">
              {row.detail}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function CommercialAttributionPanel({
  activeRange,
  activeRangeLabel,
  attributedLeads,
  pipelineValueCents,
  qualifiedLeads,
  sessionCount,
  totalLeads,
  wonDeals,
  wonRevenueCents,
}: {
  activeRange: MarketingRange;
  activeRangeLabel: string;
  attributedLeads: number;
  pipelineValueCents: number;
  qualifiedLeads: number;
  sessionCount: number;
  totalLeads: number;
  wonDeals: number;
  wonRevenueCents: number;
}) {
  const steps = [
    {
      title: "Visitor evidence",
      value: sessionCount.toString(),
      detail: "Tracked visitor sessions",
      href: visitorLogHrefForMarketingRange(activeRange),
    },
    {
      title: "Lead sources",
      value: `${attributedLeads}/${totalLeads}`,
      detail: "Attributed leads",
      href: marketingReportHref("/marketing/lead-sources", activeRange),
    },
    {
      title: "Sales quality",
      value: qualifiedLeads.toString(),
      detail: "Qualified opportunities",
      href: marketingReportHref("/marketing/sales-quality", activeRange),
    },
    {
      title: "Revenue outcome",
      value: formatMoney(wonRevenueCents),
      detail: `${wonDeals} won deal${wonDeals === 1 ? "" : "s"}`,
      href: "/sales?stage=WON",
    },
  ];

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <SectionHeading
        title="Commercial attribution flow"
        detail={`Connect visitor evidence, lead quality and sales outcomes for ${activeRangeLabel}.`}
        help="This panel gives users a single path through the commercial attribution workflow: inspect visitor evidence, compare lead sources, review sales quality and open the resulting opportunities."
      />
      <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
        {steps.map((step, index) => (
          <Link
            key={step.title}
            href={step.href}
            className="group rounded-xl border border-gray-200 p-4 transition hover:border-brand-200 hover:bg-brand-50/40 dark:border-gray-800 dark:hover:border-brand-900/50 dark:hover:bg-brand-900/10"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xs font-bold text-gray-700 dark:bg-white/[0.06] dark:text-gray-300">
                {index + 1}
              </span>
              <span className="text-xs font-semibold text-brand-600 opacity-0 transition group-hover:opacity-100 dark:text-brand-300">
                Open
              </span>
            </div>
            <p className="mt-4 text-sm font-semibold text-gray-800 dark:text-white/90">
              {step.title}
            </p>
            <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
              {step.value}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {step.detail}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

function FunnelFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="font-semibold text-gray-700 dark:text-gray-200">
        {value}
      </dd>
    </div>
  );
}

function LeadSourcesWorkspace({
  activeChannel,
  activeRange,
  activeStatus,
  query,
  rows,
  sourceRows,
  totalRows,
}: {
  activeChannel: LeadChannel;
  activeRange: MarketingRange;
  activeStatus: string;
  query: string;
  rows: LeadAttributionRow[];
  sourceRows: LeadSourceRow[];
  totalRows: number;
}) {
  const paidSearch = rows.filter(
    (row) => row.channel === "google" || row.channel === "bing",
  );
  const paidSocial = rows.filter(
    (row) => row.channel === "meta" || row.channel === "linkedin",
  );
  const organic = rows.filter((row) => row.channel === "organic");
  const referral = rows.filter((row) => row.channel === "referral");
  const totalValue = rows.reduce((total, row) => total + row.valueCents, 0);
  const qualifiedRows = rows.filter((row) =>
    isAtLeastLifecycleStage(row.stage, "QUALIFIED"),
  );
  const proposalRows = rows.filter((row) =>
    isAtLeastLifecycleStage(row.stage, "PROPOSAL"),
  );
  const wonRows = rows.filter((row) => row.stage === "WON");
  const wonValue = wonRows.reduce((total, row) => total + row.valueCents, 0);

  return (
    <section className="mt-6 space-y-5">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <LeadSourceMetric
          icon="leads"
          label="Total leads"
          value={rows.length.toString()}
          detail={`${totalRows} in range`}
          tone="brand"
        />
        <LeadSourceMetric
          icon="search"
          label="Paid search"
          value={paidSearch.length.toString()}
          detail={`${shareLabel(paidSearch.length, rows.length)} of filtered`}
          tone="green"
        />
        <LeadSourceMetric
          icon="social"
          label="Paid social"
          value={paidSocial.length.toString()}
          detail={`${shareLabel(paidSocial.length, rows.length)} of filtered`}
          tone="brand"
        />
        <LeadSourceMetric
          icon="organic"
          label="Organic search"
          value={organic.length.toString()}
          detail={`${shareLabel(organic.length, rows.length)} of filtered`}
          tone="amber"
        />
        <LeadSourceMetric
          icon="referral"
          label="Referral"
          value={referral.length.toString()}
          detail={formatMoney(totalValue)}
          tone="purple"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <LeadQualityMetric
          label="Qualified leads"
          value={qualifiedRows.length.toString()}
          detail={`${formatPercent(percentOf(qualifiedRows.length, rows.length))} of filtered leads`}
        />
        <LeadQualityMetric
          label="Proposal rate"
          value={formatPercent(
            percentOf(proposalRows.length, qualifiedRows.length),
          )}
          detail={`${proposalRows.length} proposal-stage lead${proposalRows.length === 1 ? "" : "s"}`}
        />
        <LeadQualityMetric
          label="Close rate"
          value={formatPercent(percentOf(wonRows.length, qualifiedRows.length))}
          detail={`${wonRows.length} won deal${wonRows.length === 1 ? "" : "s"}`}
        />
        <LeadQualityMetric
          label="Won revenue"
          value={formatMoney(wonValue)}
          detail={`${formatPercent(percentOf(wonValue, totalValue))} of filtered value`}
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-100 p-4 dark:border-gray-800">
          <form className="grid gap-3 xl:grid-cols-[minmax(240px,1fr)_180px_auto] xl:items-center">
            <input type="hidden" name="view" value="lead-sources" />
            {activeRange !== "30d" ? (
              <input type="hidden" name="range" value={activeRange} />
            ) : null}
            {activeChannel !== "all" ? (
              <input type="hidden" name="channel" value={activeChannel} />
            ) : null}
            <label className="relative block">
              <span className="sr-only">Search leads</span>
              <input
                name="q"
                defaultValue={query}
                placeholder="Search leads, campaign or landing page..."
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent py-2.5 pr-11 pl-4 text-sm text-gray-800 transition outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90"
              />
              <span className="pointer-events-none absolute top-1/2 right-3 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg border border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400">
                <LeadIcon icon="organic" />
              </span>
            </label>
            <label className="block">
              <span className="sr-only">Status</span>
              <select
                name="status"
                defaultValue={activeStatus}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm font-medium text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90"
              >
                {leadStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    Status: {stageLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2 xl:justify-end">
              <button
                type="submit"
                className="inline-flex h-11 min-w-[94px] items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
              >
                Filters
              </button>
              <Link
                href={marketingPageHref(activeRange)}
                className="inline-flex h-11 min-w-[82px] items-center justify-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.05]"
              >
                Reset
              </Link>
            </div>
          </form>

          <div className="mt-3 flex max-w-full min-w-0 gap-2 overflow-x-auto overscroll-x-contain pb-1">
            <div className="flex min-w-max gap-2">
              {leadChannelOptions.map((channel) => (
                <Link
                  key={channel.value}
                  href={marketingPageHref(activeRange, {
                    channel: channel.value,
                    q: query,
                    status: activeStatus,
                  })}
                  className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition ${
                    activeChannel === channel.value
                      ? "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-900/40 dark:bg-brand-900/20 dark:text-brand-300"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-transparent dark:text-gray-300 dark:hover:bg-white/[0.05]"
                  }`}
                >
                  <LeadIcon icon={channel.value} />
                  {channel.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <LeadAttributionTable rows={rows} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <LeadSourceTable rows={sourceRows} />
        <SourceBreakdown rows={sourceRows.slice(0, 6)} />
      </div>
    </section>
  );
}

function LeadAttributionTable({ rows }: { rows: LeadAttributionRow[] }) {
  const visibleRows = rows.slice(0, 50);

  return (
    <ResponsiveDataList
      breakpoint="lg"
      cardListClassName="divide-y divide-gray-100 dark:divide-gray-800"
      empty={
        <p className="px-5 py-10 text-center text-sm text-gray-500">
          No leads match these filters yet.
        </p>
      }
      getKey={(row) => row.id}
      items={visibleRows}
      renderCard={(row) => <LeadAttributionCard row={row} />}
      table={
        <div className="max-w-full min-w-0 overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[1280px] divide-y divide-gray-100 text-sm dark:divide-gray-800">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Lead</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">First touch</th>
                <th className="px-4 py-3">Last touch</th>
                <th className="px-4 py-3">Journey</th>
                <th className="px-4 py-3">Campaign</th>
                <th className="px-4 py-3">Landing page</th>
                <th className="px-4 py-3">Value</th>
                <th className="px-4 py-3">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {visibleRows.length ? (
                visibleRows.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-gray-50/70 dark:hover:bg-white/[0.03]"
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-600 dark:bg-brand-900/20 dark:text-brand-300">
                          {initials(row.leadName)}
                        </span>
                        <div className="min-w-0">
                          <p className="max-w-[180px] truncate font-semibold text-gray-800 dark:text-white/90">
                            {row.leadName}
                          </p>
                          <p className="mt-1 max-w-[180px] truncate text-xs text-gray-500 dark:text-gray-400">
                            {row.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge>{stageLabel(row.stage)}</StatusBadge>
                    </td>
                    <td className="px-4 py-4 text-gray-600 dark:text-gray-300">
                      <p>{leadDateFormatter.format(row.createdAt)}</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {leadTimeFormatter.format(row.createdAt)}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <TouchCell dimensions={row.firstTouch} />
                    </td>
                    <td className="px-4 py-4">
                      <TouchCell dimensions={row.lastTouch} />
                    </td>
                    <td className="px-4 py-4">
                      <JourneyPills row={row} />
                    </td>
                    <td className="px-4 py-4">
                      <p className="max-w-[170px] truncate font-medium text-gray-800 dark:text-white/90">
                        {row.campaign}
                      </p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {row.lastTouch.medium}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-gray-600 dark:text-gray-300">
                      <span className="block max-w-[160px] truncate">
                        {row.landingPage}
                      </span>
                    </td>
                    <td className="px-4 py-4 font-medium text-gray-800 dark:text-white/90">
                      {formatMoney(row.valueCents)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        {row.ownerAvatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.ownerAvatarUrl}
                            alt=""
                            className="h-7 w-7 rounded-full object-cover"
                          />
                        ) : (
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 dark:bg-white/10 dark:text-gray-300">
                            {initials(row.ownerName)}
                          </span>
                        )}
                        <span className="max-w-[130px] truncate text-gray-700 dark:text-gray-300">
                          {row.ownerName}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={10}
                    className="px-5 py-10 text-center text-sm text-gray-500"
                  >
                    No leads match these filters yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      }
    />
  );
}

function LeadAttributionCard({ row }: { row: LeadAttributionRow }) {
  return (
    <article className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-600 dark:bg-brand-900/20 dark:text-brand-300">
            {initials(row.leadName)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
              {row.leadName}
            </p>
            <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
              {row.email}
            </p>
          </div>
        </div>
        <StatusBadge>{stageLabel(row.stage)}</StatusBadge>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <ResponsiveDataField label="Value">
          {formatMoney(row.valueCents)}
        </ResponsiveDataField>
        <ResponsiveDataField label="Created">
          {leadDateFormatter.format(row.createdAt)}
        </ResponsiveDataField>
        <ResponsiveDataField label="Campaign" className="col-span-2">
          <span className="block truncate">{row.campaign}</span>
        </ResponsiveDataField>
        <ResponsiveDataField label="Landing page" className="col-span-2">
          <span className="block truncate">{row.landingPage}</span>
        </ResponsiveDataField>
      </dl>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-[11px] font-semibold text-gray-500 uppercase dark:text-gray-400">
            First touch
          </p>
          <TouchCell dimensions={row.firstTouch} />
        </div>
        <div>
          <p className="mb-1 text-[11px] font-semibold text-gray-500 uppercase dark:text-gray-400">
            Last touch
          </p>
          <TouchCell dimensions={row.lastTouch} />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-gray-100 pt-3 dark:border-gray-800">
        <JourneyPills row={row} />
        <span className="min-w-0 truncate text-sm font-medium text-gray-700 dark:text-gray-300">
          {row.ownerName}
        </span>
      </div>
    </article>
  );
}

function TouchCell({
  dimensions,
}: {
  dimensions: ReturnType<typeof attributionDimensions>;
}) {
  const channel = leadChannelFromDimensions(dimensions);

  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
        <LeadIcon icon={channel} />
      </span>
      <div className="min-w-0">
        <p className="max-w-[150px] truncate font-medium text-gray-800 dark:text-white/90">
          {dimensions.source}
        </p>
        <p className="mt-1 max-w-[150px] truncate text-xs text-gray-500 dark:text-gray-400">
          {dimensions.medium}
        </p>
      </div>
    </div>
  );
}

function JourneyPills({ row }: { row: LeadAttributionRow }) {
  return (
    <div className="flex items-center gap-1.5 text-gray-400">
      <JourneyStep icon={row.firstTouch} />
      <span>→</span>
      <JourneyStep icon={row.lastTouch} />
      <span>→</span>
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-success-50 text-success-600 ring-1 ring-success-100 dark:bg-success-900/20 dark:text-success-300 dark:ring-success-900/40">
        <CheckIcon />
      </span>
    </div>
  );
}

function JourneyStep({
  icon,
}: {
  icon: ReturnType<typeof attributionDimensions>;
}) {
  return (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
      <LeadIcon icon={leadChannelFromDimensions(icon)} />
    </span>
  );
}

function ConfidenceRollupBadge({
  rollup,
}: {
  rollup: AttributionConfidenceRollup;
}) {
  return (
    <div className="max-w-[180px]" title={rollup.summary}>
      <span
        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${confidenceRollupClasses(rollup.level)}`}
      >
        {rollup.level} · {rollup.average}%
      </span>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {rollup.sampleSize} scored item{rollup.sampleSize === 1 ? "" : "s"}
      </p>
      {rollup.topGaps.length ? (
        <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
          Gaps: {rollup.topGaps.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

function confidenceRollupClasses(level: AttributionConfidenceLevel) {
  if (level === "High") {
    return "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300";
  }
  if (level === "Medium") {
    return "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300";
  }
  if (level === "Low") {
    return "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300";
  }
  return "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300";
}

function LeadSourceMetric({
  detail,
  icon,
  label,
  tone,
  value,
}: {
  detail: string;
  icon: LeadChannel | "leads" | "search" | "social";
  label: string;
  tone: "amber" | "brand" | "green" | "purple";
  value: string;
}) {
  const toneClasses =
    tone === "green"
      ? "bg-success-50 text-success-600 dark:bg-success-900/20 dark:text-success-300"
      : tone === "amber"
        ? "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
        : tone === "purple"
          ? "bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300"
          : "bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-300";

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${toneClasses}`}
        >
          <LeadIcon icon={icon} />
        </span>
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {label}
          </p>
          <p className="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">
            {value}
          </p>
          <p className="mt-1 text-xs font-medium text-success-600 dark:text-success-400">
            {detail}
          </p>
        </div>
      </div>
    </article>
  );
}

function LeadQualityMetric({
  detail,
  label,
  value,
}: {
  detail: string;
  label: string;
  value: string;
}) {
  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
        {value}
      </p>
      <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
        {detail}
      </p>
    </article>
  );
}

function shareLabel(value: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function LeadIcon({
  icon,
}: {
  icon: LeadChannel | "leads" | "search" | "social";
}) {
  if (icon === "meta" || icon === "social")
    return <span className="text-base font-bold">f</span>;
  if (icon === "linkedin") return <span className="text-sm font-bold">in</span>;
  if (icon === "google") return <span className="font-bold">G</span>;
  if (icon === "bing") return <span className="font-bold">b</span>;
  if (icon === "referral") return <LinkIcon />;
  if (icon === "email") return <MailIcon />;
  if (icon === "sms") return <ChatIcon />;
  if (icon === "direct") return <CursorIcon />;
  if (icon === "leads") return <UsersIcon />;
  return <SearchIcon />;
}

function LeadSourceTable({ rows }: { rows: LeadSourceRow[] }) {
  const totalActivity = rows.reduce(
    (total, row) => total + row.leads + row.calls,
    0,
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <SectionHeading
        title="Channel quality performance"
        detail="Lead quality, pipeline value, won revenue and spend efficiency grouped by CRM source."
        help="Compares sources by qualification, proposal movement, close rate, weighted pipeline and cost per lifecycle stage so users can see which channels create valuable opportunities."
      />
      <ResponsiveDataList
        breakpoint="lg"
        cardListClassName="divide-y divide-gray-100 dark:divide-gray-800"
        empty={
          <p className="px-5 py-10 text-center text-sm text-gray-500">
            Marketing attribution will appear here as forms and calls are
            captured.
          </p>
        }
        getKey={(row) => row.source}
        items={rows}
        renderCard={(row) => (
          <LeadSourceCard row={row} totalActivity={totalActivity} />
        )}
        table={
          <div className="max-w-full min-w-0 overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-[1440px] divide-y divide-gray-100 text-sm dark:divide-gray-800">
              <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase dark:bg-white/[0.03] dark:text-gray-400">
                <tr>
                  <th className="px-5 py-3">Source</th>
                  <th className="px-5 py-3">Leads</th>
                  <th className="px-5 py-3">Qualified</th>
                  <th className="px-5 py-3">Proposals</th>
                  <th className="px-5 py-3">Won</th>
                  <th className="px-5 py-3">Close rate</th>
                  <th className="px-5 py-3">Confidence</th>
                  <th className="px-5 py-3">Calls</th>
                  <th className="px-5 py-3">Open pipeline</th>
                  <th className="px-5 py-3">Weighted</th>
                  <th className="px-5 py-3">Revenue</th>
                  <th className="px-5 py-3">Avg lead</th>
                  <th className="px-5 py-3">CPQL</th>
                  <th className="px-5 py-3">Cost/won</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.length ? (
                  rows.map((row) => (
                    <tr key={row.source}>
                      <td className="px-5 py-4 font-medium text-gray-800 dark:text-white/90">
                        <p>{row.source}</p>
                        <p className="mt-1 text-xs font-normal text-gray-500 dark:text-gray-400">
                          {totalActivity > 0
                            ? `${Math.round(((row.leads + row.calls) / totalActivity) * 100)}% activity`
                            : "No activity"}{" "}
                          /{" "}
                          {row.latest
                            ? dateFormatter.format(row.latest)
                            : "No recent activity"}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {row.leads}
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {row.qualified}
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {row.proposals}
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {row.wonDeals}
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {formatPercent(row.closeRate)}
                      </td>
                      <td className="px-5 py-4">
                        <ConfidenceRollupBadge rollup={row.confidence} />
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {row.calls}
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {formatMoney(row.openPipelineCents)}
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {formatMoney(row.weightedPipelineCents)}
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {formatMoney(row.wonCents)}
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {row.avgLeadValueCents === null
                          ? "-"
                          : formatMoney(row.avgLeadValueCents)}
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {row.costPerQualifiedCents === null
                          ? "-"
                          : formatMoney(row.costPerQualifiedCents)}
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {row.costPerWonCents === null
                          ? "-"
                          : formatMoney(row.costPerWonCents)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={14}
                      className="px-5 py-10 text-center text-sm text-gray-500"
                    >
                      Marketing attribution will appear here as forms and calls
                      are captured.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        }
      />
    </section>
  );
}

function LeadSourceCard({
  row,
  totalActivity,
}: {
  row: LeadSourceRow;
  totalActivity: number;
}) {
  return (
    <article className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
            {row.source}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {totalActivity > 0
              ? `${Math.round(((row.leads + row.calls) / totalActivity) * 100)}% activity`
              : "No activity"}{" "}
            /{" "}
            {row.latest
              ? dateFormatter.format(row.latest)
              : "No recent activity"}
          </p>
        </div>
        <StatusBadge>{`${row.leads + row.calls} touches`}</StatusBadge>
      </div>

      <div className="mt-4">
        <ConfidenceRollupBadge rollup={row.confidence} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <ResponsiveDataField label="Leads">{row.leads}</ResponsiveDataField>
        <ResponsiveDataField label="Qualified">
          {row.qualified}
        </ResponsiveDataField>
        <ResponsiveDataField label="Proposals">
          {row.proposals}
        </ResponsiveDataField>
        <ResponsiveDataField label="Won">{row.wonDeals}</ResponsiveDataField>
        <ResponsiveDataField label="Close rate">
          {formatPercent(row.closeRate)}
        </ResponsiveDataField>
        <ResponsiveDataField label="Revenue">
          {formatMoney(row.wonCents)}
        </ResponsiveDataField>
        <ResponsiveDataField label="Weighted pipeline">
          {formatMoney(row.weightedPipelineCents)}
        </ResponsiveDataField>
        <ResponsiveDataField label="CPQL">
          {row.costPerQualifiedCents === null
            ? "-"
            : formatMoney(row.costPerQualifiedCents)}
        </ResponsiveDataField>
      </dl>
    </article>
  );
}

function SourceBreakdown({ rows }: { rows: LeadSourceRow[] }) {
  return (
    <aside className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Quality mix
        </h2>
        <LazyHelpTooltip content="Shows the strongest sources by qualification, proposal movement and revenue so users can spot channels creating commercial value." />
      </div>
      <div className="mt-4 space-y-3">
        {rows.length ? (
          rows.map((row) => (
            <div
              key={row.source}
              className="rounded-xl border border-gray-200 p-3 dark:border-gray-800"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                  {row.source}
                </p>
                <StatusBadge>{`${row.leads + row.calls} touches`}</StatusBadge>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-500 dark:text-gray-400">
                <MiniFact
                  label="Qualified"
                  value={`${row.qualified}/${row.leads}`}
                />
                <MiniFact label="Proposals" value={row.proposals.toString()} />
                <MiniFact
                  label="Close rate"
                  value={formatPercent(row.closeRate)}
                />
                <MiniFact label="Won" value={formatMoney(row.wonCents)} />
                <MiniFact
                  label="Weighted"
                  value={formatMoney(row.weightedPipelineCents)}
                />
                <MiniFact
                  label="CPQL"
                  value={
                    row.costPerQualifiedCents === null
                      ? "-"
                      : formatMoney(row.costPerQualifiedCents)
                  }
                />
              </dl>
            </div>
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            Source mix will appear once leads or calls are captured.
          </p>
        )}
      </div>
    </aside>
  );
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium text-gray-400 dark:text-gray-500">{label}</dt>
      <dd className="mt-0.5 font-semibold text-gray-700 dark:text-gray-200">
        {value}
      </dd>
    </div>
  );
}

function AttributionModelSwitcher({
  activeModel,
  activeRange,
}: {
  activeModel: AttributionModel;
  activeRange: MarketingRange;
}) {
  const active = attributionModelOptions.find(
    (option) => option.value === activeModel,
  );

  return (
    <section className="mt-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Attribution model
            </h2>
            <LazyHelpTooltip content="Switches the primary Attribution Reports ranking between first-touch, last-touch, assisted, linear, position-based and time-decay attribution models." />
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {active?.description ??
              "Choose how the report gives journey credit."}
          </p>
        </div>
        <div className="grid w-full min-w-0 grid-cols-2 gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1 sm:inline-flex sm:w-auto dark:border-gray-800 dark:bg-white/[0.03]">
          {attributionModelOptions.map((option) => {
            const isActive = option.value === activeModel;

            return (
              <Link
                key={option.value}
                href={attributionModelHref(option.value, activeRange)}
                className={`inline-flex min-h-10 min-w-0 items-center justify-center rounded-lg px-3 py-2 text-center text-sm font-semibold transition sm:flex-none ${
                  isActive
                    ? "bg-white text-brand-600 shadow-theme-xs dark:bg-gray-900 dark:text-brand-300"
                    : "text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                {option.label}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function AssistedJourneyReport({ rows }: { rows: AssistedJourneyRow[] }) {
  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <SectionHeading
        title="Assisted journey report"
        detail="First-touch, last-touch, assisted and weighted model contribution across captured journeys, leads and revenue."
        help="Version one uses captured first touch, timeline and last touch evidence. Assisted credit is given to middle journey touchpoints that helped before the final touch."
      />
      <div className="max-w-full min-w-0 overflow-x-auto overscroll-x-contain">
        <table className="w-full min-w-[1120px] divide-y divide-gray-100 text-sm dark:divide-gray-800">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase dark:bg-white/[0.03] dark:text-gray-400">
            <tr>
              <th className="px-5 py-3">Source / medium</th>
              <th className="px-5 py-3">Campaign</th>
              <th className="px-5 py-3">First-touch leads</th>
              <th className="px-5 py-3">Last-touch leads</th>
              <th className="px-5 py-3">Assisted leads</th>
              <th className="px-5 py-3">Assisted calls</th>
              <th className="px-5 py-3">Assisted pipeline</th>
              <th className="px-5 py-3">Assisted revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.length ? (
              rows.map((row) => (
                <tr key={`${row.source}-${row.medium}-${row.campaign}`}>
                  <td className="px-5 py-4">
                    <p className="font-medium text-gray-800 dark:text-white/90">
                      {row.source}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {row.medium}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                    {row.campaign}
                  </td>
                  <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                    {row.firstTouchLeads}
                    <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                      {row.firstTouchJourneys} journeys
                    </span>
                  </td>
                  <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                    {row.lastTouchLeads}
                    <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                      {row.lastTouchJourneys} journeys
                    </span>
                  </td>
                  <td className="px-5 py-4 font-medium text-gray-800 dark:text-white/90">
                    {row.assistedLeads}
                    <span className="mt-1 block text-xs font-normal text-gray-500 dark:text-gray-400">
                      {row.assistedJourneys} journeys
                    </span>
                  </td>
                  <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                    {row.assistedCalls}
                  </td>
                  <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                    {formatMoney(row.assistedValueCents)}
                  </td>
                  <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                    {formatMoney(row.assistedWonCents)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={8}
                  className="px-5 py-10 text-center text-sm text-gray-500"
                >
                  Assisted journey reporting will populate once journeys contain
                  more than first and last touchpoints.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AttributionReportTable({
  activeModel,
  rows,
}: {
  activeModel: AttributionModel;
  rows: AttributionModelReportRow[];
}) {
  const modelLabel =
    attributionModelOptions.find((option) => option.value === activeModel)
      ?.label ?? "Selected model";

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <SectionHeading
        title="Attribution performance report"
        detail={`${modelLabel} ranking across captured journeys, CRM leads, tracked calls and attribution roles.`}
        help="Use this report to compare first-touch, last-touch, assisted, linear, position-based and time-decay attribution at scale instead of reviewing only an individual lead journey."
      />
      <ResponsiveDataList
        breakpoint="lg"
        cardListClassName="divide-y divide-gray-100 dark:divide-gray-800"
        empty={
          <p className="px-5 py-10 text-center text-sm text-gray-500">
            Attribution reports will populate once tracked forms, calls or CRM
            leads are captured.
          </p>
        }
        getKey={(row) => `${row.source}-${row.medium}-${row.campaign}`}
        items={rows}
        renderCard={(row) => (
          <AttributionReportCard modelLabel={modelLabel} row={row} />
        )}
        table={
          <div className="max-w-full min-w-0 overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-[1600px] divide-y divide-gray-100 text-sm dark:divide-gray-800">
              <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase dark:bg-white/[0.03] dark:text-gray-400">
                <tr>
                  <th className="px-5 py-3">Source / medium</th>
                  <th className="px-5 py-3">Campaign</th>
                  <th className="px-5 py-3">{modelLabel} leads</th>
                  <th className="px-5 py-3">{modelLabel} value</th>
                  <th className="px-5 py-3">Confidence</th>
                  <th className="px-5 py-3">Journeys</th>
                  <th className="px-5 py-3">Forms</th>
                  <th className="px-5 py-3">Calls</th>
                  <th className="px-5 py-3">Leads</th>
                  <th className="px-5 py-3">Pipeline</th>
                  <th className="px-5 py-3">Revenue</th>
                  <th className="px-5 py-3">First</th>
                  <th className="px-5 py-3">Last</th>
                  <th className="px-5 py-3">Assisted</th>
                  <th className="px-5 py-3">Click IDs</th>
                  <th className="px-5 py-3">Latest</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.length ? (
                  rows.map((row) => (
                    <tr key={`${row.source}-${row.medium}-${row.campaign}`}>
                      <td className="px-5 py-4">
                        <p className="font-medium text-gray-800 dark:text-white/90">
                          {row.source}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {row.medium}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {row.campaign}
                      </td>
                      <td className="px-5 py-4 font-medium text-gray-800 dark:text-white/90">
                        {formatAttributionCount(row.modelLeads)}
                        <span className="mt-1 block text-xs font-normal text-gray-500 dark:text-gray-400">
                          {formatAttributionCount(row.modelJourneys)} journeys
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {formatMoney(row.modelValueCents)}
                        <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                          {formatMoney(row.modelRevenueCents)} revenue
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <ConfidenceRollupBadge rollup={row.confidenceRollup} />
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {row.records}
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {row.forms}
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {row.calls}
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {row.leads}
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {formatMoney(row.valueCents)}
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {formatMoney(row.wonCents)}
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {row.firstTouchLeads} leads
                        <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                          {row.firstTouchJourneys} journeys
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {row.lastTouchLeads} leads
                        <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                          {row.lastTouchJourneys} journeys
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {row.assistedLeads} leads
                        <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                          {formatMoney(row.assistedValueCents)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-500 dark:text-gray-400">
                        {row.clickIds.size
                          ? Array.from(row.clickIds).join(", ")
                          : "None"}
                      </td>
                      <td className="px-5 py-4 text-gray-500 dark:text-gray-400">
                        {row.latest ? dateFormatter.format(row.latest) : "None"}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={16}
                      className="px-5 py-10 text-center text-sm text-gray-500"
                    >
                      Attribution reports will populate once tracked forms,
                      calls or CRM leads are captured.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        }
      />
    </section>
  );
}

function AttributionReportCard({
  modelLabel,
  row,
}: {
  modelLabel: string;
  row: AttributionModelReportRow;
}) {
  return (
    <article className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
            {row.source}
          </p>
          <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
            {row.medium} / {row.campaign}
          </p>
        </div>
        <StatusBadge>{`${row.records} journeys`}</StatusBadge>
      </div>

      <div className="mt-4">
        <ConfidenceRollupBadge rollup={row.confidenceRollup} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <ResponsiveDataField label={`${modelLabel} leads`}>
          {formatAttributionCount(row.modelLeads)}
        </ResponsiveDataField>
        <ResponsiveDataField label={`${modelLabel} value`}>
          {formatMoney(row.modelValueCents)}
        </ResponsiveDataField>
        <ResponsiveDataField label="Forms">{row.forms}</ResponsiveDataField>
        <ResponsiveDataField label="Calls">{row.calls}</ResponsiveDataField>
        <ResponsiveDataField label="Pipeline">
          {formatMoney(row.valueCents)}
        </ResponsiveDataField>
        <ResponsiveDataField label="Revenue">
          {formatMoney(row.wonCents)}
        </ResponsiveDataField>
        <ResponsiveDataField label="First touch">
          {row.firstTouchLeads} leads
        </ResponsiveDataField>
        <ResponsiveDataField label="Assisted">
          {row.assistedLeads} leads
        </ResponsiveDataField>
      </dl>

      <div className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
        <p className="line-clamp-2">
          Click IDs:{" "}
          {row.clickIds.size ? Array.from(row.clickIds).join(", ") : "None"}
        </p>
        <p className="mt-1">
          Latest: {row.latest ? dateFormatter.format(row.latest) : "None"}
        </p>
      </div>
    </article>
  );
}

function AttributionReportQuality({
  rows,
}: {
  rows: Array<{
    campaign: string;
    calls: number;
    clickIds: Set<string>;
    confidenceRollup: AttributionConfidenceRollup;
    forms: number;
    leads: number;
    medium: string;
    records: number;
    source: string;
    wonCents: number;
  }>;
}) {
  return (
    <aside className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Attribution quality
        </h2>
        <LazyHelpTooltip content="Highlights whether captured attribution includes campaign and click-ID data needed for stronger reporting and provider feedback." />
      </div>
      <div className="mt-4 space-y-3">
        {rows.length ? (
          rows.map((row) => (
            <div
              key={`${row.source}-${row.medium}-${row.campaign}`}
              className="rounded-xl border border-gray-200 p-3 dark:border-gray-800"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                  {row.source} / {row.medium}
                </p>
                <StatusBadge>{row.confidenceRollup.level}</StatusBadge>
              </div>
              <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                {row.campaign} / {row.confidenceRollup.average}% confidence /{" "}
                {row.records} journeys / {row.leads} leads /{" "}
                {formatMoney(row.wonCents)} won
              </p>
              {row.confidenceRollup.topGaps.length ? (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Gaps: {row.confidenceRollup.topGaps.join(", ")}
                </p>
              ) : null}
            </div>
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            Quality signals will appear once attribution data is captured.
          </p>
        )}
      </div>
    </aside>
  );
}

function OfflineMediaReport({ rows }: { rows: OfflineMediaRow[] }) {
  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <SectionHeading
        title="Offline media performance"
        detail="Registered offline campaigns and manually tagged activity grouped by response cue and commercial outcome."
        help="Uses Offline Campaign records first, including campaign codes, dates, budgets, assigned tracking numbers, QR destinations, costs and linked attribution records, then falls back to source/campaign markers."
      />
      <ResponsiveDataList
        breakpoint="lg"
        cardListClassName="divide-y divide-gray-100 dark:divide-gray-800"
        empty={
          <p className="px-5 py-10 text-center text-sm text-gray-500">
            Offline media rows will appear when Offline Campaign records exist
            or source/campaign metadata contains offline markers such as radio,
            print, event, direct mail, leaflet, QR, poster, offline or manual.
          </p>
        }
        getKey={(row) =>
          row.campaignId ?? `${row.channel}-${row.source}-${row.campaign}`
        }
        items={rows}
        renderCard={(row) => <OfflineMediaCard row={row} />}
        table={
          <div className="max-w-full min-w-0 overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-[1620px] divide-y divide-gray-100 text-sm dark:divide-gray-800">
              <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase dark:bg-white/[0.03] dark:text-gray-400">
                <tr>
                  <th className="px-5 py-3">Channel</th>
                  <th className="px-5 py-3">Source / campaign</th>
                  <th className="px-5 py-3">Response setup</th>
                  <th className="px-5 py-3">Pacing</th>
                  <th className="px-5 py-3">Leads</th>
                  <th className="px-5 py-3">Calls</th>
                  <th className="px-5 py-3">Proposals</th>
                  <th className="px-5 py-3">Est. cost / CPL</th>
                  <th className="px-5 py-3">Open pipeline</th>
                  <th className="px-5 py-3">Weighted</th>
                  <th className="px-5 py-3">Won</th>
                  <th className="px-5 py-3">ROI</th>
                  <th className="px-5 py-3">Next action</th>
                  <th className="px-5 py-3">Latest</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.length ? (
                  rows.map((row) => (
                    <tr
                      key={
                        row.campaignId ??
                        `${row.channel}-${row.source}-${row.campaign}`
                      }
                    >
                      <td className="px-5 py-4">
                        <div className="space-y-1.5">
                          <StatusBadge>{row.channel}</StatusBadge>
                          {row.campaignStatus ? (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {row.campaignStatus.toLowerCase()}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-medium text-gray-800 dark:text-white/90">
                          {row.source}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {row.campaign}
                        </p>
                        <p className="mt-1 max-w-[240px] truncate text-xs text-gray-500 dark:text-gray-400">
                          Code: {row.campaignCode}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          <OfflineCueBadge
                            active={row.isRegisteredCampaign}
                            label="Campaign"
                          />
                          <OfflineCueBadge active={row.hasQrCue} label="QR" />
                          <OfflineCueBadge
                            active={row.hasPhoneCue}
                            label="Phone"
                          />
                        </div>
                        {row.isRegisteredCampaign ? (
                          <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                            {row.trackingNumbers} numbers /{" "}
                            {row.responseRecords} records / {row.touchpoints}{" "}
                            touchpoints
                          </p>
                        ) : null}
                      </td>
                      <td className="px-5 py-4">
                        <div className="space-y-2 text-xs text-gray-500 dark:text-gray-400">
                          <div>
                            <p className="font-semibold text-gray-700 dark:text-gray-300">
                              {row.scheduleStatus}
                            </p>
                            <p className="mt-1">{row.scheduleDetail}</p>
                          </div>
                          <div>
                            <p className="font-semibold text-gray-700 dark:text-gray-300">
                              {row.budgetStatus}
                            </p>
                            <p className="mt-1">{row.budgetDetail}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {row.leads}
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {row.calls}
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {row.proposals}
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        <p>
                          {row.estimatedCostCents === null
                            ? "-"
                            : formatMoney(row.estimatedCostCents)}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          CPL{" "}
                          {row.costPerLeadCents === null
                            ? "-"
                            : formatMoney(row.costPerLeadCents)}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {formatMoney(row.openPipelineCents)}
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {formatMoney(row.weightedPipelineCents)}
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        <p>{formatMoney(row.wonCents)}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {row.wonDeals} deals
                        </p>
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {formatRatio(row.estimatedRoi)}
                      </td>
                      <td className="max-w-[190px] px-5 py-4 text-gray-600 dark:text-gray-300">
                        {row.nextAction}
                      </td>
                      <td className="px-5 py-4 text-gray-500 dark:text-gray-400">
                        {row.latest
                          ? dateFormatter.format(row.latest)
                          : "No activity"}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={14}
                      className="px-5 py-10 text-center text-sm text-gray-500"
                    >
                      Offline media rows will appear when Offline Campaign
                      records exist or source/campaign metadata contains offline
                      markers such as radio, print, event, direct mail, leaflet,
                      QR, poster, offline or manual.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        }
      />
    </section>
  );
}

function OfflineMediaCard({ row }: { row: OfflineMediaRow }) {
  return (
    <article className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge>{row.channel}</StatusBadge>
            {row.campaignStatus ? (
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {row.campaignStatus.toLowerCase()}
              </span>
            ) : null}
          </div>
          <p className="mt-2 truncate text-sm font-semibold text-gray-800 dark:text-white/90">
            {row.source}
          </p>
          <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
            {row.campaign} / Code: {row.campaignCode}
          </p>
        </div>
        <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">
          {row.latest ? dateFormatter.format(row.latest) : "No activity"}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <OfflineCueBadge active={row.isRegisteredCampaign} label="Campaign" />
        <OfflineCueBadge active={row.hasQrCue} label="QR" />
        <OfflineCueBadge active={row.hasPhoneCue} label="Phone" />
      </div>

      {row.isRegisteredCampaign ? (
        <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
          {row.trackingNumbers} numbers / {row.responseRecords} records /{" "}
          {row.touchpoints} touchpoints
        </p>
      ) : null}

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <ResponsiveDataField label="Leads">{row.leads}</ResponsiveDataField>
        <ResponsiveDataField label="Calls">{row.calls}</ResponsiveDataField>
        <ResponsiveDataField label="Proposals">
          {row.proposals}
        </ResponsiveDataField>
        <ResponsiveDataField label="Est. cost">
          {row.estimatedCostCents === null
            ? "-"
            : formatMoney(row.estimatedCostCents)}
        </ResponsiveDataField>
        <ResponsiveDataField label="Weighted pipeline">
          {formatMoney(row.weightedPipelineCents)}
        </ResponsiveDataField>
        <ResponsiveDataField label="Won">
          {formatMoney(row.wonCents)} / {row.wonDeals} deals
        </ResponsiveDataField>
        <ResponsiveDataField label="ROI">
          {formatRatio(row.estimatedRoi)}
        </ResponsiveDataField>
        <ResponsiveDataField label="CPL">
          {row.costPerLeadCents === null
            ? "-"
            : formatMoney(row.costPerLeadCents)}
        </ResponsiveDataField>
      </dl>

      <div className="mt-4 grid gap-3 border-t border-gray-100 pt-3 text-sm text-gray-600 sm:grid-cols-2 dark:border-gray-800 dark:text-gray-300">
        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase dark:text-gray-400">
            Pacing
          </p>
          <p className="mt-1 font-medium text-gray-800 dark:text-white/90">
            {row.scheduleStatus}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {row.scheduleDetail}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase dark:text-gray-400">
            Next action
          </p>
          <p className="mt-1">{row.nextAction}</p>
        </div>
      </div>
    </article>
  );
}

function OfflineCueBadge({
  active,
  label,
}: {
  active: boolean;
  label: string;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
        active
          ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
          : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400"
      }`}
    >
      {active ? label : `No ${label}`}
    </span>
  );
}

function lostReasonSummary(reasons: SalesQualityRow["lostReasons"]) {
  if (!reasons.length) return "No lost deals";

  return reasons
    .slice(0, 2)
    .map((reason) => `${reason.reason} (${reason.count})`)
    .join(" / ");
}

function SalesQualityReport({ rows }: { rows: SalesQualityRow[] }) {
  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <SectionHeading
        title="Sales quality performance"
        detail="Commercial quality by source and owner, including contact speed, close timing, lost reasons and pipeline hygiene."
        help="Quality score combines lifecycle progress, follow-up hygiene, first-contact coverage and lost-reason completeness."
      />
      <ResponsiveDataList
        breakpoint="lg"
        cardListClassName="divide-y divide-gray-100 dark:divide-gray-800"
        empty={
          <p className="px-5 py-10 text-center text-sm text-gray-500">
            Sales quality rows will appear once opportunities exist in the
            selected range.
          </p>
        }
        getKey={(row) => `${row.source}-${row.ownerName}`}
        items={rows}
        renderCard={(row) => <SalesQualityCard row={row} />}
        table={
          <div className="max-w-full min-w-0 overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-[1720px] divide-y divide-gray-100 text-sm dark:divide-gray-800">
              <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase dark:bg-white/[0.03] dark:text-gray-400">
                <tr>
                  <th className="px-5 py-3">Source / owner</th>
                  <th className="px-5 py-3">Quality</th>
                  <th className="px-5 py-3">Leads</th>
                  <th className="px-5 py-3">Contacted</th>
                  <th className="px-5 py-3">Qualified</th>
                  <th className="px-5 py-3">Proposals</th>
                  <th className="px-5 py-3">Close rate</th>
                  <th className="px-5 py-3">Avg response</th>
                  <th className="px-5 py-3">Avg probability</th>
                  <th className="px-5 py-3">Weighted pipeline</th>
                  <th className="px-5 py-3">Won</th>
                  <th className="px-5 py-3">Lost reasons</th>
                  <th className="px-5 py-3">Time to close</th>
                  <th className="px-5 py-3">Follow-up gaps</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.length ? (
                  rows.map((row) => (
                    <tr key={`${row.source}-${row.ownerName}`}>
                      <td className="px-5 py-4">
                        <p className="font-medium text-gray-800 dark:text-white/90">
                          {row.source}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {row.ownerName}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${qualityScoreClasses(row.qualityScore)}`}
                        >
                          {row.qualityScore}%
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {row.leads}
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        <p>{row.contacted}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {formatPercent(row.contactedRate)}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {row.qualified}
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {row.proposals}
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {formatPercent(row.closeRate)}
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {formatDurationMinutes(row.avgResponseMinutes)}
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {formatPercent(row.avgProbability)}
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {formatMoney(row.weightedPipelineCents)}
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        <p>{formatMoney(row.wonCents)}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {row.wonDeals} deals
                        </p>
                      </td>
                      <td className="max-w-[220px] px-5 py-4 text-gray-600 dark:text-gray-300">
                        <p>{row.lostDeals} lost</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {lostReasonSummary(row.lostReasons)}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        {formatDurationDays(row.avgTimeToCloseDays)}
                      </td>
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                        <p>{row.missingNextStep} no next step</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {row.missingCloseDate} no close date / {row.staleOpen}{" "}
                          stale
                        </p>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={14}
                      className="px-5 py-10 text-center text-sm text-gray-500"
                    >
                      Sales quality rows will appear once opportunities exist in
                      the selected range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        }
      />
    </section>
  );
}

function SalesQualityCard({ row }: { row: SalesQualityRow }) {
  return (
    <article className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
            {row.source}
          </p>
          <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
            {row.ownerName}
          </p>
        </div>
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${qualityScoreClasses(row.qualityScore)}`}
        >
          {row.qualityScore}%
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <ResponsiveDataField label="Leads">{row.leads}</ResponsiveDataField>
        <ResponsiveDataField label="Contacted">
          {row.contacted} / {formatPercent(row.contactedRate)}
        </ResponsiveDataField>
        <ResponsiveDataField label="Qualified">
          {row.qualified}
        </ResponsiveDataField>
        <ResponsiveDataField label="Proposals">
          {row.proposals}
        </ResponsiveDataField>
        <ResponsiveDataField label="Close rate">
          {formatPercent(row.closeRate)}
        </ResponsiveDataField>
        <ResponsiveDataField label="Avg response">
          {formatDurationMinutes(row.avgResponseMinutes)}
        </ResponsiveDataField>
        <ResponsiveDataField label="Weighted pipeline">
          {formatMoney(row.weightedPipelineCents)}
        </ResponsiveDataField>
        <ResponsiveDataField label="Won">
          {formatMoney(row.wonCents)} / {row.wonDeals} deals
        </ResponsiveDataField>
      </dl>

      <div className="mt-4 grid gap-3 border-t border-gray-100 pt-3 text-sm text-gray-600 sm:grid-cols-2 dark:border-gray-800 dark:text-gray-300">
        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase dark:text-gray-400">
            Lost reasons
          </p>
          <p className="mt-1">
            {row.lostDeals} lost / {lostReasonSummary(row.lostReasons)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase dark:text-gray-400">
            Follow-up gaps
          </p>
          <p className="mt-1">
            {row.missingNextStep} no next step / {row.staleOpen} stale
          </p>
        </div>
      </div>
    </article>
  );
}

function CustomStageRollupReport({ rows }: { rows: CustomStageRollupRow[] }) {
  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <SectionHeading
        title="Pipeline stage performance"
        detail="Sales Quality rollup by configured pipeline stage and reporting bucket."
        help="Groups opportunities by the custom Sales Pipeline stage where available, with legacy stage buckets used only as a fallback."
      />
      <div className="max-w-full min-w-0 overflow-x-auto overscroll-x-contain">
        <table className="w-full min-w-[1120px] divide-y divide-gray-100 text-sm dark:divide-gray-800">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase dark:bg-white/[0.03] dark:text-gray-400">
            <tr>
              <th className="px-5 py-3">Pipeline stage</th>
              <th className="px-5 py-3">Bucket</th>
              <th className="px-5 py-3">Leads</th>
              <th className="px-5 py-3">Qualified</th>
              <th className="px-5 py-3">Proposals</th>
              <th className="px-5 py-3">Avg probability</th>
              <th className="px-5 py-3">Open pipeline</th>
              <th className="px-5 py-3">Weighted</th>
              <th className="px-5 py-3">Won / lost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.length ? (
              rows.map((row) => (
                <tr key={`${row.sortOrder}-${row.stageName}-${row.bucket}`}>
                  <td className="px-5 py-4">
                    <p className="font-medium text-gray-800 dark:text-white/90">
                      {row.stageName}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge>{stageLabel(row.bucket)}</StatusBadge>
                  </td>
                  <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                    {row.leads}
                  </td>
                  <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                    {row.qualified}
                  </td>
                  <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                    {row.proposals}
                  </td>
                  <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                    {formatPercent(row.avgProbability)}
                  </td>
                  <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                    {formatMoney(row.openPipelineCents)}
                  </td>
                  <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                    {formatMoney(row.weightedPipelineCents)}
                  </td>
                  <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                    <p>{formatMoney(row.wonCents)}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {row.wonDeals} won / {row.lostDeals} lost
                    </p>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={9}
                  className="px-5 py-10 text-center text-sm text-gray-500"
                >
                  Pipeline stage rows will appear once opportunities exist in
                  the selected range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SalesLifecycleTransitionReport({
  rows,
}: {
  rows: SalesLifecycleTransitionRow[];
}) {
  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <SectionHeading
        title="Lifecycle transition history"
        detail="Recent stage movement from stored sales lifecycle events."
        help="Groups created and stage-change events by their from/to pipeline labels so Sales Quality can show movement history, value and lost-reason context."
      />
      <div className="max-w-full min-w-0 overflow-x-auto overscroll-x-contain">
        <table className="w-full min-w-[1060px] divide-y divide-gray-100 text-sm dark:divide-gray-800">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase dark:bg-white/[0.03] dark:text-gray-400">
            <tr>
              <th className="px-5 py-3">Movement</th>
              <th className="px-5 py-3">Events</th>
              <th className="px-5 py-3">Top source</th>
              <th className="px-5 py-3">Pipeline value</th>
              <th className="px-5 py-3">Lost reason</th>
              <th className="px-5 py-3">Latest</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.length ? (
              rows.map((row) => (
                <tr key={`${row.fromLabel}-${row.toLabel}`}>
                  <td className="px-5 py-4">
                    <p className="font-medium text-gray-800 dark:text-white/90">
                      {row.fromLabel}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      to {row.toLabel}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                    {row.count}
                  </td>
                  <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                    {row.source}
                  </td>
                  <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                    {formatMoney(row.valueCents)}
                  </td>
                  <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                    {row.lostReason ?? "-"}
                  </td>
                  <td className="px-5 py-4 text-gray-500 dark:text-gray-400">
                    {row.latest
                      ? dateFormatter.format(row.latest)
                      : "No activity"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={6}
                  className="px-5 py-10 text-center text-sm text-gray-500"
                >
                  Lifecycle transition rows will appear once stage movement is
                  recorded in the selected range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ExecutiveClientPackHeader({
  activeRangeLabel,
  downloadHref,
  packHref,
}: {
  activeRangeLabel: string;
  downloadHref: string;
  packHref: string;
}) {
  return (
    <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03] print:border-gray-300 print:shadow-none">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-brand-600 uppercase dark:text-brand-300 print:text-gray-700">
            iD30 CRM client pack
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white print:text-black">
            Executive Report
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 print:text-gray-700">
            Reporting range: {activeRangeLabel}
          </p>
        </div>
        <ExecutiveReportExportActions
          downloadHref={downloadHref}
          packHref={packHref}
          printMode
        />
      </div>
    </section>
  );
}

function ExecutiveReport({
  activeRange,
  activeRangeLabel,
  attributedLeads,
  lifecycleRows,
  printMode,
  salesQualityRows,
  sourceRows,
  totalLeads,
  totalSpendCents,
  wonRevenue,
}: {
  activeRange: MarketingRange;
  activeRangeLabel: string;
  attributedLeads: number;
  lifecycleRows: ReturnType<typeof buildLifecycleFunnelRows>;
  printMode: boolean;
  salesQualityRows: SalesQualityRow[];
  sourceRows: LeadSourceRow[];
  totalLeads: number;
  totalSpendCents: number;
  wonRevenue: number;
}) {
  const qualified = lifecycleRows.find((row) => row.key === "qualified");
  const proposals = lifecycleRows.find((row) => row.key === "proposals");
  const won = lifecycleRows.find((row) => row.key === "won");
  const attributionCoverage = percentOf(attributedLeads, totalLeads);
  const roas = totalSpendCents > 0 ? wonRevenue / totalSpendCents : null;
  const packHref = executiveReportPackHref(activeRange);
  const downloadHref = executiveReportDownloadHref(activeRange);

  return (
    <section
      className={printMode ? "space-y-6 print:text-black" : "mt-4 space-y-6"}
    >
      {printMode ? (
        <style>{`
          @page { margin: 16mm; }
          @media print {
            body { background: #ffffff !important; }
            aside, header, nav { display: none !important; }
            main { padding: 0 !important; }
          }
        `}</style>
      ) : null}

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03] print:border-gray-300 print:shadow-none">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-brand-600 uppercase dark:text-brand-300">
              {activeRangeLabel} commercial attribution summary
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
              Marketing is measured against qualified pipeline and revenue, not
              just lead volume.
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
              This client-facing view summarises the commercial outcome from
              captured attribution, lead quality and pipeline movement. It
              avoids internal confidence factors and queue diagnostics.
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 lg:items-end">
            <StatusBadge>{`${formatPercent(attributionCoverage)} attributed`}</StatusBadge>
            <ExecutiveReportExportActions
              downloadHref={downloadHref}
              packHref={packHref}
              printMode={printMode}
            />
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ExecutiveMetric
            label="Leads"
            value={totalLeads.toString()}
            detail={`${attributedLeads} attributed`}
          />
          <ExecutiveMetric
            label="Qualified pipeline"
            value={(qualified?.count ?? 0).toString()}
            detail={formatMoney(qualified?.valueCents ?? 0)}
          />
          <ExecutiveMetric
            label="Proposals"
            value={(proposals?.count ?? 0).toString()}
            detail={formatMoney(proposals?.valueCents ?? 0)}
          />
          <ExecutiveMetric
            label="Revenue"
            value={formatMoney(wonRevenue)}
            detail={
              roas === null ? "ROAS unavailable" : `${formatRatio(roas)} ROAS`
            }
          />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ExecutivePanel title="Lifecycle Progress">
          <div className="space-y-3">
            {lifecycleRows.slice(1).map((row) => (
              <div
                key={row.key}
                className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-gray-800 dark:text-white/90">
                    {row.label}
                  </p>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    {row.count}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {formatMoney(row.valueCents ?? 0)} /{" "}
                  {row.conversionRate === null
                    ? "Baseline"
                    : `${formatPercent(row.conversionRate ?? null)} from previous stage`}
                </p>
              </div>
            ))}
          </div>
        </ExecutivePanel>

        <ExecutivePanel title="Best Commercial Sources">
          <div className="space-y-3">
            {sourceRows.length ? (
              sourceRows.map((row) => (
                <div
                  key={row.source}
                  className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-gray-800 dark:text-white/90">
                      {row.source}
                    </p>
                    <StatusBadge>{formatPercent(row.closeRate)}</StatusBadge>
                  </div>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {row.qualified} qualified / {row.proposals} proposals /{" "}
                    {formatMoney(row.wonCents)} won
                  </p>
                </div>
              ))
            ) : (
              <EmptyReportText>
                No source quality rows in this range.
              </EmptyReportText>
            )}
          </div>
        </ExecutivePanel>
      </div>

      <ExecutivePanel title="Sales Quality Summary">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {salesQualityRows.length ? (
            salesQualityRows.map((row) => (
              <div
                key={`${row.source}-${row.ownerName}`}
                className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
              >
                <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                  {row.source}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {row.ownerName}
                </p>
                <p className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">
                  {row.qualityScore}%
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {formatMoney(row.weightedPipelineCents)} weighted
                </p>
              </div>
            ))
          ) : (
            <EmptyReportText>
              No sales quality rows in this range.
            </EmptyReportText>
          )}
        </div>
      </ExecutivePanel>
    </section>
  );
}

function ExecutiveMetric({
  detail,
  label,
  value,
}: {
  detail: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
        {value}
      </p>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{detail}</p>
    </div>
  );
}

function ExecutivePanel({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function EmptyReportText({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
      {children}
    </p>
  );
}

function qualityScoreClasses(score: number) {
  if (score >= 75) {
    return "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300";
  }
  if (score >= 50) {
    return "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300";
  }
  return "bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300";
}

function RecentInteractions({
  interactions,
}: {
  interactions: Array<{
    id: string;
    type: string;
    title: string;
    source: string;
    date: Date;
    status: string;
  }>;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Recent marketing interactions
        </h2>
        <LazyHelpTooltip content="Shows the newest tracked calls, forms and attribution events so users can audit recent visitor activity." />
      </div>
      <div className="mt-4 space-y-3">
        {interactions.length ? (
          interactions.map((interaction) => (
            <div
              key={interaction.id}
              className="rounded-xl border border-gray-200 p-3 dark:border-gray-800"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                  {interaction.title}
                </p>
                <StatusBadge>{interaction.type}</StatusBadge>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {interaction.source} / {dateFormatter.format(interaction.date)}
              </p>
            </div>
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No tracked marketing interactions yet.
          </p>
        )}
      </div>
    </section>
  );
}

function RecentSpendRows({
  rows,
}: {
  rows: Array<{
    id: string;
    provider: string;
    campaignName: string | null;
    campaignId: string;
    date: Date;
    currency: string;
    costMicros: bigint;
    clicks: number;
    conversions: number;
  }>;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Recent ad spend imports
        </h2>
        <LazyHelpTooltip content="Lists imported ad cost rows from marketing platforms once provider sync jobs are configured and running." />
      </div>
      <div className="mt-4 space-y-3">
        {rows.length ? (
          rows.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 p-3 dark:border-gray-800"
            >
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                  {row.campaignName || row.campaignId}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {providerLabel(row.provider)} /{" "}
                  {dateFormatter.format(row.date)} / {row.clicks} clicks
                </p>
              </div>
              <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                {formatMoney(microsToCents(row.costMicros), row.currency)}
              </p>
            </div>
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            Spend rows will appear here once Google Ads or Meta imports run.
          </p>
        )}
      </div>
    </section>
  );
}

function ProviderSyncHealth({
  logs,
}: {
  logs: Array<{
    id: string;
    provider: string;
    status: string;
    syncType: string;
    recordsRead: number;
    recordsWritten: number;
    startedAt: Date;
    message: string | null;
  }>;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Provider sync health
        </h2>
        <LazyHelpTooltip content="Shows recent provider import or conversion-upload jobs so users know whether marketing data is up to date." />
      </div>
      <div className="mt-4 space-y-3">
        {logs.length ? (
          logs.map((log) => (
            <div
              key={log.id}
              className="rounded-xl border border-gray-200 p-3 dark:border-gray-800"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                  {providerLabel(log.provider)} / {log.syncType}
                </p>
                <StatusBadge>{log.status}</StatusBadge>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {dateFormatter.format(log.startedAt)} / {log.recordsWritten}/
                {log.recordsRead} records
              </p>
              {log.message ? (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {log.message}
                </p>
              ) : null}
            </div>
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            Sync logs will appear here once provider jobs start running.
          </p>
        )}
      </div>
    </section>
  );
}

function ProviderPerformanceCard({
  row,
}: {
  row: {
    provider: (typeof marketingIntegrationProviderDefinitions)[number];
    state: ReturnType<typeof getMarketingIntegrationProviderState>;
    spend:
      | {
          costCents: number;
          clicks: number;
          impressions: number;
          conversions: number;
          campaigns: Set<string>;
          latestDate: Date | null;
          currency: string;
        }
      | undefined;
    latestLog: {
      status: string;
      syncType: string;
      startedAt: Date;
    } | null;
  };
}) {
  return (
    <article className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className={`inline-grid h-12 w-12 shrink-0 place-items-center rounded-xl ring-1 ${row.provider.accent}`}
          >
            <AttributionSourceIconSlot
              className="size-6"
              fallbackKind="search"
              iconClassName="block h-6 w-6"
              label={row.provider.name}
            />
          </span>
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-white/90">
              {row.provider.name}
            </h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {row.state.status}
            </p>
          </div>
        </div>
        <StatusBadge>{row.latestLog?.status ?? "No sync"}</StatusBadge>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <MiniMetric
          label="Spend"
          value={
            row.spend
              ? formatMoney(row.spend.costCents, row.spend.currency)
              : "None"
          }
        />
        <MiniMetric
          label="Campaigns"
          value={(row.spend?.campaigns.size ?? 0).toString()}
        />
        <MiniMetric
          label="Clicks"
          value={(row.spend?.clicks ?? 0).toString()}
        />
        <MiniMetric
          label="Conversions"
          value={Math.round(row.spend?.conversions ?? 0).toString()}
        />
      </div>
      <p className="mt-4 text-xs leading-5 text-gray-500 dark:text-gray-400">
        {row.latestLog
          ? `${row.latestLog.syncType} last ran ${dateFormatter.format(row.latestLog.startedAt)}.`
          : row.state.next}
      </p>
      <Link
        href={`/settings/integrations/${row.provider.slug}`}
        className="mt-4 inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.05]"
      >
        Configure
      </Link>
    </article>
  );
}

function ConversionEvidence({
  records,
}: {
  records: Array<{
    id: string;
    source: string;
    createdAt: Date;
    trackingPhoneNumber: string | null;
    opportunityId: string | null;
    callLogId: string | null;
  }>;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <SectionHeading
        title="Conversion evidence"
        detail="Recent CRM attribution records that can be used for reporting or provider conversion uploads."
        help="Shows the captured forms and calls that prove the CRM has conversion events to report back to marketing platforms."
      />
      <div className="max-w-full min-w-0 overflow-x-auto overscroll-x-contain">
        <table className="min-w-full divide-y divide-gray-100 text-sm dark:divide-gray-800">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase dark:bg-white/[0.03] dark:text-gray-400">
            <tr>
              <th className="px-5 py-3">Type</th>
              <th className="px-5 py-3">Evidence</th>
              <th className="px-5 py-3">Linked record</th>
              <th className="px-5 py-3">Captured</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {records.length ? (
              records.map((record) => (
                <tr key={record.id}>
                  <td className="px-5 py-4 font-medium text-gray-800 dark:text-white/90">
                    {record.source === "PHONE"
                      ? "Tracked call"
                      : "Tracked form"}
                  </td>
                  <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                    {record.trackingPhoneNumber || "Website attribution"}
                  </td>
                  <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                    {record.opportunityId
                      ? "Opportunity"
                      : record.callLogId
                        ? "Call log"
                        : "Attribution only"}
                  </td>
                  <td className="px-5 py-4 text-gray-500 dark:text-gray-400">
                    {dateFormatter.format(record.createdAt)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={4}
                  className="px-5 py-10 text-center text-sm text-gray-500"
                >
                  Conversion evidence will appear once forms or tracked calls
                  are captured.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ConversionUploadReadiness({
  logs,
  providers,
}: {
  logs: Array<{
    id: string;
    message: string | null;
    provider: string;
    recordsRead: number;
    status: string;
    syncType: string;
    recordsWritten: number;
    startedAt: Date;
  }>;
  providers: Array<{
    provider: (typeof marketingIntegrationProviderDefinitions)[number];
    state: ReturnType<typeof getMarketingIntegrationProviderState>;
  }>;
}) {
  return (
    <aside className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Upload readiness
        </h2>
        <LazyHelpTooltip content="Shows whether marketing providers are connected and whether recent conversion upload jobs have moved CRM conversions back to ad platforms." />
      </div>
      <div className="mt-4 space-y-3">
        {providers.map((row) => (
          <div
            key={row.provider.provider}
            className="rounded-xl border border-gray-200 p-3 dark:border-gray-800"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                {row.provider.name}
              </p>
              <StatusBadge>{row.state.status}</StatusBadge>
            </div>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
              {row.state.next}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-5 border-t border-gray-100 pt-4 dark:border-gray-800">
        <p className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
          Recent upload jobs
        </p>
        <div className="mt-3 space-y-2">
          {logs.length ? (
            logs.map((log) => (
              <div
                key={log.id}
                className="rounded-lg bg-gray-50 p-3 text-sm dark:bg-white/[0.03]"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-gray-800 dark:text-white/90">
                    {providerLabel(log.provider)}
                  </span>
                  <StatusBadge>{log.status}</StatusBadge>
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {log.syncType} / {log.recordsRead} read / {log.recordsWritten}{" "}
                  written / {dateFormatter.format(log.startedAt)}
                </p>
                {log.message ? (
                  <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-gray-300">
                    {log.message}
                  </p>
                ) : null}
              </div>
            ))
          ) : (
            <p className="rounded-lg border border-dashed border-gray-300 p-3 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              No conversion upload jobs have run yet.
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}

function ConversionUploadSummary({
  counts,
  metrics,
  total,
}: {
  counts: ConversionUploadCounts;
  metrics: ConversionUploadMetrics;
  total: number;
}) {
  const mappedRows = metrics.providerRows.reduce(
    (sum, row) => sum + row.mapped,
    0,
  );
  const totalProviderRows = metrics.providerRows.reduce(
    (sum, row) => sum + row.total,
    0,
  );
  const mappingRate =
    totalProviderRows > 0 ? (mappedRows / totalProviderRows) * 100 : null;

  return (
    <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Upload feedback
            </h2>
            <LazyHelpTooltip content="Summarises the current conversion upload queue and highlights the setup or provider issues that need operator attention before uploads can be trusted." />
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Queue status across the selected reporting range, with issue
            categories from the most recent upload rows.
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-800">
          <span className="font-semibold text-gray-800 dark:text-white/90">
            {formatPercent(metrics.uploadedRate)}
          </span>{" "}
          <span className="text-gray-500 dark:text-gray-400">
            attempt success
          </span>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <UploadStatusMetric
          label="Pending"
          value={counts.PENDING}
          tone="neutral"
        />
        <UploadStatusMetric label="Sent" value={counts.SENT} tone="success" />
        <UploadStatusMetric label="Failed" value={counts.FAILED} tone="error" />
        <UploadStatusMetric
          label="Skipped"
          value={counts.SKIPPED}
          tone="warning"
        />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <ConversionRateCard
          detail="Recent rows needing setup, evidence or provider review."
          label="Attention rows"
          value={metrics.attentionCount.toString()}
        />
        <ConversionRateCard
          detail="Recent rows blocked by provider errors, credentials or connection state."
          label="Blocking rows"
          value={metrics.blockerCount.toString()}
        />
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-4">
        <ConversionRateCard
          detail="Rows with a supported provider click ID."
          label="Match rate"
          value={formatPercent(metrics.matchRate)}
        />
        <ConversionRateCard
          detail="Rows mapped to a provider conversion action."
          label="Mapping rate"
          value={formatPercent(mappingRate)}
        />
        <ConversionRateCard
          detail="Sent divided by sent plus failed attempts."
          label="Upload success"
          value={formatPercent(metrics.uploadedRate)}
        />
        <ConversionRateCard
          detail="Failed rows as a share of the full queue."
          label="Failed rate"
          value={formatPercent(metrics.failedRate)}
        />
      </div>

      {metrics.providerRows.length ? (
        <div className="mt-5 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
          <p className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
            Provider match coverage
          </p>
          <div className="mt-3 grid gap-2 lg:grid-cols-3">
            {metrics.providerRows.map((row) => (
              <div
                key={row.provider}
                className="rounded-lg bg-gray-50 p-3 dark:bg-white/[0.03]"
              >
                <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                  {providerLabel(row.provider)}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {formatPercent(row.matchRate)} matched /{" "}
                  {formatPercent(row.mappingRate)} mapped
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {row.matched} click IDs, {row.mapped} mappings, {row.total}{" "}
                  rows
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
        <p className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
          Attention categories
        </p>
        {metrics.issueRows.length ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {metrics.issueRows.map((row) => (
              <div
                key={`${row.category}-${row.label}`}
                className="rounded-lg bg-gray-50 p-3 dark:bg-white/[0.03]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                      {row.label}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {row.category}
                    </p>
                  </div>
                  <ConversionSeverityBadge severity={row.severity} />
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {row.count} recent row{row.count === 1 ? "" : "s"}
                </p>
                <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-gray-300">
                  {row.nextAction}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-dashed border-gray-300 p-3 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No recent conversion upload rows need attention.
          </p>
        )}
      </div>
    </section>
  );
}

function UploadStatusMetric({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "error" | "neutral" | "success" | "warning";
  value: number;
}) {
  const toneClass =
    tone === "success"
      ? "border-success-200 bg-success-50 text-success-700 dark:border-success-900/40 dark:bg-success-900/20 dark:text-success-300"
      : tone === "error"
        ? "border-error-200 bg-error-50 text-error-700 dark:border-error-900/40 dark:bg-error-900/20 dark:text-error-300"
        : tone === "warning"
          ? "border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-900/40 dark:bg-warning-900/20 dark:text-warning-300"
          : "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300";

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function ConversionRateCard({
  detail,
  label,
  value,
}: {
  detail: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold text-gray-800 dark:text-white/90">
        {value}
      </p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{detail}</p>
    </div>
  );
}

function ConversionSeverityBadge({
  severity,
}: {
  severity: ConversionUploadClassification["severity"];
}) {
  const label =
    severity === "error"
      ? "Blocked"
      : severity === "warning"
        ? "Needs review"
        : severity === "info"
          ? "Info"
          : "Ready";
  const classes =
    severity === "error"
      ? "bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300"
      : severity === "warning"
        ? "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
        : severity === "info"
          ? "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300"
          : "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300";

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${classes}`}
    >
      {label}
    </span>
  );
}

function ConversionIssueBadge({ upload }: { upload: ConversionUploadRow }) {
  const classification = conversionUploadClassification(upload);

  if (classification.severity === "ready")
    return <ConversionSeverityBadge severity="ready" />;

  return (
    <div className="space-y-1">
      <ConversionSeverityBadge severity={classification.severity} />
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {classification.label}
      </p>
    </div>
  );
}

function ConversionUploadQueue({
  uploads,
}: {
  uploads: ConversionUploadRow[];
}) {
  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <SectionHeading
        title="Lifecycle upload queue"
        detail="Prepared CRM lifecycle events waiting for the Google Ads, Bing Ads or Meta upload worker."
        help="This queue is the hand-off point between CRM attribution and provider APIs. Rows are deduplicated per provider, lifecycle event and CRM record."
      />
      <div className="max-w-full min-w-0 overflow-x-auto overscroll-x-contain">
        <table className="w-full min-w-[1300px] divide-y divide-gray-100 text-sm dark:divide-gray-800">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase dark:bg-white/[0.03] dark:text-gray-400">
            <tr>
              <th className="px-5 py-3">Provider</th>
              <th className="px-5 py-3">Lifecycle event</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Click ID</th>
              <th className="px-5 py-3">Classification</th>
              <th className="px-5 py-3">Attempts</th>
              <th className="px-5 py-3">Feedback</th>
              <th className="px-5 py-3">Next action</th>
              <th className="px-5 py-3">Value</th>
              <th className="px-5 py-3">Occurred</th>
              <th className="px-5 py-3">Last attempt</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {uploads.length ? (
              uploads.map((upload) => (
                <tr key={upload.id}>
                  <td className="px-5 py-4 font-medium text-gray-800 dark:text-white/90">
                    {providerLabel(upload.provider)}
                  </td>
                  <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                    <span className="font-medium text-gray-800 dark:text-white/90">
                      {upload.conversionType.replaceAll("_", " ")}
                    </span>
                    <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                      {upload.conversionName ||
                        upload.message ||
                        `${upload.entityType} ${upload.entityId}`}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge>{upload.status}</StatusBadge>
                  </td>
                  <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                    {upload.clickIdSource ?? "Not mapped"}
                  </td>
                  <td className="px-5 py-4">
                    <ConversionIssueBadge upload={upload} />
                  </td>
                  <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                    {upload.attemptCount}
                  </td>
                  <td className="max-w-xs px-5 py-4 text-gray-600 dark:text-gray-300">
                    {upload.message ?? "No provider feedback yet."}
                  </td>
                  <td className="max-w-xs px-5 py-4 text-gray-600 dark:text-gray-300">
                    {conversionUploadNextAction(upload)}
                  </td>
                  <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                    {upload.valueCents === null
                      ? "No value"
                      : formatMoney(upload.valueCents, upload.currency)}
                  </td>
                  <td className="px-5 py-4 text-gray-500 dark:text-gray-400">
                    {dateFormatter.format(upload.occurredAt)}
                  </td>
                  <td className="px-5 py-4 text-gray-500 dark:text-gray-400">
                    {upload.lastAttemptAt
                      ? dateFormatter.format(upload.lastAttemptAt)
                      : "Not tried"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={11}
                  className="px-5 py-10 text-center text-sm text-gray-500"
                >
                  No lifecycle upload rows have been prepared yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SectionHeading({
  action,
  detail,
  help,
  title,
}: {
  action?: ReactNode;
  detail: string;
  help: string;
  title: string;
}) {
  return (
    <div className="border-b border-gray-200 p-5 dark:border-gray-800">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 items-start gap-2">
            <h2 className="min-w-0 text-base font-semibold break-words text-gray-800 dark:text-white/90">
              {title}
            </h2>
            <LazyHelpTooltip content={help} />
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
            {detail}
          </p>
        </div>
        {action ? (
          <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">
            {action}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3 dark:bg-white/[0.03]">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-gray-800 dark:text-white/90">
        {value}
      </p>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7.25 12.5a5.25 5.25 0 1 0 0-10.5 5.25 5.25 0 0 0 0 10.5ZM11 11l3 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 7.25a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5ZM1.5 14.25c.5-2.55 2-4 4.5-4s4 1.45 4.5 4M10.75 7.25a2 2 0 0 0 0-4M12.1 10.25c1.25.45 2.05 1.8 2.4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6.6 9.4 9.4 6.6M7 4.25l.8-.8a3 3 0 0 1 4.25 4.24l-.8.81M9 11.75l-.8.8a3 3 0 0 1-4.25-4.24l.8-.81"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2.5 4.25h11v7.5h-11v-7.5ZM3 4.75l5 4 5-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 3.25h10v7.25H8.5L4.75 13v-2.5H3V3.25Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 6.75h.01M8 6.75h.01M10.5 6.75h.01"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CursorIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 2.5 12.25 8l-3.5 1-1 3.5L4 2.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m3.5 7.25 2.2 2.2 4.8-5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Metric({
  label,
  value,
  detail,
  muted = false,
}: {
  label: string;
  value: string;
  detail: string;
  muted?: boolean;
}) {
  return (
    <MetricCard
      detail={detail}
      label={label}
      muted={muted}
      value={value}
      valueClassName={`mt-2 text-2xl font-semibold ${
        muted
          ? "text-gray-500 dark:text-gray-400"
          : "text-gray-800 dark:text-white/90"
      }`}
    />
  );
}
