"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import ReportVisualization from "@/components/reports/ReportVisualization";
import {
  readSidekickReportHandoff,
  sidekickReportHandoffEvent,
  type SidekickReportHandoff,
} from "@/lib/reports/sidekick-report-handoff";
import type {
  ReportDatasetSchema,
  ReportPlan,
  ReportResult,
} from "@/lib/reports/types";

type SavedReport = {
  id: string;
  title: string;
  description: string | null;
  visibility: string;
  source: string;
  config: ReportPlan;
  updatedAt: string;
};

export type ReportsWorkspaceProps = {
  datasets: ReportDatasetSchema[];
  defaultPlans: ReportPlan[];
  savedReports: SavedReport[];
};

function downloadCsv(result: ReportResult) {
  const headers = result.columns.map((column) => column.label);
  const rows = result.rows.map((row) =>
    result.columns.map((column) => JSON.stringify(row[column.field] ?? "")),
  );
  const csv = [headers.map((header) => JSON.stringify(header)), ...rows]
    .map((row) => row.join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${result.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ReportsWorkspace({
  datasets,
  defaultPlans,
  savedReports,
}: ReportsWorkspaceProps) {
  const searchParams = useSearchParams();
  const [reports, setReports] = useState(savedReports);
  const [sidekickReport, setSidekickReport] =
    useState<SidekickReportHandoff | null>(null);
  const [selectedKey, setSelectedKey] = useState(`default:0`);
  const [plan, setPlan] = useState<ReportPlan>(defaultPlans[0]);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [saveTitle, setSaveTitle] = useState(defaultPlans[0]?.title ?? "");
  const [saveVisibility, setSaveVisibility] = useState("PRIVATE");
  const [isRunning, setIsRunning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const dataset =
    datasets.find((item) => item.id === plan.dataset) ?? datasets[0];

  const restoreSidekickReport = useCallback((showMissingMessage: boolean) => {
    const handoff = readSidekickReportHandoff();
    if (!handoff) {
      if (showMissingMessage) {
        setMessage(
          "The Sidekick report could not be opened. Ask Sidekick to run it again, then open it from the generated report card.",
        );
      }
      return false;
    }

    setSidekickReport(handoff);
    setSelectedKey("sidekick:latest");
    setPlan(handoff.result.plan);
    setResult(handoff.result);
    setSaveTitle(handoff.result.title);
    setSaveVisibility("PRIVATE");
    setMessage(null);
    return true;
  }, []);

  useEffect(() => {
    if (searchParams.get("source") !== "sidekick") return;
    restoreSidekickReport(true);
  }, [restoreSidekickReport, searchParams]);

  useEffect(() => {
    function handleSidekickReportHandoff() {
      restoreSidekickReport(false);
    }

    window.addEventListener(
      sidekickReportHandoffEvent,
      handleSidekickReportHandoff,
    );
    return () => {
      window.removeEventListener(
        sidekickReportHandoffEvent,
        handleSidekickReportHandoff,
      );
    };
  }, [restoreSidekickReport]);

  const reportOptions = useMemo(
    () => [
      ...(sidekickReport
        ? [
            {
              key: "sidekick:latest",
              title: sidekickReport.result.title,
              description: "Sidekick generated",
              plan: sidekickReport.result.plan,
              result: sidekickReport.result,
            },
          ]
        : []),
      ...defaultPlans.map((item, index) => ({
        key: `default:${index}`,
        title: item.title ?? `Default report ${index + 1}`,
        description: "Default report",
        plan: item,
        result: null,
      })),
      ...reports.map((item) => ({
        key: `saved:${item.id}`,
        title: item.title,
        description: item.visibility.toLowerCase(),
        plan: item.config,
        result: null,
      })),
    ],
    [defaultPlans, reports, sidekickReport],
  );

  async function run(nextPlan = plan) {
    setIsRunning(true);
    setMessage(null);
    try {
      const response = await fetch("/api/reports/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: nextPlan }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (ReportResult & { error?: string })
        | null;
      if (!response.ok || !payload) {
        throw new Error(payload?.error ?? "Report could not be run.");
      }
      setResult(payload);
      setPlan(payload.plan);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Report failed.");
    } finally {
      setIsRunning(false);
    }
  }

  async function saveReport() {
    const title =
      saveTitle.trim() || plan.title || result?.title || "Custom report";

    setIsSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/reports/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          title,
          visibility: saveVisibility,
        }),
      });
      const saved = (await response.json().catch(() => null)) as
        | (SavedReport & { error?: string })
        | null;
      if (!response.ok || !saved) {
        throw new Error(saved?.error ?? "Report could not be saved.");
      }
      setReports((current) => [saved, ...current]);
      setSelectedKey(`saved:${saved.id}`);
      setMessage("Report saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  function updatePlan(patch: Partial<ReportPlan>) {
    setPlan((current) => {
      const next = { ...current, ...patch };
      if (Object.hasOwn(patch, "title")) {
        setSaveTitle(next.title ?? "");
      }
      return next;
    });
    setResult(null);
  }

  const planPreview = [
    dataset.label,
    `${plan.metrics.length} metric${plan.metrics.length === 1 ? "" : "s"}`,
    plan.dimensions[0]
      ? `by ${
          dataset.dimensions.find((item) => item.id === plan.dimensions[0])
            ?.label ?? plan.dimensions[0]
        }`
      : "no dimension",
    plan.dateRange.preset,
    plan.filters.length
      ? `${plan.filters.length} filter${plan.filters.length === 1 ? "" : "s"}`
      : "no filters",
  ].join(" · ");

  return (
    <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90">
            Reports library
          </h2>
          <div className="mt-3 space-y-2">
            {reportOptions.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setSelectedKey(item.key);
                  setPlan(item.plan);
                  setSaveTitle(item.plan.title ?? item.title);
                  setSaveVisibility(
                    item.key === "sidekick:latest"
                      ? "PRIVATE"
                      : item.key.startsWith("saved:")
                        ? reports.find(
                            (report) => `saved:${report.id}` === item.key,
                          )?.visibility ?? "PRIVATE"
                        : "PRIVATE",
                  );
                  if (item.result) {
                    setResult(item.result);
                    setMessage(null);
                  } else {
                    setResult(null);
                    void run(item.plan);
                  }
                }}
                className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
                  selectedKey === item.key
                    ? "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-200"
                    : "border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.04]"
                }`}
              >
                <span className="block font-semibold">{item.title}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {item.description}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90">
            Customise
          </h2>
          <div className="mt-4 space-y-3">
            <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
              Title
              <input
                value={plan.title ?? ""}
                onChange={(event) => updatePlan({ title: event.target.value })}
                className="h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
              Dataset
              <select
                value={plan.dataset}
                onChange={(event) => {
                  const nextDataset =
                    datasets.find((item) => item.id === event.target.value) ??
                    datasets[0];
                  setPlan(nextDataset.defaultPlan);
                  setSaveTitle(nextDataset.defaultPlan.title ?? "");
                  setResult(null);
                }}
                className="h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              >
                {datasets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
              Date range
              <select
                value={plan.dateRange.preset}
                onChange={(event) =>
                  updatePlan({
                    dateRange: {
                      preset: event.target
                        .value as ReportPlan["dateRange"]["preset"],
                    },
                  })
                }
                className="h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="180d">Last 180 days</option>
                <option value="365d">Last 365 days</option>
                <option value="all">All time</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
              Chart
              <select
                value={plan.chartType}
                onChange={(event) =>
                  updatePlan({
                    chartType: event.target.value as ReportPlan["chartType"],
                  })
                }
                className="h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="bar">Bar</option>
                <option value="line">Line</option>
                <option value="area">Area</option>
                <option value="stacked_bar">Stacked bar</option>
                <option value="donut">Donut</option>
                <option value="table">Table</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
              Dimension
              <select
                value={plan.dimensions[0] ?? ""}
                onChange={(event) =>
                  updatePlan({ dimensions: [event.target.value] })
                }
                className="h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              >
                {dataset.dimensions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Metrics
              </legend>
              {dataset.metrics.map((metric) => (
                <label
                  key={metric.id}
                  className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300"
                >
                  <input
                    type="checkbox"
                    checked={plan.metrics.includes(metric.id)}
                    onChange={(event) => {
                      const metrics = event.target.checked
                        ? [...plan.metrics, metric.id].slice(0, 4)
                        : plan.metrics.filter((item) => item !== metric.id);
                      updatePlan({
                        metrics: metrics.length ? metrics : [metric.id],
                      });
                    }}
                  />
                  {metric.label}
                </label>
              ))}
            </fieldset>
            <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Filter
              </p>
              <div className="mt-2 grid gap-2">
                <select
                  value={plan.filters[0]?.field ?? ""}
                  onChange={(event) => {
                    const field = event.target.value;
                    updatePlan({
                      filters: field
                        ? [
                            {
                              field,
                              operator: "contains",
                              value: String(plan.filters[0]?.value ?? ""),
                            },
                          ]
                        : [],
                    });
                  }}
                  className="h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                >
                  <option value="">No filter</option>
                  {dataset.filters.map((filter) => (
                    <option key={filter.id} value={filter.id}>
                      {filter.label}
                    </option>
                  ))}
                </select>
                {plan.filters[0]?.field ? (
                  <input
                    value={String(plan.filters[0]?.value ?? "")}
                    onChange={(event) =>
                      updatePlan({
                        filters: [
                          {
                            field: plan.filters[0].field,
                            operator: "contains",
                            value: event.target.value,
                          },
                        ],
                      })
                    }
                    placeholder="Contains..."
                    className="h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                  />
                ) : null}
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Save options
              </p>
              <div className="mt-2 grid gap-2">
                <input
                  value={saveTitle}
                  onChange={(event) => setSaveTitle(event.target.value)}
                  placeholder="Saved report name"
                  className="h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                />
                <select
                  value={saveVisibility}
                  onChange={(event) => setSaveVisibility(event.target.value)}
                  className="h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                >
                  <option value="PRIVATE">Private</option>
                  <option value="TEAM">Team</option>
                  <option value="GLOBAL">Global</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={() => void run()}
                disabled={isRunning}
                className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {isRunning ? "Running..." : "Run"}
              </button>
              <button
                type="button"
                onClick={() => void saveReport()}
                disabled={isSaving || !saveTitle.trim()}
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300"
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
            {message ? (
              <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-white/[0.04] dark:text-gray-300">
                {message}
              </p>
            ) : null}
          </div>
        </section>
      </aside>

      <main className="min-w-0 space-y-4">
        {sidekickReport ? (
          <section className="rounded-2xl border border-brand-100 bg-brand-50/60 p-4 shadow-theme-xs dark:border-brand-500/30 dark:bg-brand-500/10">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold tracking-wide text-brand-700 uppercase dark:text-brand-200">
                  Sidekick exploration
                </p>
                <h2 className="mt-1 text-base font-semibold text-gray-800 dark:text-white/90">
                  {sidekickReport.result.title}
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-300">
                  {sidekickReport.prompt
                    ? `Opened from: ${sidekickReport.prompt}`
                    : "Opened from the latest Sidekick-generated report."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedKey("sidekick:latest");
                  setPlan(sidekickReport.result.plan);
                  setResult(sidekickReport.result);
                  setSaveTitle(sidekickReport.result.title);
                  setSaveVisibility("PRIVATE");
                  setMessage(null);
                }}
                className="rounded-lg border border-brand-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 dark:border-brand-500/40 dark:bg-gray-950 dark:text-brand-200 dark:hover:bg-brand-500/10"
              >
                Open Sidekick report
              </button>
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">
                {result?.title ?? plan.title ?? "Report"}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {result?.summary ??
                  `Preview: ${planPreview}. Run the report when ready.`}
              </p>
            </div>
            {result ? (
              <button
                type="button"
                onClick={() => downloadCsv(result)}
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-300"
              >
                Export CSV
              </button>
            ) : null}
          </div>
        </section>

        {result ? (
          <ReportVisualization result={result} />
        ) : (
          <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            Run a report to see charts and table data.
          </div>
        )}
      </main>
    </div>
  );
}
