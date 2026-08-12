import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AttributionSourceIconSlot,
  attributionFallbackKindFromText,
} from "@/components/crm-boilerplate/AttributionSourceIcon";
import LazyCopyButton from "@/components/crm-boilerplate/LazyCopyButton";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import StatusBadge from "@/components/crm-boilerplate/StatusBadge";
import { saveAttributionConfidenceSnapshotAction } from "@/lib/actions/attribution-confidence";
import {
  calculateAttributionConfidence,
  type AttributionConfidenceResult,
} from "@/lib/marketing/attribution-confidence";
import { prisma } from "@/lib/prisma";

type VisitorDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ from?: string }>;
};

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export async function generateMetadata({
  params,
}: VisitorDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const snapshot = await prisma.attributionSnapshot.findUnique({
    where: { id },
    select: { visitorId: true },
  });

  return {
    title: snapshot ? `${shortId(snapshot.visitorId)} | Visitor Log` : "Visitor | Visitor Log",
  };
}

export default async function VisitorDetailPage({ params, searchParams }: VisitorDetailPageProps) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const backHref = visitorBackHref(query.from);
  const snapshot = await prisma.attributionSnapshot.findUnique({
    where: { id },
    include: {
      assignments: {
        orderBy: { lastSeenAt: "desc" },
        take: 20,
        include: {
          phoneNumber: {
            select: { label: true, phoneNumber: true },
          },
        },
      },
      records: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      confidenceSnapshots: {
        orderBy: { createdAt: "desc" },
        take: 8,
      },
      debugEvents: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });

  if (!snapshot) {
    notFound();
  }

  const contactIds = [
    ...new Set(snapshot.records.map((record) => record.contactId).filter(isString)),
  ];
  const opportunityIds = [
    ...new Set(snapshot.records.map((record) => record.opportunityId).filter(isString)),
  ];
  const [contacts, opportunities, sessionCount] = await Promise.all([
    contactIds.length
      ? prisma.contact.findMany({
          where: { id: { in: contactIds } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            companyName: true,
            company: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    opportunityIds.length
      ? prisma.salesOpportunity.findMany({
          where: { id: { in: opportunityIds } },
          select: {
            id: true,
            stage: true,
            title: true,
            valueCents: true,
          },
        })
      : Promise.resolve([]),
    prisma.attributionSnapshot.count({ where: { visitorId: snapshot.visitorId } }),
  ]);
  const contactMap = new Map(
    contacts.map((contact) => [
      contact.id,
      {
        name: `${contact.firstName} ${contact.lastName}`.trim() || "Unnamed contact",
        company: contact.company?.name ?? contact.companyName,
      },
    ]),
  );
  const firstTouch = touchSummary(snapshot.firstTouch);
  const lastTouch = touchSummary(snapshot.lastTouch);
  const timeline = Array.isArray(snapshot.timeline) ? snapshot.timeline : [];
  const commercialContext = {
    consentStatus: consentStatusFromEvents(snapshot.debugEvents),
    matchedOpportunities: opportunities.length,
    pageCount: timeline.length,
    repeatVisitor: sessionCount > 1,
    sessionCount,
    wonDeals: opportunities.filter((opportunity) => opportunity.stage === "WON").length,
    wonRevenueCents: opportunities
      .filter((opportunity) => opportunity.stage === "WON")
      .reduce((sum, opportunity) => sum + opportunity.valueCents, 0),
  };
  const location = locationSummary(snapshot.location);
  const conversion = conversionSummary(snapshot.records, contactMap);
  const confidence = calculateAttributionConfidence({
    firstTouch: snapshot.firstTouch,
    lastTouch: snapshot.lastTouch,
    timeline: snapshot.timeline,
    landingPage: snapshot.landingPage,
    currentPage: snapshot.currentPage,
    referrer: snapshot.referrer,
    attributionSource: snapshot.attributionSource,
    attributionMedium: snapshot.attributionMedium,
    attributionCampaign: snapshot.attributionCampaign,
    attributionClickId: snapshot.attributionClickId,
    attributionClickIdType: snapshot.attributionClickIdType,
    recordsCount: snapshot.records.length,
    formConversionsCount: conversion.forms,
    phoneConversionsCount: conversion.calls,
    manualConversionsCount: conversion.manual,
    matchedContactId: snapshot.records.find((record) => record.contactId)?.contactId ?? null,
    matchedOpportunityId:
      snapshot.records.find((record) => record.opportunityId)?.opportunityId ?? null,
  });
  const campaignEvidence = campaignEvidenceSummary({
    firstTouch,
    lastTouch,
    snapshot,
  });
  const action = nextAction({
    campaignEvidence,
    conversion,
    debugEvents: snapshot.debugEvents.length,
    journeyEvents: timeline.length,
    location,
  });
  const reportQuery =
    [snapshot.attributionCampaign, snapshot.attributionSource].find(isString) ??
    (campaignEvidence.campaign !== "-" ? campaignEvidence.campaign : snapshot.visitorId);
  const primaryOpportunity = opportunities[0] ?? null;
  const relatedRoutes = [
    {
      detail: "Return to the visitor list with this visitor selected.",
      href: `/marketing/visitors?q=${encodeURIComponent(snapshot.visitorId)}`,
      label: "Visitor log",
    },
    {
      detail: "Compare this source or campaign against other leads.",
      href: `/marketing/lead-sources?q=${encodeURIComponent(reportQuery)}`,
      label: "Lead sources",
    },
    {
      detail: "Review first-touch, last-touch and assisted contribution.",
      href: "/marketing/attribution-reports",
      label: "Attribution reports",
    },
    primaryOpportunity
      ? {
          detail: "Open the matched commercial opportunity.",
          href: `/sales/${primaryOpportunity.id}`,
          label: "Matched sale",
        }
      : null,
  ].filter((route): route is { detail: string; href: string; label: string } =>
    Boolean(route),
  );
  const journeyEvents = visitorJourneyEvents({
    assignments: snapshot.assignments,
    contactMap,
    debugEvents: snapshot.debugEvents,
    records: snapshot.records,
    timeline,
  });

  return (
    <>
      <PageHeader
        title="Visitor Details"
        description="First touch, last touch, conversions, DNI assignments and debug activity."
        actions={
          <Link
            href={backHref}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
          >
            Back to visitor log
          </Link>
        }
      />

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <SummaryCard copyValue={snapshot.visitorId} label="Visitor ID" value={snapshot.visitorId} />
        <SummaryCard copyValue={snapshot.sessionId} label="Session ID" value={snapshot.sessionId} />
        <SummaryCard
          label="Source"
          sourceIconLabel={snapshot.attributionSource ?? "Unknown source"}
          value={snapshot.attributionSource ?? "Unknown"}
        />
        <SummaryCard label="Last activity" value={formatDateTime(snapshot.updatedAt)} />
      </section>

      <section className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <Panel title="Touch summary">
            <div className="grid gap-4 lg:grid-cols-2">
              <TouchCard title="First touch" touch={firstTouch} />
              <TouchCard title="Last touch" touch={lastTouch} />
            </div>
          </Panel>

          <Panel title="Visitor journey">
            {journeyEvents.length ? (
              <div className="space-y-3">
                {journeyEvents.slice(0, 40).map((event, index) => (
                  <JourneyEventItem event={event} key={`${event.kind}-${event.createdAt.getTime()}-${index}`} />
                ))}
              </div>
            ) : (
              <EmptyText>No journey events captured.</EmptyText>
            )}
          </Panel>

          <Panel title="Conversion summary">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <ConversionStat label="Forms" value={conversion.forms.toString()} />
              <ConversionStat label="Calls" value={conversion.calls.toString()} />
              <ConversionStat label="Manual" value={conversion.manual.toString()} />
              <ConversionStat label="Matched contacts" value={conversion.matchedContacts.toString()} />
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <Fact label="Latest event" value={conversion.latestAt ? formatDateTime(conversion.latestAt) : "-"} />
              <Fact label="Latest type" value={conversion.latestType ?? "-"} />
              <Fact label="Latest contact" value={conversion.latestContact ?? "-"} />
              <Fact label="Summary" value={conversion.label} />
            </dl>
          </Panel>

          <Panel title="Attribution records">
            {snapshot.records.length ? (
              <div className="space-y-3">
                {snapshot.records.map((record) => {
                  const contact = record.contactId ? contactMap.get(record.contactId) : null;

                  return (
                    <div
                      key={record.id}
                      className="rounded-lg border border-gray-200 p-3 dark:border-gray-800"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <StatusBadge>{record.source}</StatusBadge>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {formatDateTime(record.createdAt)}
                        </span>
                      </div>
                      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                        <Fact label="Contact" value={contact?.name ?? record.contactId ?? "-"} />
                        <Fact label="Company" value={contact?.company ?? "-"} />
                        <Fact
                          copyValue={record.trackingPhoneNumber}
                          label="Tracking number"
                          value={record.trackingPhoneNumber ?? "-"}
                        />
                        <Fact label="Opportunity" value={record.opportunityId ?? "-"} />
                      </dl>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyText>No attribution records yet.</EmptyText>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Related routes">
            <div className="grid gap-3 sm:grid-cols-2">
              {relatedRoutes.map((route) => (
                <Link
                  key={route.label}
                  href={route.href}
                  className="rounded-lg border border-gray-200 p-3 transition hover:border-brand-200 hover:bg-brand-50/50 dark:border-gray-800 dark:hover:border-brand-900/50 dark:hover:bg-brand-900/10"
                >
                  <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                    {route.label}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                    {route.detail}
                  </p>
                </Link>
              ))}
            </div>
          </Panel>

          <Panel title="Next action">
            <div className="rounded-lg border border-brand-100 bg-brand-50/70 p-4 dark:border-brand-500/30 dark:bg-brand-900/20">
              <p className="text-sm font-semibold text-brand-700 dark:text-brand-300">
                {action.label}
              </p>
              <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                {action.detail}
              </p>
            </div>
          </Panel>

          <Panel
            title="Attribution confidence"
            action={
              <form action={saveAttributionConfidenceSnapshotAction}>
                <input name="snapshotId" type="hidden" value={snapshot.id} />
                <button
                  type="submit"
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-brand-200 bg-brand-50 px-3 text-xs font-medium text-brand-700 hover:bg-brand-100 dark:border-brand-900/40 dark:bg-brand-900/20 dark:text-brand-300"
                >
                  Save snapshot
                </button>
              </form>
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                  {confidence.level} confidence
                </p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  {confidence.clientSummary}
                </p>
              </div>
              <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${confidenceBadgeClasses(confidence.level)}`}>
                {confidence.percentage}%
              </span>
            </div>
            <div className="mt-4 space-y-2">
              {confidence.factors.map((factor) => (
                <div
                  key={factor.key}
                  className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-800"
                >
                  <div>
                    <p className="font-semibold text-gray-800 dark:text-white/90">
                      {factor.label}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {factor.internalDetail}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${confidenceFactorClasses(factor.status)}`}>
                    {factor.status === "not-applicable" ? "N/A" : factor.status}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-5 border-t border-gray-200 pt-4 dark:border-gray-800">
              <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Saved audit snapshots
              </p>
              {snapshot.confidenceSnapshots.length ? (
                <div className="mt-3 space-y-2">
                  {snapshot.confidenceSnapshots.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-800"
                    >
                      <div>
                        <p className="font-semibold text-gray-800 dark:text-white/90">
                          {item.level} confidence · {item.percentage}%
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {formatDateTime(item.createdAt)}
                        </p>
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {item.score}/{item.maxScore}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyText>No confidence audit snapshots saved yet.</EmptyText>
              )}
            </div>
          </Panel>

          <Panel title="Commercial context">
            <div className="grid gap-3 sm:grid-cols-2">
              <ConversionStat label="Sessions" value={commercialContext.sessionCount.toString()} />
              <ConversionStat label="Pages" value={commercialContext.pageCount.toString()} />
              <ConversionStat label="Opportunities" value={commercialContext.matchedOpportunities.toString()} />
              <ConversionStat label="Won deals" value={commercialContext.wonDeals.toString()} />
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <Fact label="Repeat visitor" value={commercialContext.repeatVisitor ? "Yes" : "No"} />
              <Fact label="Consent" value={commercialContext.consentStatus} />
              <Fact label="Won revenue" value={formatMoney(commercialContext.wonRevenueCents)} />
            </dl>
          </Panel>

          <Panel title="Campaign evidence">
            <div className="grid gap-3 sm:grid-cols-2">
              <EvidenceStat
                label="Provider"
                sourceIconLabel={campaignEvidence.provider}
                value={campaignEvidence.provider}
              />
              <EvidenceStat label="Source / medium" value={campaignEvidence.sourceMedium} />
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <Fact label="Campaign" value={campaignEvidence.campaign} />
              <Fact label="Keyword" value={campaignEvidence.keyword} />
              <Fact copyValue={campaignEvidence.clickIdValue} label="Click ID" value={campaignEvidence.clickId} />
              <Fact label="Landing page" value={campaignEvidence.landingPage} />
              <Fact label="Current page" value={campaignEvidence.currentPage} />
              <Fact label="Referrer" value={campaignEvidence.referrer} />
            </dl>
          </Panel>

          <Panel title="Location">
            <dl className="space-y-2 text-sm">
              <Fact label="Location" value={location.label} />
              <Fact label="Precision" value={location.precision} />
              <Fact label="Timezone" value={location.timezone ?? "-"} />
              <Fact label="Source" value={location.sourceLabel} />
              <Fact copyValue={snapshot.ipAddress} label="IP address" value={snapshot.ipAddress ?? "-"} />
            </dl>
          </Panel>

          <Panel title="DNI assignments">
            {snapshot.assignments.length ? (
              <div className="space-y-3">
                {snapshot.assignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-800"
                  >
                    <p className="font-semibold text-gray-800 dark:text-white/90">
                      {assignment.phoneNumber.label ?? assignment.phoneNumber.phoneNumber}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Last seen {formatDateTime(assignment.lastSeenAt)}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Expires {formatDateTime(assignment.expiresAt)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyText>No DNI assignments for this session.</EmptyText>
            )}
          </Panel>

          <Panel title="Debug events">
            {snapshot.debugEvents.length ? (
              <div className="space-y-3">
                {snapshot.debugEvents.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-800"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-gray-800 dark:text-white/90">
                        {event.eventType}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDateTime(event.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {[event.level, event.hostname, event.path].filter(Boolean).join(" / ")}
                    </p>
                    {event.message ? (
                      <p className="mt-2 text-gray-600 dark:text-gray-300">{event.message}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyText>No debug events for this session.</EmptyText>
            )}
          </Panel>
        </div>
      </section>
    </>
  );
}

function Panel({
  action,
  children,
  title,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">{title}</h2>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SummaryCard({
  copyValue,
  label,
  sourceIconLabel,
  value,
}: {
  copyValue?: string | null;
  label: string;
  sourceIconLabel?: string | null;
  value: string;
}) {
  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        {sourceIconLabel ? (
          <span className="inline-grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
            <AttributionSourceIconSlot
              fallbackKind={attributionFallbackKindFromText(sourceIconLabel)}
              iconClassName="block h-4 w-4"
              label={sourceIconLabel}
            />
          </span>
        ) : null}
        <p className="min-w-0 truncate text-sm font-semibold text-gray-800 dark:text-white/90">
          {value}
        </p>
        {copyValue ? <LazyCopyButton label={`Copy ${label}`} value={copyValue} /> : null}
      </div>
    </article>
  );
}

function TouchCard({ title, touch }: { title: string; touch: TouchSummary }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{title}</p>
      <dl className="mt-3 space-y-2 text-sm">
        <Fact label="Captured" value={touch.capturedAt ?? "-"} />
        <Fact label="Page" value={touch.path ?? "-"} />
        <Fact label="Referrer" value={touch.referrer ?? "-"} />
        <Fact label="Campaign" value={touch.params.utm_campaign ?? "-"} />
        <Fact label="Keyword" value={touch.params.utm_term ?? "-"} />
        <Fact copyValue={touch.clickIdValue} label="Click ID" value={touch.clickId ?? "-"} />
      </dl>
    </div>
  );
}

type JourneyEvent = {
  badge: string;
  createdAt: Date;
  detail: string | null;
  evidence: string | null;
  kind: "debug" | "dni" | "page" | "record";
  role: "Assisted touch" | "First touch" | "First + last touch" | "Last touch" | null;
  title: string;
};

function JourneyEventItem({ event }: { event: JourneyEvent }) {
  return (
    <div className="grid gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-800 sm:grid-cols-[116px_minmax(0,1fr)]">
      <div>
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
          {formatDateTime(event.createdAt)}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${journeyBadgeClasses(event.kind)}`}>
            {event.badge}
          </span>
          {event.role ? (
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${journeyRoleClasses(event.role)}`}>
              {event.role}
            </span>
          ) : null}
        </div>
      </div>
      <div className="min-w-0">
        <p className="font-medium text-gray-800 dark:text-white/90">{event.title}</p>
        {event.detail ? (
          <p className="mt-1 break-words text-sm text-gray-600 dark:text-gray-300">
            {event.detail}
          </p>
        ) : null}
        {event.evidence ? (
          <p className="mt-1 break-words text-xs text-gray-500 dark:text-gray-400">
            {event.evidence}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function journeyRoleClasses(role: NonNullable<JourneyEvent["role"]>) {
  if (role === "First touch") {
    return "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300";
  }
  if (role === "Last touch") {
    return "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300";
  }
  if (role === "First + last touch") {
    return "bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300";
  }
  return "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300";
}

function journeyBadgeClasses(kind: JourneyEvent["kind"]) {
  if (kind === "record") {
    return "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300";
  }
  if (kind === "dni") {
    return "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300";
  }
  if (kind === "debug") {
    return "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300";
  }
  return "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300";
}

function confidenceBadgeClasses(level: AttributionConfidenceResult["level"]) {
  if (level === "High") {
    return "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300";
  }
  if (level === "Medium") {
    return "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300";
  }
  if (level === "Low") {
    return "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300";
  }
  return "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300";
}

function confidenceFactorClasses(status: AttributionConfidenceResult["factors"][number]["status"]) {
  if (status === "present") {
    return "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300";
  }
  if (status === "missing") {
    return "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300";
  }
  return "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300";
}

function ConversionStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">{value}</p>
    </div>
  );
}

function EvidenceStat({
  label,
  sourceIconLabel,
  value,
}: {
  label: string;
  sourceIconLabel?: string | null;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        {sourceIconLabel ? (
          <span className="inline-grid h-6 w-6 shrink-0 place-items-center rounded-md border border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
            <AttributionSourceIconSlot
              className="size-4"
              fallbackKind={attributionFallbackKindFromText(sourceIconLabel)}
              iconClassName="block h-4 w-4"
              label={sourceIconLabel}
            />
          </span>
        ) : null}
        <p className="min-w-0 break-words text-sm font-semibold text-gray-800 dark:text-white/90">
          {value}
        </p>
      </div>
    </div>
  );
}

function Fact({
  copyValue,
  label,
  value,
}: {
  copyValue?: string | null;
  label: string;
  value: string;
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[120px_minmax(0,1fr)]">
      <dt className="text-xs font-semibold text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="flex min-w-0 items-start gap-2 break-words text-gray-700 dark:text-gray-300">
        <span className="min-w-0 flex-1">{value}</span>
        {copyValue ? <LazyCopyButton label={`Copy ${label}`} value={copyValue} /> : null}
      </dd>
    </div>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-500 dark:text-gray-400">{children}</p>;
}

type TouchSummary = {
  capturedAt: string | null;
  path: string | null;
  referrer: string | null;
  params: Record<string, string>;
  clickId: string | null;
  clickIdType: string | null;
  clickIdValue: string | null;
};

function touchSummary(value: unknown): TouchSummary {
  const record = objectValue(value);
  const params = objectValue(record.params);
  const stringParams = Object.fromEntries(
    Object.entries(params)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .map(([key, item]) => [key, item]),
  );

  return {
    capturedAt: stringValue(record.capturedAt),
    path: pathOnly(stringValue(record.url) ?? stringValue(record.landingPage)),
    referrer: referrerHost(stringValue(record.referrer)),
    params: stringParams,
    clickId: clickIdLabel(stringParams),
    clickIdType: clickIdType(stringParams),
    clickIdValue: clickIdValue(stringParams),
  };
}

function campaignEvidenceSummary({
  firstTouch,
  lastTouch,
  snapshot,
}: {
  firstTouch: TouchSummary;
  lastTouch: TouchSummary;
  snapshot: {
    attributionAdProvider: string | null;
    attributionCampaign: string | null;
    attributionClickId: string | null;
    attributionClickIdType: string | null;
    attributionMedium: string | null;
    attributionSource: string | null;
    currentPage: string | null;
    landingPage: string | null;
    referrer: string | null;
  };
}) {
  const source = snapshot.attributionSource ?? lastTouch.params.utm_source ?? firstTouch.params.utm_source;
  const medium = snapshot.attributionMedium ?? lastTouch.params.utm_medium ?? firstTouch.params.utm_medium;
  const clickIdType = snapshot.attributionClickIdType ?? lastTouch.clickIdType ?? firstTouch.clickIdType;
  const clickIdValue = snapshot.attributionClickId ?? lastTouch.clickIdValue ?? firstTouch.clickIdValue;

  return {
    campaign:
      snapshot.attributionCampaign ??
      lastTouch.params.utm_campaign ??
      firstTouch.params.utm_campaign ??
      "-",
    clickId: clickIdType && clickIdValue ? `${clickIdType}: ${clickIdValue}` : "-",
    clickIdValue,
    currentPage: pathOnly(snapshot.currentPage) ?? "-",
    keyword: lastTouch.params.utm_term ?? firstTouch.params.utm_term ?? "-",
    landingPage: pathOnly(snapshot.landingPage) ?? firstTouch.path ?? "-",
    provider: campaignProviderLabel(snapshot.attributionAdProvider, clickIdType),
    referrer: referrerHost(snapshot.referrer) ?? lastTouch.referrer ?? firstTouch.referrer ?? "-",
    sourceMedium: [source, medium].filter(Boolean).join(" / ") || "-",
  };
}

function campaignProviderLabel(provider: string | null, clickIdType: string | null) {
  if (provider === "google-ads") return "Google Ads";
  if (provider === "bing-ads") return "Bing Ads";
  if (provider === "meta-ads") return "Meta Ads";
  if (clickIdType === "GCLID" || clickIdType === "GBRAID" || clickIdType === "WBRAID") {
    return "Google Ads";
  }
  if (clickIdType === "MSCLKID") return "Bing Ads";
  if (clickIdType === "FBCLID") return "Meta Ads";
  return provider ?? "Organic / direct";
}

function nextAction({
  campaignEvidence,
  conversion,
  debugEvents,
  journeyEvents,
  location,
}: {
  campaignEvidence: ReturnType<typeof campaignEvidenceSummary>;
  conversion: ReturnType<typeof conversionSummary>;
  debugEvents: number;
  journeyEvents: number;
  location: ReturnType<typeof locationSummary>;
}) {
  if (conversion.forms > 0 || conversion.calls > 0 || conversion.manual > 0 || conversion.matchedContacts > 0) {
    return {
      detail: conversion.latestContact
        ? `Latest conversion is linked to ${conversion.latestContact}. Review the contact or sale follow-up.`
        : "Review the captured conversion and attach it to the right contact or sale if needed.",
      label: "Follow up lead",
    };
  }

  if (campaignEvidence.clickIdValue) {
    return {
      detail: "This visitor has paid click evidence but no conversion record yet. Review the campaign evidence and journey before deciding whether to retarget or exclude.",
      label: "Review paid click",
    };
  }

  if (location.precision === "No location") {
    return {
      detail: "No usable location was stored. Check whether the request included Netlify/CDN geo headers or IP geolocation enrichment.",
      label: "Check geo capture",
    };
  }

  if (debugEvents > 0) {
    return {
      detail: "Debug events were captured for this visitor. Inspect diagnostics for config or script issues.",
      label: "Inspect diagnostics",
    };
  }

  if (journeyEvents >= 5) {
    return {
      detail: "The visitor has a longer journey without conversion. Review page sequence and source context.",
      label: "Review journey",
    };
  }

  return {
    detail: "No immediate action needed. Keep monitoring this visitor for future conversion activity.",
    label: "Monitor",
  };
}

function visitorJourneyEvents({
  assignments,
  contactMap,
  debugEvents,
  records,
  timeline,
}: {
  assignments: Array<{
    expiresAt: Date;
    lastSeenAt: Date;
    phoneNumber: { label: string | null; phoneNumber: string };
  }>;
  contactMap: Map<string, { name: string; company: string | null }>;
  debugEvents: Array<{
    createdAt: Date;
    eventType: string;
    hostname: string | null;
    level: string;
    message: string | null;
    path: string | null;
  }>;
  records: Array<{
    contactId: string | null;
    createdAt: Date;
    opportunityId: string | null;
    source: string;
    trackingPhoneNumber: string | null;
  }>;
  timeline: unknown[];
}): JourneyEvent[] {
  const pageEvents = timeline.flatMap((item, index) => {
      const touch = touchSummary(item);
      const createdAt = dateValue(touch.capturedAt);
      if (!createdAt) return [];

      return [{
        badge: "Page",
        createdAt,
        detail: touch.path ?? "Unknown page",
        evidence:
          [touch.params.utm_source, touch.params.utm_medium, touch.params.utm_campaign]
            .filter(Boolean)
            .join(" / ") || touch.referrer,
        kind: "page" as const,
        role: journeyRoleLabel(index, timeline.length),
        title: touch.path ? "Page viewed" : "Page activity",
      }];
    });
  const recordEvents = records.map((record) => {
    const contact = record.contactId ? contactMap.get(record.contactId) : null;

    return {
      badge: record.source,
      createdAt: record.createdAt,
      detail: [
        contact?.name ?? record.contactId,
        record.trackingPhoneNumber ? `Tracking number ${record.trackingPhoneNumber}` : null,
        record.opportunityId ? `Opportunity ${record.opportunityId}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || null,
      evidence: contact?.company ?? null,
      kind: "record" as const,
      role: null,
      title: attributionRecordTitle(record.source),
    };
  });
  const assignmentEvents = assignments.map((assignment) => {
    const number = assignment.phoneNumber.label ?? assignment.phoneNumber.phoneNumber;

    return {
      badge: "DNI",
      createdAt: assignment.lastSeenAt,
      detail: number,
      evidence: `Expires ${formatDateTime(assignment.expiresAt)}`,
      kind: "dni" as const,
      role: null,
      title: "Tracking number assigned",
    };
  });
  const debugEventRows = debugEvents.map((event) => ({
    badge: event.level,
    createdAt: event.createdAt,
    detail: event.message,
    evidence: [event.hostname, event.path].filter(Boolean).join(" / ") || null,
    kind: "debug" as const,
    role: null,
    title: event.eventType,
  }));

  return [...pageEvents, ...recordEvents, ...assignmentEvents, ...debugEventRows].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
}

function journeyRoleLabel(
  index: number,
  total: number,
): NonNullable<JourneyEvent["role"]> {
  if (total <= 1) return "First + last touch";
  if (index === 0) return "First touch";
  if (index === total - 1) return "Last touch";
  return "Assisted touch";
}

function attributionRecordTitle(source: string) {
  if (source === "FORM") return "Form conversion captured";
  if (source === "PHONE") return "Phone conversion captured";
  if (source === "MANUAL") return "Manual attribution record";
  return "Attribution record captured";
}

function dateValue(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function consentStatusFromEvents(
  events: Array<{ createdAt: Date; eventType: string }>,
) {
  const consentEvent = events
    .filter((event) => event.eventType.startsWith("consent."))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

  if (!consentEvent) return "Not recorded";
  if (consentEvent.eventType === "consent.granted") return "Granted";
  if (consentEvent.eventType === "consent.revoked") return "Revoked";
  if (consentEvent.eventType === "consent.required") return "Required";
  return "Not recorded";
}

function locationSummary(value: unknown) {
  const record = objectValue(value);
  const city = stringValue(record.city);
  const region = stringValue(record.region);
  const countryCode = stringValue(record.countryCode)?.toUpperCase() ?? null;
  const country = stringValue(record.country) ?? countryName(countryCode) ?? countryCode;
  const source = stringValue(record.source);
  const label = [[city, region].filter(Boolean).join(", "), country]
    .filter(Boolean)
    .join(", ");

  return {
    label: label || "Unknown",
    precision: locationPrecisionLabel({ city, country, countryCode, region }),
    timezone: stringValue(record.timezone),
    source,
    sourceLabel: locationSourceLabel(source),
  };
}

function locationPrecisionLabel(location: {
  city: string | null;
  country: string | null;
  countryCode: string | null;
  region: string | null;
}) {
  if (location.city) return "City-level";
  if (location.region) return "Region-level";
  if (location.country || location.countryCode) return "Country-level";
  return "No location";
}

function locationSourceLabel(source: string | null) {
  if (source === "ip-geolocation") return "IP geolocation";
  if (source === "combined") return "CDN + IP geo";
  if (source === "netlify-geo") return "Netlify geo";
  if (source === "cdn-header") return "CDN geo header";
  return source ?? "No geo data";
}

function countryName(countryCode: string | null) {
  if (!countryCode) return null;

  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(countryCode) ?? null;
  } catch {
    return null;
  }
}

function clickIdLabel(params: Record<string, string>) {
  const clickIds = ["gclid", "gbraid", "wbraid", "msclkid", "fbclid"];
  const key = clickIds.find((item) => params[item]);
  return key ? `${key.toUpperCase()}: ${params[key]}` : null;
}

function clickIdValue(params: Record<string, string>) {
  const clickIds = ["gclid", "gbraid", "wbraid", "msclkid", "fbclid"];
  const key = clickIds.find((item) => params[item]);
  return key ? params[key] : null;
}

function clickIdType(params: Record<string, string>) {
  const clickIds = ["gclid", "gbraid", "wbraid", "msclkid", "fbclid"];
  const key = clickIds.find((item) => params[item]);
  return key ? key.toUpperCase() : null;
}

function conversionSummary(
  records: Array<{
    contactId: string | null;
    createdAt: Date;
    source: string;
  }>,
  contactMap: Map<string, { name: string; company: string | null }>,
) {
  const forms = records.filter((record) => record.source === "FORM").length;
  const calls = records.filter((record) => record.source === "PHONE").length;
  const manual = records.filter((record) => record.source === "MANUAL").length;
  const matchedContactIds = new Set(records.map((record) => record.contactId).filter(isString));
  const latest = records[0] ?? null;
  const latestContact = latest?.contactId ? contactMap.get(latest.contactId)?.name ?? latest.contactId : null;
  const parts = [
    forms ? pluralize(forms, "form") : null,
    calls ? pluralize(calls, "call") : null,
    manual ? pluralize(manual, "manual") : null,
    matchedContactIds.size ? pluralize(matchedContactIds.size, "matched contact") : null,
  ].filter(isString);

  return {
    calls,
    forms,
    label: parts.length ? parts.join(" · ") : "No conversion yet",
    latestAt: latest?.createdAt ?? null,
    latestContact,
    latestType: latest?.source ?? null,
    manual,
    matchedContacts: matchedContactIds.size,
  };
}

function pluralize(count: number, label: string) {
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function referrerHost(value: string | null) {
  if (!value) return null;

  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function pathOnly(value: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.pathname || "/";
  } catch {
    return value;
  }
}

function formatDateTime(value: Date) {
  return dateTimeFormatter.format(value);
}

function formatMoney(valueCents: number) {
  return new Intl.NumberFormat("en-GB", {
    currency: "GBP",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(valueCents / 100);
}

function visitorBackHref(value: string | undefined) {
  if (!value) return "/marketing/visitors";

  try {
    const decoded = decodeURIComponent(value);
    return decoded === "/marketing/visitors" || decoded.startsWith("/marketing/visitors?")
      ? decoded
      : "/marketing/visitors";
  } catch {
    return "/marketing/visitors";
  }
}

function shortId(value: string) {
  if (value.length <= 14) return value;
  return `${value.slice(0, 7)}...${value.slice(-5)}`;
}
