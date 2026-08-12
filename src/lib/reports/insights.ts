import type { ReportColumn, ReportResult } from "@/lib/reports/types";

function columnByField(result: ReportResult, field: string | null | undefined) {
  if (!field) return null;
  return result.columns.find((column) => column.field === field) ?? null;
}

function metricColumns(result: ReportResult) {
  return result.chart.yFields
    .map((field) => columnByField(result, field))
    .filter((column): column is ReportColumn => Boolean(column));
}

function dimensionColumns(result: ReportResult) {
  const metricFields = new Set(result.chart.yFields);
  return result.columns.filter((column) => !metricFields.has(column.field));
}

function formatCell(value: string | number | null | undefined, column?: ReportColumn | null) {
  if (value === null || value === undefined || value === "") return "No value";
  if (typeof value === "number") {
    const formatted = value.toLocaleString("en-GB", {
      maximumFractionDigits: column?.type === "percent" ? 1 : 2,
    });
    return column?.type === "percent" ? `${formatted}%` : formatted;
  }
  return value;
}

function rowLabel(
  row: Record<string, string | number | null>,
  dimensions: ReportColumn[],
) {
  const values = dimensions
    .map((column) => formatCell(row[column.field], column))
    .filter(Boolean);
  return values.length ? values.join(" / ") : "the returned result";
}

function metricPhrase(
  row: Record<string, string | number | null>,
  metric: ReportColumn,
) {
  return `${metric.label} ${formatCell(row[metric.field], metric)}`;
}

function isPeriodComparison(result: ReportResult) {
  const xField = result.chart.xField ?? "";
  return (
    result.chart.type === "line" ||
    result.chart.type === "area" ||
    ["day", "week", "month", "createdDay", "dueDay", "createdMonth"].some(
      (field) => xField.toLowerCase().includes(field.toLowerCase()),
    ) ||
    result.plan.sort?.direction === "asc"
  );
}

export function reportInsightSummary(result: ReportResult) {
  if (!result.rows.length) {
    return result.emptyState
      ? `${result.title}: no data returned. ${result.emptyState}`
      : result.summary;
  }

  const metrics = metricColumns(result);
  const dimensions = dimensionColumns(result);
  const primaryMetric = metrics[0];
  const first = result.rows[0];
  const rowsLabel = `${result.rowCount} row${result.rowCount === 1 ? "" : "s"}`;

  if (!primaryMetric) {
    return `${result.title} returned ${rowsLabel}. The visual report is ready to review.`;
  }

  if (isPeriodComparison(result) && result.rows.length > 1) {
    const last = result.rows[result.rows.length - 1];
    return `${result.title} compares ${primaryMetric.label.toLowerCase()} across ${rowsLabel}. First period: ${rowLabel(
      first,
      dimensions,
    )} with ${formatCell(first[primaryMetric.field], primaryMetric)}. Latest period: ${rowLabel(
      last,
      dimensions,
    )} with ${formatCell(last[primaryMetric.field], primaryMetric)}.`;
  }

  const extras = metrics
    .slice(1, 3)
    .map((metric) => metricPhrase(first, metric))
    .join(", ");
  const extraText = extras ? ` Also showing ${extras}.` : "";

  return `${result.title} returned ${rowsLabel}. Leading result: ${rowLabel(
    first,
    dimensions,
  )} with ${metricPhrase(first, primaryMetric)}.${extraText}`;
}
