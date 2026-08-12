import type { Prisma } from "@prisma/client";
import LazyTasksTable from "@/components/crm-boilerplate/LazyTasksTable";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import type {
  TaskScope,
  TaskTableRow,
  TaskView,
} from "@/components/crm-boilerplate/TasksTable";
import { requireUser } from "@/lib/auth";
import {
  parseInterfaceDefaults,
  resolveInterfacePageSizeFallback,
} from "@/lib/interface-defaults";
import {
  parsePageSize,
  parsePositiveInteger,
} from "@/lib/navigation/pagination";
import { prisma } from "@/lib/prisma";
import { getCrmSettings } from "@/lib/settings";

type TasksPageProps = {
  searchParams?: Promise<{
    from?: string | string[];
    page?: string | string[];
    pageSize?: string | string[];
    q?: string | string[];
    scope?: string | string[];
    to?: string | string[];
    view?: string | string[];
  }>;
};

const taskPageSizes = [10, 25, 50, 100];
const defaultTaskPageSize = 25;
const validScopes = new Set<TaskScope>(["mine", "all"]);
const validViews = new Set<TaskView>([
  "open",
  "overdue",
  "today",
  "upcoming",
  "completed",
]);

const taskListSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  dueDate: true,
  contactId: true,
  metadata: true,
  company: { select: { name: true } },
  contact: { select: { firstName: true, lastName: true } },
  assignee: { select: { name: true } },
} satisfies Prisma.TaskSelect;

function paramValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function dateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDateInput(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function startOfUtcDay(date = new Date()) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function taskMetadata(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function stringMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function taskSource(metadata: Record<string, unknown>) {
  return (
    stringMetadata(metadata, "type") ??
    stringMetadata(metadata, "source") ??
    stringMetadata(metadata, "trigger") ??
    "Manual"
  );
}

function contactName(contact: { firstName: string; lastName: string } | null) {
  if (!contact) return null;
  return `${contact.firstName} ${contact.lastName}`;
}

function taskUrgency(status: string, dueDate: Date | null, today: Date) {
  if (status === "DONE") return "complete";
  if (!dueDate) return "none";

  const tomorrow = addDays(today, 1);
  if (dueDate < today) return "overdue";
  if (dueDate < tomorrow) return "today";
  return "upcoming";
}

function dueDateFilter(from: Date | null, to: Date | null): Prisma.DateTimeNullableFilter {
  return {
    ...(from ? { gte: from } : {}),
    ...(to ? { lt: addDays(to, 1) } : {}),
  };
}

export default async function TasksPage({ searchParams }: TasksPageProps) {
  const [user, settings] = await Promise.all([requireUser(), getCrmSettings()]);
  const params = (await searchParams) ?? {};
  const interfaceDefaults = parseInterfaceDefaults(settings.interfaceDefaults);
  const requestedPage = parsePositiveInteger(params.page, 1);
  const pageSize = parsePageSize({
    fallback: resolveInterfacePageSizeFallback(
      interfaceDefaults,
      taskPageSizes,
      defaultTaskPageSize,
    ),
    options: taskPageSizes,
    value: params.pageSize,
  });
  const query = paramValue(params.q)?.trim() ?? "";
  const requestedScope = paramValue(params.scope) as TaskScope | undefined;
  const requestedView = paramValue(params.view) as TaskView | undefined;
  const scope = requestedScope && validScopes.has(requestedScope) ? requestedScope : "mine";
  const view = requestedView && validViews.has(requestedView) ? requestedView : "open";
  const today = startOfUtcDay();
  const defaultTo = addDays(today, 14);
  const dateFromInput = paramValue(params.from) ?? "";
  const dateToInput = paramValue(params.to) ?? dateInputValue(defaultTo);
  const dateFrom = parseDateInput(dateFromInput);
  const dateTo = parseDateInput(dateToInput) ?? defaultTo;
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 7);

  const scopeWhere: Prisma.TaskWhereInput =
    scope === "mine" ? { assigneeId: user.id } : {};
  const where: Prisma.TaskWhereInput = { ...scopeWhere };
  const andFilters: Prisma.TaskWhereInput[] = [];

  if (query) {
    andFilters.push({
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
        { company: { name: { contains: query, mode: "insensitive" } } },
        { contact: { firstName: { contains: query, mode: "insensitive" } } },
        { contact: { lastName: { contains: query, mode: "insensitive" } } },
        { assignee: { name: { contains: query, mode: "insensitive" } } },
      ],
    });
  }

  if (view === "completed") {
    andFilters.push({ status: "DONE", dueDate: dueDateFilter(dateFrom, dateTo) });
  } else {
    if (view === "overdue") {
      andFilters.push({ status: { not: "DONE" }, dueDate: { lt: today } });
    } else if (view === "today") {
      andFilters.push({
        status: { not: "DONE" },
        dueDate: { gte: today, lt: tomorrow },
      });
    } else if (view === "upcoming") {
      andFilters.push({
        status: { not: "DONE" },
        dueDate: {
          gte: dateFrom && dateFrom > tomorrow ? dateFrom : tomorrow,
          lt: addDays(dateTo, 1),
        },
      });
    } else {
      andFilters.push({
        status: { not: "DONE" },
        ...(dateFrom
          ? { dueDate: dueDateFilter(dateFrom, dateTo) }
          : {
              OR: [
                { dueDate: null },
                { dueDate: dueDateFilter(null, dateTo) },
              ],
            }),
      });
    }
  }

  if (andFilters.length) {
    where.AND = andFilters;
  }

  const [totalCount, summary] = await Promise.all([
    prisma.task.count({ where }),
    Promise.all([
      prisma.task.count({
        where: { ...scopeWhere, status: { not: "DONE" }, dueDate: { lt: today } },
      }),
      prisma.task.count({
        where: {
          ...scopeWhere,
          status: { not: "DONE" },
          dueDate: { gte: today, lt: tomorrow },
        },
      }),
      prisma.task.count({
        where: {
          ...scopeWhere,
          status: { not: "DONE" },
          dueDate: { gte: today, lt: weekEnd },
        },
      }),
      prisma.task.count({
        where: { status: { not: "DONE" }, assigneeId: null },
      }),
    ]),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const tasks = await prisma.task.findMany({
    where,
    orderBy:
      view === "completed"
        ? [{ updatedAt: "desc" }]
        : [{ dueDate: "asc" }, { createdAt: "asc" }],
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
    select: taskListSelect,
  });

  const rows: TaskTableRow[] = tasks.map((task) => {
    const metadata = taskMetadata(task.metadata);
    const opportunityId = stringMetadata(metadata, "opportunityId");
    const name = contactName(task.contact);
    const relatedHref = task.contactId
      ? `/contacts/${task.contactId}`
      : opportunityId
        ? `/sales/${opportunityId}`
        : null;
    const relatedLabel =
      name ??
      task.company?.name ??
      (opportunityId ? "Sales opportunity" : "No linked record");

    return {
      assigneeName: task.assignee?.name ?? null,
      companyName: task.company?.name ?? null,
      contactId: task.contactId,
      contactName: name,
      description: task.description,
      dueDate: task.dueDate?.toISOString() ?? null,
      id: task.id,
      relatedHref,
      relatedLabel,
      source: taskSource(metadata),
      status: task.status,
      title: task.title,
      urgency: taskUrgency(task.status, task.dueDate, today),
    };
  });

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Follow-up work ordered by due date and urgency."
      />
      <LazyTasksTable
        dateFrom={dateFromInput}
        dateTo={dateToInput}
        page={currentPage}
        pageSize={pageSize}
        pageSizeOptions={taskPageSizes}
        query={query}
        scope={scope}
        summary={{
          overdue: summary[0],
          today: summary[1],
          thisWeek: summary[2],
          unassigned: summary[3],
        }}
        tasks={rows}
        totalCount={totalCount}
        view={view}
      />
    </>
  );
}
