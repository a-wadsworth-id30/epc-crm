"use client";

import dynamic from "next/dynamic";
import type { GeneralSettingsFormProps } from "@/components/crm-boilerplate/GeneralSettingsForm";

function GeneralSettingsFormLoading() {
  return (
    <div className="space-y-6">
      {[
        "Workspace defaults",
        "Interface defaults",
        "Display formatting",
        "Notification defaults",
        "Task defaults",
        "Sales defaults",
        "Module toggles",
      ].map((section, index) => (
        <section
          key={section}
          className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
        >
          <div className="border-b border-gray-200 p-5 dark:border-gray-800">
            <div className="h-5 w-44 rounded bg-gray-100 dark:bg-white/[0.08]">
              <span className="sr-only">{section}</span>
            </div>
            <div className="mt-3 h-4 w-full max-w-2xl rounded bg-gray-50 dark:bg-white/[0.05]" />
          </div>
          {index === 3 || index === 6 ? (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {["one", "two", "three", "four"].map((item) => (
                <div
                  key={item}
                  className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="h-4 w-40 rounded bg-gray-100 dark:bg-white/[0.08]" />
                    <div className="mt-2 h-3 w-full max-w-xl rounded bg-gray-50 dark:bg-white/[0.05]" />
                  </div>
                  <div className="h-6 w-20 rounded-full bg-gray-50 dark:bg-white/[0.05]" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-5 p-5 md:grid-cols-2">
              {["one", "two", "three", "four"].map((item) => (
                <div key={item}>
                  <div className="h-4 w-32 rounded bg-gray-100 dark:bg-white/[0.08]" />
                  <div className="mt-2 h-11 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
                  <div className="mt-2 h-3 w-56 max-w-full rounded bg-gray-50 dark:bg-white/[0.05]" />
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
      <div className="flex justify-end">
        <div className="h-11 w-28 rounded-lg bg-gray-100 dark:bg-white/[0.08]" />
      </div>
    </div>
  );
}

const GeneralSettingsForm = dynamic<GeneralSettingsFormProps>(
  () => import("@/components/crm-boilerplate/GeneralSettingsForm"),
  {
    loading: GeneralSettingsFormLoading,
    ssr: false,
  },
);

export default function LazyGeneralSettingsForm(
  props: GeneralSettingsFormProps,
) {
  return <GeneralSettingsForm {...props} />;
}
