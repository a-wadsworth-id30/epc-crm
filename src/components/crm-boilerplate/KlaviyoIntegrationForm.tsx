"use client";

import { useActionState } from "react";
import { updateKlaviyoIntegrationAction } from "@/lib/actions/marketing-integrations";
import type { KlaviyoConfig } from "@/lib/marketing/integrations";
import MarketingAdvancedCredentials from "@/components/crm-boilerplate/MarketingAdvancedCredentials";
import Field from "@/components/crm-boilerplate/ProviderOptionField";
import { useMarketingIntegrationActionFeedback } from "@/components/crm-boilerplate/useMarketingIntegrationActionFeedback";

const initialState = {
  ok: false,
  message: "",
  savedAt: null,
  connected: false,
};

export default function KlaviyoIntegrationForm({
  config,
  canEdit,
}: {
  config?: Partial<KlaviyoConfig>;
  canEdit: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    updateKlaviyoIntegrationAction,
    initialState,
  );
  const selectorOptions = config?.selectorOptions;
  useMarketingIntegrationActionFeedback(state);

  return (
    <form action={formAction} className="space-y-5">
      <div className="rounded-xl border border-lime-200 bg-lime-50 px-4 py-3 text-sm leading-6 text-lime-800 dark:border-lime-900/40 dark:bg-lime-900/20 dark:text-lime-200">
        Klaviyo connects through iD30 Auth for client login and account
        discovery. After connection, refresh options and choose the account/list
        settings used for lifecycle marketing attribution.
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field
          id="klaviyo-account-id"
          label="Account ID"
          name="accountId"
          placeholder="Auto-filled after refresh"
          defaultValue={config?.accountId ?? ""}
          disabled={!canEdit}
          options={selectorOptions?.accounts}
        />
        <Field
          id="klaviyo-account-name"
          label="Account name"
          name="accountName"
          placeholder="Klaviyo account"
          defaultValue={config?.accountName ?? ""}
          disabled={!canEdit}
        />
        <Field
          id="klaviyo-default-list-id"
          label="Default list"
          name="defaultListId"
          placeholder="Optional list ID"
          defaultValue={config?.defaultListId ?? ""}
          disabled={!canEdit}
          options={selectorOptions?.lists}
        />
        <Field
          id="klaviyo-default-list-name"
          label="Default list name"
          name="defaultListName"
          placeholder="Newsletter"
          defaultValue={config?.defaultListName ?? ""}
          disabled={!canEdit}
        />
        <Field
          id="klaviyo-attribution-events"
          label="Attribution event names"
          name="attributionEventNames"
          placeholder="Submitted Form, Placed Order"
          defaultValue={(config?.attributionEventNames ?? [
            "Submitted Form",
            "Placed Order",
          ]).join(", ")}
          disabled={!canEdit}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Checkbox
          name="importCampaignPerformanceEnabled"
          label="Import campaigns"
          defaultChecked={config?.importCampaignPerformanceEnabled ?? false}
          disabled={!canEdit}
        />
        <Checkbox
          name="importFlowPerformanceEnabled"
          label="Import flows"
          defaultChecked={config?.importFlowPerformanceEnabled ?? false}
          disabled={!canEdit}
        />
        <Checkbox
          name="importProfileEventsEnabled"
          label="Import profile events"
          defaultChecked={config?.importProfileEventsEnabled ?? false}
          disabled={!canEdit}
        />
      </div>

      <MarketingAdvancedCredentials
        canEdit={canEdit}
        description="Optional fallback for direct CRM access. Use a Klaviyo private API key with readonly access to account, list, campaign, flow, form, profile and event data. Leave blank to keep the saved key."
        fields={[
          {
            id: "klaviyo-private-api-key",
            label: "Private API key",
            name: "privateApiKey",
            placeholder: "Klaviyo private API key",
            envKey: "KLAVIYO_PRIVATE_API_KEY",
            type: "password",
          },
        ]}
      />

      {state.message ? (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            state.ok
              ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
              : "bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!canEdit || isPending}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"
        >
          {isPending ? "Saving..." : "Save Klaviyo"}
        </button>
      </div>
    </form>
  );
}

function Checkbox({
  name,
  label,
  defaultChecked,
  disabled,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
  disabled: boolean;
}) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 text-sm font-medium text-gray-700 dark:border-gray-800 dark:text-gray-300">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 disabled:cursor-not-allowed"
      />
      {label}
    </label>
  );
}
