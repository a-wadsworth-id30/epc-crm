import type { CustomerSalesCategory, Prisma, SalesStage } from "@prisma/client";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Columns3, Table2 } from "lucide-react";
import { AIActionButton, AILabel } from "@/components/crm-boilerplate/AITheme";
import CustomerSalesCategoryBadge from "@/components/crm-boilerplate/CustomerSalesCategoryBadge";
import EmptyState from "@/components/crm-boilerplate/EmptyState";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import SalesKanbanDragBoard from "@/components/crm-boilerplate/SalesKanbanDragBoard";
import SalesPipelineStageBadge from "@/components/crm-boilerplate/SalesPipelineStageBadge";
import { SalesSourceJourney } from "@/components/crm-boilerplate/SalesSourceJourney";
import {
  DeferredAddSaleModal,
  LazySalesPipelineFilters,
  LazySalesTableFrame,
} from "@/components/crm-boilerplate/SalesRouteLoaders";
import ServerPagination from "@/components/crm-boilerplate/ServerPagination";
import {
  ChatIcon,
  CheckCircleIcon,
  DollarLineIcon,
  PieChartIcon,
} from "@/icons";
import { requireUser } from "@/lib/auth";
import {
  calculateAttributionConfidence,
  type AttributionConfidenceResult,
} from "@/lib/marketing/attribution-confidence";
import { salesOpportunityWhereWithAccess } from "@/lib/crm-resource-access";
import { prisma } from "@/lib/prisma";
import {
  parseSalesDefaults,
  resolveSalesDefaultOwnerId,
} from "@/lib/sales/defaults";
import {
  parseSalesKanbanSettings,
  type SalesKanbanCardField,
} from "@/lib/sales/kanban-settings";
import { saleOwnerOptionsForUser } from "@/lib/sales/owner-assignment";
import {
  customerSalesCategoryOptions,
  isCustomerSalesCategoryValue,
  type CustomerSalesCategoryValue,
} from "@/lib/sales/customer-sales-category";
import {
  DEFAULT_SALES_SORT,
  fallbackStageColors,
  openStages,
  parseCustomerCategoryFilter,
  parseSalesPipelineView,
  parseSalesSort,
  parseStageFilter,
  salesSortOptions,
  singleParam,
  stageLabels,
  type PipelineStageOption,
  type SalesSearchParams,
} from "@/lib/sales/pipeline-navigation";
import {
  buildSourceJourney,
  jsonObject,
  stringValue,
} from "@/lib/sales/source-journey";
import {
  formatDisplayDate,
  formatDisplayMoney,
  parseDisplayDefaults,
  type DisplayFormattingContext,
} from "@/lib/display-defaults";
import {
  parseInterfaceDefaults,
  resolveInterfacePageSizeFallback,
} from "@/lib/interface-defaults";
import type { SalesStageValue } from "@/lib/sales/lifecycle";
import {
  parsePageSize,
  parsePositiveInteger,
} from "@/lib/navigation/pagination";
import { getCrmSettings } from "@/lib/settings";
import { parseWorkspaceDefaults } from "@/lib/workspace-defaults";
import { pipedriveProvider } from "@/lib/integrations/pipedrive";

export const metadata: Metadata = {
  title: "Sales Pipeline | iD30 CRM",
};

type SalesPageProps = {
  searchParams?: Promise<SalesSearchParams>;
};

const salesPageSizes = [10, 20, 25, 50, 100] as const;
const defaultSalesPageSize = 20;
const kanbanOpportunityLimit = 240;
const openKanbanTaskStatuses = ["TODO", "IN_PROGRESS", "BLOCKED"] as const;
const pipedriveDealExternalType = "deal";
const salesOpportunityExternalType = "salesOpportunity";

function formatMoney(
  valueCents: number,
  currency: string,
  formatting: DisplayFormattingContext,
) {
  return formatDisplayMoney(valueCents, currency, formatting);
}

function formatDate(date: Date | null, formatting: DisplayFormattingContext) {
  return formatDisplayDate(date, formatting);
}

function formatStage(stage: string) {
  return stage
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function contactName(contact: { firstName: string; lastName: string } | null) {
  if (!contact) return "";

  return `${contact.firstName} ${contact.lastName}`.trim();
}

function attributionHealth(opportunity: {
  id: string;
  source: string | null;
  attribution: unknown;
  contactId: string | null;
}) {
  const attribution = jsonObject(opportunity.attribution);
  const metadata = jsonObject(attribution.metadata);
  const sourceMetadata = jsonObject(attribution.sourceMetadata);
  const hasAttributionPayload = Object.keys(attribution).length > 0;

  return calculateAttributionConfidence({
    firstTouch: attribution.firstTouch,
    lastTouch: attribution.lastTouch,
    timeline: attribution.timeline,
    landingPage: stringValue(attribution.landingPage),
    currentPage: stringValue(attribution.currentPage),
    referrer: stringValue(attribution.referrer),
    attributionSource:
      stringValue(sourceMetadata.source) ||
      stringValue(metadata.source) ||
      stringValue(attribution.source) ||
      opportunity.source,
    attributionMedium:
      stringValue(sourceMetadata.medium) ||
      stringValue(metadata.medium) ||
      stringValue(attribution.medium),
    attributionCampaign:
      stringValue(sourceMetadata.campaign) ||
      stringValue(metadata.campaign) ||
      stringValue(attribution.campaign),
    recordsCount: hasAttributionPayload ? 1 : 0,
    matchedContactId: opportunity.contactId,
    matchedOpportunityId: opportunity.id,
  });
}

function attributionHealthClasses(level: AttributionConfidenceResult["level"]) {
  if (level === "High") {
    return "bg-success-50 text-success-700 ring-success-200 dark:bg-success-900/20 dark:text-success-300 dark:ring-success-900/40";
  }

  if (level === "Medium") {
    return "bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-900/20 dark:text-brand-300 dark:ring-brand-900/40";
  }

  if (level === "Low") {
    return "bg-warning-50 text-warning-700 ring-warning-200 dark:bg-warning-900/20 dark:text-warning-300 dark:ring-warning-900/40";
  }

  return "bg-gray-50 text-gray-600 ring-gray-200 dark:bg-white/[0.05] dark:text-gray-400 dark:ring-gray-800";
}

function attributionHealthSummary(confidence: AttributionConfidenceResult) {
  const missing = confidence.missingFactors
    .filter((factor) => factor.key !== "consent")
    .slice(0, 2)
    .map((factor) => factor.label.toLowerCase());

  if (!missing.length) return "Evidence complete";

  return `Missing ${missing.join(", ")}`;
}

function salesAiAction(nextStep: string | null) {
  return nextStep || "Review latest context and choose the next follow-up.";
}

function KanbanFact({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="rounded-lg bg-gray-50 px-2.5 py-2 ring-1 ring-gray-100 dark:bg-white/[0.03] dark:ring-gray-800">
      <div className="text-[10px] font-semibold tracking-normal text-gray-500 uppercase dark:text-gray-400">
        {label}
      </div>
      <div className="mt-1 line-clamp-2 text-xs leading-5 font-medium text-gray-700 dark:text-gray-300">
        {children}
      </div>
    </div>
  );
}

function hasKanbanField(
  fields: Set<SalesKanbanCardField>,
  field: SalesKanbanCardField,
) {
  return fields.has(field);
}

function servicePlanStatusLabel(leadScope: unknown) {
  const data = jsonObject(leadScope);
  const servicePlan = jsonObject(data.servicePlan);
  const status =
    stringValue(data.servicePlanStatus) ||
    stringValue(data.serviceStatus) ||
    stringValue(servicePlan.status) ||
    stringValue(servicePlan.planStatus);

  if (status) return status;
  if (typeof data.servicePlanActive === "boolean") {
    return data.servicePlanActive ? "Active" : "Not active";
  }
  if (typeof servicePlan.active === "boolean") {
    return servicePlan.active ? "Active" : "Not active";
  }

  return "Not set";
}

function ownerInitials(name: string | null) {
  if (!name) return "?";

  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function OwnerBadge({ name }: { name: string | null }) {
  const displayName = name || "Unassigned";

  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-600 ring-1 ring-gray-200 ring-inset dark:bg-white/[0.06] dark:text-gray-300 dark:ring-gray-800">
        {ownerInitials(name)}
      </span>
      <span className="min-w-0 truncate text-xs font-medium text-gray-700 dark:text-gray-300">
        {displayName}
      </span>
    </span>
  );
}

function salesHref({
  customerCategory,
  owner,
  query,
  sort,
  stage,
  view,
}: {
  customerCategory: string;
  owner: string;
  query: string;
  sort: string;
  stage: string;
  view: "table" | "kanban";
}) {
  const params = new URLSearchParams();

  if (view === "kanban") params.set("view", "kanban");
  if (query) params.set("q", query);
  if (customerCategory !== "all") {
    params.set("customerCategory", customerCategory);
  }
  if (stage !== "all") params.set("stage", stage);
  if (owner !== "all") params.set("owner", owner);
  if (sort !== DEFAULT_SALES_SORT) params.set("sort", sort);

  return params.toString() ? `/sales?${params}` : "/sales";
}

function SalesViewSwitch({
  activeView,
  kanbanHref,
  tableHref,
}: {
  activeView: "table" | "kanban";
  kanbanHref: string;
  tableHref: string;
}) {
  const linkClassName = (isActive: boolean) =>
    `inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition ${
      isActive
        ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-900/50"
        : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.05]"
    }`;

  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 dark:border-gray-800 dark:bg-gray-950">
      <Link
        href={tableHref}
        className={linkClassName(activeView === "table")}
        aria-current={activeView === "table" ? "page" : undefined}
      >
        <Table2 className="h-4 w-4" />
        Table
      </Link>
      <Link
        href={kanbanHref}
        className={linkClassName(activeView === "kanban")}
        aria-current={activeView === "kanban" ? "page" : undefined}
      >
        <Columns3 className="h-4 w-4" />
        Kanban
      </Link>
    </div>
  );
}

function SalesStatCard({
  accent,
  detail,
  icon,
  label,
  meta,
  value,
}: {
  accent: "brand" | "purple" | "success" | "slate";
  detail: string;
  icon: ReactNode;
  label: string;
  meta: string;
  value: string | number;
}) {
  const accentClasses = {
    brand: {
      icon: "bg-brand-50 text-brand-600 ring-brand-100 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-900/40",
      bar: "bg-brand-500",
      chip: "bg-brand-50 text-brand-700 ring-brand-100 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-900/40",
    },
    purple: {
      icon: "bg-purple-50 text-purple-600 ring-purple-100 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-900/40",
      bar: "bg-purple-500",
      chip: "bg-purple-50 text-purple-700 ring-purple-100 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-900/40",
    },
    success: {
      icon: "bg-success-50 text-success-600 ring-success-100 dark:bg-success-500/10 dark:text-success-300 dark:ring-success-900/40",
      bar: "bg-success-500",
      chip: "bg-success-50 text-success-700 ring-success-100 dark:bg-success-500/10 dark:text-success-300 dark:ring-success-900/40",
    },
    slate: {
      icon: "bg-gray-100 text-gray-700 ring-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:ring-gray-800",
      bar: "bg-gray-500",
      chip: "bg-gray-100 text-gray-700 ring-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:ring-gray-800",
    },
  }[accent];

  return (
    <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-white p-2.5 shadow-theme-xs transition hover:-translate-y-0.5 hover:shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03]">
      <span
        aria-hidden="true"
        className={`absolute inset-x-0 top-0 h-0.5 ${accentClasses.bar}`}
      />
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset [&>svg]:h-4 [&>svg]:w-4 ${accentClasses.icon}`}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
            {label}
          </p>
          <div className="mt-1 flex min-w-0 items-center justify-between gap-2">
            <span className="truncate text-lg font-semibold text-gray-900 dark:text-white/90">
              {value}
            </span>
            <span
              className={`inline-flex min-w-0 shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${accentClasses.chip}`}
            >
              <span className="truncate">{meta}</span>
            </span>
          </div>
        </div>
      </div>
      <p className="sr-only">{detail}</p>
    </div>
  );
}

function SalesAIHint({
  eventCount,
  nextStep,
}: {
  eventCount: number;
  nextStep: string | null;
}) {
  return (
    <div className="rounded-lg border border-purple-100 bg-purple-50/70 px-3 py-2 dark:border-purple-900/40 dark:bg-purple-500/10">
      <div className="flex items-center justify-between gap-3">
        <AILabel label="Sales AI" />
        <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">
          {eventCount} events
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-sm leading-5 text-gray-700 dark:text-gray-300">
        {salesAiAction(nextStep)}
      </p>
    </div>
  );
}

function SalesHelpCue({ content }: { content: string }) {
  return (
    <span
      aria-label={content}
      title={content}
      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 text-[11px] font-semibold text-gray-500 dark:border-gray-700 dark:text-gray-400"
    >
      ?
    </span>
  );
}

function contains(term: string) {
  return { contains: term, mode: "insensitive" as const };
}

function combineSalesOpportunityWhere(
  ...filters: Array<Prisma.SalesOpportunityWhereInput | undefined>
): Prisma.SalesOpportunityWhereInput | undefined {
  const activeFilters = filters.filter(
    (filter) => filter && Object.keys(filter).length > 0,
  ) as Prisma.SalesOpportunityWhereInput[];

  if (!activeFilters.length) return undefined;
  if (activeFilters.length === 1) return activeFilters[0];

  return { AND: activeFilters };
}

function excludeOpportunityIdsWhere(
  ids: string[],
): Prisma.SalesOpportunityWhereInput | undefined {
  return ids.length ? { id: { notIn: ids } } : undefined;
}

function salesSearchWhere(
  query: string,
): Prisma.SalesOpportunityWhereInput | undefined {
  const terms = query
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);

  if (!terms.length) {
    return undefined;
  }

  return {
    AND: terms.map((term) => {
      const normalizedTerm = term.toLowerCase();
      const matchingStages = stageLabels.filter(
        (stage) =>
          stage.toLowerCase().includes(normalizedTerm) ||
          formatStage(stage).toLowerCase().includes(normalizedTerm),
      ) as SalesStage[];
      const matchingCustomerCategories = customerSalesCategoryOptions
        .filter(
          (option) =>
            option.value.toLowerCase().includes(normalizedTerm) ||
            option.label.toLowerCase().includes(normalizedTerm) ||
            option.pluralLabel.toLowerCase().includes(normalizedTerm),
        )
        .map((option) => option.value as CustomerSalesCategory);
      const or: Prisma.SalesOpportunityWhereInput[] = [
        { title: contains(term) },
        { source: contains(term) },
        { nextStep: contains(term) },
        { company: { name: contains(term) } },
        { contact: { firstName: contains(term) } },
        { contact: { lastName: contains(term) } },
        { contact: { email: contains(term) } },
        { contact: { phone: contains(term) } },
        { owner: { name: contains(term) } },
        { owner: { email: contains(term) } },
        { salesPipelineStage: { name: contains(term) } },
      ];

      if (matchingStages.length) {
        or.push({ stage: { in: matchingStages } });
      }
      if (matchingCustomerCategories.length) {
        or.push({
          customerSalesCategory: { in: matchingCustomerCategories },
        });
      }

      return { OR: or };
    }),
  };
}

function salesWhere({
  activeCustomerCategory,
  activeOwner,
  activeStage,
  pipelineStageById,
  pipelineStageIds,
  query,
}: {
  activeCustomerCategory: CustomerSalesCategoryValue | "all";
  activeOwner: string;
  activeStage: string;
  pipelineStageById: Map<string, { bucket: SalesStageValue }>;
  pipelineStageIds: Set<string>;
  query: string;
}): Prisma.SalesOpportunityWhereInput | undefined {
  const filters: Prisma.SalesOpportunityWhereInput[] = [];

  if (
    activeCustomerCategory !== "all" &&
    isCustomerSalesCategoryValue(activeCustomerCategory)
  ) {
    filters.push({ customerSalesCategory: activeCustomerCategory });
  }

  if (activeStage === "open") {
    filters.push({
      OR: [
        { stage: { in: openStages as SalesStage[] } },
        { salesPipelineStage: { bucket: { in: openStages as SalesStage[] } } },
      ],
    });
  } else if (activeStage !== "all") {
    if (pipelineStageIds.has(activeStage)) {
      const pipelineStage = pipelineStageById.get(activeStage);
      filters.push({
        OR: [
          { salesPipelineStageId: activeStage },
          ...(pipelineStage
            ? [
                {
                  salesPipelineStageId: null,
                  stage: pipelineStage.bucket as SalesStage,
                },
              ]
            : []),
        ],
      });
    } else if (stageLabels.includes(activeStage as SalesStageValue)) {
      filters.push({ stage: activeStage as SalesStage });
    }
  }

  if (activeOwner === "unassigned") {
    filters.push({ ownerId: null });
  } else if (activeOwner !== "all") {
    filters.push({ ownerId: activeOwner });
  }

  const searchWhere = salesSearchWhere(query);
  if (searchWhere) {
    filters.push(searchWhere);
  }

  return filters.length ? { AND: filters } : undefined;
}

function salesOrderBy(
  sort: string,
): Prisma.SalesOpportunityOrderByWithRelationInput[] {
  if (sort === "updated-desc") {
    return [{ updatedAt: "desc" }, { createdAt: "desc" }];
  }

  if (sort === "value-desc") {
    return [
      { valueCents: "desc" },
      { expectedCloseDate: { sort: "asc", nulls: "last" } },
      { updatedAt: "desc" },
    ];
  }

  if (sort === "stage-asc") {
    return [
      { salesPipelineStage: { sortOrder: "asc" } },
      { stage: "asc" },
      { expectedCloseDate: { sort: "asc", nulls: "last" } },
      { updatedAt: "desc" },
    ];
  }

  if (sort === "close-asc") {
    return [
      { expectedCloseDate: { sort: "asc", nulls: "last" } },
      { updatedAt: "desc" },
    ];
  }

  return [{ createdAt: "desc" }, { updatedAt: "desc" }];
}

export default async function SalesPage({ searchParams }: SalesPageProps) {
  const [currentUser, settings] = await Promise.all([
    requireUser(),
    getCrmSettings(),
  ]);
  const params = (await searchParams) ?? {};
  const interfaceDefaults = parseInterfaceDefaults(settings.interfaceDefaults);
  const queryInput = (singleParam(params.q) ?? "").trim();
  const activeSort = parseSalesSort(params.sort);
  const activeView = parseSalesPipelineView(params.view);
  const activeCustomerCategory = parseCustomerCategoryFilter(
    params.customerCategory,
  );
  const ownerFilterInput = singleParam(params.owner) ?? "all";
  const requestedPage = parsePositiveInteger(params.page, 1);
  const pageSize = parsePageSize({
    fallback: resolveInterfacePageSizeFallback(
      interfaceDefaults,
      salesPageSizes,
      defaultSalesPageSize,
    ),
    options: salesPageSizes,
    value: params.pageSize,
  });
  const pipedriveDealOpportunityLinks =
    await prisma.externalRecordLink.findMany({
      where: {
        externalType: pipedriveDealExternalType,
        internalType: salesOpportunityExternalType,
        provider: pipedriveProvider,
      },
      select: { internalId: true },
    });
  const pipedriveDealOpportunityIds = Array.from(
    new Set(
      pipedriveDealOpportunityLinks
        .map((link) => link.internalId.trim())
        .filter(Boolean),
    ),
  );
  const pipedriveDealExclusionWhere = excludeOpportunityIdsWhere(
    pipedriveDealOpportunityIds,
  );
  const visibleOpportunityWhere = (where?: Prisma.SalesOpportunityWhereInput) =>
    salesOpportunityWhereWithAccess(
      currentUser,
      combineSalesOpportunityWhere(pipedriveDealExclusionWhere, where),
    );
  const visibleAccessWhere = visibleOpportunityWhere();
  const communicationAccessWhere: Prisma.SalesCommunicationWhereInput =
    pipedriveDealExclusionWhere || currentUser.role !== "ADMIN"
      ? { opportunity: visibleAccessWhere }
      : {};
  const [
    activeUsers,
    pipelineStages,
    allOpportunityCount,
    customerCategoryRows,
    unassignedOpportunityCount,
    unlinkedStageRows,
    pipelineStageRows,
    openOpportunityValueRows,
    wonAggregate,
    totalCommunications,
    currencySample,
  ] = await Promise.all([
    prisma.user.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.salesPipelineStage.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        bucket: true,
        customerSalesCategory: true,
        color: true,
        sortOrder: true,
        isActive: true,
      },
    }),
    prisma.salesOpportunity.count({
      where: visibleAccessWhere,
    }),
    prisma.salesOpportunity.groupBy({
      by: ["customerSalesCategory"],
      where: visibleAccessWhere,
      _count: { _all: true },
    }),
    prisma.salesOpportunity.count({
      where: visibleOpportunityWhere({ ownerId: null }),
    }),
    prisma.salesOpportunity.groupBy({
      by: ["stage"],
      where: visibleOpportunityWhere({
        salesPipelineStageId: null,
      }),
      _count: { _all: true },
    }),
    prisma.salesOpportunity.groupBy({
      by: ["salesPipelineStageId"],
      where: visibleAccessWhere,
      _count: { _all: true },
    }),
    prisma.salesOpportunity.groupBy({
      by: ["currency", "probability"],
      where: visibleOpportunityWhere({
        stage: { in: openStages as SalesStage[] },
      }),
      _count: { _all: true },
      _sum: { valueCents: true },
    }),
    prisma.salesOpportunity.aggregate({
      where: visibleOpportunityWhere({ stage: "WON" }),
      _count: { _all: true },
      _sum: { valueCents: true },
    }),
    prisma.salesCommunication.count({ where: communicationAccessWhere }),
    prisma.salesOpportunity.findFirst({
      where: visibleAccessWhere,
      orderBy: { createdAt: "desc" },
      select: { currency: true },
    }),
  ]);
  const workspaceDefaults = parseWorkspaceDefaults(settings.workspaceDefaults);
  const displayDefaults = parseDisplayDefaults(settings.displayDefaults);
  const displayFormatting = { displayDefaults, workspaceDefaults };
  const salesDefaults = parseSalesDefaults(settings.salesDefaults);
  const salesKanbanSettings = parseSalesKanbanSettings(settings.salesKanban);
  const kanbanCardFieldSet = new Set(salesKanbanSettings.cardFields);
  const pipelineStageIds = new Set(pipelineStages.map((stage) => stage.id));
  const pipelineStageById = new Map(
    pipelineStages.map((stage) => [stage.id, stage]),
  );
  const pipelineStageCountById = new Map(
    pipelineStageRows
      .filter((row) => row.salesPipelineStageId)
      .map((row) => [row.salesPipelineStageId as string, row._count._all]),
  );
  const defaultPipelineStageByBucket = new Map<
    SalesStageValue,
    PipelineStageOption
  >();
  const activePipelineStageOptions: PipelineStageOption[] = pipelineStages
    .filter((stage) => stage.isActive)
    .map((stage) => ({
      bucket: stage.bucket,
      customerSalesCategory: stage.customerSalesCategory,
      color: stage.color,
      label: stage.name,
      sortOrder: stage.sortOrder,
      value: stage.id,
    }));

  activePipelineStageOptions.forEach((stage) => {
    if (!defaultPipelineStageByBucket.has(stage.bucket)) {
      defaultPipelineStageByBucket.set(stage.bucket, stage);
    }
  });

  const stageCountByValue = new Map<string, number>(pipelineStageCountById);
  unlinkedStageRows.forEach((row) => {
    const fallbackStage = defaultPipelineStageByBucket.get(
      row.stage as SalesStageValue,
    );
    const stageValue = fallbackStage?.value ?? row.stage;
    stageCountByValue.set(
      stageValue,
      (stageCountByValue.get(stageValue) ?? 0) + row._count._all,
    );
  });
  const stageValuesWithSales = new Set(stageCountByValue.keys());
  const customerCategoryCountByValue = new Map(
    customerCategoryRows.map((row) => [
      row.customerSalesCategory,
      row._count._all,
    ]),
  );
  const customerCategoryFilterOptions = [
    { label: "All customer statuses", value: "all", color: null },
    ...customerSalesCategoryOptions.map((option) => ({
      color: option.color,
      label: option.pluralLabel,
      value: option.value,
    })),
  ];
  const customerCategoryCounts = customerSalesCategoryOptions.map((option) => ({
    category: option.value,
    count: customerCategoryCountByValue.get(option.value) ?? 0,
  }));
  const opportunityStageView = (opportunity: {
    salesPipelineStage: { color: string | null; name: string } | null;
    stage: string;
  }) => {
    const fallbackStage = defaultPipelineStageByBucket.get(
      opportunity.stage as SalesStageValue,
    );
    const label =
      opportunity.salesPipelineStage?.name ??
      fallbackStage?.label ??
      formatStage(opportunity.stage);
    const color =
      opportunity.salesPipelineStage?.color ??
      fallbackStage?.color ??
      fallbackStageColors[opportunity.stage] ??
      "#98A2B3";

    return { color, label };
  };
  const pipelineStageFilterOptions = pipelineStages
    .filter((stage) => stage.isActive || stageValuesWithSales.has(stage.id))
    .map((stage) => ({
      color: stage.color,
      label: stage.name,
      value: stage.id,
    }));
  const legacyStageFilterOptions = stageLabels
    .filter((stage) => stageValuesWithSales.has(stage))
    .map((stage) => ({ label: formatStage(stage), value: stage }));
  const salesStageFilters = [
    { label: "All stages", value: "all" },
    { label: "Open pipeline", value: "open" },
    ...pipelineStageFilterOptions,
    ...legacyStageFilterOptions,
  ];
  const openStageFilterValues = [
    ...activePipelineStageOptions
      .filter((stage) => openStages.includes(stage.bucket))
      .map((stage) => stage.value),
    ...openStages,
  ];
  const activeStage = parseStageFilter(params.stage, salesStageFilters);
  const assignableActiveUsers = saleOwnerOptionsForUser(
    activeUsers,
    currentUser,
  );
  const visibleOwnerUsers =
    currentUser.role === "ADMIN" ? activeUsers : assignableActiveUsers;
  const saleOwnerOptions = assignableActiveUsers.map((user) => ({
    label: user.name,
    value: user.id,
  }));
  const ownerOptions = [
    { label: "All owners", value: "all" },
    ...visibleOwnerUsers.map((user) => ({
      label: user.name,
      value: user.id,
    })),
    ...(unassignedOpportunityCount > 0
      ? [{ label: "Unassigned", value: "unassigned" }]
      : []),
  ];
  const activeOwner = ownerOptions.some(
    (option) => option.value === ownerFilterInput,
  )
    ? ownerFilterInput
    : "all";
  const activeSalesWhere = salesWhere({
    activeCustomerCategory,
    activeOwner,
    activeStage,
    pipelineStageById,
    pipelineStageIds,
    query: queryInput,
  });
  const opportunityWhere = salesOpportunityWhereWithAccess(
    currentUser,
    combineSalesOpportunityWhere(pipedriveDealExclusionWhere, activeSalesWhere),
  );
  const filteredOpportunityCount = activeSalesWhere
    ? await prisma.salesOpportunity.count({ where: opportunityWhere })
    : allOpportunityCount;
  const totalPages = Math.max(
    1,
    Math.ceil(filteredOpportunityCount / pageSize),
  );
  const currentPage = Math.min(requestedPage, totalPages);
  const opportunities = await prisma.salesOpportunity.findMany({
    where: opportunityWhere,
    orderBy: salesOrderBy(activeSort),
    skip: activeView === "kanban" ? 0 : (currentPage - 1) * pageSize,
    take: activeView === "kanban" ? kanbanOpportunityLimit : pageSize,
    include: {
      company: {
        select: {
          id: true,
          name: true,
        },
      },
      contact: {
        select: {
          firstName: true,
          id: true,
          lastName: true,
        },
      },
      owner: true,
      salesPipelineStage: {
        select: {
          id: true,
          name: true,
          bucket: true,
          customerSalesCategory: true,
          color: true,
          sortOrder: true,
          isActive: true,
        },
      },
      communications: {
        orderBy: { occurredAt: "asc" },
        take: 6,
        select: { id: true, channel: true, occurredAt: true },
      },
      products: {
        where: { status: { not: "DECLINED" } },
        orderBy: { createdAt: "asc" },
        take: 4,
        select: {
          product: { select: { name: true } },
        },
      },
      _count: { select: { communications: true } },
    },
  });
  const needsKanbanTasks =
    activeView === "kanban" &&
    (hasKanbanField(kanbanCardFieldSet, "nextScheduledActivity") ||
      hasKanbanField(kanbanCardFieldSet, "outstandingTasks"));
  const linkedContactIds = Array.from(
    new Set(
      opportunities.map((opportunity) => opportunity.contactId).filter(Boolean),
    ),
  ) as string[];
  const linkedCompanyIds = Array.from(
    new Set(
      opportunities.map((opportunity) => opportunity.companyId).filter(Boolean),
    ),
  ) as string[];
  const linkedTaskWhere: Prisma.TaskWhereInput[] = [];
  if (linkedContactIds.length) {
    linkedTaskWhere.push({ contactId: { in: linkedContactIds } });
  }
  if (linkedCompanyIds.length) {
    linkedTaskWhere.push({ companyId: { in: linkedCompanyIds } });
  }
  const linkedOpenTasks =
    needsKanbanTasks && (linkedContactIds.length || linkedCompanyIds.length)
      ? await prisma.task.findMany({
          where: {
            status: { in: [...openKanbanTaskStatuses] },
            OR: linkedTaskWhere,
          },
          orderBy: [
            { dueDate: { sort: "asc", nulls: "last" } },
            { updatedAt: "desc" },
          ],
          take: 300,
          select: {
            companyId: true,
            contactId: true,
            dueDate: true,
            id: true,
            title: true,
          },
        })
      : [];
  const openTasksByContactId = new Map<string, typeof linkedOpenTasks>();
  const openTasksByCompanyId = new Map<string, typeof linkedOpenTasks>();

  linkedOpenTasks.forEach((task) => {
    if (task.contactId) {
      openTasksByContactId.set(task.contactId, [
        ...(openTasksByContactId.get(task.contactId) ?? []),
        task,
      ]);
    }
    if (task.companyId) {
      openTasksByCompanyId.set(task.companyId, [
        ...(openTasksByCompanyId.get(task.companyId) ?? []),
        task,
      ]);
    }
  });
  const openTasksForOpportunity = (
    opportunity: (typeof opportunities)[number],
  ) => {
    const tasks = [
      ...(opportunity.contactId
        ? (openTasksByContactId.get(opportunity.contactId) ?? [])
        : []),
      ...(opportunity.companyId
        ? (openTasksByCompanyId.get(opportunity.companyId) ?? [])
        : []),
    ];
    const seen = new Set<string>();

    return tasks.filter((task) => {
      if (seen.has(task.id)) return false;
      seen.add(task.id);
      return true;
    });
  };
  const filteredOpportunities = opportunities;
  const currency =
    currencySample?.currency ??
    openOpportunityValueRows[0]?.currency ??
    workspaceDefaults.currency;
  const openOpportunityCount = openOpportunityValueRows.reduce(
    (total, row) => total + row._count._all,
    0,
  );
  const openPipelineValue = openOpportunityValueRows.reduce(
    (total, row) => total + (row._sum.valueCents ?? 0),
    0,
  );
  const weightedPipelineValue = openOpportunityValueRows.reduce(
    (total, opportunity) =>
      total +
      Math.round(
        (opportunity._sum.valueCents ?? 0) * (opportunity.probability / 100),
      ),
    0,
  );
  const wonValue = wonAggregate._sum.valueCents ?? 0;
  const wonCount = wonAggregate._count._all;
  const weightedCoverage = openPipelineValue
    ? Math.round((weightedPipelineValue / openPipelineValue) * 100)
    : 0;
  const communicationAverage = allOpportunityCount
    ? Math.round(totalCommunications / allOpportunityCount)
    : 0;
  const stageCounts = salesStageFilters
    .filter((option) => option.value !== "all" && option.value !== "open")
    .map((option) => ({
      stage: option.value,
      count: stageCountByValue.get(option.value) ?? 0,
    }));
  const paginationParams = {
    customerCategory:
      activeCustomerCategory === "all" ? null : activeCustomerCategory,
    owner: activeOwner === "all" ? null : activeOwner,
    q: queryInput || null,
    sort: activeSort === DEFAULT_SALES_SORT ? null : activeSort,
    stage: activeStage === "all" ? null : activeStage,
  };
  const tableViewHref = salesHref({
    customerCategory: activeCustomerCategory,
    owner: activeOwner,
    query: queryInput,
    sort: activeSort,
    stage: activeStage,
    view: "table",
  });
  const kanbanViewHref = salesHref({
    customerCategory: activeCustomerCategory,
    owner: activeOwner,
    query: queryInput,
    sort: activeSort,
    stage: activeStage,
    view: "kanban",
  });
  const resetHref = activeView === "kanban" ? "/sales?view=kanban" : "/sales";
  const refreshHref = activeView === "kanban" ? kanbanViewHref : tableViewHref;
  const opportunityStageValue = (opportunity: {
    salesPipelineStageId: string | null;
    stage: string;
  }) =>
    opportunity.salesPipelineStageId ??
    defaultPipelineStageByBucket.get(opportunity.stage as SalesStageValue)
      ?.value ??
    opportunity.stage;
  const kanbanColumnColor = (value: string) =>
    pipelineStageById.get(value)?.color ??
    defaultPipelineStageByBucket.get(value as SalesStageValue)?.color ??
    fallbackStageColors[value] ??
    "#98A2B3";
  const kanbanVisibleStageValues = new Set(
    activeStage === "all"
      ? salesStageFilters
          .filter((option) => option.value !== "all" && option.value !== "open")
          .map((option) => option.value)
      : activeStage === "open"
        ? openStageFilterValues
        : [activeStage],
  );
  const kanbanColumns = salesStageFilters
    .filter((option) => option.value !== "all" && option.value !== "open")
    .filter((option) => kanbanVisibleStageValues.has(option.value))
    .map((option) => {
      const stageOpportunities = filteredOpportunities.filter(
        (opportunity) => opportunityStageValue(opportunity) === option.value,
      );

      return {
        ...option,
        color: kanbanColumnColor(option.value),
        opportunities: stageOpportunities,
        totalValueCents: stageOpportunities.reduce(
          (total, opportunity) => total + opportunity.valueCents,
          0,
        ),
      };
    });

  return (
    <>
      <PageHeader
        title="Sales Pipeline"
        description="Track customer status separately from the granular sales stages used to work each record."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/marketing/visitors"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
            >
              Review captured enquiries
            </Link>
            <DeferredAddSaleModal
              owners={saleOwnerOptions}
              defaultOwnerId={
                currentUser.role === "ADMIN"
                  ? resolveSalesDefaultOwnerId({
                      fallbackUserId: currentUser.id,
                      salesDefaults,
                    })
                  : currentUser.id
              }
              defaultStageId={salesDefaults.defaultSalesPipelineStageId}
              stages={activePipelineStageOptions}
            />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
        <SalesStatCard
          accent="brand"
          icon={<DollarLineIcon />}
          label="Open pipeline"
          value={formatMoney(openPipelineValue, currency, displayFormatting)}
          meta={`${openOpportunityCount} active`}
          detail="Active value"
        />
        <SalesStatCard
          accent="purple"
          icon={<PieChartIcon />}
          label="Weighted pipeline"
          value={formatMoney(
            weightedPipelineValue,
            currency,
            displayFormatting,
          )}
          meta={`${weightedCoverage}% weighted`}
          detail="Probability adjusted"
        />
        <SalesStatCard
          accent="success"
          icon={<CheckCircleIcon />}
          label="Project revenue"
          value={formatMoney(wonValue, currency, displayFormatting)}
          meta={`${wonCount} project${wonCount === 1 ? "" : "s"}`}
          detail="Closed value"
        />
        <SalesStatCard
          accent="slate"
          icon={<ChatIcon />}
          label="Communications"
          value={totalCommunications.toString()}
          meta={`${communicationAverage} avg`}
          detail="Events per sale"
        />
      </div>

      <div className="mt-4">
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-2 border-b border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                  Sales records
                </h2>
                <SalesHelpCue content="Shows each sales record with customer status, stage, value, lead source touchpoints, attribution quality, AI next step, owner and linked activity count." />
              </div>
              <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                {filteredOpportunityCount} of {allOpportunityCount} matching
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SalesViewSwitch
                activeView={activeView}
                kanbanHref={kanbanViewHref}
                tableHref={tableViewHref}
              />
              <Link
                href={refreshHref}
                className="inline-flex h-8 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-white/[0.05]"
              >
                Refresh
              </Link>
            </div>
          </div>
          {allOpportunityCount ? (
            <div className="grid xl:grid-cols-[250px_minmax(0,1fr)]">
              <LazySalesPipelineFilters
                customerCategoryCounts={customerCategoryCounts}
                customerCategoryOptions={customerCategoryFilterOptions}
                ownerOptions={ownerOptions}
                query={queryInput}
                selectedCustomerCategory={activeCustomerCategory}
                selectedOwner={activeOwner}
                selectedSort={activeSort}
                selectedStage={activeStage}
                resetHref={resetHref}
                defaultSortValue={DEFAULT_SALES_SORT}
                openStageValues={openStageFilterValues}
                sortOptions={salesSortOptions}
                stageCounts={stageCounts}
                stageOptions={salesStageFilters}
                variant="rail"
              />
              <div className="min-w-0">
                {filteredOpportunities.length ? (
                  <>
                    {activeView === "kanban" ? (
                      <div>
                        {filteredOpportunityCount > kanbanOpportunityLimit ? (
                          <div className="border-b border-warning-200 bg-warning-50 px-4 py-2 text-xs font-medium text-warning-800 dark:border-warning-900/40 dark:bg-warning-900/20 dark:text-warning-200">
                            Showing the first {kanbanOpportunityLimit} matching
                            opportunities. Narrow the filters to review the rest
                            on the board.
                          </div>
                        ) : null}
                        <SalesKanbanDragBoard>
                          <div className="max-w-full min-w-0 md:overflow-x-auto md:overscroll-x-contain">
                            <div className="grid min-w-0 gap-3 p-4 md:flex md:min-w-full">
                              {kanbanColumns.map((column) => (
                                <section
                                  key={column.value}
                                  data-kanban-column-stage-id={column.value}
                                  aria-label={`${column.label} stage`}
                                  className="flex max-h-[760px] min-w-0 flex-col rounded-xl border border-gray-200 bg-gray-50 transition data-[kanban-drop-active=true]:border-brand-300 data-[kanban-drop-active=true]:bg-brand-50/40 md:w-[292px] md:shrink-0 dark:border-gray-800 dark:bg-white/[0.02] dark:data-[kanban-drop-active=true]:border-brand-700/70 dark:data-[kanban-drop-active=true]:bg-brand-500/10"
                                >
                                  <div
                                    className="h-1 rounded-t-xl"
                                    style={{
                                      backgroundColor:
                                        column.color ??
                                        fallbackStageColors[column.value] ??
                                        "#98A2B3",
                                    }}
                                  />
                                  <div className="border-b border-gray-200 px-3 py-3 dark:border-gray-800">
                                    <div className="flex items-center justify-between gap-3">
                                      <h3 className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
                                        {column.label}
                                      </h3>
                                      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-gray-600 ring-1 ring-gray-200 dark:bg-gray-950 dark:text-gray-300 dark:ring-gray-800">
                                        {column.opportunities.length}
                                      </span>
                                    </div>
                                    <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                                      {formatMoney(
                                        column.totalValueCents,
                                        currency,
                                        displayFormatting,
                                      )}
                                    </p>
                                  </div>
                                  <div className="min-h-[220px] flex-1 space-y-3 overflow-y-auto p-3">
                                    {column.opportunities.length ? (
                                      column.opportunities.map(
                                        (opportunity) => {
                                          const customerName = contactName(
                                            opportunity.contact,
                                          );
                                          const linkedName = [
                                            customerName,
                                            opportunity.company?.name,
                                          ]
                                            .filter(Boolean)
                                            .join(" · ");
                                          const latestCommunication =
                                            opportunity.communications[
                                              opportunity.communications
                                                .length - 1
                                            ];
                                          const sourceJourney =
                                            buildSourceJourney(opportunity);
                                          const confidence =
                                            attributionHealth(opportunity);
                                          const openTasks =
                                            openTasksForOpportunity(
                                              opportunity,
                                            );
                                          const nextTask = openTasks[0] ?? null;
                                          const productNames =
                                            opportunity.products
                                              .map((item) => item.product.name)
                                              .filter(Boolean);
                                          const nextActivity = nextTask
                                            ? `${nextTask.title}${
                                                nextTask.dueDate
                                                  ? ` · ${formatDate(
                                                      nextTask.dueDate,
                                                      displayFormatting,
                                                    )}`
                                                  : ""
                                              }`
                                            : opportunity.nextStep;
                                          const showSalesperson =
                                            hasKanbanField(
                                              kanbanCardFieldSet,
                                              "salesperson",
                                            );

                                          return (
                                            <Link
                                              key={opportunity.id}
                                              href={`/sales/${opportunity.id}`}
                                              draggable
                                              data-kanban-card-id={
                                                opportunity.id
                                              }
                                              data-kanban-card-stage-id={
                                                column.value
                                              }
                                              className="block cursor-grab rounded-lg border border-gray-200 bg-white p-3 shadow-theme-xs transition hover:border-brand-200 hover:shadow-theme-sm active:cursor-grabbing data-[kanban-card-dragging=true]:opacity-50 dark:border-gray-800 dark:bg-gray-950 dark:hover:border-brand-900/60"
                                            >
                                              <div className="min-w-0">
                                                <h4 className="line-clamp-2 text-sm leading-5 font-semibold text-gray-800 dark:text-white/90">
                                                  {opportunity.title}
                                                </h4>
                                                {hasKanbanField(
                                                  kanbanCardFieldSet,
                                                  "customerName",
                                                ) && linkedName ? (
                                                  <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                                                    {linkedName}
                                                  </p>
                                                ) : null}
                                              </div>
                                              {hasKanbanField(
                                                kanbanCardFieldSet,
                                                "dealValue",
                                              ) ? (
                                                <div className="mt-3 flex items-center justify-between gap-3">
                                                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                                                    {formatMoney(
                                                      opportunity.valueCents,
                                                      opportunity.currency,
                                                      displayFormatting,
                                                    )}
                                                  </span>
                                                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                                                    {opportunity.probability}%
                                                  </span>
                                                </div>
                                              ) : null}
                                              {hasKanbanField(
                                                kanbanCardFieldSet,
                                                "leadSource",
                                              ) ? (
                                                <>
                                                  <div className="mt-3">
                                                    <SalesSourceJourney
                                                      items={sourceJourney}
                                                      compact
                                                      variant="table"
                                                    />
                                                  </div>
                                                  <div className="mt-3 flex flex-wrap items-center gap-2">
                                                    <span
                                                      title={
                                                        confidence.clientSummary
                                                      }
                                                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${attributionHealthClasses(
                                                        confidence.level,
                                                      )}`}
                                                    >
                                                      {confidence.level}
                                                    </span>
                                                    <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                                                      {
                                                        opportunity._count
                                                          .communications
                                                      }{" "}
                                                      events
                                                    </span>
                                                  </div>
                                                </>
                                              ) : null}
                                              <div className="mt-3 space-y-2">
                                                {hasKanbanField(
                                                  kanbanCardFieldSet,
                                                  "productsQuoted",
                                                ) ? (
                                                  <KanbanFact label="Products">
                                                    {productNames.length
                                                      ? productNames.join(", ")
                                                      : "Not assigned"}
                                                  </KanbanFact>
                                                ) : null}
                                                {hasKanbanField(
                                                  kanbanCardFieldSet,
                                                  "nextScheduledActivity",
                                                ) && nextActivity ? (
                                                  <KanbanFact
                                                    label={
                                                      nextTask
                                                        ? "Next task"
                                                        : "Next step"
                                                    }
                                                  >
                                                    {nextActivity}
                                                  </KanbanFact>
                                                ) : null}
                                                {hasKanbanField(
                                                  kanbanCardFieldSet,
                                                  "estimatedCloseDate",
                                                ) ? (
                                                  <KanbanFact label="Close date">
                                                    {opportunity.expectedCloseDate
                                                      ? formatDate(
                                                          opportunity.expectedCloseDate,
                                                          displayFormatting,
                                                        )
                                                      : "Not set"}
                                                  </KanbanFact>
                                                ) : null}
                                                {hasKanbanField(
                                                  kanbanCardFieldSet,
                                                  "servicePlanStatus",
                                                ) ? (
                                                  <KanbanFact label="Service plan">
                                                    {servicePlanStatusLabel(
                                                      opportunity.leadScope,
                                                    )}
                                                  </KanbanFact>
                                                ) : null}
                                                {hasKanbanField(
                                                  kanbanCardFieldSet,
                                                  "outstandingTasks",
                                                ) ? (
                                                  <KanbanFact label="Open tasks">
                                                    {openTasks.length}
                                                  </KanbanFact>
                                                ) : null}
                                              </div>
                                              <div
                                                className={`mt-3 flex items-center gap-3 border-t border-gray-100 pt-3 dark:border-gray-800 ${
                                                  showSalesperson
                                                    ? "justify-between"
                                                    : "justify-end"
                                                }`}
                                              >
                                                {showSalesperson ? (
                                                  <OwnerBadge
                                                    name={
                                                      opportunity.owner?.name ??
                                                      null
                                                    }
                                                  />
                                                ) : null}
                                                <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">
                                                  {latestCommunication
                                                    ? formatDate(
                                                        latestCommunication.occurredAt,
                                                        displayFormatting,
                                                      )
                                                    : formatDate(
                                                        opportunity.updatedAt,
                                                        displayFormatting,
                                                      )}
                                                </span>
                                              </div>
                                            </Link>
                                          );
                                        },
                                      )
                                    ) : (
                                      <div className="rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center text-xs font-medium text-gray-400 dark:border-gray-800">
                                        No opportunities
                                      </div>
                                    )}
                                  </div>
                                </section>
                              ))}
                            </div>
                          </div>
                        </SalesKanbanDragBoard>
                      </div>
                    ) : (
                      <>
                        <div className="hidden xl:block">
                          <LazySalesTableFrame
                            key={`${currentPage}:${pageSize}:${activeCustomerCategory}:${activeStage}:${activeOwner}:${activeSort}:${queryInput}`}
                            canDeleteSales={currentUser.role === "ADMIN"}
                            ownerOptions={saleOwnerOptions}
                            page={currentPage}
                            pageSize={pageSize}
                            stageOptions={activePipelineStageOptions}
                            totalCount={filteredOpportunityCount}
                          >
                            <div className="overflow-x-auto">
                              <table className="min-w-[1300px] divide-y divide-gray-100 dark:divide-gray-800">
                                <thead className="bg-gray-50/80 dark:bg-white/[0.02]">
                                  <tr>
                                    <th
                                      scope="col"
                                      className="w-10 border-l-[3px] border-l-transparent px-3 py-2 text-left"
                                    >
                                      <input
                                        type="checkbox"
                                        data-sales-select-all
                                        aria-label="Select all visible sales"
                                        className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-950"
                                      />
                                    </th>
                                    {[
                                      "Lead",
                                      "Customer status",
                                      "Lead sources",
                                      "Attribution",
                                      "Stage",
                                      "AI next step",
                                      "Owner",
                                      "Last contact",
                                      "Value",
                                    ].map((heading) => (
                                      <th
                                        key={heading}
                                        scope="col"
                                        className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase dark:text-gray-400"
                                      >
                                        {heading}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                  {filteredOpportunities.map((opportunity) => {
                                    const customerName = contactName(
                                      opportunity.contact,
                                    );
                                    const linkedName = [
                                      customerName,
                                      opportunity.company?.name,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ");
                                    const latestCommunication =
                                      opportunity.communications[
                                        opportunity.communications.length - 1
                                      ];
                                    const sourceJourney =
                                      buildSourceJourney(opportunity);
                                    const confidence =
                                      attributionHealth(opportunity);
                                    const stageView =
                                      opportunityStageView(opportunity);

                                    return (
                                      <tr
                                        key={opportunity.id}
                                        data-sales-row={opportunity.id}
                                        className="group transition hover:bg-gray-50/80 dark:hover:bg-white/[0.03]"
                                      >
                                        <td
                                          className="w-10 border-l-[3px] px-3 py-2.5"
                                          style={{
                                            borderLeftColor: stageView.color,
                                          }}
                                        >
                                          <input
                                            type="checkbox"
                                            value={opportunity.id}
                                            data-sales-row-checkbox
                                            aria-label={`Select ${opportunity.title}`}
                                            className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-950"
                                          />
                                        </td>
                                        <td className="w-[250px] px-3 py-2.5">
                                          <Link
                                            href={`/sales/${opportunity.id}`}
                                            className="block min-w-0"
                                          >
                                            <span className="block truncate text-sm font-semibold text-gray-800 group-hover:text-brand-600 dark:text-white/90 dark:group-hover:text-brand-300">
                                              {opportunity.title}
                                            </span>
                                            {linkedName ? (
                                              <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                                                {linkedName}
                                              </span>
                                            ) : null}
                                          </Link>
                                        </td>
                                        <td className="w-[130px] px-3 py-2.5">
                                          <CustomerSalesCategoryBadge
                                            category={
                                              opportunity.customerSalesCategory
                                            }
                                          />
                                        </td>
                                        <td className="w-[170px] px-3 py-2.5">
                                          <SalesSourceJourney
                                            items={sourceJourney}
                                            compact
                                            variant="table"
                                          />
                                        </td>
                                        <td className="w-[135px] px-3 py-2.5">
                                          <span
                                            title={confidence.clientSummary}
                                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${attributionHealthClasses(
                                              confidence.level,
                                            )}`}
                                          >
                                            {confidence.level}
                                          </span>
                                          <p className="max-w-[120px] truncate text-[11px] text-gray-500 dark:text-gray-400">
                                            {attributionHealthSummary(
                                              confidence,
                                            )}
                                          </p>
                                        </td>
                                        <td className="w-[110px] px-3 py-2.5">
                                          <SalesPipelineStageBadge
                                            color={stageView.color}
                                            label={stageView.label}
                                          />
                                        </td>
                                        <td className="w-[250px] px-3 py-2.5">
                                          <div className="min-w-0">
                                            <p className="line-clamp-1 text-xs leading-5 font-medium text-gray-700 dark:text-gray-300">
                                              {salesAiAction(
                                                opportunity.nextStep,
                                              )}
                                            </p>
                                            <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                              {
                                                opportunity._count
                                                  .communications
                                              }{" "}
                                              events
                                            </p>
                                          </div>
                                        </td>
                                        <td className="w-[145px] px-3 py-2.5">
                                          <OwnerBadge
                                            name={
                                              opportunity.owner?.name ?? null
                                            }
                                          />
                                        </td>
                                        <td className="w-[100px] px-3 py-2.5 text-xs text-gray-600 dark:text-gray-300">
                                          {latestCommunication
                                            ? formatDate(
                                                latestCommunication.occurredAt,
                                                displayFormatting,
                                              )
                                            : formatDate(
                                                opportunity.updatedAt,
                                                displayFormatting,
                                              )}
                                        </td>
                                        <td className="w-[100px] px-4 py-2.5 text-right text-sm font-semibold text-gray-800 dark:text-white/90">
                                          {formatMoney(
                                            opportunity.valueCents,
                                            opportunity.currency,
                                            displayFormatting,
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </LazySalesTableFrame>
                        </div>

                        <div className="grid gap-4 p-5 xl:hidden">
                          {filteredOpportunities.map((opportunity) => {
                            const customerName = contactName(
                              opportunity.contact,
                            );
                            const linkedName = [
                              customerName,
                              opportunity.company?.name,
                            ]
                              .filter(Boolean)
                              .join(" · ");
                            const latestCommunication =
                              opportunity.communications[
                                opportunity.communications.length - 1
                              ];
                            const sourceJourney =
                              buildSourceJourney(opportunity);
                            const confidence = attributionHealth(opportunity);
                            const stageView = opportunityStageView(opportunity);

                            return (
                              <Link
                                key={opportunity.id}
                                href={`/sales/${opportunity.id}`}
                                className="block rounded-xl border border-l-4 border-gray-200 p-4 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-theme-sm dark:border-gray-800 dark:hover:border-brand-800"
                                style={{ borderLeftColor: stageView.color }}
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div className="min-w-0">
                                    <h2 className="truncate text-base font-semibold text-gray-800 dark:text-white/90">
                                      {opportunity.title}
                                    </h2>
                                    {linkedName && (
                                      <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">
                                        {linkedName}
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex shrink-0 flex-col items-end gap-2">
                                    <CustomerSalesCategoryBadge
                                      category={
                                        opportunity.customerSalesCategory
                                      }
                                    />
                                    <SalesPipelineStageBadge
                                      color={stageView.color}
                                      label={stageView.label}
                                    />
                                  </div>
                                </div>

                                <div className="mt-4">
                                  <SalesSourceJourney
                                    items={sourceJourney}
                                    compact
                                    variant="table"
                                  />
                                </div>

                                <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                                  <div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                      Value
                                    </p>
                                    <p className="mt-1 font-semibold text-gray-800 dark:text-white/90">
                                      {formatMoney(
                                        opportunity.valueCents,
                                        opportunity.currency,
                                        displayFormatting,
                                      )}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                      Chance
                                    </p>
                                    <p className="mt-1 font-semibold text-gray-800 dark:text-white/90">
                                      {opportunity.probability}%
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                      Contact
                                    </p>
                                    <p className="mt-1 font-semibold text-gray-800 dark:text-white/90">
                                      {latestCommunication
                                        ? formatDate(
                                            latestCommunication.occurredAt,
                                            displayFormatting,
                                          )
                                        : formatDate(
                                            opportunity.updatedAt,
                                            displayFormatting,
                                          )}
                                    </p>
                                  </div>
                                </div>

                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                  <span
                                    title={confidence.clientSummary}
                                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${attributionHealthClasses(
                                      confidence.level,
                                    )}`}
                                  >
                                    {confidence.level} attribution
                                  </span>
                                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                    {attributionHealthSummary(confidence)}
                                  </span>
                                </div>

                                <div className="mt-4">
                                  <SalesAIHint
                                    eventCount={
                                      opportunity._count.communications
                                    }
                                    nextStep={opportunity.nextStep}
                                  />
                                  {opportunity.nextStep ? (
                                    <div className="mt-3">
                                      <AIActionButton className="w-full">
                                        Draft follow-up
                                      </AIActionButton>
                                    </div>
                                  ) : null}
                                </div>

                                <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 text-sm dark:border-gray-800">
                                  <OwnerBadge
                                    name={opportunity.owner?.name ?? null}
                                  />
                                  <span className="shrink-0 font-medium text-gray-800 dark:text-white/90">
                                    Close{" "}
                                    {formatDate(
                                      opportunity.expectedCloseDate,
                                      displayFormatting,
                                    )}
                                  </span>
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                        <div className="xl:hidden">
                          <ServerPagination
                            basePath="/sales"
                            page={currentPage}
                            pageSize={pageSize}
                            pageSizeOptions={[...salesPageSizes]}
                            params={paginationParams}
                            totalCount={filteredOpportunityCount}
                          />
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="p-5">
                    <EmptyState
                      title="No opportunities match these filters"
                      description="Adjust the search, stage or sort controls to review a wider part of the pipeline."
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-5">
              <EmptyState
                title="No sales opportunities yet"
                description="Create opportunities to track sales value, stage, probability and next steps."
              />
            </div>
          )}
        </section>
      </div>
    </>
  );
}
