"use client";

import dynamic from "next/dynamic";
import type { OfflineCampaignsPanelProps } from "@/components/crm-boilerplate/OfflineCampaignsPanel";

function OfflineCampaignsPanelSkeleton() {
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div className="h-5 w-32 rounded bg-gray-100 dark:bg-white/[0.08]" />
        </div>
        <div className="space-y-5 p-5">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="h-16 rounded-lg bg-gray-50 dark:bg-white/[0.04]" />
            <div className="h-16 rounded-lg bg-gray-50 dark:bg-white/[0.04]" />
            <div className="h-16 rounded-lg bg-gray-50 dark:bg-white/[0.04]" />
          </div>
          <div className="grid gap-4 lg:grid-cols-4">
            <div className="h-16 rounded-lg bg-gray-50 dark:bg-white/[0.04]" />
            <div className="h-16 rounded-lg bg-gray-50 dark:bg-white/[0.04]" />
            <div className="h-16 rounded-lg bg-gray-50 dark:bg-white/[0.04]" />
            <div className="h-16 rounded-lg bg-gray-50 dark:bg-white/[0.04]" />
          </div>
          <div className="h-24 rounded-lg bg-gray-50 dark:bg-white/[0.04]" />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div className="h-5 w-44 rounded bg-gray-100 dark:bg-white/[0.08]" />
        </div>
        <div className="space-y-3 p-5">
          <div className="h-16 rounded-xl bg-gray-50 dark:bg-white/[0.04]" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="h-12 rounded-xl bg-gray-50 dark:bg-white/[0.04]" />
            <div className="h-12 rounded-xl bg-gray-50 dark:bg-white/[0.04]" />
            <div className="h-12 rounded-xl bg-gray-50 dark:bg-white/[0.04]" />
            <div className="h-12 rounded-xl bg-gray-50 dark:bg-white/[0.04]" />
          </div>
        </div>
      </section>
    </div>
  );
}

const LoadedOfflineCampaignsPanel = dynamic<OfflineCampaignsPanelProps>(
  () => import("@/components/crm-boilerplate/OfflineCampaignsPanel"),
  { loading: OfflineCampaignsPanelSkeleton, ssr: false },
);

export default function LazyOfflineCampaignsPanel(
  props: OfflineCampaignsPanelProps,
) {
  return <LoadedOfflineCampaignsPanel {...props} />;
}
