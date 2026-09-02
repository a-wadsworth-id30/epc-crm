"use client";

import { useActionState, useMemo, useState } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import SalesPipelineStageBadge from "@/components/crm-boilerplate/SalesPipelineStageBadge";
import Button from "@/components/ui/button/Button";
import {
  updateSaleStageAction,
  type SalesActionState,
} from "@/lib/actions/sales";

export type SaleStageControlOption = {
  id: string;
  name: string;
  bucket: string;
  color: string | null;
  gateMode: "NONE" | "WARN" | "BLOCK";
  goal: string | null;
  movementPolicy: "MANUAL" | "AI_SUGGESTED" | "RULE_AUTOMATED" | "AI_AUTOMATED";
  slaDays: number | null;
};

export type SaleStageGatePreview = {
  mode: "NONE" | "WARN" | "BLOCK";
  missing: Array<{
    label: string;
    questionId: string;
    templateName: string;
  }>;
  passed: boolean;
  stageId: string;
};

type SaleStageControlProps = {
  currentStageId: string | null;
  currentStageName: string;
  currentStageColor: string | null;
  score: number;
  scoreUpdatedAt: string | null;
  stageAgeDays: number;
  saleId: string;
  stageOptions: SaleStageControlOption[];
  stageGatePreviews: SaleStageGatePreview[];
};

const initialState: SalesActionState = {
  ok: false,
  message: "",
};

function movementPolicyLabel(value: SaleStageControlOption["movementPolicy"]) {
  if (value === "AI_SUGGESTED") return "AI suggested";
  if (value === "RULE_AUTOMATED") return "Rule automated";
  if (value === "AI_AUTOMATED") return "AI automated";
  return "Manual";
}

function gateLabel(gate: SaleStageGatePreview | undefined) {
  if (!gate || gate.mode === "NONE") return "No required-data gate";
  if (!gate.missing.length) return "Required data complete";
  if (gate.mode === "BLOCK")
    return `${gate.missing.length} blocker${gate.missing.length === 1 ? "" : "s"}`;
  return `${gate.missing.length} warning${gate.missing.length === 1 ? "" : "s"}`;
}

export default function SaleStageControl({
  currentStageColor,
  currentStageId,
  currentStageName,
  saleId,
  score,
  scoreUpdatedAt,
  stageAgeDays,
  stageGatePreviews,
  stageOptions,
}: SaleStageControlProps) {
  const [state, formAction, isPending] = useActionState(
    updateSaleStageAction,
    initialState,
  );
  const initialStageId = currentStageId ?? stageOptions[0]?.id ?? "";
  const [selectedStageId, setSelectedStageId] = useState(initialStageId);
  const selectedStage = stageOptions.find(
    (stage) => stage.id === selectedStageId,
  );
  const selectedGate = stageGatePreviews.find(
    (preview) => preview.stageId === selectedStageId,
  );
  const isSameStage = selectedStageId === currentStageId;
  const isBlocked =
    selectedGate?.mode === "BLOCK" && selectedGate.missing.length > 0;
  const currentStageOption = stageOptions.find(
    (stage) => stage.id === currentStageId,
  );
  const isPastSla =
    currentStageOption?.slaDays !== null &&
    currentStageOption?.slaDays !== undefined &&
    stageAgeDays >= currentStageOption.slaDays;
  const scoreTone = useMemo(() => {
    if (score >= 70) return "text-success-700 dark:text-success-300";
    if (score >= 40) return "text-warning-700 dark:text-warning-300";
    return "text-gray-700 dark:text-gray-300";
  }, [score]);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Stage control
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Move the sale when the stage requirements are ready.
          </p>
        </div>
        <SalesPipelineStageBadge
          color={currentStageColor ?? "#6B7280"}
          label={currentStageName}
        />
      </div>

      <div className="mt-4 grid gap-3 rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
            Lead score
          </span>
          <span className={`text-lg font-semibold ${scoreTone}`}>{score}</span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {scoreUpdatedAt
            ? `Last updated ${new Date(scoreUpdatedAt).toLocaleString("en-GB", {
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                month: "short",
              })}`
            : "No score events yet"}
        </p>
      </div>

      {currentStageOption?.slaDays ? (
        <div
          className={`mt-3 rounded-xl px-3 py-2 text-sm ${
            isPastSla
              ? "bg-warning-50 text-warning-800 dark:bg-warning-900/20 dark:text-warning-300"
              : "bg-gray-50 text-gray-600 dark:bg-white/[0.03] dark:text-gray-300"
          }`}
        >
          Stage age: {stageAgeDays}d / SLA {currentStageOption.slaDays}d
          {isPastSla ? ". Review next action." : ""}
        </div>
      ) : null}

      <form action={formAction} className="mt-4 space-y-4">
        <input type="hidden" name="saleId" value={saleId} />
        <div>
          <label
            htmlFor="sale-stage-control-stage"
            className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Target stage
          </label>
          <select
            id="sale-stage-control-stage"
            name="salesPipelineStageId"
            value={selectedStageId}
            onChange={(event) => setSelectedStageId(event.target.value)}
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            {stageOptions.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </div>

        {selectedStage ? (
          <div className="space-y-3 rounded-xl border border-gray-200 p-3 text-sm dark:border-gray-800">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 dark:bg-white/[0.06] dark:text-gray-300">
                {movementPolicyLabel(selectedStage.movementPolicy)}
              </span>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 dark:bg-white/[0.06] dark:text-gray-300">
                {gateLabel(selectedGate)}
              </span>
            </div>
            {selectedStage.goal ? (
              <p className="leading-5 text-gray-600 dark:text-gray-400">
                {selectedStage.goal}
              </p>
            ) : null}
            {selectedGate?.missing.length ? (
              <div
                className={`rounded-lg px-3 py-2 text-xs leading-5 ${
                  selectedGate.mode === "BLOCK"
                    ? "bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300"
                    : "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
                }`}
              >
                <p className="font-semibold">
                  {selectedGate.mode === "BLOCK"
                    ? "Required before moving"
                    : "Missing but movement allowed"}
                </p>
                <ul className="mt-1 space-y-1">
                  {selectedGate.missing.slice(0, 5).map((question) => (
                    <li key={question.questionId}>
                      {question.label} · {question.templateName}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        <ActionStateMessage state={state.message ? state : undefined} />
        <Button
          size="sm"
          disabled={isPending || isSameStage || isBlocked || !selectedStageId}
        >
          {isPending ? "Moving..." : "Move stage"}
        </Button>
      </form>
    </section>
  );
}
