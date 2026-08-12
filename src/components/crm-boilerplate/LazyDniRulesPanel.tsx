"use client";

import dynamic from "next/dynamic";
import type { DniRulesPanelProps } from "@/components/crm-boilerplate/DniRulesPanel";

function DniRulesPanelSkeleton() {
  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {["Active rules", "Default rules", "Pool routes", "Fallback numbers"].map(
          (label) => (
            <div
              key={label}
              className="rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {label}
              </p>
              <div className="mt-3 h-8 w-16 rounded bg-gray-100 dark:bg-white/[0.08]" />
              <div className="mt-2 h-4 w-28 rounded bg-gray-100 dark:bg-white/[0.08]" />
            </div>
          ),
        )}
      </section>
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="h-4 w-36 rounded bg-gray-100 dark:bg-white/[0.08]" />
        <div className="mt-3 h-5 w-48 rounded bg-gray-100 dark:bg-white/[0.08]" />
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="h-10 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
          <div className="h-10 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
          <div className="h-10 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
        </div>
      </section>
    </div>
  );
}

const LoadedDniRulesPanel = dynamic<DniRulesPanelProps>(
  () => import("@/components/crm-boilerplate/DniRulesPanel"),
  { loading: DniRulesPanelSkeleton, ssr: false },
);

export default function LazyDniRulesPanel(props: DniRulesPanelProps) {
  return <LoadedDniRulesPanel {...props} />;
}
