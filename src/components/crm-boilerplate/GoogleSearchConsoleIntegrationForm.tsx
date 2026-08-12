"use client";

import { useActionState } from "react";
import { updateGoogleSearchConsoleIntegrationAction } from "@/lib/actions/marketing-integrations";
import type { GoogleSearchConsoleConfig } from "@/lib/marketing/integrations";
import MarketingAdvancedCredentials from "@/components/crm-boilerplate/MarketingAdvancedCredentials";
import Field from "@/components/crm-boilerplate/ProviderOptionField";
import { useMarketingIntegrationActionFeedback } from "@/components/crm-boilerplate/useMarketingIntegrationActionFeedback";

const initialState = {
  ok: false,
  message: "",
  savedAt: null,
  connected: false,
};

const searchTypeOptions = [
  { value: "web", label: "Web" },
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "news", label: "News" },
  { value: "googleNews", label: "Google News" },
] as const;

export default function GoogleSearchConsoleIntegrationForm({
  config,
  canEdit,
}: {
  config?: Partial<GoogleSearchConsoleConfig>;
  canEdit: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    updateGoogleSearchConsoleIntegrationAction,
    initialState,
  );
  const selectorOptions = config?.selectorOptions;
  useMarketingIntegrationActionFeedback(state);

  return (
    <form action={formAction} className="space-y-5">
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200">
        Google Search Console uses iD30 Auth for client login and readonly
        access to verified site properties. Refresh options after connecting,
        then choose the matching URL-prefix or domain property.
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field
          id="gsc-site-url"
          label="Search Console property"
          name="siteUrl"
          placeholder="https://example.com/ or sc-domain:example.com"
          defaultValue={config?.siteUrl ?? ""}
          disabled={!canEdit}
          options={selectorOptions?.sites}
          required
        />
        <Field
          id="gsc-property-name"
          label="Property name"
          name="propertyName"
          placeholder="Main website"
          defaultValue={config?.propertyName ?? ""}
          disabled={!canEdit}
        />
        <div>
          <label
            htmlFor="gsc-search-type"
            className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
          >
            Search type
          </label>
          <select
            id="gsc-search-type"
            name="searchType"
            disabled={!canEdit}
            defaultValue={config?.searchType ?? "web"}
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800 dark:disabled:bg-gray-900/60"
          >
            {searchTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <Field
          id="gsc-dimensions"
          label="Performance dimensions"
          name="dimensions"
          placeholder="query, page, device, country"
          defaultValue={(config?.dimensions ?? ["query", "page"]).join(", ")}
          disabled={!canEdit}
        />
      </div>

      <label className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 text-sm font-medium text-gray-700 dark:border-gray-800 dark:text-gray-300">
        <input
          type="checkbox"
          name="importSearchPerformanceEnabled"
          defaultChecked={config?.importSearchPerformanceEnabled ?? false}
          disabled={!canEdit}
          className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 disabled:cursor-not-allowed"
        />
        Import organic search performance when reporting sync is available
      </label>

      <MarketingAdvancedCredentials
        canEdit={canEdit}
        fields={[
          {
            id: "gsc-oauth-client-id",
            label: "OAuth client ID",
            name: "oauthClientId",
            placeholder: "Google OAuth client ID",
            envKey: "GOOGLE_SEARCH_CONSOLE_OAUTH_CLIENT_ID",
          },
          {
            id: "gsc-oauth-client-secret",
            label: "OAuth client secret",
            name: "oauthClientSecret",
            placeholder: "Google OAuth client secret",
            envKey: "GOOGLE_SEARCH_CONSOLE_OAUTH_CLIENT_SECRET",
            type: "password",
          },
          {
            id: "gsc-refresh-token",
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
          {isPending ? "Saving..." : "Save Search Console"}
        </button>
      </div>
    </form>
  );
}
