import "server-only";

import { getMcpSalesSummary } from "@/lib/mcp/sales-summary";
import { reportPlanFromPrompt, runReportPlan, sanitiseReportPlan } from "@/lib/reports/engine";
import { reportInsightSummary } from "@/lib/reports/insights";
import type { ReportDateRange, ReportPlan } from "@/lib/reports/types";
import { loadSetupReadiness } from "@/lib/setup/readiness";

type MarketingView =
  | "overview"
  | "lead_sources"
  | "attribution"
  | "campaigns"
  | "conversion_reporting";

const mcpReportUser = {
  id: "mcp-broker",
  role: "ADMIN" as const,
};

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function clampLimit(value: unknown, fallback = 12) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return fallback;

  return Math.min(25, Math.max(1, Math.floor(parsed)));
}

function startOfUtcDay(value: Date) {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);

  return date;
}

function mcpDateRange(value: unknown): ReportDateRange {
  const preset = stringValue(value) ?? "last_30_days";
  const now = new Date();

  if (preset === "all") return { preset: "all" };
  if (preset === "last_7_days" || preset === "7d") return { preset: "7d" };
  if (preset === "last_90_days" || preset === "90d") return { preset: "90d" };
  if (preset === "last_180_days" || preset === "180d") return { preset: "180d" };
  if (preset === "last_365_days" || preset === "365d") return { preset: "365d" };

  if (preset === "this_month") {
    const from = startOfUtcDay(now);
    from.setUTCDate(1);

    return {
      preset: "custom",
      from: from.toISOString(),
      to: now.toISOString(),
    };
  }

  if (preset === "last_month") {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    return {
      preset: "custom",
      from: from.toISOString(),
      to: to.toISOString(),
    };
  }

  return { preset: "30d" };
}

function withMcpDefaults(plan: ReportPlan, args: Record<string, unknown>) {
  return sanitiseReportPlan({
    ...plan,
    dateRange: mcpDateRange(args.dateRange),
    limit: clampLimit(args.limit, plan.limit ?? 12),
  });
}

async function runMcpApprovedReport({
  args,
  plan,
  prompt,
}: {
  args: Record<string, unknown>;
  plan: ReportPlan;
  prompt?: string | null;
}) {
  const report = await runReportPlan({
    auditUserId: null,
    prompt,
    user: mcpReportUser,
    plan: withMcpDefaults(plan, args),
  });

  return {
    report,
    insight: reportInsightSummary(report),
  };
}

export async function runMcpReport(args: unknown) {
  const input = objectValue(args);
  const prompt = stringValue(input.prompt);

  if (!prompt || prompt.length < 3) {
    throw new Error("Report prompt must be at least 3 characters.");
  }

  const { report, insight } = await runMcpApprovedReport({
    args: input,
    plan: reportPlanFromPrompt(prompt),
    prompt,
  });

  return {
    ok: true,
    source: "crm-mcp-report",
    prompt,
    insight,
    report,
  };
}

function marketingView(value: unknown): MarketingView {
  const view = stringValue(value);

  return view === "lead_sources" ||
    view === "attribution" ||
    view === "campaigns" ||
    view === "conversion_reporting"
    ? view
    : "overview";
}

function marketingPlan(view: MarketingView): ReportPlan {
  if (view === "lead_sources") {
    return {
      dataset: "sales_opportunities",
      metrics: ["leadCount", "openPipeline", "wonRevenue"],
      dimensions: ["source"],
      filters: [],
      dateRange: { preset: "90d" },
      chartType: "bar",
      sort: { field: "leadCount", direction: "desc" },
      limit: 12,
      title: "Lead sources",
    };
  }

  if (view === "attribution") {
    return {
      dataset: "marketing_attribution",
      metrics: ["conversions", "visitors", "conversionRate"],
      dimensions: ["source", "campaign"],
      filters: [],
      dateRange: { preset: "90d" },
      chartType: "bar",
      sort: { field: "conversions", direction: "desc" },
      limit: 12,
      title: "Attribution by source and campaign",
    };
  }

  if (view === "campaigns") {
    return {
      dataset: "marketing_attribution",
      metrics: ["conversions", "cost", "costPerConversion"],
      dimensions: ["campaign", "source"],
      filters: [],
      dateRange: { preset: "90d" },
      chartType: "bar",
      sort: { field: "conversions", direction: "desc" },
      limit: 12,
      title: "Campaign performance",
    };
  }

  if (view === "conversion_reporting") {
    return {
      dataset: "form_submissions",
      metrics: ["submissionCount", "linkedOpportunities", "missingContactDetails"],
      dimensions: ["form", "source"],
      filters: [],
      dateRange: { preset: "90d" },
      chartType: "bar",
      sort: { field: "submissionCount", direction: "desc" },
      limit: 12,
      title: "Conversion reporting",
    };
  }

  return {
    dataset: "marketing_attribution",
    metrics: ["conversions", "visitors", "conversionRate"],
    dimensions: ["source"],
    filters: [],
    dateRange: { preset: "90d" },
    chartType: "bar",
    sort: { field: "conversions", direction: "desc" },
    limit: 12,
    title: "Marketing overview",
  };
}

export async function getMcpMarketingReport(args: unknown) {
  const input = objectValue(args);
  const view = marketingView(input.view);
  const { report, insight } = await runMcpApprovedReport({
    args: input,
    plan: marketingPlan(view),
  });

  return {
    ok: true,
    source: "crm-mcp-marketing-report",
    view,
    insight,
    report,
  };
}

export async function getMcpSetupStatus() {
  const readiness = await loadSetupReadiness();

  return {
    ok: true,
    source: "crm-mcp-setup-status",
    generatedAt: new Date().toISOString(),
    summary: {
      actionableCount: readiness.actionableCount,
      activeUserCount: readiness.activeUserCount,
      adminCount: readiness.adminCount,
      completionPercent: readiness.completionPercent,
      isComplete: readiness.isComplete,
      neededCount: readiness.neededCount,
      readyCount: readiness.readyCount,
      warningCount: readiness.warningCount,
    },
    outstandingItems: readiness.outstandingItems.slice(0, 12),
    groups: readiness.groups.map((group) => ({
      title: group.title,
      status: group.items.every((item) => item.status === "Ready")
        ? "Ready"
        : group.items.some((item) => item.status === "Needed")
          ? "Needed"
          : "WARNING",
      items: group.items.map((item) => ({
        title: item.title,
        detail: item.detail,
        status: item.status,
        href: item.href,
      })),
    })),
  };
}

export async function getMcpExecutiveReport(args: unknown) {
  const input = objectValue(args);
  const [sales, marketing, setup] = await Promise.all([
    getMcpSalesSummary(input),
    getMcpMarketingReport({ ...input, view: "overview" }),
    getMcpSetupStatus(),
  ]);

  return {
    ok: true,
    source: "crm-mcp-executive-report",
    generatedAt: new Date().toISOString(),
    dateRange: sales.dateRange,
    sales,
    marketing: {
      insight: marketing.insight,
      report: marketing.report,
    },
    setup: setup.summary,
  };
}
