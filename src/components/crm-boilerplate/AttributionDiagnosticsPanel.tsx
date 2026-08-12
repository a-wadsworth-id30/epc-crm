"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { AttributionFeatureSettings } from "@/components/crm-boilerplate/AttributionInstallPanel";
import type { AttributionSessionSettings } from "@/components/crm-boilerplate/AttributionSessionSettingsPanel";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";

export type AttributionDiagnosticsOverview = {
  apiBase: string;
  activeDomains: number;
  totalDomains: number;
  registryUnavailable: boolean;
  snapshots: number;
  records: number;
  activeAssignments: number;
  trackingNumbers: number;
  debugEventsPage: number;
  debugEventsPageSize: number;
  debugEventsTotal: number;
  recentEvents: Array<{
    id: string;
    type: string;
    source: string;
    visitorId: string | null;
    sessionId: string | null;
    hostname: string | null;
    origin: string | null;
    path: string | null;
    ipAddress: string | null;
    level: string;
    detail: string;
    domainDecision: {
      enabled: boolean | null;
      registered: boolean | null;
      reason: string | null;
    } | null;
    createdAt: string;
  }>;
  domains: Array<{
    id: string;
    domain: string;
    label: string | null;
    environment: string;
    isActive: boolean;
  }>;
};

type SavedDebugFilter = {
  id: string;
  name: string;
  domain: string;
  event: string;
  level: string;
  query: string;
  createdAt: string;
};

const savedFilterStorageKey = "id30.attribution.debug.savedFilters";

export default function AttributionDiagnosticsPanel({
  featureSettings,
  overview,
  sessionSettings,
}: {
  featureSettings: AttributionFeatureSettings;
  overview: AttributionDiagnosticsOverview;
  sessionSettings: AttributionSessionSettings;
}) {
  const [domainFilter, setDomainFilter] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [filterName, setFilterName] = useState("");
  const [savedFilters, setSavedFilters] = useState<SavedDebugFilter[]>([]);
  const [simulatedDomain, setSimulatedDomain] = useState(
    overview.domains[0]?.domain ?? "",
  );
  const configChecks = [
    ["Attribution script", featureSettings.attributionTrackingEnabled],
    ["Form capture", featureSettings.attributionFormTrackingEnabled],
    ["Hidden field injection", featureSettings.attributionInjectHiddenFieldEnabled],
    ["Dynamic phone tracking", featureSettings.attributionPhoneTrackingEnabled],
    ["Tel-link replacement", featureSettings.attributionReplaceTelLinksEnabled],
    ["Visible-number replacement", featureSettings.attributionReplaceVisibleNumbersEnabled],
    ["Referrer capture", sessionSettings.attributionCaptureReferrerEnabled],
  ] as const;
  const eventTypes = Array.from(
    new Set(overview.recentEvents.map((event) => event.source)),
  ).sort();
  const debugEventTotalPages = Math.max(
    1,
    Math.ceil(overview.debugEventsTotal / overview.debugEventsPageSize),
  );
  const debugEventsStart =
    overview.debugEventsTotal === 0
      ? 0
      : (overview.debugEventsPage - 1) * overview.debugEventsPageSize + 1;
  const debugEventsEnd = Math.min(
    overview.debugEventsPage * overview.debugEventsPageSize,
    overview.debugEventsTotal,
  );
  const filteredEvents = useMemo(() => {
    const search = query.trim().toLowerCase();

    return overview.recentEvents.filter((event) => {
      if (domainFilter !== "all" && event.hostname !== domainFilter) return false;
      if (eventFilter !== "all" && event.source !== eventFilter) return false;
      if (levelFilter !== "all" && event.level !== levelFilter) return false;
      if (!search) return true;

      return [
        event.type,
        event.source,
        event.hostname,
        event.origin,
        event.path,
        event.visitorId,
        event.sessionId,
        event.detail,
        event.domainDecision?.reason,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    });
  }, [domainFilter, eventFilter, levelFilter, overview.recentEvents, query]);
  const incidentGroups = useMemo(() => groupDebugIncidents(filteredEvents), [filteredEvents]);
  const domainDecision = overview.domains.find(
    (domain) => domain.domain === simulatedDomain,
  );
  const currentFilterLabel = [
    domainFilter === "all" ? null : domainFilter,
    eventFilter === "all" ? null : eventFilter,
    levelFilter === "all" ? null : levelFilter,
    query.trim() ? `"${query.trim()}"` : null,
  ]
    .filter(Boolean)
    .join(" / ");
  const lifecycleStages = useMemo(
    () => trackingLifecycleStages(overview, featureSettings),
    [featureSettings, overview],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSavedFilters(readSavedDebugFilters());
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  function saveCurrentFilter() {
    const now = new Date();
    const name =
      filterName.trim() ||
      currentFilterLabel ||
      `Debug filter ${now.toLocaleDateString("en-GB")}`;
    const next = [
      {
        id: `${now.getTime()}`,
        name,
        domain: domainFilter,
        event: eventFilter,
        level: levelFilter,
        query: query.trim(),
        createdAt: now.toISOString(),
      },
      ...savedFilters,
    ].slice(0, 8);

    persistSavedDebugFilters(next);
    setSavedFilters(next);
    setFilterName("");
  }

  function applySavedFilter(filter: SavedDebugFilter) {
    setDomainFilter(filter.domain);
    setEventFilter(filter.event);
    setLevelFilter(filter.level);
    setQuery(filter.query);
  }

  function deleteSavedFilter(filterId: string) {
    const next = savedFilters.filter((filter) => filter.id !== filterId);
    persistSavedDebugFilters(next);
    setSavedFilters(next);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
            Tracking engine
          </p>
          <div className="mt-2 flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Diagnostics
            </h2>
            <LazyHelpTooltip content="Summarises attribution health so users know whether the tracking script, domains and recent activity are behaving as expected." />
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
            Review installation health, runtime settings and recent attribution activity before debugging a website.
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Metric label="Snapshots" value={overview.snapshots.toString()} />
          <Metric label="Records" value={overview.records.toString()} />
          <Metric label="Live leases" value={overview.activeAssignments.toString()} />
          <Metric label="Tracking numbers" value={overview.trackingNumbers.toString()} />
          <Metric
            label="Domains"
            value={overview.registryUnavailable ? "Unavailable" : `${overview.activeDomains}/${overview.totalDomains}`}
          />
        </div>
        <TrackingLifecycleDashboard stages={lifecycleStages} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Runtime checks
            </h3>
            <LazyHelpTooltip content="Mirrors the feature flags sent to websites so users can see what the tracking script is allowed to do." />
          </div>
          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
            These values mirror what the website script receives from the CRM config endpoint.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {configChecks.map(([label, enabled]) => (
              <StatusRow key={label} label={label} enabled={enabled} />
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
            <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
              API base
            </p>
            <code className="mt-2 block truncate text-xs font-semibold text-gray-800 dark:text-white/90">
              {overview.apiBase}
            </code>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              QA tools
            </h3>
            <LazyHelpTooltip content="Links to the checks used when validating script installation, config output and attribution behaviour." />
          </div>
          <div className="mt-5 space-y-3">
            <ToolLink
              href="/settings/attribution/tracking-script"
              title="Installation check"
              detail="Run a live website check for script presence, API base and forms."
            />
            <ToolLink
              href="/attribution-toggle-test.html"
              title="Toggle test page"
              detail="Verify config flags, form injection and phone-number replacement."
            />
            <ToolLink
              href="/api/attribution/config"
              title="Config endpoint"
              detail="Inspect the JSON returned to website scripts from this CRM."
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Config decision simulator
          </h3>
          <LazyHelpTooltip content="Previews whether a registered domain will receive enabled or disabled tracking configuration before testing the live site." />
        </div>
        <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
          Preview how the CRM will treat a registered domain before checking the live website.
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <select
            value={simulatedDomain}
            onChange={(event) => setSimulatedDomain(event.target.value)}
            className={controlClass}
          >
            {overview.domains.length ? (
              overview.domains.map((domain) => (
                <option key={domain.id} value={domain.domain}>
                  {domain.label ? `${domain.label} - ` : ""}
                  {domain.domain}
                </option>
              ))
            ) : (
              <option value="">No registered domains</option>
            )}
          </select>
          <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  domainDecision?.isActive
                    ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
                    : "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
                }`}
              >
                {domainDecision?.isActive ? "Enabled config" : "Disabled config"}
              </span>
              {domainDecision && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                  {domainDecision.environment}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {domainDecision
                ? domainDecision.isActive
                  ? "This domain is registered and active."
                  : "This domain is registered but inactive."
                : "Add a domain before simulating config decisions."}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(360px,0.8fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Troubleshooting flow
            </h3>
            <LazyHelpTooltip content="Gives users the recommended order for debugging attribution, from domain setup through live activity checks." />
          </div>
          <div className="mt-5 space-y-3">
            <Step number="1" title="Check domain" detail="Confirm the website host is listed and active in Domain Registry." />
            <Step number="2" title="Check script" detail="Use Installation Check to confirm /attribution.js is present and points to this CRM." />
            <Step number="3" title="Check config" detail="Verify feature controls and session settings returned by /api/attribution/config." />
            <Step number="4" title="Check activity" detail="Look for new snapshots, records and live number leases after a test submission." />
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
                    Debug logs
                  </h3>
                  <LazyHelpTooltip content="Lists stored tracking script, form capture, config and number assignment events for investigation. Page controls load older stored debug events from the database." />
                </div>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Stored runtime events from the website script, config endpoint, forms and dynamic numbers.
                </p>
              </div>
              <div className="text-left lg:text-right">
                <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                  History
                </p>
                <p className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">
                  {debugEventsStart}-{debugEventsEnd} of {overview.debugEventsTotal}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Page {overview.debugEventsPage} of {debugEventTotalPages}
                </p>
                <a
                  href="/api/attribution/debug/export"
                  className="mt-3 inline-flex h-9 items-center justify-center rounded-lg border border-brand-200 bg-brand-50 px-3 text-xs font-medium text-brand-700 hover:bg-brand-100 dark:border-brand-900/40 dark:bg-brand-900/20 dark:text-brand-300"
                >
                  Export CSV
                </a>
              </div>
            </div>
          </div>
          <div className="grid gap-3 border-b border-gray-200 p-4 dark:border-gray-800 lg:grid-cols-[minmax(0,1fr)_180px_180px_180px]">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search event, visitor, session or detail"
              className={controlClass}
            />
            <select
              value={domainFilter}
              onChange={(event) => setDomainFilter(event.target.value)}
              className={controlClass}
            >
              <option value="all">All domains</option>
              {overview.domains.map((domain) => (
                <option key={domain.id} value={domain.domain}>
                  {domain.domain}
                </option>
              ))}
            </select>
            <select
              value={eventFilter}
              onChange={(event) => setEventFilter(event.target.value)}
              className={controlClass}
            >
              <option value="all">All events</option>
              {eventTypes.map((eventType) => (
                <option key={eventType} value={eventType}>
                  {eventType}
                </option>
              ))}
            </select>
            <select
              value={levelFilter}
              onChange={(event) => setLevelFilter(event.target.value)}
              className={controlClass}
            >
              <option value="all">All levels</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
            </select>
          </div>
          <div className="border-b border-gray-200 p-4 dark:border-gray-800">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <input
                value={filterName}
                onChange={(event) => setFilterName(event.target.value)}
                placeholder="Saved filter name"
                className={controlClass}
              />
              <button
                type="button"
                onClick={saveCurrentFilter}
                className="inline-flex h-11 items-center justify-center rounded-lg border border-brand-200 bg-brand-50 px-4 text-sm font-medium text-brand-700 hover:bg-brand-100 dark:border-brand-900/40 dark:bg-brand-900/20 dark:text-brand-300"
              >
                Save filter
              </button>
            </div>
            {savedFilters.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {savedFilters.map((filter) => (
                  <div
                    key={filter.id}
                    className="inline-flex max-w-full items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 dark:border-gray-800 dark:bg-white/[0.03]"
                  >
                    <button
                      type="button"
                      onClick={() => applySavedFilter(filter)}
                      className="max-w-56 truncate text-left text-xs font-semibold text-gray-700 hover:text-brand-700 dark:text-gray-300 dark:hover:text-brand-300"
                    >
                      {filter.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSavedFilter(filter.id)}
                      className="text-xs font-semibold text-gray-400 hover:text-error-600 dark:text-gray-500 dark:hover:text-error-300"
                      aria-label={`Delete saved filter ${filter.name}`}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <DebugIncidentGroups groups={incidentGroups} />
          {filteredEvents.length ? (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {filteredEvents.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </div>
          ) : (
            <p className="p-5 text-sm text-gray-500 dark:text-gray-400">
              No debug events match those filters.
            </p>
          )}
          <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Client filters apply to this loaded page of debug history.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <DebugPageLink
                disabled={overview.debugEventsPage <= 1}
                href={debugPageHref(overview.debugEventsPage - 1)}
              >
                Newer
              </DebugPageLink>
              <DebugPageLink
                active
                href={debugPageHref(overview.debugEventsPage)}
              >
                {overview.debugEventsPage}
              </DebugPageLink>
              <DebugPageLink
                disabled={overview.debugEventsPage >= debugEventTotalPages}
                href={debugPageHref(overview.debugEventsPage + 1)}
              >
                Older
              </DebugPageLink>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

const controlClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90";

type DebugEvent = AttributionDiagnosticsOverview["recentEvents"][number];

type DebugIncidentGroup = {
  key: string;
  count: number;
  detail: string;
  eventType: string;
  hostname: string | null;
  latestAt: string;
  level: string;
  pathCount: number;
  sessionCount: number;
  visitorCount: number;
};

type TrackingLifecycleStage = {
  detail: string;
  evidence: string;
  status: "ready" | "watch" | "blocked";
  title: string;
};

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

function TrackingLifecycleDashboard({
  stages,
}: {
  stages: TrackingLifecycleStage[];
}) {
  const readyCount = stages.filter((stage) => stage.status === "ready").length;

  return (
    <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
              Tracking lifecycle
            </h3>
            <LazyHelpTooltip content="Shows the operational path from domain setup through script activity, visitor capture, conversion records and DNI readiness." />
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {readyCount}/{stages.length} stages ready from the currently loaded diagnostics data.
          </p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-600 ring-1 ring-gray-200 dark:bg-white/[0.04] dark:text-gray-300 dark:ring-gray-800">
          {readyCount === stages.length ? "Operational" : "Review needed"}
        </span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {stages.map((stage, index) => (
          <div
            key={stage.title}
            className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950/20"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                {index + 1}
              </span>
              <span className={lifecycleStatusClass(stage.status)}>
                {stage.status === "ready" ? "Ready" : stage.status === "watch" ? "Watch" : "Blocked"}
              </span>
            </div>
            <p className="mt-3 text-sm font-semibold text-gray-800 dark:text-white/90">
              {stage.title}
            </p>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
              {stage.detail}
            </p>
            <p className="mt-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
              {stage.evidence}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusRow({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-800">
      <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{label}</p>
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          enabled
            ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
            : "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300"
        }`}
      >
        {enabled ? "On" : "Off"}
      </span>
    </div>
  );
}

function ToolLink({
  href,
  title,
  detail,
}: {
  href: string;
  title: string;
  detail: string;
}) {
  return (
    <a
      href={href}
      className="block rounded-xl border border-gray-200 p-4 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.04]"
    >
      <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{title}</p>
      <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">{detail}</p>
    </a>
  );
}

function Step({
  number,
  title,
  detail,
}: {
  number: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="grid gap-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800 sm:grid-cols-[34px_minmax(0,1fr)]">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700 dark:bg-brand-900/20 dark:text-brand-300">
        {number}
      </span>
      <div>
        <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{title}</p>
        <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">{detail}</p>
      </div>
    </div>
  );
}

function DebugIncidentGroups({ groups }: { groups: DebugIncidentGroup[] }) {
  const visibleGroups = groups.slice(0, 4);

  return (
    <div className="border-b border-gray-200 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
              Incident groups
            </h4>
            <LazyHelpTooltip content="Groups the currently loaded debug page by event type, level, host and message so repeated tracking issues are easier to triage." />
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Based on the current filters and loaded debug-log page.
          </p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-600 ring-1 ring-gray-200 dark:bg-white/[0.04] dark:text-gray-300 dark:ring-gray-800">
          {groups.length} group{groups.length === 1 ? "" : "s"}
        </span>
      </div>
      {visibleGroups.length ? (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {visibleGroups.map((group) => (
            <div
              key={group.key}
              className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950/20"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <LevelBadge level={group.level} />
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-900/20 dark:text-brand-300">
                    {group.eventType}
                  </span>
                </div>
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                  {group.count} event{group.count === 1 ? "" : "s"}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm font-medium text-gray-800 dark:text-white/90">
                {group.detail}
              </p>
              <div className="mt-2 grid gap-1 text-xs text-gray-500 dark:text-gray-400 sm:grid-cols-2">
                <p className="truncate">Host: {group.hostname || "unknown"}</p>
                <p>{group.pathCount} path{group.pathCount === 1 ? "" : "s"}</p>
                <p>{group.visitorCount} visitor{group.visitorCount === 1 ? "" : "s"}</p>
                <p>{group.sessionCount} session{group.sessionCount === 1 ? "" : "s"}</p>
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Latest {formatDate(group.latestAt)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          No debug incidents match the current filters.
        </p>
      )}
    </div>
  );
}

function EventRow({
  event,
}: {
  event: DebugEvent;
}) {
  return (
    <div className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
            {event.type}
          </span>
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-900/20 dark:text-brand-300">
            {event.source}
          </span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {formatDate(event.createdAt)}
        </p>
      </div>
      <p className="mt-2 text-sm font-medium text-gray-800 dark:text-white/90">
        {event.detail}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <LevelBadge level={event.level} />
        {event.domainDecision ? (
          <DecisionBadge decision={event.domainDecision} />
        ) : null}
        {event.domainDecision?.reason ? (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
            {decisionReasonLabel(event.domainDecision.reason)}
          </span>
        ) : null}
      </div>
      <div className="mt-2 grid gap-1 text-xs text-gray-500 dark:text-gray-400 sm:grid-cols-2">
        <p className="truncate">Host: {event.hostname || "unknown"}</p>
        <p className="truncate">Path: {event.path || "not recorded"}</p>
        <p className="truncate">Origin: {event.origin || "not recorded"}</p>
        <p className="truncate">IP: {event.ipAddress || "not recorded"}</p>
      </div>
      <p className="mt-1 truncate font-mono text-xs text-gray-500 dark:text-gray-400">
        {shortId(event.visitorId)} / {shortId(event.sessionId)}
      </p>
    </div>
  );
}

function DebugPageLink({
  active = false,
  children,
  disabled = false,
  href,
}: {
  active?: boolean;
  children: ReactNode;
  disabled?: boolean;
  href: string;
}) {
  return (
    <a
      href={href}
      aria-disabled={disabled}
      className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold ${
        active
          ? "border-brand-500 bg-brand-500 text-white"
          : disabled
            ? "pointer-events-none border-gray-200 text-gray-300 dark:border-gray-800 dark:text-gray-700"
            : "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.05]"
      }`}
    >
      {children}
    </a>
  );
}

function debugPageHref(page: number) {
  const safePage = Math.max(1, page);
  return safePage === 1
    ? "/settings/attribution/debug-logs"
    : `/settings/attribution/debug-logs?debugPage=${safePage}`;
}

function groupDebugIncidents(events: DebugEvent[]): DebugIncidentGroup[] {
  const groups = new Map<
    string,
    DebugIncidentGroup & {
      paths: Set<string>;
      sessions: Set<string>;
      visitors: Set<string>;
    }
  >();

  for (const event of events) {
    const detail = normaliseIncidentDetail(event.detail);
    const key = [
      event.level,
      event.source,
      event.hostname || "unknown",
      detail,
    ].join("|");
    const existing =
      groups.get(key) ??
      ({
        key,
        count: 0,
        detail,
        eventType: event.source,
        hostname: event.hostname,
        latestAt: event.createdAt,
        level: event.level,
        pathCount: 0,
        paths: new Set<string>(),
        sessionCount: 0,
        sessions: new Set<string>(),
        visitorCount: 0,
        visitors: new Set<string>(),
      } satisfies DebugIncidentGroup & {
        paths: Set<string>;
        sessions: Set<string>;
        visitors: Set<string>;
      });

    existing.count += 1;
    if (new Date(event.createdAt) > new Date(existing.latestAt)) {
      existing.latestAt = event.createdAt;
    }
    if (event.path) existing.paths.add(event.path);
    if (event.sessionId) existing.sessions.add(event.sessionId);
    if (event.visitorId) existing.visitors.add(event.visitorId);

    groups.set(key, existing);
  }

  return Array.from(groups.values())
    .map(({ paths, sessions, visitors, ...group }) => ({
      ...group,
      pathCount: paths.size,
      sessionCount: sessions.size,
      visitorCount: visitors.size,
    }))
    .sort((a, b) => {
      const countDelta = b.count - a.count;
      return countDelta || new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime();
    });
}

function trackingLifecycleStages(
  overview: AttributionDiagnosticsOverview,
  featureSettings: AttributionFeatureSettings,
): TrackingLifecycleStage[] {
  const hasScriptEvent = overview.recentEvents.some((event) =>
    ["script.ready", "config.request", "config.loaded"].includes(event.source),
  );
  const hasConfigRequest = overview.recentEvents.some((event) =>
    ["config.request", "config.loaded"].includes(event.source),
  );

  return [
    {
      detail: "Registered active domains allow the public script and config endpoints to trust the website.",
      evidence: overview.registryUnavailable
        ? "Registry unavailable"
        : `${overview.activeDomains}/${overview.totalDomains} active domains`,
      status: overview.registryUnavailable || overview.activeDomains === 0 ? "blocked" : "ready",
      title: "Domain",
    },
    {
      detail: "The website needs to request config and run the CRM-managed attribution script.",
      evidence: hasScriptEvent
        ? "Recent script/config event found"
        : featureSettings.attributionTrackingEnabled
          ? "Waiting for script activity"
          : "Tracking disabled",
      status: hasScriptEvent
        ? "ready"
        : featureSettings.attributionTrackingEnabled
          ? "watch"
          : "blocked",
      title: "Script",
    },
    {
      detail: "Snapshots prove visitor/session IDs, page context and touchpoints are being stored.",
      evidence: `${overview.snapshots} snapshot${overview.snapshots === 1 ? "" : "s"}`,
      status: overview.snapshots > 0 ? "ready" : hasConfigRequest ? "watch" : "blocked",
      title: "Visitors",
    },
    {
      detail: "Attribution records connect visitors to forms, calls, manual updates and sales records.",
      evidence: `${overview.records} record${overview.records === 1 ? "" : "s"}`,
      status: overview.records > 0 ? "ready" : overview.snapshots > 0 ? "watch" : "blocked",
      title: "Conversions",
    },
    {
      detail: "DNI needs phone tracking enabled, active numbers and current leases to prove number assignment.",
      evidence: `${overview.trackingNumbers} numbers / ${overview.activeAssignments} live leases`,
      status: !featureSettings.attributionPhoneTrackingEnabled
        ? "blocked"
        : overview.trackingNumbers > 0
          ? overview.activeAssignments > 0
            ? "ready"
            : "watch"
          : "blocked",
      title: "DNI",
    },
  ];
}

function lifecycleStatusClass(status: TrackingLifecycleStage["status"]) {
  if (status === "ready") {
    return "rounded-full bg-success-50 px-2 py-0.5 text-xs font-semibold text-success-700 dark:bg-success-900/20 dark:text-success-300";
  }

  if (status === "watch") {
    return "rounded-full bg-warning-50 px-2 py-0.5 text-xs font-semibold text-warning-700 dark:bg-warning-900/20 dark:text-warning-300";
  }

  return "rounded-full bg-error-50 px-2 py-0.5 text-xs font-semibold text-error-700 dark:bg-error-900/20 dark:text-error-300";
}

function normaliseIncidentDetail(detail: string) {
  return detail.replace(/\s+/g, " ").trim() || "Attribution debug event captured.";
}

function LevelBadge({ level }: { level: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${levelBadgeClasses(level)}`}>
      {level}
    </span>
  );
}

function DecisionBadge({
  decision,
}: {
  decision: NonNullable<
    AttributionDiagnosticsOverview["recentEvents"][number]["domainDecision"]
  >;
}) {
  if (decision.enabled === null && decision.registered === null) return null;

  const enabled = decision.enabled === true;
  const registered = decision.registered === true;

  return (
    <>
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
          enabled
            ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
            : "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
        }`}
      >
        {enabled ? "Enabled config" : "Disabled config"}
      </span>
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
          registered
            ? "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300"
            : "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
        }`}
      >
        {registered ? "Registered domain" : "Unregistered domain"}
      </span>
    </>
  );
}

function levelBadgeClasses(level: string) {
  if (level === "error") return "bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300";
  if (level === "warning") return "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300";
  return "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300";
}

function decisionReasonLabel(reason: string) {
  return reason
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function shortId(value: string | null) {
  if (!value) return "no-id";
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function readSavedDebugFilters(): SavedDebugFilter[] {
  try {
    const raw = window.localStorage.getItem(savedFilterStorageKey);
    const parsed = raw ? JSON.parse(raw) : [];

    return Array.isArray(parsed)
      ? parsed.filter(isSavedDebugFilter).slice(0, 8)
      : [];
  } catch {
    return [];
  }
}

function persistSavedDebugFilters(filters: SavedDebugFilter[]) {
  try {
    window.localStorage.setItem(savedFilterStorageKey, JSON.stringify(filters));
  } catch {
    // Local storage can be unavailable in locked-down browsers.
  }
}

function isSavedDebugFilter(value: unknown): value is SavedDebugFilter {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<SavedDebugFilter>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.domain === "string" &&
    typeof candidate.event === "string" &&
    typeof candidate.level === "string" &&
    typeof candidate.query === "string" &&
    typeof candidate.createdAt === "string"
  );
}
