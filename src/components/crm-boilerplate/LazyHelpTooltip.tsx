"use client";

import dynamic from "next/dynamic";

const HelpTooltip = dynamic(
  () => import("@/components/crm-boilerplate/HelpTooltip"),
  {
    loading: () => (
      <span
        aria-hidden="true"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 text-[11px] font-semibold text-gray-400 dark:border-gray-700 dark:text-gray-500"
      >
        ?
      </span>
    ),
    ssr: false,
  },
);

export default function LazyHelpTooltip({ content }: { content: string }) {
  return <HelpTooltip content={content} />;
}
