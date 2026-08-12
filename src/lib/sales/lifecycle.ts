import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const salesStages = [
  "LEAD",
  "QUALIFIED",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
  "LOST",
] as const;

export type SalesStageValue = (typeof salesStages)[number];

export const stageProbability: Record<SalesStageValue, number> = {
  LEAD: 10,
  QUALIFIED: 25,
  PROPOSAL: 55,
  NEGOTIATION: 75,
  WON: 100,
  LOST: 0,
};

export const defaultSalesPipelineStages = [
  {
    stage: "LEAD",
    name: "Lead",
    slug: "lead",
    sortOrder: 10,
    defaultProbability: 10,
    isClosed: false,
    isWon: false,
    isLost: false,
  },
  {
    stage: "QUALIFIED",
    name: "Qualified",
    slug: "qualified",
    sortOrder: 20,
    defaultProbability: 25,
    isClosed: false,
    isWon: false,
    isLost: false,
  },
  {
    stage: "PROPOSAL",
    name: "Proposal",
    slug: "proposal",
    sortOrder: 30,
    defaultProbability: 55,
    isClosed: false,
    isWon: false,
    isLost: false,
  },
  {
    stage: "NEGOTIATION",
    name: "Negotiation",
    slug: "negotiation",
    sortOrder: 40,
    defaultProbability: 75,
    isClosed: false,
    isWon: false,
    isLost: false,
  },
  {
    stage: "WON",
    name: "Won",
    slug: "won",
    sortOrder: 50,
    defaultProbability: 100,
    isClosed: true,
    isWon: true,
    isLost: false,
  },
  {
    stage: "LOST",
    name: "Lost",
    slug: "lost",
    sortOrder: 60,
    defaultProbability: 0,
    isClosed: true,
    isWon: false,
    isLost: true,
  },
] as const satisfies Array<{
  stage: SalesStageValue;
  name: string;
  slug: string;
  sortOrder: number;
  defaultProbability: number;
  isClosed: boolean;
  isWon: boolean;
  isLost: boolean;
}>;

type SalesLifecycleClient = Pick<
  Prisma.TransactionClient,
  "salesLifecycleEvent" | "salesOpportunity" | "salesPipelineStage"
>;

export function isSalesStage(value: string): value is SalesStageValue {
  return salesStages.includes(value as SalesStageValue);
}

export function isTerminalSalesStage(stage: SalesStageValue) {
  return stage === "WON" || stage === "LOST";
}

export function defaultSalesPipelineStageSlug(stage: SalesStageValue) {
  return (
    defaultSalesPipelineStages.find(
      (pipelineStage) => pipelineStage.stage === stage,
    )?.slug ?? stage.toLowerCase()
  );
}

export async function defaultSalesPipelineStageForBucket(
  client: SalesLifecycleClient,
  stage: SalesStageValue,
) {
  const defaultSlug = defaultSalesPipelineStageSlug(stage);

  const canonicalStage = await client.salesPipelineStage.findFirst({
    where: {
      bucket: stage,
      isActive: true,
      slug: defaultSlug,
    },
    select: salesPipelineStageSelect,
  });

  if (canonicalStage) return canonicalStage;

  return client.salesPipelineStage.findFirst({
    where: {
      bucket: stage,
      isActive: true,
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: salesPipelineStageSelect,
  });
}

export async function salesPipelineStageForId(
  client: SalesLifecycleClient,
  salesPipelineStageId: string | null | undefined,
) {
  const id = salesPipelineStageId?.trim();
  if (!id) return null;

  return client.salesPipelineStage.findFirst({
    where: {
      id,
      isActive: true,
    },
    select: salesPipelineStageSelect,
  });
}

const salesPipelineStageSelect = {
  id: true,
  bucket: true,
  defaultProbability: true,
  isClosed: true,
  isWon: true,
  isLost: true,
  name: true,
  slug: true,
} satisfies Prisma.SalesPipelineStageSelect;

function cleanText(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

export function lifecycleOpportunityDataForStage(
  stage: SalesStageValue,
  occurredAt = new Date(),
  options: {
    lostReason?: string | null;
    lostReasonNotes?: string | null;
    salesPipelineStageId?: string | null;
  } = {},
) {
  const isLost = stage === "LOST";

  return {
    stage,
    salesPipelineStageId: options.salesPipelineStageId ?? null,
    probability: stageProbability[stage],
    stageChangedAt: occurredAt,
    closedAt: isTerminalSalesStage(stage) ? occurredAt : null,
    lostReason: isLost ? cleanText(options.lostReason) : null,
    lostReasonNotes: isLost ? cleanText(options.lostReasonNotes) : null,
  };
}

export async function lifecycleOpportunityDataForDefaultStage(
  client: SalesLifecycleClient,
  stage: SalesStageValue,
  occurredAt = new Date(),
  options: {
    lostReason?: string | null;
    lostReasonNotes?: string | null;
  } = {},
) {
  const pipelineStage = await defaultSalesPipelineStageForBucket(client, stage);

  return {
    ...lifecycleOpportunityDataForStage(stage, occurredAt, {
      ...options,
      salesPipelineStageId: pipelineStage?.id ?? null,
    }),
    probability: pipelineStage?.defaultProbability ?? stageProbability[stage],
  };
}

export async function lifecycleOpportunityDataForPipelineStage(
  client: SalesLifecycleClient,
  salesPipelineStageId: string | null | undefined,
  fallbackStage: SalesStageValue,
  occurredAt = new Date(),
  options: {
    lostReason?: string | null;
    lostReasonNotes?: string | null;
  } = {},
) {
  const pipelineStage = await salesPipelineStageForId(
    client,
    salesPipelineStageId,
  );

  if (!pipelineStage) {
    return lifecycleOpportunityDataForDefaultStage(
      client,
      fallbackStage,
      occurredAt,
      options,
    );
  }

  return {
    ...lifecycleOpportunityDataForStage(pipelineStage.bucket, occurredAt, {
      ...options,
      salesPipelineStageId: pipelineStage.id,
    }),
    probability: pipelineStage.defaultProbability,
  };
}

export async function recordSalesOpportunityCreated(
  client: SalesLifecycleClient,
  data: {
    opportunityId: string;
    occurredAt?: Date;
    salesPipelineStageId?: string | null;
    source: string;
    stage: SalesStageValue;
    userId?: string | null;
  },
) {
  await client.salesLifecycleEvent.create({
    data: {
      opportunityId: data.opportunityId,
      eventType: "CREATED",
      toStage: data.stage,
      toPipelineStageId: data.salesPipelineStageId ?? null,
      occurredAt: data.occurredAt ?? new Date(),
      userId: data.userId ?? null,
      metadata: { source: data.source },
    },
  });
}

export async function recordSalesStageChange(
  client: SalesLifecycleClient,
  data: {
    opportunityId: string;
    fromStage: SalesStageValue;
    fromPipelineStageId?: string | null;
    toStage: SalesStageValue;
    toPipelineStageId?: string | null;
    occurredAt?: Date;
    lostReason?: string | null;
    lostReasonNotes?: string | null;
    source: string;
    userId?: string | null;
  },
) {
  if (
    data.fromStage === data.toStage &&
    (data.fromPipelineStageId ?? null) === (data.toPipelineStageId ?? null)
  ) {
    return;
  }

  await client.salesLifecycleEvent.create({
    data: {
      opportunityId: data.opportunityId,
      eventType: "STAGE_CHANGED",
      fromStage: data.fromStage,
      toStage: data.toStage,
      fromPipelineStageId: data.fromPipelineStageId ?? null,
      toPipelineStageId: data.toPipelineStageId ?? null,
      lostReason: data.toStage === "LOST" ? cleanText(data.lostReason) : null,
      note: data.toStage === "LOST" ? cleanText(data.lostReasonNotes) : null,
      occurredAt: data.occurredAt ?? new Date(),
      userId: data.userId ?? null,
      metadata: { source: data.source },
    },
  });
}

export async function markOpportunityFirstContacted(
  client: SalesLifecycleClient = prisma,
  data: {
    channel: string;
    communicationId?: string | null;
    occurredAt?: Date;
    opportunityId: string | null | undefined;
    source: string;
    userId?: string | null;
  },
) {
  if (!data.opportunityId) return;

  const occurredAt = data.occurredAt ?? new Date();
  const result = await client.salesOpportunity.updateMany({
    where: {
      id: data.opportunityId,
      OR: [
        { firstContactedAt: null },
        { firstContactedAt: { gt: occurredAt } },
      ],
    },
    data: {
      firstContactedAt: occurredAt,
    },
  });

  if (result.count === 0) return;

  const metadata = {
    channel: data.channel,
    source: data.source,
    ...(data.communicationId ? { communicationId: data.communicationId } : {}),
  } satisfies Prisma.InputJsonObject;

  await client.salesLifecycleEvent.create({
    data: {
      opportunityId: data.opportunityId,
      eventType: "CONTACTED",
      occurredAt,
      userId: data.userId ?? null,
      metadata,
    },
  });
}
