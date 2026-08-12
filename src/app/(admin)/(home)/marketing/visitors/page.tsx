import type { Metadata } from "next";
import Link from "next/link";
import {
  AttributionSourceIconSlot,
  attributionFallbackKindFromText,
  type AttributionFallbackKind,
} from "@/components/crm-boilerplate/AttributionSourceIcon";
import LazyCopyButton from "@/components/crm-boilerplate/LazyCopyButton";
import LazyVisitorLogControls from "@/components/crm-boilerplate/LazyVisitorLogControls";
import LazyVisitorLogLiveRefresh from "@/components/crm-boilerplate/LazyVisitorLogLiveRefresh";
import { MarketingSectionTabs } from "@/components/crm-boilerplate/MarketingRouteShell";
import {
  calculateAttributionConfidence,
  type AttributionConfidenceResult,
} from "@/lib/marketing/attribution-confidence";
import {
  attributionConfidenceFilterValues,
  attributionConfidenceWhere,
  type AttributionConfidenceFilter,
} from "@/lib/marketing/attribution-confidence-filter";
import type { MarketingRange } from "@/lib/marketing/report-navigation";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export const metadata: Metadata = {
  title: "Visitor Log | iD30 CRM",
  description:
    "Audit visitor sessions, attribution touchpoints, forms, calls and tracking activity.",
};

type SearchParams = {
  confidence?: string;
  q?: string;
  source?: string;
  converted?: string;
  range?: string;
  sort?: string;
  page?: string;
  pageSize?: string;
  _refresh?: string;
};

type SourceCategory =
  | "all"
  | "google-ads"
  | "bing-ads"
  | "meta-ads"
  | "linkedin-ads"
  | "paid-search"
  | "paid-social"
  | "referral"
  | "email"
  | "direct"
  | "has-click-id"
  | "has-location"
  | "no-location"
  | "unmatched-paid"
  | "form-leads"
  | "phone-leads"
  | "unknown";

type MatchedLead = {
  name: string;
  company: string | null;
} | null;

type MatchedOpportunity = {
  id: string;
  stage: string;
  title: string;
  valueCents: number;
} | null;

type VisitorLocation = {
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  timezone: string | null;
  source: string | null;
};

type VisitorAdDetails = {
  provider:
    | "google-ads"
    | "bing-ads"
    | "meta-ads"
    | "linkedin-ads"
    | "other"
    | null;
  campaign: string | null;
  content: string | null;
  keyword: string | null;
  clickId: string | null;
  clickIdType: string | null;
};

type VisitorRow = {
  id: string;
  visitorId: string;
  sessionId: string;
  source: string;
  medium: string | null;
  campaign: string | null;
  adDetails: VisitorAdDetails;
  landingPage: string | null;
  currentPage: string | null;
  referrer: string | null;
  trackingPhoneNumber: string | null;
  dniRuleName: string | null;
  dniPoolLabel: string | null;
  dniFallbackReason: string | null;
  forms: number;
  calls: number;
  manualRecords: number;
  latestConversionAt: Date | null;
  debugEvents: number;
  touchpoints: number;
  confidence: AttributionConfidenceResult;
  completion: VisitorCompletion;
  userAgent: string | null;
  ipAddress: string | null;
  location: VisitorLocation | null;
  matchedLead: MatchedLead;
  matchedOpportunity: MatchedOpportunity;
  pageCount: number;
  repeatVisitor: boolean;
  sessionCount: number;
  wonDeal: boolean;
  consentStatus: "Granted" | "Revoked" | "Required" | "Not recorded";
  createdAt: Date;
  lastActivityAt: Date;
};

type VisitorCompletion = {
  completed: number;
  items: Array<{
    complete: boolean;
    label: string;
  }>;
  missing: string[];
  score: number;
  total: number;
};

type VisitorRowsResult = {
  rows: VisitorRow[];
  totalEntries: number;
  metrics: VisitorMetrics;
};

type VisitorMetrics = {
  totalVisitors: number;
  convertedVisitors: number;
  paidSearch: number;
  paidSocial: number;
  referral: number;
  direct: number;
};

const sourceOptions: Array<{ value: SourceCategory; label: string }> = [
  { value: "all", label: "All sources" },
  { value: "google-ads", label: "Google Ads" },
  { value: "bing-ads", label: "Bing Ads" },
  { value: "meta-ads", label: "Meta Ads" },
  { value: "linkedin-ads", label: "LinkedIn Ads" },
  { value: "paid-search", label: "Paid search" },
  { value: "paid-social", label: "Paid social" },
  { value: "referral", label: "Referral" },
  { value: "email", label: "Email / SMS" },
  { value: "direct", label: "Direct" },
  { value: "has-click-id", label: "Has click ID" },
  { value: "has-location", label: "Has location" },
  { value: "no-location", label: "No location" },
  { value: "unmatched-paid", label: "Unmatched paid" },
  { value: "form-leads", label: "Form leads" },
  { value: "phone-leads", label: "Phone leads" },
  { value: "unknown", label: "Unknown" },
];

const rangeOptions = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

function marketingRangeFromVisitorRange(range: string): MarketingRange {
  if (range === "7") return "7d";
  if (range === "90") return "90d";
  if (range === "all") return "all";

  return "30d";
}

const sortOptions = [
  { value: "last-desc", label: "Last activity" },
  { value: "last-asc", label: "Oldest activity" },
  { value: "first-desc", label: "First seen" },
  { value: "source-asc", label: "Source A-Z" },
  { value: "activity-desc", label: "Most activity" },
];

const pageSizeOptions = [
  { value: "10", label: "10 per page" },
  { value: "20", label: "20 per page" },
  { value: "50", label: "50 per page" },
];

const confidenceOptions: Array<{
  value: AttributionConfidenceFilter;
  label: string;
}> = [
  { value: "all", label: "All confidence" },
  { value: "high", label: "High confidence" },
  { value: "medium", label: "Medium confidence" },
  { value: "low", label: "Low confidence" },
  { value: "unknown", label: "Unknown confidence" },
];

const visitorViewPresets: Array<{
  description: string;
  label: string;
  params: Partial<SearchParams>;
}> = [
  {
    description: "Converted visitors with strong attribution evidence",
    label: "High-confidence leads",
    params: {
      confidence: "high",
      converted: "1",
      range: "30",
      sort: "last-desc",
      source: "all",
    },
  },
  {
    description: "Sessions with weak attribution evidence to investigate",
    label: "Needs review",
    params: {
      confidence: "low",
      range: "30",
      sort: "last-desc",
      source: "all",
    },
  },
  {
    description: "Converted Google Ads sessions",
    label: "Google Ads leads",
    params: {
      converted: "1",
      range: "30",
      sort: "last-desc",
      source: "google-ads",
    },
  },
  {
    description: "Converted LinkedIn Ads sessions",
    label: "LinkedIn Ads leads",
    params: {
      converted: "1",
      range: "30",
      sort: "last-desc",
      source: "linkedin-ads",
    },
  },
  {
    description: "Sessions with phone attribution records",
    label: "Phone leads",
    params: {
      converted: "1",
      range: "30",
      sort: "last-desc",
      source: "phone-leads",
    },
  },
  {
    description: "Sessions missing usable geo data",
    label: "No location",
    params: { range: "30", sort: "last-desc", source: "no-location" },
  },
  {
    description: "Paid search sessions with ad evidence",
    label: "Paid search",
    params: { range: "30", sort: "last-desc", source: "paid-search" },
  },
  {
    description: "Paid clicks with no captured conversion or matched contact",
    label: "Unmatched paid",
    params: { range: "30", sort: "last-desc", source: "unmatched-paid" },
  },
  {
    description: "Recent visitors sorted by latest activity",
    label: "Recent visitors",
    params: { range: "7", sort: "last-desc", source: "all" },
  },
];

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

export default async function MarketingVisitorsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const query = (params.q ?? "").trim().toLowerCase();
  const source = sourceOptions.some((option) => option.value === params.source)
    ? (params.source as SourceCategory)
    : "all";
  const range = rangeOptions.some((option) => option.value === params.range)
    ? (params.range ?? "30")
    : "30";
  const sort = sortOptions.some((option) => option.value === params.sort)
    ? (params.sort ?? "last-desc")
    : "last-desc";
  const confidence = attributionConfidenceFilterValues.includes(
    params.confidence as AttributionConfidenceFilter,
  )
    ? (params.confidence as AttributionConfidenceFilter)
    : "all";
  const pageSize = pageSizeOptions.some(
    (option) => option.value === params.pageSize,
  )
    ? Number(params.pageSize)
    : 20;
  const convertedOnly = params.converted === "1";
  const requestedPage = Math.max(1, Number(params.page ?? "1"));
  const since = range === "all" ? null : daysAgo(Number(range));
  const refreshedAt = new Date();
  let visitorResult = await loadVisitorRows({
    convertedOnly,
    page: Number.isFinite(requestedPage) ? requestedPage : 1,
    pageSize,
    query,
    since,
    sort,
    source,
    confidence,
  });
  const totalPages = Math.max(
    1,
    Math.ceil(visitorResult.totalEntries / pageSize),
  );
  const currentPage = Math.min(
    Math.max(1, Number.isFinite(requestedPage) ? requestedPage : 1),
    totalPages,
  );
  if (currentPage !== requestedPage) {
    visitorResult = await loadVisitorRows({
      convertedOnly,
      page: currentPage,
      pageSize,
      query,
      since,
      sort,
      source,
      confidence,
    });
  }
  const visibleRows = visitorResult.rows;
  const metrics = visitorResult.metrics;
  const refreshHref = visitorsLogHref(params, {
    _refresh: Date.now().toString(),
  });
  const exportHref = visitorsExportHref(params);

  return (
    <>
      <LazyVisitorLogLiveRefresh />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
              Visitor Log
            </h1>
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-success-200 bg-success-50 px-2 text-xs font-semibold text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-300">
              <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
              Live updating
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Tracked sessions, sources, journeys, conversions and commercial
            evidence.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/settings/attribution/tracking-script"
            className="inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm font-semibold whitespace-nowrap text-brand-600 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-900/20"
          >
            Learn more
          </Link>
          <Link
            href={refreshHref}
            scroll={false}
            className="inline-flex h-9 min-w-[106px] items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium whitespace-nowrap text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
          >
            Refresh
          </Link>
          <Link
            href={exportHref}
            className="inline-flex h-9 min-w-[100px] items-center justify-center rounded-lg bg-brand-500 px-3 text-sm font-semibold whitespace-nowrap text-white shadow-theme-xs hover:bg-brand-600"
          >
            Export CSV
          </Link>
        </div>
      </div>

      <div className="mt-6">
        <MarketingSectionTabs
          activeRange={marketingRangeFromVisitorRange(range)}
          activeSection="visitors"
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <VisitorMetricPill
          label="Visitors"
          value={metrics.totalVisitors.toString()}
          detail={rangeLabel(range)}
        />
        <VisitorMetricPill
          label="Converted"
          value={metrics.convertedVisitors.toString()}
          detail="Forms or calls"
        />
        <VisitorMetricPill
          label="Paid search"
          value={metrics.paidSearch.toString()}
          detail="Search"
        />
        <VisitorMetricPill
          label="Paid social"
          value={metrics.paidSocial.toString()}
          detail="Social"
        />
        <VisitorMetricPill
          label="Referral"
          value={metrics.referral.toString()}
          detail="Links"
        />
        <VisitorMetricPill
          label="Direct"
          value={metrics.direct.toString()}
          detail="No referrer"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <LazyVisitorLogControls
          confidence={confidence}
          confidenceOptions={confidenceOptions}
          convertedOnly={convertedOnly}
          pageSize={pageSize.toString()}
          pageSizeOptions={pageSizeOptions}
          query={params.q ?? ""}
          range={range}
          rangeOptions={rangeOptions}
          savedViews={visitorViewPresets}
          sort={sort}
          sortOptions={sortOptions}
          source={source}
          sourceOptions={sourceOptions}
          totalEntries={visitorResult.totalEntries}
        />

        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-2 border-b border-gray-100 px-3 py-2.5 2xl:flex-row 2xl:items-center 2xl:justify-between dark:border-gray-800">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
                Active filters
              </span>
              {activeFilterChips({
                convertedOnly,
                confidence,
                pageSize,
                query,
                range,
                sort,
                source,
                totalEntries: visitorResult.totalEntries,
              }).map((chip) => (
                <span
                  key={chip}
                  className="inline-flex h-6 items-center rounded-full border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                >
                  {chip}
                </span>
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Updated {timeLabel(refreshedAt)}
            </p>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[900px] table-fixed divide-y divide-gray-100 text-xs dark:divide-gray-800">
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[21%]" />
                <col className="w-[16%]" />
                <col className="w-[13%]" />
                <col className="w-[13%]" />
                <col className="w-[9%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead className="bg-gray-50 text-left text-[10px] font-semibold text-gray-500 uppercase dark:bg-white/[0.03] dark:text-gray-400">
                <tr>
                  <th className="px-2 py-1.5">Visitor</th>
                  <th className="px-2 py-1.5">Source journey</th>
                  <th className="px-2 py-1.5">Attribution</th>
                  <th className="px-2 py-1.5">Activity</th>
                  <th className="px-2 py-1.5">Lead match</th>
                  <th className="px-2 py-1.5">Last seen</th>
                  <th className="px-2 py-1.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {visibleRows.length ? (
                  visibleRows.map((row) => {
                    const category = sourceCategory(row);
                    const detailHref = visitorDetailHref(row.id, params);
                    const action = nextAction(row, detailHref);

                    return (
                      <tr
                        key={row.id}
                        className="align-middle transition hover:bg-gray-50/70 dark:hover:bg-white/[0.03]"
                      >
                        <td className="px-2 py-1.5">
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <Link
                                href={detailHref}
                                className="truncate font-semibold text-gray-800 underline-offset-2 hover:text-brand-600 hover:underline dark:text-white/90 dark:hover:text-brand-300"
                              >
                                {shortId(row.visitorId)}
                              </Link>
                              <LazyCopyButton
                                className="h-5 w-5"
                                label="Copy visitor ID"
                                value={row.visitorId}
                              />
                              {row.repeatVisitor ? (
                                <VisitorFactPill label="Repeat" tone="brand" />
                              ) : null}
                            </div>
                            <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                              <span className="truncate">
                                Session {shortId(row.sessionId)}
                              </span>
                              <LazyCopyButton
                                className="h-5 w-5"
                                label="Copy session ID"
                                value={row.sessionId}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          <CompactJourneyTrail row={row} category={category} />
                        </td>
                        <td className="px-2 py-1.5">
                          <CompactAttributionCell
                            row={row}
                            category={category}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <ActivityCounters row={row} />
                        </td>
                        <td className="px-2 py-1.5">
                          <LeadMatchCell row={row} detailHref={detailHref} />
                        </td>
                        <td className="px-2 py-1.5">
                          <LastSeenCell row={row} />
                        </td>
                        <td className="px-2 py-1.5">
                          <RowActions
                            action={action}
                            detailHref={detailHref}
                            row={row}
                          />
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-10 text-center text-sm text-gray-500"
                    >
                      No visitor sessions match these filters yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {visitorResult.totalEntries > 0 && (
            <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800 dark:text-gray-400">
              <p>
                Showing{" "}
                {visibleRows.length ? (currentPage - 1) * pageSize + 1 : 0} to{" "}
                {Math.min(currentPage * pageSize, visitorResult.totalEntries)}{" "}
                of {visitorResult.totalEntries} entries
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <PaginationLink
                  disabled={currentPage === 1}
                  href={visitorsLogHref(params, {
                    page: Math.max(1, currentPage - 1).toString(),
                    pageSize: pageSize.toString(),
                    sort,
                  })}
                >
                  Previous
                </PaginationLink>
                {paginationPages(currentPage, totalPages).map((page, index) =>
                  page === "gap" ? (
                    <span
                      key={`${page}-${currentPage}-${index}`}
                      className="px-2 text-gray-400"
                    >
                      ...
                    </span>
                  ) : (
                    <PaginationLink
                      key={page}
                      active={page === currentPage}
                      href={visitorsLogHref(params, {
                        page: page.toString(),
                        pageSize: pageSize.toString(),
                        sort,
                      })}
                    >
                      {page}
                    </PaginationLink>
                  ),
                )}
                <PaginationLink
                  disabled={currentPage === totalPages}
                  href={visitorsLogHref(params, {
                    page: Math.min(totalPages, currentPage + 1).toString(),
                    pageSize: pageSize.toString(),
                    sort,
                  })}
                >
                  Next
                </PaginationLink>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

async function loadVisitorRows(options: {
  confidence: AttributionConfidenceFilter;
  convertedOnly: boolean;
  page: number;
  pageSize: number;
  query: string;
  since: Date | null;
  sort: string;
  source: SourceCategory;
}): Promise<VisitorRowsResult> {
  const where = visitorWhere(options);
  const [totalEntries, metrics, snapshots] = await Promise.all([
    prisma.attributionSnapshot.count({ where }),
    loadVisitorMetrics(options.since),
    prisma.attributionSnapshot.findMany({
      where,
      orderBy: visitorOrderBy(options.sort),
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
      select: {
        id: true,
        visitorId: true,
        sessionId: true,
        firstTouch: true,
        lastTouch: true,
        timeline: true,
        landingPage: true,
        currentPage: true,
        referrer: true,
        attributionSource: true,
        attributionMedium: true,
        attributionCampaign: true,
        attributionAdProvider: true,
        attributionClickId: true,
        attributionClickIdType: true,
        userAgent: true,
        ipAddress: true,
        location: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const keys = snapshots.map((snapshot) => ({
    visitorId: snapshot.visitorId,
    sessionId: snapshot.sessionId,
  }));

  if (!keys.length) {
    return { metrics, rows: [], totalEntries };
  }

  const visitorIds = [
    ...new Set(snapshots.map((snapshot) => snapshot.visitorId)),
  ];

  const [records, assignments, debugEvents, sessionCounts] = await Promise.all([
    prisma.attributionRecord.findMany({
      where: { OR: keys },
      orderBy: { createdAt: "desc" },
      take: 2000,
      select: {
        source: true,
        visitorId: true,
        sessionId: true,
        contactId: true,
        opportunityId: true,
        trackingPhoneNumber: true,
        createdAt: true,
      },
    }),
    prisma.attributionNumberAssignment.findMany({
      where: { OR: keys },
      orderBy: { lastSeenAt: "desc" },
      take: 2000,
      include: {
        phoneNumber: {
          select: {
            phoneNumber: true,
            label: true,
          },
        },
      },
    }),
    prisma.attributionDebugEvent.findMany({
      where: { OR: keys },
      orderBy: { createdAt: "desc" },
      take: 2000,
      select: {
        visitorId: true,
        sessionId: true,
        createdAt: true,
        eventType: true,
      },
    }),
    prisma.attributionSnapshot.groupBy({
      by: ["visitorId"],
      where: { visitorId: { in: visitorIds } },
      _count: { sessionId: true },
    }),
  ]);
  const contactIds = [
    ...new Set(records.map((record) => record.contactId).filter(isString)),
  ];
  const opportunityIds = [
    ...new Set(records.map((record) => record.opportunityId).filter(isString)),
  ];
  const [contacts, opportunities] = await Promise.all([
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
  ]);
  const contactMap = new Map(
    contacts.map((contact) => [
      contact.id,
      {
        name: `${contact.firstName} ${contact.lastName}`.trim(),
        company: contact.company?.name ?? contact.companyName,
      },
    ]),
  );
  const opportunityMap = new Map(
    opportunities.map((opportunity) => [
      opportunity.id,
      {
        id: opportunity.id,
        stage: opportunity.stage,
        title: opportunity.title,
        valueCents: opportunity.valueCents,
      },
    ]),
  );
  const sessionCountMap = new Map(
    sessionCounts.map((item) => [item.visitorId, item._count.sessionId]),
  );
  const recordsByKey = groupByVisitorSession(records);
  const assignmentsByKey = groupByVisitorSession(assignments);
  const debugByKey = groupByVisitorSession(debugEvents);

  const rows = snapshots.map((snapshot) => {
    const key = visitorSessionKey(snapshot.visitorId, snapshot.sessionId);
    const snapshotRecords = recordsByKey.get(key) ?? [];
    const snapshotAssignments = assignmentsByKey.get(key) ?? [];
    const snapshotDebugEvents = debugByKey.get(key) ?? [];
    const latestRecord = latestByDate(snapshotRecords, "createdAt");
    const latestAssignment = latestByDate(snapshotAssignments, "lastSeenAt");
    const latestDebugEvent = latestByDate(snapshotDebugEvents, "createdAt");
    const matchedRecord = snapshotRecords.find((record) => record.contactId);
    const matchedLead = matchedRecord?.contactId
      ? (contactMap.get(matchedRecord.contactId) ?? null)
      : null;
    const matchedOpportunityId =
      snapshotRecords.find((record) => record.opportunityId)?.opportunityId ??
      null;
    const matchedOpportunity = matchedOpportunityId
      ? (opportunityMap.get(matchedOpportunityId) ?? null)
      : null;
    const sessionCount = sessionCountMap.get(snapshot.visitorId) ?? 1;
    const pageCount = timelineLength(snapshot.timeline);
    const consentStatus = consentStatusFromEvents(snapshotDebugEvents);
    const lastActivityAt = latestDate([
      snapshot.updatedAt,
      latestRecord?.createdAt,
      latestAssignment?.lastSeenAt,
      latestDebugEvent?.createdAt,
    ]);
    const source =
      touchSource(snapshot.lastTouch) || touchSource(snapshot.firstTouch);
    const parsedAdDetails = touchAdDetails(
      snapshot.lastTouch,
      snapshot.firstTouch,
    );
    const adDetails = {
      provider:
        adProviderValue(snapshot.attributionAdProvider) ??
        parsedAdDetails.provider,
      campaign: snapshot.attributionCampaign ?? parsedAdDetails.campaign,
      content: parsedAdDetails.content,
      keyword: parsedAdDetails.keyword,
      clickId: snapshot.attributionClickId ?? parsedAdDetails.clickId,
      clickIdType:
        snapshot.attributionClickIdType ?? parsedAdDetails.clickIdType,
    } satisfies VisitorAdDetails;
    const phoneRecord = snapshotRecords.find(
      (record) => record.trackingPhoneNumber,
    );
    const latestPhoneLease = latestAssignment?.phoneNumber;
    const dniRule = dniRuleFromAssignment(latestAssignment?.metadata);
    const forms = snapshotRecords.filter(
      (record) => record.source === "FORM",
    ).length;
    const calls = snapshotRecords.filter(
      (record) => record.source === "PHONE",
    ).length;
    const manualRecords = snapshotRecords.filter(
      (record) => record.source === "MANUAL",
    ).length;
    const location = parseLocation(snapshot.location);
    const completion = visitorCompletion({
      adDetails,
      calls,
      campaign: snapshot.attributionCampaign ?? source.campaign,
      currentPage: snapshot.currentPage,
      forms,
      landingPage: snapshot.landingPage,
      location,
      manualRecords,
      matchedLead,
      matchedOpportunity,
      consentStatus,
      source: snapshot.attributionSource ?? source.source,
      touchpoints: pageCount,
      userAgent: snapshot.userAgent,
      wonDeal: matchedOpportunity?.stage === "WON",
    });

    return {
      id: snapshot.id,
      visitorId: snapshot.visitorId,
      sessionId: snapshot.sessionId,
      source: snapshot.attributionSource ?? source.source,
      medium: snapshot.attributionMedium ?? source.medium,
      campaign: snapshot.attributionCampaign ?? source.campaign,
      adDetails,
      landingPage: snapshot.landingPage,
      currentPage: snapshot.currentPage,
      referrer: snapshot.referrer,
      trackingPhoneNumber:
        latestPhoneLease?.label ||
        latestPhoneLease?.phoneNumber ||
        phoneRecord?.trackingPhoneNumber ||
        null,
      dniRuleName: dniRule.ruleName,
      dniPoolLabel: dniRule.poolLabel,
      dniFallbackReason: dniRule.fallbackReason,
      forms,
      calls,
      manualRecords,
      latestConversionAt: latestRecord?.createdAt ?? null,
      debugEvents: snapshotDebugEvents.length,
      touchpoints: pageCount,
      confidence: calculateAttributionConfidence({
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
        recordsCount: snapshotRecords.length,
        formConversionsCount: forms,
        phoneConversionsCount: calls,
        manualConversionsCount: manualRecords,
        matchedContactId: matchedRecord?.contactId ?? null,
        matchedOpportunityId,
      }),
      completion,
      userAgent: snapshot.userAgent,
      ipAddress: snapshot.ipAddress,
      location,
      matchedLead,
      matchedOpportunity,
      pageCount,
      repeatVisitor: sessionCount > 1,
      sessionCount,
      wonDeal: matchedOpportunity?.stage === "WON",
      consentStatus,
      createdAt: snapshot.createdAt,
      lastActivityAt,
    };
  });

  return { metrics, rows, totalEntries };
}

function visitorWhere(options: {
  confidence: AttributionConfidenceFilter;
  convertedOnly: boolean;
  query: string;
  since: Date | null;
  source: SourceCategory;
}) {
  const filters: Prisma.AttributionSnapshotWhereInput[] = [];

  if (options.since) {
    filters.push({ updatedAt: { gte: options.since } });
  }

  const source = sourceWhere(options.source);
  if (source) {
    filters.push(source);
  }

  const confidence = attributionConfidenceWhere(options.confidence);
  if (confidence) {
    filters.push(confidence);
  }

  if (options.convertedOnly) {
    filters.push({ records: { some: {} } });
  }

  if (options.query) {
    filters.push(searchWhere(options.query));
  }

  return filters.length ? { AND: filters } : {};
}

function searchWhere(query: string): Prisma.AttributionSnapshotWhereInput {
  const contains = { contains: query, mode: "insensitive" as const };

  return {
    OR: [
      { visitorId: contains },
      { sessionId: contains },
      { landingPage: contains },
      { currentPage: contains },
      { referrer: contains },
      { attributionSource: contains },
      { attributionMedium: contains },
      { attributionCampaign: contains },
      { attributionAdProvider: contains },
      { attributionClickId: contains },
      { attributionClickIdType: contains },
      { ipAddress: contains },
      { records: { some: { trackingPhoneNumber: contains } } },
    ],
  };
}

function sourceWhere(
  source: SourceCategory,
): Prisma.AttributionSnapshotWhereInput | null {
  if (source === "all") return null;

  if (source === "google-ads") {
    return { attributionAdProvider: "google-ads" };
  }

  if (source === "bing-ads") {
    return { attributionAdProvider: "bing-ads" };
  }

  if (source === "meta-ads") {
    return { attributionAdProvider: "meta-ads" };
  }

  if (source === "linkedin-ads") {
    return { attributionAdProvider: "linkedin-ads" };
  }

  if (source === "has-click-id") {
    return { attributionClickId: { not: null } };
  }

  if (source === "unmatched-paid") {
    return {
      AND: [{ attributionClickId: { not: null } }, { records: { none: {} } }],
    };
  }

  if (source === "has-location") {
    return {
      NOT: [
        { location: { equals: Prisma.DbNull } },
        { location: { equals: Prisma.JsonNull } },
      ],
    };
  }

  if (source === "no-location") {
    return {
      OR: [
        { location: { equals: Prisma.DbNull } },
        { location: { equals: Prisma.JsonNull } },
      ],
    };
  }

  if (source === "form-leads") {
    return { records: { some: { source: "FORM" } } };
  }

  if (source === "phone-leads") {
    return { records: { some: { source: "PHONE" } } };
  }

  if (source === "paid-search") {
    return {
      OR: [
        { attributionAdProvider: { in: ["google-ads", "bing-ads"] } },
        { attributionClickIdType: { in: ["GCLID", "GBRAID", "WBRAID", "MSCLKID"] } },
        {
          AND: [
            {
              OR: [
                { attributionSource: { contains: "google", mode: "insensitive" } },
                { attributionSource: { contains: "bing", mode: "insensitive" } },
                { attributionSource: { contains: "microsoft", mode: "insensitive" } },
              ],
            },
            paidMediumWhere(),
          ],
        },
      ],
    };
  }

  if (source === "paid-social") {
    return {
      OR: [
        { attributionAdProvider: "linkedin-ads" },
        { AND: [{ attributionAdProvider: "meta-ads" }, paidMediumWhere()] },
        {
          AND: [
            {
              OR: [
                { attributionSource: { contains: "meta", mode: "insensitive" } },
                { attributionSource: { contains: "facebook", mode: "insensitive" } },
                { attributionSource: { contains: "instagram", mode: "insensitive" } },
                { attributionSource: { contains: "linkedin", mode: "insensitive" } },
              ],
            },
            paidMediumWhere(),
          ],
        },
      ],
    };
  }

  if (source === "email") {
    return {
      OR: [
        { attributionSource: { contains: "email", mode: "insensitive" } },
        { attributionSource: { contains: "sms", mode: "insensitive" } },
        { attributionMedium: { contains: "email", mode: "insensitive" } },
        { attributionMedium: { contains: "sms", mode: "insensitive" } },
      ],
    };
  }

  if (source === "direct") {
    return {
      OR: [
        { attributionSource: "Direct" },
        { AND: [{ attributionSource: null }, { referrer: null }] },
      ],
    };
  }

  if (source === "unknown") {
    return {
      OR: [
        { attributionSource: null },
        { attributionSource: { equals: "unknown", mode: "insensitive" } },
        { attributionSource: { equals: "not set", mode: "insensitive" } },
      ],
    };
  }

  return null;
}

function paidMediumWhere(): Prisma.AttributionSnapshotWhereInput {
  return {
    OR: [
      { attributionMedium: { contains: "cpc", mode: "insensitive" } },
      { attributionMedium: { contains: "ppc", mode: "insensitive" } },
      { attributionMedium: { contains: "paid", mode: "insensitive" } },
    ],
  };
}

function visitorOrderBy(
  sort: string,
): Prisma.AttributionSnapshotOrderByWithRelationInput[] {
  if (sort === "last-asc") return [{ updatedAt: "asc" }];
  if (sort === "first-desc") return [{ createdAt: "desc" }];
  if (sort === "source-asc")
    return [{ attributionSource: "asc" }, { updatedAt: "desc" }];
  return [{ updatedAt: "desc" }];
}

async function loadVisitorMetrics(since: Date | null): Promise<VisitorMetrics> {
  const dateWhere: Prisma.AttributionSnapshotWhereInput = since
    ? { updatedAt: { gte: since } }
    : {};
  const [
    totalVisitors,
    convertedVisitors,
    paidSearch,
    paidSocial,
    referral,
    direct,
  ] = await Promise.all([
    prisma.attributionSnapshot.count({ where: dateWhere }),
    prisma.attributionSnapshot.count({
      where: { AND: [dateWhere, { records: { some: {} } }] },
    }),
    prisma.attributionSnapshot.count({
      where: { AND: [dateWhere, sourceWhere("paid-search") ?? {}] },
    }),
    prisma.attributionSnapshot.count({
      where: { AND: [dateWhere, sourceWhere("paid-social") ?? {}] },
    }),
    prisma.attributionSnapshot.count({
      where: {
        AND: [
          dateWhere,
          {
            NOT: [
              {
                OR: [
                  sourceWhere("paid-search") ?? {},
                  sourceWhere("paid-social") ?? {},
                  sourceWhere("email") ?? {},
                  sourceWhere("direct") ?? {},
                  sourceWhere("unknown") ?? {},
                ],
              },
            ],
          },
        ],
      },
    }),
    prisma.attributionSnapshot.count({
      where: { AND: [dateWhere, sourceWhere("direct") ?? {}] },
    }),
  ]);

  return {
    totalVisitors,
    convertedVisitors,
    paidSearch,
    paidSocial,
    referral,
    direct,
  };
}

function groupByVisitorSession<
  T extends { visitorId: string | null; sessionId: string | null },
>(items: T[]) {
  const map = new Map<string, T[]>();

  for (const item of items) {
    if (!item.visitorId || !item.sessionId) continue;
    const key = visitorSessionKey(item.visitorId, item.sessionId);
    map.set(key, [...(map.get(key) ?? []), item]);
  }

  return map;
}

function visitorSessionKey(visitorId: string, sessionId: string) {
  return `${visitorId}::${sessionId}`;
}

function latestByDate<T extends Record<string, unknown>>(
  items: T[],
  field: keyof T,
) {
  return items.reduce<T | null>((latest, item) => {
    const date = item[field];
    if (!(date instanceof Date)) return latest;
    const current = latest?.[field];
    if (!(current instanceof Date)) return item;
    return date > current ? item : latest;
  }, null);
}

function latestDate(values: Array<Date | undefined>) {
  return (
    values
      .filter((value): value is Date => value instanceof Date)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? new Date(0)
  );
}

function touchSource(value: unknown) {
  const params = touchParams(value);
  const source =
    stringValue(params.utm_source) ||
    referrerHost(touchString(value, "referrer")) ||
    "Direct";

  return {
    source,
    medium: stringValue(params.utm_medium),
    campaign: stringValue(params.utm_campaign),
  };
}

function touchAdDetails(
  lastTouch: unknown,
  firstTouch: unknown,
): VisitorAdDetails {
  const lastParams = touchParams(lastTouch);
  const firstParams = touchParams(firstTouch);
  const params = { ...firstParams, ...lastParams };
  const click = adClickId(params);
  const provider = adProvider(params);

  return {
    provider,
    campaign: stringValue(params.utm_campaign),
    content: stringValue(params.utm_content),
    keyword: stringValue(params.utm_term),
    clickId: click.value,
    clickIdType: click.type,
  };
}

function adProvider(
  params: Record<string, unknown>,
): VisitorAdDetails["provider"] {
  const source = stringValue(params.utm_source)?.toLowerCase() ?? "";
  const medium = stringValue(params.utm_medium)?.toLowerCase() ?? "";

  if (
    stringValue(params.gclid) ||
    stringValue(params.gbraid) ||
    stringValue(params.wbraid)
  ) {
    return "google-ads";
  }

  if (stringValue(params.msclkid)) {
    return "bing-ads";
  }

  if (stringValue(params.fbclid)) {
    return "meta-ads";
  }

  if (stringValue(params.li_fat_id)) {
    return "linkedin-ads";
  }

  if (source.includes("google") && /(cpc|ppc|paid|search)/.test(medium)) {
    return "google-ads";
  }

  if (
    (source.includes("bing") || source.includes("microsoft")) &&
    /(cpc|ppc|paid|search)/.test(medium)
  ) {
    return "bing-ads";
  }

  if (
    (source.includes("facebook") ||
      source.includes("instagram") ||
      source.includes("meta")) &&
    /(paid|social|cpc|ppc)/.test(medium)
  ) {
    return "meta-ads";
  }

  if (source.includes("linkedin") && /(paid|social|cpc|ppc)/.test(medium)) {
    return "linkedin-ads";
  }

  return null;
}

function adProviderValue(value: string | null): VisitorAdDetails["provider"] {
  if (
    value === "google-ads" ||
    value === "bing-ads" ||
    value === "meta-ads" ||
    value === "linkedin-ads"
  ) {
    return value;
  }

  return null;
}

function adClickId(params: Record<string, unknown>) {
  const clickIds = [
    ["gclid", "GCLID"],
    ["gbraid", "GBRAID"],
    ["wbraid", "WBRAID"],
    ["msclkid", "MSCLKID"],
    ["fbclid", "FBCLID"],
    ["ttclid", "TTCLID"],
    ["li_fat_id", "LinkedIn click ID"],
  ] as const;

  for (const [key, type] of clickIds) {
    const value = stringValue(params[key]);
    if (value) {
      return { type, value };
    }
  }

  return { type: null, value: null };
}

function touchParams(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const params = (value as { params?: unknown }).params;
  if (!params || typeof params !== "object" || Array.isArray(params)) return {};
  return params as Record<string, unknown>;
}

function touchString(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return stringValue((value as Record<string, unknown>)[key]);
}

function parseLocation(value: unknown): VisitorLocation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const countryCode = stringValue(record.countryCode)?.toUpperCase() ?? null;
  const location = {
    city: stringValue(record.city),
    region: stringValue(record.region),
    country: stringValue(record.country) ?? countryName(countryCode),
    countryCode,
    timezone: stringValue(record.timezone),
    source: stringValue(record.source),
  };

  return Object.values(location).some(Boolean) ? location : null;
}

function dniRuleFromAssignment(metadata: unknown) {
  const record =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  const dniRule =
    record.dniRule &&
    typeof record.dniRule === "object" &&
    !Array.isArray(record.dniRule)
      ? (record.dniRule as Record<string, unknown>)
      : {};

  return {
    ruleName: stringValue(dniRule.ruleName),
    poolLabel: stringValue(dniRule.poolLabel),
    fallbackReason: stringValue(dniRule.fallbackReason),
  };
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

function timelineLength(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function sourceCategory(row: VisitorRow): SourceCategory {
  const source = row.source.toLowerCase();
  const medium = (row.medium ?? "").toLowerCase();
  const referrer = (row.referrer ?? "").toLowerCase();
  const hasPaidMedium = isPaidMedium(medium);

  if (
    row.adDetails.provider === "google-ads" ||
    row.adDetails.provider === "bing-ads"
  ) {
    return "paid-search";
  }

  if (
    row.adDetails.provider === "linkedin-ads"
  ) {
    return "paid-social";
  }

  if (row.adDetails.provider === "meta-ads" && hasPaidMedium) {
    return "paid-social";
  }

  if (
    hasPaidMedium &&
    (source.includes("google") ||
      source.includes("bing") ||
      source.includes("microsoft"))
  ) {
    return "paid-search";
  }

  if (
    hasPaidMedium &&
    (source.includes("meta") ||
      source.includes("facebook") ||
      source.includes("instagram") ||
      source.includes("linkedin"))
  ) {
    return "paid-social";
  }

  if (
    source.includes("email") ||
    source.includes("sms") ||
    medium.includes("email") ||
    medium.includes("sms")
  ) {
    return "email";
  }

  if (source === "direct" || (!row.referrer && source === "direct")) {
    return "direct";
  }

  if (source === "unknown" || source === "not set") {
    return "unknown";
  }

  if (referrer || source) {
    return "referral";
  }

  return "unknown";
}

function isPaidMedium(medium: string) {
  return (
    medium.includes("cpc") ||
    medium.includes("ppc") ||
    medium.includes("paid")
  );
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

function shortId(value: string) {
  if (value.length <= 14) return value;
  return `${value.slice(0, 7)}...${value.slice(-5)}`;
}

function rangeLabel(range: string) {
  if (range === "all") return "All time";
  return `Last ${range} days`;
}

function timeLabel(value: Date) {
  return timeFormatter.format(value);
}

function activeFilterChips({
  confidence,
  convertedOnly,
  pageSize,
  query,
  range,
  sort,
  source,
  totalEntries,
}: {
  confidence: AttributionConfidenceFilter;
  convertedOnly: boolean;
  pageSize: number;
  query: string;
  range: string;
  sort: string;
  source: SourceCategory;
  totalEntries: number;
}) {
  return [
    `${totalEntries} result${totalEntries === 1 ? "" : "s"}`,
    rangeLabel(range),
    sourceChipLabel(source),
    confidenceLabel(confidence),
    sortLabel(sort),
    `${pageSize} per page`,
    convertedOnly ? "Converted only" : null,
    query ? `Search: ${query}` : null,
  ].filter(isString);
}

function confidenceLabel(confidence: AttributionConfidenceFilter) {
  return (
    confidenceOptions.find((option) => option.value === confidence)?.label ??
    "All confidence"
  );
}

function sortLabel(sort: string) {
  return (
    sortOptions.find((option) => option.value === sort)?.label ??
    "Last activity"
  );
}

function locationLabel(location: VisitorLocation | null) {
  if (!location) return "Unknown";

  const locality = [location.city, location.region].filter(Boolean).join(", ");
  const country = location.country ?? location.countryCode;
  return [locality || null, country].filter(Boolean).join(", ") || "Unknown";
}

function countryName(countryCode: string | null) {
  if (!countryCode) return null;

  try {
    return (
      new Intl.DisplayNames(["en"], { type: "region" }).of(countryCode) ?? null
    );
  } catch {
    return null;
  }
}

function locationMetaLabel(
  location: VisitorLocation | null,
  ipAddress: string | null,
) {
  if (!location) return ipAddress ?? "No geo data";

  return [location.timezone, locationSourceLabel(location.source)]
    .filter(Boolean)
    .join(" · ");
}

function locationSourceLabel(source: string | null) {
  if (source === "ip-geolocation") return "IP geolocation";
  if (source === "combined") return "CDN + IP geo";
  if (source === "netlify-geo") return "Netlify geo";
  if (source === "cdn-header") return "CDN geo header";
  return source ?? "Location source unknown";
}

function locationPrecisionLabel(location: VisitorLocation | null) {
  if (!location) return "No location";
  if (location.city) return "City-level";
  if (location.region) return "Region-level";
  if (location.country || location.countryCode) return "Country-level";
  return "No location";
}

function locationConfidenceClasses(location: VisitorLocation | null) {
  if (location?.city) {
    return "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300";
  }
  if (location?.region) {
    return "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300";
  }
  if (location?.country || location?.countryCode) {
    return "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300";
  }
  return "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300";
}

function countryFlag(countryCode: string | null | undefined) {
  if (!countryCode || !/^[A-Z]{2}$/.test(countryCode)) return null;

  return String.fromCodePoint(
    ...countryCode.split("").map((letter) => 127397 + letter.charCodeAt(0)),
  );
}

function visitorsLogHref(
  params: SearchParams,
  overrides: Partial<SearchParams> = {},
) {
  const next = new URLSearchParams();
  const merged: SearchParams = { ...params, ...overrides };

  for (const key of [
    "q",
    "confidence",
    "source",
    "converted",
    "range",
    "sort",
    "page",
    "pageSize",
    "_refresh",
  ] as const) {
    const value = merged[key];
    if (value) {
      next.set(key, value);
    }
  }

  const query = next.toString();
  return query ? `/marketing/visitors?${query}` : "/marketing/visitors";
}

function visitorsExportHref(params: SearchParams) {
  const next = new URLSearchParams();

  for (const key of [
    "q",
    "confidence",
    "source",
    "converted",
    "range",
    "sort",
  ] as const) {
    const value = params[key];
    if (value) {
      next.set(key, value);
    }
  }

  const query = next.toString();
  return query
    ? `/api/marketing/visitors/export?${query}`
    : "/api/marketing/visitors/export";
}

function visitorDetailHref(id: string, params: SearchParams) {
  const from = visitorsLogHref(params);
  return `/marketing/visitors/${id}?from=${encodeURIComponent(from)}`;
}

function isPresetActive(params: SearchParams, preset: Partial<SearchParams>) {
  const activeKeys = ["converted", "range", "sort", "source"] as const;

  return activeKeys.every((key) => {
    const expected = preset[key] ?? defaultVisitorParam(key);
    const current = params[key] ?? defaultVisitorParam(key);
    return current === expected;
  });
}

function defaultVisitorParam(key: "converted" | "range" | "sort" | "source") {
  if (key === "range") return "30";
  if (key === "sort") return "last-desc";
  if (key === "source") return "all";
  return undefined;
}

function referrerLabel(row: VisitorRow) {
  if (row.referrer) return referrerHost(row.referrer) ?? row.referrer;
  if (sourceCategory(row) === "direct") return "Direct";
  return row.source || "Unknown";
}

function sourceLabel(category: SourceCategory, source: string) {
  if (category === "paid-search") {
    if (source.toLowerCase().includes("bing")) return "Bing Ads";
    return "Google Ads";
  }
  if (category === "paid-social") {
    if (source.toLowerCase().includes("linkedin")) return "LinkedIn Ads";
    if (
      source.toLowerCase().includes("facebook") ||
      source.toLowerCase().includes("instagram") ||
      source.toLowerCase().includes("meta")
    ) {
      return "Meta Ads";
    }
    return "Paid social";
  }
  if (category === "email") return "Email";
  if (category === "direct") return "Direct";
  if (category === "unknown") return "Unknown";
  return "Referral";
}

function sourceChipLabel(category: SourceCategory) {
  return (
    sourceOptions.find((option) => option.value === category)?.label ??
    "Unknown"
  );
}

function sourcePillClasses(category: SourceCategory) {
  if (category === "paid-search") {
    return "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300";
  }
  if (category === "paid-social") {
    return "bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300";
  }
  if (category === "referral") {
    return "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300";
  }
  if (category === "email") {
    return "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300";
  }
  if (category === "direct") {
    return "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300";
  }
  return "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400";
}

function deviceType(userAgent: string | null) {
  const value = (userAgent ?? "").toLowerCase();
  if (/mobile|iphone|android/.test(value) && !/ipad|tablet/.test(value))
    return "mobile";
  if (/ipad|tablet/.test(value)) return "tablet";
  return "desktop";
}

function deviceLabel(userAgent: string | null) {
  const device = deviceType(userAgent);
  if (device === "mobile") return "Mobile";
  if (device === "tablet") return "Tablet";
  return "Desktop";
}

function rowStatus(row: VisitorRow) {
  if (row.calls > 0) return "Phone lead";
  if (row.forms > 0) return "Form lead";
  if (row.manualRecords > 0) return "Manual lead";
  if (row.matchedLead) return "Matched lead";
  if (row.touchpoints >= 5) return "Engaged";
  if (isRecent(row.lastActivityAt, 30)) return "Live now";
  if (row.touchpoints > 1) return "Returning visitor";
  if (row.debugEvents > 0) return "Tracked";
  return "New visitor";
}

function visitorCompletion({
  adDetails,
  calls,
  campaign,
  currentPage,
  forms,
  landingPage,
  location,
  manualRecords,
  matchedLead,
  matchedOpportunity,
  consentStatus,
  source,
  touchpoints,
  userAgent,
  wonDeal,
}: {
  adDetails: VisitorAdDetails;
  calls: number;
  campaign: string | null;
  currentPage: string | null;
  forms: number;
  landingPage: string | null;
  location: VisitorLocation | null;
  manualRecords: number;
  matchedLead: MatchedLead;
  matchedOpportunity: MatchedOpportunity;
  consentStatus: VisitorRow["consentStatus"];
  source: string;
  touchpoints: number;
  userAgent: string | null;
  wonDeal: boolean;
}): VisitorCompletion {
  const sourceLower = source.toLowerCase();
  const items = [
    {
      complete: Boolean(
        source && sourceLower !== "direct" && sourceLower !== "unknown",
      ),
      label: "Source",
    },
    {
      complete: Boolean(campaign && campaign !== "Not set"),
      label: "Campaign",
    },
    {
      complete: Boolean(adDetails.clickId),
      label: "Click ID",
    },
    {
      complete: touchpoints > 0 && Boolean(landingPage || currentPage),
      label: "Journey",
    },
    {
      complete: Boolean(location),
      label: "Location",
    },
    {
      complete: forms > 0 || calls > 0 || manualRecords > 0,
      label: "Conversion",
    },
    {
      complete: Boolean(matchedLead),
      label: "Matched lead",
    },
    {
      complete: Boolean(matchedOpportunity),
      label: "Opportunity",
    },
    {
      complete: wonDeal,
      label: "Won sale",
    },
    {
      complete: consentStatus === "Granted",
      label: "Consent",
    },
    {
      complete: Boolean(userAgent),
      label: "Device",
    },
  ];
  const completed = items.filter((item) => item.complete).length;
  const total = items.length;

  return {
    completed,
    items,
    missing: items.filter((item) => !item.complete).map((item) => item.label),
    score: Math.round((completed / total) * 100),
    total,
  };
}

function consentStatusFromEvents(
  events: Array<{ createdAt: Date; eventType: string }>,
): VisitorRow["consentStatus"] {
  const consentEvent = events
    .filter((event) => event.eventType.startsWith("consent."))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

  if (!consentEvent) return "Not recorded";
  if (consentEvent.eventType === "consent.granted") return "Granted";
  if (consentEvent.eventType === "consent.revoked") return "Revoked";
  if (consentEvent.eventType === "consent.required") return "Required";
  return "Not recorded";
}

function consentTone(
  status: VisitorRow["consentStatus"],
): "brand" | "slate" | "success" | "warning" {
  if (status === "Granted") return "success";
  if (status === "Required") return "warning";
  if (status === "Revoked") return "brand";
  return "slate";
}

function conversionSummary(row: VisitorRow) {
  const parts = [
    row.forms ? pluralize(row.forms, "form") : null,
    row.calls ? pluralize(row.calls, "call") : null,
    row.manualRecords ? pluralize(row.manualRecords, "manual") : null,
    row.matchedLead ? "matched contact" : null,
  ].filter(isString);

  if (!parts.length) {
    return "No conversion yet";
  }

  const latest = row.latestConversionAt
    ? `Latest ${dateFormatter.format(row.latestConversionAt)} ${timeFormatter.format(row.latestConversionAt)}`
    : null;

  return [parts.join(" · "), latest].filter(isString).join(" · ");
}

function nextAction(row: VisitorRow, detailHref: string) {
  if (
    row.calls > 0 ||
    row.forms > 0 ||
    row.manualRecords > 0 ||
    row.matchedLead
  ) {
    return {
      cta: row.matchedOpportunity ? "Open sale" : "Open visitor",
      detail: row.matchedLead
        ? "Open the matched contact or sale context from the visitor detail."
        : "Review the captured conversion and attach it to the right contact if needed.",
      href: row.matchedOpportunity
        ? `/sales/${row.matchedOpportunity.id}`
        : detailHref,
      label: "Follow up lead",
    };
  }

  if (row.adDetails.clickId && !row.latestConversionAt) {
    return {
      cta: "Open reports",
      detail: "Paid click has evidence but no conversion record yet.",
      href: "/marketing/attribution-reports?model=last-touch",
      label: "Review paid click",
    };
  }

  if (!row.location) {
    return {
      cta: "Open debug logs",
      detail: "No geo data was stored for this session.",
      href: `/settings/attribution/debug-logs?q=${encodeURIComponent(row.visitorId)}`,
      label: "Check geo capture",
    };
  }

  if (row.debugEvents > 0) {
    return {
      cta: "Open debug logs",
      detail: "Debug events exist for this session.",
      href: `/settings/attribution/debug-logs?q=${encodeURIComponent(row.visitorId)}`,
      label: "Inspect diagnostics",
    };
  }

  if (row.touchpoints >= 5) {
    return {
      cta: "Open visitor",
      detail: "High page activity without a conversion.",
      href: detailHref,
      label: "Review journey",
    };
  }

  return {
    cta: "Open visitor",
    detail: "No immediate action needed.",
    href: detailHref,
    label: "Monitor",
  };
}

function pluralize(count: number, label: string) {
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function isRecent(value: Date, minutes: number) {
  return Date.now() - value.getTime() <= minutes * 60 * 1000;
}

function paginationPages(currentPage: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages: Array<number | "gap"> = [1];
  if (currentPage > 3) pages.push("gap");
  for (
    let page = Math.max(2, currentPage - 1);
    page <= Math.min(totalPages - 1, currentPage + 1);
    page += 1
  ) {
    pages.push(page);
  }
  if (currentPage < totalPages - 2) pages.push("gap");
  pages.push(totalPages);
  return pages;
}

function VisitorMetricPill({
  detail,
  label,
  value,
}: {
  detail: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-gray-500 dark:text-gray-400">
          {label}
        </p>
        <p className="mt-0.5 truncate text-[11px] font-medium text-gray-400 dark:text-gray-500">
          {detail}
        </p>
      </div>
      <p className="shrink-0 text-lg font-semibold text-gray-800 dark:text-white/90">
        {value}
      </p>
    </div>
  );
}

function VisitorMetricCard({
  detail,
  icon,
  label,
  tone,
  value,
}: {
  detail: string;
  icon: "converted" | "direct" | "google" | "meta" | "referral" | "visitors";
  label: string;
  tone: "google" | "meta" | "slate";
  value: string;
}) {
  const toneClasses =
    tone === "google"
      ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
      : tone === "meta"
        ? "bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300"
        : "bg-gray-50 text-gray-600 dark:bg-white/[0.04] dark:text-gray-300";

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${toneClasses}`}
        >
          <MetricIcon icon={icon} />
        </span>
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
            {label}
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <p className="text-xl font-semibold text-gray-800 dark:text-white/90">
              {value}
            </p>
            <span className="text-xs font-semibold text-success-600 dark:text-success-400">
              {detail}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

function SourceChip({
  active,
  href,
  label,
}: {
  active: boolean;
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={`inline-flex h-8 items-center rounded-lg border px-3 text-xs font-semibold transition ${
        active
          ? "border-brand-100 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-900/20 dark:text-brand-300"
          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-transparent dark:text-gray-300 dark:hover:bg-white/[0.05]"
      }`}
    >
      {label}
    </Link>
  );
}

function SavedViewChip({
  active,
  description,
  href,
  label,
}: {
  active: boolean;
  description: string;
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      title={description}
      className={`inline-flex h-8 items-center rounded-lg border px-3 text-xs font-semibold transition ${
        active
          ? "border-brand-500 bg-brand-500 text-white"
          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
      }`}
    >
      {label}
    </Link>
  );
}

function SourceEvidence({ row }: { row: VisitorRow }) {
  const details = row.adDetails;
  const isTooltipAdProvider =
    details.provider === "google-ads" ||
    details.provider === "meta-ads" ||
    details.provider === "linkedin-ads";
  const providerEvidenceTitle =
    details.provider === "linkedin-ads"
      ? "LinkedIn Ads evidence"
      : details.provider === "meta-ads"
        ? "Meta Ads evidence"
        : "Google Ads evidence";
  const evidence = [
    details.campaign ? `Campaign: ${details.campaign}` : null,
    details.keyword ? `Keyword: ${details.keyword}` : null,
    details.content ? `Content: ${details.content}` : null,
    details.clickId && details.clickIdType
      ? `${details.clickIdType}: ${shortId(details.clickId)}`
      : null,
  ].filter(isString);
  const summary =
    details.campaign ||
    (details.clickIdType ? `${details.clickIdType} captured` : null) ||
    row.campaign;

  if (!isTooltipAdProvider && !evidence.length) {
    return row.campaign ? (
      <p className="mt-2 max-w-[210px] truncate text-xs text-gray-500 dark:text-gray-400">
        Campaign: {row.campaign}
      </p>
    ) : null;
  }

  if (!isTooltipAdProvider) {
    return (
      <div className="mt-2 space-y-1">
        {evidence.slice(0, 2).map((item) => (
          <p
            key={item}
            className="max-w-[210px] truncate text-xs text-gray-500 dark:text-gray-400"
          >
            {item}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className="group/evidence relative mt-2 inline-flex max-w-[220px] items-center gap-1.5">
      <span className="min-w-0 truncate text-xs font-medium text-amber-700 dark:text-amber-300">
        {summary ?? `${providerEvidenceTitle.replace(" evidence", "")} visit`}
      </span>
      <button
        type="button"
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-700 transition outline-none hover:bg-amber-100 focus:ring-2 focus:ring-amber-400/40 dark:border-amber-500/30 dark:bg-amber-900/20 dark:text-amber-200"
        aria-label={`Show ${providerEvidenceTitle}`}
      >
        <InfoIcon />
      </button>
      <div className="pointer-events-none absolute top-full left-0 z-50 mt-2 w-72 rounded-lg border border-gray-200 bg-white p-3 text-left opacity-0 shadow-lg transition-opacity group-focus-within/evidence:opacity-100 group-hover/evidence:opacity-100 dark:border-gray-700 dark:bg-gray-900">
        <p className="text-xs font-semibold text-gray-800 dark:text-white/90">
          {providerEvidenceTitle}
        </p>
        <div className="mt-2 space-y-1.5">
          {(evidence.length ? evidence : ["No campaign parameters"])
            .slice(0, 4)
            .map((item) => {
              const isClickId =
                details.clickId &&
                details.clickIdType &&
                item.startsWith(details.clickIdType);

              return (
                <div
                  key={item}
                  className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-300"
                >
                  <p className="min-w-0 flex-1 break-words">{item}</p>
                  {isClickId ? (
                    <LazyCopyButton
                      label={`Copy ${details.clickIdType}`}
                      value={details.clickId}
                    />
                  ) : null}
                </div>
              );
            })}
        </div>
        <p className="mt-2 border-t border-gray-100 pt-2 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
          Location from visitor tracking
        </p>
      </div>
    </div>
  );
}

function CompactJourneyTrail({
  category,
  row,
}: {
  category: SourceCategory;
  row: VisitorRow;
}) {
  const source = sourceLabel(category, row.source);
  const currentPage = pathOnly(row.currentPage) || "/";
  const landingPage = pathOnly(row.landingPage) || "unknown";
  const conversion =
    row.forms > 0 || row.calls > 0 || row.manualRecords > 0 || row.matchedLead;
  const assisted = Math.max(0, row.touchpoints - 2);

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1 text-gray-400">
        <JourneyIcon
          detail={source}
          icon={<SourceIcon category={category} label={source} size="sm" />}
          label="First"
        />
        <span className="text-[10px]">→</span>
        {assisted > 0 ? (
          <>
            <JourneyIcon
              detail={`${assisted} touch${assisted === 1 ? "" : "es"}`}
              icon={<DocumentIcon />}
              label="Assist"
            />
            <span className="text-[10px]">→</span>
          </>
        ) : null}
        <JourneyIcon
          detail={conversion ? conversionSummary(row) : currentPage}
          icon={conversion ? <CheckIcon /> : <SearchIcon />}
          label={conversion ? "Lead" : "Latest"}
        />
      </div>
      <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">
        {landingPage} → {currentPage}
      </p>
    </div>
  );
}

function JourneyIcon({
  detail,
  icon,
  label,
}: {
  detail: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <span className="group/journey relative inline-flex items-center gap-1">
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 [&>svg]:h-3 [&>svg]:w-3">
        {icon}
      </span>
      <span className="hidden text-[11px] font-semibold text-gray-500 2xl:inline dark:text-gray-400">
        {label}
      </span>
      <span className="pointer-events-none absolute top-full left-0 z-40 mt-1 hidden max-w-64 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 shadow-lg group-hover/journey:block dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
        {label}: {detail}
      </span>
    </span>
  );
}

function CompactAttributionCell({
  category,
  row,
}: {
  category: SourceCategory;
  row: VisitorRow;
}) {
  const source = sourceLabel(category, row.source);
  const evidence =
    row.adDetails.campaign ||
    row.campaign ||
    row.medium ||
    row.adDetails.clickIdType ||
    referrerLabel(row);

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1.5">
        <SourceIcon category={category} label={source} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-gray-800 dark:text-white/90">
            {source}
          </p>
          <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
            {evidence || "No campaign data"}
          </p>
        </div>
      </div>
      <div className="mt-0.5 flex min-w-0 items-center gap-1">
        <ConfidenceBadge confidence={row.confidence} compact />
        <span
          className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap ${completionScoreClasses(
            row.completion.score,
          )}`}
        >
          {row.completion.score}%
        </span>
      </div>
    </div>
  );
}

function ActivityCounters({ row }: { row: VisitorRow }) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1">
        <MiniCounter label="Pages" shortLabel="P" value={row.pageCount} />
        <MiniCounter
          label="Forms"
          shortLabel="F"
          value={row.forms}
          tone={row.forms ? "success" : "slate"}
        />
        <MiniCounter
          label="Calls"
          shortLabel="C"
          value={row.calls}
          tone={row.calls ? "success" : "slate"}
        />
        <MiniCounter label="Debug" shortLabel="D" value={row.debugEvents} />
      </div>
      <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">
        {row.trackingPhoneNumber
          ? `DNI ${row.trackingPhoneNumber}`
          : `${row.sessionCount} session${row.sessionCount === 1 ? "" : "s"}`}
      </p>
    </div>
  );
}

function MiniCounter({
  label,
  shortLabel,
  tone = "slate",
  value,
}: {
  label: string;
  shortLabel: string;
  tone?: "slate" | "success";
  value: number;
}) {
  return (
    <span
      title={`${label}: ${value}`}
      className={`inline-flex h-5 min-w-6 items-center justify-center gap-0.5 rounded-md px-1 text-center text-[10px] font-semibold ring-1 ring-inset ${
        tone === "success"
          ? "bg-success-50 text-success-700 ring-success-100 dark:bg-success-900/20 dark:text-success-300 dark:ring-success-900/40"
          : "bg-gray-50 text-gray-600 ring-gray-200 dark:bg-white/[0.04] dark:text-gray-300 dark:ring-gray-800"
      }`}
    >
      <span>{shortLabel}</span>
      <span>{value}</span>
    </span>
  );
}

function LeadMatchCell({
  detailHref,
  row,
}: {
  detailHref: string;
  row: VisitorRow;
}) {
  if (!row.matchedLead && !row.matchedOpportunity) {
    return (
      <div className="min-w-0">
        <Link
          href={detailHref}
          className="inline-flex max-w-full rounded-full bg-warning-50 px-2 py-0.5 text-[11px] font-semibold text-warning-700 hover:text-warning-800 dark:bg-warning-900/20 dark:text-warning-300"
        >
          Needs review
        </Link>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      {row.matchedLead ? (
        <>
          <p className="truncate text-xs font-semibold text-gray-800 dark:text-white/90">
            {row.matchedLead.name}
          </p>
          <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
            {row.matchedLead.company ?? "Matched contact"}
          </p>
        </>
      ) : null}
      {row.matchedOpportunity ? (
        <Link
          href={`/sales/${row.matchedOpportunity.id}`}
          className="mt-0.5 flex min-w-0 items-center gap-1"
        >
          <span
            className={`inline-flex shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${opportunityStageClasses(
              row.matchedOpportunity.stage,
            )}`}
          >
            {stageLabel(row.matchedOpportunity.stage)}
          </span>
          <span className="truncate text-xs font-semibold text-gray-700 hover:text-brand-600 dark:text-gray-300 dark:hover:text-brand-300">
            {row.matchedOpportunity.title}
          </span>
        </Link>
      ) : null}
    </div>
  );
}

function LastSeenCell({ row }: { row: VisitorRow }) {
  return (
    <div className="min-w-0 text-[11px] text-gray-500 dark:text-gray-400">
      <p className="truncate font-semibold text-gray-700 dark:text-gray-300">
        {dateFormatter.format(row.lastActivityAt)},{" "}
        {timeFormatter.format(row.lastActivityAt)}
      </p>
      <div className="mt-0.5 flex min-w-0 items-center gap-1">
        <DeviceIcon device={deviceType(row.userAgent)} />
        <span className="truncate">{deviceLabel(row.userAgent)}</span>
      </div>
    </div>
  );
}

function RowActions({
  action,
  detailHref,
  row,
}: {
  action: ReturnType<typeof nextAction>;
  detailHref: string;
  row: VisitorRow;
}) {
  const debugHref = `/settings/attribution/debug-logs?q=${encodeURIComponent(row.visitorId)}`;
  const saleHref = row.matchedOpportunity
    ? `/sales/${row.matchedOpportunity.id}`
    : null;
  const showExtraAction =
    action.href !== detailHref &&
    action.href !== debugHref &&
    action.href !== saleHref;

  return (
    <div className="flex justify-end gap-1">
      <IconActionLink href={detailHref} label="View visitor">
        <SearchIcon />
      </IconActionLink>
      {saleHref ? (
        <IconActionLink href={saleHref} label="Open sale">
          <CheckCircleIcon />
        </IconActionLink>
      ) : null}
      <IconActionLink href={debugHref} label="Open debug logs">
        <DocumentIcon />
      </IconActionLink>
      {showExtraAction ? (
        <IconActionLink href={action.href} label={action.label}>
          <InfoIcon />
        </IconActionLink>
      ) : null}
    </div>
  );
}

function IconActionLink({
  children,
  href,
  label,
}: {
  children: React.ReactNode;
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/10 dark:hover:text-brand-300 [&>svg]:h-3 [&>svg]:w-3"
    >
      {children}
    </Link>
  );
}

function ConfidenceBadge({
  compact = false,
  confidence,
}: {
  compact?: boolean;
  confidence: AttributionConfidenceResult;
}) {
  return (
    <span
      title={confidence.clientSummary}
      className={`inline-flex rounded-full font-semibold whitespace-nowrap ${compact ? "px-1.5 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"} ${confidenceBadgeClasses(confidence.level)}`}
    >
      {compact
        ? `${confidence.level} ${confidence.percentage}%`
        : `${confidence.level} confidence · ${confidence.percentage}%`}
    </span>
  );
}

function VisitorFactPill({
  label,
  tone = "slate",
}: {
  label: string;
  tone?: "brand" | "slate" | "success" | "warning";
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${visitorFactPillClasses(tone)}`}
    >
      {label}
    </span>
  );
}

function visitorFactPillClasses(
  tone: "brand" | "slate" | "success" | "warning",
) {
  if (tone === "brand") {
    return "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300";
  }
  if (tone === "success") {
    return "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300";
  }
  if (tone === "warning") {
    return "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300";
  }
  return "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300";
}

function opportunityStageClasses(stage: string) {
  if (stage === "WON") {
    return "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300";
  }
  if (stage === "LOST") {
    return "bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300";
  }
  if (stage === "PROPOSAL" || stage === "NEGOTIATION") {
    return "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300";
  }
  if (stage === "QUALIFIED") {
    return "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300";
  }
  return "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300";
}

function stageLabel(stage: string) {
  return stage
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatMoney(valueCents: number) {
  return new Intl.NumberFormat("en-GB", {
    currency: "GBP",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(valueCents / 100);
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

function PaginationLink({
  active = false,
  children,
  disabled = false,
  href,
}: {
  active?: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      scroll={false}
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
    </Link>
  );
}

function CompletionCell({ completion }: { completion: VisitorCompletion }) {
  const topMissing = completion.missing.slice(0, 3);

  return (
    <div className="min-w-[150px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-gray-800 dark:text-white/90">
          {completion.completed}/{completion.total}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${completionScoreClasses(completion.score)}`}
        >
          {completion.score}%
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
        <div
          className={`h-full rounded-full ${completionBarClasses(completion.score)}`}
          style={{ width: `${completion.score}%` }}
        />
      </div>
      {topMissing.length ? (
        <p className="mt-2 max-w-[170px] text-xs text-gray-500 dark:text-gray-400">
          Missing {topMissing.join(", ")}
          {completion.missing.length > topMissing.length ? "..." : ""}
        </p>
      ) : (
        <p className="mt-2 text-xs text-success-600 dark:text-success-300">
          Core fields complete
        </p>
      )}
    </div>
  );
}

function completionScoreClasses(score: number) {
  if (score >= 75) {
    return "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300";
  }
  if (score >= 50) {
    return "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300";
  }
  return "bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300";
}

function completionBarClasses(score: number) {
  if (score >= 75) return "bg-success-500";
  if (score >= 50) return "bg-warning-500";
  return "bg-error-500";
}

function JourneyDots({
  category,
  row,
}: {
  category: SourceCategory;
  row: VisitorRow;
}) {
  const assistedTouches = Math.max(0, row.touchpoints - 2);
  const steps = [
    {
      detail: sourceLabel(category, row.source),
      key: "first",
      icon: (
        <SourceIcon
          category={category}
          label={sourceLabel(category, row.source)}
        />
      ),
      label: "First",
    },
    ...(assistedTouches > 0
      ? [
          {
            detail: `${assistedTouches} touch${assistedTouches === 1 ? "" : "es"}`,
            key: "assisted",
            icon: <DocumentIcon />,
            label: "Assisted",
          },
        ]
      : []),
    row.forms > 0 || row.calls > 0 || row.manualRecords > 0
      ? {
          detail: conversionSummary(row),
          key: "last",
          icon: <CheckIcon />,
          label: "Last",
        }
      : {
          detail: pathOnly(row.currentPage) || "Current page",
          key: "last",
          icon: <SearchIcon />,
          label: "Last",
        },
  ];

  return (
    <div className="flex items-center gap-1.5 text-gray-400">
      {steps.map((step, index) => (
        <span key={step.key} className="flex items-center gap-1.5">
          <span className="flex min-w-[64px] flex-col items-center gap-1">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
              {step.icon}
            </span>
            <span className="text-[11px] font-semibold text-gray-500 uppercase dark:text-gray-400">
              {step.label}
            </span>
            <span className="max-w-[78px] truncate text-[11px] text-gray-400 dark:text-gray-500">
              {step.detail}
            </span>
          </span>
          {index < steps.length - 1 ? <span>→</span> : null}
        </span>
      ))}
    </div>
  );
}

function sourceIconLabel(category: SourceCategory, label?: string | null) {
  const trimmed = label?.trim();
  if (trimmed && trimmed !== "Unknown") return trimmed;

  if (category === "google-ads" || category === "paid-search")
    return "Google Ads";
  if (category === "bing-ads") return "Bing Ads";
  if (category === "meta-ads" || category === "paid-social") return "Meta Ads";
  if (category === "linkedin-ads") return "LinkedIn Ads";
  if (category === "email") return "Email";
  if (category === "direct") return "Direct";
  if (category === "form-leads") return "Form lead";
  if (category === "phone-leads") return "Phone lead";
  if (category === "referral") return "Referral";

  return "Unknown source";
}

function sourceIconFallbackKind(
  category: SourceCategory,
  label?: string | null,
): AttributionFallbackKind {
  if (category === "email") return "email";
  if (category === "form-leads") return "form";
  if (category === "phone-leads") return "phone";
  if (category === "direct" || category === "referral") return "website";
  if (category === "unknown") return "source";

  return attributionFallbackKindFromText(sourceIconLabel(category, label));
}

function SourceIcon({
  category,
  label,
  size = "md",
}: {
  category: SourceCategory;
  label?: string | null;
  size?: "md" | "sm";
}) {
  const iconLabel = sourceIconLabel(category, label);
  const isSmall = size === "sm";

  return (
    <span
      className={`inline-grid shrink-0 place-items-center border border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 ${
        isSmall ? "h-5 w-5 rounded-md" : "h-7 w-7 rounded-lg"
      }`}
    >
      <AttributionSourceIconSlot
        className={isSmall ? "size-3" : "size-4"}
        fallbackKind={sourceIconFallbackKind(category, iconLabel)}
        iconClassName={isSmall ? "block h-3 w-3" : "block h-4 w-4"}
        label={iconLabel}
      />
    </span>
  );
}

function DeviceIcon({ device }: { device: string }) {
  if (device === "mobile") return <MobileIcon />;
  return <DesktopIcon />;
}

function MapPinIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 14s4-3.45 4-7a4 4 0 0 0-8 0c0 3.55 4 7 4 7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 8.25a1.35 1.35 0 1 0 0-2.7 1.35 1.35 0 0 0 0 2.7Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function MetricIcon({ icon }: { icon: string }) {
  if (icon === "google") {
    return (
      <AttributionSourceIconSlot fallbackKind="search" label="Google Ads" />
    );
  }
  if (icon === "meta") {
    return <AttributionSourceIconSlot fallbackKind="search" label="Meta Ads" />;
  }
  if (icon === "direct") {
    return <AttributionSourceIconSlot fallbackKind="website" label="Direct" />;
  }
  if (icon === "referral") {
    return (
      <AttributionSourceIconSlot fallbackKind="website" label="Referral" />
    );
  }
  if (icon === "converted") return <CheckCircleIcon />;
  return <UsersIcon />;
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7.25 12.5a5.25 5.25 0 1 0 0-10.5 5.25 5.25 0 0 0 0 10.5ZM11 11l3 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6.75 8.25a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM1.5 15.75c.6-2.8 2.45-4.5 5.25-4.5s4.65 1.7 5.25 4.5M12 8.25a2.25 2.25 0 0 0 0-4.5M13.5 11.25c1.55.45 2.55 1.95 3 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9 16.5A7.5 7.5 0 1 0 9 1.5a7.5 7.5 0 0 0 0 15ZM5.75 9.15l2.1 2.1 4.55-4.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 7.25v4M8 4.75h.01M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 2.5h5L12 5.5v8H4v-11ZM9 2.75V5.5h2.75"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m3.5 8.3 3 3 6-6.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DesktopIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2.5 3.5h11v7h-11v-7ZM6.25 13h3.5M8 10.5V13"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MobileIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 2.25h6v11.5H5V2.25ZM7.5 11.75h1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
