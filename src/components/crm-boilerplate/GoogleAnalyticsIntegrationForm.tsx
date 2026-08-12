"use client";

import { useActionState } from "react";
import { updateGoogleAnalyticsIntegrationAction } from "@/lib/actions/marketing-integrations";
import type { GoogleAnalyticsConfig } from "@/lib/marketing/integrations";
import MarketingAdvancedCredentials from "@/components/crm-boilerplate/MarketingAdvancedCredentials";
import Field from "@/components/crm-boilerplate/ProviderOptionField";
import { useMarketingIntegrationActionFeedback } from "@/components/crm-boilerplate/useMarketingIntegrationActionFeedback";

const initialState = {
  ok: false,
  message: "",
  savedAt: null,
  connected: false,
};

export default function GoogleAnalyticsIntegrationForm({
  config,
  canEdit,
}: {
  config?: Partial<GoogleAnalyticsConfig>;
  canEdit: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    updateGoogleAnalyticsIntegrationAction,
    initialState,
  );
  const selectorOptions = config?.selectorOptions;
  useMarketingIntegrationActionFeedback(state);

  return (
    <form action={formAction} className="space-y-5">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
        Google Analytics uses iD30 Auth for client login and GA4 Data API
        access when reporting import is needed. Measurement and event mapping
        can still be saved manually for website attribution.
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field
          id="ga-measurement-id"
          label="Measurement ID"
          name="measurementId"
          placeholder="G-ABC123XYZ"
          defaultValue={config?.measurementId ?? ""}
          disabled={!canEdit}
          options={selectorOptions?.streams}
          required
        />
        <Field
          id="ga-property-id"
          label="Property ID"
          name="propertyId"
          placeholder="123456789"
          defaultValue={config?.propertyId ?? ""}
          disabled={!canEdit}
          options={selectorOptions?.properties}
          required
        />
        <Field
          id="ga-data-stream-name"
          label="Data stream name"
          name="dataStreamName"
          placeholder="Website"
          defaultValue={config?.dataStreamName ?? ""}
          disabled={!canEdit}
        />
        <Field
          id="ga-primary-conversion-event"
          label="Lead event"
          name="primaryConversionEvent"
          placeholder="generate_lead"
          defaultValue={config?.primaryConversionEvent ?? "generate_lead"}
          disabled={!canEdit}
          options={selectorOptions?.events}
        />
        <Field
          id="ga-call-conversion-event"
          label="Call event"
          name="callConversionEvent"
          placeholder="phone_call_lead"
          defaultValue={config?.callConversionEvent ?? "phone_call_lead"}
          disabled={!canEdit}
          options={selectorOptions?.events}
        />
        <Field
          id="ga-matched-event-names"
          label="Matched event names"
          name="matchedEventNames"
          placeholder="generate_lead, form_submit, phone_call_lead"
          defaultValue={(config?.matchedEventNames ?? []).join(", ")}
          disabled={!canEdit}
        />
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300">
        <input
          type="checkbox"
          name="importAnalyticsReportingEnabled"
          defaultChecked={Boolean(config?.importAnalyticsReportingEnabled)}
          disabled={!canEdit}
          className="mt-1 size-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 disabled:cursor-not-allowed"
        />
        <span>
          <span className="block font-medium text-gray-800 dark:text-white/90">
            Import GA4 event reporting
          </span>
          <span className="mt-0.5 block text-gray-500 dark:text-gray-400">
            Pull GA4 Data API event counts for the configured lead, call and
            matched event names.
          </span>
        </span>
      </label>

      <MarketingAdvancedCredentials
        canEdit={canEdit}
        description="Use this when workspace environment credentials are not configured and GA4 Data API reporting imports need a direct CRM OAuth fallback."
        fields={[
          {
            id: "ga-oauth-client-id",
            label: "OAuth client ID",
            name: "oauthClientId",
            placeholder: "Google OAuth client ID",
            envKey: "GOOGLE_ANALYTICS_OAUTH_CLIENT_ID",
          },
          {
            id: "ga-oauth-client-secret",
            label: "OAuth client secret",
            name: "oauthClientSecret",
            placeholder: "Google OAuth client secret",
            envKey: "GOOGLE_ANALYTICS_OAUTH_CLIENT_SECRET",
            type: "password",
          },
          {
            id: "ga-refresh-token",
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
          {isPending ? "Saving..." : "Save Google Analytics"}
        </button>
      </div>
    </form>
  );
}
