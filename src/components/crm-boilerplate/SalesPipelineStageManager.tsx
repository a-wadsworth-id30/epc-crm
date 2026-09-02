"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import CustomerSalesCategoryBadge from "@/components/crm-boilerplate/CustomerSalesCategoryBadge";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import {
  documentUploadTypeDefinitions,
  type DocumentUploadType,
} from "@/lib/document-library";
import {
  createSalesPipelineStageAction,
  updateSalesKanbanSettingsAction,
  updateSalesPipelineStageAction,
  type SalesKanbanSettingsActionState,
  type SalesPipelineStageActionState,
} from "@/lib/actions/sales-pipeline";
import { PencilIcon, PlusIcon } from "@/icons";
import {
  salesKanbanCardFieldDefinitions,
  type SalesKanbanSettings,
} from "@/lib/sales/kanban-settings";
import {
  customerSalesCategoryForStage,
  customerSalesCategoryOptions,
  type CustomerSalesCategoryValue,
} from "@/lib/sales/customer-sales-category";
import type { SalesStageValue } from "@/lib/sales/lifecycle";
import {
  stageRequiredActionDefinitions,
  stageRequiredActionLabel,
  stageRequiredDocumentTypesLabel,
  type StageRequiredAction,
} from "@/lib/sales/stage-requirements";

export type SalesPipelineStageManagerItem = {
  id: string;
  name: string;
  slug: string;
  bucket: SalesStageValue;
  customerSalesCategory: CustomerSalesCategoryValue;
  sortOrder: number;
  defaultProbability: number;
  goal: string | null;
  aiContext: string | null;
  slaDays: number | null;
  movementPolicy: "MANUAL" | "AI_SUGGESTED" | "RULE_AUTOMATED" | "AI_AUTOMATED";
  gateMode: "NONE" | "WARN" | "BLOCK";
  isActive: boolean;
  isClosed: boolean;
  isWon: boolean;
  isLost: boolean;
  color: string | null;
  description: string | null;
  requiredActions: StageRequiredAction[];
  requiredDocumentTypes: DocumentUploadType[];
  opportunityCount: number;
  lifecycleEventCount: number;
};

const bucketOptions: Array<{
  value: SalesStageValue;
  label: string;
  description: string;
}> = [
  {
    value: "LEAD",
    label: "Lead",
    description: "New or unqualified lead bucket",
  },
  {
    value: "QUALIFIED",
    label: "Qualified",
    description: "Qualified lead bucket",
  },
  {
    value: "PROPOSAL",
    label: "Proposal",
    description: "Proposal or quote bucket",
  },
  {
    value: "NEGOTIATION",
    label: "Negotiation",
    description: "Negotiation bucket",
  },
  { value: "WON", label: "Won", description: "Closed won bucket" },
  { value: "LOST", label: "Lost", description: "Closed lost opportunities" },
];

const bucketClasses: Record<SalesStageValue, string> = {
  LEAD: "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300",
  QUALIFIED:
    "bg-blue-light-50 text-blue-light-700 dark:bg-blue-light-500/15 dark:text-blue-light-300",
  PROPOSAL:
    "bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
  NEGOTIATION:
    "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-300",
  WON: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300",
  LOST: "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-300",
};

const bucketDefaultColors: Record<SalesStageValue, string> = {
  LEAD: "#6B7280",
  QUALIFIED: "#2563EB",
  PROPOSAL: "#7C3AED",
  NEGOTIATION: "#D97706",
  WON: "#059669",
  LOST: "#DC2626",
};

const movementPolicyOptions = [
  { value: "MANUAL", label: "Manual", description: "Users move stages." },
  {
    value: "AI_SUGGESTED",
    label: "AI suggested",
    description: "AI can recommend movement.",
  },
  {
    value: "RULE_AUTOMATED",
    label: "Rule automated",
    description: "Rules may move stages.",
  },
  {
    value: "AI_AUTOMATED",
    label: "AI automated",
    description: "Reserved for high-confidence automation.",
  },
] as const;

const gateModeOptions = [
  { value: "NONE", label: "No gate" },
  { value: "WARN", label: "Warn only" },
  { value: "BLOCK", label: "Block movement" },
] as const;

const initialActionState: SalesPipelineStageActionState = {
  ok: false,
  message: "",
  savedAt: null,
};

const initialKanbanSettingsActionState: SalesKanbanSettingsActionState = {
  ok: false,
  message: "",
  savedAt: null,
};

function bucketLabel(bucket: SalesStageValue) {
  return (
    bucketOptions.find((option) => option.value === bucket)?.label ?? bucket
  );
}

function StageBadge({ bucket }: { bucket: SalesStageValue }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${bucketClasses[bucket]}`}
    >
      {bucketLabel(bucket)}
    </span>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
        isActive
          ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300"
          : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400"
      }`}
    >
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}

function SalesPipelineStageForm({
  mode,
  nextSortOrder,
  onSuccess,
  stage,
}: {
  mode: "create" | "edit";
  nextSortOrder: number;
  onSuccess: () => void;
  stage?: SalesPipelineStageManagerItem;
}) {
  const action =
    mode === "create"
      ? createSalesPipelineStageAction
      : updateSalesPipelineStageAction;
  const [state, formAction, isPending] = useActionState(
    action,
    initialActionState,
  );
  const [isDirty, setIsDirty] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const { showToast } = useToast();
  const defaultBucket = stage?.bucket ?? "LEAD";
  const defaultCustomerSalesCategory =
    stage?.customerSalesCategory ??
    customerSalesCategoryForStage(defaultBucket);
  const defaultColor = stage?.color ?? bucketDefaultColors[defaultBucket];

  useEffect(() => {
    if (!state.ok || !state.savedAt) return;

    showToast(state.message || "Pipeline stage saved.");
    formRef.current?.reset();
    queueMicrotask(() => {
      setIsDirty(false);
      onSuccess();
    });
  }, [onSuccess, showToast, state.message, state.ok, state.savedAt]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onChangeCapture={() => setIsDirty(true)}
      className="space-y-5"
    >
      {stage ? <input type="hidden" name="stageId" value={stage.id} /> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor={`${mode}-stage-name`}>Stage name</Label>
          <Input
            id={`${mode}-stage-name`}
            name="name"
            defaultValue={stage?.name ?? ""}
            required
          />
        </div>
        <div>
          <Label htmlFor={`${mode}-stage-bucket`}>Reporting bucket</Label>
          <select
            id={`${mode}-stage-bucket`}
            name="bucket"
            defaultValue={defaultBucket}
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            {bucketOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor={`${mode}-customer-category`}>Customer category</Label>
          <select
            id={`${mode}-customer-category`}
            name="customerSalesCategory"
            defaultValue={defaultCustomerSalesCategory}
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            {customerSalesCategoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor={`${mode}-stage-sort-order`}>Sort order</Label>
          <Input
            id={`${mode}-stage-sort-order`}
            name="sortOrder"
            type="number"
            min={1}
            max={10000}
            defaultValue={stage?.sortOrder ?? nextSortOrder}
            required
          />
        </div>
        <div>
          <Label htmlFor={`${mode}-stage-probability`}>
            Default probability
          </Label>
          <Input
            id={`${mode}-stage-probability`}
            name="defaultProbability"
            type="number"
            min={0}
            max={100}
            defaultValue={stage?.defaultProbability ?? 10}
            required
          />
        </div>
        <div>
          <Label htmlFor={`${mode}-stage-color`}>Colour</Label>
          <div className="flex items-center gap-3">
            <input
              id={`${mode}-stage-color`}
              name="color"
              type="color"
              defaultValue={defaultColor}
              className="h-11 w-14 rounded-lg border border-gray-300 bg-transparent p-1 dark:border-gray-700 dark:bg-gray-900"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Used for stage markers and badges.
            </span>
          </div>
        </div>
        <div className="flex items-end">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-gray-700 dark:text-gray-400">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={stage?.isActive ?? true}
              className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700"
            />
            Active for new sales
          </label>
        </div>
      </div>

      <div>
        <Label htmlFor={`${mode}-stage-description`}>Description</Label>
        <textarea
          id={`${mode}-stage-description`}
          name="description"
          defaultValue={stage?.description ?? ""}
          rows={3}
          className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
      </div>

      <div>
        <Label htmlFor={`${mode}-stage-goal`}>Stage goal</Label>
        <textarea
          id={`${mode}-stage-goal`}
          name="goal"
          defaultValue={stage?.goal ?? ""}
          rows={3}
          placeholder="What should this stage achieve?"
          className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
      </div>

      <div>
        <Label htmlFor={`${mode}-stage-ai-context`}>AI context</Label>
        <textarea
          id={`${mode}-stage-ai-context`}
          name="aiContext"
          defaultValue={stage?.aiContext ?? ""}
          rows={4}
          placeholder="How should AI behave in this stage? Include what to collect, what to avoid, and what next action to push for."
          className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor={`${mode}-stage-movement-policy`}>
            Movement policy
          </Label>
          <select
            id={`${mode}-stage-movement-policy`}
            name="movementPolicy"
            defaultValue={stage?.movementPolicy ?? "MANUAL"}
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            {movementPolicyOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor={`${mode}-stage-gate-mode`}>Required-data gate</Label>
          <select
            id={`${mode}-stage-gate-mode`}
            name="gateMode"
            defaultValue={stage?.gateMode ?? "WARN"}
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            {gateModeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor={`${mode}-stage-sla-days`}>Stage SLA days</Label>
          <Input
            id={`${mode}-stage-sla-days`}
            name="slaDays"
            type="number"
            min={1}
            max={365}
            defaultValue={stage?.slaDays ?? ""}
            placeholder="No SLA"
          />
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="text-sm font-semibold text-gray-800 dark:text-white/90">
          Stage progression requirements
        </div>
        <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-400">
          Required discovery questions linked to this stage still apply. These
          extra rules use existing CRM evidence such as documents, tags, notes,
          linked tasks and communications.
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {stageRequiredActionDefinitions.map((requirement) => (
            <label
              key={requirement.value}
              className="flex cursor-pointer gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm dark:border-gray-800 dark:bg-gray-950"
            >
              <input
                type="checkbox"
                name="requiredActions"
                value={requirement.value}
                defaultChecked={stage?.requiredActions.includes(
                  requirement.value,
                )}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700"
              />
              <span>
                <span className="block font-medium text-gray-800 dark:text-white/90">
                  {requirement.label}
                </span>
                <span className="mt-1 block text-xs leading-5 text-gray-500 dark:text-gray-400">
                  {requirement.description}
                </span>
              </span>
            </label>
          ))}
        </div>
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
          <div className="text-sm font-semibold text-gray-800 dark:text-white/90">
            Required document types
          </div>
          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
            Used when the Required documents uploaded rule is selected. If no
            types are selected, any linked document satisfies the rule.
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {documentUploadTypeDefinitions.map((definition) => (
              <label
                key={definition.key}
                className="flex cursor-pointer gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-800 dark:bg-white/[0.03]"
              >
                <input
                  type="checkbox"
                  name="requiredDocumentTypes"
                  value={definition.key}
                  defaultChecked={stage?.requiredDocumentTypes.includes(
                    definition.key,
                  )}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700"
                />
                <span>
                  <span className="block font-medium text-gray-800 dark:text-white/90">
                    {definition.label}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-gray-500 dark:text-gray-400">
                    {definition.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ActionStateMessage state={state.message ? state : undefined} />
        <button
          type="submit"
          disabled={isPending || !isDirty}
          className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending
            ? mode === "create"
              ? "Creating..."
              : "Saving..."
            : mode === "create"
              ? "Create stage"
              : "Save stage"}
        </button>
      </div>
    </form>
  );
}

function SalesKanbanSettingsForm({
  settings,
}: {
  settings: SalesKanbanSettings;
}) {
  const [state, formAction, isPending] = useActionState(
    updateSalesKanbanSettingsAction,
    initialKanbanSettingsActionState,
  );
  const [isDirty, setIsDirty] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (!state.ok || !state.savedAt) return;

    showToast(state.message || "Kanban board settings saved.");
    queueMicrotask(() => setIsDirty(false));
  }, [showToast, state.message, state.ok, state.savedAt]);

  return (
    <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Kanban board cards
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Choose the operational fields shown on each sales Kanban card.
          </p>
        </div>
      </div>

      <form
        ref={formRef}
        action={formAction}
        onChangeCapture={() => setIsDirty(true)}
        className="mt-4 space-y-4"
      >
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {salesKanbanCardFieldDefinitions.map((field) => (
            <label
              key={field.value}
              className="flex cursor-pointer gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <input
                type="checkbox"
                name="cardFields"
                value={field.value}
                defaultChecked={settings.cardFields.includes(field.value)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700"
              />
              <span>
                <span className="block font-medium text-gray-800 dark:text-white/90">
                  {field.label}
                </span>
                <span className="mt-1 block text-xs leading-5 text-gray-500 dark:text-gray-400">
                  {field.description}
                </span>
              </span>
            </label>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ActionStateMessage state={state.message ? state : undefined} />
          <button
            type="submit"
            disabled={isPending || !isDirty}
            className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Save board settings"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default function SalesPipelineStageManager({
  kanbanSettings,
  nextSortOrder,
  stages,
}: {
  kanbanSettings: SalesKanbanSettings;
  nextSortOrder: number;
  stages: SalesPipelineStageManagerItem[];
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingStage, setEditingStage] =
    useState<SalesPipelineStageManagerItem | null>(null);

  const totals = useMemo(() => {
    const active = stages.filter((stage) => stage.isActive).length;
    const linkedSales = stages.reduce(
      (total, stage) => total + stage.opportunityCount,
      0,
    );
    const coveredBuckets = new Set(
      stages.filter((stage) => stage.isActive).map((stage) => stage.bucket),
    ).size;

    return { active, linkedSales, coveredBuckets, total: stages.length };
  }, [stages]);

  return (
    <>
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
            Stages
          </div>
          <div className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
            {totals.total}
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
            Active
          </div>
          <div className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
            {totals.active}
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
            Buckets
          </div>
          <div className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
            {totals.coveredBuckets}/6
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
            Linked sales
          </div>
          <div className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
            {totals.linkedSales}
          </div>
        </div>
      </div>

      <SalesKanbanSettingsForm settings={kanbanSettings} />

      <section className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
                Pipeline stages
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Custom stages map to stable reporting buckets for attribution
                and conversion workflows.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => setShowCreateModal(true)}
              startIcon={<PlusIcon />}
            >
              Add stage
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-white/[0.02]">
              <tr className="text-left text-xs text-gray-500 uppercase dark:text-gray-400">
                <th className="px-5 py-3">Order</th>
                <th className="px-5 py-3">Stage</th>
                <th className="px-5 py-3">Customer category</th>
                <th className="px-5 py-3">Bucket</th>
                <th className="px-5 py-3">Probability</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Usage</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {stages.map((stage) => (
                <tr
                  key={stage.id}
                  className="text-sm text-gray-700 dark:text-gray-300"
                >
                  <td className="px-5 py-4">
                    <span className="font-medium text-gray-800 dark:text-white/90">
                      {stage.sortOrder}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <span
                        className="mt-1 h-3 w-3 shrink-0 rounded-full"
                        style={{
                          backgroundColor:
                            stage.color ?? bucketDefaultColors[stage.bucket],
                        }}
                      />
                      <div>
                        <div className="font-medium text-gray-800 dark:text-white/90">
                          {stage.name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {stage.slug}
                        </div>
                        {stage.description ? (
                          <div className="mt-1 max-w-sm text-xs text-gray-500 dark:text-gray-400">
                            {stage.description}
                          </div>
                        ) : null}
                        {stage.goal ? (
                          <div className="mt-1 max-w-sm text-xs text-gray-600 dark:text-gray-300">
                            Goal: {stage.goal}
                          </div>
                        ) : null}
                        {stage.slaDays ? (
                          <div className="mt-1 max-w-sm text-xs text-gray-500 dark:text-gray-400">
                            SLA: {stage.slaDays} day
                            {stage.slaDays === 1 ? "" : "s"}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <CustomerSalesCategoryBadge
                      category={stage.customerSalesCategory}
                    />
                  </td>
                  <td className="px-5 py-4">
                    <StageBadge bucket={stage.bucket} />
                  </td>
                  <td className="px-5 py-4">{stage.defaultProbability}%</td>
                  <td className="px-5 py-4">
                    <div className="flex flex-col gap-2">
                      <StatusBadge isActive={stage.isActive} />
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {gateModeOptions.find(
                          (option) => option.value === stage.gateMode,
                        )?.label ?? stage.gateMode}
                      </span>
                      {stage.requiredActions.length ? (
                        <span className="max-w-[180px] text-xs leading-5 text-gray-500 dark:text-gray-400">
                          {stage.requiredActions
                            .map(stageRequiredActionLabel)
                            .join(", ")}
                        </span>
                      ) : null}
                      {stage.requiredDocumentTypes.length ? (
                        <span className="max-w-[180px] text-xs leading-5 text-gray-500 dark:text-gray-400">
                          Docs:{" "}
                          {stageRequiredDocumentTypesLabel(
                            stage.requiredDocumentTypes,
                          )}
                        </span>
                      ) : null}
                      {stage.isClosed ? (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {stage.isWon
                            ? "Closed won"
                            : stage.isLost
                              ? "Closed lost"
                              : "Closed"}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="text-gray-800 dark:text-white/90">
                      {stage.opportunityCount} sales
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {stage.lifecycleEventCount} history events
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => setEditingStage(stage)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
                      aria-label={`Edit ${stage.name}`}
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        className="relative m-5 w-full max-w-[760px] rounded-3xl bg-white p-6 sm:m-0 lg:p-8 dark:bg-gray-900"
      >
        <h2 className="text-title-xs mb-1 font-semibold text-gray-800 dark:text-white/90">
          Add pipeline stage
        </h2>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          Create a custom stage and map it to a reporting bucket.
        </p>
        <SalesPipelineStageForm
          mode="create"
          nextSortOrder={nextSortOrder}
          onSuccess={() => setShowCreateModal(false)}
        />
      </Modal>

      <Modal
        isOpen={Boolean(editingStage)}
        onClose={() => setEditingStage(null)}
        className="relative m-5 w-full max-w-[760px] rounded-3xl bg-white p-6 sm:m-0 lg:p-8 dark:bg-gray-900"
      >
        {editingStage ? (
          <>
            <h2 className="text-title-xs mb-1 font-semibold text-gray-800 dark:text-white/90">
              Edit pipeline stage
            </h2>
            <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
              Adjust stage settings for future sales workflow and reporting.
            </p>
            <SalesPipelineStageForm
              key={editingStage.id}
              mode="edit"
              stage={editingStage}
              nextSortOrder={nextSortOrder}
              onSuccess={() => setEditingStage(null)}
            />
          </>
        ) : null}
      </Modal>
    </>
  );
}
