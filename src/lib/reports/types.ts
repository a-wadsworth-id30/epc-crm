export type ReportChartType =
  | "table"
  | "bar"
  | "line"
  | "area"
  | "stacked_bar"
  | "donut"
  | "kpi"
  | "funnel";

export type ReportDateRange = {
  preset: "7d" | "30d" | "90d" | "180d" | "365d" | "all" | "custom";
  from?: string | null;
  to?: string | null;
};

export type ReportFilter = {
  field: string;
  operator: "equals" | "not_equals" | "contains" | "in";
  value: string | string[];
};

export type ReportPlan = {
  dataset: string;
  metrics: string[];
  dimensions: string[];
  filters: ReportFilter[];
  dateRange: ReportDateRange;
  chartType: ReportChartType;
  sort?: { field: string; direction: "asc" | "desc" } | null;
  limit?: number | null;
  title?: string | null;
};

export type ReportColumn = {
  field: string;
  label: string;
  type: "currency" | "date" | "number" | "percent" | "text";
};

export type ReportResult = {
  plan: ReportPlan;
  title: string;
  summary: string;
  columns: ReportColumn[];
  rows: Array<Record<string, string | number | null>>;
  chart: {
    type: ReportChartType;
    xField: string | null;
    yFields: string[];
  };
  generatedAt: string;
  rowCount: number;
  emptyState?: string | null;
};

export type ReportDatasetSchema = {
  id: string;
  label: string;
  description: string;
  dateField: string;
  metrics: Array<{ id: string; label: string; type: ReportColumn["type"] }>;
  dimensions: Array<{ id: string; label: string; type: ReportColumn["type"] }>;
  filters: Array<{ id: string; label: string }>;
  defaultPlan: ReportPlan;
};
