"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  createDniRuleAction,
  removeDniRuleAction,
  updateDniRuleAction,
  type DniRuleActionState,
} from "@/lib/actions/dni-rules";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";

export type DniRule = {
  id: string;
  name: string;
  description: string | null;
  matchField: string;
  matchOperator: string;
  matchValue: string | null;
  poolLabel: string | null;
  fallbackNumber: string | null;
  priority: number;
  isActive: boolean;
  isDefault: boolean;
  notes: string | null;
  updatedAt: string;
};

const initialState: DniRuleActionState = { ok: false, message: "", savedAt: null };
const inputClassName =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const textareaClassName =
  "min-h-16 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

export type DniRulesPanelProps = {
  poolLabels: string[];
  rules: DniRule[];
};

export default function DniRulesPanel({
  poolLabels,
  rules,
}: DniRulesPanelProps) {
  const { showToast } = useToast();
  const [createState, createAction, isCreating] = useActionState(
    createDniRuleAction,
    initialState,
  );
  const [updateState, updateAction, isUpdating] = useActionState(
    updateDniRuleAction,
    initialState,
  );
  const [removeState, removeAction, isRemoving] = useActionState(
    removeDniRuleAction,
    initialState,
  );

  useEffect(() => {
    if (createState.savedAt) showToast(createState.message, createState.ok ? "success" : "error");
  }, [createState, showToast]);

  useEffect(() => {
    if (updateState.savedAt) showToast(updateState.message, updateState.ok ? "success" : "error");
  }, [updateState, showToast]);

  useEffect(() => {
    if (removeState.savedAt) showToast(removeState.message, removeState.ok ? "success" : "error");
  }, [removeState, showToast]);

  const activeRules = rules.filter((rule) => rule.isActive);
  const defaultRules = rules.filter((rule) => rule.isDefault);
  const routedRules = rules.filter((rule) => rule.poolLabel);
  const fallbackRules = rules.filter((rule) => rule.fallbackNumber);

  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Active rules" value={activeRules.length.toString()} detail={`${rules.length} total rules`} />
        <Metric label="Default rules" value={defaultRules.length.toString()} detail="Used when no match wins" />
        <Metric label="Pool routes" value={routedRules.length.toString()} detail="Rules selecting a number pool" />
        <Metric label="Fallback numbers" value={fallbackRules.length.toString()} detail="Rules with fixed fallback" />
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">
          Dynamic number insertion
        </p>
        <div className="mt-2 flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Add DNI rule
          </h2>
          <LazyHelpTooltip content="DNI rules decide which tracking pool or fallback number a visitor gets based on UTM, referrer or page data." />
        </div>
        <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
          Match visitor source data and route the session to a specific tracking pool.
        </p>

        <form action={createAction} className="mt-4 space-y-4">
          <RuleFields poolLabels={poolLabels} />
          <div>
            <ActionStateMessage state={createState.message ? createState : undefined} />
          </div>
          <div className="flex justify-end border-t border-gray-100 pt-4 dark:border-gray-800">
            <button
              type="submit"
              disabled={isCreating}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCreating ? "Adding..." : "Add DNI rule"}
            </button>
          </div>
        </form>
      </section>

      <DniRulePreview rules={rules} />

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 p-4 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Saved DNI rules
            </h2>
            <LazyHelpTooltip content="Lists saved DNI routing rules in priority order so users can edit, disable or check which fallback rule will win." />
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Rules run by priority. Default rules are used when no specific match wins.
          </p>
          {defaultRules.length > 1 && (
            <div className="mt-4 rounded-xl border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800 dark:border-warning-900/40 dark:bg-warning-900/20 dark:text-warning-200">
              More than one default rule is active. The highest priority default will win, but keeping one default rule makes fallback routing easier to reason about.
            </div>
          )}
        </div>

        {rules.length ? (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {rules.map((rule, index) => (
              <form
                key={rule.id}
                action={updateAction}
                className="grid gap-4 p-4 xl:grid-cols-[300px_minmax(0,1fr)]"
              >
                <input type="hidden" name="id" value={rule.id} />
                <RuleSummary index={index + 1} rule={rule} />
                <div className="space-y-4">
                  <RuleFields poolLabels={poolLabels} rule={rule} />
                  <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="submit"
                        disabled={isUpdating}
                        className="inline-flex h-9 items-center justify-center rounded-lg bg-brand-500 px-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Save rule
                      </button>
                      <button
                        type="submit"
                        formAction={removeAction}
                        disabled={isRemoving}
                        className="inline-flex h-9 items-center justify-center rounded-lg border border-error-200 bg-white px-3 text-sm font-semibold text-error-600 hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-error-900/40 dark:bg-gray-900 dark:text-error-300 dark:hover:bg-error-900/20"
                      >
                        Remove
                      </button>
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Last updated {formatDate(rule.updatedAt)}
                    </span>
                  </div>
                </div>
              </form>
            ))}
          </div>
        ) : (
          <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
            No DNI rules yet. Add a rule to route visitors into a specific tracking pool.
          </p>
        )}

        <div className="border-t border-gray-100 p-4 dark:border-gray-800">
          <ActionStateMessage state={updateState.message ? updateState : removeState.message ? removeState : undefined} />
        </div>
      </section>
    </div>
  );
}

function RuleFields({
  poolLabels,
  rule,
}: {
  poolLabels: string[];
  rule?: DniRule;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_120px]">
        <Field label="Rule name">
          <input name="name" defaultValue={rule?.name ?? ""} className={inputClassName} required />
        </Field>
        <Field label="Priority">
          <input
            name="priority"
            type="number"
            min={0}
            max={999}
            defaultValue={rule?.priority ?? 10}
            className={inputClassName}
          />
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Match field">
          <select name="matchField" defaultValue={rule?.matchField ?? "utm_source"} className={inputClassName}>
            <option value="utm_source">UTM source</option>
            <option value="utm_medium">UTM medium</option>
            <option value="utm_campaign">UTM campaign</option>
            <option value="referrer">Referrer</option>
            <option value="landingPage">Landing page</option>
            <option value="currentPage">Current page</option>
          </select>
        </Field>
        <Field label="Operator">
          <select name="matchOperator" defaultValue={rule?.matchOperator ?? "contains"} className={inputClassName}>
            <option value="contains">Contains</option>
            <option value="equals">Equals</option>
            <option value="starts-with">Starts with</option>
            <option value="ends-with">Ends with</option>
          </select>
        </Field>
        <Field label="Match value">
          <input
            name="matchValue"
            defaultValue={rule?.matchValue ?? ""}
            placeholder="google, cpc, /landing-page"
            className={inputClassName}
          />
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field
          label="Tracking pool"
          help="The pool selected when this rule matches; leave empty only when this rule should use a fixed fallback number."
        >
          <select name="poolLabel" defaultValue={rule?.poolLabel ?? ""} className={inputClassName}>
            <option value="">No pool selected</option>
            {poolLabels.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Fallback number"
          help="A fallback is returned when the rule should use a fixed number or no pool number can be assigned."
        >
          <input
            name="fallbackNumber"
            defaultValue={rule?.fallbackNumber ?? ""}
            placeholder="+441234567890"
            className={inputClassName}
          />
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-[180px_220px]">
        <CheckboxField name="isActive" defaultChecked={rule?.isActive ?? true}>
          Active
        </CheckboxField>
        <CheckboxField name="isDefault" defaultChecked={rule?.isDefault ?? false}>
          <span>Default rule</span>
          <LazyHelpTooltip content="A default rule is used only when no specific active rule matches the visitor." />
        </CheckboxField>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Description">
          <textarea name="description" defaultValue={rule?.description ?? ""} className={textareaClassName} />
        </Field>
        <Field label="Notes">
          <textarea name="notes" defaultValue={rule?.notes ?? ""} className={textareaClassName} />
        </Field>
      </div>
    </div>
  );
}

function RuleSummary({ index, rule }: { index: number; rule: DniRule }) {
  const route = rule.poolLabel || rule.fallbackNumber || "No route configured";
  const match = rule.isDefault
    ? "Default fallback"
    : `${fieldLabel(rule.matchField)} ${operatorLabel(rule.matchOperator).toLowerCase()} ${
        rule.matchValue || "no value"
      }`;

  return (
    <div className="h-fit rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white dark:bg-white dark:text-gray-900">
              {index}
            </span>
            <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
              {rule.name}
            </p>
            <StatusPill tone={rule.isActive ? "success" : "muted"}>
              {rule.isActive ? "Active" : "Inactive"}
            </StatusPill>
            {rule.isDefault && <StatusPill tone="warning">Default</StatusPill>}
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Priority {rule.priority} / {match}
          </p>
        </div>
        <div className="min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
          <span className="font-semibold text-gray-800 dark:text-white/90">Routes to </span>
          <span className="break-words">{route}</span>
        </div>
      </div>
      {rule.description && (
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">{rule.description}</p>
      )}
    </div>
  );
}

function DniRulePreview({ rules }: { rules: DniRule[] }) {
  const [url, setUrl] = useState("https://example.com/?utm_source=google&utm_medium=cpc");
  const [referrer, setReferrer] = useState("https://www.google.com/");
  const [landingPage, setLandingPage] = useState("https://example.com/");
  const activeRules = useMemo(
    () =>
      [...rules]
        .filter((rule) => rule.isActive)
        .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name)),
    [rules],
  );
  const result = useMemo(
    () => previewDniRule({ activeRules, landingPage, referrer, url }),
    [activeRules, landingPage, referrer, url],
  );

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">
          Preview
        </p>
        <div className="mt-2 flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Test rule matching
          </h2>
          <LazyHelpTooltip content="Preview lets you test sample visitor data before relying on a rule in production." />
        </div>
        <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
          Enter sample visitor data to see which DNI rule would route the session.
        </p>
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid content-start gap-3 md:grid-cols-2">
          <Field label="Current URL">
            <input value={url} onChange={(event) => setUrl(event.target.value)} className={inputClassName} />
          </Field>
          <Field label="Referrer">
            <input
              value={referrer}
              onChange={(event) => setReferrer(event.target.value)}
              className={inputClassName}
            />
          </Field>
          <Field label="Landing page">
            <input
              value={landingPage}
              onChange={(event) => setLandingPage(event.target.value)}
              className={inputClassName}
            />
          </Field>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                Matched rule
              </p>
              <p className="mt-1 text-base font-semibold text-gray-800 dark:text-white/90">
                {result.rule?.name ?? "No rule matched"}
              </p>
            </div>
            <StatusPill tone={result.rule ? "success" : "warning"}>
              {result.rule ? "Matched" : "Fallback"}
            </StatusPill>
          </div>
          <div className="mt-3 grid gap-2 text-sm text-gray-600 dark:text-gray-300">
            <PreviewDetail label="Priority" value={result.rule ? String(result.rule.priority) : "n/a"} />
            <PreviewDetail label="Match" value={result.reason} />
            <PreviewDetail label="Pool" value={result.rule?.poolLabel || "No pool selected"} />
            <PreviewDetail label="Fallback" value={result.rule?.fallbackNumber || "CRM default fallback"} />
          </div>
        </div>
      </div>
    </section>
  );
}

function previewDniRule({
  activeRules,
  landingPage,
  referrer,
  url,
}: {
  activeRules: DniRule[];
  landingPage: string;
  referrer: string;
  url: string;
}) {
  const defaultRule = activeRules.find((rule) => rule.isDefault) ?? null;

  for (const rule of activeRules) {
    if (rule.isDefault) continue;

    const value = previewFieldValue(rule.matchField, { landingPage, referrer, url });
    if (value && rule.matchValue && previewRuleMatches(rule.matchOperator, value, rule.matchValue)) {
      return { rule, reason: `${rule.matchField} ${rule.matchOperator} ${rule.matchValue}` };
    }
  }

  if (defaultRule) {
    return { rule: defaultRule, reason: "Default rule" };
  }

  return { rule: null, reason: "No active rule matched the sample data" };
}

function previewFieldValue(
  field: string,
  sample: { landingPage: string; referrer: string; url: string },
) {
  if (field === "referrer") return sample.referrer;
  if (field === "landingPage") return sample.landingPage;
  if (field === "currentPage") return sample.url;

  if (field.startsWith("utm_")) {
    try {
      return new URL(sample.url).searchParams.get(field) ?? "";
    } catch {
      return "";
    }
  }

  return "";
}

function previewRuleMatches(operator: string, sourceValue: string, matchValue: string) {
  const source = sourceValue.toLowerCase();
  const match = matchValue.toLowerCase();

  if (operator === "equals") return source === match;
  if (operator === "starts-with") return source.startsWith(match);
  if (operator === "ends-with") return source.endsWith(match);
  return source.includes(match);
}

function fieldLabel(field: string) {
  if (field === "utm_source") return "UTM source";
  if (field === "utm_medium") return "UTM medium";
  if (field === "utm_campaign") return "UTM campaign";
  if (field === "referrer") return "Referrer";
  if (field === "landingPage") return "Landing page";
  if (field === "currentPage") return "Current page";
  return field;
}

function operatorLabel(operator: string) {
  if (operator === "starts-with") return "Starts with";
  if (operator === "ends-with") return "Ends with";
  if (operator === "equals") return "Equals";
  return "Contains";
}

function PreviewDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-2.5 dark:border-gray-800 dark:bg-gray-900">
      <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-gray-800 dark:text-white/90">
        {value}
      </p>
    </div>
  );
}

function StatusPill({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "muted" | "success" | "warning";
}) {
  const className =
    tone === "success"
      ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
      : tone === "warning"
        ? "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
        : "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300";

  return (
    <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      {children}
    </span>
  );
}

function Metric({ detail, label, value }: { detail: string; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-xl font-semibold text-gray-800 dark:text-white/90">{value}</p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{detail}</p>
    </div>
  );
}

function CheckboxField({
  children,
  defaultChecked,
  name,
}: {
  children: ReactNode;
  defaultChecked: boolean;
  name: string;
}) {
  return (
    <label className="flex h-10 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 dark:border-gray-800 dark:text-gray-300">
      <input
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
      />
      <span className="flex min-w-0 items-center gap-2">{children}</span>
    </label>
  );
}

function Field({
  children,
  help,
  label,
}: {
  children: ReactNode;
  help?: string;
  label: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        <span>{label}</span>
        {help && <LazyHelpTooltip content={help} />}
      </span>
      {children}
    </label>
  );
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
