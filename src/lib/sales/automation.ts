import "server-only";

import type {
  Prisma,
  SalesAutomationActionType,
  SalesAutomationTriggerType,
  SalesStage,
} from "@prisma/client";
import { evaluateAutomationConditions } from "@/lib/sales/automation-conditions";

type SalesAutomationClient = Pick<
  Prisma.TransactionClient,
  | "leadScoreEvent"
  | "salesAutomationRule"
  | "salesAutomationRun"
  | "salesOpportunity"
  | "salesPipelineStage"
  | "task"
>;

type SalesAutomationTriggerInput = {
  communicationId?: string | null;
  metadata?: Prisma.InputJsonObject;
  occurredAt?: Date;
  opportunityId: string | null | undefined;
  salesPipelineStageId?: string | null;
  trigger: SalesAutomationTriggerType;
  userId?: string | null;
};

const triggerScoreDeltas: Record<SalesAutomationTriggerType, number> = {
  STAGE_ENTERED: 0,
  EMAIL_RECEIVED: 8,
  EMAIL_SENT: 3,
  SMS_RECEIVED: 10,
  SMS_SENT: 4,
  CALL_COMPLETED: 12,
  CALL_MISSED: -6,
  SITE_VISIT: 6,
};

const stageScoreDeltas: Record<SalesStage, number> = {
  LEAD: 0,
  QUALIFIED: 12,
  PROPOSAL: 18,
  NEGOTIATION: 10,
  WON: 25,
  LOST: -30,
};

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

async function applyScoreDelta({
  client,
  delta,
  metadata,
  opportunityId,
  reason,
  source,
}: {
  client: SalesAutomationClient;
  delta: number;
  metadata?: Prisma.InputJsonObject;
  opportunityId: string;
  reason: string;
  source: string;
}) {
  if (!delta) return null;

  const opportunity = await client.salesOpportunity.findUnique({
    where: { id: opportunityId },
    select: { score: true },
  });
  if (!opportunity) return null;

  const scoreAfter = clampScore(opportunity.score + delta);

  await client.salesOpportunity.update({
    where: { id: opportunityId },
    data: {
      score: scoreAfter,
      scoreUpdatedAt: new Date(),
    },
  });

  await client.leadScoreEvent.create({
    data: {
      opportunityId,
      delta,
      scoreAfter,
      reason,
      source,
      metadata,
    },
  });

  return scoreAfter;
}

function baseScoreDelta(
  trigger: SalesAutomationTriggerType,
  stage: SalesStage,
) {
  if (trigger === "STAGE_ENTERED") return stageScoreDeltas[stage] ?? 0;
  return triggerScoreDeltas[trigger] ?? 0;
}

function taskDueDate(config: Record<string, unknown>) {
  const days = numberValue(config.dueInDays);
  if (days === null) return null;

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + Math.max(0, Math.round(days)));
  return dueDate;
}

async function recordRun({
  action,
  client,
  message,
  metadata,
  opportunityId,
  ruleId,
  salesPipelineStageId,
  status,
  trigger,
}: {
  action: SalesAutomationActionType;
  client: SalesAutomationClient;
  message?: string | null;
  metadata?: Prisma.InputJsonObject;
  opportunityId: string;
  ruleId?: string | null;
  salesPipelineStageId?: string | null;
  status: "COMPLETED" | "SKIPPED" | "FAILED";
  trigger: SalesAutomationTriggerType;
}) {
  await client.salesAutomationRun.create({
    data: {
      action,
      message: message ?? null,
      metadata,
      opportunityId,
      ruleId: ruleId ?? null,
      salesPipelineStageId: salesPipelineStageId ?? null,
      status,
      trigger,
    },
  });
}

export async function runSalesAutomationTrigger(
  client: SalesAutomationClient,
  input: SalesAutomationTriggerInput,
) {
  if (!input.opportunityId) return;

  const opportunity = await client.salesOpportunity.findUnique({
    where: { id: input.opportunityId },
    select: {
      companyId: true,
      contactId: true,
      leadScope: true,
      ownerId: true,
      salesPipelineStageId: true,
      score: true,
      source: true,
      stage: true,
      stageChangedAt: true,
      title: true,
    },
  });
  if (!opportunity) return;

  const salesPipelineStageId =
    input.salesPipelineStageId ?? opportunity.salesPipelineStageId;
  const metadata = {
    ...(input.metadata ?? {}),
    ...(input.communicationId
      ? { communicationId: input.communicationId }
      : {}),
  } satisfies Prisma.InputJsonObject;
  const systemDelta = baseScoreDelta(input.trigger, opportunity.stage);
  const scoreAfter = await applyScoreDelta({
    client,
    delta: systemDelta,
    metadata,
    opportunityId: input.opportunityId,
    reason:
      input.trigger === "STAGE_ENTERED"
        ? `Entered ${opportunity.stage.toLowerCase()} stage`
        : input.trigger.toLowerCase().replace(/_/g, " "),
    source: `system:${input.trigger.toLowerCase()}`,
  });

  if (scoreAfter !== null) {
    await recordRun({
      action: "UPDATE_SCORE",
      client,
      message: `Lead score changed by ${systemDelta}.`,
      metadata: { ...metadata, scoreAfter },
      opportunityId: input.opportunityId,
      salesPipelineStageId,
      status: "COMPLETED",
      trigger: input.trigger,
    });
  }

  const rules = await client.salesAutomationRule.findMany({
    where: {
      isActive: true,
      trigger: input.trigger,
      OR: [
        { salesPipelineStageId: null },
        ...(salesPipelineStageId ? [{ salesPipelineStageId }] : []),
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  for (const rule of rules) {
    const config = jsonObject(rule.config);
    const conditionResult = evaluateAutomationConditions(config, opportunity);

    try {
      if (!conditionResult.matched) {
        await recordRun({
          action: rule.action,
          client,
          message: `Rule conditions not met: ${conditionResult.reason}.`,
          metadata: {
            ...metadata,
            conditionResult: conditionResult.reason,
            ruleName: rule.name,
          },
          opportunityId: input.opportunityId,
          ruleId: rule.id,
          salesPipelineStageId,
          status: "SKIPPED",
          trigger: input.trigger,
        });
        continue;
      }

      if (rule.action === "UPDATE_SCORE") {
        const delta = numberValue(config.delta) ?? 0;
        const ruleScoreAfter = await applyScoreDelta({
          client,
          delta,
          metadata: { ...metadata, ruleName: rule.name },
          opportunityId: input.opportunityId,
          reason: stringValue(config.reason) ?? rule.name,
          source: `rule:${rule.id}`,
        });

        await recordRun({
          action: rule.action,
          client,
          message:
            ruleScoreAfter === null
              ? "No score change configured."
              : `Lead score changed by ${delta}.`,
          metadata: { ...metadata, scoreAfter: ruleScoreAfter },
          opportunityId: input.opportunityId,
          ruleId: rule.id,
          salesPipelineStageId,
          status: ruleScoreAfter === null ? "SKIPPED" : "COMPLETED",
          trigger: input.trigger,
        });
        continue;
      }

      if (rule.action === "CREATE_TASK") {
        const creatorId = input.userId ?? opportunity.ownerId;
        if (!creatorId) {
          await recordRun({
            action: rule.action,
            client,
            message: "No user was available to create the task.",
            metadata,
            opportunityId: input.opportunityId,
            ruleId: rule.id,
            salesPipelineStageId,
            status: "SKIPPED",
            trigger: input.trigger,
          });
          continue;
        }

        const task = await client.task.create({
          data: {
            assigneeId:
              stringValue(config.assigneeId) ??
              opportunity.ownerId ??
              creatorId,
            companyId: opportunity.companyId,
            contactId: opportunity.contactId,
            creatorId,
            description:
              stringValue(config.description) ??
              `Automation created from ${input.trigger.toLowerCase().replace(/_/g, " ")} on ${opportunity.title}.`,
            dueDate: taskDueDate(config),
            metadata: {
              automationRuleId: rule.id,
              opportunityId: input.opportunityId,
              trigger: input.trigger,
            },
            title: stringValue(config.title) ?? rule.name,
          },
          select: { id: true },
        });

        await recordRun({
          action: rule.action,
          client,
          message: "Task created.",
          metadata: { ...metadata, taskId: task.id },
          opportunityId: input.opportunityId,
          ruleId: rule.id,
          salesPipelineStageId,
          status: "COMPLETED",
          trigger: input.trigger,
        });
        continue;
      }

      if (rule.action === "SEND_EMAIL" || rule.action === "SEND_SMS") {
        const creatorId = input.userId ?? opportunity.ownerId;
        if (!creatorId) {
          await recordRun({
            action: rule.action,
            client,
            message: "No user was available to create the approval task.",
            metadata,
            opportunityId: input.opportunityId,
            ruleId: rule.id,
            salesPipelineStageId,
            status: "SKIPPED",
            trigger: input.trigger,
          });
          continue;
        }

        const task = await client.task.create({
          data: {
            assigneeId: opportunity.ownerId ?? creatorId,
            companyId: opportunity.companyId,
            contactId: opportunity.contactId,
            creatorId,
            description:
              stringValue(config.description) ??
              `Review the ${rule.action === "SEND_EMAIL" ? "email" : "SMS"} draft before sending. Automation never sends this automatically.`,
            dueDate: taskDueDate(config),
            metadata: {
              automationAction: rule.action,
              automationRuleId: rule.id,
              draftBody: stringValue(config.body),
              draftSubject: stringValue(config.subject),
              opportunityId: input.opportunityId,
              requiresApproval: true,
              trigger: input.trigger,
            },
            title:
              stringValue(config.title) ??
              `Review ${rule.action === "SEND_EMAIL" ? "email" : "SMS"} automation draft`,
          },
          select: { id: true },
        });

        await recordRun({
          action: rule.action,
          client,
          message: "Approval task created; message was not sent.",
          metadata: {
            ...metadata,
            draftBody: stringValue(config.body),
            draftSubject: stringValue(config.subject),
            taskId: task.id,
          },
          opportunityId: input.opportunityId,
          ruleId: rule.id,
          salesPipelineStageId,
          status: "SKIPPED",
          trigger: input.trigger,
        });
        continue;
      }

      if (rule.action === "SUGGEST_STAGE_MOVE") {
        const creatorId = input.userId ?? opportunity.ownerId;
        const targetStageId = stringValue(config.targetStageId);
        const targetStage = targetStageId
          ? await client.salesPipelineStage.findFirst({
              where: { id: targetStageId, isActive: true },
              select: { id: true, name: true },
            })
          : null;

        if (!creatorId) {
          await recordRun({
            action: rule.action,
            client,
            message: "No user was available to create the stage suggestion.",
            metadata,
            opportunityId: input.opportunityId,
            ruleId: rule.id,
            salesPipelineStageId,
            status: "SKIPPED",
            trigger: input.trigger,
          });
          continue;
        }

        const task = await client.task.create({
          data: {
            assigneeId: opportunity.ownerId ?? creatorId,
            companyId: opportunity.companyId,
            contactId: opportunity.contactId,
            creatorId,
            description:
              stringValue(config.reason) ??
              `Review whether ${opportunity.title} is ready to move stage.`,
            dueDate: taskDueDate(config),
            metadata: {
              automationAction: rule.action,
              automationRuleId: rule.id,
              opportunityId: input.opportunityId,
              suggestedStageId: targetStage?.id ?? null,
              suggestedStageName: targetStage?.name ?? null,
              trigger: input.trigger,
            },
            title:
              stringValue(config.title) ??
              `Review stage move${targetStage ? ` to ${targetStage.name}` : ""}`,
          },
          select: { id: true },
        });

        await recordRun({
          action: rule.action,
          client,
          message: targetStage
            ? `Stage move suggested: ${targetStage.name}.`
            : "Stage move review task created.",
          metadata: {
            ...metadata,
            suggestedStageId: targetStage?.id ?? null,
            suggestedStageName: targetStage?.name ?? null,
            taskId: task.id,
          },
          opportunityId: input.opportunityId,
          ruleId: rule.id,
          salesPipelineStageId,
          status: "COMPLETED",
          trigger: input.trigger,
        });
        continue;
      }

      if (rule.action === "NOTIFY_OWNER") {
        const creatorId = input.userId ?? opportunity.ownerId;
        if (!creatorId || !opportunity.ownerId) {
          await recordRun({
            action: rule.action,
            client,
            message: "No owner was available to notify.",
            metadata,
            opportunityId: input.opportunityId,
            ruleId: rule.id,
            salesPipelineStageId,
            status: "SKIPPED",
            trigger: input.trigger,
          });
          continue;
        }

        const task = await client.task.create({
          data: {
            assigneeId: opportunity.ownerId,
            companyId: opportunity.companyId,
            contactId: opportunity.contactId,
            creatorId,
            description:
              stringValue(config.description) ??
              `Automation notification from ${input.trigger.toLowerCase().replace(/_/g, " ")} on ${opportunity.title}.`,
            dueDate: taskDueDate(config),
            metadata: {
              automationAction: rule.action,
              automationRuleId: rule.id,
              opportunityId: input.opportunityId,
              trigger: input.trigger,
            },
            title: stringValue(config.title) ?? rule.name,
          },
          select: { id: true },
        });

        await recordRun({
          action: rule.action,
          client,
          message: "Owner notification task created.",
          metadata: { ...metadata, taskId: task.id },
          opportunityId: input.opportunityId,
          ruleId: rule.id,
          salesPipelineStageId,
          status: "COMPLETED",
          trigger: input.trigger,
        });
        continue;
      }

      await recordRun({
        action: rule.action,
        client,
        message: "Automation action recorded for follow-up.",
        metadata,
        opportunityId: input.opportunityId,
        ruleId: rule.id,
        salesPipelineStageId,
        status: "SKIPPED",
        trigger: input.trigger,
      });
    } catch (error) {
      await recordRun({
        action: rule.action,
        client,
        message:
          error instanceof Error ? error.message : "Automation rule failed.",
        metadata,
        opportunityId: input.opportunityId,
        ruleId: rule.id,
        salesPipelineStageId,
        status: "FAILED",
        trigger: input.trigger,
      });
    }
  }
}
