"use client";

import dynamic from "next/dynamic";
import type { ProviderSelectorRefreshFormProps } from "@/components/crm-boilerplate/ProviderSelectorRefreshForm";

function ProviderSelectorRefreshFormLoading() {
  return (
    <button
      type="button"
      disabled
      className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-400 dark:border-gray-800 dark:text-gray-600"
    >
      Refresh options
    </button>
  );
}

const LoadedProviderSelectorRefreshForm =
  dynamic<ProviderSelectorRefreshFormProps>(
    () => import("@/components/crm-boilerplate/ProviderSelectorRefreshForm"),
    { loading: ProviderSelectorRefreshFormLoading, ssr: false },
  );

export default function LazyProviderSelectorRefreshForm(
  props: ProviderSelectorRefreshFormProps,
) {
  return <LoadedProviderSelectorRefreshForm {...props} />;
}
