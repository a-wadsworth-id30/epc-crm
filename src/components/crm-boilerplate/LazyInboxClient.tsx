"use client";

import dynamic from "next/dynamic";
import type { InboxClientProps } from "@/components/crm-boilerplate/InboxClient";

function InboxClientLoading() {
  return (
    <>
      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-3 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="grid gap-2 text-xs sm:grid-cols-5">
          {["All", "Unread", "Matched", "Unmatched", "Archived"].map((item) => (
            <div
              key={item}
              className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.04]"
            >
              <span className="h-3 w-16 rounded bg-gray-100 dark:bg-white/[0.08]">
                <span className="sr-only">{item}</span>
              </span>
              <span className="h-3 w-6 rounded bg-gray-100 dark:bg-white/[0.08]" />
            </div>
          ))}
        </div>
      </div>

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="grid min-h-[680px] lg:grid-cols-[380px_1fr]">
          <aside className="flex min-h-0 flex-col border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.02] lg:border-r lg:border-b-0">
            <div className="border-b border-gray-200 p-4 dark:border-gray-800">
              <div className="h-10 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
            </div>
            <div className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">
              {["one", "two", "three", "four", "five"].map((item) => (
                <div key={item} className="px-4 py-4">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 shrink-0 rounded-full bg-brand-50 dark:bg-brand-500/10" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="h-4 w-36 rounded bg-gray-100 dark:bg-white/[0.08]" />
                        <div className="h-3 w-12 rounded bg-gray-50 dark:bg-white/[0.05]" />
                      </div>
                      <div className="mt-2 h-3 w-48 rounded bg-gray-50 dark:bg-white/[0.05]" />
                      <div className="mt-3 h-4 w-44 rounded bg-gray-100 dark:bg-white/[0.08]" />
                      <div className="mt-2 h-3 w-full rounded bg-gray-50 dark:bg-white/[0.05]" />
                      <div className="mt-2 h-3 w-3/4 rounded bg-gray-50 dark:bg-white/[0.05]" />
                      <div className="mt-3 flex gap-2">
                        <div className="h-6 w-24 rounded-full bg-gray-50 dark:bg-white/[0.05]" />
                        <div className="h-6 w-16 rounded-full bg-gray-50 dark:bg-white/[0.05]" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 dark:border-gray-800">
              <div className="h-8 w-24 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
              <div className="flex items-center gap-2">
                <div className="h-8 w-14 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
                <div className="h-3 w-8 rounded bg-gray-100 dark:bg-white/[0.08]" />
                <div className="h-8 w-14 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
              </div>
            </div>
          </aside>

          <main className="min-w-0 bg-gray-50 dark:bg-black/10">
            <div className="flex min-h-full flex-col">
              <div className="border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-white/[0.02]">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="mb-2 flex gap-2">
                      <div className="h-6 w-24 rounded-full bg-gray-50 dark:bg-white/[0.05]" />
                      <div className="h-6 w-20 rounded-full bg-gray-50 dark:bg-white/[0.05]" />
                    </div>
                    <div className="h-6 w-72 max-w-full rounded bg-gray-100 dark:bg-white/[0.08]" />
                    <div className="mt-3 h-4 w-48 rounded bg-gray-50 dark:bg-white/[0.05]" />
                  </div>
                  <div className="flex gap-2">
                    <div className="h-9 w-9 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
                    <div className="h-9 w-9 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
                  </div>
                </div>
              </div>
              <div className="flex-1 p-4 sm:p-6">
                <div className="rounded-xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
                  <div className="flex items-start gap-4 border-b border-gray-100 px-5 py-5 dark:border-gray-800">
                    <div className="h-11 w-11 shrink-0 rounded-full bg-brand-50 dark:bg-brand-500/10" />
                    <div className="min-w-0 flex-1">
                      <div className="h-4 w-40 rounded bg-gray-100 dark:bg-white/[0.08]" />
                      <div className="mt-2 h-3 w-56 rounded bg-gray-50 dark:bg-white/[0.05]" />
                      <div className="mt-2 h-3 w-44 rounded bg-gray-50 dark:bg-white/[0.05]" />
                    </div>
                  </div>
                  <div className="space-y-4 px-5 py-6">
                    <div className="h-3 w-full rounded bg-gray-50 dark:bg-white/[0.05]" />
                    <div className="h-3 w-11/12 rounded bg-gray-50 dark:bg-white/[0.05]" />
                    <div className="h-3 w-4/5 rounded bg-gray-50 dark:bg-white/[0.05]" />
                    <div className="h-3 w-10/12 rounded bg-gray-50 dark:bg-white/[0.05]" />
                  </div>
                  <div className="flex gap-2 border-t border-gray-100 px-5 py-4 dark:border-gray-800">
                    <div className="h-10 w-24 rounded-lg bg-gray-100 dark:bg-white/[0.08]" />
                    <div className="h-10 w-20 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </section>
    </>
  );
}

const InboxClient = dynamic<InboxClientProps>(
  () => import("@/components/crm-boilerplate/InboxClient"),
  {
    loading: InboxClientLoading,
    ssr: false,
  },
);

export default function LazyInboxClient(props: InboxClientProps) {
  return <InboxClient {...props} />;
}
