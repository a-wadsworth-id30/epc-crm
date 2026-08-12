"use client";

import { useActionState } from "react";
import { resetMarketingAuthProviderConnectionAction } from "@/lib/actions/marketing-integrations";
import type { MarketingIntegrationProviderSlug } from "@/lib/marketing/integrations";
import { useMarketingIntegrationActionFeedback } from "@/components/crm-boilerplate/useMarketingIntegrationActionFeedback";

type ResetState = {
  ok: boolean;
  message: string;
  savedAt: number | null;
  connected: boolean;
};

const initialState: ResetState = {
  ok: false,
  message: "",
  savedAt: null,
  connected: false,
};

export default function ProviderAuthResetForm({
  canEdit,
  provider,
  providerName,
}: {
  canEdit: boolean;
  provider: MarketingIntegrationProviderSlug;
  providerName: string;
}) {
  const [state, formAction, isPending] = useActionState(
    resetMarketingAuthProviderConnectionAction,
    initialState,
  );
  useMarketingIntegrationActionFeedback(state);

  return (
    <form action={formAction}>
      <input type="hidden" name="providerSlug" value={provider} />
      <button
        type="submit"
        disabled={!canEdit || isPending}
        aria-label={`Disconnect ${providerName} provider access`}
        className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-warning-200 bg-white px-3 text-sm font-semibold text-warning-700 hover:bg-warning-50 disabled:cursor-not-allowed disabled:text-warning-300 dark:border-warning-900/40 dark:bg-white/[0.03] dark:text-warning-300 dark:hover:bg-warning-900/20 dark:disabled:text-warning-800"
      >
        {isPending ? "Disconnecting..." : "Switch account"}
      </button>
    </form>
  );
}
