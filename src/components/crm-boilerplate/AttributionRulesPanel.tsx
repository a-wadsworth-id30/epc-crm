"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  createAttributionRuleAction,
  removeAttributionRuleAction,
  updateAttributionRuleAction,
} from "@/lib/actions/attribution-rules";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";

export type AttributionRulesOverview = {
  formRecords: number;
  phoneRecords: number;
  recordsWithUtmSource: number;
  recordsWithTimeline: number;
  snapshotsWithReferrer: number;
  savedRules: Array<{
    id: string;
    name: string;
    ruleType: string;
    matchField: string;
    matchOperator: string;
    matchValue: string;
    outputSource: string | null;
    outputChannel: string | null;
    outputCampaign: string | null;
    priority: number;
    isActive: boolean;
    notes: string | null;
    previewMatches: number;
    updatedAt: string;
  }>;
  recentRules: Array<{
    id: string;
    submittedSource: string | null;
    utmSource: string | null;
    resolvedSource: string;
    campaign: string | null;
    medium: string | null;
    landingPage: string | null;
    currentPage: string | null;
    referrer: string | null;
    touchpoints: number;
    createdAt: string;
  }>;
};

const fallbackSteps = [
  {
    label: "Submitted source",
    detail: "If a website form sends source, the CRM uses that value first.",
    example: "Google Ads",
  },
  {
    label: "UTM source",
    detail: "If source is blank, lastTouch.params.utm_source is used when available.",
    example: "google",
  },
  {
    label: "Website",
    detail: "If no explicit source exists, the opportunity source falls back to Website.",
    example: "Website",
  },
];

const touchpointRows = [
  ["First touch", "Original entry point, landing page, referrer and campaign parameters."],
  ["Last touch", "Most recent page view and source/campaign parameters before conversion."],
  ["Timeline", "Ordered browser-side touchpoints capped by Session Settings."],
  ["Lead record", "Snapshot metadata is copied onto contacts, opportunities and attribution records."],
];

const futureRules = [
  ["Channel grouping", "Map sources into Paid Search, Organic, Social, Direct and referral groups."],
  ["Campaign naming", "Normalize campaign names and handle ad-platform click identifiers."],
  ["Attribution model", "Choose first-touch, last-touch or blended reporting views per client."],
  ["Rule priority", "Store ordered rules so specific campaign mappings win before generic fallbacks."],
];

export default function AttributionRulesPanel({
  overview,
}: {
  overview: AttributionRulesOverview;
}) {
  const { showToast } = useToast();
  const [createState, createAction, isCreating] = useActionState(
    createAttributionRuleAction,
    { ok: false, message: "", savedAt: null },
  );
  const [previewRule, setPreviewRule] = useState({
    matchField: "utm_source",
    matchOperator: "contains",
    matchValue: "google",
    outputSource: "Paid Search",
    outputCampaign: "",
  });
  const [previewInput, setPreviewInput] = useState({
    submittedSource: "",
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "brand-search",
    referrer: "https://www.google.com/",
    landingPage: "/?utm_source=google&utm_medium=cpc&utm_campaign=brand-search",
    currentPage: "/contact",
  });
  const previewResult = useMemo(
    () => sourceRulePreview(previewRule, previewInput),
    [previewInput, previewRule],
  );

  useEffect(() => {
    if (createState.ok && createState.savedAt) {
      showToast(createState.message || "Attribution rule added.");
    }
  }, [createState.message, createState.ok, createState.savedAt, showToast]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
            Tracking engine
          </p>
          <div className="mt-2 flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Source and campaign rules
            </h2>
            <LazyHelpTooltip content="Explains how the CRM chooses a source or campaign value when forms, UTMs and fallback rules provide different signals." />
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
            Review how source values are selected today, how touchpoints are preserved, and what rule storage should support next.
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Metric label="Form records" value={overview.formRecords.toString()} />
          <Metric label="Phone records" value={overview.phoneRecords.toString()} />
          <Metric label="UTM sources" value={overview.recordsWithUtmSource.toString()} />
          <Metric label="Timelines" value={overview.recordsWithTimeline.toString()} />
          <Metric label="Referrers" value={overview.snapshotsWithReferrer.toString()} />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Current source fallback
            </h3>
            <LazyHelpTooltip content="Shows the order used to choose a source when a lead does not provide complete campaign data." />
          </div>
          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
            The lead endpoint resolves an opportunity source using the first non-empty value in this order.
          </p>
          <div className="mt-5 space-y-3">
            {fallbackSteps.map((step, index) => (
              <div
                key={step.label}
                className="grid gap-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800 sm:grid-cols-[38px_minmax(0,1fr)]"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700 dark:bg-brand-900/20 dark:text-brand-300">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                      {step.label}
                    </p>
                    <code className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                      {step.example}
                    </code>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
                    {step.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Touchpoint model
            </h3>
            <LazyHelpTooltip content="Describes the browser-side data that explains where a visitor started and what happened before conversion." />
          </div>
          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
            The browser payload keeps enough context to explain where a lead started and what happened before conversion.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {touchpointRows.map(([title, detail]) => (
              <div key={title} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                  {title}
                </p>
                <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
                  {detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
                Recent source decisions
              </h3>
              <LazyHelpTooltip content="Shows recent attribution records and the source value the CRM resolved for each conversion." />
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Recent attribution records with the submitted source, UTM source and resolved fallback result.
            </p>
          </div>
          {overview.recentRules.length ? (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {overview.recentRules.map((rule) => (
                <RecentRuleRow key={rule.id} rule={rule} />
              ))}
            </div>
          ) : (
            <p className="p-5 text-sm text-gray-500 dark:text-gray-400">
              No attribution records have been captured yet.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Add source rule
            </h3>
            <LazyHelpTooltip content="Creates an override rule for normalising source data before the default attribution fallback logic runs." />
          </div>
          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
            Create active source override rules that run before the standard submitted source, UTM source and Website fallback.
          </p>
          <form action={createAction} className="mt-5 space-y-3">
            <input
              name="name"
              required
              placeholder="Google Ads source"
              className={fieldClass}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                name="matchField"
                value={previewRule.matchField}
                onChange={(event) =>
                  setPreviewRule((current) => ({
                    ...current,
                    matchField: event.target.value,
                  }))
                }
                className={fieldClass}
              >
                <option value="submittedSource">Submitted source</option>
                <option value="utm_source">UTM source</option>
                <option value="utm_medium">UTM medium</option>
                <option value="utm_campaign">UTM campaign</option>
                <option value="referrer">Referrer</option>
                <option value="landingPage">Landing page</option>
                <option value="currentPage">Current page</option>
              </select>
              <select
                name="matchOperator"
                value={previewRule.matchOperator}
                onChange={(event) =>
                  setPreviewRule((current) => ({
                    ...current,
                    matchOperator: event.target.value,
                  }))
                }
                className={fieldClass}
              >
                <option value="contains">Contains</option>
                <option value="equals">Equals</option>
                <option value="starts-with">Starts with</option>
              </select>
            </div>
            <input
              name="matchValue"
              required
              value={previewRule.matchValue}
              onChange={(event) =>
                setPreviewRule((current) => ({
                  ...current,
                  matchValue: event.target.value,
                }))
              }
              placeholder="google"
              className={fieldClass}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                name="outputSource"
                required
                value={previewRule.outputSource}
                onChange={(event) =>
                  setPreviewRule((current) => ({
                    ...current,
                    outputSource: event.target.value,
                  }))
                }
                placeholder="Paid Search"
                className={fieldClass}
              />
              <input
                name="priority"
                type="number"
                min="0"
                max="999"
                defaultValue="10"
                className={fieldClass}
              />
            </div>
            <input
              name="notes"
              placeholder="Optional notes"
              className={fieldClass}
            />
            <div className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.03]">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                  Rule preview
                </p>
                <LazyHelpTooltip content="Tests this unsaved rule against sample visitor values before you add it." />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <PreviewInput
                  label="Submitted source"
                  name="submittedSource"
                  values={previewInput}
                  onChange={setPreviewInput}
                />
                <PreviewInput
                  label="UTM source"
                  name="utm_source"
                  values={previewInput}
                  onChange={setPreviewInput}
                />
                <PreviewInput
                  label="UTM medium"
                  name="utm_medium"
                  values={previewInput}
                  onChange={setPreviewInput}
                />
                <PreviewInput
                  label="UTM campaign"
                  name="utm_campaign"
                  values={previewInput}
                  onChange={setPreviewInput}
                />
                <PreviewInput
                  label="Referrer"
                  name="referrer"
                  values={previewInput}
                  onChange={setPreviewInput}
                />
                <PreviewInput
                  label="Landing page"
                  name="landingPage"
                  values={previewInput}
                  onChange={setPreviewInput}
                />
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950/20">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      previewResult.matches
                        ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
                        : "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300"
                    }`}
                  >
                    {previewResult.matches ? "Rule matches" : "No match"}
                  </span>
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-900/20 dark:text-brand-300">
                    Source: {previewResult.source}
                  </span>
                  {previewResult.campaign ? (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 dark:bg-white/10 dark:text-gray-300">
                      Campaign: {previewResult.campaign}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Tested value: {previewResult.testedValue || "empty"}.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <ActionStateMessage state={createState.ok ? undefined : createState} />
              <button
                type="submit"
                disabled={isCreating}
                className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCreating ? "Adding..." : "Add rule"}
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Saved rules
            </h3>
            <LazyHelpTooltip content="Lists active and inactive source rules, their priority, and how many recent records they would match." />
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Active rules are evaluated by priority before fallback source logic.
          </p>
        </div>
        {overview.savedRules.length ? (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {overview.savedRules.map((rule) => (
              <SavedRuleRow key={rule.id} rule={rule} />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
            {futureRules.map(([title, detail]) => (
              <div key={title} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                  {title}
                </p>
                <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
                  {detail}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const fieldClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90";

type PreviewInputValues = {
  submittedSource: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  referrer: string;
  landingPage: string;
  currentPage: string;
};

function PreviewInput({
  label,
  name,
  onChange,
  values,
}: {
  label: string;
  name: keyof PreviewInputValues;
  onChange: (value: PreviewInputValues) => void;
  values: PreviewInputValues;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
        {label}
      </span>
      <input
        value={values[name]}
        onChange={(event) =>
          onChange({
            ...values,
            [name]: event.target.value,
          })
        }
        className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-800 outline-none focus:border-brand-500 dark:border-gray-800 dark:bg-gray-950/20 dark:text-white/90"
      />
    </label>
  );
}

function sourceRulePreview(
  rule: {
    matchField: string;
    matchOperator: string;
    matchValue: string;
    outputCampaign: string;
    outputSource: string;
  },
  input: PreviewInputValues,
) {
  const testedValue = String(input[rule.matchField as keyof PreviewInputValues] ?? "");
  const matches = ruleMatches(testedValue, rule.matchOperator, rule.matchValue);
  const fallbackSource = input.submittedSource || input.utm_source || "Website";

  return {
    campaign: matches && rule.outputCampaign ? rule.outputCampaign : input.utm_campaign,
    matches,
    source: matches && rule.outputSource ? rule.outputSource : fallbackSource,
    testedValue,
  };
}

function ruleMatches(value: string, operator: string, matchValue: string) {
  const source = value.trim().toLowerCase();
  const match = matchValue.trim().toLowerCase();

  if (!match) return false;
  if (operator === "equals") return source === match;
  if (operator === "starts-with") return source.startsWith(match);
  return source.includes(match);
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
        {value}
      </p>
    </div>
  );
}

function RecentRuleRow({
  rule,
}: {
  rule: AttributionRulesOverview["recentRules"][number];
}) {
  return (
    <div className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-success-50 px-2 py-0.5 text-xs font-semibold text-success-700 dark:bg-success-900/20 dark:text-success-300">
            {rule.resolvedSource}
          </span>
          {rule.campaign && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
              {rule.campaign}
            </span>
          )}
          {rule.medium && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
              {rule.medium}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {formatDate(rule.createdAt)}
        </p>
      </div>
      <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
        <MiniDetail label="Submitted" value={rule.submittedSource || "None"} />
        <MiniDetail label="UTM source" value={rule.utmSource || "None"} />
        <MiniDetail label="Touchpoints" value={rule.touchpoints.toString()} />
      </div>
      <p className="mt-3 truncate text-xs text-gray-500 dark:text-gray-400">
        {rule.currentPage || rule.landingPage || "No page captured"}
      </p>
      {rule.referrer && (
        <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
          Referrer: {rule.referrer}
        </p>
      )}
    </div>
  );
}

function MiniDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800">
      <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-1 truncate font-medium text-gray-800 dark:text-white/90">
        {value}
      </p>
    </div>
  );
}

function SavedRuleRow({
  rule,
}: {
  rule: AttributionRulesOverview["savedRules"][number];
}) {
  const [state, action, isPending] = useActionState(removeAttributionRuleAction, {
    ok: false,
    message: "",
    savedAt: null,
  });
  const [updateState, updateAction, isUpdating] = useActionState(
    updateAttributionRuleAction,
    {
      ok: false,
      message: "",
      savedAt: null,
    },
  );
  const { showToast } = useToast();

  useEffect(() => {
    if (state.ok && state.savedAt) {
      showToast(state.message || "Attribution rule removed.");
    }
    if (updateState.ok && updateState.savedAt) {
      showToast(updateState.message || "Attribution rule updated.");
    }
  }, [
    showToast,
    state.message,
    state.ok,
    state.savedAt,
    updateState.message,
    updateState.ok,
    updateState.savedAt,
  ]);

  return (
    <div className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
      <form action={updateAction} className="min-w-0">
        <input type="hidden" name="id" value={rule.id} />
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
            {rule.name}
          </p>
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-900/20 dark:text-brand-300">
            Priority {rule.priority}
          </span>
          <span className="rounded-full bg-success-50 px-2 py-0.5 text-xs font-semibold text-success-700 dark:bg-success-900/20 dark:text-success-300">
            {rule.isActive ? "Active" : "Inactive"}
          </span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
            {rule.previewMatches} recent matches
          </span>
        </div>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          If {rule.matchField} {rule.matchOperator} {rule.matchValue}, use {rule.outputSource || "fallback source"}.
        </p>
        {rule.notes && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{rule.notes}</p>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-[110px_minmax(0,180px)_minmax(0,1fr)_auto]">
          <label className="flex h-10 items-center gap-2 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 dark:border-gray-800 dark:text-gray-300">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={rule.isActive}
              className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
            />
            Active
          </label>
          <input
            name="priority"
            type="number"
            min="0"
            max="999"
            defaultValue={rule.priority}
            className={fieldClass}
          />
          <input
            name="outputSource"
            defaultValue={rule.outputSource ?? ""}
            placeholder="Output source"
            className={fieldClass}
          />
          <button
            type="submit"
            disabled={isUpdating}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
          >
            {isUpdating ? "Saving..." : "Save"}
          </button>
        </div>
        <div className="mt-2">
          <ActionStateMessage state={updateState.ok ? undefined : updateState} />
        </div>
      </form>
      <form action={action} className="flex flex-col gap-2 xl:items-end">
        <input type="hidden" name="id" value={rule.id} />
        <button
          type="submit"
          disabled={isPending}
          onClick={(event) => {
            if (!window.confirm(`Remove attribution rule "${rule.name}"?`)) {
              event.preventDefault();
            }
          }}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-error-200 bg-white px-3 text-sm font-medium text-error-700 hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-error-900/50 dark:bg-gray-900 dark:text-error-300 dark:hover:bg-error-900/20"
        >
          Remove
        </button>
        <ActionStateMessage state={state.ok ? undefined : state} />
      </form>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
