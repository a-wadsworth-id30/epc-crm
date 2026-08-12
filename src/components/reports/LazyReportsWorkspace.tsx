"use client";

import dynamic from "next/dynamic";
import type { ReportsWorkspaceProps } from "@/components/reports/ReportsWorkspace";

function ReportsWorkspaceSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="h-4 w-28 rounded bg-gray-100 dark:bg-white/[0.08]" />
          <div className="mt-4 space-y-2">
            <div className="h-14 rounded-xl bg-gray-50 dark:bg-white/[0.05]" />
            <div className="h-14 rounded-xl bg-gray-50 dark:bg-white/[0.05]" />
            <div className="h-14 rounded-xl bg-gray-50 dark:bg-white/[0.05]" />
          </div>
        </section>
        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="h-4 w-24 rounded bg-gray-100 dark:bg-white/[0.08]" />
          <div className="mt-4 space-y-3">
            <div className="h-10 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
            <div className="h-10 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
            <div className="h-10 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
            <div className="h-24 rounded-xl bg-gray-50 dark:bg-white/[0.05]" />
          </div>
        </section>
      </aside>
      <main className="min-w-0 space-y-4">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="h-6 w-48 rounded bg-gray-100 dark:bg-white/[0.08]" />
          <div className="mt-3 h-4 w-3/4 rounded bg-gray-100 dark:bg-white/[0.08]" />
        </section>
        <div className="rounded-2xl border border-dashed border-gray-300 p-8 dark:border-gray-700">
          <div className="h-4 w-64 rounded bg-gray-100 dark:bg-white/[0.08]" />
        </div>
      </main>
    </div>
  );
}

const LoadedReportsWorkspace = dynamic<ReportsWorkspaceProps>(
  () => import("@/components/reports/ReportsWorkspace"),
  { loading: ReportsWorkspaceSkeleton, ssr: false },
);

export default function LazyReportsWorkspace(props: ReportsWorkspaceProps) {
  return <LoadedReportsWorkspace {...props} />;
}
