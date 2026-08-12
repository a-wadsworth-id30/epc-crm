"use client";

import type {
  ReportColumn,
  ReportPlan,
  ReportResult,
} from "@/lib/reports/types";

const storageKey = "id30:sidekick-report-handoff:v1";
const maxAgeMs = 4 * 60 * 60 * 1000;

export const sidekickReportHandoffEvent = "id30:sidekick-report-handoff";

export type SidekickReportHandoff = {
  prompt?: string | null;
  result: ReportResult;
  savedAt: string;
  source: "sidekick";
};

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isReportPlan(value: unknown): value is ReportPlan {
  const plan = objectValue(value);
  const dateRange = objectValue(plan?.dateRange);
  if (!plan || !dateRange) return false;

  return (
    typeof plan.dataset === "string" &&
    isStringArray(plan.metrics) &&
    isStringArray(plan.dimensions) &&
    Array.isArray(plan.filters) &&
    typeof dateRange.preset === "string" &&
    typeof plan.chartType === "string"
  );
}

function isReportColumn(value: unknown): value is ReportColumn {
  const column = objectValue(value);
  return (
    Boolean(column) &&
    typeof column?.field === "string" &&
    typeof column?.label === "string" &&
    typeof column?.type === "string"
  );
}

export function isReportResult(value: unknown): value is ReportResult {
  const result = objectValue(value);
  const chart = objectValue(result?.chart);
  const columns = result?.columns;
  const rows = result?.rows;

  return (
    Boolean(result) &&
    isReportPlan(result?.plan) &&
    typeof result?.title === "string" &&
    typeof result?.summary === "string" &&
    Array.isArray(columns) &&
    columns.every(isReportColumn) &&
    Array.isArray(rows) &&
    Boolean(chart) &&
    typeof chart?.type === "string" &&
    (typeof chart?.xField === "string" || chart?.xField === null) &&
    isStringArray(chart?.yFields) &&
    typeof result?.generatedAt === "string" &&
    typeof result?.rowCount === "number"
  );
}

export function storeSidekickReportHandoff({
  prompt,
  result,
}: {
  prompt?: string | null;
  result: ReportResult;
}) {
  if (typeof window === "undefined") return false;

  const payload: SidekickReportHandoff = {
    prompt: prompt ?? null,
    result,
    savedAt: new Date().toISOString(),
    source: "sidekick",
  };

  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent(sidekickReportHandoffEvent));
    return true;
  } catch {
    return false;
  }
}

export function readSidekickReportHandoff() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    const payload = objectValue(parsed);
    if (
      !payload ||
      payload.source !== "sidekick" ||
      typeof payload.savedAt !== "string" ||
      !isReportResult(payload.result)
    ) {
      window.sessionStorage.removeItem(storageKey);
      return null;
    }

    const savedAt = new Date(payload.savedAt).getTime();
    if (!Number.isFinite(savedAt) || Date.now() - savedAt > maxAgeMs) {
      window.sessionStorage.removeItem(storageKey);
      return null;
    }

    return {
      prompt: typeof payload.prompt === "string" ? payload.prompt : null,
      result: payload.result,
      savedAt: payload.savedAt,
      source: "sidekick" as const,
    };
  } catch {
    window.sessionStorage.removeItem(storageKey);
    return null;
  }
}
