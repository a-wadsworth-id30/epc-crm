"use client";

import { useActionState } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import Button from "@/components/ui/button/Button";
import {
  approveSaleStageSuggestionAction,
  recordSaleAiFeedbackAction,
  updateSaleStageAction,
  type SalesActionState,
} from "@/lib/actions/sales";

type ScoreEventRow = {
  createdAt: string;
  delta: number;
  id: string;
  reason: string;
  scoreAfter: number;
  source: string;
};

type AutomationRunRow = {
  action: string;
  createdAt: string;
  id: string;
  metadata: Record<string, unknown>;
  message: string | null;
  ruleName: string | null;
  status: string;
  trigger: string;
};

type SaleAutomationActivityProps = {
  aiRecommendation: {
    action: string;
    generatedAt: string;
    rationale: string;
    targetStageId: string | null;
    targetStage: string | null;
    targetStageMovementPolicy: string | null;
  } | null;
  automationRuns: AutomationRunRow[];
  saleId: string;
  scoreEvents: ScoreEventRow[];
};

const initialState: SalesActionState = {
  ok: false,
  message: "",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function label(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function StageSuggestionButton({ run }: { run: AutomationRunRow }) {
  const [state, formAction, isPending] = useActionState(
    approveSaleStageSuggestionAction,
    initialState,
  );
  const suggestedStageName = stringValue(run.metadata.suggestedStageName);
  const suggestedStageId = stringValue(run.metadata.suggestedStageId);
  const appliedAt = stringValue(run.metadata.stageMoveAppliedAt);

  if (run.action !== "SUGGEST_STAGE_MOVE" || !suggestedStageId) return null;

  return (
    <form action={formAction} className="mt-2">
      <input type="hidden" name="runId" value={run.id} />
      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-950">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Suggested move
          {suggestedStageName ? `: ${suggestedStageName}` : ""}
        </p>
        {appliedAt ? (
          <p className="mt-1 text-xs font-semibold text-success-700 dark:text-success-300">
            Applied {formatDate(appliedAt)}
          </p>
        ) : (
          <Button size="sm" disabled={isPending}>
            {isPending ? "Applying..." : "Approve move"}
          </Button>
        )}
        <ActionStateMessage state={state.message ? state : undefined} />
      </div>
    </form>
  );
}

function AiStageGuidance({
  aiRecommendation,
  saleId,
}: {
  aiRecommendation: SaleAutomationActivityProps["aiRecommendation"];
  saleId: string;
}) {
  const [state, formAction, isPending] = useActionState(
    updateSaleStageAction,
    initialState,
  );
  const [feedbackState, feedbackAction, isFeedbackPending] = useActionState(
    recordSaleAiFeedbackAction,
    initialState,
  );

  if (!aiRecommendation) {
    return (
      <p className="mt-2 rounded-xl border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
        No AI stage recommendation cached yet.
      </p>
    );
  }

  const canMove =
    aiRecommendation.targetStageId &&
    aiRecommendation.action !== "stay" &&
    aiRecommendation.action !== "Stay" &&
    (aiRecommendation.targetStageMovementPolicy === "AI_SUGGESTED" ||
      aiRecommendation.targetStageMovementPolicy === "AI_AUTOMATED");

  return (
    <div className="mt-2 rounded-xl bg-brand-50 px-3 py-2 dark:bg-brand-500/10">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-gray-800 dark:text-white/90">
          {label(aiRecommendation.action)}
          {aiRecommendation.targetStage
            ? `: ${aiRecommendation.targetStage}`
            : ""}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {formatDate(aiRecommendation.generatedAt)}
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
        {aiRecommendation.rationale}
      </p>
      {aiRecommendation.targetStageMovementPolicy ? (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Movement policy: {label(aiRecommendation.targetStageMovementPolicy)}
        </p>
      ) : null}
      {canMove ? (
        <div className="mt-2">
          <form action={formAction}>
            <input type="hidden" name="saleId" value={saleId} />
            <input
              type="hidden"
              name="salesPipelineStageId"
              value={aiRecommendation.targetStageId ?? ""}
            />
            <Button size="sm" disabled={isPending}>
              {isPending ? "Moving..." : "Move to AI target"}
            </Button>
            <ActionStateMessage state={state.message ? state : undefined} />
          </form>
        </div>
      ) : null}
      {aiRecommendation.targetStageId && !canMove ? (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          This target stage is not configured for AI-assisted movement.
        </p>
      ) : null}
      <form
        action={feedbackAction}
        className="mt-3 flex flex-wrap items-center gap-2"
      >
        <input type="hidden" name="saleId" value={saleId} />
        <input type="hidden" name="recommendationType" value="stage-guidance" />
        <input
          type="hidden"
          name="recommendationAction"
          value={aiRecommendation.action}
        />
        <input
          type="hidden"
          name="targetStageId"
          value={aiRecommendation.targetStageId ?? ""}
        />
        <input
          type="hidden"
          name="targetStage"
          value={aiRecommendation.targetStage ?? ""}
        />
        <input
          type="hidden"
          name="rationale"
          value={aiRecommendation.rationale}
        />
        <button
          name="outcome"
          value="accepted"
          disabled={isFeedbackPending}
          className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-success-700 ring-1 ring-success-200 hover:bg-success-50 disabled:opacity-50 dark:bg-gray-950 dark:text-success-300 dark:ring-success-900/50"
        >
          Useful
        </button>
        <button
          name="outcome"
          value="dismissed"
          disabled={isFeedbackPending}
          className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-50 dark:bg-gray-950 dark:text-gray-300 dark:ring-gray-800"
        >
          Not useful
        </button>
        <ActionStateMessage
          state={feedbackState.message ? feedbackState : undefined}
        />
      </form>
    </div>
  );
}

export default function SaleAutomationActivity({
  aiRecommendation,
  automationRuns,
  saleId,
  scoreEvents,
}: SaleAutomationActivityProps) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div>
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Automation activity
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Recent score changes and automation decisions.
        </p>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
            AI stage guidance
          </h3>
          <AiStageGuidance
            aiRecommendation={aiRecommendation}
            saleId={saleId}
          />
        </div>

        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
            Score history
          </h3>
          <div className="mt-2 space-y-2">
            {scoreEvents.length ? (
              scoreEvents.map((event) => (
                <div
                  key={event.id}
                  className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-white/[0.03]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-gray-800 dark:text-white/90">
                      {event.delta > 0 ? "+" : ""}
                      {event.delta} · {event.scoreAfter}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDate(event.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {event.reason}
                  </p>
                </div>
              ))
            ) : (
              <p className="rounded-xl border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                No score changes yet.
              </p>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
            Automation runs
          </h3>
          <div className="mt-2 space-y-2">
            {automationRuns.length ? (
              automationRuns.map((run) => (
                <div
                  key={run.id}
                  className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-white/[0.03]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-gray-800 dark:text-white/90">
                      {run.ruleName ?? label(run.trigger)}
                    </span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-600 ring-1 ring-gray-200 dark:bg-gray-950 dark:text-gray-300 dark:ring-gray-800">
                      {run.status.toLowerCase()}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {label(run.action)} · {formatDate(run.createdAt)}
                  </p>
                  {run.message ? (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {run.message}
                    </p>
                  ) : null}
                  <StageSuggestionButton run={run} />
                </div>
              ))
            ) : (
              <p className="rounded-xl border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                No automation runs yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
