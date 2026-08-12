import Link from "next/link";
import type { Metadata } from "next";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import StatusBadge from "@/components/crm-boilerplate/StatusBadge";
import CallTrackingTabs from "@/components/crm-boilerplate/telephony-pages/CallTrackingTabs";
import { isMissingAttributionDebugEventTable } from "@/lib/attribution/debug-events";
import { requireAdmin } from "@/lib/auth";
import { twilioProvider, twilioStoredConfigSchema } from "@/lib/integrations/twilio";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Call Tracking Diagnostics | iD30 CRM",
};

type HealthStatus = "pass" | "warning" | "fail";

type DiagnosticCheck = {
  actionHref: string;
  actionLabel: string;
  detail: string;
  status: HealthStatus;
  title: string;
};

type DniRuleDelegate = {
  count: (args?: { where?: Record<string, unknown> }) => Promise<number>;
};

function appBaseUrl() {
  return (
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://crm.id30.com"
  ).replace(/\/$/, "");
}

export default async function TelephonyCallTrackingDiagnosticsPage() {
  await requireAdmin();

  const diagnostics = await loadDiagnostics();
  const checks = buildChecks(diagnostics);
  const passingChecks = checks.filter((check) => check.status === "pass").length;
  const warningChecks = checks.filter((check) => check.status === "warning").length;
  const failedChecks = checks.filter((check) => check.status === "fail").length;

  return (
    <>
      <PageHeader
        title="Call tracking diagnostics"
        description="Check whether Twilio, domains, DNI rules, number pools and recent script activity are ready for dynamic number insertion."
        actions={
          <Link
            href="/attribution-toggle-test.html"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
          >
            Open test page
          </Link>
        }
      />

      <CallTrackingTabs activeHref="/telephony/call-tracking/diagnostics" />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric label="Health checks" value={`${passingChecks}/${checks.length}`} detail={`${warningChecks} warnings / ${failedChecks} failures`} help="Health checks show whether setup requirements are ready, need review or are blocking tracking." />
        <Metric label="Active numbers" value={diagnostics.activeNumbers.toString()} detail={`${diagnostics.activePools} active pool${diagnostics.activePools === 1 ? "" : "s"}`} help="Active numbers are available for DNI assignment when a visitor asks for a tracking number." />
        <Metric label="DNI rules" value={diagnostics.activeDniRules === null ? "Unavailable" : diagnostics.activeDniRules.toString()} detail={`${diagnostics.totalDniRules ?? 0} total rules`} help="DNI rules decide which pool or fallback number a visitor should receive." />
        <Metric label="Live leases" value={diagnostics.liveAssignments.toString()} detail="Current visitor number assignments" help="A live lease is a current visitor/session assignment that has not expired." />
        <Metric label="Phone events" value={diagnostics.phoneEvents24h.toString()} detail="Assigned or fallback in last 24h" help="Phone events prove the website requested a number and the CRM assigned one or returned fallback." />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">
                Runtime checks
              </p>
              <div className="mt-1 flex items-center gap-2">
                <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
                  Tracking engine readiness
                </h2>
                <LazyHelpTooltip content="Checks the core setup required for dynamic number insertion and links to the screen that fixes each issue." />
              </div>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Each check links to the screen most likely to fix the issue.
              </p>
            </div>
            <StatusBadge>
              {failedChecks > 0 ? "Needs attention" : warningChecks > 0 ? "Review" : "Ready"}
            </StatusBadge>
          </div>

          <div className="mt-5 divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
            {checks.map((check) => (
              <DiagnosticRow key={check.title} check={check} />
            ))}
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <section className="min-w-0 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
                Endpoint status
              </h2>
              <LazyHelpTooltip content="Lists the public script, config and phone-number endpoints the tracked website needs to call." />
            </div>
            <div className="mt-4 space-y-3">
              <EndpointRow label="Script" value={`${diagnostics.baseUrl}/attribution.js`} />
              <EndpointRow label="Config" value={`${diagnostics.baseUrl}/api/attribution/config`} />
              <EndpointRow label="Phone" value={`${diagnostics.baseUrl}/api/attribution/phone-number`} />
            </div>
          </section>

          <section className="min-w-0 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
                Quick actions
              </h2>
              <LazyHelpTooltip content="Provides shortcuts to the setup screens most commonly needed when diagnosing call tracking." />
            </div>
            <div className="mt-4 space-y-3">
              <ActionLink href="/telephony/call-tracking/validation" title="Validation" detail="Run the end-to-end script, config, DNI and visitor-log checklist." />
              <ActionLink href="/telephony/call-tracking/pools" title="Number pools" detail="Buy, activate or edit grouped Twilio tracking numbers." />
              <ActionLink href="/telephony/call-tracking/dni-rules" title="DNI rules" detail="Route visitors into the right tracking pool." />
              <ActionLink href="/settings/attribution/domains" title="Domains" detail="Register active website domains and review script sightings." />
              <ActionLink href="/marketing/visitors" title="Visitor log" detail="Review tracked visitors, leases, debug events and conversions." />
            </div>
          </section>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Registered domains
            </h2>
            <LazyHelpTooltip content="Shows which website domains are approved for attribution config and whether they have recently contacted the CRM." />
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Recent config requests and script-ready events confirm the website is talking to the CRM.
          </p>
          {diagnostics.domainRegistryUnavailable ? (
            <Notice text="Domain registry is unavailable. Run Prisma migrations before checking registered domain activity." />
          ) : diagnostics.domains.length ? (
            <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
              <div className="grid grid-cols-[minmax(0,1fr)_92px_120px] gap-3 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
                <span>Domain</span>
                <span>Status</span>
                <span>Last seen</span>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {diagnostics.domains.map((domain) => (
                  <div
                    key={domain.id}
                    className="grid grid-cols-[minmax(0,1fr)_92px_120px] gap-3 px-4 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-800 dark:text-white/90">
                        {domain.domain}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                        Config {relativeDate(domain.lastConfigRequestAt)} / Script {relativeDate(domain.lastScriptSeenAt)}
                      </p>
                    </div>
                    <span className={domain.isActive ? statusPill.pass : statusPill.warning}>
                      {domain.isActive ? "Active" : "Inactive"}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {relativeDate(domain.lastSeenAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Notice text="No domains are registered yet. Add a domain before relying on production tracking." />
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Recent tracking events
            </h2>
            <LazyHelpTooltip content="Lists recent phone assignment and fallback events that prove the website requested dynamic number insertion." />
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Phone assignment and fallback events show whether DNI is being requested by visitors.
          </p>
          {diagnostics.debugEventsUnavailable ? (
            <Notice text="Debug logs are unavailable. Run Prisma migrations to enable event diagnostics." />
          ) : diagnostics.recentEvents.length ? (
            <div className="mt-4 divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
              {diagnostics.recentEvents.map((event) => (
                <div key={event.id} className="grid gap-2 p-4 md:grid-cols-[160px_minmax(0,1fr)_120px] md:items-center">
                  <div>
                    <span className={event.level === "error" ? statusPill.fail : event.level === "warning" ? statusPill.warning : statusPill.pass}>
                      {event.eventType}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                      {event.message || event.hostname || event.path || "Tracking event captured"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                      {[event.hostname, event.path, event.visitorId].filter(Boolean).join(" / ") || "No visitor context"}
                    </p>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {relativeDate(event.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Notice text="No recent call tracking events were found. Open the test page or a tracked website to generate activity." />
          )}
        </div>
      </section>
    </>
  );
}

async function loadDiagnostics() {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const dniRuleDelegate = (prisma as unknown as { attributionDniRule?: DniRuleDelegate })
    .attributionDniRule;

  const [
    settings,
    twilioConnection,
    activeNumbers,
    totalNumbers,
    numberPools,
    liveAssignments,
    attributionRecords,
    domainsResult,
    recentEventsResult,
    totalDniRules,
    activeDniRules,
    recentPhoneEvents,
  ] = await Promise.all([
    prisma.crmSettings.findUnique({ where: { id: "default" } }),
    prisma.integrationConnection.findUnique({ where: { provider: twilioProvider } }),
    prisma.attributionPhoneNumber.count({ where: { isActive: true } }),
    prisma.attributionPhoneNumber.count(),
    prisma.attributionPhoneNumber.findMany({
      where: { isActive: true, label: { not: null } },
      select: { label: true },
      distinct: ["label"],
    }),
    prisma.attributionNumberAssignment.count({ where: { expiresAt: { gt: now } } }),
    prisma.attributionRecord.count(),
    loadDomains(),
    loadRecentEvents(weekAgo),
    dniRuleDelegate?.count().catch(() => null) ?? Promise.resolve(null),
    dniRuleDelegate?.count({ where: { isActive: true } }).catch(() => null) ?? Promise.resolve(null),
    countRecentPhoneEvents(dayAgo),
  ]);
  const twilio = twilioStoredConfigSchema.safeParse(twilioConnection?.config ?? {});
  const twilioConfig = twilio.success ? twilio.data : null;
  const twilioReady = Boolean(
    twilioConfig?.credentials?.authToken &&
      twilioConfig.capabilities.includes("voice") &&
      twilioConfig.webhookBaseUrl,
  );
  const domains = domainsResult.domains.map((domain) => {
    const lastSeenAt =
      latestDate(domain.lastScriptSeenAt, domain.lastConfigRequestAt, domain.lastInstallCheckAt) ??
      null;

    return {
      id: domain.id,
      domain: domain.domain,
      isActive: domain.isActive,
      lastConfigRequestAt: domain.lastConfigRequestAt,
      lastScriptSeenAt: domain.lastScriptSeenAt,
      lastSeenAt,
    };
  });

  return {
    activeDniRules,
    activeDomains: domains.filter((domain) => domain.isActive).length,
    activeNumbers,
    activePools: numberPools.length,
    attributionRecords,
    baseUrl: appBaseUrl(),
    debugEventsUnavailable: recentEventsResult.unavailable,
    domainRegistryUnavailable: domainsResult.unavailable,
    domains,
    liveAssignments,
    phoneEvents24h: recentPhoneEvents,
    recentEvents: recentEventsResult.events,
    settings,
    totalDniRules,
    totalDomains: domains.length,
    totalNumbers,
    twilioConfig,
    twilioReady,
  };
}

function buildChecks(diagnostics: Awaited<ReturnType<typeof loadDiagnostics>>): DiagnosticCheck[] {
  const latestScriptSeenAt = latestDate(...diagnostics.domains.map((domain) => domain.lastScriptSeenAt));
  const latestConfigRequestAt = latestDate(
    ...diagnostics.domains.map((domain) => domain.lastConfigRequestAt),
  );

  return [
    {
      actionHref: "/settings/attribution/tracking-script",
      actionLabel: "Open tracking script",
      detail: diagnostics.settings?.attributionTrackingEnabled
        ? "The global attribution script toggle is enabled."
        : "The global attribution script toggle is disabled.",
      status: diagnostics.settings?.attributionTrackingEnabled ? "pass" : "fail",
      title: "Attribution script enabled",
    },
    {
      actionHref: "/settings/attribution/tracking-script",
      actionLabel: "Open feature controls",
      detail: diagnostics.settings?.attributionPhoneTrackingEnabled
        ? "Dynamic phone tracking is enabled in feature controls."
        : "Dynamic phone tracking is disabled in feature controls.",
      status: diagnostics.settings?.attributionPhoneTrackingEnabled ? "pass" : "fail",
      title: "Phone tracking enabled",
    },
    {
      actionHref: "/settings/integrations/twilio",
      actionLabel: "Open Twilio",
      detail: diagnostics.twilioReady
        ? "Twilio has stored credentials, voice capability and a webhook base URL."
        : "Twilio needs stored credentials, voice capability and a webhook base URL.",
      status: diagnostics.twilioReady ? "pass" : "fail",
      title: "Twilio ready",
    },
    {
      actionHref: "/settings/attribution/domains",
      actionLabel: "Open domains",
      detail: diagnostics.domainRegistryUnavailable
        ? "Domain registry tables are unavailable."
        : `${diagnostics.activeDomains} active domain${diagnostics.activeDomains === 1 ? "" : "s"} registered.`,
      status: diagnostics.domainRegistryUnavailable
        ? "fail"
        : diagnostics.activeDomains > 0
          ? "pass"
          : "warning",
      title: "Registered domains",
    },
    {
      actionHref: "/settings/attribution/domains",
      actionLabel: "Review domains",
      detail: latestConfigRequestAt
        ? `Latest config request ${relativeDate(latestConfigRequestAt)}.`
        : "No domain config request has been recorded yet.",
      status: latestConfigRequestAt ? "pass" : "warning",
      title: "Config endpoint activity",
    },
    {
      actionHref: "/settings/attribution/domains",
      actionLabel: "Review install status",
      detail: latestScriptSeenAt
        ? `Latest script-ready event ${relativeDate(latestScriptSeenAt)}.`
        : "No script-ready event has been recorded yet.",
      status: latestScriptSeenAt ? "pass" : "warning",
      title: "Script seen recently",
    },
    {
      actionHref: "/telephony/call-tracking/pools",
      actionLabel: "Open pools",
      detail: `${diagnostics.activeNumbers} active tracking number${diagnostics.activeNumbers === 1 ? "" : "s"} across ${diagnostics.activePools} active pool${diagnostics.activePools === 1 ? "" : "s"}.`,
      status: diagnostics.activeNumbers > 0 && diagnostics.activePools > 0 ? "pass" : "fail",
      title: "Active number pools",
    },
    {
      actionHref: "/telephony/call-tracking/dni-rules",
      actionLabel: "Open DNI rules",
      detail:
        diagnostics.activeDniRules === null
          ? "DNI rule model is unavailable to this running Prisma client."
          : `${diagnostics.activeDniRules} active DNI rule${diagnostics.activeDniRules === 1 ? "" : "s"} configured.`,
      status:
        diagnostics.activeDniRules === null
          ? "fail"
          : diagnostics.activeDniRules > 0
            ? "pass"
            : "warning",
      title: "DNI rules",
    },
    {
      actionHref: "/marketing/visitors",
      actionLabel: "Open visitor log",
      detail: `${diagnostics.liveAssignments} live lease${diagnostics.liveAssignments === 1 ? "" : "s"} and ${diagnostics.phoneEvents24h} phone event${diagnostics.phoneEvents24h === 1 ? "" : "s"} in the last 24 hours.`,
      status:
        diagnostics.liveAssignments > 0 || diagnostics.phoneEvents24h > 0 ? "pass" : "warning",
      title: "Recent DNI activity",
    },
  ];
}

async function loadDomains() {
  try {
    const domains = await prisma.attributionDomain.findMany({
      orderBy: [
        { isActive: "desc" },
        { lastScriptSeenAt: "desc" },
        { domain: "asc" },
      ],
      take: 20,
      select: {
        id: true,
        domain: true,
        isActive: true,
        lastConfigRequestAt: true,
        lastScriptSeenAt: true,
        lastInstallCheckAt: true,
      },
    });

    return { domains, unavailable: false };
  } catch (error) {
    if (!isMissingAttributionDomainTable(error)) {
      throw error;
    }

    return { domains: [], unavailable: true };
  }
}

async function loadRecentEvents(since: Date) {
  try {
    const events = await prisma.attributionDebugEvent.findMany({
      where: {
        createdAt: { gte: since },
        eventType: {
          in: ["script.ready", "config.request", "phone.assigned", "phone.fallback"],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        eventType: true,
        level: true,
        message: true,
        hostname: true,
        path: true,
        visitorId: true,
        createdAt: true,
      },
    });

    return { events, unavailable: false };
  } catch (error) {
    if (!isMissingAttributionDebugEventTable(error)) {
      throw error;
    }

    return { events: [], unavailable: true };
  }
}

async function countRecentPhoneEvents(since: Date) {
  try {
    return await prisma.attributionDebugEvent.count({
      where: {
        createdAt: { gte: since },
        eventType: { in: ["phone.assigned", "phone.fallback"] },
      },
    });
  } catch (error) {
    if (!isMissingAttributionDebugEventTable(error)) {
      throw error;
    }

    return 0;
  }
}

function isMissingAttributionDomainTable(error: unknown) {
  const candidate = error as {
    code?: string;
    meta?: {
      modelName?: string;
      table?: string;
    };
  };

  return (
    (candidate.code === "P2021" &&
      (candidate.meta?.modelName === "AttributionDomain" ||
        candidate.meta?.table?.includes("AttributionDomain"))) ||
    (candidate.code === "P2022" && candidate.meta?.modelName === "AttributionDomain")
  );
}

function latestDate(...values: Array<Date | null | undefined>) {
  return values
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => b.getTime() - a.getTime())[0];
}

function relativeDate(value: Date | null | undefined) {
  if (!value) return "never";

  const diffMs = Date.now() - value.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 8) return `${diffDays}d ago`;

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
  }).format(value);
}

const statusPill = {
  fail: "inline-flex w-fit items-center rounded-full bg-error-50 px-2.5 py-1 text-xs font-semibold text-error-700 dark:bg-error-900/20 dark:text-error-300",
  pass: "inline-flex w-fit items-center rounded-full bg-success-50 px-2.5 py-1 text-xs font-semibold text-success-700 dark:bg-success-900/20 dark:text-success-300",
  warning:
    "inline-flex w-fit items-center rounded-full bg-warning-50 px-2.5 py-1 text-xs font-semibold text-warning-700 dark:bg-warning-900/20 dark:text-warning-300",
};

function statusLabel(status: HealthStatus) {
  if (status === "pass") return "Pass";
  if (status === "fail") return "Fail";
  return "Review";
}

function Metric({
  detail,
  help,
  label,
  value,
}: {
  detail: string;
  help?: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center gap-2">
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
        {help && <LazyHelpTooltip content={help} />}
      </div>
      <p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{value}</p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{detail}</p>
    </div>
  );
}

function DiagnosticRow({ check }: { check: DiagnosticCheck }) {
  return (
    <div className="grid gap-3 p-4 md:grid-cols-[116px_minmax(0,1fr)_auto] md:items-center">
      <span className={statusPill[check.status]}>{statusLabel(check.status)}</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{check.title}</p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{check.detail}</p>
      </div>
      <Link
        href={check.actionHref}
        className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
      >
        {check.actionLabel}
      </Link>
    </div>
  );
}

function EndpointRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{label}</p>
      <code className="mt-2 block break-all text-xs font-semibold text-gray-800 dark:text-white/90">
        {value}
      </code>
    </div>
  );
}

function ActionLink({
  detail,
  href,
  title,
}: {
  detail: string;
  href: string;
  title: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-gray-200 p-3 transition hover:border-brand-300 hover:bg-brand-50/50 dark:border-gray-800 dark:hover:border-brand-900/60 dark:hover:bg-brand-900/10"
    >
      <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{title}</p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{detail}</p>
    </Link>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <div className="mt-4 rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800 dark:border-warning-900/40 dark:bg-warning-900/20 dark:text-warning-200">
      {text}
    </div>
  );
}
