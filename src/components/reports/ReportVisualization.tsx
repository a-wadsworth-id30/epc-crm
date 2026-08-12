"use client";

import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
import type { ReportResult } from "@/lib/reports/types";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

function formatValue(value: string | number | null) {
  if (value === null) return "—";
  if (typeof value === "number") return value.toLocaleString("en-GB");
  return value;
}

function chartOptions(result: ReportResult): ApexOptions {
  const categories = result.rows.map((row) =>
    String(row[result.chart.xField ?? result.columns[0]?.field] ?? "None"),
  );

  return {
    chart: {
      toolbar: { show: false },
      fontFamily: "Outfit, sans-serif",
      stacked: result.chart.type === "stacked_bar",
    },
    colors: ["#465FFF", "#12B76A", "#F79009", "#7A5AF8"],
    dataLabels: { enabled: false },
    grid: { borderColor: "#E4E7EC" },
    labels: categories,
    legend: { show: result.chart.yFields.length > 1 },
    stroke: {
      curve: "smooth",
      width:
        result.chart.type === "bar" || result.chart.type === "stacked_bar"
          ? 0
          : 3,
    },
    xaxis: {
      categories,
      labels: { style: { colors: "#667085", fontSize: "12px" } },
    },
    yaxis: {
      labels: { style: { colors: "#667085", fontSize: "12px" } },
    },
  };
}

function chartSeries(result: ReportResult) {
  if (result.chart.type === "donut") {
    const metric = result.chart.yFields[0];
    return result.rows.map((row) => Number(row[metric] ?? 0));
  }

  return result.chart.yFields.map((field) => ({
    name:
      result.columns.find((column) => column.field === field)?.label ?? field,
    data: result.rows.map((row) => Number(row[field] ?? 0)),
  }));
}

function apexType(result: ReportResult) {
  if (result.chart.type === "donut") return "donut";
  if (result.chart.type === "line") return "line";
  if (result.chart.type === "area") return "area";
  return "bar";
}

export default function ReportVisualization({
  compact = false,
  result,
}: {
  compact?: boolean;
  result: ReportResult;
}) {
  const showChart =
    result.chart.type !== "table" &&
    result.chart.type !== "kpi" &&
    result.rows.length > 0;
  const primaryMetrics = result.chart.yFields.slice(0, 4);
  const emptyState =
    result.emptyState ??
    "No rows matched this report. Check the selected filters and date range.";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {primaryMetrics.map((field) => {
          const total = result.rows.reduce(
            (sum, row) => sum + Number(row[field] ?? 0),
            0,
          );
          return (
            <div
              key={field}
              className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <p className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
                {result.columns.find((column) => column.field === field)
                  ?.label ?? field}
              </p>
              <p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
                {total.toLocaleString("en-GB")}
              </p>
            </div>
          );
        })}
      </div>

      {showChart ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <Chart
            type={apexType(result)}
            height={compact ? 220 : 340}
            options={chartOptions(result)}
            series={chartSeries(result)}
          />
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-white/[0.02]">
            <tr className="text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
              {result.columns.map((column) => (
                <th key={column.field} className="px-4 py-3">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {result.rows.map((row, index) => (
              <tr key={`${index}-${JSON.stringify(row).slice(0, 80)}`}>
                {result.columns.map((column) => (
                  <td
                    key={column.field}
                    className="px-4 py-3 text-gray-700 dark:text-gray-300"
                  >
                    {formatValue(row[column.field])}
                    {column.type === "percent" && row[column.field] !== null
                      ? "%"
                      : ""}
                  </td>
                ))}
              </tr>
            ))}
            {!result.rows.length ? (
              <tr>
                <td
                  className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400"
                  colSpan={result.columns.length || 1}
                >
                  {emptyState}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
