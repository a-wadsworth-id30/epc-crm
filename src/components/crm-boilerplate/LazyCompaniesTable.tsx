"use client";

import dynamic from "next/dynamic";
import type { CompaniesTableProps } from "@/components/crm-boilerplate/CompaniesTable";

function CompaniesTableLoading() {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 p-5 dark:border-gray-800">
        <div className="h-10 w-full max-w-sm rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
      </div>
      <div className="divide-y divide-gray-100 lg:hidden dark:divide-gray-800">
        {["one", "two", "three", "four"].map((item) => (
          <div key={item} className="space-y-3 px-5 py-4">
            <div>
              <div className="h-4 w-40 max-w-full rounded bg-gray-100 dark:bg-white/[0.08]" />
              <div className="mt-2 h-3 w-28 max-w-full rounded bg-gray-50 dark:bg-white/[0.05]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="h-3 rounded bg-gray-50 dark:bg-white/[0.05]" />
              <div className="h-3 rounded bg-gray-50 dark:bg-white/[0.05]" />
              <div className="h-3 rounded bg-gray-50 dark:bg-white/[0.05]" />
              <div className="h-3 rounded bg-gray-50 dark:bg-white/[0.05]" />
            </div>
            <div className="h-6 w-20 rounded-full bg-gray-50 dark:bg-white/[0.05]" />
          </div>
        ))}
      </div>
      <div className="hidden max-w-full min-w-0 overflow-x-auto lg:block">
        <div className="min-w-[980px] divide-y divide-gray-100 dark:divide-gray-800">
          <div className="grid grid-cols-[1.3fr_1fr_0.8fr_0.9fr_1fr_0.7fr_1.4fr_0.7fr] gap-4 bg-gray-50 px-5 py-3 dark:bg-white/[0.02]">
            {[
              "Company",
              "Domain",
              "Status",
              "Owner",
              "Location",
              "Contacts",
              "Activity",
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
              className="grid grid-cols-[1.3fr_1fr_0.8fr_0.9fr_1fr_0.7fr_1.4fr_0.7fr] gap-4 px-5 py-4"
            >
              <div>
                <div className="h-4 w-40 rounded bg-gray-100 dark:bg-white/[0.08]" />
                <div className="mt-2 h-3 w-28 rounded bg-gray-50 dark:bg-white/[0.05]" />
              </div>
              <div className="h-4 w-36 rounded bg-gray-50 dark:bg-white/[0.05]" />
              <div className="h-6 w-20 rounded-full bg-gray-50 dark:bg-white/[0.05]" />
              <div className="h-4 w-28 rounded bg-gray-50 dark:bg-white/[0.05]" />
              <div className="h-4 w-36 rounded bg-gray-50 dark:bg-white/[0.05]" />
              <div className="mx-auto h-4 w-6 rounded bg-gray-50 dark:bg-white/[0.05]" />
              <div className="h-4 w-44 rounded bg-gray-50 dark:bg-white/[0.05]" />
              <div className="ml-auto h-9 w-20 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const CompaniesTable = dynamic<CompaniesTableProps>(
  () => import("@/components/crm-boilerplate/CompaniesTable"),
  {
    loading: CompaniesTableLoading,
    ssr: false,
  },
);

export default function LazyCompaniesTable(props: CompaniesTableProps) {
  return <CompaniesTable {...props} />;
}
