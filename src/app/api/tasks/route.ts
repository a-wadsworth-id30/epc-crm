import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import {
  contactIdAccessWhere,
  salesOpportunityIdAccessWhere,
} from "@/lib/crm-resource-access";
import { prisma } from "@/lib/prisma";
import { getCrmSettings } from "@/lib/settings";
import {
  parseTaskDefaults,
  resolveTaskDefaultAssigneeId,
  taskDefaultDueDate,
} from "@/lib/tasks/defaults";

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(2000).optional().nullable(),
  assigneeId: z.string().trim().min(1).max(120).optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  contactId: z.string().trim().min(1).max(120).optional().nullable(),
  opportunityId: z.string().trim().min(1).max(120).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  const user = await requireUser();
  const payload = await request.json().catch(() => null);
  const parsed = createTaskSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the task title and due date." },
      { status: 400 },
    );
  }

  const settings = await getCrmSettings();
  const taskDefaults = parseTaskDefaults(settings.taskDefaults);
  const opportunity = parsed.data.opportunityId
    ? await prisma.salesOpportunity.findFirst({
        where: salesOpportunityIdAccessWhere(parsed.data.opportunityId, user),
        select: { id: true, contactId: true, companyId: true, title: true },
      })
    : null;

  if (parsed.data.opportunityId && !opportunity) {
    return NextResponse.json(
      { error: "Linked lead was not found." },
      { status: 404 },
    );
  }

  const explicitContact = parsed.data.contactId
    ? await prisma.contact.findFirst({
        where: contactIdAccessWhere(parsed.data.contactId, user),
        select: { id: true },
      })
    : null;

  if (parsed.data.contactId && !explicitContact) {
    return NextResponse.json(
      { error: "Linked contact was not found." },
      { status: 404 },
    );
  }

  if (
    explicitContact &&
    opportunity?.contactId &&
    explicitContact.id !== opportunity.contactId
  ) {
    return NextResponse.json(
      { error: "Linked contact does not belong to the linked lead." },
      { status: 400 },
    );
  }

  const contactId = explicitContact?.id ?? opportunity?.contactId ?? null;
  const dueDate = parsed.data.dueDate
    ? new Date(parsed.data.dueDate)
    : taskDefaultDueDate(taskDefaults);

  if (dueDate && Number.isNaN(dueDate.getTime())) {
    return NextResponse.json(
      { error: "Check the task due date." },
      { status: 400 },
    );
  }

  const explicitAssigneeId =
    parsed.data.assigneeId && parsed.data.assigneeId !== "unassigned"
      ? parsed.data.assigneeId
      : null;
  const assigneeId =
    parsed.data.assigneeId === "unassigned"
      ? null
      : explicitAssigneeId ??
        resolveTaskDefaultAssigneeId({
          fallbackUserId: user.id,
          taskDefaults,
        });
  const assignee = assigneeId
    ? await prisma.user.findFirst({
        where: { id: assigneeId, status: "ACTIVE" },
        select: { id: true },
      })
    : null;

  if (assigneeId && !assignee) {
    return NextResponse.json(
      { error: "Choose an active task assignee." },
      { status: 400 },
    );
  }

  const task = await prisma.task.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      dueDate,
      assigneeId,
      creatorId: user.id,
      contactId,
      companyId: opportunity?.companyId ?? null,
      metadata: {
        ...(parsed.data.metadata ?? {}),
        opportunityId: opportunity?.id ?? parsed.data.opportunityId ?? null,
        opportunityTitle: opportunity?.title ?? null,
      },
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, taskId: task.id });
}
