"use client";

import dynamic from "next/dynamic";
import type { CopyButtonProps } from "@/components/crm-boilerplate/CopyButton";

const LoadedCopyButton = dynamic<CopyButtonProps>(
  () => import("@/components/crm-boilerplate/CopyButton"),
  {
    ssr: false,
    loading: () => (
      <span
        aria-hidden="true"
        className="inline-flex h-5 w-5 rounded-md bg-gray-100 dark:bg-white/[0.08]"
      />
    ),
  },
);

export default function LazyCopyButton(props: CopyButtonProps) {
  return <LoadedCopyButton {...props} />;
}
