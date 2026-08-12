"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { evaluateAutomationConditions } from "@/lib/sales/automation-conditions";
import {
  outboundMessageError,
  sendSalesLeadEmail,
  sendSalesLeadSms,
} from "@/lib/sales/outbound-messages";

export type SalesAutomationActionState = {
  ok: boolean;
  message: string;
  savedAt?: number | null;
};

const triggerValues = [
  "STAGE_ENTERED",
  "EMAIL_RECEIVED",
  "EMAIL_SENT",
  "SMS_RECEIVED",
  "SMS_SENT",
  "CALL_COMPLETED",
  "CALL_MISSED",
  "SITE_VISIT",
] as const;

const actionValues = [
  "CREATE_TASK",
  "SEND_EMAIL",
  "SEND_SMS",
  "NOTIFY_OWNER",
  "UPDATE_SCORE",
  "SUGGEST_STAGE_MOVE",
] as const;

const ruleSchema = z.object({
  id: z.string().trim().optional(),
  name: z.string().trim().min(2, "Rule name is required.").max(120),
  description: z.string().trim().max(500).optional(),
  trigger: z.enum(triggerValues),
  action: z.enum(actionValues),
  salesPipelineStageId: z.string().trim().optional(),
  isActive: z.boolean().default(false),
  taskTitle: z.string().trim().max(160).optional(),
  taskDescription: z.string().trim().max(1000).optional(),
  dueInDays: z.string().trim().optional(),
  scoreDelta: z.string().trim().optional(),
  scoreReason: z.string().trim().max(300).optional(),
  draftSubject: z.string().trim().max(191).optional(),
  draftBody: z.string().trim().max(5000).optional(),
  targetStageId: z.string().trim().optional(),
  minScore: z.string().trim().optional(),
  maxScore: z.string().trim().optional(),
  sourceIncludes: z.string().trim().max(160).optional(),
  serviceIncludes: z.string().trim().max(160).optional(),
  minStageAgeDays: z.string().trim().optional(),
  maxStageAgeDays: z.string().trim().optional(),
});

const approvalSchema = z.object({
  body: z.string().trim().min(1, "Write the message before sending.").max(5000),
  runId: z.string().trim().min(1),
  subject: z.string().trim().max(191).optional(),
  to: z.string().trim().optional(),
});

const presetSchema = z.object({
  preset: z.enum([
    "discovery",
    "proposal_follow_up",
    "inbound_scoring",
    "missed_call_recovery",
    "stage_move_suggestions",
  ]),
});

const ruleIdSchema = z.object({
  id: z.string().trim().min(1),
});

const ruleTestSchema = z.object({
  opportunityId: z.string().trim().min(1, "Enter a lead ID to test."),
  ruleId: z.string().trim().min(1),
});

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

function optional(value: string | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

function optionalNumber(value: string | undefined) {
  const text = optional(value);
  if (!text) return null;

  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function numberValue(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanConfig(data: z.infer<typeof ruleSchema>) {
  const config: Record<string, Prisma.InputJsonValue> = {};
  const dueInDays = optionalNumber(data.dueInDays);
  const scoreDelta = optionalNumber(data.scoreDelta);
  const taskTitle = optional(data.taskTitle);
  const taskDescription = optional(data.taskDescription);
  const scoreReason = optional(data.scoreReason);
  const draftSubject = optional(data.draftSubject);
  const draftBody = optional(data.draftBody);
  const targetStageId = optional(data.targetStageId);
  const minScore = optionalNumber(data.minScore);
  const maxScore = optionalNumber(data.maxScore);
  const minStageAgeDays = optionalNumber(data.minStageAgeDays);
  const maxStageAgeDays = optionalNumber(data.maxStageAgeDays);
  const sourceIncludes = optional(data.sourceIncludes);
  const serviceIncludes = optional(data.serviceIncludes);
  const conditions: Record<string, Prisma.InputJsonValue> = {};

  if (taskTitle) config.title = taskTitle;
  if (taskDescription) config.description = taskDescription;
  if (dueInDays !== null) config.dueInDays = dueInDays;
  if (scoreDelta !== null) config.delta = scoreDelta;
  if (scoreReason) config.reason = scoreReason;
  if (draftSubject) config.subject = draftSubject;
  if (draftBody) config.body = draftBody;
  if (targetStageId) config.targetStageId = targetStageId;
  if (minScore !== null) conditions.minScore = minScore;
  if (maxScore !== null) conditions.maxScore = maxScore;
  if (sourceIncludes) conditions.sourceIncludes = sourceIncludes;
  if (serviceIncludes) conditions.serviceIncludes = serviceIncludes;
  if (minStageAgeDays !== null) conditions.minStageAgeDays = minStageAgeDays;
  if (maxStageAgeDays !== null) conditions.maxStageAgeDays = maxStageAgeDays;
  if (Object.keys(conditions).length) {
    config.conditions = conditions as Prisma.InputJsonObject;
  }

  return Object.keys(config).length ? (config as Prisma.InputJsonObject) : null;
}

function jsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseRuleForm(formData: FormData) {
  return ruleSchema.safeParse({
    id: formString(formData, "id"),
    name: formString(formData, "name"),
    description: formString(formData, "description"),
    trigger: formString(formData, "trigger"),
    action: formString(formData, "action"),
    salesPipelineStageId: formString(formData, "salesPipelineStageId"),
    isActive: formData.get("isActive") === "on",
    taskTitle: formString(formData, "taskTitle"),
    taskDescription: formString(formData, "taskDescription"),
    dueInDays: formString(formData, "dueInDays"),
    scoreDelta: formString(formData, "scoreDelta"),
    scoreReason: formString(formData, "scoreReason"),
    draftSubject: formString(formData, "draftSubject"),
    draftBody: formString(formData, "draftBody"),
    targetStageId: formString(formData, "targetStageId"),
    minScore: formString(formData, "minScore"),
    maxScore: formString(formData, "maxScore"),
    sourceIncludes: formString(formData, "sourceIncludes"),
    serviceIncludes: formString(formData, "serviceIncludes"),
    minStageAgeDays: formString(formData, "minStageAgeDays"),
    maxStageAgeDays: formString(formData, "maxStageAgeDays"),
  });
}

async function validateStageIds(stageIds: Array<string | null>) {
  const ids = stageIds.filter((id): id is string => Boolean(id));
  if (!ids.length) return true;

  const count = await prisma.salesPipelineStage.count({
    where: { id: { in: ids }, isActive: true },
  });
  return count === new Set(ids).size;
}

export async function saveSalesAutomationRuleAction(
  _: SalesAutomationActionState,
  formData: FormData,
): Promise<SalesAutomationActionState> {
  await requireAdmin();

  const parsed = parseRuleForm(formData);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the automation rule.",
      savedAt: null,
    };
  }

  const data = parsed.data;
  const salesPipelineStageId = optional(data.salesPipelineStageId);
  const targetStageId = optional(data.targetStageId);

  if (!(await validateStageIds([salesPipelineStageId, targetStageId]))) {
    return {
      ok: false,
      message: "Choose an active pipeline stage.",
      savedAt: null,
    };
  }

  const ruleData = {
    action: data.action,
    config: cleanConfig(data) ?? Prisma.JsonNull,
    description: optional(data.description),
    isActive: data.isActive,
    name: data.name,
    salesPipelineStageId,
    trigger: data.trigger,
  } satisfies Prisma.SalesAutomationRuleUncheckedCreateInput;

  if (data.id) {
    const existing = await prisma.salesAutomationRule.findUnique({
      where: { id: data.id },
      select: { id: true },
    });

    if (!existing) {
      return {
        ok: false,
        message: "Automation rule not found.",
        savedAt: null,
      };
    }

    await prisma.salesAutomationRule.update({
      where: { id: data.id },
      data: ruleData,
    });
  } else {
    await prisma.salesAutomationRule.create({ data: ruleData });
  }

  revalidatePath("/settings/sales-automation");
  return {
    ok: true,
    message: data.id ? "Automation rule saved." : "Automation rule created.",
    savedAt: Date.now(),
  };
}

export async function toggleSalesAutomationRuleAction(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim();
  const isActive = formData.get("isActive") === "on";
  if (!id) return;

  await prisma.salesAutomationRule.update({
    where: { id },
    data: { isActive },
  });
  revalidatePath("/settings/sales-automation");
}

export async function deleteSalesAutomationRuleAction(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  await prisma.salesAutomationRule.delete({ where: { id } });
  revalidatePath("/settings/sales-automation");
}

export async function duplicateSalesAutomationRuleAction(
  _: SalesAutomationActionState,
  formData: FormData,
): Promise<SalesAutomationActionState> {
  await requireAdmin();
  const parsed = ruleIdSchema.safeParse({ id: formString(formData, "id") });

  if (!parsed.success) {
    return { ok: false, message: "Automation rule not found.", savedAt: null };
  }

  const rule = await prisma.salesAutomationRule.findUnique({
    where: { id: parsed.data.id },
  });

  if (!rule) {
    return { ok: false, message: "Automation rule not found.", savedAt: null };
  }

  await prisma.salesAutomationRule.create({
    data: {
      action: rule.action,
      config: rule.config ?? Prisma.JsonNull,
      description: rule.description,
      isActive: false,
      name: `${rule.name} copy`.slice(0, 120),
      salesPipelineStageId: rule.salesPipelineStageId,
      trigger: rule.trigger,
    },
  });

  revalidatePath("/settings/sales-automation");
  return {
    ok: true,
    message: "Rule duplicated as disabled copy.",
    savedAt: Date.now(),
  };
}

export async function testSalesAutomationRuleAction(
  _: SalesAutomationActionState,
  formData: FormData,
): Promise<SalesAutomationActionState> {
  await requireAdmin();
  const parsed = ruleTestSchema.safeParse({
    opportunityId: formString(formData, "opportunityId"),
    ruleId: formString(formData, "ruleId"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the test details.",
      savedAt: null,
    };
  }

  const [rule, opportunity] = await Promise.all([
    prisma.salesAutomationRule.findUnique({
      where: { id: parsed.data.ruleId },
      include: { salesPipelineStage: { select: { name: true } } },
    }),
    prisma.salesOpportunity.findUnique({
      where: { id: parsed.data.opportunityId },
      select: {
        id: true,
        leadScope: true,
        salesPipelineStage: { select: { name: true } },
        salesPipelineStageId: true,
        score: true,
        source: true,
        stage: true,
        stageChangedAt: true,
        title: true,
      },
    }),
  ]);

  if (!rule) {
    return { ok: false, message: "Automation rule not found.", savedAt: null };
  }

  if (!opportunity) {
    return { ok: false, message: "Lead not found.", savedAt: null };
  }

  const config = jsonObject(rule.config);
  const stageMatches =
    !rule.salesPipelineStageId ||
    rule.salesPipelineStageId === opportunity.salesPipelineStageId;
  const stageLabel = rule.salesPipelineStage?.name ?? "any stage";
  const currentStage =
    opportunity.salesPipelineStage?.name ?? opportunity.stage;

  if (!stageMatches) {
    return {
      ok: true,
      message: `Dry run skipped: ${opportunity.title} is in ${currentStage}, while this rule is scoped to ${stageLabel}.`,
      savedAt: Date.now(),
    };
  }

  const conditionResult = evaluateAutomationConditions(config, opportunity);
  if (!conditionResult.matched) {
    return {
      ok: true,
      message: `Dry run skipped: ${conditionResult.reason}.`,
      savedAt: Date.now(),
    };
  }

  const preview =
    rule.action === "SEND_EMAIL"
      ? `would create an email approval task${stringValue(config.subject) ? ` with subject "${stringValue(config.subject)}"` : ""}`
      : rule.action === "SEND_SMS"
        ? "would create an SMS approval task"
        : rule.action === "CREATE_TASK"
          ? `would create task "${stringValue(config.title) ?? rule.name}"`
          : rule.action === "UPDATE_SCORE"
            ? `would adjust score by ${numberValue(config.delta) ?? 0}`
            : rule.action === "SUGGEST_STAGE_MOVE"
              ? "would create a stage-move suggestion task"
              : "would create an owner notification task";

  return {
    ok: true,
    message: `Dry run matched: ${rule.name} ${preview}. No live action was taken.`,
    savedAt: Date.now(),
  };
}

export async function createStageSlaFollowUpTasksAction(
  _: SalesAutomationActionState,
  formData: FormData,
): Promise<SalesAutomationActionState> {
  const user = await requireAdmin();
  const limit = Math.min(
    50,
    Math.max(1, numberValue(formString(formData, "limit")) ?? 20),
  );
  const opportunities = await prisma.salesOpportunity.findMany({
    where: {
      stage: { notIn: ["WON", "LOST"] },
      salesPipelineStage: { slaDays: { not: null } },
    },
    orderBy: [{ stageChangedAt: "asc" }, { updatedAt: "desc" }],
    take: 200,
    select: {
      companyId: true,
      contactId: true,
      id: true,
      ownerId: true,
      salesPipelineStage: {
        select: {
          name: true,
          slaDays: true,
        },
      },
      stageChangedAt: true,
      title: true,
    },
  });
  const existingTasks = await prisma.task.findMany({
    where: {
      status: { in: ["TODO", "IN_PROGRESS"] },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      metadata: true,
    },
  });
  const existingOpportunityIds = new Set(
    existingTasks
      .map((task) => {
        const metadata = jsonObject(task.metadata);
        return stringValue(metadata.opportunityId);
      })
      .filter(Boolean),
  );
  const now = Date.now();
  let created = 0;

  for (const opportunity of opportunities) {
    if (created >= limit) break;
    const slaDays = opportunity.salesPipelineStage?.slaDays;
    if (!slaDays) continue;

    const daysInStage = Math.floor(
      (now - opportunity.stageChangedAt.getTime()) / 86_400_000,
    );
    if (daysInStage < slaDays || existingOpportunityIds.has(opportunity.id)) {
      continue;
    }

    await prisma.task.create({
      data: {
        assigneeId: opportunity.ownerId ?? user.id,
        companyId: opportunity.companyId,
        contactId: opportunity.contactId,
        creatorId: user.id,
        description: `${opportunity.title} has been in ${opportunity.salesPipelineStage?.name ?? "the current stage"} for ${daysInStage} days. Review the next action and move, revive or close the lead.`,
        dueDate: new Date(),
        metadata: {
          opportunityId: opportunity.id,
          source: "stage-sla",
          stageName: opportunity.salesPipelineStage?.name ?? null,
        },
        title: "Review stale sales stage",
      },
    });
    existingOpportunityIds.add(opportunity.id);
    created += 1;
  }

  revalidatePath("/settings/sales-automation");
  revalidatePath("/tasks");
  return {
    ok: true,
    message: created
      ? `Created ${created} SLA follow-up task${created === 1 ? "" : "s"}.`
      : "No overdue stage SLA tasks needed.",
    savedAt: Date.now(),
  };
}

export async function sendSalesAutomationApprovalAction(
  _: SalesAutomationActionState,
  formData: FormData,
): Promise<SalesAutomationActionState> {
  const user = await requireAdmin();
  const parsed = approvalSchema.safeParse({
    body: formString(formData, "body"),
    runId: formString(formData, "runId"),
    subject: formString(formData, "subject"),
    to: formString(formData, "to"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the approval draft.",
      savedAt: null,
    };
  }

  const run = await prisma.salesAutomationRun.findUnique({
    where: { id: parsed.data.runId },
    include: {
      opportunity: {
        include: { contact: true },
      },
    },
  });

  if (!run?.opportunity) {
    return { ok: false, message: "Automation approval not found." };
  }

  if (
    (run.status !== "SKIPPED" && run.status !== "FAILED") ||
    (run.action !== "SEND_EMAIL" && run.action !== "SEND_SMS")
  ) {
    return {
      ok: false,
      message: "This automation item is not awaiting approval.",
    };
  }

  const metadata = jsonObject(run.metadata);
  const taskId = stringValue(metadata.taskId);

  try {
    const result =
      run.action === "SEND_EMAIL"
        ? await sendSalesLeadEmail({
            body: parsed.data.body,
            contactId: run.opportunity.contactId,
            opportunityId: run.opportunity.id,
            source: "sales-automation-approval",
            subject:
              parsed.data.subject ||
              stringValue(metadata.draftSubject) ||
              `Next step for ${run.opportunity.title}`,
            to: parsed.data.to,
            user,
          })
        : await sendSalesLeadSms({
            body: parsed.data.body,
            contactId: run.opportunity.contactId,
            opportunityId: run.opportunity.id,
            source: "sales-automation-approval",
            to: parsed.data.to,
            user,
          });

    await prisma.salesAutomationRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        message: "Approved and sent.",
        metadata: {
          ...metadata,
          approvedAt: new Date().toISOString(),
          approvedByUserId: user.id,
          communicationId: result.communicationId,
          editedBody: parsed.data.body,
          editedSubject: parsed.data.subject || null,
          recipient: result.recipient,
          taskId,
        } satisfies Prisma.InputJsonObject,
      },
    });

    if (taskId) {
      await prisma.task
        .update({ where: { id: taskId }, data: { status: "DONE" } })
        .catch(() => null);
    }

    revalidatePath("/settings/sales-automation");
    revalidatePath(`/sales/${run.opportunity.id}`);
    revalidatePath("/tasks");
    return { ok: true, message: "Automation draft sent.", savedAt: Date.now() };
  } catch (error) {
    await prisma.salesAutomationRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        message: outboundMessageError(
          error,
          "Automation draft could not be sent.",
        ),
        metadata: {
          ...metadata,
          failedAt: new Date().toISOString(),
          failedByUserId: user.id,
        } satisfies Prisma.InputJsonObject,
      },
    });

    revalidatePath("/settings/sales-automation");
    return {
      ok: false,
      message: outboundMessageError(
        error,
        "Automation draft could not be sent.",
      ),
      savedAt: null,
    };
  }
}

export async function dismissSalesAutomationApprovalAction(
  _: SalesAutomationActionState,
  formData: FormData,
): Promise<SalesAutomationActionState> {
  const user = await requireAdmin();
  const runId = String(formData.get("runId") ?? "").trim();

  if (!runId) {
    return { ok: false, message: "Automation approval not found." };
  }

  const run = await prisma.salesAutomationRun.findUnique({
    where: { id: runId },
    select: {
      action: true,
      id: true,
      metadata: true,
      opportunityId: true,
      status: true,
    },
  });

  if (
    !run ||
    (run.status !== "SKIPPED" && run.status !== "FAILED") ||
    (run.action !== "SEND_EMAIL" && run.action !== "SEND_SMS")
  ) {
    return {
      ok: false,
      message: "This automation item is not awaiting approval.",
    };
  }

  const metadata = jsonObject(run.metadata);
  const taskId = stringValue(metadata.taskId);

  await prisma.salesAutomationRun.update({
    where: { id: run.id },
    data: {
      status: "COMPLETED",
      message: "Dismissed without sending.",
      metadata: {
        ...metadata,
        dismissedAt: new Date().toISOString(),
        dismissedByUserId: user.id,
        taskId,
      } satisfies Prisma.InputJsonObject,
    },
  });

  if (taskId) {
    await prisma.task
      .update({ where: { id: taskId }, data: { status: "DONE" } })
      .catch(() => null);
  }

  revalidatePath("/settings/sales-automation");
  if (run.opportunityId) revalidatePath(`/sales/${run.opportunityId}`);
  revalidatePath("/tasks");
  return {
    ok: true,
    message: "Automation draft dismissed.",
    savedAt: Date.now(),
  };
}

export async function createSalesAutomationPresetAction(
  _: SalesAutomationActionState,
  formData: FormData,
): Promise<SalesAutomationActionState> {
  await requireAdmin();
  const parsed = presetSchema.safeParse({
    preset: formString(formData, "preset"),
  });

  if (!parsed.success) {
    return { ok: false, message: "Choose a preset to add.", savedAt: null };
  }

  const stages = await prisma.salesPipelineStage.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { bucket: true, id: true, name: true },
  });
  const stageByBucket = new Map(stages.map((stage) => [stage.bucket, stage]));
  const firstOpenStage =
    stageByBucket.get("QUALIFIED") ?? stageByBucket.get("LEAD") ?? stages[0];
  const proposalStage = stageByBucket.get("PROPOSAL") ?? firstOpenStage;
  const rules: Prisma.SalesAutomationRuleUncheckedCreateInput[] = [];

  if (parsed.data.preset === "discovery" && firstOpenStage) {
    rules.push({
      action: "CREATE_TASK",
      config: {
        description:
          "Confirm goals, service fit, budget/timeline and book the discovery call.",
        dueInDays: 1,
        title: "Book discovery call",
      },
      description:
        "Creates an owner task when a lead enters the early discovery stage.",
      isActive: true,
      name: "Discovery: book call",
      salesPipelineStageId: firstOpenStage.id,
      trigger: "STAGE_ENTERED",
    });
  }

  if (parsed.data.preset === "proposal_follow_up" && proposalStage) {
    rules.push({
      action: "SEND_EMAIL",
      config: {
        body: "Hi, just following up on the proposal. Are there any questions I can answer, or would a quick call help move this forward?",
        dueInDays: 1,
        subject: "Following up on your proposal",
        title: "Review proposal follow-up email",
      },
      description:
        "Prepares a proposal follow-up email for approval when a lead enters proposal.",
      isActive: true,
      name: "Proposal: follow-up email draft",
      salesPipelineStageId: proposalStage.id,
      trigger: "STAGE_ENTERED",
    });
  }

  if (parsed.data.preset === "inbound_scoring") {
    rules.push({
      action: "UPDATE_SCORE",
      config: {
        delta: 8,
        reason: "Contact replied to sales conversation",
      },
      description: "Adds lead score when a contact replies by email.",
      isActive: true,
      name: "Engagement: inbound email score",
      salesPipelineStageId: null,
      trigger: "EMAIL_RECEIVED",
    });
  }

  if (parsed.data.preset === "missed_call_recovery") {
    rules.push({
      action: "CREATE_TASK",
      config: {
        description: "Call the lead back and log the outcome.",
        dueInDays: 0,
        title: "Recover missed sales call",
      },
      description: "Creates an immediate callback task after a missed call.",
      isActive: true,
      name: "Call: missed-call recovery",
      salesPipelineStageId: null,
      trigger: "CALL_MISSED",
    });
  }

  if (parsed.data.preset === "stage_move_suggestions" && proposalStage) {
    rules.push({
      action: "SUGGEST_STAGE_MOVE",
      config: {
        reason:
          "Lead has replied and may be ready for the proposal or next commercial stage.",
        targetStageId: proposalStage.id,
      },
      description:
        "Records a stage-move suggestion when contact engagement indicates readiness.",
      isActive: true,
      name: "AI/Rule: suggest next stage after reply",
      salesPipelineStageId: null,
      trigger: "EMAIL_RECEIVED",
    });
  }

  let created = 0;
  for (const rule of rules) {
    const exists = await prisma.salesAutomationRule.findFirst({
      where: {
        action: rule.action,
        name: rule.name,
        salesPipelineStageId: rule.salesPipelineStageId ?? null,
        trigger: rule.trigger,
      },
      select: { id: true },
    });

    if (exists) continue;
    await prisma.salesAutomationRule.create({ data: rule });
    created += 1;
  }

  revalidatePath("/settings/sales-automation");
  return {
    ok: true,
    message: created
      ? `Added ${created} automation preset${created === 1 ? "" : "s"}.`
      : "That preset is already configured.",
    savedAt: Date.now(),
  };
}
