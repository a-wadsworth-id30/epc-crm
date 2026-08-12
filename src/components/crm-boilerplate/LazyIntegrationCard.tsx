"use client";

import dynamic from "next/dynamic";
import type { IntegrationCardProps } from "@/components/crm-boilerplate/IntegrationCard";

function IntegrationCardSkeleton() {
  return (
    <article className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
      <div className="p-5 pb-9">
        <div className="mb-5 h-10 w-10 rounded-lg bg-gray-100 dark:bg-white/[0.08]" />
        <div className="mb-3 flex items-start justify-between gap-4">
          <div className="h-6 w-28 rounded bg-gray-100 dark:bg-white/[0.08]" />
          <div className="h-6 w-20 rounded-full bg-gray-100 dark:bg-white/[0.08]" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-full max-w-xs rounded bg-gray-100 dark:bg-white/[0.08]" />
          <div className="h-4 w-3/4 max-w-xs rounded bg-gray-100 dark:bg-white/[0.08]" />
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-gray-200 p-5 dark:border-gray-800">
        <div className="h-11 w-11 rounded-lg bg-gray-100 dark:bg-white/[0.08]" />
        <div className="h-6 w-24 rounded-full bg-gray-100 dark:bg-white/[0.08]" />
      </div>
    </article>
  );
}

const LoadedIntegrationCard = dynamic<IntegrationCardProps>(
  () => import("@/components/crm-boilerplate/IntegrationCard"),
  { loading: IntegrationCardSkeleton, ssr: false },
);

export default function LazyIntegrationCard(props: IntegrationCardProps) {
  return <LoadedIntegrationCard {...props} />;
}
