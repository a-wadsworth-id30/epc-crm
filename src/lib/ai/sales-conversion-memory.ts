import "server-only";

import type { PrismaClient, SalesStage } from "@prisma/client";
import { latestEmailReplyText, toEmailPlainText } from "@/lib/email/plain-text";

type MemoryPrismaClient = Pick<
  PrismaClient,
  "salesCommunication" | "salesLifecycleEvent"
>;

type PositiveExample = {
  outcome: string;
  serviceFocus: string | null;
  subject: string | null;
  summary: string;
};

export type SalesAIConversionMemory = {
  periodDays: number;
  sampleSize: number;
  aiFeedback: {
    accepted: number;
    dismissed: number;
  };
  replyRate: number | null;
  serviceOutcomes: Array<{
    service: string;
    sampleSize: number;
    wonRate: number | null;
    stageAdvanceRate: number | null;
  }>;
  stageAdvanceRate: number | null;
  wonRate: number | null;
  guidance: string[];
  positiveExamples: PositiveExample[];
};

const memoryPeriodDays = 180;
const maxOutboundEmails = 120;
const maxPositiveExamples = 4;

export async function buildSalesAIConversionMemory(
  prisma: MemoryPrismaClient,
): Promise<SalesAIConversionMemory | null> {
  const since = new Date(Date.now() - memoryPeriodDays * 24 * 60 * 60 * 1000);
  const outboundEmails = await prisma.salesCommunication.findMany({
    where: {
      channel: "EMAIL",
      direction: "OUTBOUND",
      occurredAt: { gte: since },
    },
    orderBy: { occurredAt: "desc" },
    take: maxOutboundEmails,
    select: {
      id: true,
      opportunityId: true,
      subject: true,
      summary: true,
      body: true,
      occurredAt: true,
      opportunity: {
        select: {
          stage: true,
          closedAt: true,
          leadScope: true,
          source: true,
          title: true,
        },
      },
    },
  });

  if (!outboundEmails.length) return null;

  const opportunityIds = Array.from(
    new Set(outboundEmails.map((email) => email.opportunityId)),
  );
  const firstEmailAt = outboundEmails.reduce(
    (earliest, email) =>
      email.occurredAt < earliest ? email.occurredAt : earliest,
    outboundEmails[0]?.occurredAt ?? since,
  );
  const [inboundEmails, stageEvents, aiFeedback] = await Promise.all([
    prisma.salesCommunication.findMany({
      where: {
        opportunityId: { in: opportunityIds },
        channel: "EMAIL",
        direction: "INBOUND",
        occurredAt: { gte: firstEmailAt },
      },
      orderBy: { occurredAt: "asc" },
      select: {
        opportunityId: true,
        occurredAt: true,
      },
    }),
    prisma.salesLifecycleEvent.findMany({
      where: {
        opportunityId: { in: opportunityIds },
        eventType: "STAGE_CHANGED",
        occurredAt: { gte: firstEmailAt },
      },
      orderBy: { occurredAt: "asc" },
      select: {
        opportunityId: true,
        occurredAt: true,
        toStage: true,
      },
    }),
    prisma.salesCommunication.findMany({
      where: {
        channel: "SYSTEM",
        occurredAt: { gte: since },
      },
      orderBy: { occurredAt: "desc" },
      take: 250,
      select: {
        metadata: true,
      },
    }),
  ]);

  const inboundByOpportunity = groupByOpportunity(inboundEmails);
  const stageEventsByOpportunity = groupByOpportunity(stageEvents);
  const outcomes = outboundEmails.map((email) => {
    const replies = inboundByOpportunity.get(email.opportunityId) ?? [];
    const stages = stageEventsByOpportunity.get(email.opportunityId) ?? [];
    const gotReply = replies.some(
      (reply) => reply.occurredAt > email.occurredAt,
    );
    const laterStages = stages.filter(
      (event) => event.occurredAt > email.occurredAt,
    );
    const reachedWon =
      email.opportunity.stage === "WON" ||
      laterStages.some((event) => event.toStage === "WON");
    const reachedLost =
      email.opportunity.stage === "LOST" ||
      laterStages.some((event) => event.toStage === "LOST");
    const advancedStage = laterStages.some((event) =>
      isStageProgression(event.toStage),
    );
    const score = reachedWon
      ? 4
      : advancedStage
        ? 3
        : gotReply
          ? 2
          : reachedLost
            ? -1
            : 0;

    return {
      ...email,
      advancedStage,
      gotReply,
      reachedLost,
      reachedWon,
      score,
      serviceFocus: serviceFocusForOpportunity(email.opportunity),
    };
  });

  const sampleSize = outcomes.length;
  const replyCount = outcomes.filter((outcome) => outcome.gotReply).length;
  const stageAdvanceCount = outcomes.filter(
    (outcome) => outcome.advancedStage,
  ).length;
  const wonCount = outcomes.filter((outcome) => outcome.reachedWon).length;
  const aiFeedbackSummary = aiFeedback.reduce(
    (summary, item) => {
      const metadata = objectValue(item.metadata);
      if (stringValue(metadata.source) !== "sales-ai-feedback") return summary;
      if (stringValue(metadata.outcome) === "accepted") summary.accepted += 1;
      if (stringValue(metadata.outcome) === "dismissed") summary.dismissed += 1;
      return summary;
    },
    { accepted: 0, dismissed: 0 },
  );
  const serviceOutcomes = buildServiceOutcomes(outcomes);
  const positiveExamples = outcomes
    .filter((outcome) => outcome.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.occurredAt.getTime() - left.occurredAt.getTime(),
    )
    .slice(0, maxPositiveExamples)
    .map((outcome) => ({
      outcome: outcome.reachedWon
        ? "won"
        : outcome.advancedStage
          ? "stage advanced"
          : "reply received",
      serviceFocus: outcome.serviceFocus,
      subject: trimText(outcome.subject, 120),
      summary:
        trimText(
          latestEmailReplyText(outcome.body) ||
            toEmailPlainText(outcome.summary),
          420,
        ) ?? "Positive outbound email example.",
    }));
  const guidance = buildGuidance({
    positiveExamples,
    replyRate: rate(replyCount, sampleSize),
    aiFeedback: aiFeedbackSummary,
    serviceOutcomes,
    stageAdvanceRate: rate(stageAdvanceCount, sampleSize),
    wonRate: rate(wonCount, sampleSize),
  });

  return {
    periodDays: memoryPeriodDays,
    sampleSize,
    aiFeedback: aiFeedbackSummary,
    replyRate: rate(replyCount, sampleSize),
    serviceOutcomes,
    stageAdvanceRate: rate(stageAdvanceCount, sampleSize),
    wonRate: rate(wonCount, sampleSize),
    guidance,
    positiveExamples,
  };
}

function groupByOpportunity<T extends { opportunityId: string }>(items: T[]) {
  return items.reduce((groups, item) => {
    const group = groups.get(item.opportunityId) ?? [];
    group.push(item);
    groups.set(item.opportunityId, group);
    return groups;
  }, new Map<string, T[]>());
}

function isStageProgression(stage: SalesStage | null) {
  return (
    stage === "QUALIFIED" ||
    stage === "PROPOSAL" ||
    stage === "NEGOTIATION" ||
    stage === "WON"
  );
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function serviceFocusForOpportunity(opportunity: {
  leadScope: unknown;
  source: string | null;
  title: string;
}) {
  const scope = objectValue(opportunity.leadScope);
  const productTypes = Array.isArray(scope.productTypes)
    ? scope.productTypes
        .map((value) => stringValue(value))
        .filter((value): value is string => Boolean(value))
    : [];
  const customProductTypes = Array.isArray(scope.customProductTypes)
    ? scope.customProductTypes
        .map((value) => stringValue(value))
        .filter((value): value is string => Boolean(value))
    : [];
  const text = [
    opportunity.title,
    opportunity.source,
    ...productTypes,
    ...customProductTypes,
  ]
    .join(" ")
    .toLowerCase();

  if (text.includes("shopify") || text.includes("ecommerce"))
    return "Shopify / ecommerce";
  if (
    text.includes("marketing") ||
    text.includes("seo") ||
    text.includes("paid")
  )
    return "Digital marketing";
  if (text.includes("crm") || text.includes("operating system"))
    return "CRM / operating system";
  if (
    text.includes("storyblok") ||
    text.includes("lead gen") ||
    text.includes("website")
  )
    return "Lead generation website";
  return productTypes[0] ?? customProductTypes[0] ?? null;
}

function buildServiceOutcomes(
  outcomes: Array<{
    advancedStage: boolean;
    reachedWon: boolean;
    serviceFocus: string | null;
  }>,
) {
  const groups = new Map<
    string,
    { advanced: number; sampleSize: number; won: number }
  >();

  outcomes.forEach((outcome) => {
    if (!outcome.serviceFocus) return;
    const group = groups.get(outcome.serviceFocus) ?? {
      advanced: 0,
      sampleSize: 0,
      won: 0,
    };
    group.sampleSize += 1;
    if (outcome.advancedStage) group.advanced += 1;
    if (outcome.reachedWon) group.won += 1;
    groups.set(outcome.serviceFocus, group);
  });

  return Array.from(groups.entries())
    .map(([service, group]) => ({
      service,
      sampleSize: group.sampleSize,
      wonRate: rate(group.won, group.sampleSize),
      stageAdvanceRate: rate(group.advanced, group.sampleSize),
    }))
    .sort(
      (left, right) =>
        right.sampleSize - left.sampleSize ||
        (right.wonRate ?? 0) - (left.wonRate ?? 0),
    )
    .slice(0, 6);
}

function rate(count: number, total: number) {
  return total > 0 ? Math.round((count / total) * 100) : null;
}

function trimText(value: string | null | undefined, maxLength: number) {
  if (!value) return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function buildGuidance({
  aiFeedback,
  positiveExamples,
  replyRate,
  serviceOutcomes,
  stageAdvanceRate,
  wonRate,
}: {
  aiFeedback: { accepted: number; dismissed: number };
  positiveExamples: PositiveExample[];
  replyRate: number | null;
  serviceOutcomes: SalesAIConversionMemory["serviceOutcomes"];
  stageAdvanceRate: number | null;
  wonRate: number | null;
}) {
  const guidance = [
    "Use recent CRM outcomes as weak evidence, not as a rule. Lead-specific context still wins.",
  ];

  if (replyRate !== null) {
    guidance.push(`Recent outbound email reply rate: ${replyRate}%.`);
  }

  if (stageAdvanceRate !== null) {
    guidance.push(
      `Recent post-email stage advancement rate: ${stageAdvanceRate}%.`,
    );
  }

  if (wonRate !== null) {
    guidance.push(`Recent post-email won rate: ${wonRate}%.`);
  }

  if (positiveExamples.length) {
    guidance.push(
      "Prefer concise, practical replies similar to the positive examples when they fit the current lead.",
    );
  }

  if (aiFeedback.accepted || aiFeedback.dismissed) {
    guidance.push(
      `Recent AI recommendation feedback: ${aiFeedback.accepted} useful, ${aiFeedback.dismissed} not useful.`,
    );
  }

  if (serviceOutcomes.length) {
    guidance.push(
      `Service outcome memory: ${serviceOutcomes
        .map(
          (item) =>
            `${item.service} ${item.wonRate ?? 0}% won / ${item.stageAdvanceRate ?? 0}% advanced`,
        )
        .join("; ")}.`,
    );
  }

  return guidance;
}
