import Link from "next/link";
import type { Metadata } from "next";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import StatusBadge from "@/components/crm-boilerplate/StatusBadge";
import CallTrackingTabs from "@/components/crm-boilerplate/telephony-pages/CallTrackingTabs";
import { isMissingAttributionDebugEventTable } from "@/lib/attribution/debug-events";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Call Tracking Validation | iD30 CRM",
};

type StepStatus = "ready" | "warning" | "blocked";

type ValidationStep = {
  detail: string;
  evidence: string;
  fixHref: string;
  fixLabel: string;
  status: StepStatus;
  title: string;
};

type DniRuleDelegate = {
  count: (args?: { where?: Record<string, unknown> }) => Promise<number>;
};

function appBaseUrl() {
  const fallbackBaseUrl = ["https://crm", "epc-improvements.co.uk"].join(".");

  return (
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    fallbackBaseUrl
  ).replace(/\/$/, "");
}

export default async function TelephonyCallTrackingValidationPage() {
  await requireAdmin();

  const validation = await loadValidationState();
  const steps = buildValidationSteps(validation);
  const readySteps = steps.filter((step) => step.status === "ready").length;
  const blockedSteps = steps.filter((step) => step.status === "blocked").length;
  const warningSteps = steps.filter((step) => step.status === "warning").length;
  const testPageUrl = `${validation.baseUrl}/attribution-toggle-test.html?utm_source=validation&utm_medium=qa&utm_campaign=call-tracking-e2e`;
  const phoneEndpointUrl = `${validation.baseUrl}/api/attribution/phone-number?visitorId=${validation.testVisitorId}&sessionId=${validation.testSessionId}&currentPage=${encodeURIComponent(testPageUrl)}&landingPage=${encodeURIComponent(testPageUrl)}&referrer=${encodeURIComponent("https://www.google.com/search?q=id30+crm")}`;

  return (
    <>
      <PageHeader
        title="Call tracking validation"
        description="Run a repeatable end-to-end check from website script through config, visitor/session, DNI rule selection, number assignment and debug logs."
        actions={
          <Link
            href={testPageUrl}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
          >
            Open validation test
          </Link>
        }
      />

      <CallTrackingTabs activeHref="/telephony/call-tracking/validation" />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Validation steps" value={`${readySteps}/${steps.length}`} detail={`${warningSteps} warnings / ${blockedSteps} blocked`} help="Validation steps walk through script, config, DNI assignment and visitor-log evidence in order." />
        <Metric label="Active pools" value={validation.activePools.toString()} detail={`${validation.activeNumbers} active numbers`} help="Active pools and numbers are required before a visitor can receive a source-specific number." />
        <Metric label="DNI rules" value={validation.activeDniRules === null ? "Unavailable" : validation.activeDniRules.toString()} detail={`${validation.totalDniRules ?? 0} total rules`} help="Active DNI rules are checked during validation to decide which pool or fallback should be used." />
        <Metric label="Recent evidence" value={validation.recentEvidenceCount.toString()} detail="Script/config/phone events in 24h" help="Evidence confirms the CRM saw tracking activity during a recent validation run." />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">
                End-to-end checklist
              </p>
              <div className="mt-1 flex items-center gap-2">
                <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
                  Validate the tracking flow in order
                </h2>
                <LazyHelpTooltip content="Walks through the required validation sequence from script install to visitor-log evidence." />
              </div>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Complete the steps top to bottom, then refresh this page to confirm recent evidence.
              </p>
            </div>
            <StatusBadge>
              {blockedSteps > 0 ? "Blocked" : warningSteps > 0 ? "Ready with warnings" : "Ready"}
            </StatusBadge>
          </div>

          <div className="mt-5 divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
            {steps.map((step, index) => (
              <ValidationStepRow key={step.title} index={index + 1} step={step} />
            ))}
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <section className="min-w-0 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
                Test inputs
              </h2>
              <LazyHelpTooltip content="Shows the fixed visitor, session and UTM values used when running a repeatable validation check." />
            </div>
            <div className="mt-4 space-y-3">
              <CodeBlock label="Visitor ID" value={validation.testVisitorId} />
              <CodeBlock label="Session ID" value={validation.testSessionId} />
              <CodeBlock label="UTM source" value="validation / qa / call-tracking-e2e" />
            </div>
          </section>

          <section className="min-w-0 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
                Validation URLs
              </h2>
              <LazyHelpTooltip content="Provides the exact test-page and phone-assignment URLs used to confirm the call tracking flow." />
            </div>
            <div className="mt-4 space-y-3">
              <UrlBlock label="Script test page" value={testPageUrl} />
              <UrlBlock label="Phone assignment GET" value={phoneEndpointUrl} />
            </div>
          </section>

          <section className="min-w-0 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
                Review after running
              </h2>
              <LazyHelpTooltip content="Links to the screens users should inspect after running validation to confirm evidence was captured." />
            </div>
            <div className="mt-4 space-y-3">
              <ActionLink href="/telephony/call-tracking/diagnostics" title="Diagnostics" detail="Confirm health checks and recent phone events." />
              <ActionLink href="/marketing/visitors" title="Visitor log" detail="Find the validation visitor/session and review activity." />
              <ActionLink href="/telephony/call-tracking/dni-rules" title="DNI rules" detail="Adjust rule matching if validation routes to the wrong pool." />
            </div>
          </section>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Recent validation evidence
          </h2>
          <LazyHelpTooltip content="Shows recent debug events that prove the latest validation run reached each tracking endpoint." />
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          These events prove whether the latest run reached each tracking endpoint.
        </p>
        {validation.debugEventsUnavailable ? (
          <Notice text="Debug events are unavailable. Run Prisma migrations before reviewing validation evidence." />
        ) : validation.recentEvents.length ? (
          <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
            <div className="grid grid-cols-[150px_minmax(0,1fr)_130px] gap-3 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
              <span>Event</span>
              <span>Evidence</span>
              <span>When</span>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {validation.recentEvents.map((event) => (
                <div
                  key={event.id}
                  className="grid grid-cols-[150px_minmax(0,1fr)_130px] gap-3 px-4 py-3 text-sm"
                >
                  <span className={event.level === "error" ? statusPill.blocked : event.level === "warning" ? statusPill.warning : statusPill.ready}>
                    {event.eventType}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-800 dark:text-white/90">
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
          </div>
        ) : (
          <Notice text="No validation evidence found in the last 24 hours. Open the validation test page, run its checks, then refresh this page." />
        )}
      </section>
    </>
  );
}

async function loadValidationState() {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const testVisitorId = `validation-${now.toISOString().slice(0, 10)}`;
  const testSessionId = `validation-session-${now.toISOString().slice(0, 10)}`;
  const dniRuleDelegate = (prisma as unknown as { attributionDniRule?: DniRuleDelegate })
    .attributionDniRule;

  const [
    settings,
    activeNumbers,
    activePools,
    activeDomains,
    domainsSeenRecently,
    liveAssignments,
    recentEventsResult,
    totalDniRules,
    activeDniRules,
  ] = await Promise.all([
    prisma.crmSettings.findUnique({ where: { id: "default" } }),
    prisma.attributionPhoneNumber.count({ where: { isActive: true } }),
    prisma.attributionPhoneNumber
      .findMany({
        where: { isActive: true, label: { not: null } },
        select: { label: true },
        distinct: ["label"],
      })
      .then((pools) => pools.length),
    prisma.attributionDomain.count({ where: { isActive: true } }).catch(() => 0),
    prisma.attributionDomain
      .count({
        where: {
          isActive: true,
          OR: [
            { lastConfigRequestAt: { gte: dayAgo } },
            { lastScriptSeenAt: { gte: dayAgo } },
          ],
        },
      })
      .catch(() => 0),
    prisma.attributionNumberAssignment.count({ where: { expiresAt: { gt: now } } }),
    loadRecentEvents(dayAgo),
    dniRuleDelegate?.count().catch(() => null) ?? Promise.resolve(null),
    dniRuleDelegate?.count({ where: { isActive: true } }).catch(() => null) ?? Promise.resolve(null),
  ]);

  return {
    activeDniRules,
    activeDomains,
    activeNumbers,
    activePools,
    baseUrl: appBaseUrl(),
    debugEventsUnavailable: recentEventsResult.unavailable,
    domainsSeenRecently,
    liveAssignments,
    recentEvents: recentEventsResult.events,
    recentEvidenceCount: recentEventsResult.events.length,
    settings,
    testSessionId,
    testVisitorId,
    totalDniRules,
  };
}

function buildValidationSteps(
  validation: Awaited<ReturnType<typeof loadValidationState>>,
): ValidationStep[] {
  return [
    {
      detail: "Enable the CRM script and dynamic phone tracking before running the browser test.",
      evidence: validation.settings?.attributionTrackingEnabled && validation.settings.attributionPhoneTrackingEnabled
        ? "Script and phone tracking toggles are enabled."
        : "One or more tracking toggles are disabled.",
      fixHref: "/settings/attribution/tracking-script",
      fixLabel: "Open tracking script",
      status:
        validation.settings?.attributionTrackingEnabled &&
        validation.settings.attributionPhoneTrackingEnabled
          ? "ready"
          : "blocked",
      title: "Feature controls",
    },
    {
      detail: "The config endpoint should recognise at least one active website domain.",
      evidence: `${validation.activeDomains} active domain${validation.activeDomains === 1 ? "" : "s"} registered.`,
      fixHref: "/settings/attribution/domains",
      fixLabel: "Open domains",
      status: validation.activeDomains > 0 ? "ready" : "blocked",
      title: "Domain registry",
    },
    {
      detail: "Recent config or script-ready activity proves a website can talk to the CRM.",
      evidence: `${validation.domainsSeenRecently} active domain${validation.domainsSeenRecently === 1 ? "" : "s"} seen in the last 24 hours.`,
      fixHref: "/attribution-toggle-test.html",
      fixLabel: "Open test page",
      status: validation.domainsSeenRecently > 0 ? "ready" : "warning",
      title: "Script and config activity",
    },
    {
      detail: "DNI needs at least one active tracking number in a labelled pool.",
      evidence: `${validation.activeNumbers} active number${validation.activeNumbers === 1 ? "" : "s"} across ${validation.activePools} active pool${validation.activePools === 1 ? "" : "s"}.`,
      fixHref: "/telephony/call-tracking/pools",
      fixLabel: "Open pools",
      status: validation.activeNumbers > 0 && validation.activePools > 0 ? "ready" : "blocked",
      title: "Number pools",
    },
    {
      detail: "Rules should select the expected pool for paid, organic, direct or fallback visitors.",
      evidence:
        validation.activeDniRules === null
          ? "DNI rules are unavailable to the running Prisma client."
          : `${validation.activeDniRules} active rule${validation.activeDniRules === 1 ? "" : "s"} configured.`,
      fixHref: "/telephony/call-tracking/dni-rules",
      fixLabel: "Open DNI rules",
      status:
        validation.activeDniRules === null
          ? "blocked"
          : validation.activeDniRules > 0
            ? "ready"
            : "warning",
      title: "DNI rule selection",
    },
    {
      detail: "Running the validation URLs should create a phone assignment or fallback debug event.",
      evidence: `${validation.recentEvidenceCount} script/config/phone event${validation.recentEvidenceCount === 1 ? "" : "s"} found in the last 24 hours.`,
      fixHref: "/telephony/call-tracking/diagnostics",
      fixLabel: "Open diagnostics",
      status: validation.recentEvidenceCount > 0 ? "ready" : "warning",
      title: "Debug evidence",
    },
    {
      detail: "The visitor log should show the validation visitor/session after the test page runs.",
      evidence: `${validation.liveAssignments} live number lease${validation.liveAssignments === 1 ? "" : "s"} currently active.`,
      fixHref: "/marketing/visitors",
      fixLabel: "Open visitor log",
      status: validation.liveAssignments > 0 ? "ready" : "warning",
      title: "Visitor log evidence",
    },
  ];
}

async function loadRecentEvents(since: Date) {
  try {
    const events = await prisma.attributionDebugEvent.findMany({
      where: {
        createdAt: { gte: since },
        eventType: {
          in: [
            "script.ready",
            "config.request",
            "phone.assigned",
            "phone.fallback",
            "qa.toggle-test",
          ],
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
  blocked:
    "inline-flex w-fit items-center rounded-full bg-error-50 px-2.5 py-1 text-xs font-semibold text-error-700 dark:bg-error-900/20 dark:text-error-300",
  ready:
    "inline-flex w-fit items-center rounded-full bg-success-50 px-2.5 py-1 text-xs font-semibold text-success-700 dark:bg-success-900/20 dark:text-success-300",
  warning:
    "inline-flex w-fit items-center rounded-full bg-warning-50 px-2.5 py-1 text-xs font-semibold text-warning-700 dark:bg-warning-900/20 dark:text-warning-300",
};

function statusLabel(status: StepStatus) {
  if (status === "ready") return "Ready";
  if (status === "blocked") return "Blocked";
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

function ValidationStepRow({ index, step }: { index: number; step: ValidationStep }) {
  return (
    <div className="grid gap-3 p-4 lg:grid-cols-[44px_112px_minmax(0,1fr)_auto] lg:items-center">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-700 dark:bg-white/10 dark:text-gray-200">
        {index}
      </span>
      <span className={statusPill[step.status]}>{statusLabel(step.status)}</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{step.title}</p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{step.detail}</p>
        <p className="mt-1 text-xs font-medium text-gray-600 dark:text-gray-300">
          {step.evidence}
        </p>
      </div>
      <Link
        href={step.fixHref}
        className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
      >
        {step.fixLabel}
      </Link>
    </div>
  );
}

function CodeBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{label}</p>
      <code className="mt-2 block break-words text-xs font-semibold text-gray-800 dark:text-white/90">
        {value}
      </code>
    </div>
  );
}

function UrlBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{label}</p>
      <Link
        href={value}
        className="mt-2 block break-words text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
      >
        {value}
      </Link>
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
