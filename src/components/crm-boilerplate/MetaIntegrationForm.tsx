"use client";

import { useActionState } from "react";
import { updateMetaIntegrationAction } from "@/lib/actions/marketing-integrations";
import type { MetaConfig } from "@/lib/marketing/integrations";
import Field from "@/components/crm-boilerplate/ProviderOptionField";
import MarketingAdvancedCredentials from "@/components/crm-boilerplate/MarketingAdvancedCredentials";
import { useMarketingIntegrationActionFeedback } from "@/components/crm-boilerplate/useMarketingIntegrationActionFeedback";

const initialState = {
  ok: false,
  message: "",
  savedAt: null,
  connected: false,
};

export default function MetaIntegrationForm({
  config,
  canEdit,
}: {
  config?: Partial<MetaConfig>;
  canEdit: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    updateMetaIntegrationAction,
    initialState,
  );
  const selectorOptions = config?.selectorOptions;
  const accountOptions = selectorOptions?.accounts?.map((option) => ({
    ...option,
    id: formatAdAccountId(option.id),
  }));

  useMarketingIntegrationActionFeedback(state);

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          id="meta-ad-account-id"
          label="Ad account ID"
          name="adAccountId"
          placeholder="act_123456789"
          defaultValue={formatAdAccountId(config?.adAccountId)}
          disabled={!canEdit}
          options={accountOptions}
          required
        />
        <Field
          id="meta-pixel-id"
          label="Pixel ID"
          name="pixelId"
          placeholder="123456789012345"
          defaultValue={config?.pixelId ?? ""}
          disabled={!canEdit}
          options={selectorOptions?.pixels}
        />
        <Field
          id="meta-account-name"
          label="Account name"
          name="accountName"
          placeholder="iD30 Meta Account"
          defaultValue={config?.accountName ?? ""}
          disabled={!canEdit}
        />
        <Field
          id="meta-click-ids"
          label="Tracked click IDs"
          name="trackedClickIds"
          placeholder="fbclid"
          defaultValue={(config?.trackedClickIds ?? ["fbclid"]).join(", ")}
          disabled={!canEdit}
        />
        <Field
          id="meta-lead-event"
          label="Lead event"
          name="leadEventName"
          placeholder="Lead"
          defaultValue={config?.leadEventName ?? "Lead"}
          disabled={!canEdit}
          options={selectorOptions?.events}
        />
        <Field
          id="meta-call-event"
          label="Call event"
          name="callEventName"
          placeholder="Contact"
          defaultValue={config?.callEventName ?? "Contact"}
          disabled={!canEdit}
          options={selectorOptions?.events}
        />
        <Field
          id="meta-test-event-code"
          label="Test event code"
          name="testEventCode"
          placeholder="Optional Meta test event code"
          defaultValue={config?.testEventCode ?? ""}
          disabled={!canEdit}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Checkbox
          name="importCostEnabled"
          label="Import campaign cost"
          defaultChecked={config?.importCostEnabled ?? false}
          disabled={!canEdit}
        />
        <Checkbox
          name="uploadConversionsEnabled"
          label="Upload conversion events"
          defaultChecked={config?.uploadConversionsEnabled ?? false}
          disabled={!canEdit}
        />
      </div>

      <MarketingAdvancedCredentials
        canEdit={canEdit}
        description={[
          "Normal Meta setup uses Connect Meta through iD30 Auth.",
          "Use this only if iD30 asks for a direct CRM fallback; standard client installs keep Meta app secrets in Auth.",
        ].join(" ")}
        fields={[
          {
            id: "meta-access-token",
            label: "Access token",
            name: "accessToken",
            placeholder: "Meta system user or pixel access token",
            type: "password",
          },
          {
            id: "meta-oauth-client-id",
            label: "OAuth client ID",
            name: "oauthClientId",
            placeholder: "Meta app ID",
            envKey: "META_ADS_OAUTH_CLIENT_ID",
          },
          {
            id: "meta-oauth-client-secret",
            label: "OAuth client secret",
            name: "oauthClientSecret",
            placeholder: "Meta app secret",
            envKey: "META_ADS_OAUTH_CLIENT_SECRET",
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
          {isPending ? "Saving..." : "Save Meta"}
        </button>
      </div>
    </form>
  );
}

function formatAdAccountId(value?: string | null) {
  if (!value) return "";
  return value.startsWith("act_") ? value : `act_${value}`;
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
