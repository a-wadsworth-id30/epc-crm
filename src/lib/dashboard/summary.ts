import "server-only";

import type { SalesStage } from "@prisma/client";
import { revalidateTag, unstable_cache } from "next/cache";
import {
  addUtcDays,
  marketingDailyRollupProviderAll,
  marketingDailyRollupSourceAll,
  startOfUtcDay,
  utcDaysBetween,
} from "@/lib/marketing/daily-rollups";
import { prisma } from "@/lib/prisma";
import { isPrismaMissingSchemaError } from "@/lib/prisma-errors";

export const dashboardSummaryCacheTag = "dashboard-summary";
export const dashboardSummaryRevalidateSeconds = 60;
export const dashboardMarketingWindowDays = 30;

export type DashboardStageMetric = {
  count: number;
  stage: SalesStage;
  valueCents: number;
};

export type DashboardSummary = {
  companies: number;
  contacts: number;
  currency: string | null;
  marketing: {
    attributedLeadCount: number;
    formLeadCount: number;
    importedClicks: number;
    importedConversions: number;
    importedSpendCents: number;
    phoneLeadCount: number;
    sessions: number;
    windowDays: number;
  };
  missedCallTasksCount: number;
  openTaskCount: number;
  stageMetrics: DashboardStageMetric[];
};

type DashboardMarketingSummary = DashboardSummary["marketing"];

async function loadDashboardMarketingSummaryFromRollups({
  now,
  windowStart,
}: {
  now: Date;
  windowStart: Date;
}): Promise<DashboardMarketingSummary | null> {
  const from = startOfUtcDay(windowStart);
  const toExclusive = addUtcDays(startOfUtcDay(now), 1);
  const expectedDays = utcDaysBetween(from, toExclusive);
  const where = {
    date: { gte: from, lt: toExclusive },
    provider: marketingDailyRollupProviderAll,
    source: marketingDailyRollupSourceAll,
  };
  const [coverage, aggregate] = await Promise.all([
    prisma.marketingDailyRollup.count({ where }),
    prisma.marketingDailyRollup.aggregate({
      where,
      _sum: {
        attributionRecords: true,
        clicks: true,
        conversions: true,
        costMicros: true,
        formLeads: true,
        phoneLeads: true,
        sessions: true,
      },
    }),
  ]);

  if (coverage < expectedDays) return null;

  const formLeadCount = aggregate._sum.formLeads ?? 0;
  const phoneLeadCount = aggregate._sum.phoneLeads ?? 0;
  const importedCostMicros = Number(aggregate._sum.costMicros ?? BigInt(0));

  return {
    attributedLeadCount: formLeadCount + phoneLeadCount,
    formLeadCount,
    importedClicks: aggregate._sum.clicks ?? 0,
    importedConversions: aggregate._sum.conversions ?? 0,
    importedSpendCents: Math.round(importedCostMicros / 10000),
    phoneLeadCount,
    sessions: aggregate._sum.sessions ?? 0,
    windowDays: dashboardMarketingWindowDays,
  };
}

async function loadDashboardMarketingSummaryFromRaw({
  windowStart,
}: {
  windowStart: Date;
}): Promise<DashboardMarketingSummary> {
  const [marketingSessions, marketingRecords, marketingSpendRows] =
    await Promise.all([
      prisma.attributionSnapshot.count({
        where: { updatedAt: { gte: windowStart } },
      }),
      prisma.attributionRecord.groupBy({
        by: ["source"],
        where: { createdAt: { gte: windowStart } },
        _count: { _all: true },
      }),
      prisma.marketingCampaignSpend.aggregate({
        where: { date: { gte: windowStart } },
        _sum: {
          clicks: true,
          conversions: true,
          costMicros: true,
        },
      }),
    ]);
  const sourceCounts = new Map(
    marketingRecords.map((record) => [record.source, record._count._all]),
  );
  const formLeadCount = sourceCounts.get("FORM") ?? 0;
  const phoneLeadCount = sourceCounts.get("PHONE") ?? 0;
  const importedCostMicros = Number(marketingSpendRows._sum.costMicros ?? 0);

  return {
    attributedLeadCount: formLeadCount + phoneLeadCount,
    formLeadCount,
    importedClicks: marketingSpendRows._sum.clicks ?? 0,
    importedConversions: marketingSpendRows._sum.conversions ?? 0,
    importedSpendCents: Math.round(importedCostMicros / 10000),
    phoneLeadCount,
    sessions: marketingSessions,
    windowDays: dashboardMarketingWindowDays,
  };
}

async function loadDashboardMarketingSummary({
  now,
  windowStart,
}: {
  now: Date;
  windowStart: Date;
}) {
  try {
    const rollupSummary = await loadDashboardMarketingSummaryFromRollups({
      now,
      windowStart,
    });

    if (rollupSummary) return rollupSummary;
  } catch (error) {
    if (!isOptionalRollupReadError(error)) {
      throw error;
    }
  }

  return loadDashboardMarketingSummaryFromRaw({ windowStart });
}

function isOptionalRollupReadError(error: unknown) {
  return isPrismaMissingSchemaError(error, {
    modelName: "MarketingDailyRollup",
    tableName: "MarketingDailyRollup",
  });
}

async function loadDashboardSummary(): Promise<DashboardSummary> {
  const now = new Date();
  const marketingWindowStart = addUtcDays(
    startOfUtcDay(now),
    -(dashboardMarketingWindowDays - 1),
  );

  const [
    companies,
    contacts,
    opportunityStageRows,
    currencySample,
    openTaskCount,
    missedCallTasksCount,
    marketingSummary,
  ] = await Promise.all([
    prisma.company.count(),
    prisma.contact.count(),
    prisma.salesOpportunity.groupBy({
      by: ["stage"],
      _count: { _all: true },
      _sum: { valueCents: true },
    }),
    prisma.salesOpportunity.findFirst({
      orderBy: [{ updatedAt: "desc" }],
      select: { currency: true },
    }),
    prisma.task.count({ where: { status: { not: "DONE" } } }),
    prisma.task.count({
      where: {
        status: { not: "DONE" },
        title: { startsWith: "Missed call" },
      },
    }),
    loadDashboardMarketingSummary({
      now,
      windowStart: marketingWindowStart,
    }),
  ]);

  return {
    companies,
    contacts,
    currency: currencySample?.currency ?? null,
    marketing: marketingSummary,
    missedCallTasksCount,
    openTaskCount,
    stageMetrics: opportunityStageRows.map((row) => ({
      count: row._count._all,
      stage: row.stage,
      valueCents: row._sum.valueCents ?? 0,
    })),
  };
}

export const getDashboardSummary = unstable_cache(
  loadDashboardSummary,
  ["dashboard-summary"],
  {
    revalidate: dashboardSummaryRevalidateSeconds,
    tags: [dashboardSummaryCacheTag],
  },
);

export function revalidateDashboardSummary() {
  revalidateTag(dashboardSummaryCacheTag, "max");
}
