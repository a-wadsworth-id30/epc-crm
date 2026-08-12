"use client";

import dynamic from "next/dynamic";

function ContactSegmentBuilderLoading() {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 p-5 dark:border-gray-800">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <div>
              <div className="h-4 w-32 rounded bg-gray-100 dark:bg-white/[0.08]" />
              <div className="mt-2 h-24 rounded-xl bg-gray-50 dark:bg-white/[0.05]" />
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="h-9 w-56 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
              <div className="h-9 w-48 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
              <div className="h-9 w-40 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
            </div>
            <div className="h-10 w-32 rounded-lg bg-brand-100 dark:bg-brand-900/30" />
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.04]">
            <div className="h-3 w-28 rounded bg-gray-100 dark:bg-white/[0.08]" />
            <div className="mt-4 h-6 w-24 rounded bg-gray-100 dark:bg-white/[0.08]" />
            <div className="mt-3 h-16 rounded bg-gray-100 dark:bg-white/[0.08]" />
          </div>
        </div>
      </div>
    </section>
  );
}

const ContactSegmentBuilder = dynamic(
  () => import("@/components/crm-boilerplate/ContactSegmentBuilder"),
  {
    loading: ContactSegmentBuilderLoading,
    ssr: false,
  },
);

export default function LazyContactSegmentBuilder() {
  return <ContactSegmentBuilder />;
}
