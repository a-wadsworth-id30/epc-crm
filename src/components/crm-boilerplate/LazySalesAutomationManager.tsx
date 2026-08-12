"use client";

import dynamic from "next/dynamic";
import type { SalesAutomationManagerProps } from "@/components/crm-boilerplate/SalesAutomationManager";

function SalesAutomationManagerLoading() {
  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <div>
          <div className="h-5 w-52 rounded bg-gray-100 dark:bg-white/[0.08]" />
          <div className="mt-3 h-4 w-96 max-w-full rounded bg-gray-50 dark:bg-white/[0.05]" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {["runs", "failures", "approvals", "stage-moves"].map((item) => (
            <div
              key={item}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <div className="h-3 w-20 rounded bg-gray-100 dark:bg-white/[0.08]" />
              <div className="mt-3 h-7 w-16 rounded bg-gray-50 dark:bg-white/[0.05]" />
              <div className="mt-2 h-4 w-full max-w-40 rounded bg-gray-50 dark:bg-white/[0.05]" />
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="h-5 w-48 rounded bg-gray-100 dark:bg-white/[0.08]" />
        <div className="mt-4 space-y-3">
          <div className="h-11 rounded-xl bg-gray-50 dark:bg-white/[0.05]" />
          <div className="h-11 rounded-xl bg-gray-50 dark:bg-white/[0.05]" />
          <div className="h-11 rounded-xl bg-gray-50 dark:bg-white/[0.05]" />
        </div>
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <div className="h-52 rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]" />
        <div className="h-52 rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]" />
      </section>
    </div>
  );
}

const SalesAutomationManager = dynamic<SalesAutomationManagerProps>(
  () => import("@/components/crm-boilerplate/SalesAutomationManager"),
  {
    loading: SalesAutomationManagerLoading,
    ssr: false,
  },
);

export default function LazySalesAutomationManager(
  props: SalesAutomationManagerProps,
) {
  return <SalesAutomationManager {...props} />;
}
