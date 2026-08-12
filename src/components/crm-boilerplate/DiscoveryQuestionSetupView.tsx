"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { useModal } from "@/hooks/useModal";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BrainIcon,
  CheckCircleIcon,
  ClockIcon,
  CloseIcon,
  DocsIcon,
  EditIcon,
  FlashIcon,
  PlusIcon,
  SearchIcon,
  TrashBinIcon,
} from "@/icons";
import {
  saveDiscoveryQuestionAction,
  saveDiscoveryTemplateAction,
} from "@/lib/actions/products-discovery";
import { matchesSearchQuery, type SearchField } from "@/lib/search/match";

export type DiscoveryTemplateRow = {
  id: string;
  name: string;
  slug: string;
  scope: string;
  description: string | null;
  isActive: boolean;
  version: number;
  salesPipelineStageId: string | null;
  salesPipelineStageName: string | null;
  productIds: string[];
  productNames: string[];
  categoryIds: string[];
  categoryNames: string[];
  questions: Array<{
    id: string;
    label: string;
    scope: string;
    answerType: string;
    answerMode: string;
    maxAnswers: number | null;
    required: boolean;
    visibilityRules: unknown;
    requirementRules: unknown;
  }>;
};

export type DiscoveryQuestionRow = {
  id: string;
  slug: string;
  label: string;
  helpText: string | null;
  scope: string;
  answerType: string;
  answerMode: string;
  maxAnswers: number | null;
  optionsText: string;
  defaultRequired: boolean;
  dedupeKey: string | null;
  isActive: boolean;
  templateNames: string[];
};

export type DiscoveryLinkOption = {
  id: string;
  name: string;
};

const inputClassName =
  "h-9 w-full rounded-lg border border-gray-300 bg-transparent px-2.5 text-sm text-gray-800 outline-none transition focus:border-brand-500 dark:border-gray-700 dark:text-white/90";

const textareaClassName =
  "min-h-16 w-full rounded-lg border border-gray-300 bg-transparent px-2.5 py-1.5 text-sm text-gray-800 outline-none transition focus:border-brand-500 dark:border-gray-700 dark:text-white/90";

const checkboxClassName =
  "h-3.5 w-3.5 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700";

const templateScopes = ["LEAD", "PRODUCT", "CATEGORY"];
const questionScopes = ["OPPORTUNITY", "PRODUCT", "CATEGORY", "LINE_ITEM"];
const answerModes = ["SINGLE", "MULTIPLE_MAX", "MULTIPLE_UNLIMITED"];
const answerTypeGroups = [
  {
    label: "Text",
    types: ["TEXT", "LONG_TEXT", "URL", "DOMAIN"],
  },
  {
    label: "Choices",
    types: ["BOOLEAN", "SINGLE_SELECT", "MULTI_SELECT"],
  },
  {
    label: "Numbers and dates",
    types: ["NUMBER", "CURRENCY", "CURRENCY_RANGE", "SLIDER", "DATE", "DATETIME"],
  },
  {
    label: "CRM selectors",
    types: [
      "PRODUCT_SELECT",
      "PRODUCT_MULTI_SELECT",
      "CATEGORY_SELECT",
      "CATEGORY_MULTI_SELECT",
    ],
  },
] satisfies Array<{ label: string; types: string[] }>;
type DiscoveryTab = "groups" | "questions" | "logic" | "requirements" | "preview";
type TemplateQuestionSelection = {
  id: string;
  required: boolean;
  requirementRule?: DiscoveryRuleDraft;
  visibilityRule?: DiscoveryRuleDraft;
};

type DiscoveryRuleDraft = {
  operator: string;
  questionId: string;
  value: string;
};

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function answerTypeLabel(value: string) {
  const labels: Record<string, string> = {
    BOOLEAN: "Yes / no",
    CATEGORY_MULTI_SELECT: "Categories multi-select",
    CATEGORY_SELECT: "Category selector",
    CURRENCY: "Currency amount",
    CURRENCY_RANGE: "Currency range",
    DATETIME: "Date and time",
    DOMAIN: "Domain / website",
    LONG_TEXT: "Long text",
    MULTI_SELECT: "Multi-select",
    NUMBER: "Number",
    PRODUCT_MULTI_SELECT: "Products multi-select",
    PRODUCT_SELECT: "Product selector",
    SINGLE_SELECT: "Select dropdown",
    SLIDER: "Slider",
    TEXT: "Single-line text",
    URL: "URL",
  };

  return labels[value] ?? titleCase(value);
}

function answerTypeHint(value: string) {
  const hints: Record<string, string> = {
    BOOLEAN: "Simple yes/no answer for qualifying out follow-up questions.",
    CURRENCY_RANGE: "Uses the options list as selectable budget ranges.",
    DOMAIN: "Best used as a repeatable field for websites or domain names.",
    LONG_TEXT: "Use for notes, requirements and longer discovery answers.",
    MULTI_SELECT: "Uses options and lets the user choose more than one.",
    PRODUCT_SELECT: "Loads active CRM products automatically.",
    PRODUCT_MULTI_SELECT: "Loads active CRM products automatically.",
    CATEGORY_SELECT: "Loads active CRM categories automatically.",
    CATEGORY_MULTI_SELECT: "Loads active CRM categories automatically.",
    NUMBER: "Captures a plain number.",
    SINGLE_SELECT: "Uses options as dropdown choices.",
    SLIDER: "Numeric 0-100 range for scoring or priority style answers.",
    URL: "Captures a full web address.",
  };

  return hints[value] ?? "Choose how this answer should be captured.";
}

function answerTypeSampleOptions(value: string) {
  const samples: Record<string, string> = {
    CURRENCY_RANGE: "£0-£5k\n£5k-£10k\n£10k-£25k",
    MULTI_SELECT: "Website\nBranding\nSEO",
    SINGLE_SELECT: "Within 3 months\nWithin 6 months\nNot sure yet",
  };

  return samples[value] ?? "One option per line";
}

function answerTypeNeedsOptions(value: string) {
  return ["SINGLE_SELECT", "MULTI_SELECT", "CURRENCY_RANGE"].includes(value);
}

function answerTypeLoadsOptions(value: string) {
  return [
    "PRODUCT_SELECT",
    "PRODUCT_MULTI_SELECT",
    "CATEGORY_SELECT",
    "CATEGORY_MULTI_SELECT",
  ].includes(value);
}

function optionsCount(optionsText: string) {
  return optionsText
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean).length;
}

function answerModeLabel(value: string, maxAnswers?: number | null) {
  if (value === "MULTIPLE_MAX") {
    return `Repeatable, max ${maxAnswers ?? "set"}`;
  }

  if (value === "MULTIPLE_UNLIMITED") {
    return "Repeatable, no max";
  }

  return "Single answer";
}

function answerModeHint(value: string, maxAnswers?: number | null) {
  if (value === "MULTIPLE_MAX") {
    return `Shows multiple inputs and stops at ${maxAnswers ?? "the max answer limit"}.`;
  }

  if (value === "MULTIPLE_UNLIMITED") {
    return "Starts with one input and lets sales add as many answers as needed.";
  }

  return "Shows one answer field.";
}

function questionWarnings(question: Pick<DiscoveryQuestionRow, "answerMode" | "answerType" | "maxAnswers" | "optionsText">) {
  const warnings: string[] = [];
  if (answerTypeNeedsOptions(question.answerType) && !optionsCount(question.optionsText)) {
    warnings.push("Needs options");
  }
  if (question.answerMode === "MULTIPLE_MAX" && !question.maxAnswers) {
    warnings.push("Set max");
  }
  return warnings;
}

function hasRules(question: Pick<DiscoveryTemplateRow["questions"][number], "visibilityRules" | "requirementRules">) {
  return Boolean(question.visibilityRules || question.requirementRules);
}

function ruleCount(question: Pick<DiscoveryTemplateRow["questions"][number], "visibilityRules" | "requirementRules">) {
  return Number(Boolean(question.visibilityRules)) + Number(Boolean(question.requirementRules));
}

function jsonRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstRuleDraft(value: unknown): DiscoveryRuleDraft | undefined {
  const data = jsonRecord(value);
  const rules = Array.isArray(data.rules) ? data.rules : [];
  const first = jsonRecord(rules[0]);
  const questionId =
    typeof first.questionId === "string" ? first.questionId.trim() : "";
  const operator =
    typeof first.operator === "string" ? first.operator.trim() : "equals";
  const ruleValue = typeof first.value === "string" ? first.value.trim() : "";

  if (!questionId) return undefined;

  return {
    operator,
    questionId,
    value: ruleValue,
  };
}

function ruleSummary(
  rule: DiscoveryRuleDraft | undefined,
  questions: Array<{ id: string; label: string }>,
) {
  if (!rule?.questionId) return "Always";
  const source = questions.find((question) => question.id === rule.questionId);
  const sourceLabel = source?.label ?? "another answer";
  if (rule.operator === "answered") return `When ${sourceLabel} is answered`;
  if (rule.operator === "not_answered") return `When ${sourceLabel} is empty`;
  const operatorLabel = rule.operator.replaceAll("_", " ");
  return `When ${sourceLabel} ${operatorLabel} ${rule.value || "value"}`;
}

function scopeClasses(scope: string) {
  if (scope === "LEAD" || scope === "OPPORTUNITY") {
    return "bg-blue-light-50 text-blue-light-700 dark:bg-blue-light-500/15 dark:text-blue-light-300";
  }

  if (scope === "PRODUCT") {
    return "bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300";
  }

  return "bg-gray-100 text-gray-700 dark:bg-white/[0.06] dark:text-gray-300";
}

function scopeAccentClass(scope: string) {
  if (scope === "LEAD" || scope === "OPPORTUNITY") return "bg-blue-light-500";
  if (scope === "PRODUCT") return "bg-purple-500";
  if (scope === "CATEGORY") return "bg-success-500";
  return "bg-gray-500";
}

function ScopePill({ scope }: { scope: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${scopeClasses(scope)}`}
    >
      {scope === "OPPORTUNITY" ? "Lead" : titleCase(scope)}
    </span>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
        active
          ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300"
          : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function questionSearchFields(question: DiscoveryQuestionRow): SearchField[] {
  return [
    question.label,
    question.slug,
    question.helpText,
    question.scope,
    question.answerType,
    question.dedupeKey,
    ...question.templateNames,
  ];
}

function templateRuleTotal(template: DiscoveryTemplateRow) {
  return template.questions.reduce(
    (total, question) => total + ruleCount(question),
    0,
  );
}

function templateIssueTotal(template: DiscoveryTemplateRow) {
  let issues = 0;
  if (!template.isActive) issues += 1;
  if (!template.questions.length) issues += 1;
  issues += template.questions.filter(
    (question) => question.answerMode === "MULTIPLE_MAX" && !question.maxAnswers,
  ).length;
  return issues;
}

function questionModeWarning(
  question: Pick<
    DiscoveryTemplateRow["questions"][number],
    "answerMode" | "maxAnswers"
  >,
) {
  return question.answerMode === "MULTIPLE_MAX" && !question.maxAnswers
    ? "Set max"
    : "";
}

function questionOptionSummary(
  question: Pick<DiscoveryQuestionRow, "answerType" | "optionsText">,
) {
  if (answerTypeLoadsOptions(question.answerType)) return "CRM";
  if (answerTypeNeedsOptions(question.answerType)) {
    const count = optionsCount(question.optionsText);
    return count ? `${count} options` : "Missing";
  }
  return "-";
}

function QuestionGroupsWorkspace({
  categories,
  onSelectTemplate,
  products,
  questions,
  selectedTemplate,
  selectedTemplateId,
  stages,
  templates,
}: {
  categories: DiscoveryLinkOption[];
  onSelectTemplate: (templateId: string) => void;
  products: DiscoveryLinkOption[];
  questions: DiscoveryQuestionRow[];
  selectedTemplate: DiscoveryTemplateRow | null;
  selectedTemplateId: string | null;
  stages: DiscoveryLinkOption[];
  templates: DiscoveryTemplateRow[];
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "ACTIVE" | "INACTIVE" | "ISSUES"
  >("ALL");
  const visibleTemplates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return templates.filter((template) => {
      if (statusFilter === "ACTIVE" && !template.isActive) return false;
      if (statusFilter === "INACTIVE" && template.isActive) return false;
      if (statusFilter === "ISSUES" && !templateIssueTotal(template)) {
        return false;
      }
      if (!normalizedQuery) return true;
      return [
        template.name,
        template.description,
        template.scope,
        template.salesPipelineStageName,
        ...template.productNames,
        ...template.categoryNames,
      ]
        .filter(Boolean)
        .some((field) => field?.toLowerCase().includes(normalizedQuery));
    });
  }, [query, statusFilter, templates]);
  const filterTabs = [
    ["ALL", "All", templates.length],
    ["ACTIVE", "Active", templates.filter((template) => template.isActive).length],
    [
      "INACTIVE",
      "Inactive",
      templates.filter((template) => !template.isActive).length,
    ],
    [
      "ISSUES",
      "Issues",
      templates.filter((template) => templateIssueTotal(template)).length,
    ],
  ] as const;

  return (
    <section className="grid gap-2 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 px-3 py-2 dark:border-gray-800">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Discovery packs
              </h2>
            </div>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
              {templates.length}
            </span>
          </div>
          <div className="mt-2 flex gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1 dark:bg-white/[0.06]">
            {filterTabs.map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
                className={`h-7 shrink-0 rounded-md px-2 text-xs font-semibold transition ${
                  statusFilter === value
                    ? "bg-white text-gray-900 shadow-theme-xs dark:bg-gray-900 dark:text-white"
                    : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
                }`}
              >
                {label}{" "}
                <span className="text-[10px] font-semibold opacity-70">
                  {count}
                </span>
              </button>
            ))}
          </div>
          <div className="relative mt-2">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search packs..."
              className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pr-3 pl-9 text-sm text-gray-800 outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-950 dark:text-white/90"
            />
          </div>
        </div>
        <div className="max-h-[520px] overflow-y-auto p-1">
          {visibleTemplates.map((template) => {
            const issues = templateIssueTotal(template);

            return (
              <button
                key={template.id}
                type="button"
                onClick={() => onSelectTemplate(template.id)}
                className={`group relative flex w-full items-start gap-2 rounded-lg border px-2 py-1.5 text-left transition ${
                  selectedTemplateId === template.id
                    ? "border-brand-200 bg-brand-50/70 shadow-theme-xs dark:border-brand-500/30 dark:bg-brand-500/10"
                    : "border-transparent hover:border-gray-200 hover:bg-gray-50 dark:hover:border-gray-800 dark:hover:bg-white/[0.03]"
                }`}
              >
                <span
                  className={`mt-1 h-8 w-1 shrink-0 rounded-full ${scopeAccentClass(template.scope)}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-semibold text-gray-900 dark:text-white">
                      {template.name}
                    </span>
                    {!template.isActive ? (
                      <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:bg-white/[0.06]">
                        Off
                      </span>
                    ) : null}
                    {issues ? (
                      <span className="ml-auto rounded-full bg-warning-50 px-1.5 py-0.5 text-[10px] font-semibold text-warning-700 dark:bg-warning-500/15 dark:text-warning-300">
                        {issues}
                      </span>
                    ) : (
                      <span className="ml-auto rounded-full bg-success-50 px-1.5 py-0.5 text-[10px] font-semibold text-success-700 dark:bg-success-500/15 dark:text-success-300">
                        OK
                      </span>
                    )}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <ScopePill scope={template.scope} />
                    <span className="rounded-full bg-white px-1.5 py-0.5 text-[11px] font-semibold text-gray-500 ring-1 ring-gray-200 dark:bg-gray-950 dark:ring-gray-800">
                      {template.questions.length} questions
                    </span>
                    {template.questions.some(hasRules) ? (
                      <span className="rounded-full bg-purple-50 px-1.5 py-0.5 text-[11px] font-semibold text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">
                        {templateRuleTotal(template)} rules
                      </span>
                    ) : null}
                    {template.questions.some((question) => question.required) ? (
                      <span className="rounded-full bg-warning-50 px-1.5 py-0.5 text-[11px] font-semibold text-warning-700 dark:bg-warning-500/15 dark:text-warning-300">
                        {template.questions.filter((question) => question.required).length} req
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
                    {groupAppliesTo(template).join(", ") || "Every lead"}
                  </span>
                </span>
              </button>
            );
          })}
          {!visibleTemplates.length ? (
            <div className="rounded-lg border border-dashed border-gray-200 p-3 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
              No packs match this view.
            </div>
          ) : null}
        </div>
      </aside>

      <SelectedGroupDetail
        categories={categories}
        products={products}
        questions={questions}
        stages={stages}
        template={selectedTemplate}
      />
    </section>
  );
}

function groupAppliesTo(template: DiscoveryTemplateRow) {
  return [
    ...template.productNames,
    ...template.categoryNames.map((category) => `${category} category`),
  ];
}

function GroupMetric({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-1.5 dark:border-gray-800 dark:bg-white/[0.02]">
      <p className="text-[10px] font-semibold text-gray-500 uppercase dark:text-gray-400">
        {label}
      </p>
      <div className="mt-0.5 text-[13px] font-semibold text-gray-800 dark:text-white/90">
        {value}
      </div>
    </div>
  );
}

function SelectedGroupDetail({
  categories,
  products,
  questions,
  stages,
  template,
}: {
  categories: DiscoveryLinkOption[];
  products: DiscoveryLinkOption[];
  questions: DiscoveryQuestionRow[];
  stages: DiscoveryLinkOption[];
  template: DiscoveryTemplateRow | null;
}) {
  if (!template) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
          No group selected
        </p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Create or select a group to configure discovery questions.
        </p>
      </div>
    );
  }

  const appliesTo = groupAppliesTo(template);
  const requiredCount = template.questions.filter((question) => question.required).length;
  const conditionalCount = template.questions.filter(hasRules).length;
  const dynamicRequiredCount = template.questions.filter(
    (question) => question.requirementRules,
  ).length;
  const groupIssues = [
    !template.isActive ? "Pack is inactive" : "",
    !template.questions.length ? "Pack has no questions" : "",
    ...template.questions
      .map((question) =>
        questionModeWarning(question)
          ? `${question.label}: capped repeatable needs a max`
          : "",
      )
      .filter(Boolean),
  ].filter(Boolean);

  return (
    <article className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className={`h-1.5 ${scopeAccentClass(template.scope)}`} />
      <div className="border-b border-gray-200 px-3 py-2.5 dark:border-gray-800">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ScopePill scope={template.scope} />
              <StatusPill active={template.isActive} />
              {template.salesPipelineStageName ? (
                <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">
                  {template.salesPipelineStageName}
                </span>
              ) : null}
            </div>
            <h3 className="mt-1.5 text-base font-semibold text-gray-900 dark:text-white">
              {template.name}
            </h3>
            <p className="mt-0.5 max-w-3xl text-xs leading-5 text-gray-500 dark:text-gray-400">
              {template.description ||
                "Reusable question group for collecting structured sales discovery."}
            </p>
          </div>
          <TemplateFormModal
            categories={categories}
            products={products}
            questions={questions}
            stages={stages}
            template={template}
            trigger={
              <Button size="sm" variant="outline" startIcon={<EditIcon />}>
                Edit group
              </Button>
            }
          />
        </div>
      </div>

      <div className="space-y-2.5 p-3">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <GroupMetric label="Scope" value={template.scope === "LEAD" ? "Every lead" : titleCase(template.scope)} />
          <GroupMetric label="Questions" value={`${template.questions.length} total`} />
          <GroupMetric label="Required" value={`${requiredCount} required`} />
          <GroupMetric label="Logic" value={`${conditionalCount} conditional`} />
          <GroupMetric label="Dynamic required" value={`${dynamicRequiredCount} rules`} />
        </div>

        <div className="rounded-lg border border-gray-100 bg-white px-3 py-2 dark:border-gray-800 dark:bg-white/[0.02]">
          <p className="text-[10px] font-semibold text-gray-500 uppercase dark:text-gray-400">
            Applies to
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {appliesTo.length ? (
              appliesTo.map((item) => (
                <span
                  key={item}
                  className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                >
                  {item}
                </span>
              ))
            ) : (
              <span className="rounded-full bg-blue-light-50 px-1.5 py-0.5 text-[11px] font-semibold text-blue-light-700 dark:bg-blue-light-500/15 dark:text-blue-light-300">
                Every lead
              </span>
            )}
            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
              v{template.version}
            </span>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-1.5 dark:border-gray-800 dark:bg-white/[0.02]">
            <div>
              <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Question sequence
              </h4>
            </div>
            <span className="rounded-full bg-white px-1.5 py-0.5 text-[11px] font-semibold text-gray-500 ring-1 ring-gray-200 dark:bg-gray-950 dark:ring-gray-800">
              {template.questions.length} steps
            </span>
          </div>
          <div className="hidden grid-cols-[minmax(0,1fr)_120px_88px_92px_minmax(0,150px)_70px] gap-2 border-b border-gray-100 bg-gray-50 px-3 py-1.5 text-[10px] font-semibold text-gray-500 uppercase dark:border-gray-800 dark:bg-white/[0.02] dark:text-gray-400 lg:grid">
            <span>Question</span>
            <span>Field type</span>
            <span>Options</span>
            <span>Required</span>
            <span>Show when</span>
            <span className="text-right">Issues</span>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {template.questions.map((question, index) => (
              <div
                key={question.id}
                className="grid gap-2 px-3 py-2 lg:grid-cols-[minmax(0,1fr)_120px_88px_92px_minmax(0,150px)_70px] lg:items-center"
              >
                <div className="flex min-w-0 gap-3">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 ring-1 ring-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:ring-gray-800">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-gray-800 dark:text-white/90">
                      {question.label}
                    </p>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      <ScopePill scope={question.scope} />
                      {question.visibilityRules ? (
                        <span className="rounded-full bg-purple-50 px-1.5 py-0.5 text-[11px] font-semibold text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">
                          Shown conditionally
                        </span>
                      ) : null}
                      {question.requirementRules ? (
                        <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                          Required conditionally
                        </span>
                      ) : null}
                      {question.answerMode !== "SINGLE" ? (
                        <span className="rounded-full bg-blue-light-50 px-1.5 py-0.5 text-[11px] font-semibold text-blue-light-700 dark:bg-blue-light-500/15 dark:text-blue-light-300">
                          Repeatable
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase lg:hidden">
                    Field type
                  </p>
                  <p className="text-[13px] font-medium text-gray-700 dark:text-gray-300">
                    {answerTypeLabel(question.answerType)}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {answerModeLabel(question.answerMode, question.maxAnswers)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase lg:hidden">
                    Options
                  </p>
                  <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
                    {answerTypeLoadsOptions(question.answerType)
                      ? "CRM"
                      : answerTypeNeedsOptions(question.answerType)
                        ? "Manual"
                        : "-"}
                  </span>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase lg:hidden">
                    Required
                  </p>
                  {question.required ? (
                    <span className="rounded-full bg-warning-50 px-1.5 py-0.5 text-[11px] font-semibold text-warning-700 dark:bg-warning-500/15 dark:text-warning-300">
                      Required
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">Optional</span>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase lg:hidden">
                    Show when
                  </p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                    {question.visibilityRules
                      ? ruleSummary(
                          firstRuleDraft(question.visibilityRules),
                          template.questions,
                        )
                      : "Always"}
                  </p>
                  {question.requirementRules ? (
                    <p className="truncate text-xs text-amber-600 dark:text-amber-300">
                      Require:{" "}
                      {ruleSummary(
                        firstRuleDraft(question.requirementRules),
                        template.questions,
                      )}
                    </p>
                  ) : null}
                </div>
                <div className="lg:text-right">
                  {questionModeWarning(question) ? (
                    <span className="rounded-full bg-error-50 px-1.5 py-0.5 text-[11px] font-semibold text-error-600 dark:bg-error-500/15 dark:text-error-300">
                      {questionModeWarning(question)}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">-</span>
                  )}
                </div>
              </div>
            ))}
            {!template.questions.length ? (
              <div className="px-3 py-6 text-sm text-gray-500 dark:text-gray-400">
                Add questions to this group to make it appear in lead
                discovery.
              </div>
            ) : null}
          </div>
        </div>
        {groupIssues.length ? (
          <div className="flex flex-col gap-2 rounded-lg border border-warning-100 bg-warning-50 px-3 py-2 text-xs text-warning-800 sm:flex-row sm:items-center sm:justify-between dark:border-warning-500/20 dark:bg-warning-500/10 dark:text-warning-200">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="font-semibold">Issues ({groupIssues.length})</span>
              {groupIssues.slice(0, 3).map((issue) => (
                <span
                  key={issue}
                  className="rounded-full bg-white/80 px-2 py-0.5 font-semibold text-warning-700 ring-1 ring-warning-100 dark:bg-gray-950 dark:text-warning-200 dark:ring-warning-500/20"
                >
                  {issue}
                </span>
              ))}
            </div>
            {groupIssues.length > 3 ? (
              <span className="shrink-0 font-semibold">
                +{groupIssues.length - 3} more
              </span>
            ) : null}
          </div>
        ) : (
          <div className="rounded-lg border border-success-100 bg-success-50 px-3 py-2 text-xs font-semibold text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-200">
            No setup issues detected in this pack.
          </div>
        )}
      </div>
    </article>
  );
}

export default function DiscoveryQuestionSetupView({
  categories,
  products,
  questions,
  stages,
  templates,
}: {
  categories: DiscoveryLinkOption[];
  products: DiscoveryLinkOption[];
  questions: DiscoveryQuestionRow[];
  stages: DiscoveryLinkOption[];
  templates: DiscoveryTemplateRow[];
}) {
  const [query, setQuery] = useState("");
  const [questionScopeFilter, setQuestionScopeFilter] = useState("ALL");
  const [questionTypeFilter, setQuestionTypeFilter] = useState("ALL");
  const [questionStatusFilter, setQuestionStatusFilter] = useState("ALL");
  const [activeTab, setActiveTab] = useState<DiscoveryTab>("groups");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    templates[0]?.id ?? null,
  );
  const filteredQuestions = useMemo(() => {
    const normalizedQuery = query.trim();
    return questions.filter((question) => {
      if (
        questionScopeFilter !== "ALL" &&
        question.scope !== questionScopeFilter
      ) {
        return false;
      }
      if (
        questionTypeFilter !== "ALL" &&
        !answerTypeGroups
          .find((group) => group.label === questionTypeFilter)
          ?.types.includes(question.answerType)
      ) {
        return false;
      }
      if (questionStatusFilter === "REQUIRED" && !question.defaultRequired) {
        return false;
      }
      if (questionStatusFilter === "ISSUES" && !questionWarnings(question).length) {
        return false;
      }
      if (questionStatusFilter === "REPEATABLE" && question.answerMode === "SINGLE") {
        return false;
      }
      if (
        questionStatusFilter === "CRM" &&
        !answerTypeLoadsOptions(question.answerType)
      ) {
        return false;
      }
      if (!normalizedQuery) return true;
      return matchesSearchQuery(normalizedQuery, questionSearchFields(question));
    });
  }, [
    questionScopeFilter,
    questionStatusFilter,
    questionTypeFilter,
    questions,
    query,
  ]);
  const productTemplateCount = templates.filter(
    (template) => template.scope === "PRODUCT",
  ).length;
  const leadTemplateCount = templates.filter(
    (template) => template.scope === "LEAD",
  ).length;
  const requiredQuestions = questions.filter(
    (question) => question.defaultRequired,
  ).length;
  const setupIssueCount =
    questions.flatMap((question) => questionWarnings(question)).length +
    templates.reduce(
      (total, template) => total + templateIssueTotal(template),
      0,
    );
  const repeatableQuestionCount = questions.filter(
    (question) => question.answerMode !== "SINGLE",
  ).length;
  const crmSelectorQuestionCount = questions.filter((question) =>
    answerTypeLoadsOptions(question.answerType),
  ).length;
  const stageLinkedTemplates = templates.filter(
    (template) => template.salesPipelineStageId,
  );
  const conditionalQuestions = templates.flatMap((template) =>
    template.questions
      .filter((question) => question.visibilityRules || question.requirementRules)
      .map((question) => ({ question, template })),
  );
  const selectedTemplate =
    templates.find((template) => template.id === selectedTemplateId) ??
    templates[0] ??
    null;
  const effectiveSelectedTemplateId = selectedTemplate?.id ?? null;
  const tabs: Array<{
    count: number | string;
    label: string;
    value: DiscoveryTab;
  }> = [
    { count: templates.length, label: "Groups", value: "groups" },
    { count: questions.length, label: "Question bank", value: "questions" },
    {
      count: conditionalQuestions.length,
      label: "Logic",
      value: "logic",
    },
    {
      count: stageLinkedTemplates.length,
      label: "Stage gates",
      value: "requirements",
    },
    { count: "View", label: "Lead preview", value: "preview" },
  ];

  return (
    <div className="space-y-2.5">
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 px-3 py-2.5 dark:border-gray-800">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex items-start gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-100 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/20">
                <BrainIcon className="h-3.5 w-3.5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">
                    Discovery setup
                  </h2>
                  <LazyHelpTooltip content="Discovery owns qualification questions, stage requirements and conditional logic. Products only link to discovery groups." />
                </div>
                <p className="mt-0.5 max-w-3xl text-xs text-gray-500 dark:text-gray-400">
                  Configure reusable groups, question banks and stage gates.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1 xl:justify-end">
              {[
                ["Packs", templates.length],
                ["Questions", questions.length],
                ["Lead", leadTemplateCount],
                ["Product", productTemplateCount],
                ["Required", requiredQuestions],
                ["Repeatable", repeatableQuestionCount],
                ["CRM selectors", crmSelectorQuestionCount],
                ["Issues", setupIssueCount],
              ].map(([label, value]) => (
                <span
                  key={label}
                  className={`inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold ring-1 ${
                    label === "Issues" && Number(value) > 0
                      ? "bg-warning-50 text-warning-700 ring-warning-100 dark:bg-warning-500/15 dark:text-warning-300 dark:ring-warning-500/20"
                      : "bg-gray-50 text-gray-600 ring-gray-200 dark:bg-white/[0.04] dark:text-gray-300 dark:ring-gray-800"
                  }`}
                >
                  <span className="text-gray-400 dark:text-gray-500">{label}</span>
                  <span className="text-gray-900 dark:text-white">{value}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex overflow-x-auto rounded-lg bg-gray-100 p-1 dark:bg-white/[0.06]">
            {tabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveTab(tab.value)}
                className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-semibold transition ${
                  activeTab === tab.value
                    ? "bg-white text-gray-900 shadow-theme-xs dark:bg-gray-900 dark:text-white"
                    : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
                }`}
              >
                {tab.label}
                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] leading-none font-semibold text-gray-500 dark:bg-white/[0.08] dark:text-gray-400">
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {activeTab === "groups" ? (
              <TemplateFormModal
                categories={categories}
                products={products}
                questions={questions}
                stages={stages}
                trigger={
                  <Button size="sm" startIcon={<PlusIcon />}>
                    Add group
                  </Button>
                }
              />
            ) : activeTab === "questions" ? (
              <QuestionFormModal
                trigger={
                  <Button size="sm" startIcon={<PlusIcon />}>
                    Add question
                  </Button>
                }
              />
            ) : null}
          </div>
        </div>
      </section>

      {activeTab === "groups" ? (
        <QuestionGroupsWorkspace
          categories={categories}
          onSelectTemplate={setSelectedTemplateId}
          products={products}
          questions={questions}
          selectedTemplate={selectedTemplate}
          selectedTemplateId={effectiveSelectedTemplateId}
          stages={stages}
          templates={templates}
        />
      ) : null}

      {activeTab === "questions" ? (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-2 border-b border-gray-200 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800">
            <div className="flex items-center gap-2">
              <DocsIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              <h2 className="text-[15px] font-semibold text-gray-800 dark:text-white/90">
                Question bank
              </h2>
              <LazyHelpTooltip content="Questions are reusable and can be attached to multiple templates without showing duplicates on the opportunity." />
            </div>
            <div className="relative w-full sm:max-w-[320px]">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search questions..."
                className="h-9 w-full rounded-lg border border-gray-300 bg-transparent py-1.5 pr-3 pl-9 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-3 py-2 dark:border-gray-800">
            <select
              value={questionScopeFilter}
              onChange={(event) => setQuestionScopeFilter(event.target.value)}
              className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-600 outline-none transition focus:border-brand-300 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300"
            >
              <option value="ALL">All scopes</option>
              {questionScopes.map((scope) => (
                <option key={scope} value={scope}>
                  {scope === "OPPORTUNITY" ? "Lead" : titleCase(scope)}
                </option>
              ))}
            </select>
            <select
              value={questionTypeFilter}
              onChange={(event) => setQuestionTypeFilter(event.target.value)}
              className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-600 outline-none transition focus:border-brand-300 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300"
            >
              <option value="ALL">All field types</option>
              {answerTypeGroups.map((group) => (
                <option key={group.label} value={group.label}>
                  {group.label}
                </option>
              ))}
            </select>
            <select
              value={questionStatusFilter}
              onChange={(event) => setQuestionStatusFilter(event.target.value)}
              className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-600 outline-none transition focus:border-brand-300 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300"
            >
              <option value="ALL">All statuses</option>
              <option value="REQUIRED">Required</option>
              <option value="ISSUES">Issues</option>
              <option value="REPEATABLE">Repeatable</option>
              <option value="CRM">CRM selectors</option>
            </select>
            <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
              {filteredQuestions.length}/{questions.length} shown
            </span>
          </div>

          <div className="grid gap-2 border-b border-gray-100 px-3 py-2 sm:grid-cols-2 xl:grid-cols-4 dark:border-gray-800">
            <GroupMetric label="Filtered" value={filteredQuestions.length} />
            <GroupMetric
              label="Required"
              value={filteredQuestions.filter((question) => question.defaultRequired).length}
            />
            <GroupMetric
              label="Repeatable"
              value={filteredQuestions.filter((question) => question.answerMode !== "SINGLE").length}
            />
            <GroupMetric
              label="Issues"
              value={filteredQuestions.flatMap((question) => questionWarnings(question)).length}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-white/[0.02]">
                <tr className="text-left">
                  {["Question", "Field", "Options", "Default", "Usage", "Issues"].map(
                    (heading) => (
                      <th
                        key={heading}
                        className="px-3 py-1.5 text-xs font-medium text-gray-500 uppercase dark:text-gray-400"
                      >
                        {heading}
                      </th>
                    ),
                  )}
                  <th className="px-3 py-1.5 text-right text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredQuestions.map((question) => (
                  <tr
                    key={question.id}
                    className="transition hover:bg-gray-50/70 dark:hover:bg-white/[0.03]"
                  >
                    <td className="px-3 py-2">
                      <div className="min-w-[320px]">
                        <p className="text-[13px] font-semibold text-gray-800 dark:text-white/90">
                          {question.label}
                        </p>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          <ScopePill scope={question.scope} />
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {question.dedupeKey ?? question.slug}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <p className="text-[13px] font-medium text-gray-700 dark:text-gray-300">
                        {answerTypeLabel(question.answerType)}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {answerModeLabel(question.answerMode, question.maxAnswers)}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                          questionOptionSummary(question) === "Missing"
                            ? "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-300"
                            : "bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400"
                        }`}
                      >
                        {questionOptionSummary(question)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {question.defaultRequired ? (
                        <span className="rounded-full bg-warning-50 px-1.5 py-0.5 text-[11px] font-semibold text-warning-700 dark:bg-warning-500/15 dark:text-warning-300">
                          Required
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Optional</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex max-w-[260px] flex-wrap gap-1">
                        {question.templateNames.slice(0, 3).map((template) => (
                          <span
                            key={template}
                            className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
                          >
                            {template}
                          </span>
                        ))}
                        {question.templateNames.length > 3 ? (
                          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
                            +{question.templateNames.length - 3}
                          </span>
                        ) : null}
                        {!question.templateNames.length ? (
                          <span className="text-xs text-gray-400">Unused</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {questionWarnings(question).map((warning) => (
                          <span
                            key={warning}
                            className="rounded-full bg-error-50 px-1.5 py-0.5 text-[10px] font-semibold text-error-600 dark:bg-error-500/15 dark:text-error-300"
                          >
                            {warning}
                          </span>
                        ))}
                        {!questionWarnings(question).length ? (
                          <span className="text-xs text-gray-400">-</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end">
                        <QuestionFormModal
                          question={question}
                          trigger={
                            <button
                              type="button"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
                              aria-label={`Edit ${question.label}`}
                            >
                              <EditIcon className="h-3.5 w-3.5" />
                            </button>
                          }
                        />
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredQuestions.length ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                    >
                      No questions match the selected filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeTab === "logic" ? (
        <LogicRulesPanel
          conditionalQuestions={conditionalQuestions}
          templates={templates}
        />
      ) : null}

      {activeTab === "requirements" ? (
        <StageRequirementsPanel
          stages={stages}
          templates={templates}
        />
      ) : null}

      {activeTab === "preview" ? (
        <LeadPreviewPanel
          categories={categories}
          products={products}
          templates={templates}
        />
      ) : null}
    </div>
  );
}

function LogicRulesPanel({
  conditionalQuestions,
  templates,
}: {
  conditionalQuestions: Array<{
    question: DiscoveryTemplateRow["questions"][number];
    template: DiscoveryTemplateRow;
  }>;
  templates: DiscoveryTemplateRow[];
}) {
  const [query, setQuery] = useState("");
  const [ruleFilter, setRuleFilter] = useState<"ALL" | "SHOW" | "REQUIRE">(
    "ALL",
  );
  const productTemplates = templates.filter((template) => template.scope === "PRODUCT");
  const filteredRules = conditionalQuestions.filter(({ question, template }) => {
    if (ruleFilter === "SHOW" && !question.visibilityRules) return false;
    if (ruleFilter === "REQUIRE" && !question.requirementRules) return false;
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;
    return [template.name, question.label, question.scope]
      .filter(Boolean)
      .some((field) => field.toLowerCase().includes(normalizedQuery));
  });
  const showRuleCount = conditionalQuestions.filter(
    ({ question }) => question.visibilityRules,
  ).length;
  const requireRuleCount = conditionalQuestions.filter(
    ({ question }) => question.requirementRules,
  ).length;

  return (
    <section className="space-y-2">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-2 border-b border-gray-200 px-3 py-2.5 lg:flex-row lg:items-center lg:justify-between dark:border-gray-800">
          <div>
            <div className="flex items-center gap-2">
              <FlashIcon className="h-4 w-4 text-brand-500" />
              <h2 className="text-[15px] font-semibold text-gray-800 dark:text-white/90">
                Conditional logic
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Review show and required rules across every pack.
            </p>
          </div>
          <div className="relative w-full lg:max-w-[320px]">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search logic..."
              className="h-9 w-full rounded-lg border border-gray-300 bg-transparent py-1.5 pr-3 pl-9 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-3 py-2 dark:border-gray-800">
          {[
            ["ALL", "All", conditionalQuestions.length],
            ["SHOW", "Show rules", showRuleCount],
            ["REQUIRE", "Required rules", requireRuleCount],
          ].map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              onClick={() => setRuleFilter(value as "ALL" | "SHOW" | "REQUIRE")}
              className={`h-8 rounded-lg px-2 text-xs font-semibold transition ${
                ruleFilter === value
                  ? "bg-brand-50 text-brand-700 ring-1 ring-brand-100 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/20"
                  : "bg-gray-50 text-gray-500 ring-1 ring-gray-200 hover:text-gray-800 dark:bg-white/[0.04] dark:text-gray-400 dark:ring-gray-800 dark:hover:text-white"
              }`}
            >
              {label} <span className="opacity-70">{count}</span>
            </button>
          ))}
          <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
            {filteredRules.length}/{conditionalQuestions.length} shown
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-white/[0.02]">
              <tr className="text-left">
                {["Pack", "Question", "Show when", "Required when", "Scope"].map(
                  (heading) => (
                    <th
                      key={heading}
                      className="px-3 py-1.5 text-xs font-medium text-gray-500 uppercase dark:text-gray-400"
                    >
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filteredRules.map(({ question, template }) => (
                <tr
                  key={`${template.id}-${question.id}`}
                  className="transition hover:bg-gray-50/70 dark:hover:bg-white/[0.03]"
                >
                  <td className="px-3 py-2">
                    <p className="text-[13px] font-semibold text-gray-800 dark:text-white/90">
                      {template.name}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {groupAppliesTo(template).join(", ") || "Every lead"}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    <p className="text-[13px] text-gray-700 dark:text-gray-300">
                      {question.label}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    {question.visibilityRules ? (
                      <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">
                        {ruleSummary(firstRuleDraft(question.visibilityRules), template.questions)}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Always</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {question.requirementRules ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                        {ruleSummary(firstRuleDraft(question.requirementRules), template.questions)}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Default only</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <ScopePill scope={question.scope} />
                  </td>
                </tr>
              ))}
              {!filteredRules.length ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                  >
                    No logic rules match this view.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 px-3 py-2 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
            Product-driven packs
          </h3>
        </div>
        <div className="grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-3">
          {productTemplates.map((template) => (
            <div
              key={template.id}
              className="rounded-lg border border-gray-100 bg-gray-50 p-2 dark:border-gray-800 dark:bg-white/[0.02]"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-[13px] font-semibold text-gray-800 dark:text-white/90">
                  {template.name}
                </p>
                <span className="rounded-full bg-white px-1.5 py-0.5 text-[11px] font-semibold text-gray-500 ring-1 ring-gray-200 dark:bg-gray-950 dark:ring-gray-800">
                  {template.questions.length}
                </span>
              </div>
              <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                {template.productNames.length
                  ? template.productNames.join(", ")
                  : "No product attached yet"}
              </p>
            </div>
          ))}
          {!productTemplates.length ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Add a product-scoped group to make product selection drive discovery.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function StageRequirementsPanel({
  stages,
  templates,
}: {
  stages: DiscoveryLinkOption[];
  templates: DiscoveryTemplateRow[];
}) {
  const templatesByStage = stages.map((stage) => ({
    ...stage,
    templates: templates.filter(
      (template) => template.salesPipelineStageId === stage.id,
    ),
  }));
  const gatedStageCount = templatesByStage.filter(
    (stage) => stage.templates.length,
  ).length;
  const requiredGateQuestionCount = templatesByStage.reduce(
    (total, stage) =>
      total +
      stage.templates.reduce(
        (stageTotal, template) =>
          stageTotal +
          template.questions.filter((question) => question.required).length,
        0,
      ),
    0,
  );

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-2 border-b border-gray-200 px-3 py-2.5 lg:flex-row lg:items-center lg:justify-between dark:border-gray-800">
        <div>
          <div className="flex items-center gap-2">
            <CheckCircleIcon className="h-4 w-4 text-success-600 dark:text-success-400" />
            <h2 className="text-[15px] font-semibold text-gray-800 dark:text-white/90">
              Stage requirements
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Pipeline stages with Discovery gates and required answers.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <GroupMetric label="Stages" value={stages.length} />
          <GroupMetric label="Gated" value={gatedStageCount} />
          <GroupMetric label="Required" value={requiredGateQuestionCount} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-white/[0.02]">
            <tr className="text-left">
              {["Stage", "Gate packs", "Required", "Logic", "Status"].map(
                (heading) => (
                  <th
                    key={heading}
                    className="px-3 py-1.5 text-xs font-medium text-gray-500 uppercase dark:text-gray-400"
                  >
                    {heading}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {templatesByStage.map((stage) => {
              const stageRequiredCount = stage.templates.reduce(
                (total, template) =>
                  total +
                  template.questions.filter((question) => question.required).length,
                0,
              );
              const stageRuleCount = stage.templates.reduce(
                (total, template) => total + templateRuleTotal(template),
                0,
              );

              return (
                <tr
                  key={stage.id}
                  className="transition hover:bg-gray-50/70 dark:hover:bg-white/[0.03]"
                >
                  <td className="px-3 py-2">
                    <p className="text-[13px] font-semibold text-gray-800 dark:text-white/90">
                      {stage.name}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex max-w-[520px] flex-wrap gap-1">
                      {stage.templates.map((template) => (
                        <span
                          key={template.id}
                          className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
                        >
                          {template.name}
                        </span>
                      ))}
                      {!stage.templates.length ? (
                        <span className="text-xs text-gray-400">No gate</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                        stageRequiredCount
                          ? "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-300"
                          : "bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400"
                      }`}
                    >
                      {stageRequiredCount} required
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-purple-50 px-1.5 py-0.5 text-[11px] font-semibold text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">
                      {stageRuleCount} rules
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {stage.templates.length ? (
                      <span className="rounded-full bg-success-50 px-1.5 py-0.5 text-[11px] font-semibold text-success-700 dark:bg-success-500/15 dark:text-success-300">
                        Gated
                      </span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
                        Open
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LeadPreviewPanel({
  categories,
  products,
  templates,
}: {
  categories: DiscoveryLinkOption[];
  products: DiscoveryLinkOption[];
  templates: DiscoveryTemplateRow[];
}) {
  const initialProductIds = products.slice(0, 3).map((product) => product.id);
  const [selectedProductIds, setSelectedProductIds] =
    useState<string[]>(initialProductIds);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const selectedProductIdSet = new Set(selectedProductIds);
  const selectedCategoryIdSet = new Set(selectedCategoryIds);
  const selectedProducts = products.filter((product) =>
    selectedProductIdSet.has(product.id),
  );
  const selectedCategories = categories.filter((category) =>
    selectedCategoryIdSet.has(category.id),
  );
  const activeTemplates = templates.filter((template) => {
    if (template.scope === "LEAD") return true;
    if (
      template.productIds.some((productId) =>
        selectedProductIdSet.has(productId),
      )
    ) {
      return true;
    }
    if (
      template.categoryIds.some((categoryId) =>
        selectedCategoryIdSet.has(categoryId),
      )
    ) {
      return true;
    }
    return false;
  });
  const previewQuestions = activeTemplates.flatMap((template) =>
    template.questions.slice(0, 4).map((question) => ({
      ...question,
      templateName: template.name,
    })),
  );
  const visibleQuestionCount = activeTemplates.reduce(
    (total, template) => total + template.questions.length,
    0,
  );

  function toggleSelection(
    id: string,
    selectedIds: string[],
    setSelectedIds: (ids: string[]) => void,
  ) {
    setSelectedIds(
      selectedIds.includes(id)
        ? selectedIds.filter((selectedId) => selectedId !== id)
        : [...selectedIds, id],
    );
  }

  return (
    <section className="grid gap-2 xl:grid-cols-[330px_minmax(0,1fr)]">
      <aside className="rounded-xl border border-gray-200 bg-white p-3 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <ClockIcon className="h-4 w-4 text-brand-500" />
            <h2 className="text-[15px] font-semibold text-gray-800 dark:text-white/90">
              Preview context
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedProductIds(initialProductIds);
              setSelectedCategoryIds([]);
            }}
            className="h-7 rounded-lg border border-gray-200 px-2 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.04]"
          >
            Reset
          </button>
        </div>
        <p className="mt-0.5 text-xs leading-5 text-gray-500 dark:text-gray-400">
          Select products or categories to test which packs appear on a lead.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <GroupMetric label="Packs" value={activeTemplates.length} />
          <GroupMetric label="Fields" value={visibleQuestionCount} />
          <GroupMetric label="Selected" value={selectedProductIds.length + selectedCategoryIds.length} />
        </div>

        <PreviewChecklist
          items={products}
          onToggle={(id) =>
            toggleSelection(id, selectedProductIds, setSelectedProductIds)
          }
          selectedIds={selectedProductIdSet}
          title="Products"
        />
        <PreviewChecklist
          items={categories}
          onToggle={(id) =>
            toggleSelection(id, selectedCategoryIds, setSelectedCategoryIds)
          }
          selectedIds={selectedCategoryIdSet}
          title="Categories"
        />

        <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-2 dark:border-gray-800 dark:bg-white/[0.02]">
          <p className="text-[10px] font-semibold text-gray-500 uppercase dark:text-gray-400">
            Active context
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {[...selectedProducts, ...selectedCategories].map((item) => (
              <span
                key={item.id}
                className="rounded-full bg-white px-1.5 py-0.5 text-[11px] font-semibold text-gray-600 ring-1 ring-gray-200 dark:bg-gray-950 dark:text-gray-300 dark:ring-gray-800"
              >
                {item.name}
              </span>
            ))}
            {!selectedProducts.length && !selectedCategories.length ? (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Lead-level packs only.
              </span>
            ) : null}
          </div>
        </div>
      </aside>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 px-3 py-2.5 dark:border-gray-800">
          <h2 className="text-[15px] font-semibold text-gray-800 dark:text-white/90">
            Questions shown to sales
          </h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Lead packs first, then selected product and category packs.
          </p>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {previewQuestions.map((question) => (
            <div
              key={`${question.templateName}-${question.id}`}
              className="grid gap-2 px-3 py-2.5 md:grid-cols-[minmax(0,1fr)_150px_90px]"
            >
              <div>
                <p className="text-[13px] font-semibold text-gray-800 dark:text-white/90">
                  {question.label}
                </p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {question.templateName}
                </p>
              </div>
              <p className="text-[13px] text-gray-600 dark:text-gray-400">
                {answerTypeLabel(question.answerType)} ·{" "}
                {answerModeLabel(question.answerMode, question.maxAnswers)}
              </p>
              <div className="md:text-right">
                {question.required ? (
                  <span className="rounded-full bg-warning-50 px-1.5 py-0.5 text-[11px] font-semibold text-warning-700 dark:bg-warning-500/15 dark:text-warning-300">
                    Required
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">Optional</span>
                )}
              </div>
            </div>
          ))}
          {!previewQuestions.length ? (
            <div className="px-5 py-8 text-sm text-gray-500 dark:text-gray-400">
              No active lead or product questions are available for this
              preview yet.
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function PreviewChecklist({
  items,
  onToggle,
  selectedIds,
  title,
}: {
  items: DiscoveryLinkOption[];
  onToggle: (id: string) => void;
  selectedIds: Set<string>;
  title: string;
}) {
  const [query, setQuery] = useState("");
  const visibleItems = items.filter((item) =>
    item.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="mt-3 rounded-lg border border-gray-200 p-2 dark:border-gray-800">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-gray-800 dark:text-white/90">
          {title}
        </p>
        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
          {selectedIds.size}/{items.length}
        </span>
      </div>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={`Search ${title.toLowerCase()}...`}
        className="mt-2 h-8 w-full rounded-lg border border-gray-200 bg-gray-50 px-2 text-xs text-gray-800 outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-950 dark:text-white/90"
      />
      <div className="mt-2 max-h-36 space-y-1 overflow-y-auto pr-1">
        {visibleItems.map((item) => (
          <label
            key={item.id}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-gray-700 transition hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.04]"
          >
            <input
              type="checkbox"
              checked={selectedIds.has(item.id)}
              onChange={() => onToggle(item.id)}
              className={checkboxClassName}
            />
            <span className="min-w-0 truncate">{item.name}</span>
          </label>
        ))}
        {!visibleItems.length ? (
          <p className="px-2 py-2 text-xs text-gray-500 dark:text-gray-400">
            No matches.
          </p>
        ) : null}
      </div>
    </div>
  );
}
function FormTrigger({
  onOpen,
  trigger,
}: {
  onOpen: () => void;
  trigger: ReactNode;
}) {
  return <span onClick={onOpen}>{trigger}</span>;
}

function QuestionFormModal({
  question,
  trigger,
}: {
  question?: DiscoveryQuestionRow;
  trigger: ReactNode;
}) {
  const modal = useModal();
  const { showToast } = useToast();
  const [isDirty, setIsDirty] = useState(false);
  const [selectedAnswerType, setSelectedAnswerType] = useState(
    question?.answerType ?? "TEXT",
  );
  const [selectedAnswerMode, setSelectedAnswerMode] = useState(
    question?.answerMode ?? "SINGLE",
  );
  const [selectedMaxAnswers, setSelectedMaxAnswers] = useState(
    question?.maxAnswers ? String(question.maxAnswers) : "",
  );
  const [state, formAction, isPending] = useActionState(
    saveDiscoveryQuestionAction,
    {
      ok: false,
      message: "",
    },
  );

  useEffect(() => {
    if (!state.ok) return;
    showToast(state.message || "Question saved.");
    queueMicrotask(() => {
      setIsDirty(false);
      modal.closeModal();
    });
  }, [modal, showToast, state.message, state.ok]);

  return (
    <>
      <FormTrigger onOpen={modal.openModal} trigger={trigger} />
      <Modal
        isOpen={modal.isOpen}
        onClose={modal.closeModal}
        className="relative m-4 w-full max-w-[700px] rounded-2xl bg-white p-4 sm:m-0 lg:p-5 dark:bg-gray-900"
      >
        <div className="pr-10">
          <h2 className="mb-1 text-base font-semibold text-gray-800 dark:text-white/90">
            {question ? "Edit question" : "Add question"}
          </h2>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            Create a reusable discovery prompt that can be attached to
            templates.
          </p>
        </div>

        <form
          action={formAction}
          onChangeCapture={() => setIsDirty(true)}
          className="space-y-3"
        >
          {question ? (
            <input type="hidden" name="id" value={question.id} />
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block md:col-span-2">
              <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Question label
              </span>
              <input
                name="label"
                required
                defaultValue={question?.label ?? ""}
                className={inputClassName}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Slug
              </span>
              <input
                name="slug"
                defaultValue={question?.slug ?? ""}
                placeholder="auto-generated"
                className={inputClassName}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Dedupe key
              </span>
              <input
                name="dedupeKey"
                defaultValue={question?.dedupeKey ?? ""}
                placeholder="budget, timeline"
                className={inputClassName}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Scope
              </span>
              <select
                name="scope"
                defaultValue={question?.scope ?? "OPPORTUNITY"}
                className={inputClassName}
              >
                {questionScopes.map((scope) => (
                  <option key={scope} value={scope}>
                    {scope === "OPPORTUNITY" ? "Lead" : titleCase(scope)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Answer type
              </span>
              <select
                name="answerType"
                value={selectedAnswerType}
                onChange={(event) => setSelectedAnswerType(event.target.value)}
                className={inputClassName}
              >
                {answerTypeGroups.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.types.map((type) => (
                      <option key={type} value={type}>
                        {answerTypeLabel(type)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="mt-1 text-[11px] leading-4 text-gray-500 dark:text-gray-400">
                {answerTypeHint(selectedAnswerType)}
              </p>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Answer mode
              </span>
              <select
                name="answerMode"
                value={selectedAnswerMode}
                onChange={(event) => setSelectedAnswerMode(event.target.value)}
                className={inputClassName}
              >
                {answerModes.map((mode) => (
                  <option key={mode} value={mode}>
                    {answerModeLabel(mode)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Max answers
              </span>
              <input
                name="maxAnswers"
                type="number"
                min="2"
                max="50"
                value={selectedMaxAnswers}
                onChange={(event) => setSelectedMaxAnswers(event.target.value)}
                placeholder="Only for capped multiple"
                className={inputClassName}
              />
            </label>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5 md:col-span-2 dark:border-gray-800 dark:bg-white/[0.03]">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-700 ring-1 ring-gray-200 dark:bg-gray-950 dark:text-gray-300 dark:ring-gray-800">
                  {answerTypeLabel(selectedAnswerType)}
                </span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-700 ring-1 ring-gray-200 dark:bg-gray-950 dark:text-gray-300 dark:ring-gray-800">
                  {answerModeLabel(
                    selectedAnswerMode,
                    selectedMaxAnswers ? Number(selectedMaxAnswers) : null,
                  )}
                </span>
                {answerTypeNeedsOptions(selectedAnswerType) ? (
                  <span className="rounded-full bg-warning-50 px-2 py-0.5 text-[11px] font-semibold text-warning-700 dark:bg-warning-500/15 dark:text-warning-300">
                    Options required
                  </span>
                ) : null}
                {answerTypeLoadsOptions(selectedAnswerType) ? (
                  <span className="rounded-full bg-success-50 px-2 py-0.5 text-[11px] font-semibold text-success-700 dark:bg-success-500/15 dark:text-success-300">
                    Uses CRM data
                  </span>
                ) : null}
              </div>
              <p className="mt-1.5 text-xs leading-5 text-gray-500 dark:text-gray-400">
                {answerModeHint(
                  selectedAnswerMode,
                  selectedMaxAnswers ? Number(selectedMaxAnswers) : null,
                )}
              </p>
            </div>

            <label className="block md:col-span-2">
              <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Help text
              </span>
              <textarea
                name="helpText"
                defaultValue={question?.helpText ?? ""}
                className={textareaClassName}
              />
            </label>

            <label className="block md:col-span-2">
              <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Options
              </span>
              <textarea
                name="optionsText"
                defaultValue={question?.optionsText ?? ""}
                placeholder={answerTypeSampleOptions(selectedAnswerType)}
                className={textareaClassName}
              />
              <p className="mt-1 text-[11px] leading-4 text-gray-500 dark:text-gray-400">
                {answerTypeLoadsOptions(selectedAnswerType)
                  ? "This field loads live CRM product or category options automatically."
                  : answerTypeNeedsOptions(selectedAnswerType)
                    ? "One option per line. These are shown exactly as choices on the lead."
                    : "Only dropdown, multi-select and currency range fields need options."}
              </p>
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                name="defaultRequired"
                defaultChecked={question?.defaultRequired ?? false}
                className={checkboxClassName}
              />
              Required by default
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={question?.isActive ?? true}
                className={checkboxClassName}
              />
              Active
            </label>
          </div>

          <ActionStateMessage state={state.ok ? undefined : state} />
          <ModalActions
            isDirty={isDirty}
            isPending={isPending}
            onCancel={modal.closeModal}
            submitLabel={question ? "Save question" : "Add question"}
          />
        </form>
      </Modal>
    </>
  );
}

function TemplateFormModal({
  categories,
  products,
  questions,
  stages,
  template,
  trigger,
}: {
  categories: DiscoveryLinkOption[];
  products: DiscoveryLinkOption[];
  questions: DiscoveryQuestionRow[];
  stages: DiscoveryLinkOption[];
  template?: DiscoveryTemplateRow;
  trigger: ReactNode;
}) {
  const modal = useModal();
  const { showToast } = useToast();
  const [isDirty, setIsDirty] = useState(false);
  const [selectedQuestions, setSelectedQuestions] = useState<
    TemplateQuestionSelection[]
  >(
    () =>
      template?.questions.map((question) => ({
        id: question.id,
        requirementRule: firstRuleDraft(question.requirementRules),
        required: question.required,
        visibilityRule: firstRuleDraft(question.visibilityRules),
      })) ?? [],
  );
  const [state, formAction, isPending] = useActionState(
    saveDiscoveryTemplateAction,
    {
      ok: false,
      message: "",
    },
  );

  useEffect(() => {
    if (!state.ok) return;
    showToast(state.message || "Template saved.");
    queueMicrotask(() => {
      setIsDirty(false);
      modal.closeModal();
    });
  }, [modal, showToast, state.message, state.ok]);

  return (
    <>
      <FormTrigger onOpen={modal.openModal} trigger={trigger} />
      <Modal
        isOpen={modal.isOpen}
        onClose={modal.closeModal}
        showCloseButton={false}
        className="relative m-2 flex h-[calc(100vh-24px)] w-[calc(100vw-24px)] max-w-[1560px] overflow-hidden rounded-2xl bg-white p-0 dark:bg-gray-900"
      >
        <form
          action={formAction}
          onChangeCapture={() => setIsDirty(true)}
          className="flex h-full min-h-0 flex-col"
        >
          {template ? (
            <input type="hidden" name="id" value={template.id} />
          ) : null}
          {selectedQuestions.map((question) => (
            <input
              key={question.id}
              type="hidden"
              name="questionIds"
              value={question.id}
            />
          ))}
          {selectedQuestions
            .filter((question) => question.required)
            .map((question) => (
              <input
                key={question.id}
                type="hidden"
                name="requiredQuestionIds"
                value={question.id}
              />
            ))}
          {selectedQuestions.map((question) => (
            <div key={`${question.id}:rules`} className="hidden">
              {question.visibilityRule?.questionId ? (
                <>
                  <input
                    type="hidden"
                    name={`visibilityRule:${question.id}:questionId`}
                    value={question.visibilityRule.questionId}
                  />
                  <input
                    type="hidden"
                    name={`visibilityRule:${question.id}:operator`}
                    value={question.visibilityRule.operator}
                  />
                  <input
                    type="hidden"
                    name={`visibilityRule:${question.id}:value`}
                    value={question.visibilityRule.value}
                  />
                </>
              ) : null}
              {question.requirementRule?.questionId ? (
                <>
                  <input
                    type="hidden"
                    name={`requirementRule:${question.id}:questionId`}
                    value={question.requirementRule.questionId}
                  />
                  <input
                    type="hidden"
                    name={`requirementRule:${question.id}:operator`}
                    value={question.requirementRule.operator}
                  />
                  <input
                    type="hidden"
                    name={`requirementRule:${question.id}:value`}
                    value={question.requirementRule.value}
                  />
                </>
              ) : null}
            </div>
          ))}

          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-3 py-2.5 sm:px-4 dark:border-gray-800">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-gray-800 dark:text-white/90">
                {template ? "Edit question group" : "Add question group"}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Set scope, sequence and required answers.
              </p>
            </div>
            <button
              type="button"
              onClick={modal.closeModal}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-200 hover:text-gray-800 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
              aria-label="Close question group editor"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="grid min-h-0 flex-1 overflow-y-auto xl:grid-cols-[300px_minmax(0,1fr)] xl:overflow-hidden">
            <section className="space-y-2.5 border-b border-gray-200 bg-gray-50/60 p-3 xl:overflow-y-auto xl:border-r xl:border-b-0 dark:border-gray-800 dark:bg-white/[0.02]">
              <div>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                  Group setup
                </h3>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                  Group name
                </span>
                <input
                  name="name"
                  required
                  defaultValue={template?.name ?? ""}
                  className={inputClassName}
                />
              </label>

              <div className="grid gap-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                    Slug
                  </span>
                  <input
                    name="slug"
                    defaultValue={template?.slug ?? ""}
                    placeholder="auto-generated"
                    className={inputClassName}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                    Scope
                  </span>
                  <select
                    name="scope"
                    defaultValue={template?.scope ?? "LEAD"}
                    className={inputClassName}
                  >
                    {templateScopes.map((scope) => (
                      <option key={scope} value={scope}>
                        {titleCase(scope)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                  Pipeline stage
                </span>
                <select
                  name="salesPipelineStageId"
                  defaultValue={template?.salesPipelineStageId ?? ""}
                  className={inputClassName}
                >
                  <option value="">Any stage</option>
                  {stages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                  Description
                </span>
                <textarea
                  name="description"
                  defaultValue={template?.description ?? ""}
                  className={textareaClassName}
                />
              </label>

              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  name="isActive"
                  defaultChecked={template?.isActive ?? true}
                  className={checkboxClassName}
                />
                Active group
              </label>

              <div className="grid gap-2">
                <Checklist
                  emptyText="Add products first."
                  items={products.map((product) => ({
                    id: product.id,
                    label: product.name,
                  }))}
                  name="productIds"
                  selectedIds={new Set(template?.productIds ?? [])}
                  title="Products"
                />
                <Checklist
                  emptyText="Add categories from the Products page first."
                  items={categories.map((category) => ({
                    id: category.id,
                    label: category.name,
                  }))}
                  name="categoryIds"
                  selectedIds={new Set(template?.categoryIds ?? [])}
                  title="Categories"
                />
              </div>
            </section>

            <div className="min-h-[620px] p-3 xl:min-h-0 xl:overflow-hidden">
              <QuestionSelectionBuilder
                questions={questions}
                selectedQuestions={selectedQuestions}
                onChange={(nextQuestions) => {
                  setSelectedQuestions(nextQuestions);
                  setIsDirty(true);
                }}
              />
            </div>
          </div>

          <div className="shrink-0 border-t border-gray-100 bg-white/95 px-3 py-2.5 backdrop-blur sm:px-4 dark:border-gray-800 dark:bg-gray-900/95">
            <ActionStateMessage state={state.ok ? undefined : state} />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={modal.closeModal}
                className="inline-flex h-8 items-center justify-center rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.05]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || !isDirty}
                className="inline-flex h-8 items-center justify-center rounded-lg bg-brand-500 px-3 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "Saving..." : template ? "Save group" : "Add group"}
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}

function QuestionSelectionBuilder({
  onChange,
  questions,
  selectedQuestions,
}: {
  onChange: (questions: TemplateQuestionSelection[]) => void;
  questions: DiscoveryQuestionRow[];
  selectedQuestions: TemplateQuestionSelection[];
}) {
  const [query, setQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState("ALL");
  const questionById = useMemo(
    () => new Map(questions.map((question) => [question.id, question])),
    [questions],
  );
  const selectedIdSet = useMemo(
    () => new Set(selectedQuestions.map((question) => question.id)),
    [selectedQuestions],
  );
  const selectedQuestionRows = selectedQuestions
    .map((selection) => {
      const question = questionById.get(selection.id);
      return question ? { question, required: selection.required } : null;
    })
    .filter(
      (selection): selection is { question: DiscoveryQuestionRow; required: boolean } =>
        Boolean(selection),
    );
  const visibleQuestions = useMemo(() => {
    const normalizedQuery = query.trim();
    return questions.filter((question) => {
      if (scopeFilter !== "ALL" && question.scope !== scopeFilter) {
        return false;
      }

      if (!normalizedQuery) return true;

      return matchesSearchQuery(normalizedQuery, questionSearchFields(question));
    });
  }, [questions, query, scopeFilter]);
  const requiredCount = selectedQuestions.filter(
    (question) => question.required,
  ).length;

  function addQuestion(question: DiscoveryQuestionRow) {
    if (selectedIdSet.has(question.id)) return;
    onChange([
      ...selectedQuestions,
      { id: question.id, required: question.defaultRequired },
    ]);
  }

  function removeQuestion(questionId: string) {
    onChange(
      selectedQuestions.filter((selection) => selection.id !== questionId),
    );
  }

  function toggleRequired(questionId: string, required: boolean) {
    onChange(
      selectedQuestions.map((selection) =>
        selection.id === questionId ? { ...selection, required } : selection,
      ),
    );
  }

  function updateRule(
    questionId: string,
    ruleType: "requirementRule" | "visibilityRule",
    rule: DiscoveryRuleDraft | undefined,
  ) {
    onChange(
      selectedQuestions.map((selection) =>
        selection.id === questionId
          ? { ...selection, [ruleType]: rule }
          : selection,
      ),
    );
  }

  function moveQuestion(questionId: string, direction: -1 | 1) {
    const index = selectedQuestions.findIndex(
      (selection) => selection.id === questionId,
    );
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= selectedQuestions.length) {
      return;
    }

    const nextQuestions = [...selectedQuestions];
    const [question] = nextQuestions.splice(index, 1);
    nextQuestions.splice(nextIndex, 0, question);
    onChange(nextQuestions);
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.02]">
      <div className="shrink-0 border-b border-gray-200 px-3 py-2 dark:border-gray-800">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
              Question decisions
            </h3>
          </div>
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <QuestionDecisionMetric label="Selected" value={selectedQuestions.length} />
            <QuestionDecisionMetric label="Required" value={requiredCount} tone="warning" />
            <QuestionDecisionMetric
              label="Optional"
              value={selectedQuestions.length - requiredCount}
            />
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-h-0 flex-col border-b border-gray-200 p-2.5 lg:border-r lg:border-b-0 dark:border-gray-800">
          <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
                Selected sequence
              </p>
            </div>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
              {selectedQuestions.length} steps
            </span>
          </div>

          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            {selectedQuestionRows.map(({ question, required }, index) => {
              const selection = selectedQuestions.find(
                (item) => item.id === question.id,
              );

              return (
              <SelectedQuestionBuilderRow
                key={question.id}
                index={index}
                isFirst={index === 0}
                isLast={index === selectedQuestionRows.length - 1}
                questions={questions}
                question={question}
                requirementRule={selection?.requirementRule}
                required={required}
                visibilityRule={selection?.visibilityRule}
                onMove={moveQuestion}
                onRemove={removeQuestion}
                onRuleChange={updateRule}
                onToggleRequired={toggleRequired}
              />
              );
            })}
            {!selectedQuestionRows.length ? (
              <div className="rounded-lg border border-dashed border-gray-200 p-3 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                Add questions from the bank.
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex min-h-0 flex-col p-2.5">
          <div className="mb-2 flex shrink-0 flex-col gap-2">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search question bank..."
                className="h-9 w-full rounded-lg border border-gray-300 bg-transparent py-1.5 pr-3 pl-9 text-sm text-gray-800 outline-none transition focus:border-brand-500 dark:border-gray-700 dark:text-white/90"
              />
            </div>
            <div className="flex gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1 dark:bg-white/[0.06]">
              {["ALL", ...questionScopes].map((scope) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => setScopeFilter(scope)}
                  className={`h-7 shrink-0 rounded-md px-2 text-xs font-semibold transition ${
                    scopeFilter === scope
                      ? "bg-white text-gray-900 shadow-theme-xs dark:bg-gray-900 dark:text-white"
                      : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
                  }`}
                >
                  {scope === "ALL"
                    ? "All"
                    : scope === "OPPORTUNITY"
                      ? "Lead"
                      : titleCase(scope)}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            {visibleQuestions.map((question) => (
              <QuestionBankBuilderItem
                key={question.id}
                isSelected={selectedIdSet.has(question.id)}
                question={question}
                onAdd={addQuestion}
              />
            ))}
            {!visibleQuestions.length ? (
              <div className="rounded-lg border border-dashed border-gray-200 p-3 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                No questions match this filter.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function QuestionDecisionMetric({
  label,
  tone = "default",
  value,
}: {
  label: string;
  tone?: "default" | "warning";
  value: number;
}) {
  return (
    <div
      className={`min-w-14 rounded-lg px-2 py-1 ring-1 ${
        tone === "warning"
          ? "bg-warning-50 text-warning-700 ring-warning-100 dark:bg-warning-500/15 dark:text-warning-300 dark:ring-warning-500/20"
          : "bg-gray-50 text-gray-700 ring-gray-200 dark:bg-white/[0.04] dark:text-gray-300 dark:ring-gray-800"
      }`}
    >
      <p className="text-[13px] font-semibold leading-4">{value}</p>
      <p className="text-[9px] font-semibold uppercase opacity-70">{label}</p>
    </div>
  );
}

function SelectedQuestionBuilderRow({
  index,
  isFirst,
  isLast,
  onMove,
  onRemove,
  onRuleChange,
  onToggleRequired,
  questions,
  question,
  requirementRule,
  required,
  visibilityRule,
}: {
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onMove: (questionId: string, direction: -1 | 1) => void;
  onRemove: (questionId: string) => void;
  onRuleChange: (
    questionId: string,
    ruleType: "requirementRule" | "visibilityRule",
    rule: DiscoveryRuleDraft | undefined,
  ) => void;
  onToggleRequired: (questionId: string, required: boolean) => void;
  questions: DiscoveryQuestionRow[];
  question: DiscoveryQuestionRow;
  requirementRule?: DiscoveryRuleDraft;
  required: boolean;
  visibilityRule?: DiscoveryRuleDraft;
}) {
  const ruleSourceQuestions = questions.filter((item) => item.id !== question.id);
  const warnings = questionWarnings(question);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-theme-xs dark:border-gray-800 dark:bg-gray-950/30">
      <div className="flex gap-2">
        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-1.5">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-gray-800 dark:text-white/90">
                {question.label}
              </p>
              <div className="mt-0.5 flex flex-wrap gap-1 text-xs text-gray-500 dark:text-gray-400">
                <span>{answerTypeLabel(question.answerType)}</span>
                <span>· {answerModeLabel(question.answerMode, question.maxAnswers)}</span>
                {answerTypeNeedsOptions(question.answerType) ? (
                  <span>· {optionsCount(question.optionsText)} options</span>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <IconButton
                ariaLabel={`Move ${question.label} up`}
                disabled={isFirst}
                onClick={() => onMove(question.id, -1)}
              >
                <ArrowUpIcon className="h-3 w-3" />
              </IconButton>
              <IconButton
                ariaLabel={`Move ${question.label} down`}
                disabled={isLast}
                onClick={() => onMove(question.id, 1)}
              >
                <ArrowDownIcon className="h-3 w-3" />
              </IconButton>
              <IconButton
                ariaLabel={`Remove ${question.label}`}
                onClick={() => onRemove(question.id)}
              >
                <TrashBinIcon className="h-3 w-3" />
              </IconButton>
            </div>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex flex-wrap gap-1">
              <ScopePill scope={question.scope} />
              {question.defaultRequired ? (
                  <span className="rounded-full bg-warning-50 px-1.5 py-0.5 text-[11px] font-semibold text-warning-700 dark:bg-warning-500/15 dark:text-warning-300">
                  Required by default
                </span>
              ) : null}
              {warnings.map((warning) => (
                <span
                  key={warning}
                  className="rounded-full bg-error-50 px-1.5 py-0.5 text-[11px] font-semibold text-error-600 dark:bg-error-500/15 dark:text-error-300"
                >
                  {warning}
                </span>
              ))}
              {visibilityRule?.questionId ? (
                <span className="rounded-full bg-purple-50 px-1.5 py-0.5 text-[11px] font-semibold text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">
                  Show rule
                </span>
              ) : null}
              {requirementRule?.questionId ? (
                <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                  Require rule
                </span>
              ) : null}
              {!question.isActive ? (
                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
                  Inactive
                </span>
              ) : null}
            </div>
            <div className="inline-flex rounded-lg bg-gray-100 p-0.5 dark:bg-white/[0.06]">
              {[false, true].map((value) => (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => onToggleRequired(question.id, value)}
                  className={`h-6 rounded-md px-2 text-[11px] font-semibold transition ${
                    required === value
                      ? value
                        ? "bg-warning-500 text-white shadow-theme-xs"
                        : "bg-white text-gray-900 shadow-theme-xs dark:bg-gray-900 dark:text-white"
                      : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
                  }`}
                >
                  {value ? "Required" : "Optional"}
                </button>
              ))}
            </div>
          </div>
          {visibilityRule?.questionId || requirementRule?.questionId ? (
            <div className="mt-1.5 rounded-lg border border-purple-100 bg-purple-50/60 px-2 py-1.5 text-xs leading-5 text-purple-700 dark:border-purple-500/20 dark:bg-purple-500/10 dark:text-purple-200">
              {visibilityRule?.questionId ? (
                <p>
                  <span className="font-semibold">Show:</span>{" "}
                  {ruleSummary(visibilityRule, questions)}
                </p>
              ) : null}
              {requirementRule?.questionId ? (
                <p>
                  <span className="font-semibold">Require:</span>{" "}
                  {ruleSummary(requirementRule, questions)}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="mt-2 grid gap-1.5 rounded-lg bg-gray-50 p-2 dark:bg-white/[0.03]">
            <RuleEditor
              label="Show"
              onChange={(rule) =>
                onRuleChange(question.id, "visibilityRule", rule)
              }
              questions={ruleSourceQuestions}
              rule={visibilityRule}
            />
            <RuleEditor
              label="Require"
              onChange={(rule) =>
                onRuleChange(question.id, "requirementRule", rule)
              }
              questions={ruleSourceQuestions}
              rule={requirementRule}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function RuleEditor({
  label,
  onChange,
  questions,
  rule,
}: {
  label: string;
  onChange: (rule: DiscoveryRuleDraft | undefined) => void;
  questions: DiscoveryQuestionRow[];
  rule?: DiscoveryRuleDraft;
}) {
  const enabled = Boolean(rule?.questionId);
  const operator = rule?.operator || "equals";
  const questionId = rule?.questionId || "";
  const value = rule?.value || "";

  function nextRule(patch: Partial<DiscoveryRuleDraft>) {
    const next = {
      operator,
      questionId,
      value,
      ...patch,
    };

    if (!next.questionId) onChange(undefined);
    else onChange(next);
  }

  return (
    <div className="grid gap-1.5 sm:grid-cols-[70px_minmax(0,1fr)] sm:items-center">
      <span className="text-[11px] font-semibold text-gray-500 uppercase dark:text-gray-400">
        {label}
      </span>
      <div className="grid gap-1.5 md:grid-cols-[130px_minmax(0,1fr)_120px_minmax(0,1fr)]">
        <select
          value={enabled ? "when" : "always"}
          onChange={(event) =>
            event.target.value === "always"
              ? onChange(undefined)
              : nextRule({
                  questionId: questions[0]?.id ?? "",
                })
          }
          disabled={!questions.length}
          className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200"
        >
          <option value="always">Always</option>
          <option value="when">When</option>
        </select>
        <select
          value={questionId}
          disabled={!enabled}
          onChange={(event) => nextRule({ questionId: event.target.value })}
          className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700 disabled:opacity-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200"
        >
          <option value="">Choose answer</option>
          {questions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <select
          value={operator}
          disabled={!enabled}
          onChange={(event) => nextRule({ operator: event.target.value })}
          className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700 disabled:opacity-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200"
        >
          <option value="equals">Equals</option>
          <option value="not_equals">Not equal</option>
          <option value="contains">Contains</option>
          <option value="not_contains">Does not contain</option>
          <option value="answered">Answered</option>
          <option value="not_answered">Empty</option>
        </select>
        <input
          value={value}
          disabled={!enabled || operator === "answered" || operator === "not_answered"}
          onChange={(event) => nextRule({ value: event.target.value })}
          className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700 disabled:opacity-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200"
          placeholder={
            operator === "answered" || operator === "not_answered"
              ? "No value needed"
              : "Answer value"
          }
        />
      </div>
      {!questions.length ? (
        <p className="text-[11px] text-gray-400 sm:col-start-2">
          Add another question before creating a rule.
        </p>
      ) : null}
    </div>
  );
}

function QuestionBankBuilderItem({
  isSelected,
  onAdd,
  question,
}: {
  isSelected: boolean;
  onAdd: (question: DiscoveryQuestionRow) => void;
  question: DiscoveryQuestionRow;
}) {
  return (
    <div
      className={`rounded-lg border p-2 transition ${
        isSelected
          ? "border-brand-200 bg-brand-50/60 dark:border-brand-500/30 dark:bg-brand-500/10"
          : "border-gray-200 bg-white hover:border-brand-200 dark:border-gray-800 dark:bg-gray-950/20"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-gray-800 dark:text-white/90">
            {question.label}
          </p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {question.dedupeKey ?? question.slug}
          </p>
        </div>
        <button
          type="button"
          disabled={isSelected}
          onClick={() => onAdd(question)}
          className="inline-flex h-6 shrink-0 items-center justify-center rounded-lg border border-gray-300 px-2 text-[11px] font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:border-brand-200 disabled:bg-brand-50 disabled:text-brand-600 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.05] dark:disabled:border-brand-500/30 dark:disabled:bg-brand-500/10 dark:disabled:text-brand-300"
        >
          {isSelected ? "Added" : "Add"}
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        <ScopePill scope={question.scope} />
        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
          {answerTypeLabel(question.answerType)}
        </span>
        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
          {answerModeLabel(question.answerMode, question.maxAnswers)}
        </span>
        {question.defaultRequired ? (
          <span className="rounded-full bg-warning-50 px-1.5 py-0.5 text-[11px] font-semibold text-warning-700 dark:bg-warning-500/15 dark:text-warning-300">
            Default required
          </span>
        ) : null}
      </div>
    </div>
  );
}

function IconButton({
  ariaLabel,
  children,
  disabled,
  onClick,
}: {
  ariaLabel: string;
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-35 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.05] dark:hover:text-white"
    >
      {children}
    </button>
  );
}

function Checklist({
  emptyText,
  items,
  name,
  selectedIds,
  title,
}: {
  emptyText: string;
  items: Array<{ id: string; label: string; meta?: string }>;
  name: string;
  selectedIds: Set<string>;
  title: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-2.5 dark:border-gray-800">
      <p className="mb-1.5 text-[13px] font-semibold text-gray-800 dark:text-white/90">
        {title}
      </p>
      <div className="max-h-32 space-y-1 overflow-y-auto pr-1">
        {items.map((item) => (
          <label
            key={item.id}
            className="flex items-start gap-2 rounded-lg border border-gray-100 px-2 py-1 text-[13px] dark:border-gray-800"
          >
            <input
              type="checkbox"
              name={name}
              value={item.id}
              defaultChecked={selectedIds.has(item.id)}
              className={checkboxClassName}
            />
            <span>
              <span className="block font-medium text-gray-800 dark:text-white/90">
                {item.label}
              </span>
              {item.meta ? (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {item.meta}
                </span>
              ) : null}
            </span>
          </label>
        ))}
        {!items.length ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {emptyText}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ModalActions({
  isDirty,
  isPending,
  onCancel,
  submitLabel,
}: {
  isDirty: boolean;
  isPending: boolean;
  onCancel: () => void;
  submitLabel: string;
}) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 -mb-4 flex flex-col-reverse gap-2 border-t border-gray-100 bg-white/95 px-4 py-2.5 backdrop-blur sm:-mx-5 sm:-mb-5 sm:flex-row sm:justify-end sm:px-5 dark:border-gray-800 dark:bg-gray-900/95">
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex h-8 items-center justify-center rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.05]"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={isPending || !isDirty}
        className="inline-flex h-8 items-center justify-center rounded-lg bg-brand-500 px-3 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Saving..." : submitLabel}
      </button>
    </div>
  );
}
