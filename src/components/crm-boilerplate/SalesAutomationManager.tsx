"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import Button from "@/components/ui/button/Button";
import {
  createStageSlaFollowUpTasksAction,
  createSalesAutomationPresetAction,
  deleteSalesAutomationRuleAction,
  dismissSalesAutomationApprovalAction,
  duplicateSalesAutomationRuleAction,
  saveSalesAutomationRuleAction,
  sendSalesAutomationApprovalAction,
  testSalesAutomationRuleAction,
  toggleSalesAutomationRuleAction,
  type SalesAutomationActionState,
} from "@/lib/actions/sales-automation";

type StageOption = {
  id: string;
  name: string;
  slaDays: number | null;
};

type AutomationRuleRow = {
  id: string;
  name: string;
  description: string | null;
  trigger: string;
  action: string;
  salesPipelineStageId: string | null;
  isActive: boolean;
  config: Record<string, unknown>;
  runCount: number;
  lastRunAt: string | null;
};

type AutomationRunRow = {
  id: string;
  action: string;
  createdAt: string;
  draftBody: string | null;
  draftSubject: string | null;
  metadata: Record<string, unknown>;
  opportunityId: string | null;
  message: string | null;
  recipientEmail: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  opportunityTitle: string | null;
  ruleName: string | null;
  status: string;
  trigger: string;
};

type AutomationAnalytics = {
  actionCounts: Record<string, number>;
  aiFeedback: {
    accepted: number;
    dismissed: number;
    stageGuidance: number;
    total: number;
  };
  approvalsDismissed: number;
  approvalsSent: number;
  attentionItems: Array<{
    detail: string;
    label: string;
    value: number | string;
  }>;
  completedRuns: number;
  failedRuns: number;
  pendingApprovals: number;
  pipelineImpact: {
    assisted: PipelineImpactRow;
    unassisted: PipelineImpactRow;
  };
  rulePerformance: RulePerformanceRow[];
  skippedRuns: number;
  stageMovesApplied: number;
  stageSuggestions: number;
  statusCounts: Record<string, number>;
  totalRuns: number;
  windowLabel: string;
};

type PipelineImpactRow = {
  count: number;
  open: number;
  winRate: number;
  won: number;
  wonRevenueCents: number;
};

type RulePerformanceRow = {
  action: string;
  approvalsDismissed30d: number;
  approvalsSent30d: number;
  completed30d: number;
  failed30d: number;
  failureRate: number;
  id: string;
  isActive: boolean;
  lastRunAt: string | null;
  name: string;
  assistedLeads30d: number;
  openPipelineCents30d: number;
  runs30d: number;
  stageMovesApplied30d: number;
  trigger: string;
  winRate30d: number;
  wonLeads30d: number;
  wonRevenueCents30d: number;
};

export type SalesAutomationManagerProps = {
  analytics: AutomationAnalytics;
  approvalRuns: AutomationRunRow[];
  recentRuns: AutomationRunRow[];
  rules: AutomationRuleRow[];
  stageSlaRows: StageSlaRow[];
  stages: StageOption[];
};

type StageSlaRow = {
  daysInStage: number;
  id: string;
  ownerName: string;
  slaDays: number | null;
  stageChangedAt: string;
  stageName: string;
  status: string;
  title: string;
};

const triggerOptions = [
  ["STAGE_ENTERED", "Stage entered"],
  ["EMAIL_RECEIVED", "Email received"],
  ["EMAIL_SENT", "Email sent"],
  ["SMS_RECEIVED", "SMS received"],
  ["SMS_SENT", "SMS sent"],
  ["CALL_COMPLETED", "Call completed"],
  ["CALL_MISSED", "Call missed"],
  ["SITE_VISIT", "Site visit"],
] as const;

const actionOptions = [
  ["CREATE_TASK", "Create task"],
  ["UPDATE_SCORE", "Update score"],
  ["SUGGEST_STAGE_MOVE", "Suggest stage move"],
  ["SEND_EMAIL", "Draft email for approval"],
  ["SEND_SMS", "Draft SMS for approval"],
  ["NOTIFY_OWNER", "Notify owner"],
] as const;

const initialState: SalesAutomationActionState = {
  ok: false,
  message: "",
  savedAt: null,
};

function labelFor(
  options: readonly (readonly [string, string])[],
  value: string,
) {
  return options.find(([key]) => key === value)?.[1] ?? value;
}

function configValue(config: Record<string, unknown>, key: string) {
  const value = config[key];
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

function conditionValue(config: Record<string, unknown>, key: string) {
  const conditions = config.conditions;
  if (
    !conditions ||
    typeof conditions !== "object" ||
    Array.isArray(conditions)
  ) {
    return "";
  }
  const value = (conditions as Record<string, unknown>)[key];
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

function runValue(run: AutomationRunRow, key: string) {
  const value = run.metadata[key];
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

function formatDate(value: string | null) {
  if (!value) return "Never";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function formatMoney(valueCents: number) {
  return new Intl.NumberFormat("en-GB", {
    currency: "GBP",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(valueCents / 100);
}

function MetricCard({
  detail,
  label,
  tone = "neutral",
  value,
}: {
  detail: string;
  label: string;
  tone?: "danger" | "neutral" | "success" | "warning";
  value: number | string;
}) {
  const toneClass =
    tone === "danger"
      ? "text-error-700 dark:text-error-300"
      : tone === "warning"
        ? "text-warning-700 dark:text-warning-300"
        : tone === "success"
          ? "text-success-700 dark:text-success-300"
          : "text-gray-800 dark:text-white/90";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</p>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{detail}</p>
    </div>
  );
}

function CompactStatList({
  empty,
  items,
}: {
  empty: string;
  items: Array<{ label: string; value: number | string }>;
}) {
  if (!items.length) {
    return (
      <p className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
        {empty}
      </p>
    );
  }

  return (
    <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
        >
          <span className="text-gray-600 dark:text-gray-400">{item.label}</span>
          <span className="font-semibold text-gray-800 dark:text-white/90">
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function RulePerformanceTable({ rules }: { rules: RulePerformanceRow[] }) {
  if (!rules.length) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
        No rule performance yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
        <thead className="bg-gray-50 dark:bg-white/[0.02]">
          <tr className="text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
            <th className="px-4 py-3">Rule</th>
            <th className="px-4 py-3">Runs</th>
            <th className="px-4 py-3">Completed</th>
            <th className="px-4 py-3">Failed</th>
            <th className="px-4 py-3">Approvals</th>
            <th className="px-4 py-3">Stage moves</th>
            <th className="px-4 py-3">Conversion</th>
            <th className="px-4 py-3">Last run</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {rules.map((rule) => (
            <tr key={rule.id} className="align-top">
              <td className="px-4 py-3">
                <p className="font-medium text-gray-800 dark:text-white/90">
                  {rule.name}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {labelFor(triggerOptions, rule.trigger)} /{" "}
                  {labelFor(actionOptions, rule.action)}
                </p>
              </td>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                {rule.runs30d}
              </td>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                {rule.completed30d}
              </td>
              <td className="px-4 py-3">
                <span
                  className={
                    rule.failed30d
                      ? "font-semibold text-error-700 dark:text-error-300"
                      : "text-gray-600 dark:text-gray-400"
                  }
                >
                  {rule.failed30d} ({rule.failureRate}%)
                </span>
              </td>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                {rule.approvalsSent30d} sent / {rule.approvalsDismissed30d}{" "}
                dismissed
              </td>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                {rule.stageMovesApplied30d}
              </td>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                {rule.wonLeads30d}/{rule.assistedLeads30d} won (
                {rule.winRate30d}%)
                <span className="mt-1 block text-xs">
                  {formatMoney(rule.wonRevenueCents30d)} won /{" "}
                  {formatMoney(rule.openPipelineCents30d)} open
                </span>
              </td>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                {formatDate(rule.lastRunAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PipelineImpactTable({
  assisted,
  unassisted,
}: AutomationAnalytics["pipelineImpact"]) {
  const rows = [
    ["Automation-assisted", assisted],
    ["No automation history", unassisted],
  ] as const;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
        <thead className="bg-gray-50 dark:bg-white/[0.02]">
          <tr className="text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
            <th className="px-4 py-3">Segment</th>
            <th className="px-4 py-3">Leads</th>
            <th className="px-4 py-3">Open</th>
            <th className="px-4 py-3">Won</th>
            <th className="px-4 py-3">Win rate</th>
            <th className="px-4 py-3">Won revenue</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map(([label, row]) => (
            <tr key={label}>
              <td className="px-4 py-3 font-medium text-gray-800 dark:text-white/90">
                {label}
              </td>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                {row.count}
              </td>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                {row.open}
              </td>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                {row.won}
              </td>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                {row.winRate}%
              </td>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                {formatMoney(row.wonRevenueCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnalyticsOverview({ analytics }: { analytics: AutomationAnalytics }) {
  const actionItems = Object.entries(analytics.actionCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([action, count]) => ({
      label: labelFor(actionOptions, action),
      value: count,
    }));
  const statusItems = Object.entries(analytics.statusCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => ({
      label: status.toLowerCase(),
      value: count,
    }));

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Automation analytics
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {analytics.windowLabel} performance across rule runs, approvals and
          stage suggestions.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Runs"
          value={analytics.totalRuns}
          detail={`${analytics.completedRuns} completed, ${analytics.skippedRuns} skipped`}
          tone="neutral"
        />
        <MetricCard
          label="Failures"
          value={analytics.failedRuns}
          detail="Automation runs needing attention"
          tone={analytics.failedRuns ? "danger" : "success"}
        />
        <MetricCard
          label="Approvals"
          value={analytics.pendingApprovals}
          detail={`${analytics.approvalsSent} sent, ${analytics.approvalsDismissed} dismissed`}
          tone={analytics.pendingApprovals ? "warning" : "success"}
        />
        <MetricCard
          label="Stage moves"
          value={`${analytics.stageMovesApplied}/${analytics.stageSuggestions}`}
          detail="Approved moves from suggestions"
          tone={analytics.stageMovesApplied ? "success" : "neutral"}
        />
        <MetricCard
          label="AI feedback"
          value={`${analytics.aiFeedback.accepted}/${analytics.aiFeedback.total}`}
          detail={`${analytics.aiFeedback.dismissed} dismissed, ${analytics.aiFeedback.stageGuidance} stage guidance items`}
          tone={analytics.aiFeedback.accepted ? "success" : "neutral"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">
            Actions
          </h3>
          <CompactStatList
            empty="No actions have run in this window."
            items={actionItems}
          />
        </section>
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">
            Status
          </h3>
          <CompactStatList
            empty="No run statuses have been recorded."
            items={statusItems}
          />
        </section>
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">
            Attention
          </h3>
          <CompactStatList
            empty="No automation attention items."
            items={analytics.attentionItems.map((item) => ({
              label: item.label,
              value: item.value,
            }))}
          />
          {analytics.attentionItems.length ? (
            <div className="mt-3 space-y-2">
              {analytics.attentionItems.map((item) => (
                <p
                  key={`${item.label}-${item.value}`}
                  className="text-xs text-gray-500 dark:text-gray-400"
                >
                  {item.detail}
                </p>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </section>
  );
}

function StageSlaTable({ rows }: { rows: StageSlaRow[] }) {
  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
        No open leads are currently beyond their configured stage SLA.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
        <thead className="bg-gray-50 dark:bg-white/[0.02]">
          <tr className="text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
            <th className="px-4 py-3">Lead</th>
            <th className="px-4 py-3">Stage</th>
            <th className="px-4 py-3">Owner</th>
            <th className="px-4 py-3">SLA</th>
            <th className="px-4 py-3">Age</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-3">
                <a
                  href={`/sales/${row.id}`}
                  className="font-medium text-brand-600 hover:underline dark:text-brand-300"
                >
                  {row.title}
                </a>
                <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                  Since {formatDate(row.stageChangedAt)}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                {row.stageName}
              </td>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                {row.ownerName}
              </td>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                {row.slaDays ? `${row.slaDays}d` : "None"}
              </td>
              <td className="px-4 py-3 font-semibold text-gray-800 dark:text-white/90">
                {row.daysInStage}d
              </td>
              <td className="px-4 py-3">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    row.status === "Critical"
                      ? "bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300"
                      : row.status === "Watch"
                        ? "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
                        : "bg-gray-100 text-gray-700 dark:bg-white/[0.06] dark:text-gray-300"
                  }`}
                >
                  {row.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StageSlaTaskForm() {
  const [state, formAction, isPending] = useActionState(
    createStageSlaFollowUpTasksAction,
    initialState,
  );
  const { showToast } = useToast();

  useEffect(() => {
    if (state.ok && state.savedAt) showToast(state.message);
  }, [showToast, state]);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="limit" value="20" />
      <Button size="sm" variant="outline" disabled={isPending}>
        {isPending ? "Creating..." : "Create SLA tasks"}
      </Button>
      <ActionStateMessage state={state.message ? state : undefined} />
    </form>
  );
}

function RuleFields({
  rule,
  stages,
}: {
  rule?: AutomationRuleRow;
  stages: StageOption[];
}) {
  const config = rule?.config ?? {};

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {rule ? <input type="hidden" name="id" value={rule.id} /> : null}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Rule name
        </label>
        <input
          name="name"
          required
          defaultValue={rule?.name ?? ""}
          className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Stage filter
        </label>
        <select
          name="salesPipelineStageId"
          defaultValue={rule?.salesPipelineStageId ?? ""}
          className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        >
          <option value="">Any stage</option>
          {stages.map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Trigger
        </label>
        <select
          name="trigger"
          defaultValue={rule?.trigger ?? "STAGE_ENTERED"}
          className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        >
          {triggerOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Action
        </label>
        <select
          name="action"
          defaultValue={rule?.action ?? "CREATE_TASK"}
          className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        >
          {actionOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="md:col-span-2">
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Description
        </label>
        <textarea
          name="description"
          rows={2}
          defaultValue={rule?.description ?? ""}
          className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Task / approval title
        </label>
        <input
          name="taskTitle"
          defaultValue={configValue(config, "title")}
          className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Due in days
        </label>
        <input
          name="dueInDays"
          type="number"
          min={0}
          defaultValue={configValue(config, "dueInDays")}
          className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Score delta
        </label>
        <input
          name="scoreDelta"
          type="number"
          min={-100}
          max={100}
          defaultValue={configValue(config, "delta")}
          className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Score reason
        </label>
        <input
          name="scoreReason"
          defaultValue={configValue(config, "reason")}
          className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Target stage
        </label>
        <select
          name="targetStageId"
          defaultValue={configValue(config, "targetStageId")}
          className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        >
          <option value="">No target</option>
          {stages.map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Draft subject
        </label>
        <input
          name="draftSubject"
          defaultValue={configValue(config, "subject")}
          className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
      </div>
      <div className="md:col-span-2">
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Task description / draft body
        </label>
        <textarea
          name="draftBody"
          rows={3}
          defaultValue={configValue(config, "body")}
          className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
      </div>
      <div className="md:col-span-2">
        <textarea
          name="taskDescription"
          rows={2}
          placeholder="Internal task description"
          defaultValue={configValue(config, "description")}
          className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
      </div>
      <div className="md:col-span-2">
        <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
          <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
            Conditions
          </h4>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Optional filters. The rule runs only when every filled condition
            matches.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <input
              name="minScore"
              type="number"
              min={0}
              max={100}
              placeholder="Min score"
              defaultValue={conditionValue(config, "minScore")}
              className="h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
            <input
              name="maxScore"
              type="number"
              min={0}
              max={100}
              placeholder="Max score"
              defaultValue={conditionValue(config, "maxScore")}
              className="h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
            <input
              name="minStageAgeDays"
              type="number"
              min={0}
              placeholder="Min days in stage"
              defaultValue={conditionValue(config, "minStageAgeDays")}
              className="h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
            <input
              name="maxStageAgeDays"
              type="number"
              min={0}
              placeholder="Max days in stage"
              defaultValue={conditionValue(config, "maxStageAgeDays")}
              className="h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
            <input
              name="sourceIncludes"
              placeholder="Source contains"
              defaultValue={conditionValue(config, "sourceIncludes")}
              className="h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
            <input
              name="serviceIncludes"
              placeholder="Service contains"
              defaultValue={conditionValue(config, "serviceIncludes")}
              className="h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={rule?.isActive ?? true}
          className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
        />
        Enabled
      </label>
    </div>
  );
}

function CreateRuleForm({ stages }: { stages: StageOption[] }) {
  const [state, formAction, isPending] = useActionState(
    saveSalesAutomationRuleAction,
    initialState,
  );
  const { showToast } = useToast();

  useEffect(() => {
    if (state.ok && state.savedAt) showToast(state.message);
  }, [showToast, state]);

  return (
    <form action={formAction} className="space-y-4">
      <RuleFields stages={stages} />
      <ActionStateMessage state={state.message ? state : undefined} />
      <Button size="sm" disabled={isPending}>
        {isPending ? "Saving..." : "Create automation"}
      </Button>
    </form>
  );
}

function PresetForm({
  description,
  label,
  preset,
}: {
  description: string;
  label: string;
  preset: string;
}) {
  const [state, formAction, isPending] = useActionState(
    createSalesAutomationPresetAction,
    initialState,
  );
  const { showToast } = useToast();

  useEffect(() => {
    if (state.ok && state.savedAt) showToast(state.message);
  }, [showToast, state]);

  return (
    <form
      action={formAction}
      className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
    >
      <input type="hidden" name="preset" value={preset} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
            {label}
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {description}
          </p>
        </div>
        <Button size="sm" disabled={isPending}>
          {isPending ? "Adding..." : "Add"}
        </Button>
      </div>
      <ActionStateMessage state={state.message ? state : undefined} />
    </form>
  );
}

function RuleCard({
  rule,
  stages,
}: {
  rule: AutomationRuleRow;
  stages: StageOption[];
}) {
  const [state, formAction, isPending] = useActionState(
    saveSalesAutomationRuleAction,
    initialState,
  );
  const [duplicateState, duplicateAction, isDuplicating] = useActionState(
    duplicateSalesAutomationRuleAction,
    initialState,
  );
  const [testState, testAction, isTesting] = useActionState(
    testSalesAutomationRuleAction,
    initialState,
  );
  const { showToast } = useToast();
  const stageName =
    stages.find((stage) => stage.id === rule.salesPipelineStageId)?.name ??
    "Any stage";

  useEffect(() => {
    if (duplicateState.ok && duplicateState.savedAt)
      showToast(duplicateState.message);
  }, [duplicateState, showToast]);

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            {rule.name}
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {labelFor(triggerOptions, rule.trigger)} ·{" "}
            {labelFor(actionOptions, rule.action)} · {stageName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <form action={toggleSalesAutomationRuleAction}>
            <input type="hidden" name="id" value={rule.id} />
            <input
              type="hidden"
              name="isActive"
              value={rule.isActive ? "off" : "on"}
            />
            <button
              type="submit"
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                rule.isActive
                  ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
                  : "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
              }`}
            >
              {rule.isActive ? "Enabled" : "Disabled"}
            </button>
          </form>
          <form action={deleteSalesAutomationRuleAction}>
            <input type="hidden" name="id" value={rule.id} />
            <button
              type="submit"
              className="rounded-full bg-error-50 px-3 py-1 text-xs font-semibold text-error-700 dark:bg-error-900/20 dark:text-error-300"
            >
              Delete
            </button>
          </form>
        </div>
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-semibold text-brand-600 dark:text-brand-300">
          Edit rule
        </summary>
        <form action={formAction} className="mt-4 space-y-4">
          <RuleFields rule={rule} stages={stages} />
          <ActionStateMessage state={state.message ? state : undefined} />
          <Button size="sm" disabled={isPending}>
            {isPending ? "Saving..." : "Save rule"}
          </Button>
        </form>
      </details>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold text-brand-600 dark:text-brand-300">
          Test and duplicate
        </summary>
        <div className="mt-4 grid gap-3">
          <form
            action={testAction}
            className="grid gap-2 sm:grid-cols-[1fr_auto]"
          >
            <input type="hidden" name="ruleId" value={rule.id} />
            <input
              name="opportunityId"
              placeholder="Lead ID"
              className="h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
            <Button size="sm" variant="outline" disabled={isTesting}>
              {isTesting ? "Testing..." : "Dry run"}
            </Button>
          </form>
          <form action={duplicateAction}>
            <input type="hidden" name="id" value={rule.id} />
            <Button size="sm" variant="outline" disabled={isDuplicating}>
              {isDuplicating ? "Duplicating..." : "Duplicate disabled copy"}
            </Button>
          </form>
          <ActionStateMessage
            state={testState.message ? testState : undefined}
          />
          <ActionStateMessage
            state={duplicateState.message ? duplicateState : undefined}
          />
        </div>
      </details>

      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-white/[0.03]">
          <span className="block text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
            Runs
          </span>
          <span className="mt-1 block font-semibold text-gray-800 dark:text-white/90">
            {rule.runCount}
          </span>
        </div>
        <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-white/[0.03]">
          <span className="block text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
            Last run
          </span>
          <span className="mt-1 block font-semibold text-gray-800 dark:text-white/90">
            {formatDate(rule.lastRunAt)}
          </span>
        </div>
      </div>
    </article>
  );
}

function RunTable({ runs }: { runs: AutomationRunRow[] }) {
  if (!runs.length) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
        No automation activity yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
        <thead className="bg-gray-50 dark:bg-white/[0.02]">
          <tr className="text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
            <th className="px-4 py-3">When</th>
            <th className="px-4 py-3">Rule</th>
            <th className="px-4 py-3">Lead</th>
            <th className="px-4 py-3">Action</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {runs.map((run) => (
            <tr key={run.id} className="align-top">
              <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                {formatDate(run.createdAt)}
              </td>
              <td className="px-4 py-3 font-medium text-gray-800 dark:text-white/90">
                {run.ruleName ?? "System"}
              </td>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                {run.opportunityTitle ?? "No lead"}
              </td>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                {labelFor(actionOptions, run.action)}
                {run.message ? (
                  <span className="mt-1 block text-xs">{run.message}</span>
                ) : null}
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-semibold text-brand-600 dark:text-brand-300">
                    Trace
                  </summary>
                  <dl className="mt-2 grid gap-1 text-xs">
                    <div>
                      <dt className="font-semibold text-gray-500 dark:text-gray-400">
                        Trigger
                      </dt>
                      <dd>{labelFor(triggerOptions, run.trigger)}</dd>
                    </div>
                    {runValue(run, "taskId") ? (
                      <div>
                        <dt className="font-semibold text-gray-500 dark:text-gray-400">
                          Task
                        </dt>
                        <dd>{runValue(run, "taskId")}</dd>
                      </div>
                    ) : null}
                    {runValue(run, "suggestedStageName") ? (
                      <div>
                        <dt className="font-semibold text-gray-500 dark:text-gray-400">
                          Suggested stage
                        </dt>
                        <dd>{runValue(run, "suggestedStageName")}</dd>
                      </div>
                    ) : null}
                    {runValue(run, "communicationId") ? (
                      <div>
                        <dt className="font-semibold text-gray-500 dark:text-gray-400">
                          Communication
                        </dt>
                        <dd>{runValue(run, "communicationId")}</dd>
                      </div>
                    ) : null}
                    {runValue(run, "scoreAfter") ? (
                      <div>
                        <dt className="font-semibold text-gray-500 dark:text-gray-400">
                          Score after
                        </dt>
                        <dd>{runValue(run, "scoreAfter")}</dd>
                      </div>
                    ) : null}
                    {runValue(run, "recipient") ? (
                      <div>
                        <dt className="font-semibold text-gray-500 dark:text-gray-400">
                          Recipient
                        </dt>
                        <dd>{runValue(run, "recipient")}</dd>
                      </div>
                    ) : null}
                    {runValue(run, "approvedAt") ? (
                      <div>
                        <dt className="font-semibold text-gray-500 dark:text-gray-400">
                          Approved
                        </dt>
                        <dd>{formatDate(runValue(run, "approvedAt"))}</dd>
                      </div>
                    ) : null}
                    {runValue(run, "dismissedAt") ? (
                      <div>
                        <dt className="font-semibold text-gray-500 dark:text-gray-400">
                          Dismissed
                        </dt>
                        <dd>{formatDate(runValue(run, "dismissedAt"))}</dd>
                      </div>
                    ) : null}
                    {runValue(run, "failedAt") ? (
                      <div>
                        <dt className="font-semibold text-gray-500 dark:text-gray-400">
                          Failed
                        </dt>
                        <dd>{formatDate(runValue(run, "failedAt"))}</dd>
                      </div>
                    ) : null}
                    {runValue(run, "stageMoveAppliedAt") ? (
                      <div>
                        <dt className="font-semibold text-gray-500 dark:text-gray-400">
                          Stage move applied
                        </dt>
                        <dd>
                          {formatDate(runValue(run, "stageMoveAppliedAt"))}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </details>
              </td>
              <td className="px-4 py-3">
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 dark:bg-white/[0.06] dark:text-gray-300">
                  {run.status.toLowerCase()}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApprovalCard({ run }: { run: AutomationRunRow }) {
  const [sendState, sendAction, isSending] = useActionState(
    sendSalesAutomationApprovalAction,
    initialState,
  );
  const [dismissState, dismissAction, isDismissing] = useActionState(
    dismissSalesAutomationApprovalAction,
    initialState,
  );
  const { showToast } = useToast();
  const recipient =
    run.action === "SEND_SMS" ? run.recipientPhone : run.recipientEmail;

  useEffect(() => {
    if (sendState.ok && sendState.savedAt) showToast(sendState.message);
  }, [sendState, showToast]);

  useEffect(() => {
    if (dismissState.ok && dismissState.savedAt)
      showToast(dismissState.message);
  }, [dismissState, showToast]);

  return (
    <article className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
            {run.ruleName ?? labelFor(actionOptions, run.action)}
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {run.opportunityId ? (
              <a
                href={`/sales/${run.opportunityId}`}
                className="font-medium text-brand-600 hover:underline dark:text-brand-300"
              >
                {run.opportunityTitle ?? "Open lead"}
              </a>
            ) : (
              (run.opportunityTitle ?? "No lead")
            )}{" "}
            · {formatDate(run.createdAt)}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            run.status === "FAILED"
              ? "bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300"
              : "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
          }`}
        >
          {run.status === "FAILED" ? "Retry needed" : "Approval needed"}
        </span>
      </div>

      <form action={sendAction} className="mt-4 grid gap-3">
        <input type="hidden" name="runId" value={run.id} />
        <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
          Recipient
          <input
            name="to"
            defaultValue={recipient ?? ""}
            placeholder={
              run.action === "SEND_SMS" ? "Mobile number" : "Email address"
            }
            className="h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
        </label>
        {run.action === "SEND_EMAIL" ? (
          <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
            Subject
            <input
              name="subject"
              defaultValue={run.draftSubject ?? ""}
              className="h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </label>
        ) : null}
        <label className="grid gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
          Draft
          <textarea
            name="body"
            rows={4}
            defaultValue={run.draftBody ?? ""}
            className="rounded-lg border border-gray-300 bg-transparent px-3 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={isSending || isDismissing}>
            {isSending ? "Sending..." : "Send approved"}
          </Button>
          <button
            formAction={dismissAction}
            disabled={isSending || isDismissing}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.04]"
          >
            {isDismissing ? "Dismissing..." : "Dismiss"}
          </button>
        </div>
        <ActionStateMessage state={sendState.message ? sendState : undefined} />
        <ActionStateMessage
          state={dismissState.message ? dismissState : undefined}
        />
      </form>
    </article>
  );
}

export default function SalesAutomationManager({
  analytics,
  approvalRuns,
  recentRuns,
  rules,
  stageSlaRows,
  stages,
}: SalesAutomationManagerProps) {
  const [approvalActionFilter, setApprovalActionFilter] = useState("ALL");
  const [approvalStatusFilter, setApprovalStatusFilter] = useState("ALL");
  const [approvalSearch, setApprovalSearch] = useState("");
  const filteredApprovalRuns = useMemo(() => {
    const search = approvalSearch.trim().toLowerCase();

    return approvalRuns.filter((run) => {
      const actionMatches =
        approvalActionFilter === "ALL" || run.action === approvalActionFilter;
      const statusMatches =
        approvalStatusFilter === "ALL" || run.status === approvalStatusFilter;
      const searchMatches =
        !search ||
        [
          run.opportunityTitle,
          run.recipientEmail,
          run.recipientName,
          run.recipientPhone,
          run.ruleName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(search);

      return actionMatches && statusMatches && searchMatches;
    });
  }, [
    approvalActionFilter,
    approvalRuns,
    approvalSearch,
    approvalStatusFilter,
  ]);

  return (
    <div className="space-y-6">
      <AnalyticsOverview analytics={analytics} />

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Rule performance
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Runs, failures and accepted outcomes by rule over the current
            analytics window.
          </p>
        </div>
        <RulePerformanceTable rules={analytics.rulePerformance} />
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Pipeline impact
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Current pipeline split by leads with any automation history versus
            leads with none.
          </p>
        </div>
        <PipelineImpactTable {...analytics.pipelineImpact} />
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Stage time and SLA
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Open leads that may need action because they have stayed in one
              stage too long.
            </p>
          </div>
          <StageSlaTaskForm />
        </div>
        <StageSlaTable rows={stageSlaRows} />
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Create rule
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Send actions create approval activity only; they do not send
            automatically.
          </p>
        </div>
        <CreateRuleForm stages={stages} />
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Presets
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Add common starter rules, then edit the wording and stage scope.
          </p>
        </div>
        <div className="grid gap-3 xl:grid-cols-2">
          <PresetForm
            preset="discovery"
            label="Discovery call"
            description="Create a task to book the discovery call when a lead enters the early stage."
          />
          <PresetForm
            preset="proposal_follow_up"
            label="Proposal follow-up"
            description="Draft an email for approval when a lead reaches proposal."
          />
          <PresetForm
            preset="inbound_scoring"
            label="Inbound scoring"
            description="Increase lead score when the contact replies by email."
          />
          <PresetForm
            preset="missed_call_recovery"
            label="Missed-call recovery"
            description="Create an immediate callback task after a missed call."
          />
          <PresetForm
            preset="stage_move_suggestions"
            label="Stage suggestions"
            description="Create a review task when contact engagement suggests the next stage."
          />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {rules.map((rule) => (
          <RuleCard key={rule.id} rule={rule} stages={stages} />
        ))}
        {!rules.length ? (
          <div className="rounded-2xl border border-dashed border-gray-300 p-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No automation rules yet.
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Approval queue
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Email and SMS automation requests wait here for review instead of
            sending live.
          </p>
        </div>
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <select
            value={approvalActionFilter}
            onChange={(event) => setApprovalActionFilter(event.target.value)}
            className="h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            <option value="ALL">All actions</option>
            <option value="SEND_EMAIL">Email approvals</option>
            <option value="SEND_SMS">SMS approvals</option>
          </select>
          <select
            value={approvalStatusFilter}
            onChange={(event) => setApprovalStatusFilter(event.target.value)}
            className="h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            <option value="ALL">All statuses</option>
            <option value="SKIPPED">Waiting approval</option>
            <option value="FAILED">Retry needed</option>
          </select>
          <input
            value={approvalSearch}
            onChange={(event) => setApprovalSearch(event.target.value)}
            placeholder="Search lead, recipient or rule"
            className="h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredApprovalRuns.length ? (
            filteredApprovalRuns.map((run) => (
              <ApprovalCard key={run.id} run={run} />
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              {approvalRuns.length
                ? "No approvals match those filters."
                : "No message approvals waiting."}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Recent automation activity
          </h2>
        </div>
        <RunTable runs={recentRuns} />
      </section>
    </div>
  );
}
