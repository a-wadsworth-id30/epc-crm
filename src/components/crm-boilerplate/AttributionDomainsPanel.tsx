"use client";

import type { ReactNode } from "react";
import { useActionState, useEffect } from "react";
import {
  createAttributionDomainAction,
  updateAttributionDomainAction,
  type AttributionDomainActionState,
} from "@/lib/actions/attribution-domains";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";

type AttributionDomainRow = {
  id: string;
  domain: string;
  label: string | null;
  environment: string;
  isActive: boolean;
  lastConfigRequestAt: string | null;
  lastScriptSeenAt: string | null;
  lastInstallCheckAt: string | null;
  lastInstallStatus: string | null;
  lastInstallUrl: string | null;
  trackingEnabled: boolean | null;
  consentRequired: boolean | null;
  formTrackingEnabled: boolean | null;
  phoneTrackingEnabled: boolean | null;
  visibleNumberReplacementEnabled: boolean | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  installChecks: Array<{
    id: string;
    checkedUrl: string;
    status: string;
    httpStatus: number | null;
    issues: unknown;
    createdAt: string;
  }>;
};

const initialState: AttributionDomainActionState = {
  ok: false,
  message: "",
  savedAt: null,
};

const environments = [
  { value: "production", label: "Production" },
  { value: "staging", label: "Staging" },
  { value: "development", label: "Development" },
  { value: "microsite", label: "Microsite" },
];
const tableMinWidth = "min-w-[980px]";
const tableGrid =
  "grid grid-cols-[minmax(280px,1.35fr)_120px_150px_minmax(220px,1fr)_150px] gap-4";
const fieldClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90";

export default function AttributionDomainsPanel({
  domains,
  registryUnavailable = false,
}: {
  domains: AttributionDomainRow[];
  registryUnavailable?: boolean;
}) {
  const { showToast } = useToast();
  const [createState, createAction, isCreating] = useActionState(
    createAttributionDomainAction,
    initialState,
  );
  const domainHealth = domains.map(domainHealthScore);
  const activeDomains = domains.filter((domain) => domain.isActive).length;
  const productionDomains = domains.filter(
    (domain) => domain.isActive && domain.environment === "production",
  ).length;
  const healthyDomains = domainHealth.filter((health) => health.status === "Healthy").length;
  const attentionDomains = domainHealth.filter((health) => health.status === "Needs attention").length;

  useEffect(() => {
    if (createState.ok && createState.savedAt) {
      showToast(createState.message || "Domain added.");
    }
  }, [createState.message, createState.ok, createState.savedAt, showToast]);

  return (
    <div className="space-y-6">
      {registryUnavailable && (
        <RegistryUnavailableNotice />
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Listed domains" value={domains.length.toString()} />
        <Metric label="Active domains" value={activeDomains.toString()} />
        <Metric label="Production domains" value={productionDomains.toString()} />
        <Metric
          label="Domain health"
          value={`${healthyDomains}/${domains.length}`}
          detail={`${attentionDomains} need attention`}
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Add domain
            </h2>
            <LazyHelpTooltip content="Registers a website that is allowed to load CRM attribution settings from the tracking script." />
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Register each website that should run the CRM attribution script. When domains exist here, unlisted or inactive domains receive disabled script settings.
          </p>
        </div>

        {registryUnavailable ? (
          <p className="p-5 text-sm text-gray-500 dark:text-gray-400">
            Add domain is unavailable until the production database migrations have been applied.
          </p>
        ) : (
          <>
            <form action={createAction} className="p-5">
              <div className="grid gap-4 xl:grid-cols-[minmax(220px,1.2fr)_160px_minmax(180px,0.9fr)_minmax(220px,1fr)_auto] xl:items-end">
                  <Field label="Domain or URL">
                    <input
                      name="domain"
                      required
                      placeholder="example.com"
                      className={fieldClass}
                    />
                  </Field>
                  <Field label="Environment">
                    <select
                      name="environment"
                      defaultValue="production"
                      className={fieldClass}
                    >
                      {environments.map((environment) => (
                        <option key={environment.value} value={environment.value}>
                          {environment.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Label">
                    <input
                      name="label"
                      placeholder="Main website"
                      className={fieldClass}
                    />
                  </Field>
                  <Field label="Notes">
                    <input
                      name="notes"
                      placeholder="Optional rollout notes"
                      className={fieldClass}
                    />
                  </Field>
                  <div>
                    <button
                      type="submit"
                      disabled={isCreating}
                      className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60 xl:w-auto"
                    >
                      {isCreating ? "Adding..." : "Add"}
                    </button>
                  </div>
              </div>
              <div className="mt-4">
                <ActionStateMessage state={createState.ok ? undefined : createState} />
              </div>
            </form>
          </>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Domain registry
            </h2>
            <LazyHelpTooltip content="Lists approved attribution domains, their rollout status and the latest script activity seen from each website." />
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Active domains can run attribution tracking; inactive domains keep their notes but disable the script configuration.
          </p>
        </div>

        {registryUnavailable ? (
          <p className="p-5 text-sm text-gray-500 dark:text-gray-400">
            Domain registry is unavailable until the production database migrations have been applied.
          </p>
        ) : domains.length ? (
          <div className="overflow-x-auto">
            <div className={tableMinWidth}>
              <DomainTableHeader actionLabel="Actions" />
              {domains.map((domain) => (
                <DomainEditor key={domain.id} domain={domain} />
              ))}
            </div>
          </div>
        ) : (
          <p className="p-5 text-sm text-gray-500 dark:text-gray-400">
            No attribution domains have been added yet.
          </p>
        )}
      </section>
    </div>
  );
}

function DomainEditor({ domain }: { domain: AttributionDomainRow }) {
  const { showToast } = useToast();
  const [state, action, isPending] = useActionState(
    updateAttributionDomainAction,
    initialState,
  );

  useEffect(() => {
    if (state.ok && state.savedAt) {
      showToast(state.message || "Domain updated.");
    }
  }, [showToast, state.message, state.ok, state.savedAt]);

  return (
    <form
      action={action}
      className="border-b border-gray-100 px-5 py-4 last:border-b-0 dark:border-gray-800"
    >
      <input type="hidden" name="id" value={domain.id} />
      <div className={tableGrid}>
        <div className="min-w-0">
          <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400 xl:hidden">
            Domain
          </span>
          <div className="min-h-11 rounded-lg border border-transparent py-1">
            <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
              {domain.domain}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span>{domain.label?.trim() || "No label"}</span>
              <span className="h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-700" aria-hidden="true" />
              <span>Added {formatDate(domain.createdAt)}</span>
            </div>
          </div>
        </div>
        <div>
          <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400 xl:hidden">
            Status
          </span>
          <label className="flex h-11 select-none items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 dark:border-gray-800 dark:text-gray-300">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                domain.isActive
                  ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
                  : "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300"
              }`}
            >
              {domain.isActive ? "Active" : "Inactive"}
            </span>
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={domain.isActive}
              className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
              aria-label={`Set ${domain.domain} active`}
            />
          </label>
        </div>
        <Field label="Environment" compact>
          <select
            name="environment"
            defaultValue={domain.environment}
            className={fieldClass}
          >
            {environments.map((environment) => (
              <option key={environment.value} value={environment.value}>
                {environment.label}
              </option>
            ))}
          </select>
        </Field>
        <DomainHealth domain={domain} />
        <div className="flex flex-col gap-2 xl:items-end">
          <button
            type="submit"
            name="intent"
            value="save"
            disabled={isPending}
            className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05] xl:w-full"
          >
            {isPending ? "Saving..." : "Save"}
          </button>
          <button
            type="submit"
            name="intent"
            value="remove"
            disabled={isPending}
            onClick={(event) => {
              if (!window.confirm(`Remove ${domain.domain} from the attribution domain registry?`)) {
                event.preventDefault();
              }
            }}
            className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-error-200 bg-white px-3 text-sm font-medium text-error-700 hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-error-900/50 dark:bg-gray-900 dark:text-error-300 dark:hover:bg-error-900/20"
          >
            Remove
          </button>
          <ActionStateMessage state={state.ok ? undefined : state} />
        </div>
      </div>
      <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
              Domain details
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Domain">
                <input
                  name="domain"
                  required
                  defaultValue={domain.domain}
                  className={fieldClass}
                />
              </Field>
              <Field label="Label">
                <input
                  name="label"
                  defaultValue={domain.label ?? ""}
                  placeholder="Optional label"
                  className={fieldClass}
                />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Notes">
                <textarea
                  name="notes"
                  defaultValue={domain.notes ?? ""}
                  placeholder="Optional rollout notes"
                  className="min-h-[92px] w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                />
              </Field>
            </div>
          </div>
          <div>
            <p className="mb-3 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
              Domain overrides
            </p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <OverrideSelect
                label="Tracking"
                name="trackingEnabled"
                value={domain.trackingEnabled}
              />
              <OverrideSelect
                label="Consent"
                name="consentRequired"
                value={domain.consentRequired}
                onLabel="Required"
                offLabel="Optional"
              />
              <OverrideSelect
                label="Forms"
                name="formTrackingEnabled"
                value={domain.formTrackingEnabled}
              />
              <OverrideSelect
                label="Phone"
                name="phoneTrackingEnabled"
                value={domain.phoneTrackingEnabled}
              />
              <OverrideSelect
                label="Visible numbers"
                name="visibleNumberReplacementEnabled"
                value={domain.visibleNumberReplacementEnabled}
              />
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Last updated {formatDate(domain.updatedAt)}.
        </p>
        {domain.installChecks.length ? (
          <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-800">
            <p className="mb-3 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
              Recent install checks
            </p>
            <div className="space-y-2">
              {domain.installChecks.map((check) => (
                <div
                  key={check.id}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs dark:border-gray-800 dark:bg-gray-900"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${installStatusClasses(check.status)}`}>
                      {check.status}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">
                      {relativeDate(check.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 truncate font-medium text-gray-700 dark:text-gray-300">
                    {check.checkedUrl}
                  </p>
                  <p className="mt-1 text-gray-500 dark:text-gray-400">
                    HTTP {check.httpStatus ?? "-"} · {installIssueSummary(check.issues)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </form>
  );
}

function OverrideSelect({
  label,
  name,
  value,
  onLabel = "On",
  offLabel = "Off",
}: {
  label: string;
  name: string;
  value: boolean | null;
  onLabel?: string;
  offLabel?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
        {label}
      </span>
      <select
        name={name}
        defaultValue={value === null ? "inherit" : value ? "on" : "off"}
        className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-xs text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90"
      >
        <option value="inherit">Inherit</option>
        <option value="on">{onLabel}</option>
        <option value="off">{offLabel}</option>
      </select>
    </label>
  );
}

function DomainTableHeader({ actionLabel }: { actionLabel: "Action" | "Actions" }) {
  return (
    <div className={`${tableGrid} border-b border-gray-200 bg-gray-50 px-5 py-3 text-xs font-semibold uppercase text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400`}>
      <span>Domain</span>
      <span>Status</span>
      <span>Environment</span>
      <span>Health</span>
      <span className="text-right">{actionLabel}</span>
    </div>
  );
}

function DomainHealth({ domain }: { domain: AttributionDomainRow }) {
  const health = domainHealthScore(domain);
  const status = domain.lastInstallStatus;
  const statusClass =
    status === "passed"
      ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
      : status === "failed"
        ? "bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300"
        : "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300";

  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400 xl:hidden">
        Health
      </span>
      <div className="min-h-11 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${domainHealthClasses(health.status)}`}>
            {health.status}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}>
            {status ? `Install ${status}` : "Not checked"}
          </span>
        </div>
        <p className="mt-1 text-xs font-medium text-gray-700 dark:text-gray-300">
          {health.score}/100 · {health.summary}
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Config {relativeDate(domain.lastConfigRequestAt)}
        </p>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          Script {relativeDate(domain.lastScriptSeenAt)}
        </p>
      </div>
    </div>
  );
}

function installStatusClasses(status: string) {
  if (status === "passed") {
    return "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300";
  }

  return "bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300";
}

function installIssueSummary(value: unknown) {
  if (Array.isArray(value) && value.length) {
    return value.slice(0, 2).join("; ");
  }

  return "No issues recorded";
}

function domainHealthScore(domain: AttributionDomainRow) {
  const checks = [
    { ok: domain.isActive, weight: 20, issue: "inactive" },
    { ok: domain.lastInstallStatus === "passed", weight: 25, issue: "install check not passing" },
    { ok: isRecentIso(domain.lastConfigRequestAt, 24 * 60), weight: 20, issue: "no recent config request" },
    { ok: isRecentIso(domain.lastScriptSeenAt, 24 * 60), weight: 25, issue: "script not seen recently" },
    { ok: domain.trackingEnabled !== false, weight: 10, issue: "tracking override off" },
  ];
  const score = checks.reduce((total, check) => total + (check.ok ? check.weight : 0), 0);
  const issues = checks.filter((check) => !check.ok).map((check) => check.issue);
  const status =
    !domain.isActive || domain.trackingEnabled === false || domain.lastInstallStatus === "failed"
      ? "Broken"
      : score >= 70
        ? "Healthy"
        : "Needs attention";

  return {
    issues,
    score,
    status,
    summary: issues.length ? issues.slice(0, 2).join(", ") : "tracking evidence current",
  };
}

function domainHealthClasses(status: ReturnType<typeof domainHealthScore>["status"]) {
  if (status === "Healthy") {
    return "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300";
  }

  if (status === "Broken") {
    return "bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300";
  }

  return "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300";
}

function isRecentIso(value: string | null, minutes: number) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp <= minutes * 60 * 1000;
}

function RegistryUnavailableNotice() {
  return (
    <section className="rounded-2xl border border-warning-200 bg-warning-50 p-5 dark:border-warning-900/40 dark:bg-warning-900/20">
      <p className="text-sm font-semibold text-warning-800 dark:text-warning-200">
        Domain registry database table is unavailable.
      </p>
      <p className="mt-1 text-sm text-warning-700 dark:text-warning-300">
        Run the production Prisma migrations before adding, editing or enforcing attribution domains.
      </p>
    </section>
  );
}

function Field({
  label,
  children,
  compact = false,
}: {
  label: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <label className="block">
      <span
        className={`mb-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 ${
          compact ? "block xl:hidden" : "block"
        }`}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function Metric({ detail, label, value }: { detail?: string; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{value}</p>
      {detail ? (
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{detail}</p>
      ) : null}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function relativeDate(value: string | null) {
  if (!value) return "never";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
