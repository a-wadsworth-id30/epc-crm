"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { salesOpportunityIdAccessWhere } from "@/lib/crm-resource-access";
import { revalidateHeaderNotifications } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { bumpRealtimeTopics, realtimeTopics } from "@/lib/realtime/topics";
import { saleNextActionSchema } from "@/lib/sales/next-action";
import { getCrmSettings } from "@/lib/settings";
import {
  parseTaskDefaults,
  resolveTaskDefaultAssigneeId,
  taskDefaultDueDate,
} from "@/lib/tasks/defaults";

export type SaleNextActionState = {
  message: string;
  nextAction?: string | null;
  ok: boolean;
};

export type SaleNextActionTaskState = {
  created?: boolean;
  message: string;
  ok: boolean;
  taskId?: string;
};

const nextActionTaskSchema = z.object({
  expectedNextAction: z.string().trim().min(1).max(500),
  saleId: z.string().trim().min(1),
});

function nextActionFingerprint(saleId: string, nextAction: string) {
  return createHash("sha256")
    .update(`${saleId}\u0000${nextAction}`)
    .digest("hex");
}

export async function createSaleNextActionTaskAction(
  _: SaleNextActionTaskState,
  formData: FormData,
): Promise<SaleNextActionTaskState> {
  const user = await requireUser();
  const parsed = nextActionTaskSchema.safeParse({
    expectedNextAction: formData.get("expectedNextAction"),
    saleId: formData.get("saleId"),
  });
  if (!parsed.success) {
    return {
      message: "Save a next action before creating its task.",
      ok: false,
    };
  }

  const [sale, settings] = await Promise.all([
    prisma.salesOpportunity.findFirst({
      where: salesOpportunityIdAccessWhere(parsed.data.saleId, user),
      select: {
        companyId: true,
        contactId: true,
        id: true,
        nextStep: true,
        title: true,
      },
    }),
    getCrmSettings(),
  ]);
  if (!sale) return { message: "Sale not found.", ok: false };
  if (!sale.nextStep) {
    return { message: "This Sale no longer has a next action.", ok: false };
  }
  if (sale.nextStep !== parsed.data.expectedNextAction) {
    return {
      message:
        "The next action changed. Refresh and review it before creating a task.",
      ok: false,
    };
  }

  const nextAction = sale.nextStep;
  const fingerprint = nextActionFingerprint(sale.id, nextAction);
  const existing = await prisma.task.findFirst({
    where: {
      AND: [
        { metadata: { path: ["source"], equals: "sale-next-action" } },
        { metadata: { path: ["opportunityId"], equals: sale.id } },
        { metadata: { path: ["nextActionFingerprint"], equals: fingerprint } },
      ],
      status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (existing) {
    return {
      created: false,
      message: "An open task already exists for this next action.",
      ok: true,
      taskId: existing.id,
    };
  }

  const taskDefaults = parseTaskDefaults(settings.taskDefaults);
  const defaultAssigneeId = resolveTaskDefaultAssigneeId({
    fallbackUserId: user.id,
    taskDefaults,
  });
  const assignee = defaultAssigneeId
    ? await prisma.user.findFirst({
        where: { id: defaultAssigneeId, status: "ACTIVE" },
        select: { id: true },
      })
    : null;
  const assigneeId = defaultAssigneeId ? (assignee?.id ?? user.id) : null;
  const dueDate = taskDefaultDueDate(taskDefaults);

  const task = await prisma.$transaction(async (tx) => {
    const createdTask = await tx.task.create({
      data: {
        assigneeId,
        companyId: sale.companyId,
        contactId: sale.contactId,
        creatorId: user.id,
        description: `Created from the canonical next action for ${sale.title}. Review the Sale before completing this task.`,
        dueDate,
        metadata: {
          nextActionFingerprint: fingerprint,
          opportunityId: sale.id,
          opportunityTitle: sale.title,
          source: "sale-next-action",
        },
        title: nextAction,
      },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        action: "sale.next_action_task_created",
        actorId: user.id,
        entity: "SalesOpportunity",
        entityId: sale.id,
        metadata: {
          assigneeId,
          taskId: createdTask.id,
        },
      },
    });
    return createdTask;
  });

  revalidatePath("/tasks");
  revalidatePath(`/sales/${sale.id}`);
  revalidateHeaderNotifications();
  await bumpRealtimeTopics([realtimeTopics.tasks]);

  return {
    created: true,
    message: "Task created using the CRM task defaults.",
    ok: true,
    taskId: task.id,
  };
}

export async function updateSaleNextActionAction(
  _: SaleNextActionState,
  formData: FormData,
): Promise<SaleNextActionState> {
  const user = await requireUser();
  const parsed = saleNextActionSchema.safeParse({
    nextAction: formData.get("nextAction"),
    saleId: formData.get("saleId"),
  });

  if (!parsed.success) {
    return {
      message:
        parsed.error.issues[0]?.message ?? "Check the Sale's next action.",
      ok: false,
    };
  }

  const sale = await prisma.salesOpportunity.findFirst({
    where: salesOpportunityIdAccessWhere(parsed.data.saleId, user),
    select: {
      companyId: true,
      contactId: true,
      id: true,
      nextStep: true,
      participants: { select: { contactId: true } },
    },
  });

  if (!sale) {
    return { message: "Sale not found.", ok: false };
  }

  if (sale.nextStep === parsed.data.nextAction) {
    return {
      message: "Next action is already up to date.",
      nextAction: sale.nextStep,
      ok: true,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.salesOpportunity.update({
      where: { id: sale.id },
      data: {
        aiGuidanceFingerprint: null,
        nextStep: parsed.data.nextAction,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "sale.next_action_updated",
        actorId: user.id,
        entity: "SalesOpportunity",
        entityId: sale.id,
        metadata: {
          cleared: parsed.data.nextAction === null,
          previousValuePresent: Boolean(sale.nextStep),
        },
      },
    });
  });

  revalidatePath("/sales");
  revalidatePath(`/sales/${sale.id}`);
  const connectedContactIds = new Set([
    sale.contactId,
    ...sale.participants.map((participant) => participant.contactId),
  ]);
  for (const contactId of connectedContactIds) {
    if (contactId) revalidatePath(`/contacts/${contactId}`);
  }
  if (sale.companyId) revalidatePath(`/clients/${sale.companyId}`);

  return {
    message: parsed.data.nextAction
      ? "Next action updated across the connected records."
      : "Next action cleared.",
    nextAction: parsed.data.nextAction,
    ok: true,
  };
}
