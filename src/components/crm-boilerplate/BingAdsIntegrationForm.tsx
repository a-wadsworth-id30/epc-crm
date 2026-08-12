"use client";

import { useActionState } from "react";
import { updateBingAdsIntegrationAction } from "@/lib/actions/marketing-integrations";
import type { BingAdsConfig } from "@/lib/marketing/integrations";
import {
  combinedMarketingProviderSelectorOptions,
  numericMarketingProviderSelectorOptions,
} from "@/lib/marketing/selector-option-lists";
import Field from "@/components/crm-boilerplate/ProviderOptionField";
import MarketingAdvancedCredentials from "@/components/crm-boilerplate/MarketingAdvancedCredentials";
import { useMarketingIntegrationActionFeedback } from "@/components/crm-boilerplate/useMarketingIntegrationActionFeedback";

const initialState = {
  ok: false,
  message: "",
  savedAt: null,
  connected: false,
};

export default function BingAdsIntegrationForm({
  config,
  canEdit,
}: {
  config?: Partial<BingAdsConfig>;
  canEdit: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    updateBingAdsIntegrationAction,
    initialState,
  );
  const selectorOptions = config?.selectorOptions;
  const conversionGoalOptions = numericMarketingProviderSelectorOptions(
    combinedMarketingProviderSelectorOptions(selectorOptions, [
      "conversionGoals",
      "conversionActions",
    ]),
  );
  useMarketingIntegrationActionFeedback(state);

  return (
    <form action={formAction} className="space-y-5" autoComplete="off">
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          id="bing-ads-customer-id"
          label="Customer ID"
          name="customerId"
          placeholder="Microsoft Advertising customer ID"
          defaultValue={config?.customerId ?? ""}
          disabled={!canEdit}
          options={selectorOptions?.managerAccounts}
          inputMode="numeric"
          pattern="[0-9]*"
        />
        <Field
          id="bing-ads-account-id"
          label="Account ID"
          name="accountId"
          placeholder="Microsoft Advertising account ID"
          defaultValue={config?.accountId ?? ""}
          disabled={!canEdit}
          options={selectorOptions?.accounts}
          required
          inputMode="numeric"
          pattern="[0-9]*"
        />
        <Field
          id="bing-ads-manager-account-id"
          label="Manager account ID"
          name="managerAccountId"
          placeholder="Optional manager account ID"
          defaultValue={config?.managerAccountId ?? ""}
          disabled={!canEdit}
          options={selectorOptions?.managerAccounts}
          inputMode="numeric"
          pattern="[0-9]*"
        />
        <Field
          id="bing-ads-account-name"
          label="Account name"
          name="accountName"
          placeholder="iD30 Bing Ads Account"
          defaultValue={config?.accountName ?? ""}
          disabled={!canEdit}
        />
        <Field
          id="bing-ads-uet-tag-id"
          label="UET tag ID"
          name="uetTagId"
          placeholder="Optional UET tag ID"
          defaultValue={config?.uetTagId ?? ""}
          disabled={!canEdit}
          options={selectorOptions?.uetTags}
          inputMode="numeric"
          pattern="[0-9]*"
        />
        <Field
          id="bing-ads-click-ids"
          label="Tracked click IDs"
          name="trackedClickIds"
          placeholder="msclkid"
          defaultValue={(config?.trackedClickIds ?? ["msclkid"]).join(", ")}
          disabled={!canEdit}
        />
        <Field
          id="bing-ads-lead-goal"
          label="Lead conversion goal"
          name="leadConversionGoalId"
          placeholder="Select conversion goal"
          defaultValue={config?.leadConversionGoalId ?? ""}
          disabled={!canEdit}
          options={conversionGoalOptions}
          inputMode="numeric"
          pattern="[0-9]*"
        />
        <Field
          id="bing-ads-call-goal"
          label="Call conversion goal"
          name="callConversionGoalId"
          placeholder="Select conversion goal"
          defaultValue={config?.callConversionGoalId ?? ""}
          disabled={!canEdit}
          options={conversionGoalOptions}
          inputMode="numeric"
          pattern="[0-9]*"
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
            id: "bing-ads-developer-token",
            label: "Developer token",
            name: "developerToken",
            placeholder: "Microsoft Advertising developer token",
            envKey: "MICROSOFT_ADS_DEVELOPER_TOKEN",
            type: "password",
          },
          {
            id: "bing-ads-oauth-client-id",
            label: "OAuth client ID",
            name: "oauthClientId",
            placeholder: "Microsoft OAuth client ID",
            envKey: "MICROSOFT_ADS_OAUTH_CLIENT_ID",
          },
          {
            id: "bing-ads-oauth-client-secret",
            label: "OAuth client secret",
            name: "oauthClientSecret",
            placeholder: "Microsoft OAuth client secret",
            envKey: "MICROSOFT_ADS_OAUTH_CLIENT_SECRET",
            type: "password",
          },
          {
            id: "bing-ads-refresh-token",
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
          {isPending ? "Saving..." : "Save Bing Ads"}
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
