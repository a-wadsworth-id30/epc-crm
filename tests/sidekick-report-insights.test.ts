import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reportInsightSummary } from "../src/lib/reports/insights";
import type { ReportResult } from "../src/lib/reports/types";

function baseResult(overrides: Partial<ReportResult>): ReportResult {
  return {
    chart: {
      type: "bar",
      xField: "owner",
      yFields: ["leadCount"],
    },
    columns: [
      { field: "owner", label: "Owner", type: "text" },
      { field: "leadCount", label: "Lead count", type: "number" },
    ],
    generatedAt: "2026-07-15T10:00:00.000Z",
    plan: {
      chartType: "bar",
      dataset: "sales_opportunities",
      dateRange: { preset: "all" },
      dimensions: ["owner"],
      filters: [],
      metrics: ["leadCount"],
      sort: { field: "leadCount", direction: "desc" },
    },
    rowCount: 2,
    rows: [
      { owner: "Adam", leadCount: 12 },
      { owner: "Sam", leadCount: 4 },
    ],
    summary: "Lead owner report: 2 rows using Sales opportunities.",
    title: "Lead owner report",
    ...overrides,
  };
}

describe("Sidekick report insight summaries", () => {
  it("summarises the leading grouped result", () => {
    const summary = reportInsightSummary(baseResult({}));

    assert.match(summary, /Lead owner report returned 2 rows/);
    assert.match(summary, /Leading result: Adam with Lead count 12/);
  });

  it("summarises period comparisons from first to latest period", () => {
    const summary = reportInsightSummary(
      baseResult({
        chart: {
          type: "line",
          xField: "month",
          yFields: ["leadCount"],
        },
        columns: [
          { field: "month", label: "Month", type: "text" },
          { field: "leadCount", label: "Lead count", type: "number" },
        ],
        plan: {
          chartType: "line",
          dataset: "sales_opportunities",
          dateRange: { preset: "all" },
          dimensions: ["month"],
          filters: [],
          metrics: ["leadCount"],
          sort: { field: "month", direction: "asc" },
        },
        rows: [
          { month: "2026-06", leadCount: 8 },
          { month: "2026-07", leadCount: 10 },
        ],
        title: "Monthly leads",
      }),
    );

    assert.match(summary, /compares lead count across 2 rows/i);
    assert.match(summary, /First period: 2026-06 with 8/);
    assert.match(summary, /Latest period: 2026-07 with 10/);
  });

  it("uses dataset guidance when the report has no rows", () => {
    const summary = reportInsightSummary(
      baseResult({
        emptyState:
          "Check the tracking script, approved domains and selected filters.",
        rowCount: 0,
        rows: [],
        title: "Google Ads campaigns",
      }),
    );

    assert.equal(
      summary,
      "Google Ads campaigns: no data returned. Check the tracking script, approved domains and selected filters.",
    );
  });
});
