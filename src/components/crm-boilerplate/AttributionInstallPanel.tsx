"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import {
  deactivateAttributionNumberAction,
  purchaseTwilioTrackingNumberAction,
  searchTwilioTrackingNumbersAction,
  type NumberPoolActionState,
  type NumberSearchState,
} from "@/lib/actions/attribution";
import { updateAttributionFeatureSettingsAction } from "@/lib/actions/settings";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";

export type AttributionFeatureSettings = {
  attributionTrackingEnabled: boolean;
  attributionFormTrackingEnabled: boolean;
  attributionInjectHiddenFieldEnabled: boolean;
  attributionPhoneTrackingEnabled: boolean;
  attributionReplaceTelLinksEnabled: boolean;
  attributionReplaceVisibleNumbersEnabled: boolean;
  attributionRequireConsent: boolean;
};

export type AttributionInstallPanelSection =
  | "metrics"
  | "script"
  | "feature-controls"
  | "installation-check"
  | "form-intro"
  | "number-pool";

type CheckResult = {
  ok: boolean;
  checkedUrl: string;
  status: number | null;
  scriptReachable: boolean;
  scriptInstalled: boolean;
  correctApiBase: boolean;
  phoneMarkers: number;
  telLinks: number;
  likelyPhoneText: number;
  formMarkers: number;
  forms: number;
  foundScriptSrc: string | null;
  serverConfigCheck?: {
    attempted: boolean;
    configLoaded: boolean;
    configUrl: string | null;
    configApiBase: string | null;
    configEnabled: boolean | null;
    configReason: string | null;
    errors: string[];
  };
  browserCheck?: {
    attempted: boolean;
    available: boolean;
    scriptApiPresent: boolean;
    configLoaded: boolean;
    configUrl: string | null;
    configApiBase: string | null;
    configEnabled: boolean | null;
    configReason: string | null;
    hiddenFieldInjected: boolean;
    phoneNumberApplied: boolean;
    debugApiPresent: boolean;
    runtimeScriptSrcs: string[];
    errors: string[];
  };
  issues: string[];
};

type PoolNumber = {
  id: string;
  phoneNumber: string;
  label: string | null;
  isActive: boolean;
  priority: number;
  metadata: unknown;
  createdAt: string;
  assignments: number;
  records: number;
};

type AttributionDomainOption = {
  id: string;
  domain: string;
  label: string | null;
  environment: string;
  isActive: boolean;
};

export default function AttributionInstallPanel({
  baseUrl,
  trackingNumbers,
  activeAssignments,
  recentRecords,
  featureSettings,
  numberPool,
  domains = [],
  domainRegistryUnavailable = false,
  sections = [
    "metrics",
    "script",
    "feature-controls",
    "installation-check",
    "form-intro",
    "number-pool",
  ],
}: {
  baseUrl: string;
  trackingNumbers: number;
  activeAssignments: number;
  recentRecords: number;
  featureSettings: AttributionFeatureSettings;
  numberPool: PoolNumber[];
  domains?: AttributionDomainOption[];
  domainRegistryUnavailable?: boolean;
  sections?: AttributionInstallPanelSection[];
}) {
  const { showToast } = useToast();
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [selectedDomainId, setSelectedDomainId] = useState(domains[0]?.id ?? "");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchState, searchAction, isSearching] = useActionState<
    NumberSearchState,
    FormData
  >(searchTwilioTrackingNumbersAction, {
    ok: false,
    message: "",
    numbers: [],
  });
  const [purchaseState, purchaseAction, isPurchasing] = useActionState<
    NumberPoolActionState,
    FormData
  >(purchaseTwilioTrackingNumberAction, {
    ok: false,
    message: "",
    savedAt: null,
  });
  const [deactivateState, deactivateAction, isDeactivating] = useActionState<
    NumberPoolActionState,
    FormData
  >(deactivateAttributionNumberAction, {
    ok: false,
    message: "",
    savedAt: null,
  });

  const scriptSnippet = useMemo(
    () => `<script src="${baseUrl}/attribution.js" data-id30-attribution defer></script>`,
    [baseUrl],
  );
  const showFeatureControls = sections.includes("feature-controls");
  const showInstallationCheck = sections.includes("installation-check");
  const controlsGridClass =
    showFeatureControls && showInstallationCheck
      ? "grid gap-6 xl:grid-cols-2 xl:items-start"
      : "grid gap-6";
  const nextSnippet = `await window.id30Attribution.submitLead({
  name,
  email,
  phone,
  message,
  source: "Website",
});`;
  const selectedDomain = domains.find((domain) => domain.id === selectedDomainId) ?? null;

  useEffect(() => {
    if (purchaseState.ok && purchaseState.savedAt) {
      showToast(purchaseState.message);
    }
  }, [purchaseState, showToast]);

  useEffect(() => {
    if (deactivateState.ok && deactivateState.savedAt) {
      showToast(deactivateState.message);
    }
  }, [deactivateState, showToast]);

  async function runCheck(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!domainRegistryUnavailable && domains.length === 0) {
      setError("Add an attribution domain before running the installation check.");
      return;
    }

    setIsChecking(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/attribution/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl }),
      });
      const text = await response.text();
      let payload: unknown = null;

      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const error =
          payload &&
          typeof payload === "object" &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : text.trim().slice(0, 240);

        setError(error || `Website check failed with HTTP ${response.status}.`);
        return;
      }

      if (!payload || typeof payload !== "object") {
        setError("Website check returned an unreadable response.");
        return;
      }

      setResult(payload as CheckResult);
    } catch {
      setError("Could not run the website check.");
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <div className="space-y-6">
      {sections.includes("metrics") && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Metric label="Active tracking numbers" value={trackingNumbers} />
          <Metric label="Live assignments" value={activeAssignments} />
          <Metric label="Attribution records" value={recentRecords} />
        </div>
      )}

      {sections.includes("script") && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
                Website script
              </h2>
              <LazyHelpTooltip content="Shows the single CRM-managed script tag that enables visitor attribution, form tracking and dynamic phone-number swapping on a website." />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Add this once per lead-generation website. The script pulls its settings from the CRM, auto-detects forms and replaces telephone numbers without extra page markup.
            </p>
          </div>
          <CodeBlock code={scriptSnippet} />
        </section>
      )}

      {(showFeatureControls || showInstallationCheck) && (
        <div className={controlsGridClass}>
          {showFeatureControls && (
            <AttributionFeatureSettingsForm settings={featureSettings} />
          )}

          {showInstallationCheck && (
            <InstallationCheckPanel
              domains={domains}
              domainRegistryUnavailable={domainRegistryUnavailable}
              error={error}
              isChecking={isChecking}
              onCheck={runCheck}
              result={result}
              selectedDomain={selectedDomain}
              selectedDomainId={selectedDomainId}
              setError={setError}
              setResult={setResult}
              setSelectedDomainId={setSelectedDomainId}
              setWebsiteUrl={setWebsiteUrl}
              websiteUrl={websiteUrl}
            />
          )}
        </div>
      )}

      {sections.includes("form-intro") && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.75fr)_minmax(360px,1fr)] xl:items-start">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
                  Automatic form tracking
                </h2>
                <LazyHelpTooltip content="Explains how website forms can send lead data and attribution snapshots into the CRM without a custom integration." />
              </div>
              <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
                The website script can inject attribution into forms automatically. Custom forms can also call the CRM lead endpoint directly.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <SetupStep title="Capture" detail="Visitor, session and campaign data are read from the script." />
                <SetupStep title="Submit" detail="Form fields are sent to the CRM lead endpoint." />
                <SetupStep title="Link" detail="Contact, opportunity and attribution records are created together." />
              </div>
            </div>
            <CodeBlock label="Custom form submit" code={nextSnippet} />
          </div>
        </section>
      )}

      {sections.includes("number-pool") && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Twilio call attribution number pool
            </h2>
            <LazyHelpTooltip content="Lets users search, buy and manage Twilio numbers used by dynamic number insertion for call attribution." />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Buy voice-capable Twilio numbers and add them to the dynamic number insertion pool.
          </p>
        </div>

        <form action={searchAction} className="mt-5 grid gap-3 md:grid-cols-[110px_160px_minmax(0,1fr)_auto]">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Country
            </span>
            <input
              name="country"
              defaultValue="GB"
              maxLength={2}
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 uppercase outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Area code
            </span>
            <input
              name="areaCode"
              inputMode="numeric"
              placeholder="Optional"
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Contains
            </span>
            <input
              name="contains"
              placeholder="Optional number pattern"
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={isSearching}
              className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
            >
              {isSearching ? "Searching..." : "Search Twilio"}
            </button>
          </div>
        </form>

        {searchState.message && (
          <p
            className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
              searchState.ok
                ? "border-success-200 bg-success-50 text-success-700 dark:border-success-900/40 dark:bg-success-900/20 dark:text-success-300"
                : "border-error-200 bg-error-50 text-error-700 dark:border-error-900/40 dark:bg-error-900/20 dark:text-error-300"
            }`}
          >
            {searchState.message}
          </p>
        )}

        {searchState.numbers.length > 0 && (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {searchState.numbers.map((number) => (
              <form
                key={number.phoneNumber}
                action={purchaseAction}
                className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]"
              >
                <input type="hidden" name="phoneNumber" value={number.phoneNumber} />
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                      {number.phoneNumber}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {[number.locality, number.region, number.country].filter(Boolean).join(", ") ||
                        number.friendlyName ||
                        "Voice-capable number"}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Voice {number.capabilities.voice ? "yes" : "no"} · SMS{" "}
                      {number.capabilities.sms ? "yes" : "no"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <input
                      name="label"
                      placeholder="Label"
                      className="h-10 w-36 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                    />
                    <button
                      type="submit"
                      disabled={isPurchasing}
                      className="inline-flex h-10 items-center justify-center rounded-lg bg-success-600 px-4 text-sm font-medium text-white hover:bg-success-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Buy
                    </button>
                  </div>
                </div>
              </form>
            ))}
          </div>
        )}

        <ActionStateMessage state={purchaseState.ok ? undefined : purchaseState} />
        <ActionStateMessage state={deactivateState.ok ? undefined : deactivateState} />

        <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
          <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
              Active CRM pool
            </p>
          </div>
          {numberPool.length ? (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {numberPool.map((number) => (
                <PoolRow
                  key={number.id}
                  number={number}
                  action={deactivateAction}
                  isDeactivating={isDeactivating}
                />
              ))}
            </div>
          ) : (
            <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
              No tracking numbers have been added yet.
            </p>
          )}
        </div>
      </section>
      )}
    </div>
  );
}

function defaultCheckUrl(domain: AttributionDomainOption) {
  if (domain.domain === "localhost") return "http://localhost:3001";
  if (domain.domain === "127.0.0.1") return "http://127.0.0.1:3001";
  return `https://${domain.domain}`;
}

function InstallationCheckPanel({
  domains,
  domainRegistryUnavailable,
  error,
  isChecking,
  onCheck,
  result,
  selectedDomain,
  selectedDomainId,
  setError,
  setResult,
  setSelectedDomainId,
  setWebsiteUrl,
  websiteUrl,
}: {
  domains: AttributionDomainOption[];
  domainRegistryUnavailable: boolean;
  error: string | null;
  isChecking: boolean;
  onCheck: (event: React.FormEvent<HTMLFormElement>) => void;
  result: CheckResult | null;
  selectedDomain: AttributionDomainOption | null;
  selectedDomainId: string;
  setError: (value: string | null) => void;
  setResult: (value: CheckResult | null) => void;
  setSelectedDomainId: (value: string) => void;
  setWebsiteUrl: (value: string) => void;
  websiteUrl: string;
}) {
  function selectDomain(domainId: string) {
    const domain = domains.find((candidate) => candidate.id === domainId) ?? null;
    setSelectedDomainId(domainId);
    setResult(null);
    setError(null);
    setWebsiteUrl(domain ? defaultCheckUrl(domain) : "");
  }

  useEffect(() => {
    if (!websiteUrl && selectedDomain) {
      setWebsiteUrl(defaultCheckUrl(selectedDomain));
    }
  }, [selectedDomain, setWebsiteUrl, websiteUrl]);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Check installation
          </h2>
          <LazyHelpTooltip content="Tests a registered website to confirm the attribution script is installed and can load the CRM configuration." />
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Select a registered domain, then check that the website has the CRM script installed and pointing at this CRM.
        </p>
      </div>

      {domainRegistryUnavailable ? (
        <form onSubmit={onCheck} className="mt-4 space-y-3">
          <div className="rounded-xl border border-warning-200 bg-warning-50 p-4 dark:border-warning-900/40 dark:bg-warning-900/20">
            <p className="text-sm font-semibold text-warning-800 dark:text-warning-200">
              Domain registry is unavailable.
            </p>
            <p className="mt-1 text-sm text-warning-700 dark:text-warning-300">
              The production database migrations need to run before registered domains can be selected. You can still check a website URL manually.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="url"
              required
              value={websiteUrl}
              onChange={(event) => setWebsiteUrl(event.target.value)}
              placeholder="https://example.com"
              className="h-11 flex-1 rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90"
            />
            <button
              type="submit"
              disabled={isChecking}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isChecking ? "Checking..." : "Run check"}
            </button>
          </div>
        </form>
      ) : domains.length === 0 ? (
        <div className="mt-4 rounded-xl border border-warning-200 bg-warning-50 p-4 dark:border-warning-900/40 dark:bg-warning-900/20">
          <p className="text-sm font-semibold text-warning-800 dark:text-warning-200">
            Add a domain before checking installation.
          </p>
          <p className="mt-1 text-sm text-warning-700 dark:text-warning-300">
            The domain registry controls which websites can run attribution. Add the website under Domains, then return here to run the checker.
          </p>
          <Link
            href="/settings/attribution/domains"
            className="mt-3 inline-flex h-10 items-center justify-center rounded-lg bg-warning-600 px-4 text-sm font-medium text-white hover:bg-warning-700"
          >
            Add domain
          </Link>
        </div>
      ) : (
        <form onSubmit={onCheck} className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Registered domain
            </span>
            <select
              value={selectedDomainId}
              onChange={(event) => selectDomain(event.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90"
            >
              {domains.map((domain) => (
                <option key={domain.id} value={domain.id}>
                  {domain.label ? `${domain.label} - ` : ""}
                  {domain.domain}
                  {domain.isActive ? "" : " (inactive)"}
                </option>
              ))}
            </select>
          </label>

          {selectedDomain && (
            <p
              className={`rounded-lg border px-3 py-2 text-xs ${
                selectedDomain.isActive
                  ? "border-success-200 bg-success-50 text-success-700 dark:border-success-900/40 dark:bg-success-900/20 dark:text-success-300"
                  : "border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-900/40 dark:bg-warning-900/20 dark:text-warning-300"
              }`}
            >
              {selectedDomain.domain} is listed as {selectedDomain.environment}
              {selectedDomain.isActive
                ? " and can receive enabled script settings."
                : " but is inactive, so the script config should be disabled for this host."}
            </p>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="url"
              required
              value={websiteUrl}
              onChange={(event) => setWebsiteUrl(event.target.value)}
              placeholder="https://example.com"
              className="h-11 flex-1 rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90"
            />
            <button
              type="submit"
              disabled={isChecking}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isChecking ? "Checking..." : "Run check"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="mt-4 rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-sm text-error-700 dark:border-error-900/40 dark:bg-error-900/20 dark:text-error-300">
          {error}
        </p>
      )}

      {result && <CheckSummary result={result} />}
    </section>
  );
}

function PoolRow({
  number,
  action,
  isDeactivating,
}: {
  number: PoolNumber;
  action: (payload: FormData) => void;
  isDeactivating: boolean;
}) {
  const metadata =
    number.metadata && typeof number.metadata === "object" && !Array.isArray(number.metadata)
      ? (number.metadata as Record<string, unknown>)
      : {};
  const sid = typeof metadata.twilioPhoneNumberSid === "string" ? metadata.twilioPhoneNumberSid : null;
  const location = [metadata.locality, metadata.region, metadata.country]
    .filter((value): value is string => typeof value === "string" && Boolean(value))
    .join(", ");

  return (
    <div className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
            {number.phoneNumber}
          </p>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              number.isActive
                ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
                : "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300"
            }`}
          >
            {number.isActive ? "Active" : "Inactive"}
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {number.label || "Tracking number"}
          {location ? ` · ${location}` : ""}
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {number.assignments} assignments · {number.records} attributed calls
          {sid ? ` · ${sid}` : ""}
        </p>
      </div>
      {number.isActive && (
        <form action={action}>
          <input type="hidden" name="id" value={number.id} />
          <button
            type="submit"
            disabled={isDeactivating}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
          >
            Remove from pool
          </button>
        </form>
      )}
    </div>
  );
}

function AttributionFeatureSettingsForm({
  settings,
}: {
  settings: AttributionFeatureSettings;
}) {
  const { showToast } = useToast();
  const [state, formAction, isPending] = useActionState(updateAttributionFeatureSettingsAction, {
    ok: false,
    message: "",
    savedAt: null,
  });

  useEffect(() => {
    if (state.ok && state.savedAt) {
      showToast(state.message || "Attribution feature settings saved.");
    }
  }, [showToast, state.message, state.ok, state.savedAt]);

  return (
    <form
      action={formAction}
      className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Feature controls
          </h2>
          <LazyHelpTooltip content="Turns attribution capture, automatic form capture and phone tracking features on or off without changing the website script tag." />
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Switch script capture, form tracking and dynamic number insertion on or off without changing the website install snippet.
        </p>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <FeatureToggle
          name="attributionTrackingEnabled"
          label="Attribution script"
          detail="Capture visitor, session, landing page and campaign data."
          defaultChecked={settings.attributionTrackingEnabled}
        />
        <FeatureToggle
          name="attributionRequireConsent"
          label="Require consent before tracking"
          detail="Delay attribution capture, forms and phone tracking until the website grants consent."
          defaultChecked={settings.attributionRequireConsent}
        />
        <FeatureToggle
          name="attributionFormTrackingEnabled"
          label="Automatic form capture"
          detail="Send eligible website form submissions to the CRM lead endpoint."
          defaultChecked={settings.attributionFormTrackingEnabled}
        />
        <FeatureToggle
          name="attributionInjectHiddenFieldEnabled"
          label="Hidden form field"
          detail="Inject crm_attribution into website forms before submit."
          defaultChecked={settings.attributionInjectHiddenFieldEnabled}
        />
        <FeatureToggle
          name="attributionPhoneTrackingEnabled"
          label="Dynamic phone tracking"
          detail="Request a CRM tracking number for the visitor session."
          defaultChecked={settings.attributionPhoneTrackingEnabled}
        />
        <FeatureToggle
          name="attributionReplaceTelLinksEnabled"
          label="Replace tel links"
          detail="Swap detected click-to-call links with the tracking number."
          defaultChecked={settings.attributionReplaceTelLinksEnabled}
        />
        <FeatureToggle
          name="attributionReplaceVisibleNumbersEnabled"
          label="Replace visible numbers"
          detail="Swap visible phone-number text with the tracking number."
          defaultChecked={settings.attributionReplaceVisibleNumbersEnabled}
        />
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ActionStateMessage state={state.ok ? undefined : state} />
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Saving..." : "Save feature controls"}
        </button>
      </div>
    </form>
  );
}

function FeatureToggle({
  name,
  label,
  detail,
  defaultChecked,
}: {
  name: keyof AttributionFeatureSettings;
  label: string;
  detail: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <span>
        <span className="block text-sm font-medium text-gray-800 dark:text-white/90">
          {label}
        </span>
        <span className="mt-1 block text-xs leading-5 text-gray-500 dark:text-gray-400">
          {detail}
        </span>
      </span>
      <span className="relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center">
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          className="peer sr-only"
        />
        <span className="absolute inset-0 rounded-full bg-gray-200 transition peer-checked:bg-brand-500 dark:bg-white/10 dark:peer-checked:bg-brand-500" />
        <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white shadow-theme-sm transition peer-checked:translate-x-full" />
      </span>
    </label>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{value}</p>
    </div>
  );
}

function SetupStep({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
      <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{title}</p>
      <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{detail}</p>
    </div>
  );
}

function CodeBlock({ label, code }: { label?: string; code: string }) {
  async function copy() {
    await navigator.clipboard.writeText(code);
  }

  return (
    <div className="mt-4">
      {label && (
        <p className="mb-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
          {label}
        </p>
      )}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-950 dark:border-gray-800">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
          <span className="text-xs font-medium text-gray-400">
            {label ? "Snippet" : "Install snippet"}
          </span>
          <button
            type="button"
            onClick={copy}
            className="rounded-md px-2 py-1 text-xs font-medium text-white hover:bg-white/10"
          >
            Copy
          </button>
        </div>
        <pre className="overflow-x-auto p-4 text-xs leading-5 text-gray-100">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}

function CheckSummary({ result }: { result: CheckResult }) {
  const browser = result.browserCheck;
  const serverConfig = result.serverConfigCheck;
  const rows = [
    ["Page reachable", result.status ? `${result.status}` : "No"],
    ["CRM script reachable", result.scriptReachable ? "Yes" : "No"],
    ["Script installed", result.scriptInstalled ? "Yes" : "No"],
    ["Correct API base", result.correctApiBase ? "Yes" : "No"],
    ["Tel links", `${result.telLinks}`],
    ["Phone text matches", `${result.likelyPhoneText}`],
    ["Forms", `${result.forms}`],
    ["Attribution form fields", `${result.formMarkers}`],
  ];
  const configRows = serverConfig
    ? [
        ["Config request", serverConfig.configLoaded ? "Loaded" : "Failed"],
        [
          "Config decision",
          serverConfig.configEnabled === null
            ? "Unknown"
            : serverConfig.configEnabled
              ? "Enabled"
              : "Disabled",
        ],
      ]
    : [];
  const browserRows = browser
    ? [
        ["Browser execution", browser.available ? "Ran" : "Unavailable"],
        ["Runtime API", browser.scriptApiPresent ? "Present" : "Missing"],
        ["Config request", browser.configLoaded ? "Observed" : "Not observed"],
        [
          "Config decision",
          browser.configEnabled === null
            ? "Unknown"
            : browser.configEnabled
              ? "Enabled"
              : "Disabled",
        ],
        ["Hidden field runtime", browser.hiddenFieldInjected ? "Injected" : "Not seen"],
        ["Phone runtime", browser.phoneNumberApplied ? "Applied" : "Not seen"],
      ]
    : [];

  return (
    <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
            {result.ok ? "Installed correctly" : "Needs attention"}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {result.checkedUrl}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            result.ok
              ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
              : "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
          }`}
        >
          {result.ok ? "Ready" : "Check"}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
            <dd className="font-medium text-gray-800 dark:text-white/90">{value}</dd>
          </div>
        ))}
      </dl>

      {serverConfig && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
          <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
            Config endpoint check
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            {configRows.map(([label, value]) => (
              <div key={label}>
                <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
                <dd className="font-medium text-gray-800 dark:text-white/90">{value}</dd>
              </div>
            ))}
          </dl>
          {serverConfig.configReason && (
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              Domain decision: {serverConfig.configReason}
            </p>
          )}
          {serverConfig.configUrl && (
            <p className="mt-3 break-all text-xs text-gray-500 dark:text-gray-400">
              Config URL: {serverConfig.configUrl}
            </p>
          )}
          {serverConfig.errors.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-gray-600 dark:text-gray-300">
              {serverConfig.errors.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {browser?.attempted && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
          <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
            Browser runtime check
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            {browserRows.map(([label, value]) => (
              <div key={label}>
                <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
                <dd className="font-medium text-gray-800 dark:text-white/90">{value}</dd>
              </div>
            ))}
          </dl>
          {browser.configReason && (
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              Domain decision: {browser.configReason}
            </p>
          )}
          {browser.errors.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-gray-600 dark:text-gray-300">
              {browser.errors.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {result.foundScriptSrc && (
        <p className="mt-4 break-all text-xs text-gray-500 dark:text-gray-400">
          Script found: {result.foundScriptSrc}
        </p>
      )}

      {result.issues.length > 0 && (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-gray-600 dark:text-gray-300">
          {result.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
