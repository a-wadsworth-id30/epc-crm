"use client";

import dynamic from "next/dynamic";
import type { TasksTableProps } from "@/components/crm-boilerplate/TasksTable";

function TasksTableLoading() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        {["Overdue", "Due today", "This week", "Unassigned"].map((item) => (
          <div
            key={item}
            className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <div className="h-3 w-20 rounded bg-gray-100 dark:bg-white/[0.08]">
              <span className="sr-only">{item}</span>
            </div>
            <div className="mt-3 h-7 w-12 rounded bg-gray-50 dark:bg-white/[0.05]" />
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <div className="inline-flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-800 dark:bg-white/[0.03]">
              <div className="h-9 w-24 rounded-md bg-white shadow-theme-xs dark:bg-gray-900" />
              <div className="h-9 w-20 rounded-md bg-gray-100 dark:bg-white/[0.05]" />
            </div>
            <div className="flex flex-wrap gap-2">
              {["Open", "Overdue", "Today", "Upcoming", "Completed"].map(
                (item) => (
                  <div
                    key={item}
                    className="h-9 w-24 rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.05]"
                  />
                ),
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {["Due from", "Due to"].map((item) => (
              <div key={item}>
                <div className="h-4 w-16 rounded bg-gray-100 dark:bg-white/[0.08]" />
                <div className="mt-2 h-11 w-40 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
          <div className="h-10 w-full max-w-sm rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
        </div>
        <div className="divide-y divide-gray-100 lg:hidden dark:divide-gray-800">
          {["one", "two", "three", "four"].map((item) => (
            <div key={item} className="space-y-3 px-5 py-4">
              <div className="border-l-4 border-gray-100 pl-3 dark:border-gray-800">
                <div className="h-4 w-44 max-w-full rounded bg-gray-100 dark:bg-white/[0.08]" />
                <div className="mt-2 h-3 w-48 max-w-full rounded bg-gray-50 dark:bg-white/[0.05]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="h-3 rounded bg-gray-50 dark:bg-white/[0.05]" />
                <div className="h-3 rounded bg-gray-50 dark:bg-white/[0.05]" />
                <div className="h-6 rounded-full bg-gray-50 dark:bg-white/[0.05]" />
                <div className="h-6 rounded-full bg-gray-50 dark:bg-white/[0.05]" />
              </div>
            </div>
          ))}
        </div>
        <div className="hidden max-w-full min-w-0 overflow-x-auto lg:block">
          <div className="min-w-[980px] divide-y divide-gray-100 dark:divide-gray-800">
            <div className="grid grid-cols-[1.6fr_1fr_0.8fr_0.8fr_0.8fr_0.9fr_0.6fr] gap-4 bg-gray-50 px-5 py-3 dark:bg-white/[0.02]">
              {[
                "Task",
                "Related",
                "Source",
                "Due",
                "Status",
                "Assignee",
                "Actions",
              ].map((item) => (
                <div
                  key={item}
                  className="h-3 w-20 rounded bg-gray-100 dark:bg-white/[0.08]"
                >
                  <span className="sr-only">{item}</span>
                </div>
              ))}
            </div>
            {["one", "two", "three", "four"].map((item) => (
              <div
                key={item}
                className="grid grid-cols-[1.6fr_1fr_0.8fr_0.8fr_0.8fr_0.9fr_0.6fr] gap-4 px-5 py-4"
              >
                <div className="border-l-4 border-gray-100 pl-3 dark:border-gray-800">
                  <div className="h-4 w-44 rounded bg-gray-100 dark:bg-white/[0.08]" />
                  <div className="mt-2 h-3 w-56 rounded bg-gray-50 dark:bg-white/[0.05]" />
                </div>
                <div className="h-4 w-36 rounded bg-gray-50 dark:bg-white/[0.05]" />
                <div className="h-6 w-20 rounded-full bg-gray-50 dark:bg-white/[0.05]" />
                <div className="h-4 w-20 rounded bg-gray-100 dark:bg-white/[0.08]" />
                <div className="h-6 w-20 rounded-full bg-gray-50 dark:bg-white/[0.05]" />
                <div className="h-4 w-28 rounded bg-gray-50 dark:bg-white/[0.05]" />
                <div className="ml-auto h-9 w-20 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

const TasksTable = dynamic<TasksTableProps>(
  () => import("@/components/crm-boilerplate/TasksTable"),
  {
    loading: TasksTableLoading,
    ssr: false,
  },
);

export default function LazyTasksTable(props: TasksTableProps) {
  return <TasksTable {...props} />;
}
