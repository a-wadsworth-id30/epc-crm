import { Prisma, SalesStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type MarketingOpportunityTotals = {
  attributedLeads: number;
  pipelineValueCents: number;
  proposalCount: number;
  proposalValueCents: number;
  qualifiedLeads: number;
  qualifiedValueCents: number;
  totalLeads: number;
  weightedPipelineValueCents: number;
  wonDeals: number;
  wonRevenueCents: number;
};

type DateWhere = {
  gte: Date;
  lte: Date;
};

type TotalsRow = {
  attributedLeads: bigint | number | null;
  pipelineValueCents: bigint | number | null;
  proposalCount: bigint | number | null;
  proposalValueCents: bigint | number | null;
  qualifiedLeads: bigint | number | null;
  qualifiedValueCents: bigint | number | null;
  totalLeads: bigint | number | null;
  weightedPipelineValueCents: bigint | number | null;
  wonDeals: bigint | number | null;
  wonRevenueCents: bigint | number | null;
};

const qualifiedStages = [
  SalesStage.QUALIFIED,
  SalesStage.PROPOSAL,
  SalesStage.NEGOTIATION,
  SalesStage.WON,
];

const proposalStages = [
  SalesStage.PROPOSAL,
  SalesStage.NEGOTIATION,
  SalesStage.WON,
];

const openStages = [
  SalesStage.LEAD,
  SalesStage.QUALIFIED,
  SalesStage.PROPOSAL,
  SalesStage.NEGOTIATION,
];

function stageArray(stages: SalesStage[]) {
  return Prisma.sql`ARRAY[${Prisma.join(
    stages.map((stage) => Prisma.sql`${stage}::"SalesStage"`),
  )}]`;
}

function numberValue(value: bigint | number | null | undefined) {
  if (typeof value === "bigint") return Number(value);
  return value ?? 0;
}

export async function getMarketingOpportunityTotals(
  activeDateWhere: DateWhere | undefined,
): Promise<MarketingOpportunityTotals> {
  const dateFilter = activeDateWhere
    ? Prisma.sql`AND "createdAt" >= ${activeDateWhere.gte} AND "createdAt" <= ${activeDateWhere.lte}`
    : Prisma.empty;
  const qualifiedStageArray = stageArray(qualifiedStages);
  const proposalStageArray = stageArray(proposalStages);
  const openStageArray = stageArray(openStages);
  const rows = await prisma.$queryRaw<TotalsRow[]>(Prisma.sql`
    SELECT
      COUNT(*) AS "totalLeads",
      COUNT(*) FILTER (WHERE "attribution" IS NOT NULL) AS "attributedLeads",
      COUNT(*) FILTER (WHERE "stage" = ANY(${qualifiedStageArray})) AS "qualifiedLeads",
      COUNT(*) FILTER (WHERE "stage" = ANY(${proposalStageArray})) AS "proposalCount",
      COUNT(*) FILTER (WHERE "stage" = ${SalesStage.WON}::"SalesStage") AS "wonDeals",
      COALESCE(
        SUM("valueCents") FILTER (WHERE "stage" = ANY(${qualifiedStageArray})),
        0
      ) AS "qualifiedValueCents",
      COALESCE(
        SUM("valueCents") FILTER (WHERE "stage" = ANY(${proposalStageArray})),
        0
      ) AS "proposalValueCents",
      COALESCE(
        SUM("valueCents") FILTER (WHERE "stage" = ${SalesStage.WON}::"SalesStage"),
        0
      ) AS "wonRevenueCents",
      COALESCE(
        SUM("valueCents") FILTER (WHERE "stage" = ANY(${openStageArray})),
        0
      ) AS "pipelineValueCents",
      COALESCE(
        SUM(ROUND(("valueCents"::numeric * "probability"::numeric) / 100))
          FILTER (WHERE "stage" = ANY(${openStageArray})),
        0
      )::bigint AS "weightedPipelineValueCents"
    FROM "SalesOpportunity"
    WHERE TRUE
    ${dateFilter}
  `);
  const row = rows[0];

  return {
    attributedLeads: numberValue(row?.attributedLeads),
    pipelineValueCents: numberValue(row?.pipelineValueCents),
    proposalCount: numberValue(row?.proposalCount),
    proposalValueCents: numberValue(row?.proposalValueCents),
    qualifiedLeads: numberValue(row?.qualifiedLeads),
    qualifiedValueCents: numberValue(row?.qualifiedValueCents),
    totalLeads: numberValue(row?.totalLeads),
    weightedPipelineValueCents: numberValue(row?.weightedPipelineValueCents),
    wonDeals: numberValue(row?.wonDeals),
    wonRevenueCents: numberValue(row?.wonRevenueCents),
  };
}
