import {
  isCustomerSalesCategoryValue,
  type CustomerSalesCategoryValue,
} from "@/lib/sales/customer-sales-category";
import type { SalesStageValue } from "@/lib/sales/lifecycle";

export const openStages: SalesStageValue[] = [
  "LEAD",
  "QUALIFIED",
  "PROPOSAL",
  "NEGOTIATION",
];

export const stageLabels: SalesStageValue[] = [
  "LEAD",
  "QUALIFIED",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
  "LOST",
];

export const fallbackStageColors: Record<string, string> = {
  LEAD: "#EF4444",
  QUALIFIED: "#F97316",
  PROPOSAL: "#0BA5EC",
  NEGOTIATION: "#7A5AF8",
  WON: "#12B76A",
  LOST: "#98A2B3",
};

export const DEFAULT_SALES_SORT = "created-desc";

export const salesSortOptions = [
  { label: "Latest leads", value: DEFAULT_SALES_SORT },
  { label: "Close date", value: "close-asc" },
  { label: "Recently updated", value: "updated-desc" },
  { label: "Highest value", value: "value-desc" },
  { label: "Stage order", value: "stage-asc" },
];

export type SalesSearchParams = {
  customerCategory?: string | string[];
  owner?: string | string[];
  page?: string | string[];
  pageSize?: string | string[];
  q?: string | string[];
  sort?: string | string[];
  stage?: string | string[];
  view?: string | string[];
};

export type SalesPipelineView = "table" | "kanban";

export type PipelineStageOption = {
  bucket: SalesStageValue;
  customerSalesCategory?: CustomerSalesCategoryValue;
  color: string | null;
  label: string;
  sortOrder: number;
  value: string;
};

export function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseStageFilter(
  value: string | string[] | undefined,
  stageOptions: Array<{ value: string }>,
) {
  const stage = singleParam(value);

  return stageOptions.some((option) => option.value === stage)
    ? (stage ?? "all")
    : "all";
}

export function parseCustomerCategoryFilter(
  value: string | string[] | undefined,
) {
  const category = singleParam(value);

  return isCustomerSalesCategoryValue(category) ? category : "all";
}

export function parseSalesSort(value: string | string[] | undefined) {
  const sort = singleParam(value);

  return salesSortOptions.some((option) => option.value === sort)
    ? (sort ?? DEFAULT_SALES_SORT)
    : DEFAULT_SALES_SORT;
}

export function parseSalesPipelineView(
  value: string | string[] | undefined,
): SalesPipelineView {
  return singleParam(value) === "kanban" ? "kanban" : "table";
}

function dateValue(date: Date | null) {
  return date?.getTime() ?? Number.MAX_SAFE_INTEGER;
}

function stageSortFallback(stage: string) {
  return stageLabels.indexOf(stage as SalesStageValue);
}

export function sortOpportunities<
  T extends {
    createdAt: Date;
    expectedCloseDate: Date | null;
    stage: string;
    salesPipelineStageId: string | null;
    updatedAt: Date;
    valueCents: number;
  },
>(
  opportunities: T[],
  sort: string,
  pipelineStageOrderById: Map<string, number>,
) {
  const stageOrder = (opportunity: T) =>
    opportunity.salesPipelineStageId
      ? (pipelineStageOrderById.get(opportunity.salesPipelineStageId) ??
        stageSortFallback(opportunity.stage))
      : stageSortFallback(opportunity.stage);

  return [...opportunities].sort((left, right) => {
    if (sort === DEFAULT_SALES_SORT) {
      return (
        right.createdAt.getTime() - left.createdAt.getTime() ||
        right.updatedAt.getTime() - left.updatedAt.getTime()
      );
    }

    if (sort === "updated-desc") {
      return (
        right.updatedAt.getTime() - left.updatedAt.getTime() ||
        right.createdAt.getTime() - left.createdAt.getTime()
      );
    }

    if (sort === "value-desc") {
      return (
        right.valueCents - left.valueCents ||
        dateValue(left.expectedCloseDate) - dateValue(right.expectedCloseDate)
      );
    }

    if (sort === "stage-asc") {
      return (
        stageOrder(left) - stageOrder(right) ||
        dateValue(left.expectedCloseDate) - dateValue(right.expectedCloseDate)
      );
    }

    return (
      dateValue(left.expectedCloseDate) - dateValue(right.expectedCloseDate) ||
      right.updatedAt.getTime() - left.updatedAt.getTime()
    );
  });
}
