"use client";

import dynamic from "next/dynamic";
import type { ContactConversationWorkspaceProps } from "@/components/crm-boilerplate/ContactConversationWorkspace";

function ContactConversationWorkspaceSkeleton() {
  return (
    <div className="min-w-0 space-y-4">
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="grid gap-0 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          {["email", "phone", "relationship", "leads", "documents"].map(
            (item) => (
              <div
                key={item}
                className="min-w-0 border-b border-gray-100 px-4 py-4 sm:border-r 2xl:border-b-0 dark:border-gray-800"
              >
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-gray-50 dark:bg-white/[0.04]" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-3 w-20 rounded bg-gray-100 dark:bg-white/[0.08]" />
                    <div className="h-4 w-28 rounded bg-gray-50 dark:bg-white/[0.05]" />
                  </div>
                </div>
              </div>
            ),
          )}
        </div>
      </section>

      <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_360px] 3xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="grid min-w-0 lg:grid-cols-[184px_minmax(0,1fr)]">
            <div className="flex min-w-0 overflow-x-auto border-b border-gray-200 bg-gray-50/80 p-1.5 lg:block lg:overflow-visible lg:border-r lg:border-b-0 lg:p-0 dark:border-gray-800 dark:bg-white/[0.02]">
              {[
                "conversation",
                "profile",
                "relationship",
                "leads",
                "documents",
              ].map((item) => (
                <div
                  key={item}
                  className="flex min-w-[148px] items-center gap-3 px-3 py-3 lg:min-w-0 lg:border-b lg:border-gray-200 dark:lg:border-gray-800"
                >
                  <div className="h-9 w-9 rounded-lg bg-gray-100 dark:bg-white/[0.08]" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-3.5 w-24 rounded bg-gray-100 dark:bg-white/[0.08]" />
                    <div className="hidden h-3 w-32 rounded bg-gray-50 lg:block dark:bg-white/[0.05]" />
                  </div>
                </div>
              ))}
            </div>

            <div className="min-w-0">
              <div className="border-b border-gray-100 px-4 py-4 dark:border-gray-800">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="h-5 w-44 rounded bg-gray-100 dark:bg-white/[0.08]" />
                    <div className="mt-2 h-3 w-72 max-w-full rounded bg-gray-50 dark:bg-white/[0.05]" />
                  </div>
                  <div className="h-9 w-28 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {["all", "calls", "emails", "sms", "website"].map((item) => (
                    <div
                      key={item}
                      className="h-8 w-20 rounded-full bg-gray-50 dark:bg-white/[0.05]"
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-4 p-4">
                {["one", "two", "three", "four"].map((item) => (
                  <div key={item} className="flex gap-3">
                    <div className="h-10 w-10 shrink-0 rounded-xl bg-gray-100 dark:bg-white/[0.08]" />
                    <div className="min-w-0 flex-1 rounded-xl border border-gray-100 p-3 dark:border-gray-800">
                      <div className="flex items-center justify-between gap-3">
                        <div className="h-4 w-40 rounded bg-gray-100 dark:bg-white/[0.08]" />
                        <div className="h-3 w-16 rounded bg-gray-50 dark:bg-white/[0.05]" />
                      </div>
                      <div className="mt-3 h-3 w-full rounded bg-gray-50 dark:bg-white/[0.05]" />
                      <div className="mt-2 h-3 w-4/5 rounded bg-gray-50 dark:bg-white/[0.05]" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <aside className="grid min-w-0 content-start gap-4 md:grid-cols-2 2xl:grid-cols-1">
          <section className="overflow-hidden rounded-2xl border border-purple-100 bg-white shadow-theme-xs dark:border-purple-900/40 dark:bg-white/[0.03]">
            <div className="flex min-h-10 items-center gap-2 border-b border-purple-100 px-3 py-2 dark:border-purple-900/40">
              <div className="size-6 rounded-lg bg-purple-50 dark:bg-purple-500/10" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="h-3 w-28 rounded-full bg-gray-100 dark:bg-white/[0.06]" />
                <div className="h-2.5 w-20 rounded-full bg-gray-100 dark:bg-white/[0.06]" />
              </div>
            </div>
            <div className="space-y-2.5 p-3">
              <div className="h-20 rounded-xl bg-gray-50 dark:bg-white/[0.04]" />
              <div className="h-24 rounded-xl bg-gray-50 dark:bg-white/[0.04]" />
              <div className="h-16 rounded-xl bg-gray-50 dark:bg-white/[0.04]" />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

const LoadedContactConversationWorkspace =
  dynamic<ContactConversationWorkspaceProps>(
    () => import("@/components/crm-boilerplate/ContactConversationWorkspace"),
    { loading: ContactConversationWorkspaceSkeleton, ssr: false },
  );

export default function LazyContactConversationWorkspace(
  props: ContactConversationWorkspaceProps,
) {
  return <LoadedContactConversationWorkspace {...props} />;
}
