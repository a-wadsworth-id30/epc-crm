"use client";

import dynamic from "next/dynamic";
import type {
  DiscoveryLinkOption,
  DiscoveryQuestionRow,
  DiscoveryTemplateRow,
} from "@/components/crm-boilerplate/DiscoveryQuestionSetupView";

type DiscoveryQuestionSetupViewProps = {
  categories: DiscoveryLinkOption[];
  products: DiscoveryLinkOption[];
  questions: DiscoveryQuestionRow[];
  stages: DiscoveryLinkOption[];
  templates: DiscoveryTemplateRow[];
};

function DiscoveryQuestionSetupLoading() {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 p-5 dark:border-gray-800">
        <div className="h-5 w-56 rounded bg-gray-100 dark:bg-white/[0.08]" />
        <div className="mt-3 h-4 w-96 max-w-full rounded bg-gray-50 dark:bg-white/[0.05]" />
      </div>
      <div className="grid gap-4 p-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="h-10 rounded-xl bg-gray-50 dark:bg-white/[0.05]" />
          <div className="h-10 rounded-xl bg-gray-50 dark:bg-white/[0.05]" />
          <div className="h-10 rounded-xl bg-gray-50 dark:bg-white/[0.05]" />
        </div>
        <div className="space-y-3">
          <div className="h-12 rounded-xl bg-gray-50 dark:bg-white/[0.05]" />
          <div className="h-24 rounded-xl bg-gray-50 dark:bg-white/[0.05]" />
          <div className="h-24 rounded-xl bg-gray-50 dark:bg-white/[0.05]" />
        </div>
      </div>
    </section>
  );
}

const LazyDiscoveryQuestionSetupView = dynamic(
  () => import("@/components/crm-boilerplate/DiscoveryQuestionSetupView"),
  {
    loading: DiscoveryQuestionSetupLoading,
    ssr: false,
  },
);

export default function LazyDiscoveryQuestionSetupViewWrapper(
  props: DiscoveryQuestionSetupViewProps,
) {
  return <LazyDiscoveryQuestionSetupView {...props} />;
}
