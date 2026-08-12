"use client";

import Tooltip from "@/components/ui/tooltip/Tooltip";

export default function HelpTooltip({ content }: { content: string }) {
  return (
    <Tooltip content={<span className="block max-w-64 whitespace-normal leading-5">{content}</span>} placement="top" variant="dark">
      <button
        type="button"
        aria-label={content}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 text-[11px] font-semibold text-gray-500 hover:border-brand-300 hover:text-brand-600 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:text-gray-400 dark:hover:border-brand-700 dark:hover:text-brand-300"
      >
        ?
      </button>
    </Tooltip>
  );
}
