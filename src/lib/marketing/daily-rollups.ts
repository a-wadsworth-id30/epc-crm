import "server-only";

import { Prisma } from "@prisma/client";
import {
  runWithBackgroundJob,
  safeJobJson,
  warningStatusWhen,
} from "@/lib/maintenance/background-jobs";
import { prisma } from "@/lib/prisma";

const dayMs = 24 * 60 * 60 * 1000;
export const marketingDailyRollupSourceAll = "ALL";
export const marketingDailyRollupProviderAll = "ALL";
export const defaultMarketingRollupWindowDays = 90;
export const maxMarketingRollupWindowDays = 730;

type CountRow = {
  date: Date;
  value: bigint | number | string | null;
};

type AttributionRecordRow = {
  attributionRecords: bigint | number | string | null;
  date: Date;
  formLeads: bigint | number | string | null;
  phoneLeads: bigint | number | string | null;
};

type SpendRow = {
  clicks: bigint | number | string | null;
  conversions: number | string | null;
  costMicros: bigint | number | string | null;
  date: Date;
  impressions: bigint | number | string | null;
};

export type MarketingDailyRollupRefreshResult = {
  dryRun: boolean;
  finishedAt: string;
  from: string;
  rowsMatched: number;
  rowsWritten: number;
  startedAt: string;
  toExclusive: string;
  totals: {
    attributionRecords: number;
    clicks: number;
    conversions: number;
    costMicros: string;
    formLeads: number;
    impressions: number;
    otherLeads: number;
    phoneLeads: number;
    sessions: number;
  };
  trigger: string;
  windowDays: number;
};

type RefreshMarketingDailyRollupsOptions = {
  actorId?: string | null;
  dryRun?: boolean;
  from?: Date;
  recordJobRun?: boolean;
  to?: Date;
  trigger?: string;
  windowDays?: number;
};

type RollupAccumulator = MarketingDailyRollupRefreshResult["totals"] & {
  date: Date;
};

export function startOfUtcDay(date = new Date()) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function utcDaysBetween(from: Date, toExclusive: Date) {
  return Math.max(0, Math.round((toExclusive.getTime() - from.getTime()) / dayMs));
}

function boundedWindowDays(value: number | undefined) {
  if (!value || !Number.isFinite(value)) return defaultMarketingRollupWindowDays;

  return Math.min(
    Math.max(Math.floor(value), 1),
    maxMarketingRollupWindowDays,
  );
}

function rangeFromOptions(options: RefreshMarketingDailyRollupsOptions) {
  const now = new Date();
  const windowDays = boundedWindowDays(options.windowDays);
  const from = startOfUtcDay(options.from ?? addUtcDays(now, -(windowDays - 1)));
  const requestedTo = startOfUtcDay(options.to ?? now);
  const toExclusive = addUtcDays(requestedTo, 1);
  const cappedToExclusive =
    utcDaysBetween(from, toExclusive) > maxMarketingRollupWindowDays
      ? addUtcDays(from, maxMarketingRollupWindowDays)
      : toExclusive;

  return {
    from,
    toExclusive: cappedToExclusive,
    windowDays: utcDaysBetween(from, cappedToExclusive),
  };
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function numberValue(value: bigint | number | string | null | undefined) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;

  return 0;
}

function bigintValue(value: bigint | number | string | null | undefined) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string" && value.trim()) return BigInt(value);

  return BigInt(0);
}

function blankRollup(date: Date): RollupAccumulator {
  return {
    attributionRecords: 0,
    clicks: 0,
    conversions: 0,
    costMicros: "0",
    date,
    formLeads: 0,
    impressions: 0,
    otherLeads: 0,
    phoneLeads: 0,
    sessions: 0,
  };
}

async function aggregateRollupInputs(from: Date, toExclusive: Date) {
  const [sessionRows, recordRows, spendRows] = await Promise.all([
    prisma.$queryRaw<CountRow[]>`
      SELECT date_trunc('day', "updatedAt") AS "date", COUNT(*)::text AS "value"
      FROM "AttributionSnapshot"
      WHERE "updatedAt" >= ${from} AND "updatedAt" < ${toExclusive}
      GROUP BY 1
    `,
    prisma.$queryRaw<AttributionRecordRow[]>`
      SELECT
        date_trunc('day', "createdAt") AS "date",
        COUNT(*)::text AS "attributionRecords",
        COUNT(*) FILTER (WHERE "source" = 'FORM')::text AS "formLeads",
        COUNT(*) FILTER (WHERE "source" = 'PHONE')::text AS "phoneLeads"
      FROM "AttributionRecord"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${toExclusive}
      GROUP BY 1
    `,
    prisma.$queryRaw<SpendRow[]>`
      SELECT
        date_trunc('day', "date") AS "date",
        COALESCE(SUM("clicks"), 0)::text AS "clicks",
        COALESCE(SUM("impressions"), 0)::text AS "impressions",
        COALESCE(SUM("conversions"), 0)::double precision AS "conversions",
        COALESCE(SUM("costMicros"), 0)::text AS "costMicros"
      FROM "MarketingCampaignSpend"
      WHERE "date" >= ${from} AND "date" < ${toExclusive}
      GROUP BY 1
    `,
  ]);

  return { recordRows, sessionRows, spendRows };
}

export async function refreshMarketingDailyRollups(
  options: RefreshMarketingDailyRollupsOptions = {},
): Promise<MarketingDailyRollupRefreshResult> {
  const dryRun = options.dryRun ?? false;
  const trigger = options.trigger ?? "manual";
  const { from, toExclusive, windowDays } = rangeFromOptions(options);

  if (options.recordJobRun === false) {
    return refreshMarketingDailyRollupsCore({
      ...options,
      dryRun,
      trigger,
    });
  }

  return runWithBackgroundJob({
    actorId: options.actorId ?? null,
    dryRun,
    jobName: "marketing-daily-rollups",
    jobType: "marketing",
    metadata: safeJobJson({
      from: from.toISOString(),
      toExclusive: toExclusive.toISOString(),
      windowDays,
    }),
    trigger,
    run: () =>
      refreshMarketingDailyRollupsCore({
        ...options,
        dryRun,
        trigger,
      }),
    complete: (result) => ({
      message: dryRun
        ? `Dry run matched ${result.rowsMatched} daily marketing rollup row${
            result.rowsMatched === 1 ? "" : "s"
          }.`
        : `Refreshed ${result.rowsWritten} daily marketing rollup row${
            result.rowsWritten === 1 ? "" : "s"
          }.`,
      recordsRead:
        result.totals.sessions +
        result.totals.attributionRecords +
        result.totals.clicks,
      recordsWritten: result.rowsWritten,
      status: warningStatusWhen(dryRun && result.rowsMatched > 0),
      summary: safeJobJson(result),
    }),
  });
}

async function refreshMarketingDailyRollupsCore(
  options: RefreshMarketingDailyRollupsOptions,
): Promise<MarketingDailyRollupRefreshResult> {
  const startedAt = new Date();
  const dryRun = options.dryRun ?? false;
  const trigger = options.trigger ?? "manual";
  const { from, toExclusive, windowDays } = rangeFromOptions(options);
  const rows = new Map<string, RollupAccumulator>();

  for (let day = from; day < toExclusive; day = addUtcDays(day, 1)) {
    rows.set(dateKey(day), blankRollup(day));
  }

  const { recordRows, sessionRows, spendRows } = await aggregateRollupInputs(
    from,
    toExclusive,
  );

  for (const row of sessionRows) {
    const target = rows.get(dateKey(row.date));
    if (!target) continue;
    target.sessions = numberValue(row.value);
  }

  for (const row of recordRows) {
    const target = rows.get(dateKey(row.date));
    if (!target) continue;
    target.attributionRecords = numberValue(row.attributionRecords);
    target.formLeads = numberValue(row.formLeads);
    target.phoneLeads = numberValue(row.phoneLeads);
    target.otherLeads = Math.max(
      0,
      target.attributionRecords - target.formLeads - target.phoneLeads,
    );
  }

  for (const row of spendRows) {
    const target = rows.get(dateKey(row.date));
    if (!target) continue;
    target.clicks = numberValue(row.clicks);
    target.conversions = numberValue(row.conversions);
    target.costMicros = bigintValue(row.costMicros).toString();
    target.impressions = numberValue(row.impressions);
  }

  const rollupRows = Array.from(rows.values());

  if (!dryRun) {
    await prisma.$transaction(
      rollupRows.map((row) =>
        prisma.marketingDailyRollup.upsert({
          where: {
            date_source_provider: {
              date: row.date,
              provider: marketingDailyRollupProviderAll,
              source: marketingDailyRollupSourceAll,
            },
          },
          update: {
            attributionRecords: row.attributionRecords,
            clicks: row.clicks,
            conversions: row.conversions,
            costMicros: BigInt(row.costMicros),
            formLeads: row.formLeads,
            impressions: row.impressions,
            otherLeads: row.otherLeads,
            phoneLeads: row.phoneLeads,
            sessions: row.sessions,
          },
          create: {
            attributionRecords: row.attributionRecords,
            clicks: row.clicks,
            conversions: row.conversions,
            costMicros: BigInt(row.costMicros),
            date: row.date,
            formLeads: row.formLeads,
            impressions: row.impressions,
            otherLeads: row.otherLeads,
            phoneLeads: row.phoneLeads,
            provider: marketingDailyRollupProviderAll,
            sessions: row.sessions,
            source: marketingDailyRollupSourceAll,
          },
        }),
      ),
    );
  }

  const totals = rollupRows.reduce<MarketingDailyRollupRefreshResult["totals"]>(
    (total, row) => ({
      attributionRecords: total.attributionRecords + row.attributionRecords,
      clicks: total.clicks + row.clicks,
      conversions: total.conversions + row.conversions,
      costMicros: (BigInt(total.costMicros) + BigInt(row.costMicros)).toString(),
      formLeads: total.formLeads + row.formLeads,
      impressions: total.impressions + row.impressions,
      otherLeads: total.otherLeads + row.otherLeads,
      phoneLeads: total.phoneLeads + row.phoneLeads,
      sessions: total.sessions + row.sessions,
    }),
    {
      attributionRecords: 0,
      clicks: 0,
      conversions: 0,
      costMicros: "0",
      formLeads: 0,
      impressions: 0,
      otherLeads: 0,
      phoneLeads: 0,
      sessions: 0,
    },
  );
  const finishedAt = new Date();
  const result: MarketingDailyRollupRefreshResult = {
    dryRun,
    finishedAt: finishedAt.toISOString(),
    from: from.toISOString(),
    rowsMatched: rollupRows.length,
    rowsWritten: dryRun ? 0 : rollupRows.length,
    startedAt: startedAt.toISOString(),
    toExclusive: toExclusive.toISOString(),
    totals,
    trigger,
    windowDays,
  };

  if (!dryRun) {
    await prisma.auditLog.create({
      data: {
        action: "marketing.rollups.daily_refreshed",
        actorId: options.actorId ?? null,
        entity: "MarketingDailyRollup",
        entityId: `${result.from}:${result.toExclusive}`,
        metadata: result as Prisma.InputJsonObject,
      },
    });
  }

  return result;
}
