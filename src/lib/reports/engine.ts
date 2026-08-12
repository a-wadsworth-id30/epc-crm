import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCrmSettings } from "@/lib/settings";
import { loadSetupReadiness } from "@/lib/setup/readiness";
import { parseWorkspaceDefaults } from "@/lib/workspace-defaults";
import type {
  ReportColumn,
  ReportDatasetSchema,
  ReportFilter,
  ReportPlan,
  ReportResult,
} from "@/lib/reports/types";

type Row = Record<string, string | number | null>;
type ReportUser = { id: string; role: "ADMIN" | "USER" };

const maxRows = 2000;

function daysRange(days: number) {
  const to = new Date();
  const from = new Date(to);
  from.setDate(to.getDate() - days);
  return { from, to };
}

function rangeFromPlan(plan: ReportPlan) {
  if (plan.dateRange.preset === "all") return null;
  if (plan.dateRange.preset === "custom") {
    return {
      from: plan.dateRange.from ? new Date(plan.dateRange.from) : new Date(0),
      to: plan.dateRange.to ? new Date(plan.dateRange.to) : new Date(),
    };
  }
  const days = Number(plan.dateRange.preset.replace("d", ""));
  return daysRange(Number.isFinite(days) ? days : 30);
}

function money(valueCents: number) {
  return Math.round(valueCents / 100);
}

function percent(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function average(values: number[]) {
  return values.length
    ? Math.round(
        values.reduce((total, value) => total + value, 0) / values.length,
      )
    : 0;
}

function durationMinutesBetween(later: Date | null, earlier: Date | null) {
  if (!later || !earlier) return null;

  const minutes = (later.getTime() - earlier.getTime()) / 60_000;
  return Number.isFinite(minutes) ? Math.max(0, minutes) : null;
}

const lifecycleStageRank: Record<string, number> = {
  LEAD: 1,
  QUALIFIED: 2,
  PROPOSAL: 3,
  NEGOTIATION: 4,
  WON: 5,
  LOST: 0,
};

function isAtLeastLifecycleStage(stage: string, target: string) {
  return (lifecycleStageRank[stage] ?? 0) >= (lifecycleStageRank[target] ?? 0);
}

function validTimezone(timezone: string | null | undefined) {
  try {
    Intl.DateTimeFormat("en-GB", { timeZone: timezone || "Europe/London" });
    return timezone || "Europe/London";
  } catch {
    return "Europe/London";
  }
}

async function reportTimezone() {
  const settings = await getCrmSettings();
  const workspaceDefaults = parseWorkspaceDefaults(settings.workspaceDefaults);
  return validTimezone(workspaceDefaults.timezone);
}

function localDateParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: validTimezone(timezone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    weekday: "long",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;

  return {
    day: value("day") ?? "01",
    hour: value("hour") ?? "00",
    month: value("month") ?? "01",
    weekday: value("weekday") ?? "Unknown",
    year: value("year") ?? "1970",
  };
}

function monthKey(date: Date, timezone: string) {
  const parts = localDateParts(date, timezone);
  return `${parts.year}-${parts.month}`;
}

function dayKey(date: Date, timezone: string) {
  const parts = localDateParts(date, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function hourKey(date: Date, timezone: string) {
  return `${localDateParts(date, timezone).hour}:00`;
}

function weekdayKey(date: Date, timezone: string) {
  return localDateParts(date, timezone).weekday;
}

function weekKey(date: Date, timezone: string) {
  const parts = localDateParts(date, timezone);
  const copy = new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)),
  );
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((copy.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${copy.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function normaliseSource(source: string | null) {
  return source?.trim() || "Direct / unknown";
}

function enumLabel(value: string | null | undefined) {
  const cleaned = value?.trim();
  if (!cleaned) return "Unknown";
  return cleaned
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function lifecycleStageLabel(
  stage: string | null | undefined,
  pipelineStage: { name: string } | null | undefined,
  fallback = "Unknown",
) {
  return pipelineStage?.name || (stage ? enumLabel(stage) : fallback);
}

function groupText(value: string | null | undefined, fallback = "Unknown") {
  const cleaned = value?.trim();
  if (!cleaned) return fallback;
  return cleaned.length > 100 ? `${cleaned.slice(0, 97)}...` : cleaned;
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function scalarText(value: unknown) {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function hasAnswerValue(value: unknown) {
  if (value === null || typeof value === "undefined") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.some(hasAnswerValue);

  return Object.values(objectValue(value)).some(hasAnswerValue);
}

function optionLabelFromSnapshot(options: unknown, rawValue: string) {
  if (!Array.isArray(options)) return null;

  for (const option of options) {
    const direct = scalarText(option);
    if (direct && direct === rawValue) return direct;

    const record = objectValue(option);
    const optionValue =
      scalarText(record.value) ??
      scalarText(record.id) ??
      scalarText(record.slug) ??
      scalarText(record.name) ??
      scalarText(record.label);
    const optionLabel =
      scalarText(record.label) ??
      scalarText(record.name) ??
      scalarText(record.value);

    if (optionValue === rawValue || optionLabel === rawValue) {
      return optionLabel ?? optionValue;
    }
  }

  return null;
}

function answerValueParts(value: unknown) {
  if (!hasAnswerValue(value)) return [];
  const scalar = scalarText(value);
  if (scalar) return [scalar];

  if (Array.isArray(value)) {
    return value.map(scalarText).filter((item): item is string => Boolean(item));
  }

  const record = objectValue(value);
  const rangeStart =
    scalarText(record.from) ?? scalarText(record.min) ?? scalarText(record.start);
  const rangeEnd =
    scalarText(record.to) ?? scalarText(record.max) ?? scalarText(record.end);
  const range = [rangeStart, rangeEnd].filter(Boolean);
  if (range.length) return [range.join(" - ")];

  return Object.entries(record)
    .map(([key, item]) => {
      const text = scalarText(item);
      return text ? `${enumLabel(key)}: ${text}` : null;
    })
    .filter((item): item is string => Boolean(item));
}

function discoveryAnswerValues({
  answerType,
  categoryLabels,
  options,
  productLabels,
  value,
}: {
  answerType: string;
  categoryLabels: Map<string, string>;
  options: unknown;
  productLabels: Map<string, string>;
  value: unknown;
}) {
  return answerValueParts(value)
    .map((rawValue) => {
      if (answerType.startsWith("PRODUCT_")) {
        return productLabels.get(rawValue) ?? rawValue;
      }
      if (answerType.startsWith("CATEGORY_")) {
        return categoryLabels.get(rawValue) ?? rawValue;
      }
      if (answerType === "BOOLEAN") {
        if (rawValue === "true") return "Yes";
        if (rawValue === "false") return "No";
      }
      return optionLabelFromSnapshot(options, rawValue) ?? rawValue;
    })
    .map((value) => groupText(value, "Unknown answer"))
    .filter(Boolean);
}

function discoveryNumericValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const scalar = scalarText(value);
  if (!scalar) return null;

  const parsed = Number(scalar.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function serviceFocus(value: unknown, title: string, source: string | null) {
  const scope = objectValue(value);
  const productTypes = Array.isArray(scope.productTypes)
    ? scope.productTypes.map(stringValue).filter(Boolean)
    : [];
  const customProductTypes = Array.isArray(scope.customProductTypes)
    ? scope.customProductTypes.map(stringValue).filter(Boolean)
    : [];
  const text = [title, source, ...productTypes, ...customProductTypes]
    .join(" ")
    .toLowerCase();

  if (text.includes("shopify") || text.includes("ecommerce"))
    return "Shopify / ecommerce";
  if (
    text.includes("marketing") ||
    text.includes("seo") ||
    text.includes("paid")
  )
    return "Digital marketing";
  if (text.includes("crm") || text.includes("operating system"))
    return "CRM / operating system";
  if (
    text.includes("storyblok") ||
    text.includes("lead gen") ||
    text.includes("website")
  )
    return "Lead generation website";
  return productTypes[0] ?? customProductTypes[0] ?? "Unclassified";
}

export const reportDatasets: ReportDatasetSchema[] = [
  {
    id: "sales_opportunities",
    label: "Sales opportunities",
    description: "Pipeline, revenue, owner, source and service performance.",
    dateField: "createdAt",
    metrics: [
      { id: "leadCount", label: "Leads", type: "number" },
      { id: "openPipeline", label: "Open pipeline", type: "currency" },
      { id: "weightedPipeline", label: "Weighted pipeline", type: "currency" },
      { id: "wonRevenue", label: "Won revenue", type: "currency" },
      { id: "winRate", label: "Win rate", type: "percent" },
      { id: "avgDealValue", label: "Average deal value", type: "currency" },
      { id: "staleLeads", label: "Stale leads", type: "number" },
      { id: "proposalCount", label: "Proposals", type: "number" },
    ],
    dimensions: [
      { id: "day", label: "Day", type: "date" },
      { id: "weekday", label: "Weekday", type: "text" },
      { id: "hour", label: "Hour", type: "text" },
      { id: "month", label: "Month", type: "text" },
      { id: "week", label: "Week", type: "text" },
      { id: "stage", label: "Stage", type: "text" },
      { id: "pipelineStage", label: "Pipeline stage", type: "text" },
      { id: "source", label: "Lead source", type: "text" },
      { id: "owner", label: "Owner", type: "text" },
      { id: "service", label: "Service focus", type: "text" },
    ],
    filters: [
      { id: "stage", label: "Stage" },
      { id: "isOpen", label: "Open/closed" },
      { id: "source", label: "Lead source" },
      { id: "owner", label: "Owner" },
      { id: "service", label: "Service focus" },
    ],
    defaultPlan: {
      dataset: "sales_opportunities",
      metrics: ["wonRevenue", "openPipeline", "winRate"],
      dimensions: ["source"],
      filters: [],
      dateRange: { preset: "90d" },
      chartType: "bar",
      limit: 12,
      title: "Sales by lead source",
    },
  },
  {
    id: "opportunity_products",
    label: "Opportunity products",
    description:
      "Catalogue product demand linked to sales opportunities, pipeline and revenue.",
    dateField: "opportunity.createdAt",
    metrics: [
      { id: "productLeadCount", label: "Product leads", type: "number" },
      { id: "productSelections", label: "Selections", type: "number" },
      { id: "confirmedSelections", label: "Confirmed", type: "number" },
      { id: "quantity", label: "Quantity", type: "number" },
      {
        id: "estimatedValue",
        label: "Estimated product value",
        type: "currency",
      },
      {
        id: "linkedOpenPipeline",
        label: "Linked open pipeline",
        type: "currency",
      },
      {
        id: "linkedWeightedPipeline",
        label: "Linked weighted pipeline",
        type: "currency",
      },
      { id: "linkedWonRevenue", label: "Linked won revenue", type: "currency" },
      { id: "avgConfidence", label: "Avg confidence", type: "percent" },
    ],
    dimensions: [
      { id: "product", label: "Product", type: "text" },
      { id: "category", label: "Category", type: "text" },
      { id: "productType", label: "Product type", type: "text" },
      { id: "productStatus", label: "Product status", type: "text" },
      { id: "source", label: "Lead source", type: "text" },
      { id: "owner", label: "Owner", type: "text" },
      { id: "pipelineStage", label: "Pipeline stage", type: "text" },
      { id: "stage", label: "Stage", type: "text" },
      { id: "month", label: "Month", type: "text" },
      { id: "week", label: "Week", type: "text" },
      { id: "day", label: "Day", type: "date" },
    ],
    filters: [
      { id: "product", label: "Product" },
      { id: "category", label: "Category" },
      { id: "productType", label: "Product type" },
      { id: "productStatus", label: "Product status" },
      { id: "source", label: "Lead source" },
      { id: "owner", label: "Owner" },
      { id: "pipelineStage", label: "Pipeline stage" },
      { id: "stage", label: "Stage" },
    ],
    defaultPlan: {
      dataset: "opportunity_products",
      metrics: ["productLeadCount", "linkedOpenPipeline", "linkedWonRevenue"],
      dimensions: ["product"],
      filters: [
        { field: "productStatus", operator: "not_equals", value: "Declined" },
      ],
      dateRange: { preset: "all" },
      chartType: "bar",
      sort: { field: "productLeadCount", direction: "desc" },
      limit: 12,
      title: "Product demand by product",
    },
  },
  {
    id: "marketing_attribution",
    label: "Marketing attribution",
    description:
      "Source, campaign, touchpoint and visitor conversion evidence from Tracking Engine data.",
    dateField: "capturedAt",
    metrics: [
      { id: "touchpoints", label: "Touchpoints", type: "number" },
      { id: "visitors", label: "Visitors", type: "number" },
      { id: "sessions", label: "Sessions", type: "number" },
      { id: "conversions", label: "Conversions", type: "number" },
      { id: "formLeads", label: "Form leads", type: "number" },
      { id: "phoneLeads", label: "Phone leads", type: "number" },
      { id: "firstTouchpoints", label: "First touch", type: "number" },
      { id: "assistedTouchpoints", label: "Assisted", type: "number" },
      { id: "lastTouchpoints", label: "Last touch", type: "number" },
      { id: "conversionRate", label: "Conversion rate", type: "percent" },
      { id: "cost", label: "Cost", type: "currency" },
      { id: "costPerConversion", label: "Cost per conversion", type: "currency" },
    ],
    dimensions: [
      { id: "platform", label: "Platform", type: "text" },
      { id: "source", label: "Source", type: "text" },
      { id: "medium", label: "Medium", type: "text" },
      { id: "campaign", label: "Campaign", type: "text" },
      { id: "term", label: "Search term", type: "text" },
      { id: "content", label: "Content", type: "text" },
      { id: "role", label: "Touchpoint role", type: "text" },
      { id: "conversionType", label: "Conversion type", type: "text" },
      { id: "landingPage", label: "Landing page", type: "text" },
      { id: "referrer", label: "Referrer", type: "text" },
      { id: "offlineCampaign", label: "Offline campaign", type: "text" },
      { id: "month", label: "Month", type: "text" },
      { id: "week", label: "Week", type: "text" },
      { id: "day", label: "Day", type: "date" },
    ],
    filters: [
      { id: "platform", label: "Platform" },
      { id: "source", label: "Source" },
      { id: "medium", label: "Medium" },
      { id: "campaign", label: "Campaign" },
      { id: "term", label: "Search term" },
      { id: "content", label: "Content" },
      { id: "role", label: "Touchpoint role" },
      { id: "conversionType", label: "Conversion type" },
      { id: "landingPage", label: "Landing page" },
      { id: "referrer", label: "Referrer" },
      { id: "offlineCampaign", label: "Offline campaign" },
    ],
    defaultPlan: {
      dataset: "marketing_attribution",
      metrics: ["conversions", "visitors", "conversionRate"],
      dimensions: ["source"],
      filters: [],
      dateRange: { preset: "90d" },
      chartType: "bar",
      sort: { field: "conversions", direction: "desc" },
      limit: 12,
      title: "Attribution conversions by source",
    },
  },
  {
    id: "form_submissions",
    label: "Form submissions",
    description:
      "Captured website form submissions, submitted fields and contact-detail completeness.",
    dateField: "createdAt",
    metrics: [
      { id: "submissionCount", label: "Submissions", type: "number" },
      { id: "fieldCount", label: "Captured fields", type: "number" },
      { id: "avgFields", label: "Avg fields", type: "number" },
      { id: "linkedOpportunities", label: "Linked opportunities", type: "number" },
      { id: "linkedContacts", label: "Linked contacts", type: "number" },
      { id: "uniqueVisitors", label: "Visitors", type: "number" },
      { id: "missingEmail", label: "Missing email", type: "number" },
      { id: "missingPhone", label: "Missing phone", type: "number" },
      {
        id: "missingContactDetails",
        label: "Missing email or phone",
        type: "number",
      },
      { id: "messageFields", label: "Message fields", type: "number" },
    ],
    dimensions: [
      { id: "form", label: "Form", type: "text" },
      { id: "field", label: "Field", type: "text" },
      { id: "fieldType", label: "Field type", type: "text" },
      { id: "missingStatus", label: "Missing status", type: "text" },
      { id: "source", label: "Lead source", type: "text" },
      { id: "campaign", label: "Campaign", type: "text" },
      { id: "landingPage", label: "Landing page", type: "text" },
      { id: "currentPage", label: "Submitted page", type: "text" },
      { id: "month", label: "Month", type: "text" },
      { id: "week", label: "Week", type: "text" },
      { id: "day", label: "Day", type: "date" },
    ],
    filters: [
      { id: "form", label: "Form" },
      { id: "field", label: "Field" },
      { id: "fieldType", label: "Field type" },
      { id: "missingStatus", label: "Missing status" },
      { id: "source", label: "Lead source" },
      { id: "campaign", label: "Campaign" },
      { id: "landingPage", label: "Landing page" },
      { id: "currentPage", label: "Submitted page" },
    ],
    defaultPlan: {
      dataset: "form_submissions",
      metrics: ["submissionCount", "fieldCount", "linkedOpportunities"],
      dimensions: ["form"],
      filters: [],
      dateRange: { preset: "90d" },
      chartType: "bar",
      sort: { field: "submissionCount", direction: "desc" },
      limit: 12,
      title: "Form submissions by form",
    },
  },
  {
    id: "calls",
    label: "Calls",
    description:
      "Call volume, missed calls, queue wait, recordings, transcripts and duration.",
    dateField: "startedAt",
    metrics: [
      { id: "callCount", label: "Calls", type: "number" },
      { id: "answeredCalls", label: "Answered", type: "number" },
      { id: "missedCalls", label: "Missed", type: "number" },
      { id: "avgDuration", label: "Avg duration", type: "number" },
      { id: "queuedCalls", label: "Queued calls", type: "number" },
      { id: "abandonedCalls", label: "Abandoned", type: "number" },
      {
        id: "avgQueueWaitSeconds",
        label: "Avg queue wait seconds",
        type: "number",
      },
      {
        id: "maxQueueWaitSeconds",
        label: "Max queue wait seconds",
        type: "number",
      },
      { id: "recordingCount", label: "Recordings", type: "number" },
      { id: "transcriptReady", label: "Transcripts ready", type: "number" },
      { id: "transcriptMissing", label: "Transcripts missing", type: "number" },
    ],
    dimensions: [
      { id: "day", label: "Day", type: "date" },
      { id: "week", label: "Week", type: "text" },
      { id: "month", label: "Month", type: "text" },
      { id: "status", label: "Status", type: "text" },
      { id: "direction", label: "Direction", type: "text" },
      { id: "agent", label: "Agent", type: "text" },
      { id: "queueStatus", label: "Queue status", type: "text" },
      { id: "queueAssignee", label: "Queue assignee", type: "text" },
      { id: "recordingStatus", label: "Recording status", type: "text" },
      { id: "transcriptStatus", label: "Transcript status", type: "text" },
      { id: "contactStatus", label: "Contact link", type: "text" },
      { id: "opportunityStatus", label: "Opportunity link", type: "text" },
      { id: "number", label: "Business number", type: "text" },
    ],
    filters: [
      { id: "status", label: "Status" },
      { id: "direction", label: "Direction" },
      { id: "agent", label: "Agent" },
      { id: "queueStatus", label: "Queue status" },
      { id: "queueAssignee", label: "Queue assignee" },
      { id: "recordingStatus", label: "Recording status" },
      { id: "transcriptStatus", label: "Transcript status" },
      { id: "contactStatus", label: "Contact link" },
      { id: "opportunityStatus", label: "Opportunity link" },
      { id: "number", label: "Business number" },
    ],
    defaultPlan: {
      dataset: "calls",
      metrics: ["callCount", "missedCalls"],
      dimensions: ["day"],
      filters: [],
      dateRange: { preset: "30d" },
      chartType: "line",
      limit: 31,
      title: "Call activity",
    },
  },
  {
    id: "tasks",
    label: "Tasks",
    description:
      "Open, overdue, due-date, completion and ownership follow-up work.",
    dateField: "createdAt",
    metrics: [
      { id: "taskCount", label: "Tasks", type: "number" },
      { id: "openTasks", label: "Open", type: "number" },
      { id: "overdueTasks", label: "Overdue", type: "number" },
      { id: "dueTodayTasks", label: "Due today", type: "number" },
      { id: "upcomingTasks", label: "Upcoming", type: "number" },
      { id: "completedTasks", label: "Completed", type: "number" },
      { id: "blockedTasks", label: "Blocked", type: "number" },
      { id: "unassignedTasks", label: "Unassigned", type: "number" },
      { id: "completionRate", label: "Completion rate", type: "percent" },
      { id: "avgAgeDays", label: "Avg age days", type: "number" },
      { id: "avgOverdueDays", label: "Avg overdue days", type: "number" },
    ],
    dimensions: [
      { id: "status", label: "Status", type: "text" },
      { id: "assignee", label: "Assignee", type: "text" },
      { id: "creator", label: "Creator", type: "text" },
      { id: "dueStatus", label: "Due status", type: "text" },
      { id: "linkStatus", label: "Linked record", type: "text" },
      { id: "createdDay", label: "Created day", type: "date" },
      { id: "dueDay", label: "Due day", type: "date" },
      { id: "week", label: "Week", type: "text" },
      { id: "month", label: "Month", type: "text" },
      { id: "dueWeek", label: "Due week", type: "text" },
      { id: "dueMonth", label: "Due month", type: "text" },
    ],
    filters: [
      { id: "status", label: "Status" },
      { id: "assignee", label: "Assignee" },
      { id: "creator", label: "Creator" },
      { id: "dueStatus", label: "Due status" },
      { id: "linkStatus", label: "Linked record" },
    ],
    defaultPlan: {
      dataset: "tasks",
      metrics: ["openTasks", "overdueTasks", "completedTasks"],
      dimensions: ["assignee"],
      filters: [],
      dateRange: { preset: "30d" },
      chartType: "bar",
      limit: 12,
      title: "Task workload",
    },
  },
  {
    id: "communications",
    label: "Communications",
    description:
      "Email, SMS, WhatsApp, phone, note and system communication activity.",
    dateField: "occurredAt",
    metrics: [
      { id: "communicationCount", label: "Communications", type: "number" },
      { id: "inboundCount", label: "Inbound", type: "number" },
      { id: "outboundCount", label: "Outbound", type: "number" },
      { id: "internalCount", label: "Internal", type: "number" },
      { id: "emailCount", label: "Emails", type: "number" },
      { id: "smsCount", label: "SMS", type: "number" },
      { id: "whatsappCount", label: "WhatsApp", type: "number" },
      { id: "phoneCount", label: "Phone", type: "number" },
      { id: "noteCount", label: "Notes", type: "number" },
      { id: "systemCount", label: "System", type: "number" },
      { id: "uniqueLeads", label: "Linked leads", type: "number" },
      { id: "linkedContacts", label: "Linked contacts", type: "number" },
      { id: "unlinkedContacts", label: "Without contact", type: "number" },
      { id: "inboundShare", label: "Inbound share", type: "percent" },
      { id: "outboundShare", label: "Outbound share", type: "percent" },
    ],
    dimensions: [
      { id: "day", label: "Day", type: "date" },
      { id: "week", label: "Week", type: "text" },
      { id: "month", label: "Month", type: "text" },
      { id: "channel", label: "Channel", type: "text" },
      { id: "direction", label: "Direction", type: "text" },
      { id: "owner", label: "User", type: "text" },
      { id: "opportunityOwner", label: "Lead owner", type: "text" },
      { id: "pipelineStage", label: "Pipeline stage", type: "text" },
      { id: "source", label: "Lead source", type: "text" },
      { id: "contactStatus", label: "Contact link", type: "text" },
      { id: "externalStatus", label: "External address", type: "text" },
    ],
    filters: [
      { id: "channel", label: "Channel" },
      { id: "direction", label: "Direction" },
      { id: "owner", label: "User" },
      { id: "opportunityOwner", label: "Lead owner" },
      { id: "pipelineStage", label: "Pipeline stage" },
      { id: "source", label: "Lead source" },
      { id: "contactStatus", label: "Contact link" },
      { id: "externalStatus", label: "External address" },
    ],
    defaultPlan: {
      dataset: "communications",
      metrics: ["communicationCount", "inboundCount", "outboundCount"],
      dimensions: ["channel"],
      filters: [],
      dateRange: { preset: "30d" },
      chartType: "donut",
      limit: 12,
      title: "Communication mix",
    },
  },
  {
    id: "discovery_answers",
    label: "Discovery answers",
    description:
      "Captured Discovery answers linked to sales opportunities, products, categories and pipeline value.",
    dateField: "answeredAt",
    metrics: [
      { id: "answerCount", label: "Answers", type: "number" },
      { id: "answeredLeads", label: "Answered leads", type: "number" },
      { id: "uniqueQuestions", label: "Unique questions", type: "number" },
      { id: "confirmedAnswers", label: "Confirmed answers", type: "number" },
      {
        id: "productScopedAnswers",
        label: "Product-scoped answers",
        type: "number",
      },
      {
        id: "categoryScopedAnswers",
        label: "Category-scoped answers",
        type: "number",
      },
      { id: "avgNumericAnswer", label: "Average numeric answer", type: "number" },
      { id: "linkedOpenPipeline", label: "Linked open pipeline", type: "currency" },
      { id: "linkedWonRevenue", label: "Linked won revenue", type: "currency" },
    ],
    dimensions: [
      { id: "question", label: "Question", type: "text" },
      { id: "answer", label: "Answer", type: "text" },
      { id: "answerType", label: "Answer type", type: "text" },
      { id: "answerSource", label: "Answer source", type: "text" },
      { id: "questionScope", label: "Question scope", type: "text" },
      { id: "product", label: "Product context", type: "text" },
      { id: "category", label: "Category context", type: "text" },
      { id: "source", label: "Lead source", type: "text" },
      { id: "owner", label: "Owner", type: "text" },
      { id: "pipelineStage", label: "Pipeline stage", type: "text" },
      { id: "stage", label: "Stage", type: "text" },
      { id: "month", label: "Month", type: "text" },
      { id: "week", label: "Week", type: "text" },
      { id: "day", label: "Day", type: "date" },
    ],
    filters: [
      { id: "question", label: "Question" },
      { id: "answer", label: "Answer" },
      { id: "answerType", label: "Answer type" },
      { id: "answerSource", label: "Answer source" },
      { id: "questionScope", label: "Question scope" },
      { id: "product", label: "Product context" },
      { id: "category", label: "Category context" },
      { id: "source", label: "Lead source" },
      { id: "owner", label: "Owner" },
      { id: "pipelineStage", label: "Pipeline stage" },
      { id: "stage", label: "Stage" },
    ],
    defaultPlan: {
      dataset: "discovery_answers",
      metrics: ["answerCount", "answeredLeads", "uniqueQuestions"],
      dimensions: ["question"],
      filters: [],
      dateRange: { preset: "all" },
      chartType: "bar",
      sort: { field: "answerCount", direction: "desc" },
      limit: 12,
      title: "Discovery answers by question",
    },
  },
  {
    id: "sales_lifecycle",
    label: "Sales lifecycle",
    description:
      "Contacted rate, response time, time-to-close, lost reasons and stage movement from sales lifecycle history.",
    dateField: "createdAt / occurredAt",
    metrics: [
      { id: "leadCount", label: "Leads", type: "number" },
      { id: "contactedLeads", label: "Contacted leads", type: "number" },
      { id: "contactedRate", label: "Contacted rate", type: "percent" },
      {
        id: "avgResponseMinutes",
        label: "Avg response minutes",
        type: "number",
      },
      {
        id: "avgTimeToCloseDays",
        label: "Avg time to close days",
        type: "number",
      },
      { id: "qualifiedLeads", label: "Qualified leads", type: "number" },
      { id: "proposalLeads", label: "Proposal leads", type: "number" },
      { id: "wonDeals", label: "Won deals", type: "number" },
      { id: "lostDeals", label: "Lost deals", type: "number" },
      { id: "lostReasonedDeals", label: "Lost with reason", type: "number" },
      { id: "lifecycleEvents", label: "Lifecycle events", type: "number" },
      { id: "stageChanges", label: "Stage changes", type: "number" },
      { id: "openPipeline", label: "Open pipeline", type: "currency" },
      { id: "weightedPipeline", label: "Weighted pipeline", type: "currency" },
      { id: "wonRevenue", label: "Won revenue", type: "currency" },
    ],
    dimensions: [
      { id: "source", label: "Lead source", type: "text" },
      { id: "owner", label: "Owner", type: "text" },
      { id: "stage", label: "Stage", type: "text" },
      { id: "pipelineStage", label: "Pipeline stage", type: "text" },
      { id: "contactStatus", label: "Contact status", type: "text" },
      { id: "closeStatus", label: "Close status", type: "text" },
      { id: "lostReason", label: "Lost reason", type: "text" },
      { id: "eventType", label: "Lifecycle event type", type: "text" },
      { id: "fromStage", label: "From stage", type: "text" },
      { id: "toStage", label: "To stage", type: "text" },
      { id: "transition", label: "Transition", type: "text" },
      { id: "eventUser", label: "Event user", type: "text" },
      { id: "month", label: "Month", type: "text" },
      { id: "week", label: "Week", type: "text" },
      { id: "day", label: "Day", type: "date" },
    ],
    filters: [
      { id: "source", label: "Lead source" },
      { id: "owner", label: "Owner" },
      { id: "stage", label: "Stage" },
      { id: "pipelineStage", label: "Pipeline stage" },
      { id: "contactStatus", label: "Contact status" },
      { id: "closeStatus", label: "Close status" },
      { id: "lostReason", label: "Lost reason" },
      { id: "eventType", label: "Lifecycle event type" },
      { id: "fromStage", label: "From stage" },
      { id: "toStage", label: "To stage" },
      { id: "transition", label: "Transition" },
      { id: "eventUser", label: "Event user" },
    ],
    defaultPlan: {
      dataset: "sales_lifecycle",
      metrics: ["contactedRate", "avgResponseMinutes", "leadCount"],
      dimensions: ["owner"],
      filters: [],
      dateRange: { preset: "90d" },
      chartType: "bar",
      sort: { field: "contactedRate", direction: "desc" },
      limit: 12,
      title: "Sales lifecycle quality by owner",
    },
  },
  {
    id: "setup_readiness",
    label: "Setup readiness",
    description:
      "Client setup and handover readiness from the shared Setup checklist.",
    dateField: "current",
    metrics: [
      { id: "itemCount", label: "Items", type: "number" },
      { id: "readyItems", label: "Ready", type: "number" },
      { id: "neededItems", label: "Needed", type: "number" },
      { id: "warningItems", label: "Warnings", type: "number" },
      { id: "plannedItems", label: "Planned", type: "number" },
      { id: "completionPercent", label: "Completion", type: "percent" },
    ],
    dimensions: [
      { id: "group", label: "Setup group", type: "text" },
      { id: "status", label: "Status", type: "text" },
      { id: "item", label: "Item", type: "text" },
      { id: "action", label: "Action", type: "text" },
      { id: "href", label: "Target route", type: "text" },
    ],
    filters: [
      { id: "group", label: "Setup group" },
      { id: "status", label: "Status" },
      { id: "item", label: "Item" },
      { id: "action", label: "Action" },
      { id: "href", label: "Target route" },
    ],
    defaultPlan: {
      dataset: "setup_readiness",
      metrics: ["itemCount", "neededItems", "warningItems"],
      dimensions: ["group"],
      filters: [],
      dateRange: { preset: "all" },
      chartType: "bar",
      sort: { field: "neededItems", direction: "desc" },
      limit: 12,
      title: "Setup readiness by group",
    },
  },
  {
    id: "contacts_clients",
    label: "Contacts and clients",
    description:
      "Contact and client activity, open opportunities, form origins and paid-ad origins.",
    dateField: "createdAt",
    metrics: [
      { id: "contactCount", label: "Contacts", type: "number" },
      { id: "companyCount", label: "Companies", type: "number" },
      { id: "opportunities", label: "Opportunities", type: "number" },
      { id: "openOpportunities", label: "Open opportunities", type: "number" },
      { id: "wonOpportunities", label: "Won opportunities", type: "number" },
      { id: "recentActivities", label: "Recent activities", type: "number" },
      { id: "noRecentContact", label: "No recent contact", type: "number" },
      {
        id: "avgDaysSinceLastContact",
        label: "Avg days since contact",
        type: "number",
      },
      { id: "formSubmissions", label: "Form submissions", type: "number" },
      { id: "paidAdContacts", label: "Paid-ad contacts", type: "number" },
    ],
    dimensions: [
      { id: "contact", label: "Contact", type: "text" },
      { id: "company", label: "Company", type: "text" },
      { id: "owner", label: "Owner", type: "text" },
      { id: "source", label: "Lead source", type: "text" },
      { id: "formStatus", label: "Form status", type: "text" },
      { id: "paidStatus", label: "Paid status", type: "text" },
      { id: "openOpportunityStatus", label: "Open opportunity", type: "text" },
      { id: "contactStatus", label: "Contact recency", type: "text" },
      { id: "activityStatus", label: "Activity recency", type: "text" },
      { id: "month", label: "Month", type: "text" },
      { id: "week", label: "Week", type: "text" },
      { id: "day", label: "Day", type: "date" },
    ],
    filters: [
      { id: "contact", label: "Contact" },
      { id: "company", label: "Company" },
      { id: "owner", label: "Owner" },
      { id: "source", label: "Lead source" },
      { id: "formStatus", label: "Form status" },
      { id: "paidStatus", label: "Paid status" },
      { id: "openOpportunityStatus", label: "Open opportunity" },
      { id: "contactStatus", label: "Contact recency" },
      { id: "activityStatus", label: "Activity recency" },
    ],
    defaultPlan: {
      dataset: "contacts_clients",
      metrics: ["contactCount", "openOpportunities", "recentActivities"],
      dimensions: ["company"],
      filters: [],
      dateRange: { preset: "all" },
      chartType: "bar",
      sort: { field: "recentActivities", direction: "desc" },
      limit: 12,
      title: "Client activity by company",
    },
  },
  {
    id: "users_security",
    label: "Users and security",
    description:
      "User access posture, two-factor adoption, setup links and session recency.",
    dateField: "createdAt",
    metrics: [
      { id: "userCount", label: "Users", type: "number" },
      { id: "activeUsers", label: "Active users", type: "number" },
      { id: "suspendedUsers", label: "Suspended users", type: "number" },
      { id: "adminUsers", label: "Admins", type: "number" },
      { id: "twoFactorEnabled", label: "2FA enabled", type: "number" },
      { id: "twoFactorMissing", label: "2FA missing", type: "number" },
      { id: "activeSessions", label: "Active sessions", type: "number" },
      { id: "expiredSessions", label: "Expired sessions", type: "number" },
      { id: "pendingSetupLinks", label: "Pending setup links", type: "number" },
      { id: "inactiveUsers", label: "Inactive users", type: "number" },
    ],
    dimensions: [
      { id: "user", label: "User", type: "text" },
      { id: "role", label: "Role", type: "text" },
      { id: "roleTemplate", label: "Role template", type: "text" },
      { id: "status", label: "Status", type: "text" },
      { id: "twoFactorStatus", label: "2FA status", type: "text" },
      { id: "adminTwoFactorStatus", label: "Admin 2FA status", type: "text" },
      { id: "sessionStatus", label: "Session status", type: "text" },
      { id: "inviteStatus", label: "Setup link status", type: "text" },
      { id: "activityStatus", label: "Login recency", type: "text" },
      { id: "month", label: "Month", type: "text" },
      { id: "week", label: "Week", type: "text" },
      { id: "day", label: "Day", type: "date" },
    ],
    filters: [
      { id: "user", label: "User" },
      { id: "role", label: "Role" },
      { id: "roleTemplate", label: "Role template" },
      { id: "status", label: "Status" },
      { id: "twoFactorStatus", label: "2FA status" },
      { id: "adminTwoFactorStatus", label: "Admin 2FA status" },
      { id: "sessionStatus", label: "Session status" },
      { id: "inviteStatus", label: "Setup link status" },
      { id: "activityStatus", label: "Login recency" },
    ],
    defaultPlan: {
      dataset: "users_security",
      metrics: ["userCount", "twoFactorMissing", "activeSessions"],
      dimensions: ["role"],
      filters: [],
      dateRange: { preset: "all" },
      chartType: "bar",
      sort: { field: "userCount", direction: "desc" },
      limit: 12,
      title: "User security by role",
    },
  },
  {
    id: "storage_assets",
    label: "Storage assets",
    description:
      "File storage usage, largest files, uploader ownership and linked-record coverage.",
    dateField: "createdAt",
    metrics: [
      { id: "totalSizeMb", label: "Total size MB", type: "number" },
      { id: "fileCount", label: "Files", type: "number" },
      { id: "avgSizeMb", label: "Avg size MB", type: "number" },
      { id: "largestSizeMb", label: "Largest size MB", type: "number" },
      { id: "latestUploadAgeDays", label: "Latest upload age days", type: "number" },
      { id: "privateFiles", label: "Private files", type: "number" },
      { id: "publicFiles", label: "Public files", type: "number" },
      { id: "linkedFiles", label: "Linked files", type: "number" },
      { id: "unlinkedFiles", label: "Unlinked files", type: "number" },
      { id: "unownedFiles", label: "No uploader", type: "number" },
    ],
    dimensions: [
      { id: "file", label: "File", type: "text" },
      { id: "uploader", label: "Uploader", type: "text" },
      { id: "ownerStatus", label: "Uploader status", type: "text" },
      { id: "entityType", label: "Linked record type", type: "text" },
      { id: "linkStatus", label: "Link status", type: "text" },
      { id: "visibility", label: "Visibility", type: "text" },
      { id: "mimeType", label: "MIME type", type: "text" },
      { id: "provider", label: "Storage provider", type: "text" },
      { id: "month", label: "Month", type: "text" },
      { id: "week", label: "Week", type: "text" },
      { id: "day", label: "Day", type: "date" },
    ],
    filters: [
      { id: "file", label: "File" },
      { id: "uploader", label: "Uploader" },
      { id: "ownerStatus", label: "Uploader status" },
      { id: "entityType", label: "Linked record type" },
      { id: "linkStatus", label: "Link status" },
      { id: "visibility", label: "Visibility" },
      { id: "mimeType", label: "MIME type" },
      { id: "provider", label: "Storage provider" },
    ],
    defaultPlan: {
      dataset: "storage_assets",
      metrics: ["totalSizeMb", "fileCount", "unlinkedFiles"],
      dimensions: ["entityType"],
      filters: [],
      dateRange: { preset: "all" },
      chartType: "bar",
      sort: { field: "totalSizeMb", direction: "desc" },
      limit: 12,
      title: "Storage usage by linked record type",
    },
  },
];

export const defaultReportPlans = [
  reportDatasets[0].defaultPlan,
  {
    ...reportDatasets[0].defaultPlan,
    title: "Won revenue by month",
    dimensions: ["month"],
    metrics: ["wonRevenue"],
    chartType: "line" as const,
  },
  {
    ...reportDatasets[0].defaultPlan,
    title: "Service performance",
    dimensions: ["service"],
    metrics: ["leadCount", "wonRevenue", "winRate"],
    chartType: "bar" as const,
  },
  reportDatasets[1].defaultPlan,
  reportDatasets[2].defaultPlan,
  reportDatasets[3].defaultPlan,
  reportDatasets[4].defaultPlan,
  reportDatasets[5].defaultPlan,
  reportDatasets[6].defaultPlan,
  reportDatasets[7].defaultPlan,
  reportDatasets[8].defaultPlan,
  reportDatasets[9].defaultPlan,
  reportDatasets[10].defaultPlan,
  reportDatasets[11].defaultPlan,
  reportDatasets[12].defaultPlan,
];

function datasetFor(id: string) {
  return (
    reportDatasets.find((dataset) => dataset.id === id) ?? reportDatasets[0]
  );
}

export function sanitiseReportPlan(input: unknown): ReportPlan {
  const raw = objectValue(input);
  const dataset = datasetFor(stringValue(raw.dataset) ?? "sales_opportunities");
  const allowedMetricIds = new Set(dataset.metrics.map((metric) => metric.id));
  const allowedDimensionIds = new Set(
    dataset.dimensions.map((dimension) => dimension.id),
  );
  const allowedFilterIds = new Set(dataset.filters.map((filter) => filter.id));
  const metrics = (Array.isArray(raw.metrics) ? raw.metrics : [])
    .map(stringValue)
    .filter((value): value is string =>
      Boolean(value && allowedMetricIds.has(value)),
    )
    .slice(0, 4);
  const dimensions = (Array.isArray(raw.dimensions) ? raw.dimensions : [])
    .map(stringValue)
    .filter((value): value is string =>
      Boolean(value && allowedDimensionIds.has(value)),
    )
    .slice(0, 2);
  const chartType = stringValue(raw.chartType);
  const dateRange = objectValue(raw.dateRange);
  const preset = stringValue(dateRange.preset);

  const filters = (Array.isArray(raw.filters) ? raw.filters : [])
    .map((item) => {
      const filter = objectValue(item);
      const field = stringValue(filter.field);
      const operator = stringValue(filter.operator);
      const value = stringValue(filter.value);
      if (!field || !allowedFilterIds.has(field) || !value) return null;
      const safeOperator: ReportFilter["operator"] =
        operator === "equals" ||
        operator === "not_equals" ||
        operator === "contains"
          ? operator
          : "contains";
      return {
        field,
        operator: safeOperator,
        value,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 4);
  const sort = objectValue(raw.sort);
  const sortField = stringValue(sort.field);
  const sortDirection = stringValue(sort.direction);
  const safeSort =
    sortField &&
    (allowedMetricIds.has(sortField) || allowedDimensionIds.has(sortField))
      ? {
          field: sortField,
          direction:
            sortDirection === "asc" ? ("asc" as const) : ("desc" as const),
        }
      : null;

  return {
    dataset: dataset.id,
    metrics: metrics.length ? metrics : dataset.defaultPlan.metrics,
    dimensions: dimensions.length ? dimensions : dataset.defaultPlan.dimensions,
    filters,
    dateRange: {
      preset:
        preset === "7d" ||
        preset === "30d" ||
        preset === "90d" ||
        preset === "180d" ||
        preset === "365d" ||
        preset === "all" ||
        preset === "custom"
          ? preset
          : dataset.defaultPlan.dateRange.preset,
      from: stringValue(dateRange.from),
      to: stringValue(dateRange.to),
    },
    chartType:
      chartType === "table" ||
      chartType === "bar" ||
      chartType === "line" ||
      chartType === "area" ||
      chartType === "stacked_bar" ||
      chartType === "donut" ||
      chartType === "kpi" ||
      chartType === "funnel"
        ? chartType
        : dataset.defaultPlan.chartType,
    sort: safeSort,
    limit: Math.min(Math.max(Number(raw.limit) || 12, 1), 100),
    title: stringValue(raw.title) ?? dataset.defaultPlan.title,
  };
}

function columnFor(dataset: ReportDatasetSchema, field: string): ReportColumn {
  const definition =
    dataset.metrics.find((metric) => metric.id === field) ??
    dataset.dimensions.find((dimension) => dimension.id === field);
  return {
    field,
    label: definition?.label ?? field,
    type: definition?.type ?? "text",
  };
}

function filterSummary(plan: ReportPlan) {
  if (!plan.filters.length) return "";

  const filters = plan.filters
    .map((filter) => `${filter.field} ${filter.operator} ${String(filter.value)}`)
    .join(", ");

  return ` Active filters: ${filters}.`;
}

export function reportEmptyStateMessage(datasetId: string, plan: ReportPlan) {
  const guidance: Record<string, string> = {
    calls:
      "No calls matched. Check call tracking, Twilio webhooks, queue/recording status, ownership permissions and the selected date range.",
    communications:
      "No communications matched. Check email/SMS/WhatsApp/call logging, linked lead/contact coverage, channel or direction filters and the selected date range.",
    contacts_clients:
      "No contacts or clients matched. Check contact records, linked opportunities, recent activity, form/paid-ad attribution and the selected filters.",
    discovery_answers:
      "No Discovery answers matched. Check that Discovery questions have been answered on leads and that question, owner, stage or product filters are not too narrow.",
    form_submissions:
      "No form submissions matched. Check website form tracking, attribution domain approval, consent settings, submitted-field capture and the selected date range.",
    marketing_attribution:
      "No attribution touchpoints matched. Check the tracking script, approved domains, UTM/provider data, platform filters and the selected date range.",
    opportunity_products:
      "No product demand rows matched. Check product selections on leads, product/category setup, product status filters and the selected date range.",
    sales_lifecycle:
      "No lifecycle rows matched. Check sales stage history, first-contact timestamps, lost reasons, owner/source filters and the selected date range.",
    sales_opportunities:
      "No sales opportunities matched. Check lead creation, ownership, source/stage filters and the selected date range.",
    setup_readiness:
      "No setup readiness rows matched. Check whether setup is already complete or whether status/item filters are too narrow.",
    storage_assets:
      "No storage assets matched. Check R2 uploads, linked-record coverage, visibility/uploader filters and the selected date range.",
    tasks:
      "No tasks matched. Check task due dates, assignees, statuses, linked records and the selected date range.",
    users_security:
      "No user security rows matched. Check user accounts, active/suspended status, setup links, 2FA filters and permissions.",
  };

  return `${guidance[datasetId] ?? "No rows matched this report. Check the selected filters and date range."}${filterSummary(plan)}`;
}

function groupKey(parts: Array<string | number | null>) {
  return parts.map((part) => String(part ?? "None")).join("||");
}

function matchesTextFilters(row: Row, plan: ReportPlan) {
  return plan.filters.every((filter) => {
    const value = String(row[filter.field] ?? "").toLowerCase();
    if (filter.operator === "contains") {
      return value.includes(String(filter.value).toLowerCase());
    }
    if (filter.operator === "equals") {
      return value === String(filter.value).toLowerCase();
    }
    if (filter.operator === "not_equals") {
      return value !== String(filter.value).toLowerCase();
    }
    if (filter.operator === "in" && Array.isArray(filter.value)) {
      return filter.value.map((item) => item.toLowerCase()).includes(value);
    }
    return true;
  });
}

async function salesRows(
  user: ReportUser,
  plan: ReportPlan,
  timezone: string,
) {
  const range = rangeFromPlan(plan);
  const where: Prisma.SalesOpportunityWhereInput = {
    ...(user.role === "ADMIN" ? {} : { ownerId: user.id }),
    ...(range ? { createdAt: { gte: range.from, lte: range.to } } : {}),
  };
  const records = await prisma.salesOpportunity.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: maxRows,
    select: {
      createdAt: true,
      expectedCloseDate: true,
      leadScope: true,
      owner: { select: { name: true } },
      probability: true,
      salesPipelineStage: { select: { name: true } },
      source: true,
      stage: true,
      stageChangedAt: true,
      title: true,
      valueCents: true,
    },
  });
  const now = Date.now();
  const groups = new Map<string, { dims: Row; items: typeof records }>();

  for (const record of records) {
    const dims: Row = {
      day: dayKey(record.createdAt, timezone),
      weekday: weekdayKey(record.createdAt, timezone),
      hour: hourKey(record.createdAt, timezone),
      month: monthKey(record.createdAt, timezone),
      week: weekKey(record.createdAt, timezone),
      stage: record.stage,
      isOpen:
        record.stage !== "WON" && record.stage !== "LOST" ? "Open" : "Closed",
      pipelineStage: record.salesPipelineStage?.name ?? record.stage,
      source: normaliseSource(record.source),
      owner: record.owner?.name ?? "Unassigned",
      service: serviceFocus(record.leadScope, record.title, record.source),
    };
    if (!matchesTextFilters(dims, plan)) continue;
    const selectedDims = Object.fromEntries(
      plan.dimensions.map((dimension) => [
        dimension,
        dims[dimension] ?? "None",
      ]),
    ) as Row;
    const key = groupKey(
      plan.dimensions.map((dimension) => selectedDims[dimension]),
    );
    const group = groups.get(key) ?? { dims: selectedDims, items: [] };
    group.items.push(record);
    groups.set(key, group);
  }

  return Array.from(groups.values()).map((group) => {
    const leadCount = group.items.length;
    const won = group.items.filter((item) => item.stage === "WON");
    const open = group.items.filter(
      (item) => item.stage !== "WON" && item.stage !== "LOST",
    );
    const stale = open.filter(
      (item) => now - item.stageChangedAt.getTime() > 14 * 86400000,
    );
    const row: Row = { ...group.dims };
    row.leadCount = leadCount;
    row.openPipeline = money(
      open.reduce((total, item) => total + item.valueCents, 0),
    );
    row.weightedPipeline = money(
      open.reduce(
        (total, item) =>
          total + Math.round((item.valueCents * item.probability) / 100),
        0,
      ),
    );
    row.wonRevenue = money(
      won.reduce((total, item) => total + item.valueCents, 0),
    );
    row.winRate = percent(won.length, leadCount);
    row.avgDealValue = money(
      leadCount
        ? Math.round(
            group.items.reduce((total, item) => total + item.valueCents, 0) /
              leadCount,
          )
        : 0,
    );
    row.staleLeads = stale.length;
    row.proposalCount = group.items.filter(
      (item) => item.stage === "PROPOSAL",
    ).length;
    return row;
  });
}

async function productRows(
  user: ReportUser,
  plan: ReportPlan,
  timezone: string,
) {
  const range = rangeFromPlan(plan);
  const opportunityWhere: Prisma.SalesOpportunityWhereInput = {
    ...(user.role === "ADMIN" ? {} : { ownerId: user.id }),
    ...(range ? { createdAt: { gte: range.from, lte: range.to } } : {}),
  };
  const where: Prisma.OpportunityProductWhereInput = Object.keys(
    opportunityWhere,
  ).length
    ? { opportunity: opportunityWhere }
    : {};
  const records = await prisma.opportunityProduct.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: maxRows,
    select: {
      confidence: true,
      estimatedValueCents: true,
      opportunityId: true,
      quantity: true,
      status: true,
      product: {
        select: {
          name: true,
          type: true,
          category: { select: { name: true } },
        },
      },
      opportunity: {
        select: {
          createdAt: true,
          owner: { select: { name: true } },
          probability: true,
          salesPipelineStage: { select: { name: true } },
          source: true,
          stage: true,
          valueCents: true,
        },
      },
    },
  });
  const groups = new Map<string, { dims: Row; items: typeof records }>();

  for (const record of records) {
    const dims: Row = {
      day: dayKey(record.opportunity.createdAt, timezone),
      week: weekKey(record.opportunity.createdAt, timezone),
      month: monthKey(record.opportunity.createdAt, timezone),
      product: record.product.name,
      category: record.product.category?.name ?? "Uncategorised",
      productType: enumLabel(record.product.type),
      productStatus: enumLabel(record.status),
      source: normaliseSource(record.opportunity.source),
      owner: record.opportunity.owner?.name ?? "Unassigned",
      pipelineStage:
        record.opportunity.salesPipelineStage?.name ?? record.opportunity.stage,
      stage: record.opportunity.stage,
    };
    if (!matchesTextFilters(dims, plan)) continue;
    const selectedDims = Object.fromEntries(
      plan.dimensions.map((dimension) => [
        dimension,
        dims[dimension] ?? "None",
      ]),
    ) as Row;
    const key = groupKey(
      plan.dimensions.map((dimension) => selectedDims[dimension]),
    );
    const group = groups.get(key) ?? { dims: selectedDims, items: [] };
    group.items.push(record);
    groups.set(key, group);
  }

  return Array.from(groups.values()).map((group) => {
    const opportunities = Array.from(
      new Map(
        group.items.map((item) => [item.opportunityId, item.opportunity]),
      ).values(),
    );
    const open = opportunities.filter(
      (item) => item.stage !== "WON" && item.stage !== "LOST",
    );
    const won = opportunities.filter((item) => item.stage === "WON");
    const confidenceValues = group.items
      .map((item) => item.confidence)
      .filter((value): value is number => typeof value === "number");
    const row: Row = { ...group.dims };

    row.productLeadCount = opportunities.length;
    row.productSelections = group.items.length;
    row.confirmedSelections = group.items.filter(
      (item) => item.status === "CONFIRMED" || item.status === "QUOTED",
    ).length;
    row.quantity = group.items.reduce(
      (total, item) => total + Math.max(item.quantity ?? 0, 0),
      0,
    );
    row.estimatedValue = money(
      group.items.reduce(
        (total, item) => total + (item.estimatedValueCents ?? 0),
        0,
      ),
    );
    row.linkedOpenPipeline = money(
      open.reduce((total, item) => total + item.valueCents, 0),
    );
    row.linkedWeightedPipeline = money(
      open.reduce(
        (total, item) =>
          total + Math.round((item.valueCents * item.probability) / 100),
        0,
      ),
    );
    row.linkedWonRevenue = money(
      won.reduce((total, item) => total + item.valueCents, 0),
    );
    row.avgConfidence = confidenceValues.length
      ? Math.round(
          confidenceValues.reduce((total, value) => total + value, 0) /
            confidenceValues.length,
        )
      : 0;

    return row;
  });
}

function numberFromUnknown(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const parsed = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function costCentsFromMetadata(value: unknown) {
  const metadata = objectValue(value);
  const cents =
    numberFromUnknown(metadata.costCents) ??
    numberFromUnknown(metadata.spendCents) ??
    numberFromUnknown(metadata.amountCents);

  if (cents !== null) return Math.max(0, Math.round(cents));

  const micros =
    numberFromUnknown(metadata.costMicros) ??
    numberFromUnknown(metadata.spendMicros);

  if (micros !== null) return Math.max(0, Math.round(micros / 10_000));

  const major =
    numberFromUnknown(metadata.cost) ??
    numberFromUnknown(metadata.spend) ??
    numberFromUnknown(metadata.amount);

  return major === null ? 0 : Math.max(0, Math.round(major * 100));
}

function marketingPlatformLabel(input: {
  campaign: string | null;
  content: string | null;
  medium: string | null;
  metadata: unknown;
  source: string | null;
  term: string | null;
}) {
  const metadata = objectValue(input.metadata);
  const explicit =
    stringValue(metadata.platform) ??
    stringValue(metadata.provider) ??
    stringValue(metadata.adProvider) ??
    stringValue(metadata.network);
  const text = [
    explicit,
    input.source,
    input.medium,
    input.campaign,
    input.content,
    input.term,
    stringValue(metadata.clickIdType),
    stringValue(metadata.channel),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\bgoogle ads|adwords|gclid|gbraid|wbraid\b/.test(text)) {
    return "Google Ads";
  }
  if (/\bbing|microsoft ads|msclkid\b/.test(text)) return "Microsoft Ads";
  if (/\blinkedin|li_fat_id\b/.test(text)) return "LinkedIn Ads";
  if (/\bmeta|facebook|instagram|fbclid\b/.test(text)) return "Meta Ads";
  if (/\bklaviyo\b/.test(text)) return "Klaviyo";
  if (/\bsearch console\b/.test(text)) return "Google Search Console";
  if (
    /\borganic|seo\b/.test(text) ||
    input.medium?.toLowerCase() === "organic"
  ) {
    return "Organic search";
  }
  if (explicit) return enumLabel(explicit);

  return normaliseSource(input.source);
}

async function attributionRows(
  user: ReportUser,
  plan: ReportPlan,
  timezone: string,
) {
  if (user.role !== "ADMIN") return [];

  const range = rangeFromPlan(plan);
  const where: Prisma.AttributionTouchpointWhereInput = range
    ? {
        OR: [
          { capturedAt: { gte: range.from, lte: range.to } },
          {
            capturedAt: null,
            createdAt: { gte: range.from, lte: range.to },
          },
        ],
      }
    : {};
  const records = await prisma.attributionTouchpoint.findMany({
    where,
    orderBy: [{ capturedAt: "desc" }, { createdAt: "desc" }],
    take: maxRows,
    select: {
      attributionRecordId: true,
      campaign: true,
      capturedAt: true,
      content: true,
      createdAt: true,
      landingPage: true,
      medium: true,
      metadata: true,
      referrer: true,
      role: true,
      sessionId: true,
      source: true,
      term: true,
      visitorId: true,
      attributionRecord: { select: { source: true } },
      offlineCampaign: { select: { name: true } },
    },
  });
  const groups = new Map<string, { dims: Row; items: typeof records }>();

  for (const record of records) {
    const occurredAt = record.capturedAt ?? record.createdAt;
    const dims: Row = {
      campaign: groupText(record.campaign, "No campaign"),
      content: groupText(record.content, "No content"),
      conversionType: record.attributionRecord?.source
        ? enumLabel(record.attributionRecord.source)
        : "Visitor only",
      day: dayKey(occurredAt, timezone),
      landingPage: groupText(record.landingPage, "Unknown landing page"),
      medium: groupText(record.medium, "Unknown medium"),
      month: monthKey(occurredAt, timezone),
      offlineCampaign: groupText(record.offlineCampaign?.name, "None"),
      platform: marketingPlatformLabel(record),
      referrer: groupText(record.referrer, "Direct / none"),
      role: enumLabel(record.role),
      source: normaliseSource(record.source),
      term: groupText(record.term, "No search term"),
      week: weekKey(occurredAt, timezone),
    };
    if (!matchesTextFilters(dims, plan)) continue;
    const selectedDims = Object.fromEntries(
      plan.dimensions.map((dimension) => [
        dimension,
        dims[dimension] ?? "None",
      ]),
    ) as Row;
    const key = groupKey(
      plan.dimensions.map((dimension) => selectedDims[dimension]),
    );
    const group = groups.get(key) ?? { dims: selectedDims, items: [] };
    group.items.push(record);
    groups.set(key, group);
  }

  return Array.from(groups.values()).map((group) => {
    const visitors = new Set(
      group.items.map((item) => item.visitorId).filter(Boolean),
    );
    const sessions = new Set(
      group.items
        .map((item) =>
          item.visitorId && item.sessionId
            ? `${item.visitorId}:${item.sessionId}`
            : item.sessionId,
        )
        .filter(Boolean),
    );
    const conversions = new Set(
      group.items.map((item) => item.attributionRecordId).filter(Boolean),
    );
    const formLeads = new Set(
      group.items
        .filter((item) => item.attributionRecord?.source === "FORM")
        .map((item) => item.attributionRecordId)
        .filter(Boolean),
    );
    const phoneLeads = new Set(
      group.items
        .filter((item) => item.attributionRecord?.source === "PHONE")
        .map((item) => item.attributionRecordId)
        .filter(Boolean),
    );
    const visitorCount = visitors.size || sessions.size;
    const row: Row = { ...group.dims };

    row.touchpoints = group.items.length;
    row.visitors = visitors.size;
    row.sessions = sessions.size;
    row.conversions = conversions.size;
    row.formLeads = formLeads.size;
    row.phoneLeads = phoneLeads.size;
    row.firstTouchpoints = group.items.filter(
      (item) => item.role === "FIRST" || item.role === "FIRST_LAST",
    ).length;
    row.assistedTouchpoints = group.items.filter(
      (item) => item.role === "ASSISTED",
    ).length;
    row.lastTouchpoints = group.items.filter(
      (item) => item.role === "LAST" || item.role === "FIRST_LAST",
    ).length;
    row.conversionRate = percent(conversions.size, visitorCount);
    const costCents = group.items.reduce(
      (total, item) => total + costCentsFromMetadata(item.metadata),
      0,
    );
    row.cost = money(costCents);
    row.costPerConversion = conversions.size
      ? money(Math.round(costCents / conversions.size))
      : 0;

    return row;
  });
}

type FormReportField = {
  label: string;
  name: string | null;
  type: string | null;
  value: string;
};

type FormReportItem = {
  contactId: string | null;
  dims: Row;
  fieldCount: number;
  id: string;
  isMessageField: boolean;
  missingEmail: boolean;
  missingPhone: boolean;
  opportunityId: string | null;
  visitorKey: string | null;
};

function touchParam(touch: unknown, key: string) {
  const params = objectValue(objectValue(touch).params);
  return stringValue(params[key]);
}

function sourceFromAttributionRecord(record: {
  firstTouch: unknown;
  lastTouch: unknown;
  metadata: unknown;
}) {
  const sourceDecision = objectValue(objectValue(record.metadata).sourceDecision);
  return (
    stringValue(sourceDecision.source) ??
    touchParam(record.lastTouch, "utm_source") ??
    touchParam(record.firstTouch, "utm_source")
  );
}

function campaignFromAttributionRecord(record: {
  firstTouch: unknown;
  lastTouch: unknown;
}) {
  return (
    touchParam(record.lastTouch, "utm_campaign") ??
    touchParam(record.firstTouch, "utm_campaign")
  );
}

function submittedFormFields(metadata: unknown): FormReportField[] {
  return arrayValue(objectValue(metadata).formFields)
    .map((item) => {
      const field = objectValue(item);
      const label = stringValue(field.label);
      const value = stringValue(field.value);

      if (!label || !value) return null;

      return {
        label: groupText(label, "Field"),
        name: stringValue(field.name),
        type: stringValue(field.type),
        value,
      };
    })
    .filter((field): field is FormReportField => Boolean(field));
}

function formFieldLooksLike(field: FormReportField, pattern: RegExp) {
  const text = `${field.name ?? ""} ${field.label} ${field.type ?? ""}`;
  return pattern.test(text);
}

function formHasEmail(fields: FormReportField[]) {
  return fields.some(
    (field) =>
      formFieldLooksLike(field, /\be-?mail\b/i) ||
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value),
  );
}

function formHasPhone(fields: FormReportField[]) {
  return fields.some(
    (field) =>
      formFieldLooksLike(field, /\b(phone|telephone|tel|mobile)\b/i) &&
      field.value.replace(/\D+/g, "").length >= 6,
  );
}

function formFieldType(field: FormReportField) {
  if (formFieldLooksLike(field, /\be-?mail\b/i)) return "Email";
  if (formFieldLooksLike(field, /\b(phone|telephone|tel|mobile)\b/i)) {
    return "Phone";
  }
  if (formFieldLooksLike(field, /\b(message|enquiry|inquiry|comment|detail)s?\b/i)) {
    return "Message";
  }
  if (field.type) return enumLabel(field.type);
  return "Other";
}

function formLabel(metadata: unknown, currentPage: string | null, landingPage: string | null) {
  const rawPayload = objectValue(objectValue(metadata).rawPayload);
  const form = rawPayload.form;
  const formRecord = objectValue(form);

  return groupText(
    stringValue(form) ??
      stringValue(formRecord.name) ??
      stringValue(formRecord.title) ??
      stringValue(formRecord.id) ??
      currentPage ??
      landingPage,
    "Unknown form",
  );
}

async function formSubmissionRows(
  user: ReportUser,
  plan: ReportPlan,
  timezone: string,
) {
  if (user.role !== "ADMIN") return [];

  const range = rangeFromPlan(plan);
  const where: Prisma.AttributionRecordWhereInput = {
    source: "FORM",
    ...(range ? { createdAt: { gte: range.from, lte: range.to } } : {}),
  };
  const records = await prisma.attributionRecord.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: maxRows,
    select: {
      contactId: true,
      createdAt: true,
      currentPage: true,
      firstTouch: true,
      id: true,
      landingPage: true,
      lastTouch: true,
      metadata: true,
      opportunityId: true,
      sessionId: true,
      visitorId: true,
    },
  });
  const splitFields =
    plan.dimensions.includes("field") || plan.dimensions.includes("fieldType");
  const groups = new Map<string, { dims: Row; items: FormReportItem[] }>();

  for (const record of records) {
    const fields = submittedFormFields(record.metadata);
    const hasEmail = formHasEmail(fields);
    const hasPhone = formHasPhone(fields);
    const missingEmail = !hasEmail;
    const missingPhone = !hasPhone;
    const missingStatus =
      missingEmail && missingPhone
        ? "Missing email and phone"
        : missingEmail
          ? "Missing email"
          : missingPhone
            ? "Missing phone"
            : "Complete";
    const baseDims: Row = {
      campaign: groupText(campaignFromAttributionRecord(record), "No campaign"),
      currentPage: groupText(record.currentPage, "Unknown page"),
      day: dayKey(record.createdAt, timezone),
      field: "All fields",
      fieldType: "All fields",
      form: formLabel(record.metadata, record.currentPage, record.landingPage),
      landingPage: groupText(record.landingPage, "Unknown landing page"),
      missingStatus,
      month: monthKey(record.createdAt, timezone),
      source: normaliseSource(sourceFromAttributionRecord(record)),
      week: weekKey(record.createdAt, timezone),
    };
    const fieldDimensions = splitFields && fields.length ? fields : [null];

    for (const field of fieldDimensions) {
      const dims: Row = field
        ? {
            ...baseDims,
            field: field.label,
            fieldType: formFieldType(field),
          }
        : baseDims;
      if (!matchesTextFilters(dims, plan)) continue;

      const selectedDims = Object.fromEntries(
        plan.dimensions.map((dimension) => [
          dimension,
          dims[dimension] ?? "None",
        ]),
      ) as Row;
      const key = groupKey(
        plan.dimensions.map((dimension) => selectedDims[dimension]),
      );
      const group = groups.get(key) ?? { dims: selectedDims, items: [] };
      group.items.push({
        contactId: record.contactId,
        dims,
        fieldCount: field ? 1 : fields.length,
        id: record.id,
        isMessageField: field
          ? formFieldType(field) === "Message"
          : fields.some((item) => formFieldType(item) === "Message"),
        missingEmail,
        missingPhone,
        opportunityId: record.opportunityId,
        visitorKey:
          record.visitorId && record.sessionId
            ? `${record.visitorId}:${record.sessionId}`
            : record.visitorId ?? record.sessionId,
      });
      groups.set(key, group);
    }
  }

  return Array.from(groups.values()).map((group) => {
    const submissions = new Map(group.items.map((item) => [item.id, item]));
    const submissionItems = Array.from(submissions.values());
    const row: Row = { ...group.dims };

    row.submissionCount = submissions.size;
    row.fieldCount = group.items.reduce((total, item) => total + item.fieldCount, 0);
    row.avgFields = average(submissionItems.map((item) => item.fieldCount));
    row.linkedOpportunities = new Set(
      submissionItems.map((item) => item.opportunityId).filter(Boolean),
    ).size;
    row.linkedContacts = new Set(
      submissionItems.map((item) => item.contactId).filter(Boolean),
    ).size;
    row.uniqueVisitors = new Set(
      submissionItems.map((item) => item.visitorKey).filter(Boolean),
    ).size;
    row.missingEmail = submissionItems.filter((item) => item.missingEmail).length;
    row.missingPhone = submissionItems.filter((item) => item.missingPhone).length;
    row.missingContactDetails = submissionItems.filter(
      (item) => item.missingEmail || item.missingPhone,
    ).length;
    row.messageFields = group.items.filter((item) => item.isMessageField).length;

    return row;
  });
}

function metadataText(value: unknown, key: string) {
  return stringValue(objectValue(value)[key]);
}

function transcriptStatus(value: unknown) {
  return enumLabel(metadataText(value, "transcriptStatus") ?? "MISSING");
}

function isTranscriptReady(value: unknown) {
  const status = metadataText(value, "transcriptStatus")?.toUpperCase();
  return status === "COMPLETED" || status === "READY";
}

function queueWaitSeconds(entry: {
  answeredAt: Date | null;
  completedAt: Date | null;
  missedAt: Date | null;
  queuedAt: Date;
}) {
  const endedAt = entry.answeredAt ?? entry.completedAt ?? entry.missedAt;
  if (!endedAt) return null;

  const seconds = (endedAt.getTime() - entry.queuedAt.getTime()) / 1000;
  return Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : null;
}

async function callRows(user: ReportUser, plan: ReportPlan, timezone: string) {
  const range = rangeFromPlan(plan);
  const where: Prisma.CallLogWhereInput = {
    ...(user.role === "ADMIN" ? {} : { userId: user.id }),
    ...(range ? { startedAt: { gte: range.from, lte: range.to } } : {}),
  };
  const records = await prisma.callLog.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: maxRows,
    select: {
      contactId: true,
      direction: true,
      durationSeconds: true,
      metadata: true,
      opportunityId: true,
      recordingSid: true,
      recordingUrl: true,
      startedAt: true,
      status: true,
      toNumber: true,
      user: { select: { name: true } },
      queueEntries: {
        select: {
          answeredAt: true,
          assignedUser: { select: { name: true } },
          completedAt: true,
          missedAt: true,
          queuedAt: true,
          status: true,
        },
      },
    },
  });
  const groups = new Map<string, { dims: Row; items: typeof records }>();
  for (const record of records) {
    const queueEntry = record.queueEntries[0] ?? null;
    const hasRecording = Boolean(record.recordingSid || record.recordingUrl);
    const dims: Row = {
      day: dayKey(record.startedAt, timezone),
      month: monthKey(record.startedAt, timezone),
      week: weekKey(record.startedAt, timezone),
      contactStatus: record.contactId ? "Linked contact" : "No contact",
      direction: enumLabel(record.direction),
      agent: record.user?.name ?? "Unassigned",
      number: groupText(record.toNumber, "Unknown number"),
      opportunityStatus: record.opportunityId
        ? "Linked opportunity"
        : "No opportunity",
      queueAssignee: queueEntry?.assignedUser?.name ?? "Unassigned",
      queueStatus: queueEntry ? enumLabel(queueEntry.status) : "Not queued",
      recordingStatus: hasRecording ? "Recorded" : "Not recorded",
      status: enumLabel(record.status),
      transcriptStatus: hasRecording
        ? transcriptStatus(record.metadata)
        : "No recording",
    };
    if (!matchesTextFilters(dims, plan)) continue;
    const selectedDims = Object.fromEntries(
      plan.dimensions.map((dimension) => [dimension, dims[dimension]]),
    ) as Row;
    const key = groupKey(
      plan.dimensions.map((dimension) => selectedDims[dimension]),
    );
    const group = groups.get(key) ?? { dims: selectedDims, items: [] };
    group.items.push(record);
    groups.set(key, group);
  }
  return Array.from(groups.values()).map((group) => ({
    ...group.dims,
    callCount: group.items.length,
    answeredCalls: group.items.filter((item) => item.status === "COMPLETED")
      .length,
    missedCalls: group.items.filter(
      (item) =>
        item.status === "NO_ANSWER" ||
        item.status === "FAILED" ||
        item.queueEntries.some(
          (entry) => entry.status === "MISSED" || entry.status === "ABANDONED",
        ),
    ).length,
    avgDuration: Math.round(
      group.items.reduce(
        (total, item) => total + (item.durationSeconds ?? 0),
        0,
      ) / Math.max(group.items.length, 1),
    ),
    queuedCalls: group.items.filter((item) => item.queueEntries.length).length,
    abandonedCalls: group.items.filter((item) =>
      item.queueEntries.some((entry) => entry.status === "ABANDONED"),
    ).length,
    avgQueueWaitSeconds: average(
      group.items
        .map((item) =>
          Math.max(
            ...item.queueEntries.map(queueWaitSeconds).filter(
              (value): value is number => typeof value === "number",
            ),
            0,
          ),
        )
        .filter((value) => value > 0),
    ),
    maxQueueWaitSeconds: Math.max(
      ...group.items.flatMap((item) =>
        item.queueEntries
          .map(queueWaitSeconds)
          .filter((value): value is number => typeof value === "number"),
      ),
      0,
    ),
    recordingCount: group.items.filter(
      (item) => item.recordingSid || item.recordingUrl,
    ).length,
    transcriptReady: group.items.filter((item) => isTranscriptReady(item.metadata))
      .length,
    transcriptMissing: group.items.filter(
      (item) =>
        (item.recordingSid || item.recordingUrl) &&
        !isTranscriptReady(item.metadata),
    ).length,
  }));
}

async function taskRows(user: ReportUser, plan: ReportPlan, timezone: string) {
  const range = rangeFromPlan(plan);
  const usesDueDateRange = [...plan.dimensions, ...plan.filters.map((filter) => filter.field)].some(
    (field) => ["dueDay", "dueWeek", "dueMonth", "dueStatus"].includes(field),
  );
  const where: Prisma.TaskWhereInput = {
    ...(user.role === "ADMIN"
      ? {}
      : { OR: [{ assigneeId: user.id }, { creatorId: user.id }] }),
    ...(range
      ? usesDueDateRange
        ? { dueDate: { gte: range.from, lte: range.to } }
        : { createdAt: { gte: range.from, lte: range.to } }
      : {}),
  };
  const records = await prisma.task.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: maxRows,
    select: {
      assignee: { select: { name: true } },
      createdAt: true,
      creator: { select: { name: true } },
      dueDate: true,
      companyId: true,
      contactId: true,
      status: true,
    },
  });
  const now = new Date();
  const today = dayKey(now, timezone);
  const groups = new Map<string, { dims: Row; items: typeof records }>();
  for (const record of records) {
    const dueDay = record.dueDate ? dayKey(record.dueDate, timezone) : null;
    const dueStatus =
      record.status === "DONE"
        ? "Completed"
        : !record.dueDate
          ? "No due date"
          : dueDay && dueDay < today
            ? "Overdue"
            : dueDay === today
              ? "Due today"
              : "Upcoming";
    const linkStatus = record.contactId
      ? record.companyId
        ? "Contact and company"
        : "Contact"
      : record.companyId
        ? "Company"
        : "No linked record";
    const dims: Row = {
      assignee: record.assignee?.name ?? "Unassigned",
      createdDay: dayKey(record.createdAt, timezone),
      creator: record.creator?.name ?? "Unknown creator",
      dueDay: dueDay ?? "No due date",
      dueMonth: record.dueDate ? monthKey(record.dueDate, timezone) : "No due date",
      dueStatus,
      dueWeek: record.dueDate ? weekKey(record.dueDate, timezone) : "No due date",
      linkStatus,
      month: monthKey(record.createdAt, timezone),
      status: enumLabel(record.status),
      week: weekKey(record.createdAt, timezone),
    };
    if (!matchesTextFilters(dims, plan)) continue;
    const selectedDims = Object.fromEntries(
      plan.dimensions.map((dimension) => [dimension, dims[dimension]]),
    ) as Row;
    const key = groupKey(
      plan.dimensions.map((dimension) => selectedDims[dimension]),
    );
    const group = groups.get(key) ?? { dims: selectedDims, items: [] };
    group.items.push(record);
    groups.set(key, group);
  }
  return Array.from(groups.values()).map((group) => ({
    ...group.dims,
    taskCount: group.items.length,
    openTasks: group.items.filter((item) => item.status !== "DONE").length,
    overdueTasks: group.items.filter(
      (item) =>
        item.status !== "DONE" &&
        item.dueDate &&
        dayKey(item.dueDate, timezone) < today,
    ).length,
    dueTodayTasks: group.items.filter(
      (item) =>
        item.status !== "DONE" &&
        item.dueDate &&
        dayKey(item.dueDate, timezone) === today,
    ).length,
    upcomingTasks: group.items.filter(
      (item) =>
        item.status !== "DONE" &&
        item.dueDate &&
        dayKey(item.dueDate, timezone) > today,
    ).length,
    completedTasks: group.items.filter((item) => item.status === "DONE").length,
    blockedTasks: group.items.filter((item) => item.status === "BLOCKED").length,
    unassignedTasks: group.items.filter((item) => !item.assignee).length,
    completionRate: percent(
      group.items.filter((item) => item.status === "DONE").length,
      group.items.length,
    ),
    avgAgeDays: average(
      group.items.map((item) => daysSince(item.createdAt, now) ?? 0),
    ),
    avgOverdueDays: average(
      group.items
        .filter(
          (item) =>
            item.status !== "DONE" &&
            item.dueDate &&
            dayKey(item.dueDate, timezone) < today,
        )
        .map((item) => daysSince(item.dueDate, now) ?? 0),
    ),
  }));
}

async function communicationRows(
  user: ReportUser,
  plan: ReportPlan,
  timezone: string,
) {
  const range = rangeFromPlan(plan);
  const where: Prisma.SalesCommunicationWhereInput = {
    ...(user.role === "ADMIN" ? {} : { userId: user.id }),
    ...(range ? { occurredAt: { gte: range.from, lte: range.to } } : {}),
  };
  const records = await prisma.salesCommunication.findMany({
    where,
    orderBy: { occurredAt: "desc" },
    take: maxRows,
    select: {
      channel: true,
      contactId: true,
      direction: true,
      fromAddress: true,
      occurredAt: true,
      opportunityId: true,
      opportunity: {
        select: {
          owner: { select: { name: true } },
          salesPipelineStage: { select: { name: true } },
          source: true,
          stage: true,
        },
      },
      toAddress: true,
      user: { select: { name: true } },
    },
  });
  const groups = new Map<string, { dims: Row; items: typeof records }>();
  for (const record of records) {
    const externalAddress =
      record.fromAddress?.trim() || record.toAddress?.trim();
    const dims: Row = {
      channel: enumLabel(record.channel),
      contactStatus: record.contactId ? "Linked contact" : "No linked contact",
      day: dayKey(record.occurredAt, timezone),
      direction: enumLabel(record.direction),
      externalStatus: externalAddress ? "Has address" : "No address",
      month: monthKey(record.occurredAt, timezone),
      opportunityOwner: record.opportunity.owner?.name ?? "Unassigned",
      owner: record.user?.name ?? "System / unknown",
      pipelineStage: lifecycleStageLabel(
        record.opportunity.stage,
        record.opportunity.salesPipelineStage,
      ),
      source: normaliseSource(record.opportunity.source),
      week: weekKey(record.occurredAt, timezone),
    };
    if (!matchesTextFilters(dims, plan)) continue;
    const selectedDims = Object.fromEntries(
      plan.dimensions.map((dimension) => [dimension, dims[dimension]]),
    ) as Row;
    const key = groupKey(
      plan.dimensions.map((dimension) => selectedDims[dimension]),
    );
    const group = groups.get(key) ?? { dims: selectedDims, items: [] };
    group.items.push(record);
    groups.set(key, group);
  }
  return Array.from(groups.values()).map((group) => ({
    ...group.dims,
    communicationCount: group.items.length,
    inboundCount: group.items.filter((item) => item.direction === "INBOUND")
      .length,
    outboundCount: group.items.filter((item) => item.direction === "OUTBOUND")
      .length,
    internalCount: group.items.filter((item) => item.direction === "INTERNAL")
      .length,
    emailCount: group.items.filter((item) => item.channel === "EMAIL").length,
    smsCount: group.items.filter((item) => item.channel === "SMS").length,
    whatsappCount: group.items.filter((item) => item.channel === "WHATSAPP")
      .length,
    phoneCount: group.items.filter((item) => item.channel === "PHONE").length,
    noteCount: group.items.filter((item) => item.channel === "NOTE").length,
    systemCount: group.items.filter((item) => item.channel === "SYSTEM").length,
    uniqueLeads: new Set(group.items.map((item) => item.opportunityId)).size,
    linkedContacts: new Set(
      group.items
        .map((item) => item.contactId)
        .filter((item): item is string => Boolean(item)),
    ).size,
    unlinkedContacts: group.items.filter((item) => !item.contactId).length,
    inboundShare: percent(
      group.items.filter((item) => item.direction === "INBOUND").length,
      group.items.length,
    ),
    outboundShare: percent(
      group.items.filter((item) => item.direction === "OUTBOUND").length,
      group.items.length,
    ),
  }));
}

async function discoveryRows(
  user: ReportUser,
  plan: ReportPlan,
  timezone: string,
) {
  const range = rangeFromPlan(plan);
  const opportunityWhere: Prisma.SalesOpportunityWhereInput = {
    ...(user.role === "ADMIN" ? {} : { ownerId: user.id }),
  };
  const where: Prisma.OpportunityDiscoveryAnswerWhereInput = {
    ...(Object.keys(opportunityWhere).length
      ? { opportunity: opportunityWhere }
      : {}),
    ...(range
      ? {
          OR: [
            { answeredAt: { gte: range.from, lte: range.to } },
            {
              answeredAt: null,
              createdAt: { gte: range.from, lte: range.to },
            },
          ],
        }
      : {}),
  };
  const records = await prisma.opportunityDiscoveryAnswer.findMany({
    where,
    orderBy: [{ answeredAt: "desc" }, { createdAt: "desc" }],
    take: maxRows,
    select: {
      categoryId: true,
      confirmedAt: true,
      createdAt: true,
      id: true,
      opportunityId: true,
      productId: true,
      questionAnswerTypeSnapshot: true,
      questionId: true,
      questionLabelSnapshot: true,
      questionOptionsSnapshot: true,
      source: true,
      value: true,
      answeredAt: true,
      category: { select: { name: true } },
      product: { select: { name: true } },
      question: {
        select: {
          answerType: true,
          label: true,
          options: true,
          scope: true,
        },
      },
      opportunity: {
        select: {
          createdAt: true,
          owner: { select: { name: true } },
          probability: true,
          salesPipelineStage: { select: { name: true } },
          source: true,
          stage: true,
          valueCents: true,
        },
      },
    },
  });
  const productAnswerIds = new Set<string>();
  const categoryAnswerIds = new Set<string>();

  for (const record of records) {
    const answerType =
      record.questionAnswerTypeSnapshot ?? record.question.answerType;
    const answerIds = answerValueParts(record.value);
    if (answerType.startsWith("PRODUCT_")) {
      answerIds.forEach((id) => productAnswerIds.add(id));
    }
    if (answerType.startsWith("CATEGORY_")) {
      answerIds.forEach((id) => categoryAnswerIds.add(id));
    }
  }

  const [answerProducts, answerCategories] = await Promise.all([
    productAnswerIds.size
      ? prisma.product.findMany({
          where: { id: { in: Array.from(productAnswerIds) } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    categoryAnswerIds.size
      ? prisma.productCategory.findMany({
          where: { id: { in: Array.from(categoryAnswerIds) } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const productLabels = new Map(
    answerProducts.map((product) => [product.id, product.name]),
  );
  const categoryLabels = new Map(
    answerCategories.map((category) => [category.id, category.name]),
  );
  type DiscoveryRecord = (typeof records)[number];
  const groups = new Map<
    string,
    {
      dims: Row;
      items: Array<{ numericValue: number | null; record: DiscoveryRecord }>;
    }
  >();
  const splitAnswerDimension = plan.dimensions.includes("answer");

  for (const record of records) {
    if (!hasAnswerValue(record.value)) continue;

    const answeredAt = record.answeredAt ?? record.createdAt;
    const answerType =
      record.questionAnswerTypeSnapshot ?? record.question.answerType;
    const answerValues = discoveryAnswerValues({
      answerType,
      categoryLabels,
      options: record.questionOptionsSnapshot ?? record.question.options,
      productLabels,
      value: record.value,
    });
    const answerDimensionValues =
      splitAnswerDimension && answerValues.length
        ? answerValues
        : [groupText(answerValues.join(", "), "Answered")];
    const baseDims: Row = {
      answerType: enumLabel(answerType),
      answerSource: enumLabel(record.source),
      category: groupText(record.category?.name, "Lead level"),
      day: dayKey(answeredAt, timezone),
      month: monthKey(answeredAt, timezone),
      owner: record.opportunity.owner?.name ?? "Unassigned",
      pipelineStage:
        record.opportunity.salesPipelineStage?.name ?? record.opportunity.stage,
      product: groupText(record.product?.name, "Lead level"),
      question: groupText(
        record.questionLabelSnapshot ?? record.question.label,
        "Unknown question",
      ),
      questionScope: enumLabel(record.question.scope),
      source: normaliseSource(record.opportunity.source),
      stage: record.opportunity.stage,
      week: weekKey(answeredAt, timezone),
    };
    const numericValue = discoveryNumericValue(record.value);

    for (const answer of answerDimensionValues) {
      const dims: Row = { ...baseDims, answer };
      if (!matchesTextFilters(dims, plan)) continue;

      const selectedDims = Object.fromEntries(
        plan.dimensions.map((dimension) => [
          dimension,
          dims[dimension] ?? "None",
        ]),
      ) as Row;
      const key = groupKey(
        plan.dimensions.map((dimension) => selectedDims[dimension]),
      );
      const group = groups.get(key) ?? { dims: selectedDims, items: [] };
      group.items.push({ numericValue, record });
      groups.set(key, group);
    }
  }

  return Array.from(groups.values()).map((group) => {
    const opportunities = Array.from(
      new Map(
        group.items.map((item) => [
          item.record.opportunityId,
          item.record.opportunity,
        ]),
      ).values(),
    );
    const open = opportunities.filter(
      (item) => item.stage !== "WON" && item.stage !== "LOST",
    );
    const won = opportunities.filter((item) => item.stage === "WON");
    const numericValues = group.items
      .map((item) => item.numericValue)
      .filter((value): value is number => typeof value === "number");
    const row: Row = { ...group.dims };

    row.answerCount = group.items.length;
    row.answeredLeads = opportunities.length;
    row.uniqueQuestions = new Set(
      group.items.map((item) => item.record.questionId),
    ).size;
    row.confirmedAnswers = group.items.filter(
      (item) => item.record.confirmedAt,
    ).length;
    row.productScopedAnswers = group.items.filter(
      (item) => item.record.productId,
    ).length;
    row.categoryScopedAnswers = group.items.filter(
      (item) => item.record.categoryId,
    ).length;
    row.avgNumericAnswer = numericValues.length
      ? Math.round(
          numericValues.reduce((total, value) => total + value, 0) /
            numericValues.length,
        )
      : 0;
    row.linkedOpenPipeline = money(
      open.reduce((total, item) => total + item.valueCents, 0),
    );
    row.linkedWonRevenue = money(
      won.reduce((total, item) => total + item.valueCents, 0),
    );

    return row;
  });
}

type LifecycleReportItem = {
  closedAt: Date | null;
  communicationAt: Date | null;
  event: {
    eventType: string;
    fromPipelineStage: { name: string } | null;
    fromStage: string | null;
    lostReason: string | null;
    toPipelineStage: { name: string } | null;
    toStage: string | null;
    userName: string | null;
  } | null;
  firstContactedAt: Date | null;
  lostReason: string | null;
  occurredAt: Date;
  opportunityCreatedAt: Date;
  opportunityId: string;
  owner: string;
  pipelineStage: string;
  probability: number;
  source: string;
  stage: string;
  valueCents: number;
};

async function lifecycleRows(
  user: ReportUser,
  plan: ReportPlan,
  timezone: string,
) {
  const eventDimensions = new Set([
    "eventType",
    "eventUser",
    "fromStage",
    "toStage",
    "transition",
  ]);
  const usesEventRows =
    plan.dimensions.some((dimension) => eventDimensions.has(dimension)) ||
    plan.filters.some((filter) => eventDimensions.has(filter.field));
  const range = rangeFromPlan(plan);
  const items: LifecycleReportItem[] = [];

  if (usesEventRows) {
    const where: Prisma.SalesLifecycleEventWhereInput = {
      ...(user.role === "ADMIN" ? {} : { opportunity: { ownerId: user.id } }),
      ...(range ? { occurredAt: { gte: range.from, lte: range.to } } : {}),
    };
    const records = await prisma.salesLifecycleEvent.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      take: maxRows,
      select: {
        eventType: true,
        fromStage: true,
        lostReason: true,
        occurredAt: true,
        toStage: true,
        fromPipelineStage: { select: { name: true } },
        toPipelineStage: { select: { name: true } },
        user: { select: { name: true } },
        opportunity: {
          select: {
            closedAt: true,
            communications: {
              orderBy: { occurredAt: "asc" },
              take: 1,
              select: { occurredAt: true },
            },
            createdAt: true,
            firstContactedAt: true,
            id: true,
            lostReason: true,
            owner: { select: { name: true } },
            probability: true,
            salesPipelineStage: { select: { name: true } },
            source: true,
            stage: true,
            valueCents: true,
          },
        },
      },
    });

    for (const record of records) {
      items.push({
        closedAt: record.opportunity.closedAt,
        communicationAt: record.opportunity.communications[0]?.occurredAt ?? null,
        event: {
          eventType: record.eventType,
          fromPipelineStage: record.fromPipelineStage,
          fromStage: record.fromStage,
          lostReason: record.lostReason,
          toPipelineStage: record.toPipelineStage,
          toStage: record.toStage,
          userName: record.user?.name ?? null,
        },
        firstContactedAt: record.opportunity.firstContactedAt,
        lostReason: record.opportunity.lostReason,
        occurredAt: record.occurredAt,
        opportunityCreatedAt: record.opportunity.createdAt,
        opportunityId: record.opportunity.id,
        owner: record.opportunity.owner?.name ?? "Unassigned",
        pipelineStage:
          record.opportunity.salesPipelineStage?.name ??
          enumLabel(record.opportunity.stage),
        probability: record.opportunity.probability,
        source: normaliseSource(record.opportunity.source),
        stage: record.opportunity.stage,
        valueCents: record.opportunity.valueCents,
      });
    }
  } else {
    const where: Prisma.SalesOpportunityWhereInput = {
      ...(user.role === "ADMIN" ? {} : { ownerId: user.id }),
      ...(range ? { createdAt: { gte: range.from, lte: range.to } } : {}),
    };
    const records = await prisma.salesOpportunity.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: maxRows,
      select: {
        closedAt: true,
        communications: {
          orderBy: { occurredAt: "asc" },
          take: 1,
          select: { occurredAt: true },
        },
        createdAt: true,
        firstContactedAt: true,
        id: true,
        lostReason: true,
        owner: { select: { name: true } },
        probability: true,
        salesPipelineStage: { select: { name: true } },
        source: true,
        stage: true,
        valueCents: true,
      },
    });

    for (const record of records) {
      items.push({
        closedAt: record.closedAt,
        communicationAt: record.communications[0]?.occurredAt ?? null,
        event: null,
        firstContactedAt: record.firstContactedAt,
        lostReason: record.lostReason,
        occurredAt: record.createdAt,
        opportunityCreatedAt: record.createdAt,
        opportunityId: record.id,
        owner: record.owner?.name ?? "Unassigned",
        pipelineStage: record.salesPipelineStage?.name ?? enumLabel(record.stage),
        probability: record.probability,
        source: normaliseSource(record.source),
        stage: record.stage,
        valueCents: record.valueCents,
      });
    }
  }

  const groups = new Map<
    string,
    {
      dims: Row;
      items: LifecycleReportItem[];
    }
  >();

  for (const item of items) {
    const firstContactedAt = item.firstContactedAt ?? item.communicationAt;
    const contactStatus = firstContactedAt ? "Contacted" : "Not contacted";
    const closeStatus =
      item.stage === "WON"
        ? "Won"
        : item.stage === "LOST"
          ? "Lost"
          : "Open";
    const fromStage = item.event
      ? lifecycleStageLabel(
          item.event.fromStage,
          item.event.fromPipelineStage,
          item.event.eventType === "CREATED" ? "Created" : "Unknown",
        )
      : "Current stage";
    const toStage = item.event
      ? lifecycleStageLabel(
          item.event.toStage,
          item.event.toPipelineStage,
          item.pipelineStage,
        )
      : item.pipelineStage;
    const dims: Row = {
      closeStatus,
      contactStatus,
      day: dayKey(item.occurredAt, timezone),
      eventType: item.event ? enumLabel(item.event.eventType) : "Opportunity",
      eventUser: item.event?.userName ?? "System / unknown",
      fromStage,
      lostReason: groupText(
        item.event?.lostReason ?? item.lostReason,
        "No reason recorded",
      ),
      month: monthKey(item.occurredAt, timezone),
      owner: item.owner,
      pipelineStage: item.pipelineStage,
      source: item.source,
      stage: enumLabel(item.stage),
      toStage,
      transition: item.event ? `${fromStage} -> ${toStage}` : "Current stage",
      week: weekKey(item.occurredAt, timezone),
    };
    if (!matchesTextFilters(dims, plan)) continue;

    const selectedDims = Object.fromEntries(
      plan.dimensions.map((dimension) => [
        dimension,
        dims[dimension] ?? "None",
      ]),
    ) as Row;
    const key = groupKey(
      plan.dimensions.map((dimension) => selectedDims[dimension]),
    );
    const group = groups.get(key) ?? { dims: selectedDims, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }

  return Array.from(groups.values()).map((group) => {
    const opportunities = Array.from(
      new Map(group.items.map((item) => [item.opportunityId, item])).values(),
    );
    const contacted = opportunities.filter(
      (item) => item.firstContactedAt ?? item.communicationAt,
    );
    const responseMinutes = opportunities
      .map((item) =>
        durationMinutesBetween(
          item.firstContactedAt ?? item.communicationAt,
          item.opportunityCreatedAt,
        ),
      )
      .filter((value): value is number => typeof value === "number");
    const timeToCloseDays = opportunities
      .map((item) => {
        const minutes = durationMinutesBetween(
          item.closedAt,
          item.opportunityCreatedAt,
        );
        return minutes === null ? null : minutes / 1_440;
      })
      .filter((value): value is number => typeof value === "number");
    const open = opportunities.filter(
      (item) => item.stage !== "WON" && item.stage !== "LOST",
    );
    const won = opportunities.filter((item) => item.stage === "WON");
    const lost = opportunities.filter((item) => item.stage === "LOST");
    const row: Row = { ...group.dims };

    row.leadCount = opportunities.length;
    row.contactedLeads = contacted.length;
    row.contactedRate = percent(contacted.length, opportunities.length);
    row.avgResponseMinutes = average(responseMinutes);
    row.avgTimeToCloseDays = average(timeToCloseDays);
    row.qualifiedLeads = opportunities.filter((item) =>
      isAtLeastLifecycleStage(item.stage, "QUALIFIED"),
    ).length;
    row.proposalLeads = opportunities.filter((item) =>
      isAtLeastLifecycleStage(item.stage, "PROPOSAL"),
    ).length;
    row.wonDeals = won.length;
    row.lostDeals = lost.length;
    row.lostReasonedDeals = lost.filter((item) => item.lostReason?.trim()).length;
    row.lifecycleEvents = group.items.filter((item) => item.event).length;
    row.stageChanges = group.items.filter(
      (item) => item.event?.eventType === "STAGE_CHANGED",
    ).length;
    row.openPipeline = money(
      open.reduce((total, item) => total + item.valueCents, 0),
    );
    row.weightedPipeline = money(
      open.reduce(
        (total, item) =>
          total + Math.round((item.valueCents * item.probability) / 100),
        0,
      ),
    );
    row.wonRevenue = money(
      won.reduce((total, item) => total + item.valueCents, 0),
    );

    return row;
  });
}

async function setupRows(user: ReportUser, plan: ReportPlan) {
  if (user.role !== "ADMIN") return [];

  const readiness = await loadSetupReadiness();
  const items = readiness.groups.flatMap((group) =>
    group.items.map((item) => ({
      ...item,
      group: group.title,
    })),
  );
  const groups = new Map<
    string,
    {
      dims: Row;
      items: typeof items;
    }
  >();

  for (const item of items) {
    const dims: Row = {
      action: item.action,
      group: item.group,
      href: item.href,
      item: item.title,
      status: item.status,
    };
    if (!matchesTextFilters(dims, plan)) continue;

    const selectedDims = Object.fromEntries(
      plan.dimensions.map((dimension) => [
        dimension,
        dims[dimension] ?? "None",
      ]),
    ) as Row;
    const key = groupKey(
      plan.dimensions.map((dimension) => selectedDims[dimension]),
    );
    const group = groups.get(key) ?? { dims: selectedDims, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }

  return Array.from(groups.values()).map((group) => {
    const actionableItems = group.items.filter(
      (item) => item.status !== "Planned",
    );
    const readyItems = group.items.filter((item) => item.status === "Ready")
      .length;
    const row: Row = { ...group.dims };

    row.itemCount = group.items.length;
    row.readyItems = readyItems;
    row.neededItems = group.items.filter((item) => item.status === "Needed")
      .length;
    row.warningItems = group.items.filter((item) => item.status === "WARNING")
      .length;
    row.plannedItems = group.items.filter((item) => item.status === "Planned")
      .length;
    row.completionPercent = percent(readyItems, actionableItems.length);

    return row;
  });
}

function latestDate(values: Array<Date | null | undefined>) {
  const timestamps = values
    .map((value) => value?.getTime())
    .filter((value): value is number => typeof value === "number");

  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps));
}

function daysSince(date: Date | null, now = new Date()) {
  if (!date) return null;
  return Math.max(0, Math.round((now.getTime() - date.getTime()) / 86400000));
}

function sourceFromJsonAttribution(value: unknown) {
  const attribution = objectValue(value);
  const firstTouch = objectValue(attribution.firstTouch);
  const lastTouch = objectValue(attribution.lastTouch);
  return (
    stringValue(attribution.source) ??
    stringValue(attribution.attributionSource) ??
    stringValue(attribution.submittedSource) ??
    touchParam(lastTouch, "utm_source") ??
    touchParam(firstTouch, "utm_source")
  );
}

function paidStatusFromText(...values: Array<string | null | undefined>) {
  const text = values.filter(Boolean).join(" ").toLowerCase();

  return /\b(paid|cpc|ppc|google ads|adwords|bing|microsoft ads|facebook|meta|linkedin|gclid|gbraid|wbraid|fbclid|msclkid|li_fat_id)\b/.test(
    text,
  )
    ? "Paid ads"
    : "Not paid ads";
}

async function contactClientRows(
  user: ReportUser,
  plan: ReportPlan,
  timezone: string,
) {
  const range = rangeFromPlan(plan);
  const where: Prisma.ContactWhereInput = {
    ...(user.role === "ADMIN"
      ? {}
      : { opportunities: { some: { ownerId: user.id } } }),
    ...(range ? { createdAt: { gte: range.from, lte: range.to } } : {}),
  };
  const contacts = await prisma.contact.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: maxRows,
    select: {
      aiGuidanceGeneratedAt: true,
      attribution: true,
      callLogs: {
        orderBy: { startedAt: "desc" },
        take: 1,
        select: { startedAt: true },
      },
      company: { select: { name: true } },
      companyId: true,
      companyName: true,
      createdAt: true,
      firstName: true,
      id: true,
      lastName: true,
      opportunities: {
        select: {
          createdAt: true,
          id: true,
          owner: { select: { name: true } },
          source: true,
          stage: true,
          updatedAt: true,
        },
      },
      salesCommunications: {
        orderBy: { occurredAt: "desc" },
        take: 1,
        select: { occurredAt: true },
      },
      tasks: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { updatedAt: true },
      },
      updatedAt: true,
    },
  });
  const contactIds = contacts.map((contact) => contact.id);
  const [formCounts, latestFormRecords] = contactIds.length
    ? await Promise.all([
        prisma.attributionRecord.groupBy({
          by: ["contactId"],
          where: { contactId: { in: contactIds }, source: "FORM" },
          _count: { _all: true },
        }),
        prisma.attributionRecord.findMany({
          where: { contactId: { in: contactIds }, source: "FORM" },
          orderBy: [{ contactId: "asc" }, { createdAt: "desc" }],
          distinct: ["contactId"],
          select: {
            contactId: true,
            firstTouch: true,
            lastTouch: true,
            metadata: true,
          },
        }),
      ])
    : [[], []];
  const formCountsByContact = new Map(
    formCounts
      .filter((record) => record.contactId)
      .map((record) => [record.contactId as string, record._count._all]),
  );
  const latestFormByContact = new Map<
    string,
    (typeof latestFormRecords)[number]
  >();

  for (const record of latestFormRecords) {
    if (!record.contactId) continue;
    latestFormByContact.set(record.contactId, record);
  }

  const now = new Date();
  const groups = new Map<
    string,
    {
      dims: Row;
      items: Array<{
        companyKey: string;
        contactDaysSinceLastContact: number | null;
        contactId: string;
        contactStatus: string;
        formSubmissionCount: number;
        isPaid: boolean;
        openOpportunityCount: number;
        opportunityCount: number;
        recentActivityCount: number;
        wonOpportunityCount: number;
      }>;
    }
  >();

  for (const contact of contacts) {
    const formSubmissionCount = formCountsByContact.get(contact.id) ?? 0;
    const latestForm = latestFormByContact.get(contact.id) ?? null;
    const openOpportunities = contact.opportunities.filter(
      (opportunity) =>
        opportunity.stage !== "WON" && opportunity.stage !== "LOST",
    );
    const wonOpportunities = contact.opportunities.filter(
      (opportunity) => opportunity.stage === "WON",
    );
    const owner =
      openOpportunities[0]?.owner?.name ??
      contact.opportunities[0]?.owner?.name ??
      "Unassigned";
    const source =
      sourceFromJsonAttribution(contact.attribution) ??
      sourceFromAttributionRecord(latestForm ?? {
        firstTouch: null,
        lastTouch: null,
        metadata: null,
      }) ??
      contact.opportunities.find((opportunity) => opportunity.source)?.source ??
      null;
    const lastCommunicationAt =
      contact.salesCommunications[0]?.occurredAt ??
      contact.callLogs[0]?.startedAt ??
      null;
    const lastActivityAt = latestDate([
      lastCommunicationAt,
      contact.tasks[0]?.updatedAt,
      ...contact.opportunities.map((opportunity) => opportunity.updatedAt),
      contact.aiGuidanceGeneratedAt,
      contact.updatedAt,
    ]);
    const daysFromLastContact = daysSince(lastCommunicationAt, now);
    const contactStatus =
      daysFromLastContact === null
        ? "No contact activity"
        : daysFromLastContact > 30
          ? "No recent contact"
          : "Recently contacted";
    const daysFromLastActivity = daysSince(lastActivityAt, now);
    const activityStatus =
      daysFromLastActivity === null
        ? "No activity"
        : daysFromLastActivity > 30
          ? "No recent activity"
          : "Active last 30 days";
    const sourceText = [
      source,
      ...contact.opportunities.map((opportunity) => opportunity.source),
      ...(latestForm
        ? [
            sourceFromAttributionRecord(latestForm),
            touchParam(latestForm.lastTouch, "utm_medium"),
            touchParam(latestForm.lastTouch, "gclid"),
            touchParam(latestForm.lastTouch, "fbclid"),
            touchParam(latestForm.lastTouch, "msclkid"),
            touchParam(latestForm.lastTouch, "li_fat_id"),
          ]
        : []),
    ].filter((value): value is string => Boolean(value));
    const paidStatus = paidStatusFromText(...sourceText);
    const companyName = contact.company?.name ?? contact.companyName ?? "No company";
    const dims: Row = {
      activityStatus,
      company: groupText(companyName, "No company"),
      contact: groupText(
        [contact.firstName, contact.lastName].filter(Boolean).join(" "),
        "Unnamed contact",
      ),
      contactStatus,
      day: dayKey(contact.createdAt, timezone),
      formStatus: formSubmissionCount
        ? "Submitted form"
        : "No form submission",
      month: monthKey(contact.createdAt, timezone),
      openOpportunityStatus: openOpportunities.length
        ? "Has open opportunity"
        : "No open opportunity",
      owner,
      paidStatus,
      source: normaliseSource(source),
      week: weekKey(contact.createdAt, timezone),
    };
    if (!matchesTextFilters(dims, plan)) continue;

    const selectedDims = Object.fromEntries(
      plan.dimensions.map((dimension) => [
        dimension,
        dims[dimension] ?? "None",
      ]),
    ) as Row;
    const key = groupKey(
      plan.dimensions.map((dimension) => selectedDims[dimension]),
    );
    const group = groups.get(key) ?? { dims: selectedDims, items: [] };
    group.items.push({
      companyKey: contact.companyId ?? companyName,
      contactDaysSinceLastContact: daysFromLastContact,
      contactId: contact.id,
      contactStatus,
      formSubmissionCount,
      isPaid: paidStatus === "Paid ads",
      openOpportunityCount: openOpportunities.length,
      opportunityCount: contact.opportunities.length,
      recentActivityCount: activityStatus === "Active last 30 days" ? 1 : 0,
      wonOpportunityCount: wonOpportunities.length,
    });
    groups.set(key, group);
  }

  return Array.from(groups.values()).map((group) => {
    const row: Row = { ...group.dims };
    const contactDays = group.items
      .map((item) => item.contactDaysSinceLastContact)
      .filter((value): value is number => typeof value === "number");

    row.contactCount = group.items.length;
    row.companyCount = new Set(group.items.map((item) => item.companyKey)).size;
    row.opportunities = group.items.reduce(
      (total, item) => total + item.opportunityCount,
      0,
    );
    row.openOpportunities = group.items.reduce(
      (total, item) => total + item.openOpportunityCount,
      0,
    );
    row.wonOpportunities = group.items.reduce(
      (total, item) => total + item.wonOpportunityCount,
      0,
    );
    row.recentActivities = group.items.reduce(
      (total, item) => total + item.recentActivityCount,
      0,
    );
    row.noRecentContact = group.items.filter(
      (item) => item.contactStatus !== "Recently contacted",
    ).length;
    row.avgDaysSinceLastContact = average(contactDays);
    row.formSubmissions = group.items.reduce(
      (total, item) => total + item.formSubmissionCount,
      0,
    );
    row.paidAdContacts = group.items.filter((item) => item.isPaid).length;

    return row;
  });
}

async function userSecurityRows(
  user: ReportUser,
  plan: ReportPlan,
  timezone: string,
) {
  if (user.role !== "ADMIN") return [];

  const range = rangeFromPlan(plan);
  const where: Prisma.UserWhereInput = {
    ...(range ? { createdAt: { gte: range.from, lte: range.to } } : {}),
  };
  const now = new Date();
  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: maxRows,
    select: {
      createdAt: true,
      email: true,
      id: true,
      name: true,
      passwordResetTokens: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          createdAt: true,
          expiresAt: true,
          usedAt: true,
        },
      },
      role: true,
      roleTemplate: true,
      sessions: {
        orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
        take: 10,
        select: {
          createdAt: true,
          expiresAt: true,
          lastSeenAt: true,
        },
      },
      status: true,
      twoFactorEnabled: true,
    },
  });
  const groups = new Map<
    string,
    {
      dims: Row;
      items: Array<{
        activeSessionCount: number;
        expiredSessionCount: number;
        id: string;
        inactive: boolean;
        isActive: boolean;
        isAdmin: boolean;
        pendingSetupLink: boolean;
        suspended: boolean;
        twoFactorEnabled: boolean;
      }>;
    }
  >();

  for (const account of users) {
    const activeSessions = account.sessions.filter(
      (session) => session.expiresAt.getTime() > now.getTime(),
    );
    const expiredSessions = account.sessions.filter(
      (session) => session.expiresAt.getTime() <= now.getTime(),
    );
    const lastSeenAt = latestDate(account.sessions.map((session) => session.lastSeenAt));
    const pendingSetupLink = account.passwordResetTokens.some(
      (token) => !token.usedAt && token.expiresAt.getTime() > now.getTime(),
    );
    const usedSetupLink = account.passwordResetTokens.some((token) => token.usedAt);
    const expiredSetupLink = account.passwordResetTokens.some(
      (token) => !token.usedAt && token.expiresAt.getTime() <= now.getTime(),
    );
    const daysFromLastSeen = daysSince(lastSeenAt, now);
    const activityStatus =
      account.status !== "ACTIVE"
        ? "Suspended"
        : daysFromLastSeen === null
          ? "Never logged in"
          : daysFromLastSeen > 30
            ? "Inactive 30+ days"
            : "Active recently";
    const inviteStatus = pendingSetupLink
      ? "Pending setup link"
      : usedSetupLink
        ? "Setup link used"
        : expiredSetupLink
          ? "Expired setup link"
          : "No setup link";
    const sessionStatus = activeSessions.length
      ? "Has active session"
      : account.sessions.length
        ? "No active session"
        : "Never signed in";
    const adminTwoFactorStatus =
      account.role === "ADMIN"
        ? account.twoFactorEnabled
          ? "Admin with 2FA"
          : "Admin without 2FA"
        : "Not admin";
    const dims: Row = {
      activityStatus,
      adminTwoFactorStatus,
      day: dayKey(account.createdAt, timezone),
      inviteStatus,
      month: monthKey(account.createdAt, timezone),
      role: enumLabel(account.role),
      roleTemplate: groupText(account.roleTemplate, "No role template"),
      sessionStatus,
      status: enumLabel(account.status),
      twoFactorStatus: account.twoFactorEnabled
        ? "2FA enabled"
        : "2FA not enabled",
      user: groupText(account.name || account.email, "Unnamed user"),
      week: weekKey(account.createdAt, timezone),
    };
    if (!matchesTextFilters(dims, plan)) continue;

    const selectedDims = Object.fromEntries(
      plan.dimensions.map((dimension) => [
        dimension,
        dims[dimension] ?? "None",
      ]),
    ) as Row;
    const key = groupKey(
      plan.dimensions.map((dimension) => selectedDims[dimension]),
    );
    const group = groups.get(key) ?? { dims: selectedDims, items: [] };
    group.items.push({
      activeSessionCount: activeSessions.length,
      expiredSessionCount: expiredSessions.length,
      id: account.id,
      inactive: activityStatus !== "Active recently",
      isActive: account.status === "ACTIVE",
      isAdmin: account.role === "ADMIN",
      pendingSetupLink,
      suspended: account.status !== "ACTIVE",
      twoFactorEnabled: account.twoFactorEnabled,
    });
    groups.set(key, group);
  }

  return Array.from(groups.values()).map((group) => {
    const row: Row = { ...group.dims };

    row.userCount = group.items.length;
    row.activeUsers = group.items.filter((item) => item.isActive).length;
    row.suspendedUsers = group.items.filter((item) => item.suspended).length;
    row.adminUsers = group.items.filter((item) => item.isAdmin).length;
    row.twoFactorEnabled = group.items.filter((item) => item.twoFactorEnabled)
      .length;
    row.twoFactorMissing = group.items.filter((item) => !item.twoFactorEnabled)
      .length;
    row.activeSessions = group.items.reduce(
      (total, item) => total + item.activeSessionCount,
      0,
    );
    row.expiredSessions = group.items.reduce(
      (total, item) => total + item.expiredSessionCount,
      0,
    );
    row.pendingSetupLinks = group.items.filter((item) => item.pendingSetupLink)
      .length;
    row.inactiveUsers = group.items.filter((item) => item.inactive).length;

    return row;
  });
}

function megabytes(bytes: number) {
  return Math.round((bytes / 1_048_576) * 10) / 10;
}

async function storageAssetRows(
  user: ReportUser,
  plan: ReportPlan,
  timezone: string,
) {
  const range = rangeFromPlan(plan);
  const where: Prisma.FileAssetWhereInput = {
    ...(user.role === "ADMIN" ? {} : { uploadedById: user.id }),
    ...(range ? { createdAt: { gte: range.from, lte: range.to } } : {}),
  };
  const files = await prisma.fileAsset.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: maxRows,
    select: {
      bucket: true,
      createdAt: true,
      entityId: true,
      entityType: true,
      id: true,
      mimeType: true,
      originalName: true,
      productImages: { select: { id: true } },
      sizeBytes: true,
      storageProvider: true,
      uploadedBy: { select: { name: true } },
      uploadedById: true,
      visibility: true,
    },
  });
  const groups = new Map<
    string,
    {
      dims: Row;
      items: typeof files;
    }
  >();

  for (const file of files) {
    const linkedToProduct = file.productImages.length > 0;
    const linked = Boolean(file.entityType && file.entityId) || linkedToProduct;
    const entityType =
      file.entityType ??
      (linkedToProduct ? "Product image" : "No linked record");
    const dims: Row = {
      day: dayKey(file.createdAt, timezone),
      entityType: groupText(entityType, "No linked record"),
      file: groupText(file.originalName, "Unnamed file"),
      linkStatus: linked ? "Linked record" : "Unlinked",
      mimeType: groupText(file.mimeType, "Unknown MIME type"),
      month: monthKey(file.createdAt, timezone),
      ownerStatus: file.uploadedById ? "Has uploader" : "No uploader",
      provider: groupText(file.storageProvider, "Unknown provider"),
      uploader: groupText(file.uploadedBy?.name, "No uploader"),
      visibility: enumLabel(file.visibility),
      week: weekKey(file.createdAt, timezone),
    };
    if (!matchesTextFilters(dims, plan)) continue;

    const selectedDims = Object.fromEntries(
      plan.dimensions.map((dimension) => [
        dimension,
        dims[dimension] ?? "None",
      ]),
    ) as Row;
    const key = groupKey(
      plan.dimensions.map((dimension) => selectedDims[dimension]),
    );
    const group = groups.get(key) ?? { dims: selectedDims, items: [] };
    group.items.push(file);
    groups.set(key, group);
  }

  const now = new Date();

  return Array.from(groups.values()).map((group) => {
    const totalBytes = group.items.reduce(
      (total, item) => total + item.sizeBytes,
      0,
    );
    const largestBytes = Math.max(...group.items.map((item) => item.sizeBytes), 0);
    const latestUploadAt = latestDate(group.items.map((item) => item.createdAt));
    const row: Row = { ...group.dims };

    row.fileCount = group.items.length;
    row.totalSizeMb = megabytes(totalBytes);
    row.avgSizeMb = megabytes(
      group.items.length ? Math.round(totalBytes / group.items.length) : 0,
    );
    row.largestSizeMb = megabytes(largestBytes);
    row.latestUploadAgeDays = daysSince(latestUploadAt, now) ?? 0;
    row.privateFiles = group.items.filter((item) => item.visibility === "PRIVATE")
      .length;
    row.publicFiles = group.items.filter((item) => item.visibility === "PUBLIC")
      .length;
    row.linkedFiles = group.items.filter(
      (item) => Boolean(item.entityType && item.entityId) || item.productImages.length,
    ).length;
    row.unlinkedFiles = group.items.filter(
      (item) => !item.entityType && !item.entityId && !item.productImages.length,
    ).length;
    row.unownedFiles = group.items.filter((item) => !item.uploadedById).length;

    return row;
  });
}

export async function runReportPlan({
  auditUserId,
  prompt,
  reportDefinitionId,
  user,
  plan,
}: {
  auditUserId?: string | null;
  prompt?: string | null;
  reportDefinitionId?: string | null;
  user: ReportUser;
  plan: ReportPlan;
}): Promise<ReportResult> {
  const startedAt = Date.now();
  const safePlan = sanitiseReportPlan(plan);
  const dataset = datasetFor(safePlan.dataset);
  const timezone = await reportTimezone();
  let rows =
    dataset.id === "calls"
      ? await callRows(user, safePlan, timezone)
      : dataset.id === "tasks"
        ? await taskRows(user, safePlan, timezone)
        : dataset.id === "communications"
          ? await communicationRows(user, safePlan, timezone)
          : dataset.id === "opportunity_products"
            ? await productRows(user, safePlan, timezone)
            : dataset.id === "marketing_attribution"
              ? await attributionRows(user, safePlan, timezone)
              : dataset.id === "form_submissions"
                ? await formSubmissionRows(user, safePlan, timezone)
                : dataset.id === "discovery_answers"
                  ? await discoveryRows(user, safePlan, timezone)
                : dataset.id === "sales_lifecycle"
                  ? await lifecycleRows(user, safePlan, timezone)
                  : dataset.id === "setup_readiness"
                    ? await setupRows(user, safePlan)
                    : dataset.id === "contacts_clients"
                      ? await contactClientRows(user, safePlan, timezone)
                      : dataset.id === "users_security"
                        ? await userSecurityRows(user, safePlan, timezone)
                        : dataset.id === "storage_assets"
                          ? await storageAssetRows(user, safePlan, timezone)
                          : await salesRows(user, safePlan, timezone);

  const sortField = safePlan.sort?.field ?? safePlan.metrics[0];
  const sortDirection = safePlan.sort?.direction === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const left = a[sortField];
    const right = b[sortField];
    if (typeof left === "number" || typeof right === "number") {
      return (Number(left ?? 0) - Number(right ?? 0)) * sortDirection;
    }
    return (
      String(left ?? "").localeCompare(String(right ?? "")) * sortDirection
    );
  });
  rows = rows.slice(0, safePlan.limit ?? 20);

  const columns = [...safePlan.dimensions, ...safePlan.metrics].map((field) =>
    columnFor(dataset, field),
  );
  const xField = safePlan.dimensions[0] ?? null;
  const title = safePlan.title ?? dataset.label;
  const emptyState = rows.length
    ? null
    : reportEmptyStateMessage(dataset.id, safePlan);
  const summary = rows.length
    ? `${title}: ${rows.length} row${rows.length === 1 ? "" : "s"} using ${dataset.label}.`
    : `${title}: no rows returned. ${emptyState}`;
  const result: ReportResult = {
    plan: safePlan,
    title,
    summary,
    columns,
    rows,
    chart: {
      type: safePlan.chartType,
      xField,
      yFields: safePlan.metrics,
    },
    generatedAt: new Date().toISOString(),
    rowCount: rows.length,
    emptyState,
  };

  await prisma.reportRun
    .create({
      data: {
        config: safePlan as unknown as Prisma.InputJsonObject,
        durationMs: Date.now() - startedAt,
        prompt: prompt ?? null,
        reportDefinitionId: reportDefinitionId ?? null,
        rowCount: rows.length,
        status: "COMPLETED",
        summary,
        userId: auditUserId === undefined ? user.id : auditUserId,
      },
    })
    .catch((error) => console.error("Report run audit failed", error));

  return result;
}

function previousAndCurrentMonthDateRange() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

  return {
    preset: "custom" as const,
    from: from.toISOString(),
    to: now.toISOString(),
  };
}

export function reportPlanFromPrompt(message: string): ReportPlan {
  const lower = message.toLowerCase();
  const asksForComparison =
    /\b(compare|compared|comparison|versus|vs\.?|against|difference|trend)\b/.test(
      lower,
    );
  const asksForLeadPeriodComparison =
    asksForComparison &&
    /\b(leads?|enquir(?:y|ies)|opportunities?|deals?)\b/.test(lower) &&
    /\b(day|days|week|weeks|month|months|quarter|year|period)\b/.test(lower);
  const asksForMonthComparison =
    asksForLeadPeriodComparison &&
    (/\bmonths?\b/.test(lower) ||
      /\bthis month\b/.test(lower) ||
      /\blast month\b/.test(lower));
  const asksForWeekComparison =
    asksForLeadPeriodComparison &&
    !asksForMonthComparison &&
    /\bweeks?\b/.test(lower);
  const asksForLeadOwnership =
    /\bagents?\b/.test(lower) ||
    /\bowners?\b/.test(lower) ||
    /\breps?\b/.test(lower) ||
    lower.includes("sales rep") ||
    lower.includes("assigned to") ||
    lower.includes("assigned user") ||
    lower.includes("salesperson") ||
    lower.includes("sales person") ||
    lower.includes("who has the most leads");
  const asksForOpenLeads =
    /\b(open|active|current|unclosed|not closed)\b/.test(lower) &&
    /\b(leads?|enquir(?:y|ies)|opportunities?|deals?)\b/.test(lower);
  const asksForLeadTimePerformance =
    /\b(best|worst|most|least|strongest|weakest|peak|busiest|quietest|top|bottom)\b/.test(
      lower,
    ) &&
    /\b(leads?|enquir(?:y|ies)|opportunities?|deals?)\b/.test(lower) &&
    /\b(day|weekday|week day|hour|time|when)\b/.test(lower);
  const asksForHourPerformance =
    /\b(hour|time of day|time)\b/.test(lower) &&
    !/\b(day|weekday|week day)\b/.test(lower);
  const asksForExactDayTrend =
    /\b(date|daily|each day|per day)\b/.test(lower);
  const asksForProductDemand =
    /\b(leads?|enquir(?:y|ies)|opportunities?|deals?)\b/.test(lower) &&
    /\b(products?|services?|product types?|categories?)\b/.test(lower) &&
    /\b(most|least|top|bottom|best|worst|asked for|asking for|interested in|request(?:ed|s)?|require(?:d|s)?|need(?:ed|s)?)\b/.test(
      lower,
    );
  const asksForCatalogueProductPerformance =
    /\b(products?|product records?|product types?|product categories?|catalogue|catalog|skus?)\b/.test(
      lower,
    ) &&
    /\b(most|least|top|bottom|best|worst|converting|conversion|performance|pipeline|revenue|demand|asked for|asking for|interested in|request(?:ed|s)?|require(?:d|s)?|need(?:ed|s)?)\b/.test(
      lower,
    );
  const asksForCatalogueProductDemand =
    (asksForProductDemand || asksForCatalogueProductPerformance) &&
    /\b(products?|product records?|product types?|product categories?|catalogue|catalog|skus?|categories?)\b/.test(
      lower,
    );
  const asksForContactsClients =
    /\b(contacts?|clients?|customers?|companies?)\b/.test(lower) &&
    /\b(which|what|show|list|report|chart|breakdown|most|least|top|bottom|open opportunities?|open leads?|activity|recent|inactive|contacted|paid ads?|submitted forms?|form submissions?|no open leads?|without open)\b/.test(
      lower,
    );
  const asksForUsersSecurity =
    /\b(users?|accounts?|admins?|administrators?|team members?|2fa|two[- ]?factor|mfa|setup links?|invites?|invitations?|logged in|login|role|roles|security)\b/.test(
      lower,
    ) &&
    /\b(which|what|show|list|report|chart|breakdown|active|inactive|pending|enabled|missing|without|not enabled|not logged|recent|role|roles|admins?|2fa|two[- ]?factor|mfa|invites?|setup links?)\b/.test(
      lower,
    );
  const asksForStorageAssets =
    /\b(storage|files?|uploads?|assets?|media|documents?)\b/.test(lower) &&
    /\b(which|what|show|list|report|chart|breakdown|how much|using|usage|space|size|largest|most space|recent|uploaded|owner|without owner|linked record|unlinked|no owner)\b/.test(
      lower,
    );
  const asksForCommunicationReport =
    /\b(emails?|mail|sms|texts?|text messages?|whatsapp|communications?|messages?|replies?|responses?|inbound|outbound)\b/.test(
      lower,
    ) &&
    /\b(which|what|show|list|how many|count|number|total|most|least|top|bottom|sent|send|received|inbound|outbound|replies?|responses?|users?|owners?|channels?|directions?|contacts?)\b/.test(
      lower,
    );
  const asksForMarketingAttribution =
    /\b(marketing|attribution|campaigns?|utm|touchpoints?|visitors?|sessions?|landing pages?|landing|pages?|referrers?|medium|channels?|sources?|paid|organic|google ads|bing ads|microsoft ads|linkedin ads|meta ads|facebook ads|ad platforms?|platforms?|search console|search terms?|queries?|cost|spend|cpl|cost per lead)\b/.test(
      lower,
    ) &&
    /\b(leads?|enquiries?|conversions?|source|sources|campaigns?|visitors?|sessions?|touchpoints?|landing|pages?|referrers?|quality|best|worst|most|least|top|bottom|converting|performance|generat(?:e|ed|ing)|queries?|terms?|platforms?|cost|spend|cpl|focus)\b/.test(
      lower,
    );
  const asksForFormSubmissions =
    /\b(forms?|form fields?|submitted fields?|submissions?|submitted forms?|website enquiries?|enquiry forms?)\b/.test(
      lower,
    ) &&
    /\b(which|what|show|list|report|chart|breakdown|most|least|top|bottom|common|missing|generate|generates|generated|leads?|fields?|email|phone|contact details?)\b/.test(
      lower,
    );
  const asksForDiscoveryAnswers =
    /\b(discovery|qualification|questions?|answers?|budget|budgets|timeframes?|timescales?|timeline|deadline|platforms?|requirements?|decision makers?|example sites?|competitors?|brand guidelines?)\b/.test(
      lower,
    ) &&
    /\b(leads?|opportunities?|customers?|answers?|fields?|questions?|most|least|top|bottom|common|selected|chosen|preferred|prefer|need(?:ed|s)?|want(?:ed|s)?|budget|timeframe|timescale|platform|requirements?)\b/.test(
      lower,
    ) &&
    !(
      asksForMarketingAttribution &&
      !/\b(discovery|qualification|questions?|answers?)\b/.test(lower)
    );
  const asksForSalesLifecycle =
    /\b(sales quality|lifecycle|contacted rate|contact rate|first response|response time|time[- ]?to[- ]?close|close time|lost reasons?|stage changes?|stage movement|stage transitions?|transitions?)\b/.test(
      lower,
    ) &&
    /\b(leads?|opportunities?|deals?|sales?|owners?|sources?|stages?|reasons?|rate|time|average|avg|most|least|top|bottom|which|what|show|compare|breakdown)\b/.test(
      lower,
    );
  const asksForTelephony =
    /\b(calls?|phone|telephony|queue|queues?|queued|wait time|recordings?|transcripts?|voicemail|missed calls?|answered calls?)\b/.test(
      lower,
    ) &&
    /\b(which|what|show|list|compare|breakdown|report|chart|most|least|top|bottom|average|avg|rate|time|ready|missing|needs?|status|agents?|assignees?)\b/.test(
      lower,
    );
  const asksForSetupReadiness =
    /\b(setup|readiness|handover|go[- ]?live|launch|client setup|system readiness|deployment readiness|outstanding|not ready|needs attention|checklist)\b/.test(
      lower,
    ) &&
    /\b(which|what|show|list|report|chart|breakdown|status|ready|needed|warning|outstanding|complete|completion|handover|launch|client|system|deployment)\b/.test(
      lower,
    );
  const hasDateIntent =
    lower.includes("today") ||
    lower.includes("yesterday") ||
    lower.includes("week") ||
    lower.includes("month") ||
    lower.includes("quarter") ||
    lower.includes("year") ||
    lower.includes("days") ||
    /\b(7|30|90|180|365)\b/.test(lower);
  let dataset = "sales_opportunities";
  if (asksForCommunicationReport) {
    dataset = "communications";
  } else if (asksForContactsClients) {
    dataset = "contacts_clients";
  } else if (asksForUsersSecurity) {
    dataset = "users_security";
  } else if (asksForStorageAssets) {
    dataset = "storage_assets";
  } else if (asksForDiscoveryAnswers) {
    dataset = "discovery_answers";
  } else if (asksForMarketingAttribution) {
    dataset = "marketing_attribution";
  } else if (asksForFormSubmissions) {
    dataset = "form_submissions";
  } else if (asksForSalesLifecycle) {
    dataset = "sales_lifecycle";
  } else if (asksForTelephony || lower.includes("call")) {
    dataset = "calls";
  } else if (asksForSetupReadiness) {
    dataset = "setup_readiness";
  } else if (lower.includes("task") || lower.includes("follow")) {
    dataset = "tasks";
  } else if (
    lower.includes("email") ||
    lower.includes("sms") ||
    lower.includes("communication")
  ) {
    dataset = "communications";
  } else if (asksForCatalogueProductDemand) {
    dataset = "opportunity_products";
  }
  let dateRange: ReportPlan["dateRange"];
  if (asksForMonthComparison) {
    dateRange = previousAndCurrentMonthDateRange();
  } else if (asksForWeekComparison || asksForLeadPeriodComparison) {
    dateRange = { preset: "30d" };
  } else if (
    (asksForLeadOwnership ||
      asksForLeadTimePerformance ||
      asksForProductDemand ||
      asksForCatalogueProductDemand ||
      asksForContactsClients ||
      asksForUsersSecurity ||
      asksForStorageAssets ||
      asksForCommunicationReport ||
      asksForMarketingAttribution ||
      asksForFormSubmissions ||
      asksForDiscoveryAnswers ||
      asksForSalesLifecycle) &&
      !asksForSetupReadiness &&
    !hasDateIntent
  ) {
    dateRange = { preset: "all" };
  } else if (lower.includes("year")) {
    dateRange = { preset: "365d" };
  } else if (lower.includes("quarter") || lower.includes("90")) {
    dateRange = { preset: "90d" };
  } else if (lower.includes("week") || lower.includes("7")) {
    dateRange = { preset: "7d" };
  } else {
    dateRange = { preset: "30d" };
  }

  if (dataset === "calls") {
    let callDimensions: string[] = ["day"];
    if (lower.includes("queue") || lower.includes("wait")) {
      callDimensions =
        lower.includes("agent") || lower.includes("assignee")
          ? ["queueAssignee"]
          : ["queueStatus"];
    } else if (lower.includes("transcript")) {
      callDimensions = ["transcriptStatus"];
    } else if (lower.includes("recording")) {
      callDimensions = ["recordingStatus"];
    } else if (lower.includes("contact")) {
      callDimensions = ["contactStatus"];
    } else if (lower.includes("opportunity") || lower.includes("lead")) {
      callDimensions = ["opportunityStatus"];
    } else if (lower.includes("number")) {
      callDimensions = ["number"];
    } else if (lower.includes("agent")) {
      callDimensions = ["agent"];
    } else if (lower.includes("status")) {
      callDimensions = ["status"];
    } else if (lower.includes("month")) {
      callDimensions = ["month"];
    } else if (lower.includes("week")) {
      callDimensions = ["week"];
    }
    const asksForMissingTranscripts =
      lower.includes("missing") ||
      lower.includes("need") ||
      lower.includes("without") ||
      lower.includes("not ready");
    const callMetrics = lower.includes("queue") || lower.includes("wait")
      ? lower.includes("wait") || lower.includes("longest")
        ? ["avgQueueWaitSeconds", "maxQueueWaitSeconds", "queuedCalls"]
        : ["queuedCalls", "avgQueueWaitSeconds", "abandonedCalls"]
      : lower.includes("transcript")
        ? asksForMissingTranscripts
          ? ["transcriptMissing", "recordingCount", "transcriptReady"]
          : ["recordingCount", "transcriptReady", "transcriptMissing"]
        : lower.includes("recording")
          ? ["recordingCount", "callCount", "avgDuration"]
          : lower.includes("missed") || lower.includes("no answer")
            ? ["callCount", "missedCalls", "abandonedCalls"]
            : ["callCount", "answeredCalls", "avgDuration"];
    const isTimeCallReport = ["month", "week", "day"].includes(
      callDimensions[0],
    );

    return sanitiseReportPlan({
      dataset,
      dateRange,
      dimensions: callDimensions,
      metrics: callMetrics,
      chartType: isTimeCallReport || lower.includes("trend") ? "line" : "bar",
      sort: isTimeCallReport
        ? { field: callDimensions[0], direction: "asc" }
        : { field: callMetrics[0], direction: "desc" },
      title: lower.includes("queue") || lower.includes("wait")
        ? "Call queue performance"
        : lower.includes("transcript")
          ? "Call transcript readiness"
          : lower.includes("recording")
            ? "Call recording coverage"
            : "AI call report",
    });
  }

  if (dataset === "contacts_clients") {
    const asksForCompanies =
      /\b(clients?|customers?|companies?)\b/.test(lower) &&
      !/\bcontacts?\b/.test(lower);
    const asksForNoOpenOpportunity =
      /\b(no open|without open|no active)\b/.test(lower) &&
      /\b(leads?|opportunities?|deals?)\b/.test(lower);
    const asksForOpenOpportunity =
      !asksForNoOpenOpportunity &&
      /\b(open opportunities?|open leads?|open deals?)\b/.test(lower);
    const asksForNoRecentContact =
      /\b(not contacted|no recent contact|not been contacted|inactive)\b/.test(
        lower,
      );
    const asksForRecentActivity =
      /\b(activity|recent activity|most recent)\b/.test(lower);
    const asksForFormOrigin =
      /\b(submitted forms?|form submissions?|website enquiries?)\b/.test(lower);
    const asksForPaidOrigin = /\b(paid ads?|paid|google ads|meta|facebook|linkedin|bing)\b/.test(
      lower,
    );
    const contactDimensions = asksForNoRecentContact
      ? ["contact"]
      : asksForOpenOpportunity || asksForNoOpenOpportunity || asksForFormOrigin
        ? ["contact"]
        : asksForPaidOrigin
          ? ["source"]
          : asksForRecentActivity && asksForCompanies
            ? ["company"]
            : asksForRecentActivity
              ? ["contact"]
              : lower.includes("owner")
                ? ["owner"]
                : lower.includes("source")
                  ? ["source"]
                  : lower.includes("status")
                    ? ["contactStatus"]
                    : lower.includes("month")
                      ? ["month"]
                      : lower.includes("week")
                        ? ["week"]
                        : lower.includes("day")
                          ? ["day"]
                          : asksForCompanies
                            ? ["company"]
                            : ["contact"];
    const contactFilters: ReportFilter[] = [];

    if (asksForOpenOpportunity) {
      contactFilters.push({
        field: "openOpportunityStatus",
        operator: "equals",
        value: "Has open opportunity",
      });
    }
    if (asksForNoOpenOpportunity) {
      contactFilters.push({
        field: "openOpportunityStatus",
        operator: "equals",
        value: "No open opportunity",
      });
    }
    if (asksForNoRecentContact) {
      contactFilters.push({
        field: "contactStatus",
        operator: "not_equals",
        value: "Recently contacted",
      });
    }
    if (asksForFormOrigin) {
      contactFilters.push({
        field: "formStatus",
        operator: "equals",
        value: "Submitted form",
      });
    }
    if (asksForPaidOrigin) {
      contactFilters.push({
        field: "paidStatus",
        operator: "equals",
        value: "Paid ads",
      });
    }

    const isTimeContactReport = ["month", "week", "day"].includes(
      contactDimensions[0],
    );
    const contactMetrics = asksForNoRecentContact
      ? ["noRecentContact", "avgDaysSinceLastContact", "openOpportunities"]
      : asksForFormOrigin
        ? ["formSubmissions", "contactCount", "openOpportunities"]
        : asksForPaidOrigin
          ? ["paidAdContacts", "contactCount", "openOpportunities"]
          : asksForOpenOpportunity || asksForNoOpenOpportunity
            ? ["openOpportunities", "contactCount", "opportunities"]
            : asksForRecentActivity
              ? ["recentActivities", "contactCount", "openOpportunities"]
              : ["contactCount", "openOpportunities", "recentActivities"];

    return sanitiseReportPlan({
      dataset,
      dateRange,
      dimensions: contactDimensions,
      filters: contactFilters,
      metrics: contactMetrics,
      chartType:
        isTimeContactReport || lower.includes("trend") ? "line" : "bar",
      sort: isTimeContactReport
        ? { field: contactDimensions[0], direction: "asc" }
        : { field: contactMetrics[0], direction: "desc" },
      limit: 12,
      title: asksForNoRecentContact
        ? "Contacts needing contact"
        : asksForOpenOpportunity
          ? "Contacts with open opportunities"
          : asksForFormOrigin
            ? "Form contacts"
            : asksForPaidOrigin
              ? "Paid-ad contacts"
              : asksForRecentActivity
                ? "Client activity"
                : "Contacts and clients",
    });
  }

  if (dataset === "users_security") {
    const asksForTwoFactor =
      /\b(2fa|two[- ]?factor|mfa)\b/.test(lower);
    const asksForMissingTwoFactor =
      asksForTwoFactor &&
      /\b(not enabled|without|missing|disabled|have not|haven't|do not have|don't have|does not have|doesn't have|not have)\b/.test(
        lower,
      );
    const asksForAdminWithoutTwoFactor =
      asksForMissingTwoFactor &&
      /\b(admins?|administrators?)\b/.test(lower);
    const asksForPendingInvites =
      /\b(pending|waiting|still pending)\b/.test(lower) &&
      /\b(invites?|invitations?|setup links?)\b/.test(lower);
    const asksForInactive =
      /\b(inactive|not logged|not signed|no active session|look inactive)\b/.test(
        lower,
      );
    const asksForRole = /\b(role|roles)\b/.test(lower);
    const asksForActiveUsers =
      /\bactive users?\b/.test(lower) || /\bactive accounts?\b/.test(lower);
    const userDimensions = asksForRole
      ? ["role"]
      : asksForAdminWithoutTwoFactor ||
          asksForMissingTwoFactor ||
          asksForPendingInvites ||
          asksForInactive
        ? ["user"]
        : asksForTwoFactor
          ? ["twoFactorStatus"]
          : lower.includes("session")
            ? ["sessionStatus"]
            : lower.includes("status")
              ? ["status"]
              : ["role"];
    const userFilters: ReportFilter[] = [];

    if (asksForActiveUsers) {
      userFilters.push({ field: "status", operator: "equals", value: "Active" });
    }
    if (asksForMissingTwoFactor) {
      userFilters.push({
        field: "twoFactorStatus",
        operator: "equals",
        value: "2FA not enabled",
      });
    }
    if (asksForAdminWithoutTwoFactor) {
      userFilters.push({
        field: "adminTwoFactorStatus",
        operator: "equals",
        value: "Admin without 2FA",
      });
    }
    if (asksForPendingInvites) {
      userFilters.push({
        field: "inviteStatus",
        operator: "equals",
        value: "Pending setup link",
      });
    }
    if (asksForInactive) {
      userFilters.push({
        field: "activityStatus",
        operator: "not_equals",
        value: "Active recently",
      });
    }

    const userMetrics = asksForMissingTwoFactor
      ? ["twoFactorMissing", "userCount", "activeSessions"]
      : asksForPendingInvites
        ? ["pendingSetupLinks", "userCount", "activeUsers"]
        : asksForInactive
          ? ["inactiveUsers", "userCount", "activeSessions"]
          : asksForRole || asksForActiveUsers
            ? ["activeUsers", "userCount", "adminUsers"]
            : ["userCount", "twoFactorMissing", "activeSessions"];

    return sanitiseReportPlan({
      dataset,
      dateRange,
      dimensions: userDimensions,
      filters: userFilters,
      metrics: userMetrics,
      chartType: "bar",
      sort: { field: userMetrics[0], direction: "desc" },
      limit: 12,
      title: asksForAdminWithoutTwoFactor
        ? "Admin accounts without 2FA"
        : asksForMissingTwoFactor
          ? "Users missing 2FA"
          : asksForPendingInvites
            ? "Pending user setup links"
            : asksForInactive
              ? "Inactive users"
              : "User security",
    });
  }

  if (dataset === "storage_assets") {
    const asksForLargest =
      /\b(largest|biggest|most space|taking.*space|size)\b/.test(lower);
    const asksForRecent = /\b(recent|latest)\b/.test(lower);
    const asksForUnlinked =
      /\b(unlinked|not linked|without.*linked|no linked|without.*record|no record)\b/.test(
        lower,
      );
    const asksForRecordsWithFiles =
      !asksForUnlinked &&
      /\b(records?|linked records?)\b/.test(lower) &&
      /\b(uploaded files?|files?|uploads?)\b/.test(lower);
    const asksForUnowned =
      /\b(without.*owner|no owner|without.*uploader|no uploader)\b/.test(lower);
    const storageDimensions = asksForLargest || asksForRecent
      ? ["file"]
      : asksForRecordsWithFiles || asksForUnlinked || lower.includes("record")
        ? ["entityType"]
        : asksForUnowned || lower.includes("owner")
          ? ["uploader"]
          : lower.includes("visibility")
            ? ["visibility"]
            : lower.includes("type")
              ? ["mimeType"]
              : lower.includes("month")
                ? ["month"]
                : lower.includes("week")
                  ? ["week"]
                  : lower.includes("day")
                    ? ["day"]
                    : ["entityType"];
    const storageFilters: ReportFilter[] = [];

    if (asksForUnlinked) {
      storageFilters.push({
        field: "linkStatus",
        operator: "equals",
        value: "Unlinked",
      });
    }
    if (asksForUnowned) {
      storageFilters.push({
        field: "ownerStatus",
        operator: "equals",
        value: "No uploader",
      });
    }
    if (asksForRecordsWithFiles) {
      storageFilters.push({
        field: "linkStatus",
        operator: "equals",
        value: "Linked record",
      });
    }

    const isTimeStorageReport = ["month", "week", "day"].includes(
      storageDimensions[0],
    );
    const storageMetrics = asksForLargest
      ? ["largestSizeMb", "totalSizeMb", "fileCount"]
      : asksForRecent
        ? ["latestUploadAgeDays", "fileCount", "totalSizeMb"]
        : asksForUnlinked || asksForUnowned
          ? ["unlinkedFiles", "unownedFiles", "fileCount"]
          : asksForRecordsWithFiles
            ? ["linkedFiles", "fileCount", "totalSizeMb"]
            : ["totalSizeMb", "fileCount", "unlinkedFiles"];

    return sanitiseReportPlan({
      dataset,
      dateRange: asksForRecent ? { preset: "30d" } : dateRange,
      dimensions: storageDimensions,
      filters: storageFilters,
      metrics: storageMetrics,
      chartType: isTimeStorageReport || lower.includes("trend") ? "line" : "bar",
      sort: asksForRecent
        ? { field: "latestUploadAgeDays", direction: "asc" }
        : isTimeStorageReport
          ? { field: storageDimensions[0], direction: "asc" }
          : { field: storageMetrics[0], direction: "desc" },
      limit: 12,
      title: asksForLargest
        ? "Largest stored files"
        : asksForRecent
          ? "Recent uploads"
          : asksForRecordsWithFiles
            ? "Uploaded files by record type"
            : asksForUnlinked || asksForUnowned
            ? "Storage files needing review"
            : "Storage usage",
    });
  }

  if (dataset === "form_submissions") {
    const asksForMissingDetails =
      lower.includes("missing") ||
      lower.includes("without") ||
      lower.includes("no email") ||
      lower.includes("no phone");
    const formDimensions = asksForMissingDetails
      ? ["missingStatus"]
      : lower.includes("field")
        ? ["field"]
        : lower.includes("type")
          ? ["fieldType"]
          : lower.includes("source") || lower.includes("channel")
            ? ["source"]
            : lower.includes("campaign")
              ? ["campaign"]
              : lower.includes("landing")
                ? ["landingPage"]
                : lower.includes("page")
                  ? ["currentPage"]
                  : lower.includes("month")
                    ? ["month"]
                    : lower.includes("week")
                      ? ["week"]
                      : lower.includes("day")
                        ? ["day"]
                        : ["form"];
    const isTimeFormReport = ["month", "week", "day"].includes(
      formDimensions[0],
    );
    const formMetrics = asksForMissingDetails
      ? ["submissionCount", "missingEmail", "missingPhone"]
      : lower.includes("field")
        ? ["fieldCount", "submissionCount", "messageFields"]
        : ["submissionCount", "fieldCount", "linkedOpportunities"];

    return sanitiseReportPlan({
      dataset,
      dateRange,
      dimensions: formDimensions,
      filters: asksForMissingDetails
        ? [
            {
              field: "missingStatus",
              operator: "not_equals",
              value: "Complete",
            },
          ]
        : [],
      metrics: formMetrics,
      chartType: isTimeFormReport || lower.includes("trend") ? "line" : "bar",
      sort: isTimeFormReport
        ? { field: formDimensions[0], direction: "asc" }
        : { field: formMetrics[0], direction: "desc" },
      limit: 12,
      title: asksForMissingDetails
        ? "Form submissions missing contact details"
        : formDimensions[0] === "field"
          ? "Submitted form fields"
          : "Form submissions",
    });
  }

  if (dataset === "tasks") {
    const asksForOverdue = /\b(overdue|late|past due)\b/.test(lower);
    const asksForDueToday = /\b(due today|today)\b/.test(lower);
    const asksForUpcoming =
      /\b(upcoming|due soon|next|future)\b/.test(lower);
    const asksForCompleted =
      /\b(completed|complete|done|finished|closed)\b/.test(lower);
    const asksForBlocked = /\b(blocked|stuck)\b/.test(lower);
    const asksForUnassigned =
      /\b(unassigned|without assignee|no assignee|not assigned)\b/.test(lower);
    const asksForDueDate =
      asksForOverdue ||
      asksForDueToday ||
      asksForUpcoming ||
      /\b(due date|due dates?|due week|due month|due)\b/.test(lower);
    const taskDimensions = lower.includes("status")
      ? ["status"]
      : lower.includes("creator") || lower.includes("created by")
        ? ["creator"]
        : lower.includes("linked") || lower.includes("record")
          ? ["linkStatus"]
          : (lower.includes("due week") || (asksForDueDate && lower.includes("week")))
            ? ["dueWeek"]
            : (lower.includes("due month") ||
                  (asksForDueDate && lower.includes("month")))
              ? ["dueMonth"]
              : (lower.includes("due day") ||
                    lower.includes("due date") ||
                    (asksForDueDate && /\bdays?\b/.test(lower)))
                ? ["dueDay"]
                : asksForDueDate && !lower.includes("assignee")
                  ? ["dueStatus"]
                  : ["assignee"];
    const taskFilters: ReportFilter[] = [];

    if (asksForOverdue) {
      taskFilters.push({
        field: "dueStatus",
        operator: "equals",
        value: "Overdue",
      });
    } else if (asksForDueToday) {
      taskFilters.push({
        field: "dueStatus",
        operator: "equals",
        value: "Due today",
      });
    } else if (asksForUpcoming) {
      taskFilters.push({
        field: "dueStatus",
        operator: "equals",
        value: "Upcoming",
      });
    }
    if (asksForCompleted) {
      taskFilters.push({ field: "status", operator: "equals", value: "Done" });
    }
    if (asksForBlocked) {
      taskFilters.push({
        field: "status",
        operator: "equals",
        value: "Blocked",
      });
    }
    if (asksForUnassigned) {
      taskFilters.push({
        field: "assignee",
        operator: "equals",
        value: "Unassigned",
      });
    }

    const taskMetrics = asksForOverdue
      ? ["overdueTasks", "avgOverdueDays", "openTasks"]
      : asksForDueToday
        ? ["dueTodayTasks", "openTasks", "taskCount"]
        : asksForUpcoming
          ? ["upcomingTasks", "openTasks", "taskCount"]
          : asksForCompleted
            ? ["completedTasks", "completionRate", "taskCount"]
            : asksForBlocked
              ? ["blockedTasks", "openTasks", "taskCount"]
              : asksForUnassigned
                ? ["unassignedTasks", "openTasks", "taskCount"]
                : ["openTasks", "overdueTasks", "completedTasks"];
    const isTimeTaskReport = [
      "createdDay",
      "dueDay",
      "week",
      "month",
      "dueWeek",
      "dueMonth",
    ].includes(taskDimensions[0]);

    return sanitiseReportPlan({
      dataset,
      dateRange:
        asksForOverdue ||
        asksForDueToday ||
        asksForUpcoming ||
        asksForUnassigned
          ? { preset: "all" }
          : dateRange,
      dimensions: taskDimensions,
      filters: taskFilters,
      metrics: taskMetrics,
      chartType: "bar",
      sort: isTimeTaskReport
        ? { field: taskDimensions[0], direction: "asc" }
        : { field: taskMetrics[0], direction: "desc" },
      limit: 12,
      title: asksForOverdue
        ? "Overdue tasks"
        : asksForDueToday
          ? "Tasks due today"
          : asksForUpcoming
            ? "Upcoming tasks"
            : asksForCompleted
              ? "Completed tasks"
              : asksForBlocked
                ? "Blocked tasks"
                : asksForUnassigned
                  ? "Unassigned tasks"
                  : "Task workload",
    });
  }

  if (dataset === "communications") {
    const asksForEmail = /\b(emails?|mail)\b/.test(lower);
    const asksForSms = /\b(sms|texts?|text messages?)\b/.test(lower);
    const asksForWhatsapp = /\b(whatsapp|whats app)\b/.test(lower);
    const asksForPhone = /\b(phone|calls?)\b/.test(lower);
    const asksForNotes = /\b(notes?)\b/.test(lower);
    const asksForSystem = /\b(system)\b/.test(lower);
    const asksForInbound =
      /\b(inbound|incoming|received|replies?|responses?|responded)\b/.test(
        lower,
      );
    const asksForOutbound =
      /\b(outbound|outgoing|sent|send|sends|replied|responded)\b/.test(lower);
    const asksForMissingContact =
      /\b(missing.*contacts?|without.*contacts?|no contacts?|unlinked contacts?)\b/.test(
        lower,
      );
    const communicationDimensions = lower.includes("direction")
      ? ["direction"]
      : lower.includes("channel")
        ? ["channel"]
        : lower.includes("lead owner") || lower.includes("opportunity owner")
          ? ["opportunityOwner"]
          : lower.includes("owner") || lower.includes("user")
            ? ["owner"]
            : lower.includes("stage")
              ? ["pipelineStage"]
              : lower.includes("source")
                ? ["source"]
                : lower.includes("contact")
                  ? ["contactStatus"]
                  : lower.includes("month")
                    ? ["month"]
                    : lower.includes("day")
                      ? ["day"]
                      : lower.includes("week")
                        ? ["week"]
                        : asksForInbound || asksForOutbound
                          ? ["direction"]
                          : ["channel"];
    const communicationFilters: ReportFilter[] = [];
    const channelFilterValue = asksForEmail
      ? "Email"
      : asksForSms
        ? "Sms"
        : asksForWhatsapp
          ? "Whatsapp"
          : asksForPhone
            ? "Phone"
            : asksForNotes
              ? "Note"
              : asksForSystem
                ? "System"
                : null;

    if (channelFilterValue) {
      communicationFilters.push({
        field: "channel",
        operator: "equals",
        value: channelFilterValue,
      });
    }
    if (asksForInbound && !asksForOutbound) {
      communicationFilters.push({
        field: "direction",
        operator: "equals",
        value: "Inbound",
      });
    } else if (asksForOutbound && !asksForInbound) {
      communicationFilters.push({
        field: "direction",
        operator: "equals",
        value: "Outbound",
      });
    }
    if (asksForMissingContact) {
      communicationFilters.push({
        field: "contactStatus",
        operator: "equals",
        value: "No linked contact",
      });
    }

    const communicationMetrics = asksForEmail
      ? ["emailCount", "outboundCount", "inboundCount"]
      : asksForSms
        ? ["smsCount", "outboundCount", "inboundCount"]
        : asksForWhatsapp
          ? ["whatsappCount", "outboundCount", "inboundCount"]
          : asksForPhone
            ? ["phoneCount", "inboundCount", "outboundCount"]
            : asksForMissingContact
              ? ["unlinkedContacts", "communicationCount", "uniqueLeads"]
              : asksForInbound || asksForOutbound
                ? ["communicationCount", "inboundCount", "outboundCount"]
                : ["communicationCount", "inboundCount", "outboundCount"];
    const isTimeCommunicationReport = ["day", "week", "month"].includes(
      communicationDimensions[0],
    );

    return sanitiseReportPlan({
      dataset,
      dateRange,
      dimensions: communicationDimensions,
      filters: communicationFilters,
      metrics: communicationMetrics,
      chartType: isTimeCommunicationReport ? "line" : "bar",
      sort: isTimeCommunicationReport
        ? { field: communicationDimensions[0], direction: "asc" }
        : { field: communicationMetrics[0], direction: "desc" },
      limit: 12,
      title: asksForEmail
        ? "Email communication activity"
        : asksForSms
          ? "SMS communication activity"
          : asksForWhatsapp
            ? "WhatsApp communication activity"
            : asksForPhone
              ? "Phone communication activity"
              : asksForMissingContact
                ? "Communications missing linked contacts"
                : "Communication activity",
    });
  }

  if (dataset === "marketing_attribution") {
    const asksForCost =
      /\b(cost|spend|cpl|cost per lead|cost per conversion)\b/.test(lower);
    const asksForSearchTerm =
      /\b(search console|search terms?|queries?|keywords?)\b/.test(lower);
    const asksForPlatform =
      /\b(platforms?|google ads|bing ads|microsoft ads|linkedin ads|meta ads|facebook ads|ad network)\b/.test(
        lower,
      );
    const platformFilterValue = lower.includes("google ads")
      ? "Google Ads"
      : lower.includes("bing ads") || lower.includes("microsoft ads")
        ? "Microsoft Ads"
        : lower.includes("linkedin")
          ? "LinkedIn Ads"
          : lower.includes("meta") || lower.includes("facebook")
            ? "Meta Ads"
            : lower.includes("search console")
              ? "Google Search Console"
              : lower.includes("organic")
                ? "Organic search"
                : null;
    const attributionFilters: ReportFilter[] = platformFilterValue
      ? [{ field: "platform", operator: "equals", value: platformFilterValue }]
      : [];
    const attributionDimensions =
      (asksForPlatform && !lower.includes("campaign")) || asksForCost
        ? ["platform"]
        : asksForSearchTerm
          ? ["term"]
          : lower.includes("campaign")
            ? ["campaign"]
            : lower.includes("landing")
              ? ["landingPage"]
              : lower.includes("page")
                ? ["landingPage"]
                : lower.includes("referrer")
                  ? ["referrer"]
                  : lower.includes("content")
                    ? ["content"]
                    : lower.includes("medium") || lower.includes("channel")
                      ? ["medium"]
                      : lower.includes("first") ||
                          lower.includes("last") ||
                          lower.includes("assist") ||
                          lower.includes("touchpoint")
                        ? ["role"]
                        : lower.includes("form") ||
                            lower.includes("phone") ||
                            lower.includes("conversion type")
                          ? ["conversionType"]
                          : lower.includes("month")
                            ? ["month"]
                            : lower.includes("week")
                              ? ["week"]
                              : lower.includes("day")
                                ? ["day"]
                                : ["source"];
    const isTimeAttributionReport = ["month", "week", "day"].includes(
      attributionDimensions[0],
    );
    const attributionMetrics =
      asksForCost
        ? ["costPerConversion", "cost", "conversions"]
        : lower.includes("visitor") || lower.includes("session")
        ? ["visitors", "sessions", "touchpoints"]
        : lower.includes("assist")
          ? ["assistedTouchpoints", "conversions", "conversionRate"]
          : lower.includes("first")
            ? ["firstTouchpoints", "conversions", "conversionRate"]
            : lower.includes("last")
              ? ["lastTouchpoints", "conversions", "conversionRate"]
              : lower.includes("form") || lower.includes("phone")
                ? ["formLeads", "phoneLeads", "conversions"]
                : ["conversions", "visitors", "conversionRate"];

    return sanitiseReportPlan({
      dataset,
      dateRange,
      dimensions: attributionDimensions,
      filters: attributionFilters,
      metrics: attributionMetrics,
      chartType:
        isTimeAttributionReport || lower.includes("trend") ? "line" : "bar",
      sort: isTimeAttributionReport
        ? { field: attributionDimensions[0], direction: "asc" }
        : asksForCost
          ? { field: "costPerConversion", direction: "asc" }
          : { field: attributionMetrics[0], direction: "desc" },
      limit: 12,
      title:
        isTimeAttributionReport
          ? "Attribution conversions over time"
          : attributionDimensions[0] === "platform"
          ? asksForCost
            ? "Attribution cost by platform"
            : "Attribution conversions by platform"
          : attributionDimensions[0] === "term"
            ? "Attribution conversions by search term"
            : attributionDimensions[0] === "campaign"
              ? "Attribution conversions by campaign"
              : attributionDimensions[0] === "landingPage"
                ? "Attribution conversions by landing page"
                : attributionDimensions[0] === "referrer"
                  ? "Attribution conversions by referrer"
                  : attributionDimensions[0] === "content"
                    ? "Attribution conversions by content"
                    : attributionDimensions[0] === "conversionType"
                      ? "Attribution conversions by type"
                      : attributionDimensions[0] === "role"
                        ? "Attribution conversions by touchpoint role"
                        : attributionDimensions[0] === "medium"
                          ? "Attribution conversions by medium"
                          : "Attribution conversions by source",
    });
  }

  if (dataset === "discovery_answers") {
    const questionFilter = lower.includes("budget")
      ? "budget"
      : lower.includes("timeframe") ||
          lower.includes("timescale") ||
          lower.includes("timeline") ||
          lower.includes("deadline")
        ? "time"
        : lower.includes("platform")
          ? "platform"
          : lower.includes("decision")
            ? "decision"
            : lower.includes("example") ||
                lower.includes("website") ||
                lower.includes("site")
              ? "site"
              : lower.includes("competitor")
                ? "competitor"
                : lower.includes("brand")
                  ? "brand"
                  : lower.includes("requirement") || lower.includes("notes")
                    ? "project"
                    : lower.includes("product") || lower.includes("service")
                      ? "product"
                      : null;
    const discoveryDimensions = lower.includes("owner") ||
      lower.includes("agent") ||
      lower.includes("rep")
      ? ["owner"]
      : lower.includes("stage")
        ? ["pipelineStage"]
        : lower.includes("source")
          ? ["source"]
          : lower.includes("product") && !questionFilter
            ? ["product"]
            : lower.includes("category") && !questionFilter
              ? ["category"]
              : lower.includes("question") || lower.includes("field")
                ? ["question"]
                : lower.includes("month")
                  ? ["month"]
                  : lower.includes("week")
                    ? ["week"]
                    : lower.includes("day")
                      ? ["day"]
                      : questionFilter
                        ? ["answer"]
                        : ["question"];
    const isTimeDiscoveryReport = ["month", "week", "day"].includes(
      discoveryDimensions[0],
    );
    const discoveryMetrics =
      lower.includes("pipeline") ||
      lower.includes("revenue") ||
      lower.includes("value")
        ? ["answeredLeads", "linkedOpenPipeline", "linkedWonRevenue"]
        : lower.includes("average") ||
            lower.includes("avg") ||
            lower.includes("mean")
          ? ["avgNumericAnswer", "answerCount", "answeredLeads"]
          : ["answerCount", "answeredLeads", "uniqueQuestions"];

    return sanitiseReportPlan({
      dataset,
      dateRange,
      dimensions: discoveryDimensions,
      filters: questionFilter
        ? [{ field: "question", operator: "contains", value: questionFilter }]
        : [],
      metrics: discoveryMetrics,
      chartType: isTimeDiscoveryReport || lower.includes("trend") ? "line" : "bar",
      sort: isTimeDiscoveryReport
        ? { field: discoveryDimensions[0], direction: "asc" }
        : { field: discoveryMetrics[0], direction: "desc" },
      limit: isTimeDiscoveryReport ? 12 : 12,
      title: questionFilter
        ? `Discovery ${questionFilter} answers`
        : discoveryDimensions[0] === "owner"
          ? "Discovery answers by owner"
          : discoveryDimensions[0] === "pipelineStage"
            ? "Discovery answers by stage"
            : "Discovery answers by question",
    });
  }

  if (dataset === "sales_lifecycle") {
    const asksForTransitions =
      lower.includes("transition") ||
      lower.includes("movement") ||
      lower.includes("stage change") ||
      lower.includes("stage changes");
    const lifecycleDimensions = asksForTransitions
      ? ["transition"]
      : lower.includes("lost reason") || lower.includes("lost reasons")
        ? ["lostReason"]
        : lower.includes("owner") ||
            lower.includes("agent") ||
            lower.includes("rep")
          ? ["owner"]
          : lower.includes("contact")
            ? ["contactStatus"]
            : lower.includes("close")
              ? ["closeStatus"]
              : lower.includes("source")
                ? ["source"]
                : lower.includes("stage")
                  ? ["pipelineStage"]
                  : lower.includes("month")
                    ? ["month"]
                    : lower.includes("week")
                      ? ["week"]
                      : lower.includes("day")
                        ? ["day"]
                        : ["owner"];
    const isTimeLifecycleReport = ["month", "week", "day"].includes(
      lifecycleDimensions[0],
    );
    const lifecycleMetrics = asksForTransitions
      ? ["lifecycleEvents", "stageChanges", "leadCount"]
      : lower.includes("lost reason") || lower.includes("lost reasons")
        ? ["lostDeals", "lostReasonedDeals", "leadCount"]
        : lower.includes("time-to-close") ||
            lower.includes("time to close") ||
            lower.includes("close time")
          ? ["avgTimeToCloseDays", "wonDeals", "lostDeals"]
          : lower.includes("response") || lower.includes("first response")
            ? ["avgResponseMinutes", "contactedRate", "contactedLeads"]
            : lower.includes("contact")
              ? ["contactedRate", "contactedLeads", "leadCount"]
              : ["contactedRate", "avgResponseMinutes", "leadCount"];

    return sanitiseReportPlan({
      dataset,
      dateRange,
      dimensions: lifecycleDimensions,
      filters: [],
      metrics: lifecycleMetrics,
      chartType: isTimeLifecycleReport || lower.includes("trend") ? "line" : "bar",
      sort: isTimeLifecycleReport
        ? { field: lifecycleDimensions[0], direction: "asc" }
        : { field: lifecycleMetrics[0], direction: "desc" },
      limit: asksForTransitions ? 15 : 12,
      title: asksForTransitions
        ? "Sales lifecycle transitions"
        : lifecycleDimensions[0] === "lostReason"
          ? "Lost reasons"
          : lifecycleDimensions[0] === "contactStatus"
            ? "Lead contact status"
            : "Sales lifecycle quality",
    });
  }

  if (dataset === "setup_readiness") {
    const setupDimensions = lower.includes("status") ||
      lower.includes("ready") ||
      lower.includes("needed") ||
      lower.includes("warning")
      ? ["status"]
      : lower.includes("item") ||
          lower.includes("task") ||
          lower.includes("outstanding")
        ? ["item"]
        : lower.includes("route") || lower.includes("page")
          ? ["href"]
          : ["group"];
    const setupFilters =
      lower.includes("outstanding") ||
      lower.includes("not ready") ||
      lower.includes("needs attention")
        ? [{ field: "status", operator: "not_equals", value: "Ready" }]
        : lower.includes("needed")
          ? [{ field: "status", operator: "equals", value: "Needed" }]
          : lower.includes("warning")
            ? [{ field: "status", operator: "equals", value: "WARNING" }]
            : [];

    return sanitiseReportPlan({
      dataset,
      dateRange: { preset: "all" },
      dimensions: setupDimensions,
      filters: setupFilters,
      metrics:
        lower.includes("complete") || lower.includes("completion")
          ? ["completionPercent", "readyItems", "itemCount"]
          : ["itemCount", "neededItems", "warningItems"],
      chartType: "bar",
      sort: {
        field:
          lower.includes("complete") || lower.includes("completion")
            ? "completionPercent"
            : "neededItems",
        direction: "desc",
      },
      limit: 20,
      title: setupFilters.length
        ? "Outstanding setup readiness"
        : "Setup readiness",
    });
  }

  if (dataset === "opportunity_products") {
    const productDimensions = lower.includes("category")
      ? ["category"]
      : lower.includes("type")
        ? ["productType"]
        : lower.includes("status")
          ? ["productStatus"]
          : lower.includes("source")
            ? ["source"]
            : lower.includes("owner") ||
                lower.includes("agent") ||
                lower.includes("rep")
              ? ["owner"]
              : lower.includes("stage")
                ? ["pipelineStage"]
                : lower.includes("month")
                  ? ["month"]
                  : lower.includes("week")
                    ? ["week"]
                    : lower.includes("day")
                      ? ["day"]
                      : ["product"];
    const isTimeProductReport = ["month", "week", "day"].includes(
      productDimensions[0],
    );

    return sanitiseReportPlan({
      dataset,
      dateRange,
      dimensions: productDimensions,
      filters: lower.includes("declined")
        ? []
        : [
            {
              field: "productStatus",
              operator: "not_equals",
              value: "Declined",
            },
          ],
      metrics:
        lower.includes("quantity") || lower.includes("volume")
          ? ["quantity", "productLeadCount", "estimatedValue"]
          : lower.includes("revenue") || lower.includes("value")
            ? ["productLeadCount", "linkedWonRevenue", "linkedOpenPipeline"]
            : ["productLeadCount", "linkedOpenPipeline", "linkedWonRevenue"],
      chartType: isTimeProductReport || lower.includes("trend") ? "line" : "bar",
      sort: isTimeProductReport
        ? { field: productDimensions[0], direction: "asc" }
        : { field: "productLeadCount", direction: "desc" },
      limit: isTimeProductReport ? 12 : 12,
      title:
        productDimensions[0] === "category"
          ? "Product demand by category"
          : productDimensions[0] === "productType"
            ? "Product demand by type"
            : productDimensions[0] === "source"
              ? "Product demand by source"
              : productDimensions[0] === "owner"
                ? "Product demand by owner"
                : productDimensions[0] === "pipelineStage"
                  ? "Product demand by stage"
                  : "Product demand by product",
    });
  }

  const dimensions = asksForLeadOwnership
    ? ["owner"]
    : asksForMonthComparison
      ? ["month"]
      : asksForWeekComparison
        ? ["week"]
        : asksForLeadPeriodComparison
          ? ["day"]
          : asksForLeadTimePerformance
            ? asksForHourPerformance
              ? ["hour"]
              : asksForExactDayTrend
                ? ["day"]
                : ["weekday"]
            : lower.includes("stage")
              ? ["pipelineStage"]
              : asksForProductDemand ||
                  lower.includes("product") ||
                  lower.includes("service") ||
                  lower.includes("shopify") ||
                  lower.includes("crm") ||
                  lower.includes("marketing")
                ? ["service"]
                : lower.includes("month")
                  ? ["month"]
                  : ["source"];
  const metrics = asksForLeadOwnership
    ? asksForOpenLeads
      ? ["leadCount", "openPipeline", "weightedPipeline"]
      : ["leadCount", "openPipeline", "wonRevenue"]
    : asksForLeadPeriodComparison
      ? ["leadCount", "wonRevenue", "openPipeline"]
    : asksForProductDemand
      ? ["leadCount", "wonRevenue", "openPipeline"]
    : asksForLeadTimePerformance
      ? ["leadCount", "wonRevenue", "winRate"]
    : lower.includes("revenue") || lower.includes("sales value")
      ? ["wonRevenue", "leadCount", "openPipeline"]
      : lower.includes("stale")
        ? ["leadCount", "staleLeads"]
        : lower.includes("win") || lower.includes("conversion")
          ? ["leadCount", "wonRevenue", "winRate"]
          : lower.includes("pipeline")
            ? ["openPipeline", "weightedPipeline"]
            : ["leadCount", "wonRevenue", "openPipeline"];
  const chartType =
    asksForLeadPeriodComparison ||
    lower.includes("trend") ||
    lower.includes("month") ||
    asksForExactDayTrend
      ? "line"
      : "bar";
  const limit = asksForLeadTimePerformance
    ? asksForHourPerformance
      ? 24
      : 7
    : asksForLeadPeriodComparison
      ? asksForMonthComparison
        ? 6
        : 12
      : asksForProductDemand
        ? 12
        : undefined;
  const sort = asksForLeadOwnership
    ? { field: "leadCount", direction: "desc" as const }
    : asksForMonthComparison
      ? { field: "month", direction: "asc" as const }
      : asksForWeekComparison
        ? { field: "week", direction: "asc" as const }
        : asksForLeadPeriodComparison
          ? { field: "day", direction: "asc" as const }
          : asksForProductDemand || asksForLeadTimePerformance
            ? { field: "leadCount", direction: "desc" as const }
            : undefined;
  const title = asksForLeadOwnership
    ? asksForOpenLeads
      ? "Open leads by owner"
      : "Leads by owner"
    : asksForMonthComparison
      ? "Leads by month"
      : asksForWeekComparison
        ? "Leads by week"
        : asksForLeadPeriodComparison
          ? "Leads by day"
          : asksForProductDemand
            ? "Lead demand by service"
            : asksForLeadTimePerformance
              ? asksForHourPerformance
                ? "Lead performance by hour"
                : asksForExactDayTrend
                  ? "Lead performance by day"
                  : "Lead performance by weekday"
              : "AI sales report";

  return sanitiseReportPlan({
    dataset,
    dateRange,
    dimensions,
    filters: asksForOpenLeads
      ? [{ field: "isOpen", operator: "equals", value: "Open" }]
      : [],
    metrics,
    chartType,
    limit,
    sort,
    title,
  });
}
