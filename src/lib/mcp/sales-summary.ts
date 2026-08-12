import "server-only";

import type { Prisma, SalesStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const closedStages = new Set<SalesStage>(["WON", "LOST"]);

function startOfUtcDay(value: Date) {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);

  return date;
}

function dateRange(value: unknown) {
  const now = new Date();
  const to = now;
  const preset = typeof value === "string" ? value : "last_30_days";

  if (preset === "all") return null;

  const from = startOfUtcDay(now);

  if (preset === "this_month") {
    from.setUTCDate(1);
  } else if (preset === "last_90_days") {
    from.setUTCDate(from.getUTCDate() - 89);
  } else if (preset === "last_7_days") {
    from.setUTCDate(from.getUTCDate() - 6);
  } else {
    from.setUTCDate(from.getUTCDate() - 29);
  }

  return { from, to, preset };
}

function money(cents: number, currency = "GBP") {
  return {
    cents,
    currency,
    formatted: new Intl.NumberFormat("en-GB", {
      currency,
      style: "currency",
    }).format(cents / 100),
  };
}

function stageLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function getMcpSalesSummary(args: unknown) {
  const input =
    args && typeof args === "object" && !Array.isArray(args)
      ? (args as Record<string, unknown>)
      : {};
  const range = dateRange(input.dateRange);
  const where: Prisma.SalesOpportunityWhereInput = range
    ? { createdAt: { gte: range.from, lte: range.to } }
    : {};

  const [
    byStage,
    byOwner,
    recent,
    totals,
    currencySample,
  ] = await Promise.all([
    prisma.salesOpportunity.groupBy({
      by: ["stage"],
      where,
      _count: { _all: true },
      _sum: { valueCents: true },
      orderBy: { _count: { stage: "desc" } },
    }),
    prisma.salesOpportunity.groupBy({
      by: ["ownerId"],
      where,
      _count: { _all: true },
      _sum: { valueCents: true },
      orderBy: { _count: { ownerId: "desc" } },
      take: 8,
    }),
    prisma.salesOpportunity.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 8,
      select: {
        currency: true,
        id: true,
        owner: { select: { id: true, name: true } },
        probability: true,
        salesPipelineStage: { select: { name: true } },
        source: true,
        stage: true,
        title: true,
        updatedAt: true,
        valueCents: true,
      },
    }),
    prisma.salesOpportunity.aggregate({
      where,
      _count: { _all: true },
      _sum: { valueCents: true },
    }),
    prisma.salesOpportunity.findFirst({
      where,
      orderBy: [{ updatedAt: "desc" }],
      select: { currency: true },
    }),
  ]);

  const ownerIds = byOwner
    .map((row) => row.ownerId)
    .filter((ownerId): ownerId is string => Boolean(ownerId));
  const owners = ownerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: ownerIds } },
        select: { id: true, name: true },
      })
    : [];
  const ownerNameById = new Map(owners.map((owner) => [owner.id, owner.name]));
  const currency = currencySample?.currency ?? "GBP";
  const openRows = byStage.filter((row) => !closedStages.has(row.stage));
  const wonRow = byStage.find((row) => row.stage === "WON");
  const lostRow = byStage.find((row) => row.stage === "LOST");
  const openPipelineCents = openRows.reduce(
    (total, row) => total + (row._sum.valueCents ?? 0),
    0,
  );
  const wonRevenueCents = wonRow?._sum.valueCents ?? 0;
  const leadCount = totals._count._all;
  const wonCount = wonRow?._count._all ?? 0;

  return {
    ok: true,
    source: "crm-mcp-sales-summary",
    dateRange: range
      ? {
          preset: range.preset,
          from: range.from.toISOString(),
          to: range.to.toISOString(),
        }
      : { preset: "all", from: null, to: null },
    totals: {
      leads: leadCount,
      openLeads: openRows.reduce((total, row) => total + row._count._all, 0),
      wonLeads: wonCount,
      lostLeads: lostRow?._count._all ?? 0,
      totalValue: money(totals._sum.valueCents ?? 0, currency),
      openPipeline: money(openPipelineCents, currency),
      wonRevenue: money(wonRevenueCents, currency),
      winRate: leadCount ? Math.round((wonCount / leadCount) * 100) : 0,
    },
    byStage: byStage.map((row) => ({
      stage: row.stage,
      label: stageLabel(row.stage),
      count: row._count._all,
      value: money(row._sum.valueCents ?? 0, currency),
    })),
    byOwner: byOwner.map((row) => ({
      ownerId: row.ownerId,
      ownerName: row.ownerId
        ? ownerNameById.get(row.ownerId) ?? "Unknown user"
        : "Unassigned",
      count: row._count._all,
      value: money(row._sum.valueCents ?? 0, currency),
    })),
    recent: recent.map((item) => ({
      id: item.id,
      title: item.title,
      stage: item.stage,
      pipelineStage: item.salesPipelineStage?.name ?? stageLabel(item.stage),
      value: money(item.valueCents, item.currency),
      probability: item.probability,
      source: item.source,
      owner: item.owner?.name ?? null,
      updatedAt: item.updatedAt.toISOString(),
    })),
  };
}
