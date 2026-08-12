"use client";

import dynamic from "next/dynamic";
import type { DesktopSoftphoneSettingsPanelProps } from "@/components/crm-boilerplate/DesktopSoftphoneSettingsPanel";

function DesktopSoftphoneSettingsLoading() {
  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="h-4 w-44 rounded bg-gray-100 dark:bg-white/[0.08]">
                  <span className="sr-only">Recommended download</span>
                </div>
                <div className="mt-3 h-7 w-full max-w-xl rounded bg-gray-100 dark:bg-white/[0.08]" />
                <div className="mt-3 h-4 w-full max-w-2xl rounded bg-gray-50 dark:bg-white/[0.05]" />
              </div>
              <div className="h-8 w-32 rounded-full bg-success-50 dark:bg-success-900/20" />
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="h-11 w-52 rounded-lg bg-gray-100 dark:bg-white/[0.08]" />
              <div className="h-4 w-40 rounded bg-gray-50 dark:bg-white/[0.05]" />
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {["phone", "links", "updates"].map((item) => (
                <div
                  key={item}
                  className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]"
                >
                  <div className="h-4 w-28 rounded bg-gray-100 dark:bg-white/[0.08]" />
                  <div className="mt-2 h-3 w-full rounded bg-white dark:bg-white/[0.05]" />
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-white/[0.02] lg:border-l lg:border-t-0">
            <div className="h-4 w-32 rounded bg-gray-100 dark:bg-white/[0.08]" />
            <div className="mt-4 grid gap-3">
              {["mac", "windows"].map((item) => (
                <div
                  key={item}
                  className="h-20 rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="grid gap-4 md:grid-cols-3">
          {["download", "install", "sign in"].map((item) => (
            <div key={item} className="flex gap-3">
              <div className="h-8 w-8 shrink-0 rounded-full bg-gray-100 dark:bg-white/[0.08]" />
              <div className="min-w-0 flex-1">
                <div className="h-4 w-28 rounded bg-gray-100 dark:bg-white/[0.08]" />
                <div className="mt-2 h-3 w-full rounded bg-gray-50 dark:bg-white/[0.05]" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const DesktopSoftphoneSettingsPanel =
  dynamic<DesktopSoftphoneSettingsPanelProps>(
    () => import("@/components/crm-boilerplate/DesktopSoftphoneSettingsPanel"),
    {
      loading: DesktopSoftphoneSettingsLoading,
      ssr: false,
    },
  );

export default function LazyDesktopSoftphoneSettingsPanel(
  props: DesktopSoftphoneSettingsPanelProps,
) {
  return <DesktopSoftphoneSettingsPanel {...props} />;
}
