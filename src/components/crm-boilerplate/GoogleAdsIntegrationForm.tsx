"use client";

import { useActionState } from "react";
import { updateGoogleAdsIntegrationAction } from "@/lib/actions/marketing-integrations";
import type { GoogleAdsConfig } from "@/lib/marketing/integrations";
import Field from "@/components/crm-boilerplate/ProviderOptionField";
import MarketingAdvancedCredentials from "@/components/crm-boilerplate/MarketingAdvancedCredentials";
import { useMarketingIntegrationActionFeedback } from "@/components/crm-boilerplate/useMarketingIntegrationActionFeedback";

const initialState = {
  ok: false,
  message: "",
  savedAt: null,
  connected: false,
};

export default function GoogleAdsIntegrationForm({
  config,
  canEdit,
}: {
  config?: Partial<GoogleAdsConfig>;
  canEdit: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    updateGoogleAdsIntegrationAction,
    initialState,
  );
  const selectorOptions = config?.selectorOptions;
  const hasAccountOptions = Boolean(selectorOptions?.accounts?.length);
  const hasManagerAccountOptions = Boolean(selectorOptions?.managerAccounts?.length);
  useMarketingIntegrationActionFeedback(state);

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          id="google-ads-customer-id"
          label="Customer ID"
          name="customerId"
          placeholder="123-456-7890"
          defaultValue={
            hasAccountOptions
              ? (config?.customerId ?? "")
              : formatCustomerId(config?.customerId)
          }
          disabled={!canEdit}
          options={selectorOptions?.accounts}
          required
        />
        <Field
          id="google-ads-manager-customer-id"
          label="Manager customer ID"
          name="managerCustomerId"
          placeholder="Optional MCC ID"
          defaultValue={
            hasManagerAccountOptions
              ? (config?.managerCustomerId ?? "")
              : formatCustomerId(config?.managerCustomerId)
          }
          disabled={!canEdit}
          options={selectorOptions?.managerAccounts}
        />
        <Field
          id="google-ads-account-name"
          label="Account name"
          name="accountName"
          placeholder="iD30 Ads Account"
          defaultValue={config?.accountName ?? ""}
          disabled={!canEdit}
        />
        <Field
          id="google-ads-click-ids"
          label="Tracked click IDs"
          name="trackedClickIds"
          placeholder="gclid, gbraid, wbraid"
          defaultValue={(config?.trackedClickIds ?? ["gclid", "gbraid", "wbraid"]).join(", ")}
          disabled={!canEdit}
        />
        <Field
          id="google-ads-lead-conversion"
          label="Lead conversion action ID"
          name="leadConversionActionId"
          placeholder="Optional conversion action ID"
          defaultValue={config?.leadConversionActionId ?? ""}
          disabled={!canEdit}
          options={selectorOptions?.conversionActions}
        />
        <Field
          id="google-ads-call-conversion"
          label="Call conversion action ID"
          name="callConversionActionId"
          placeholder="Optional conversion action ID"
          defaultValue={config?.callConversionActionId ?? ""}
          disabled={!canEdit}
          options={selectorOptions?.conversionActions}
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
          name="uploadOfflineConversionsEnabled"
          label="Upload offline conversions"
          defaultChecked={config?.uploadOfflineConversionsEnabled ?? false}
          disabled={!canEdit}
        />
      </div>

      <MarketingAdvancedCredentials
        canEdit={canEdit}
        fields={[
          {
            id: "google-ads-developer-token",
            label: "Developer token",
            name: "developerToken",
            placeholder: "Google Ads developer token",
            envKey: "GOOGLE_ADS_DEVELOPER_TOKEN",
            type: "password",
          },
          {
            id: "google-ads-oauth-client-id",
            label: "OAuth client ID",
            name: "oauthClientId",
            placeholder: "Google OAuth client ID",
            envKey: "GOOGLE_ADS_OAUTH_CLIENT_ID",
          },
          {
            id: "google-ads-oauth-client-secret",
            label: "OAuth client secret",
            name: "oauthClientSecret",
            placeholder: "Google OAuth client secret",
            envKey: "GOOGLE_ADS_OAUTH_CLIENT_SECRET",
            type: "password",
          },
          {
            id: "google-ads-refresh-token",
            label: "Refresh token",
            name: "refreshToken",
            placeholder: "OAuth refresh token",
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
          {isPending ? "Saving..." : "Save Google Ads"}
        </button>
      </div>
    </form>
  );
}

function formatCustomerId(value?: string | null) {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 10) return value;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
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
