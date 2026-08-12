"use client";

import { useActionState } from "react";
import {
  refreshBingAdsSelectorOptionsAction,
  refreshGoogleAdsSelectorOptionsAction,
  refreshGoogleAnalyticsSelectorOptionsAction,
  refreshGoogleSearchConsoleSelectorOptionsAction,
  refreshKlaviyoSelectorOptionsAction,
  refreshLinkedInAdsSelectorOptionsAction,
  refreshMetaSelectorOptionsAction,
} from "@/lib/actions/marketing-integrations";
import { useMarketingIntegrationActionFeedback } from "@/components/crm-boilerplate/useMarketingIntegrationActionFeedback";

export type SelectorRefreshProvider =
  | "bing-ads"
  | "google-ads"
  | "google-analytics"
  | "google-search-console"
  | "klaviyo"
  | "linkedin-ads"
  | "meta";

export type ProviderSelectorRefreshFormProps = {
  canEdit: boolean;
  provider: SelectorRefreshProvider;
};

type SelectorRefreshState = {
  ok: boolean;
  message: string;
  savedAt: number | null;
  connected: boolean;
};

type SelectorRefreshAction = (
  previousState: SelectorRefreshState,
) => Promise<SelectorRefreshState>;

const initialState: SelectorRefreshState = {
  ok: false,
  message: "",
  savedAt: null,
  connected: false,
};

const refreshActions: Record<SelectorRefreshProvider, SelectorRefreshAction> = {
  "bing-ads": refreshBingAdsSelectorOptionsAction,
  "google-ads": refreshGoogleAdsSelectorOptionsAction,
  "google-analytics": refreshGoogleAnalyticsSelectorOptionsAction,
  "google-search-console": refreshGoogleSearchConsoleSelectorOptionsAction,
  klaviyo: refreshKlaviyoSelectorOptionsAction,
  "linkedin-ads": refreshLinkedInAdsSelectorOptionsAction,
  meta: refreshMetaSelectorOptionsAction,
};

export default function ProviderSelectorRefreshForm({
  canEdit,
  provider,
}: ProviderSelectorRefreshFormProps) {
  const [state, formAction, isPending] = useActionState(
    refreshActions[provider],
    initialState,
  );
  useMarketingIntegrationActionFeedback(state);

  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={!canEdit || isPending}
        className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.05] dark:disabled:text-gray-600"
      >
        {isPending ? "Refreshing..." : "Refresh options"}
      </button>
    </form>
  );
}
