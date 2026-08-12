import type { Metadata } from "next";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import SalesAutomationManager from "@/components/crm-boilerplate/LazySalesAutomationManager";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Sales Automation | iD30 CRM",
};

function configObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function metadataString(
  metadata: Record<string, unknown>,
  key: string,
): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function contactName(
  contact: { firstName: string; lastName: string } | null | undefined,
) {
  return contact ? `${contact.firstName} ${contact.lastName}`.trim() : null;
}

function metadataHas(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0;
}

function percent(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function daysBetween(start: Date, end: Date) {
  return Math.max(
    0,
    Math.floor((end.getTime() - start.getTime()) / 86_400_000),
  );
}

export default async function SalesAutomationSettingsPage() {
  await requireAdmin();
  const analyticsSince = new Date();
  analyticsSince.setDate(analyticsSince.getDate() - 30);

  const [
    rules,
    stages,
    approvalRuns,
    recentRuns,
    analyticsRuns,
    assistedPipeline,
    unassistedPipeline,
    aiFeedbackCommunications,
    openStageAgeOpportunities,
  ] = await Promise.all([
    prisma.salesAutomationRule.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      include: {
        _count: { select: { runs: true } },
        runs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    }),
    prisma.salesPipelineStage.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slaDays: true },
    }),
    prisma.salesAutomationRun.findMany({
      where: {
        action: { in: ["SEND_EMAIL", "SEND_SMS"] },
        status: { in: ["FAILED", "SKIPPED"] },
      },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        opportunity: {
          select: {
            id: true,
            title: true,
            contact: {
              select: {
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
              },
            },
          },
        },
        rule: { select: { name: true } },
      },
    }),
    prisma.salesAutomationRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 16,
      include: {
        opportunity: {
          select: {
            id: true,
            title: true,
            contact: {
              select: {
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
              },
            },
          },
        },
        rule: { select: { name: true } },
      },
    }),
    prisma.salesAutomationRun.findMany({
      where: { createdAt: { gte: analyticsSince } },
      orderBy: { createdAt: "desc" },
      take: 2000,
      include: {
        opportunity: {
          select: {
            id: true,
            stage: true,
            valueCents: true,
          },
        },
        rule: { select: { id: true, name: true } },
      },
    }),
    prisma.salesOpportunity.findMany({
      where: {
        automationRuns: { some: {} },
      },
      select: {
        id: true,
        stage: true,
        valueCents: true,
      },
    }),
    prisma.salesOpportunity.findMany({
      where: {
        automationRuns: { none: {} },
      },
      select: {
        id: true,
        stage: true,
        valueCents: true,
      },
    }),
    prisma.salesCommunication.findMany({
      where: {
        channel: "SYSTEM",
        occurredAt: { gte: analyticsSince },
      },
      orderBy: { occurredAt: "desc" },
      take: 1000,
      select: {
        metadata: true,
        occurredAt: true,
      },
    }),
    prisma.salesOpportunity.findMany({
      where: {
        stage: { notIn: ["WON", "LOST"] },
      },
      orderBy: [{ stageChangedAt: "asc" }, { updatedAt: "desc" }],
      take: 30,
      select: {
        id: true,
        owner: {
          select: {
            name: true,
          },
        },
        salesPipelineStage: {
          select: {
            name: true,
            slaDays: true,
          },
        },
        stage: true,
        stageChangedAt: true,
        title: true,
      },
    }),
  ]);
  const analyticsRunRows = analyticsRuns.map((run) => ({
    ...run,
    metadataObject: configObject(run.metadata),
  }));
  const completedRuns = analyticsRunRows.filter(
    (run) => run.status === "COMPLETED",
  ).length;
  const failedRuns = analyticsRunRows.filter(
    (run) => run.status === "FAILED",
  ).length;
  const skippedRuns = analyticsRunRows.filter(
    (run) => run.status === "SKIPPED",
  ).length;
  const pendingApprovals = analyticsRunRows.filter(
    (run) =>
      (run.action === "SEND_EMAIL" || run.action === "SEND_SMS") &&
      (run.status === "SKIPPED" || run.status === "FAILED"),
  ).length;
  const approvalsSent = analyticsRunRows.filter(
    (run) =>
      (run.action === "SEND_EMAIL" || run.action === "SEND_SMS") &&
      metadataHas(run.metadataObject, "approvedAt"),
  ).length;
  const approvalsDismissed = analyticsRunRows.filter((run) =>
    metadataHas(run.metadataObject, "dismissedAt"),
  ).length;
  const stageSuggestions = analyticsRunRows.filter(
    (run) => run.action === "SUGGEST_STAGE_MOVE",
  ).length;
  const stageMovesApplied = analyticsRunRows.filter((run) =>
    metadataHas(run.metadataObject, "stageMoveAppliedAt"),
  ).length;
  const actionCounts = analyticsRunRows.reduce<Record<string, number>>(
    (counts, run) => {
      counts[run.action] = (counts[run.action] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const statusCounts = analyticsRunRows.reduce<Record<string, number>>(
    (counts, run) => {
      counts[run.status] = (counts[run.status] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const rulePerformance = rules.map((rule) => {
    const ruleRuns = analyticsRunRows.filter((run) => run.ruleId === rule.id);
    const ruleCompleted = ruleRuns.filter(
      (run) => run.status === "COMPLETED",
    ).length;
    const ruleFailed = ruleRuns.filter((run) => run.status === "FAILED").length;
    const ruleApprovalsSent = ruleRuns.filter((run) =>
      metadataHas(run.metadataObject, "approvedAt"),
    ).length;
    const ruleApprovalsDismissed = ruleRuns.filter((run) =>
      metadataHas(run.metadataObject, "dismissedAt"),
    ).length;
    const ruleStageMovesApplied = ruleRuns.filter((run) =>
      metadataHas(run.metadataObject, "stageMoveAppliedAt"),
    ).length;
    const ruleRunOpportunities = ruleRuns
      .map((run) => run.opportunity)
      .filter(
        (
          opportunity,
        ): opportunity is NonNullable<
          (typeof ruleRuns)[number]["opportunity"]
        > => Boolean(opportunity),
      );
    const opportunitiesById = new Map(
      ruleRunOpportunities.map((opportunity) => [opportunity.id, opportunity]),
    );
    const ruleOpportunities = Array.from(opportunitiesById.values());
    const wonOpportunities = ruleOpportunities.filter(
      (opportunity) => opportunity.stage === "WON",
    );
    const openOpportunities = ruleOpportunities.filter(
      (opportunity) =>
        opportunity.stage !== "WON" && opportunity.stage !== "LOST",
    );

    return {
      id: rule.id,
      name: rule.name,
      action: rule.action,
      trigger: rule.trigger,
      isActive: rule.isActive,
      runs30d: ruleRuns.length,
      completed30d: ruleCompleted,
      failed30d: ruleFailed,
      failureRate: percent(ruleFailed, ruleRuns.length),
      approvalsSent30d: ruleApprovalsSent,
      approvalsDismissed30d: ruleApprovalsDismissed,
      stageMovesApplied30d: ruleStageMovesApplied,
      assistedLeads30d: ruleOpportunities.length,
      openPipelineCents30d: openOpportunities.reduce(
        (total, opportunity) => total + opportunity.valueCents,
        0,
      ),
      wonLeads30d: wonOpportunities.length,
      wonRevenueCents30d: wonOpportunities.reduce(
        (total, opportunity) => total + opportunity.valueCents,
        0,
      ),
      winRate30d: percent(wonOpportunities.length, ruleOpportunities.length),
      lastRunAt:
        ruleRuns[0]?.createdAt.toISOString() ??
        rule.runs[0]?.createdAt.toISOString() ??
        null,
    };
  });
  const attentionItems = [
    ...(failedRuns
      ? [
          {
            label: "Failed runs",
            value: failedRuns,
            detail: "Review failed automation runs before adding more volume.",
          },
        ]
      : []),
    ...(pendingApprovals
      ? [
          {
            label: "Pending approvals",
            value: pendingApprovals,
            detail: "Email/SMS drafts are waiting for review or retry.",
          },
        ]
      : []),
    ...rulePerformance
      .filter((rule) => rule.runs30d >= 3 && rule.failureRate >= 25)
      .slice(0, 3)
      .map((rule) => ({
        label: rule.name,
        value: `${rule.failureRate}%`,
        detail: "Rule failure rate over the last 30 days.",
      })),
  ];
  const pipelineStats = (opportunities: typeof assistedPipeline) => {
    const won = opportunities.filter(
      (opportunity) => opportunity.stage === "WON",
    );
    const open = opportunities.filter(
      (opportunity) =>
        opportunity.stage !== "WON" && opportunity.stage !== "LOST",
    );

    return {
      count: opportunities.length,
      open: open.length,
      won: won.length,
      wonRevenueCents: won.reduce(
        (total, opportunity) => total + opportunity.valueCents,
        0,
      ),
      winRate: percent(won.length, opportunities.length),
    };
  };
  const aiFeedbackRows = aiFeedbackCommunications
    .map((communication) => ({
      occurredAt: communication.occurredAt,
      metadata: configObject(communication.metadata),
    }))
    .filter((communication) => {
      return (
        metadataString(communication.metadata, "source") === "sales-ai-feedback"
      );
    });
  const acceptedAiFeedback = aiFeedbackRows.filter(
    (feedback) => metadataString(feedback.metadata, "outcome") === "accepted",
  ).length;
  const dismissedAiFeedback = aiFeedbackRows.filter(
    (feedback) => metadataString(feedback.metadata, "outcome") === "dismissed",
  ).length;
  const aiStageGuidanceFeedback = aiFeedbackRows.filter(
    (feedback) =>
      metadataString(feedback.metadata, "recommendationType") ===
      "stage-guidance",
  ).length;
  const now = new Date();
  const stageSlaRows = openStageAgeOpportunities
    .map((opportunity) => {
      const daysInStage = daysBetween(opportunity.stageChangedAt, now);
      return {
        daysInStage,
        id: opportunity.id,
        ownerName: opportunity.owner?.name ?? "Unassigned",
        slaDays: opportunity.salesPipelineStage?.slaDays ?? null,
        stageChangedAt: opportunity.stageChangedAt.toISOString(),
        stageName: opportunity.salesPipelineStage?.name ?? opportunity.stage,
        status:
          opportunity.salesPipelineStage?.slaDays &&
          daysInStage >= opportunity.salesPipelineStage.slaDays * 2
            ? "Critical"
            : opportunity.salesPipelineStage?.slaDays &&
                daysInStage >= opportunity.salesPipelineStage.slaDays
              ? "Watch"
              : "Fresh",
        title: opportunity.title,
      };
    })
    .filter(
      (opportunity) =>
        opportunity.slaDays !== null &&
        opportunity.daysInStage >= opportunity.slaDays,
    )
    .slice(0, 12);

  return (
    <>
      <PageHeader
        title="Sales Automation"
        description="Configure safe sales automations for stage changes, communications, scoring and approval workflows."
      />
      <SalesAutomationManager
        analytics={{
          actionCounts,
          approvalsDismissed,
          approvalsSent,
          attentionItems,
          completedRuns,
          failedRuns,
          pendingApprovals,
          pipelineImpact: {
            assisted: pipelineStats(assistedPipeline),
            unassisted: pipelineStats(unassistedPipeline),
          },
          rulePerformance,
          aiFeedback: {
            accepted: acceptedAiFeedback,
            dismissed: dismissedAiFeedback,
            stageGuidance: aiStageGuidanceFeedback,
            total: aiFeedbackRows.length,
          },
          skippedRuns,
          stageMovesApplied,
          stageSuggestions,
          statusCounts,
          totalRuns: analyticsRunRows.length,
          windowLabel: "Last 30 days",
        }}
        stageSlaRows={stageSlaRows}
        approvalRuns={approvalRuns.map((run) => {
          const metadata = configObject(run.metadata);

          return {
            id: run.id,
            action: run.action,
            createdAt: run.createdAt.toISOString(),
            draftBody: metadataString(metadata, "draftBody"),
            draftSubject: metadataString(metadata, "draftSubject"),
            message: run.message,
            metadata,
            opportunityId: run.opportunity?.id ?? null,
            opportunityTitle: run.opportunity?.title ?? null,
            recipientEmail: run.opportunity?.contact?.email ?? null,
            recipientName: contactName(run.opportunity?.contact),
            recipientPhone: run.opportunity?.contact?.phone ?? null,
            ruleName: run.rule?.name ?? null,
            status: run.status,
            trigger: run.trigger,
          };
        })}
        recentRuns={recentRuns.map((run) => {
          const metadata = configObject(run.metadata);

          return {
            id: run.id,
            action: run.action,
            createdAt: run.createdAt.toISOString(),
            draftBody: metadataString(metadata, "draftBody"),
            draftSubject: metadataString(metadata, "draftSubject"),
            message: run.message,
            metadata,
            opportunityId: run.opportunity?.id ?? null,
            opportunityTitle: run.opportunity?.title ?? null,
            recipientEmail: run.opportunity?.contact?.email ?? null,
            recipientName: contactName(run.opportunity?.contact),
            recipientPhone: run.opportunity?.contact?.phone ?? null,
            ruleName: run.rule?.name ?? null,
            status: run.status,
            trigger: run.trigger,
          };
        })}
        rules={rules.map((rule) => ({
          id: rule.id,
          name: rule.name,
          description: rule.description,
          trigger: rule.trigger,
          action: rule.action,
          salesPipelineStageId: rule.salesPipelineStageId,
          isActive: rule.isActive,
          config: configObject(rule.config),
          runCount: rule._count.runs,
          lastRunAt: rule.runs[0]?.createdAt.toISOString() ?? null,
        }))}
        stages={stages}
      />
    </>
  );
}
