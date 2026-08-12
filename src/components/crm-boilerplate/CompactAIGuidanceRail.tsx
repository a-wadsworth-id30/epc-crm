"use client";

import { useState } from "react";
import { AISparkIcon } from "@/components/crm-boilerplate/AITheme";
import { PhoneIcon } from "@/components/crm-boilerplate/SoftphoneIcons";
import { MailIcon } from "@/icons";

type CompactAIResult = {
  summary: string;
  nextStep: {
    title: string;
    rationale: string;
    urgency: "low" | "medium" | "high";
    channel: "Email" | "SMS" | "Phone";
  };
  stageRecommendation: {
    action: "stay" | "consider_move" | "ready_to_move";
    targetStage: string | null;
    rationale: string;
  };
  risks: string[];
  generatedAt: string;
};

type CompactAIGuidanceRailProps = {
  actionDisabledReason?: string | null;
  currentStage: string;
  error: string | null;
  fallbackSummary: string;
  isCreatingTask: boolean;
  isLoading: boolean;
  label: string;
  onCall: () => void;
  onCreateTask: () => void;
  onDraft: () => void;
  onRegenerate: () => void;
  result: CompactAIResult | null;
  statusLabel: string;
  taskFeedback: string | null;
};

function cachedLabel(generatedAt?: string) {
  if (!generatedAt) return "Not generated";

  const elapsedMs = Date.now() - new Date(generatedAt).getTime();
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return "Cached";

  const minutes = Math.max(1, Math.round(elapsedMs / 60_000));
  if (minutes < 60) return `Cached ${minutes}m`;

  const hours = Math.round(minutes / 60);
  return `Cached ${hours}h`;
}

function urgencyClasses(urgency?: CompactAIResult["nextStep"]["urgency"]) {
  if (urgency === "high") {
    return "border-error-200 bg-error-50 text-error-700 dark:border-error-900/50 dark:bg-error-900/20 dark:text-error-300";
  }
  if (urgency === "low") {
    return "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-white/[0.04] dark:text-gray-300";
  }
  return "border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-900/50 dark:bg-warning-900/20 dark:text-warning-300";
}

function stageTone(action?: CompactAIResult["stageRecommendation"]["action"]) {
  if (action === "ready_to_move") return "bg-success-500";
  if (action === "consider_move") return "bg-warning-500";
  return "bg-gray-300 dark:bg-gray-700";
}

export default function CompactAIGuidanceRail({
  actionDisabledReason,
  currentStage,
  error,
  fallbackSummary,
  isCreatingTask,
  isLoading,
  label,
  onCall,
  onCreateTask,
  onDraft,
  onRegenerate,
  result,
  statusLabel,
  taskFeedback,
}: CompactAIGuidanceRailProps) {
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const nextTitle =
    result?.nextStep.title || "Review the conversation and confirm the next step.";
  const nextRationale =
    result?.nextStep.rationale || "Use the latest verified CRM activity before replying.";
  const summaryText =
    isLoading && !result ? "Analysing CRM context..." : result?.summary || fallbackSummary;
  const suggestedStage =
    result?.stageRecommendation.targetStage ||
    (result?.stageRecommendation.action === "stay" ? currentStage : null);
  const taskDisabled = isCreatingTask || !result;

  return (
    <section className="overflow-hidden rounded-2xl border border-purple-100 bg-white shadow-theme-xs dark:border-purple-900/40 dark:bg-white/[0.03]">
      <div className="flex min-h-10 items-center gap-2 border-b border-purple-100 bg-white px-3 py-2 dark:border-purple-900/40 dark:bg-gray-950">
        <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-700 ring-1 ring-purple-100 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-900/40">
          <AISparkIcon wrapperClassName="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-xs font-bold text-gray-900 dark:text-white">
              {label}
            </p>
            <span className="truncate rounded-full border border-warning-200 bg-warning-50 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none text-warning-700 dark:border-warning-900/50 dark:bg-warning-900/20 dark:text-warning-300">
              {statusLabel}
            </span>
          </div>
          <p className="truncate text-[10px] font-medium text-gray-400">
            {isLoading ? "Generating..." : cachedLabel(result?.generatedAt)}
          </p>
        </div>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={isLoading}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg border border-purple-100 bg-white text-purple-700 shadow-theme-xs transition hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-purple-900/40 dark:bg-gray-950 dark:text-purple-300 dark:hover:bg-purple-900/20"
          aria-label="Regenerate AI guidance"
          title="Regenerate"
        >
          <AISparkIcon wrapperClassName="size-3.5" />
        </button>
      </div>

      <div className="space-y-2.5 p-3">
        <div className="rounded-xl border border-purple-100 bg-purple-50/45 p-2.5 dark:border-purple-900/40 dark:bg-purple-500/10">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-purple-700 dark:text-purple-300">
              Summary
            </p>
          </div>
          <p
            className={`text-xs leading-5 text-gray-700 dark:text-gray-300 ${
              isSummaryExpanded ? "" : "line-clamp-2"
            }`}
          >
            {summaryText}
          </p>
          {summaryText.length > 120 ? (
            <button
              type="button"
              onClick={() => setIsSummaryExpanded((current) => !current)}
              className="mt-1 text-[11px] font-bold text-purple-700 hover:text-purple-800 dark:text-purple-300 dark:hover:text-purple-200"
            >
              {isSummaryExpanded ? "Show less" : "Show more"}
            </button>
          ) : null}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-2.5 dark:border-gray-800 dark:bg-gray-950">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Next action
            </p>
            <span
              className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold capitalize leading-none ${urgencyClasses(
                result?.nextStep.urgency,
              )}`}
            >
              {result?.nextStep.urgency ?? "medium"}
            </span>
          </div>
          <p className="text-sm font-bold leading-5 text-gray-900 dark:text-white">
            {nextTitle}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
            {nextRationale}
          </p>

          <div className="mt-2 grid gap-2">
            <button
              type="button"
              onClick={onCreateTask}
              disabled={taskDisabled}
              className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-brand-500 px-3 text-xs font-bold text-white shadow-theme-xs transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCreatingTask ? "Creating..." : "Create task"}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onDraft}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 text-xs font-bold text-gray-700 shadow-theme-xs transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-white/[0.04]"
              >
                <MailIcon className="h-3.5 w-3.5" />
                Draft
              </button>
              <button
                type="button"
                onClick={onCall}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 text-xs font-bold text-gray-700 shadow-theme-xs transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-white/[0.04]"
              >
                <PhoneIcon className="h-3.5 w-3.5" />
                Call
              </button>
            </div>
          </div>
          {actionDisabledReason ? (
            <p className="mt-2 rounded-lg bg-warning-50 px-2 py-1.5 text-[11px] leading-4 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300">
              {actionDisabledReason}
            </p>
          ) : null}
          {taskFeedback ? (
            <p className="mt-2 rounded-lg bg-success-50 px-2 py-1.5 text-[11px] font-bold leading-4 text-success-700 dark:bg-success-900/20 dark:text-success-300">
              {taskFeedback}
            </p>
          ) : null}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-2.5 dark:border-gray-800 dark:bg-gray-950">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Stage
            </p>
            <div className="flex gap-1">
              <span className={`size-1.5 rounded-full ${stageTone(result?.stageRecommendation.action)}`} />
              <span className={`size-1.5 rounded-full ${stageTone(result?.stageRecommendation.action)}`} />
              <span
                className={`size-1.5 rounded-full ${
                  result?.stageRecommendation.action === "ready_to_move"
                    ? "bg-success-500"
                    : "bg-gray-300 dark:bg-gray-700"
                }`}
              />
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate rounded-full bg-gray-100 px-2 py-1 text-[11px] font-bold text-gray-700 dark:bg-white/[0.06] dark:text-gray-300">
              {currentStage}
            </span>
            <span className="text-xs font-bold text-gray-300">→</span>
            <span className="min-w-0 truncate rounded-full bg-purple-50 px-2 py-1 text-[11px] font-bold text-purple-700 ring-1 ring-purple-100 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-900/40">
              {suggestedStage || "Review"}
            </span>
          </div>
        </div>

        {result?.risks.length ? (
          <div className="flex flex-wrap gap-1.5">
            {result.risks.slice(0, 2).map((risk) => (
              <span
                key={risk}
                className="line-clamp-1 rounded-full border border-warning-200 bg-warning-50 px-2 py-1 text-[10px] font-semibold text-warning-700 dark:border-warning-900/50 dark:bg-warning-900/20 dark:text-warning-300"
                title={risk}
              >
                {risk}
              </span>
            ))}
          </div>
        ) : null}

        {error ? (
          <p className="rounded-xl border border-error-200 bg-error-50 px-3 py-2 text-xs leading-5 text-error-700 dark:border-error-900/40 dark:bg-error-900/20 dark:text-error-300">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
