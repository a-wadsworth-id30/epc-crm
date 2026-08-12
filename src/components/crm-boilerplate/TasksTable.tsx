"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  CrmDataTable,
  type CrmDataTableAction,
  type CrmDataTableColumn,
} from "@/components/crm-boilerplate/data-table";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import { completeTask } from "@/lib/actions/tasks";
import { CheckCircleIcon, EyeIcon } from "@/icons";
import { cn } from "@/utils";

export type TaskScope = "mine" | "all";
export type TaskView = "open" | "overdue" | "today" | "upcoming" | "completed";

export type TaskTableRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  assigneeName: string | null;
  companyName: string | null;
  contactId: string | null;
  contactName: string | null;
  source: string;
  relatedHref: string | null;
  relatedLabel: string;
  urgency: "overdue" | "today" | "upcoming" | "none" | "complete";
};

export type TaskSummary = {
  overdue: number;
  today: number;
  thisWeek: number;
  unassigned: number;
};

export type TasksTableProps = {
  dateFrom: string;
  dateTo: string;
  page: number;
  pageSize: number;
  pageSizeOptions: number[];
  query: string;
  scope: TaskScope;
  summary: TaskSummary;
  tasks: TaskTableRow[];
  totalCount: number;
  view: TaskView;
};

const scopeOptions: { label: string; value: TaskScope }[] = [
  { label: "My tasks", value: "mine" },
  { label: "All tasks", value: "all" },
];

const viewOptions: { label: string; value: TaskView }[] = [
  { label: "Open", value: "open" },
  { label: "Overdue", value: "overdue" },
  { label: "Today", value: "today" },
  { label: "Upcoming", value: "upcoming" },
  { label: "Completed", value: "completed" },
];

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatDueDate(value: string | null) {
  if (!value) return "No due date";
  return dateFormatter.format(new Date(value));
}

function statusLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function urgencyClasses(urgency: TaskTableRow["urgency"]) {
  if (urgency === "overdue") {
    return "bg-error-50/70 dark:bg-error-900/10";
  }

  if (urgency === "today") {
    return "bg-warning-50/70 dark:bg-warning-900/10";
  }

  if (urgency === "complete") {
    return "opacity-70";
  }

  return "";
}

function dueDateClasses(urgency: TaskTableRow["urgency"]) {
  if (urgency === "overdue") return "text-error-700 dark:text-error-300";
  if (urgency === "today") return "text-warning-700 dark:text-warning-300";
  return "text-gray-700 dark:text-gray-300";
}

function sourceLabel(value: string) {
  return value
    .replace(/[-_]/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function TasksTable({
  dateFrom,
  dateTo,
  page,
  pageSize,
  pageSizeOptions,
  query,
  scope,
  summary,
  tasks,
  totalCount,
  view,
}: TasksTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [localQuery, setLocalQuery] = useState(query);
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(updates).forEach(([key, value]) => {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      });

      const nextUrl = params.toString() ? `${pathname}?${params}` : pathname;
      router.push(nextUrl);
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    setLocalQuery(query);
  }, [query]);

  useEffect(() => {
    if (localQuery === query) return;

    const timer = window.setTimeout(() => {
      updateParams({ page: null, q: localQuery.trim() || null });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [localQuery, query, updateParams]);

  const columns = useMemo<CrmDataTableColumn<TaskTableRow>[]>(
    () => [
      {
        id: "task",
        header: "Task",
        width: "34%",
        cell: (task) => (
          <div
            className={cn(
              "border-l-4 pl-3",
              task.urgency === "overdue" && "border-error-500",
              task.urgency === "today" && "border-warning-500",
              task.urgency !== "overdue" &&
                task.urgency !== "today" &&
                "border-transparent",
            )}
          >
            <p className="font-semibold text-gray-800 dark:text-white/90">
              {task.title}
            </p>
            {task.description ? (
              <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                {task.description}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: "related",
        header: "Related record",
        cell: (task) =>
          task.relatedHref ? (
            <Link
              href={task.relatedHref}
              className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
            >
              {task.relatedLabel}
            </Link>
          ) : (
            <span className="text-gray-500 dark:text-gray-400">
              {task.relatedLabel}
            </span>
          ),
      },
      {
        id: "source",
        header: "Source",
        cell: (task) => (
          <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-white/10 dark:text-gray-300">
            {sourceLabel(task.source)}
          </span>
        ),
      },
      {
        id: "due",
        header: "Due",
        cell: (task) => (
          <span className={cn("font-semibold", dueDateClasses(task.urgency))}>
            {formatDueDate(task.dueDate)}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: (task) => (
          <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-white/10 dark:text-gray-300">
            {statusLabel(task.status)}
          </span>
        ),
      },
      {
        id: "assignee",
        header: "Assignee",
        cell: (task) => task.assigneeName ?? "Unassigned",
      },
    ],
    [],
  );

  function taskActions(task: TaskTableRow): CrmDataTableAction<TaskTableRow>[] {
    return [
      {
        id: "complete",
        label: "Complete task",
        icon: CheckCircleIcon,
        hidden: () => task.status === "DONE",
        disabled: () => isPending,
        onSelect: () => {
          startTransition(async () => {
            try {
              await completeTask(task.id);
              showToast("Task completed.");
              router.refresh();
            } catch {
              showToast("Could not complete that task.", "error");
            }
          });
        },
      },
      {
        id: "open",
        label: "Open related record",
        icon: EyeIcon,
        href: () => task.relatedHref ?? "/tasks",
        disabled: () => !task.relatedHref,
      },
    ];
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <TaskMetric label="Overdue" tone="error" value={summary.overdue} />
        <TaskMetric label="Due today" tone="warning" value={summary.today} />
        <TaskMetric label="This week" tone="brand" value={summary.thisWeek} />
        <TaskMetric label="Unassigned" tone="neutral" value={summary.unassigned} />
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-800 dark:bg-white/[0.03]">
              {scopeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    updateParams({
                      page: null,
                      scope: option.value === "mine" ? null : option.value,
                    })
                  }
                  className={cn(
                    "h-9 rounded-md px-4 text-sm font-medium transition",
                    scope === option.value
                      ? "bg-white text-gray-900 shadow-theme-xs dark:bg-gray-900 dark:text-white"
                      : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {viewOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    updateParams({
                      page: null,
                      view: option.value === "open" ? null : option.value,
                    })
                  }
                  className={cn(
                    "inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium transition",
                    view === option.value
                      ? "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-900/40 dark:bg-brand-900/20 dark:text-brand-300"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/5",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Due from
              <input
                type="date"
                value={dateFrom}
                onChange={(event) =>
                  updateParams({ from: event.target.value || null, page: null })
                }
                className="mt-2 h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-700 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
              />
            </label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Due to
              <input
                type="date"
                value={dateTo}
                onChange={(event) =>
                  updateParams({ to: event.target.value || null, page: null })
                }
                className="mt-2 h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-700 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
              />
            </label>
          </div>
        </div>
      </section>

      <CrmDataTable
        data={tasks}
        columns={columns}
        getRowId={(task) => task.id}
        searchPlaceholder="Search tasks..."
        query={localQuery}
        onQueryChange={setLocalQuery}
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        onPageChange={(nextPage) =>
          updateParams({ page: nextPage > 1 ? String(nextPage) : null })
        }
        onPageSizeChange={(nextPageSize) =>
          updateParams({ page: null, pageSize: String(nextPageSize) })
        }
        pageSizeOptions={pageSizeOptions}
        manualFiltering
        manualPagination
        manualSorting
        emptyState="No tasks match the current view."
        getRowClassName={(task) => urgencyClasses(task.urgency)}
        rowActions={taskActions}
      />
    </div>
  );
}

function TaskMetric({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "brand" | "error" | "neutral" | "warning";
  value: number;
}) {
  const toneClasses = {
    brand: "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300",
    error: "bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300",
    neutral: "bg-gray-50 text-gray-700 dark:bg-white/5 dark:text-gray-300",
    warning:
      "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300",
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-gray-200 px-4 py-3 shadow-theme-xs dark:border-gray-800",
        toneClasses[tone],
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
