"use client";

import { useActionState, useEffect } from "react";
import {
  testMarketingProviderConnectionAction,
  type MarketingProviderConnectionTestState,
} from "@/lib/actions/marketing-integrations";
import type { MarketingIntegrationProviderSlug } from "@/lib/marketing/integrations";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";

const initialState: MarketingProviderConnectionTestState = {
  checkedAt: null,
  checks: [],
  message: "",
  ok: false,
};

export default function ProviderConnectionTestForm({
  canEdit,
  provider,
}: {
  canEdit: boolean;
  provider: MarketingIntegrationProviderSlug;
}) {
  const { showToast } = useToast();
  const [state, formAction, isPending] = useActionState(
    testMarketingProviderConnectionAction,
    initialState,
  );

  useEffect(() => {
    if (state.message) showToast(state.message, state.ok ? "success" : "error");
  }, [showToast, state.message, state.ok, state.checkedAt]);

  return (
    <div className="space-y-3">
      <form action={formAction}>
        <input type="hidden" name="providerSlug" value={provider} />
        <button
          type="submit"
          disabled={!canEdit || isPending}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.05] dark:disabled:text-gray-600"
        >
          {isPending ? "Testing..." : "Test connection"}
        </button>
      </form>

      {state.checkedAt ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
            Last test
          </p>
          <div className="mt-2 space-y-2">
            {state.checks.map((check) => (
              <div
                key={check.label}
                className="flex items-start justify-between gap-3 text-sm"
              >
                <div>
                  <p className="font-medium text-gray-800 dark:text-white/90">
                    {check.label}
                  </p>
                  <p className="mt-0.5 leading-5 text-gray-500 dark:text-gray-400">
                    {check.detail}
                  </p>
                </div>
                <span
                  className={`mt-0.5 inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    check.ready
                      ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
                      : "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
                  }`}
                >
                  {check.ready ? "Ready" : "Needed"}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
