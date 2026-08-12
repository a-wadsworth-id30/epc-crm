"use client";

import dynamic from "next/dynamic";
import type { CrmAIContextFormProps } from "@/components/crm-boilerplate/CrmAIContextForm";

function CrmAIContextFormLoading() {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div className="h-4 w-24 rounded-full bg-gray-100 dark:bg-white/[0.08]">
            <span className="sr-only">AI context</span>
          </div>
          <div className="mt-4 h-5 w-48 rounded bg-gray-100 dark:bg-white/[0.08]" />
          <div className="mt-3 h-4 w-full max-w-2xl rounded bg-gray-50 dark:bg-white/[0.05]" />
        </div>

        <div className="space-y-5 p-5">
          <div className="grid gap-4 lg:grid-cols-2">
            {[
              "profile",
              "services",
              "customers",
              "value",
              "proof",
              "competitors",
              "objections",
              "compliance",
            ].map((item) => (
              <div key={item}>
                <div className="h-4 w-36 rounded bg-gray-100 dark:bg-white/[0.08]" />
                <div className="mt-2 h-28 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
              </div>
            ))}
          </div>

          <section className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="grid gap-4 lg:grid-cols-2">
              {["tone", "custom tone"].map((item) => (
                <div key={item}>
                  <div className="h-4 w-36 rounded bg-gray-100 dark:bg-white/[0.08]" />
                  <div className="mt-2 h-10 rounded-lg bg-white dark:bg-white/[0.05]" />
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {["use", "avoid"].map((item) => (
                <div key={item}>
                  <div className="h-4 w-32 rounded bg-gray-100 dark:bg-white/[0.08]" />
                  <div className="mt-2 h-28 rounded-lg bg-white dark:bg-white/[0.05]" />
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="flex justify-end border-t border-gray-200 px-5 py-4 dark:border-gray-800">
          <div className="h-11 w-32 rounded-lg bg-gray-100 dark:bg-white/[0.08]" />
        </div>
      </section>

      <aside className="space-y-4">
        {["How AI Uses This", "Conversion Learning"].map((title) => (
          <section
            key={title}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <div className="h-4 w-36 rounded bg-gray-100 dark:bg-white/[0.08]">
              <span className="sr-only">{title}</span>
            </div>
            <div className="mt-4 space-y-3">
              <div className="h-3 w-full rounded bg-gray-50 dark:bg-white/[0.05]" />
              <div className="h-3 w-5/6 rounded bg-gray-50 dark:bg-white/[0.05]" />
              <div className="h-3 w-4/5 rounded bg-gray-50 dark:bg-white/[0.05]" />
            </div>
          </section>
        ))}
      </aside>
    </div>
  );
}

const CrmAIContextForm = dynamic<CrmAIContextFormProps>(
  () => import("@/components/crm-boilerplate/CrmAIContextForm"),
  {
    loading: CrmAIContextFormLoading,
    ssr: false,
  },
);

export default function LazyCrmAIContextForm(
  props: CrmAIContextFormProps,
) {
  return <CrmAIContextForm {...props} />;
}
