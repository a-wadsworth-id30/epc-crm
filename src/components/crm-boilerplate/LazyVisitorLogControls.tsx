"use client";

import dynamic from "next/dynamic";
import type { VisitorLogControlsProps } from "@/components/crm-boilerplate/VisitorLogControls";

function VisitorLogControlsSkeleton() {
  return (
    <aside className="rounded-xl border border-gray-200 bg-white p-3 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="h-4 w-16 rounded bg-gray-100 dark:bg-white/[0.08]" />
          <div className="mt-2 h-3 w-28 rounded bg-gray-100 dark:bg-white/[0.08]" />
        </div>
        <div className="h-6 w-12 rounded-lg bg-gray-100 dark:bg-white/[0.08]" />
      </div>
      <div className="mt-4 h-9 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
      <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-1">
        <div className="h-9 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
        <div className="h-9 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
        <div className="h-9 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
        <div className="h-9 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
      </div>
      <div className="mt-4 space-y-1.5 border-t border-gray-100 pt-3 dark:border-gray-800">
        <div className="h-8 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
        <div className="h-8 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
        <div className="h-8 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
      </div>
    </aside>
  );
}

const LoadedVisitorLogControls = dynamic<VisitorLogControlsProps>(
  () => import("@/components/crm-boilerplate/VisitorLogControls"),
  { loading: VisitorLogControlsSkeleton, ssr: false },
);

export default function LazyVisitorLogControls(props: VisitorLogControlsProps) {
  return <LoadedVisitorLogControls {...props} />;
}
