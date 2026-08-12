"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  deleteAttributionIdentityAction,
  purgeExpiredAttributionDataAction,
  type AttributionPrivacyActionState,
} from "@/lib/actions/attribution-privacy";
import {
  updateAttributionSessionSettingsAction,
  type AttributionSessionSettingsState,
} from "@/lib/actions/settings";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";

export type AttributionSessionSettings = {
  attributionSessionTimeoutMinutes: number;
  attributionTimelineLimit: number;
  attributionRetentionDays: number;
  attributionCaptureReferrerEnabled: boolean;
};

type RecentSnapshot = {
  id: string;
  visitorId: string;
  sessionId: string;
  landingPage: string | null;
  currentPage: string | null;
  referrer: string | null;
  updatedAt: string;
};

type RecentAssignment = {
  id: string;
  visitorId: string;
  sessionId: string;
  phoneNumber: string;
  phoneLabel: string | null;
  phoneActive: boolean;
  assignedAt: string;
  lastSeenAt: string;
  expiresAt: string;
};

export type AttributionSessionSettingsOverview = {
  snapshotCount: number;
  visitorCount: number;
  sessionCount: number;
  activeAssignments: number;
  expiringAssignments: number;
  activeNumbers: number;
  totalNumbers: number;
  recentSnapshots: RecentSnapshot[];
  recentAssignments: RecentAssignment[];
};

const initialState: AttributionSessionSettingsState = {
  ok: false,
  message: "",
  savedAt: null,
};
const privacyInitialState: AttributionPrivacyActionState = {
  ok: false,
  message: "",
  savedAt: null,
};

export default function AttributionSessionSettingsPanel({
  overview,
  settings,
}: {
  overview: AttributionSessionSettingsOverview;
  settings: AttributionSessionSettings;
}) {
  const { showToast } = useToast();
  const [state, action, isPending] = useActionState(
    updateAttributionSessionSettingsAction,
    initialState,
  );
  const [deleteState, deleteAction, isDeleting] = useActionState(
    deleteAttributionIdentityAction,
    privacyInitialState,
  );
  const [purgeState, purgeAction, isPurging] = useActionState(
    purgeExpiredAttributionDataAction,
    privacyInitialState,
  );
  const [identityType, setIdentityType] = useState<"visitorId" | "sessionId">("visitorId");
  const [identityValue, setIdentityValue] = useState("");
  const exportUrl = useMemo(() => {
    if (identityValue.trim().length < 3) return null;

    const params = new URLSearchParams({
      identityType,
      identityValue: identityValue.trim(),
    });
    return `/api/attribution/privacy/export?${params.toString()}`;
  }, [identityType, identityValue]);

  useEffect(() => {
    if (state.ok && state.savedAt) {
      showToast(state.message || "Attribution session settings saved.");
    }
    if (deleteState.ok && deleteState.savedAt) {
      showToast(deleteState.message || "Attribution identity deleted.");
    }
    if (purgeState.ok && purgeState.savedAt) {
      showToast(purgeState.message || "Expired attribution data purged.");
    }
  }, [
    deleteState.message,
    deleteState.ok,
    deleteState.savedAt,
    purgeState.message,
    purgeState.ok,
    purgeState.savedAt,
    showToast,
    state.message,
    state.ok,
    state.savedAt,
  ]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
            Tracking engine
          </p>
          <div className="mt-2 flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Visitor and session behaviour
            </h2>
            <LazyHelpTooltip content="Controls visitor/session lifetime, attribution history length, data retention and referrer capture for the tracking engine." />
          </div>
          <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
            Control how long website visitors keep dynamic number assignments and how much browser-side attribution history is retained.
          </p>
        </div>

        <form action={action} className="mt-5 grid gap-4 xl:grid-cols-4">
          <NumberField
            name="attributionSessionTimeoutMinutes"
            label="Assignment window"
            suffix="minutes"
            min={5}
            max={1440}
            defaultValue={settings.attributionSessionTimeoutMinutes}
            detail="How long a visitor/session keeps the same dynamic phone number assignment."
          />
          <NumberField
            name="attributionTimelineLimit"
            label="Timeline cap"
            suffix="touchpoints"
            min={1}
            max={250}
            defaultValue={settings.attributionTimelineLimit}
            detail="Maximum campaign touchpoints kept in the browser attribution payload."
          />
          <NumberField
            name="attributionRetentionDays"
            label="Data retention"
            suffix="days"
            min={30}
            max={3650}
            defaultValue={settings.attributionRetentionDays}
            detail="How long CRM attribution snapshots, records and debug events are retained before purge."
          />
          <label className="flex min-h-[142px] cursor-pointer flex-col justify-between rounded-xl border border-gray-200 p-4 dark:border-gray-800">
            <span>
              <span className="block text-sm font-semibold text-gray-800 dark:text-white/90">
                Referrer capture
              </span>
              <span className="mt-2 block text-sm leading-6 text-gray-500 dark:text-gray-400">
                Store page referrers in first touch, last touch and snapshot records when the browser provides them.
              </span>
            </span>
            <span className="mt-4 flex items-center justify-between gap-4">
              <span className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                {settings.attributionCaptureReferrerEnabled ? "Enabled" : "Disabled"}
              </span>
              <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
                <input
                  type="checkbox"
                  name="attributionCaptureReferrerEnabled"
                  defaultChecked={settings.attributionCaptureReferrerEnabled}
                  className="peer sr-only"
                />
                <span className="absolute inset-0 rounded-full bg-gray-200 transition peer-checked:bg-brand-500 dark:bg-white/10 dark:peer-checked:bg-brand-500" />
                <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white shadow-theme-sm transition peer-checked:translate-x-full" />
              </span>
            </span>
          </label>

          <div className="xl:col-span-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <ActionStateMessage state={state.ok ? undefined : state} />
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "Saving..." : "Save session settings"}
              </button>
            </div>
          </div>
        </form>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)]">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Privacy lookup
            </h3>
            <LazyHelpTooltip content="Lets users export or delete attribution data for a specific visitor ID or session ID." />
          </div>
          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
            Export or remove tracking engine data for a visitor ID or session ID.
          </p>
          <form action={deleteAction} className="mt-5 grid gap-3 lg:grid-cols-[160px_minmax(0,1fr)_auto_auto]">
            <select
              name="identityType"
              value={identityType}
              onChange={(event) => setIdentityType(event.target.value as "visitorId" | "sessionId")}
              className={inputClass}
            >
              <option value="visitorId">Visitor ID</option>
              <option value="sessionId">Session ID</option>
            </select>
            <input
              name="identityValue"
              value={identityValue}
              onChange={(event) => setIdentityValue(event.target.value)}
              placeholder="Paste visitor or session ID"
              className={inputClass}
            />
            <a
              href={exportUrl ?? "#"}
              aria-disabled={!exportUrl}
              className={`inline-flex h-11 items-center justify-center rounded-lg border border-gray-300 px-4 text-sm font-medium ${
                exportUrl
                  ? "bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                  : "pointer-events-none bg-gray-100 text-gray-400 dark:border-gray-800 dark:bg-white/[0.04] dark:text-gray-500"
              }`}
            >
              Export JSON
            </a>
            <button
              type="submit"
              disabled={isDeleting}
              onClick={(event) => {
                if (!window.confirm("Delete attribution data for this identity?")) {
                  event.preventDefault();
                }
              }}
              className="inline-flex h-11 items-center justify-center rounded-lg border border-error-200 bg-white px-4 text-sm font-medium text-error-700 hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-error-900/50 dark:bg-gray-900 dark:text-error-300 dark:hover:bg-error-900/20"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </button>
          </form>
          <div className="mt-4">
            <ActionStateMessage state={deleteState.ok ? undefined : deleteState} />
          </div>
        </div>

        <form
          action={purgeAction}
          className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
        >
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Retention purge
            </h3>
            <LazyHelpTooltip content="Deletes expired attribution snapshots, records, leases and debug events according to the retention window." />
          </div>
          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
            Delete attribution snapshots, records, expired number leases and debug events older than {settings.attributionRetentionDays} days.
          </p>
          <div className="mt-5 flex flex-col gap-3">
            <button
              type="submit"
              disabled={isPurging}
              onClick={(event) => {
                if (!window.confirm("Purge expired attribution data now?")) {
                  event.preventDefault();
                }
              }}
              className="inline-flex h-11 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
            >
              {isPurging ? "Purging..." : "Purge expired data"}
            </button>
            <ActionStateMessage state={purgeState.ok ? undefined : purgeState} />
          </div>
        </form>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Visitor IDs" value={overview.visitorCount.toString()} detail="Unique browser visitors" />
        <Metric label="Session IDs" value={overview.sessionCount.toString()} detail="Tracked visit sessions" />
        <Metric label="Active leases" value={overview.activeAssignments.toString()} detail="Dynamic number assignments" />
        <Metric label="Number pool" value={`${overview.activeNumbers}/${overview.totalNumbers}`} detail="Active / total numbers" />
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <IdentityPanel
          title="Visitor ID"
          storage="localStorage"
          storageKey="id30_visitor_id"
          countLabel="Unique visitors"
          count={overview.visitorCount}
          detail="Visitor IDs persist across browser sessions so returning visitors can stay linked to earlier source and campaign data."
          rows={overview.recentSnapshots.map((snapshot) => ({
            id: snapshot.id,
            primary: shortId(snapshot.visitorId),
            secondary: snapshot.currentPage || snapshot.landingPage || "No page captured",
            time: snapshot.updatedAt,
          }))}
        />
        <IdentityPanel
          title="Session ID"
          storage="sessionStorage"
          storageKey="id30_session_id"
          countLabel="Tracked sessions"
          count={overview.sessionCount}
          detail="Session IDs group page views, form submissions and phone assignments for a single browser tab session."
          rows={overview.recentSnapshots.map((snapshot) => ({
            id: `${snapshot.id}-session`,
            primary: shortId(snapshot.sessionId),
            secondary: snapshot.referrer || "Direct or unavailable referrer",
            time: snapshot.updatedAt,
          }))}
        />
        <DynamicNumbersPanel
          activeAssignments={overview.activeAssignments}
          activeNumbers={overview.activeNumbers}
          expiringAssignments={overview.expiringAssignments}
          recentAssignments={overview.recentAssignments}
          windowMinutes={settings.attributionSessionTimeoutMinutes}
        />
      </section>
    </div>
  );
}

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90";

function NumberField({
  name,
  label,
  suffix,
  min,
  max,
  defaultValue,
  detail,
}: {
  name: string;
  label: string;
  suffix: string;
  min: number;
  max: number;
  defaultValue: number;
  detail: string;
}) {
  return (
    <label className="block rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <span className="block text-sm font-semibold text-gray-800 dark:text-white/90">
        {label}
      </span>
      <span className="mt-2 block text-sm leading-6 text-gray-500 dark:text-gray-400">
        {detail}
      </span>
      <span className="mt-4 flex items-center overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700">
        <input
          type="number"
          name={name}
          min={min}
          max={max}
          defaultValue={defaultValue}
          className="h-11 min-w-0 flex-1 bg-transparent px-4 text-sm text-gray-800 outline-none dark:text-white/90"
        />
        <span className="border-l border-gray-200 bg-gray-50 px-3 py-3 text-xs font-medium uppercase text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
          {suffix}
        </span>
      </span>
    </label>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
        {value}
      </p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{detail}</p>
    </div>
  );
}

function IdentityPanel({
  title,
  storage,
  storageKey,
  countLabel,
  count,
  detail,
  rows,
}: {
  title: string;
  storage: string;
  storageKey: string;
  countLabel: string;
  count: number;
  detail: string;
  rows: Array<{
    id: string;
    primary: string;
    secondary: string;
    time: string;
  }>;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 p-5 dark:border-gray-800">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
                {title}
              </h3>
              <LazyHelpTooltip content={`Explains how ${title.toLowerCase()} values are stored and how recent snapshots use them for attribution matching.`} />
            </div>
            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
              {detail}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-white/10 dark:text-gray-300">
            {storage}
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <MiniStat label={countLabel} value={count.toString()} />
          <MiniStat label="Browser key" value={storageKey} mono />
        </div>
      </div>

      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {rows.length ? (
          rows.map((row) => (
            <div key={row.id} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-xs font-semibold text-gray-800 dark:text-white/90">
                  {row.primary}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {formatDate(row.time)}
                </p>
              </div>
              <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">
                {row.secondary}
              </p>
            </div>
          ))
        ) : (
          <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
            No attribution snapshots yet.
          </p>
        )}
      </div>
    </section>
  );
}

function DynamicNumbersPanel({
  activeAssignments,
  activeNumbers,
  expiringAssignments,
  recentAssignments,
  windowMinutes,
}: {
  activeAssignments: number;
  activeNumbers: number;
  expiringAssignments: number;
  recentAssignments: RecentAssignment[];
  windowMinutes: number;
}) {
  const pressure =
    activeNumbers > 0 ? Math.round((activeAssignments / activeNumbers) * 100) : 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 p-5 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Dynamic numbers
          </h3>
          <LazyHelpTooltip content="Shows current visitor/session number leases and how much pressure they are putting on the active tracking number pool." />
        </div>
        <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
          Active leases show which visitor/session pairs currently hold a tracking number.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <MiniStat label="Active leases" value={activeAssignments.toString()} />
          <MiniStat label="Expiring soon" value={expiringAssignments.toString()} />
          <MiniStat label="Pool pressure" value={`${pressure}%`} />
        </div>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Assignment window: {windowMinutes} minutes.
        </p>
      </div>

      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {recentAssignments.length ? (
          recentAssignments.map((assignment) => (
            <div key={assignment.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                  {assignment.phoneLabel || assignment.phoneNumber}
                </p>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    assignment.phoneActive
                      ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
                      : "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300"
                  }`}
                >
                  {assignment.phoneActive ? "Active" : "Inactive"}
                </span>
              </div>
              <p className="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400">
                {shortId(assignment.visitorId)} / {shortId(assignment.sessionId)}
              </p>
              <div className="mt-2 grid gap-1 text-xs text-gray-500 dark:text-gray-400 sm:grid-cols-2">
                <span>Last seen {formatDate(assignment.lastSeenAt)}</span>
                <span>Expires {formatDate(assignment.expiresAt)}</span>
              </div>
            </div>
          ))
        ) : (
          <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
            No active dynamic number assignments.
          </p>
        )}
      </div>
    </section>
  );
}

function MiniStat({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
      <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p
        className={`mt-1 truncate text-sm font-semibold text-gray-800 dark:text-white/90 ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function shortId(value: string) {
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
