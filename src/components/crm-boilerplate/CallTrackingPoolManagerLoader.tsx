"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type CallTrackingPoolManagerComponent from "@/components/crm-boilerplate/CallTrackingPoolManager";

type CallTrackingPoolManagerProps = ComponentProps<typeof CallTrackingPoolManagerComponent>;

const CallTrackingPoolManager = dynamic<CallTrackingPoolManagerProps>(
  () => import("@/components/crm-boilerplate/CallTrackingPoolManager"),
  {
    ssr: false,
    loading: () => <CallTrackingPoolManagerSkeleton />,
  },
);

export default function CallTrackingPoolManagerLoader(
  props: CallTrackingPoolManagerProps,
) {
  return <CallTrackingPoolManager {...props} />;
}

function CallTrackingPoolManagerSkeleton() {
  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 p-5 dark:border-gray-800">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="h-3 w-44 rounded-full bg-brand-50 dark:bg-brand-500/10" />
            <div className="h-6 w-72 max-w-full rounded-full bg-gray-100 dark:bg-white/[0.06]" />
            <div className="h-4 w-full max-w-2xl rounded-full bg-gray-100 dark:bg-white/[0.06]" />
          </div>
          <div className="grid min-w-72 grid-cols-2 gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="h-12 rounded-lg bg-white dark:bg-gray-900" />
            <div className="h-12 rounded-lg bg-white dark:bg-gray-900" />
            <div className="h-12 rounded-lg bg-white dark:bg-gray-900" />
            <div className="h-12 rounded-lg bg-white dark:bg-gray-900" />
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="h-16 rounded-xl bg-gray-50 dark:bg-white/[0.04]" />
          <div className="h-16 rounded-xl bg-gray-50 dark:bg-white/[0.04]" />
          <div className="h-16 rounded-xl bg-gray-50 dark:bg-white/[0.04]" />
          <div className="h-16 rounded-xl bg-gray-50 dark:bg-white/[0.04]" />
        </div>
      </div>
      <div className="grid gap-6 p-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-3">
          <div className="h-24 rounded-xl bg-gray-50 dark:bg-white/[0.04]" />
          <div className="h-24 rounded-xl bg-gray-50 dark:bg-white/[0.04]" />
        </div>
        <div className="space-y-3">
          <div className="h-28 rounded-xl bg-gray-50 dark:bg-white/[0.04]" />
          <div className="h-28 rounded-xl bg-gray-50 dark:bg-white/[0.04]" />
        </div>
      </div>
    </section>
  );
}
