"use client";

import { useActionState } from "react";
import { updateLinkedInAdsIntegrationAction } from "@/lib/actions/marketing-integrations";
import type { LinkedInAdsConfig } from "@/lib/marketing/integrations";
import { combinedMarketingProviderSelectorOptions } from "@/lib/marketing/selector-option-lists";
import Field from "@/components/crm-boilerplate/ProviderOptionField";
import MarketingAdvancedCredentials from "@/components/crm-boilerplate/MarketingAdvancedCredentials";
import { useMarketingIntegrationActionFeedback } from "@/components/crm-boilerplate/useMarketingIntegrationActionFeedback";

const initialState = {
  ok: false,
  message: "",
  savedAt: null,
  connected: false,
};

export default function LinkedInAdsIntegrationForm({
  config,
  canEdit,
}: {
  config?: Partial<LinkedInAdsConfig>;
  canEdit: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    updateLinkedInAdsIntegrationAction,
    initialState,
  );
  const selectorOptions = config?.selectorOptions;
  const conversionRuleOptions = combinedMarketingProviderSelectorOptions(
    selectorOptions,
    ["conversionRules", "conversionActions"],
  );
  useMarketingIntegrationActionFeedback(state);

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          id="linkedin-ads-account-id"
          label="Ad account ID"
          name="adAccountId"
          placeholder="LinkedIn Ads account ID"
          defaultValue={config?.adAccountId ?? ""}
          disabled={!canEdit}
          options={selectorOptions?.accounts}
        />
        <Field
          id="linkedin-insight-tag-id"
          label="Insight Tag ID"
          name="insightTagId"
          placeholder="Optional Insight Tag ID"
          defaultValue={config?.insightTagId ?? ""}
          disabled={!canEdit}
          options={selectorOptions?.insightTags}
        />
        <Field
          id="linkedin-account-name"
          label="Account name"
          name="accountName"
          placeholder="iD30 LinkedIn Account"
          defaultValue={config?.accountName ?? ""}
          disabled={!canEdit}
        />
        <Field
          id="linkedin-click-ids"
          label="Tracked click IDs"
          name="trackedClickIds"
          placeholder="li_fat_id"
          defaultValue={(config?.trackedClickIds ?? ["li_fat_id"]).join(", ")}
          disabled={!canEdit}
        />
        <Field
          id="linkedin-lead-conversion-rule"
          label="Lead conversion rule ID"
          name="leadConversionRuleId"
          placeholder="Optional conversion rule ID"
          defaultValue={config?.leadConversionRuleId ?? ""}
          disabled={!canEdit}
          options={conversionRuleOptions}
        />
        <Field
          id="linkedin-call-conversion-rule"
          label="Call conversion rule ID"
          name="callConversionRuleId"
          placeholder="Optional conversion rule ID"
          defaultValue={config?.callConversionRuleId ?? ""}
          disabled={!canEdit}
          options={conversionRuleOptions}
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
        description="Use this only for direct CRM fallback connections where a LinkedIn Marketing API access token has been issued for this account."
        fields={[
          {
            id: "linkedin-access-token",
            label: "Access token",
            name: "accessToken",
            placeholder: "LinkedIn Marketing API access token",
            type: "password",
          },
          {
            id: "linkedin-oauth-client-id",
            label: "OAuth client ID",
            name: "oauthClientId",
            placeholder: "LinkedIn OAuth client ID",
            envKey: "LINKEDIN_ADS_OAUTH_CLIENT_ID",
          },
          {
            id: "linkedin-oauth-client-secret",
            label: "OAuth client secret",
            name: "oauthClientSecret",
            placeholder: "LinkedIn OAuth client secret",
            envKey: "LINKEDIN_ADS_OAUTH_CLIENT_SECRET",
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
          {isPending ? "Saving..." : "Save LinkedIn Ads"}
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
