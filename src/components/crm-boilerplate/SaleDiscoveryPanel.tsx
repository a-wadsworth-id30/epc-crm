"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import {
  updateSaleDiscoveryAnswersAction,
  type DiscoveryAnswersActionState,
} from "@/lib/actions/sales";

export type SaleDiscoveryQuestion = {
  id: string;
  label: string;
  helpText: string | null;
  answerType: string;
  answerMode: string;
  maxAnswers: number | null;
  required: boolean;
  options: Array<{ label: string; value: string }>;
  answerValue: string | null;
  requirementRules: unknown;
  visibilityRules: unknown;
};

export type SaleDiscoveryPack = {
  id: string;
  name: string;
  description: string | null;
  scope: "LEAD" | "PRODUCT" | "CATEGORY";
  contextId: string | null;
  contextName: string | null;
  questions: SaleDiscoveryQuestion[];
};

type SaleDiscoveryPanelProps = {
  packs: SaleDiscoveryPack[];
  saleId: string;
};

const initialState: DiscoveryAnswersActionState = {
  ok: false,
  message: "",
};

type AnswerState = Record<string, string[]>;

type DiscoveryRule = {
  operator: string;
  questionId: string;
  value: string;
};

function scopeLabel(pack: SaleDiscoveryPack) {
  if (pack.scope === "PRODUCT") return "Product discovery";
  if (pack.scope === "CATEGORY") return "Category discovery";
  return "Lead discovery";
}

function answerName(pack: SaleDiscoveryPack, questionId: string) {
  const contextType =
    pack.scope === "PRODUCT"
      ? "product"
      : pack.scope === "CATEGORY"
        ? "category"
        : "lead";

  return `answer:${questionId}:${contextType}:${pack.contextId ?? "lead"}`;
}

function answerValuesFromText(value: string | null) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function initialAnswerState(packs: SaleDiscoveryPack[]) {
  const answers: AnswerState = {};

  for (const pack of packs) {
    for (const question of pack.questions) {
      answers[answerName(pack, question.id)] = answerValuesFromText(
        question.answerValue,
      );
    }
  }

  return answers;
}

function isMultiSelectQuestion(question: SaleDiscoveryQuestion) {
  return (
    question.answerType === "MULTI_SELECT" ||
    question.answerType === "PRODUCT_MULTI_SELECT" ||
    question.answerType === "CATEGORY_MULTI_SELECT"
  );
}

function isSingleSelectQuestion(question: SaleDiscoveryQuestion) {
  return (
    question.answerType === "SINGLE_SELECT" ||
    question.answerType === "PRODUCT_SELECT" ||
    question.answerType === "CATEGORY_SELECT"
  );
}

function isRepeatableQuestion(question: SaleDiscoveryQuestion) {
  return (
    (question.answerMode === "MULTIPLE_MAX" ||
      question.answerMode === "MULTIPLE_UNLIMITED") &&
    !isMultiSelectQuestion(question) &&
    !isSingleSelectQuestion(question) &&
    question.answerType !== "BOOLEAN"
  );
}

function firstDiscoveryRule(value: unknown): DiscoveryRule | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const rules = Array.isArray(data.rules) ? data.rules : [];
  const first = rules[0];
  if (!first || typeof first !== "object" || Array.isArray(first)) return null;
  const rule = first as Record<string, unknown>;
  const questionId =
    typeof rule.questionId === "string" ? rule.questionId.trim() : "";
  if (!questionId) return null;

  return {
    operator: typeof rule.operator === "string" ? rule.operator : "equals",
    questionId,
    value: typeof rule.value === "string" ? rule.value : "",
  };
}

function ruleMatches(
  pack: SaleDiscoveryPack,
  answers: AnswerState,
  rule: DiscoveryRule | null,
) {
  if (!rule) return true;

  const sourceName = answerName(pack, rule.questionId);
  const values = answers[sourceName] ?? [];
  const normalizedValue = rule.value.trim().toLowerCase();
  const normalizedAnswers = values.map((value) => value.trim().toLowerCase());
  const hasAnswer = normalizedAnswers.some(Boolean);

  if (rule.operator === "answered") return hasAnswer;
  if (rule.operator === "not_answered") return !hasAnswer;
  if (rule.operator === "not_equals") {
    return hasAnswer && !normalizedAnswers.includes(normalizedValue);
  }
  if (rule.operator === "contains") {
    return normalizedAnswers.some((value) => value.includes(normalizedValue));
  }
  if (rule.operator === "not_contains") {
    return hasAnswer && normalizedAnswers.every((value) => !value.includes(normalizedValue));
  }

  return normalizedAnswers.includes(normalizedValue);
}

function visibleQuestions(pack: SaleDiscoveryPack, answers: AnswerState) {
  return pack.questions.filter((question) =>
    ruleMatches(pack, answers, firstDiscoveryRule(question.visibilityRules)),
  );
}

function isQuestionRequired(
  pack: SaleDiscoveryPack,
  question: SaleDiscoveryQuestion,
  answers: AnswerState,
) {
  const requirementRule = firstDiscoveryRule(question.requirementRules);
  return question.required || Boolean(requirementRule && ruleMatches(pack, answers, requirementRule));
}

function answerTypeLabel(value: string) {
  const labels: Record<string, string> = {
    BOOLEAN: "Yes / no",
    CATEGORY_MULTI_SELECT: "Categories",
    CATEGORY_SELECT: "Category",
    CURRENCY: "Currency",
    CURRENCY_RANGE: "Budget range",
    DATE: "Date",
    DATETIME: "Date and time",
    DOMAIN: "Domain",
    LONG_TEXT: "Notes",
    MULTI_SELECT: "Multi-select",
    NUMBER: "Number",
    PRODUCT_MULTI_SELECT: "Products",
    PRODUCT_SELECT: "Product",
    SINGLE_SELECT: "Dropdown",
    SLIDER: "Slider",
    TEXT: "Text",
    URL: "URL",
  };

  return labels[value] ?? value.toLowerCase().replaceAll("_", " ");
}

function answerModeLabel(question: SaleDiscoveryQuestion) {
  if (question.answerMode === "MULTIPLE_MAX") {
    return `Repeatable up to ${question.maxAnswers ?? "limit"}`;
  }

  if (question.answerMode === "MULTIPLE_UNLIMITED") {
    return "Repeatable";
  }

  return "Single answer";
}

function ruleSummary(
  pack: SaleDiscoveryPack,
  rule: DiscoveryRule | null,
) {
  if (!rule?.questionId) return "";
  const source = pack.questions.find((question) => question.id === rule.questionId);
  const sourceLabel = source?.label ?? "another answer";
  if (rule.operator === "answered") return `when ${sourceLabel} is answered`;
  if (rule.operator === "not_answered") return `when ${sourceLabel} is empty`;
  return `when ${sourceLabel} ${rule.operator.replaceAll("_", " ")} ${rule.value || "value"}`;
}

function hiddenQuestionCount(pack: SaleDiscoveryPack, answers: AnswerState) {
  return pack.questions.length - visibleQuestions(pack, answers).length;
}

function answeredCount(pack: SaleDiscoveryPack, answers: AnswerState) {
  return visibleQuestions(pack, answers).filter(
    (question) => (answers[answerName(pack, question.id)] ?? []).length,
  ).length;
}

function missingRequiredCount(pack: SaleDiscoveryPack, answers: AnswerState) {
  return visibleQuestions(pack, answers).filter((question) => {
    const values = answers[answerName(pack, question.id)] ?? [];
    return isQuestionRequired(pack, question, answers) && !values.length;
  }).length;
}

function inputType(question: SaleDiscoveryQuestion) {
  if (question.answerType === "DATE") return "date";
  if (question.answerType === "DATETIME") return "datetime-local";
  if (
    question.answerType === "NUMBER" ||
    question.answerType === "CURRENCY"
  ) {
    return "number";
  }
  if (question.answerType === "URL") {
    return "url";
  }
  return "text";
}

function SearchableMultiSelectField({
  name,
  onChange,
  question,
  values,
}: {
  name: string;
  onChange: (values: string[]) => void;
  question: SaleDiscoveryQuestion;
  values: string[];
}) {
  const [query, setQuery] = useState("");
  const selectedValues = useMemo(() => new Set(values), [values]);
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return question.options;
    return question.options.filter((option) =>
      option.label.toLowerCase().includes(normalizedQuery),
    );
  }, [query, question.options]);
  const selectedOptions = question.options.filter((option) =>
    selectedValues.has(option.value),
  );

  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-gray-950">
      <input type="hidden" name={name} value="" />
      {Array.from(selectedValues).map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}
      <div className="border-b border-gray-100 p-2 dark:border-gray-800">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
            {values.length} selected · {question.options.length} available
          </span>
          {values.length ? (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-[11px] font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-300"
            >
              Clear all
            </button>
          ) : null}
        </div>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-9 w-full rounded-md border border-gray-200 bg-gray-50 px-2.5 text-sm text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          placeholder={`Search ${question.label.toLowerCase()}...`}
        />
      </div>
      {selectedOptions.length ? (
        <div className="flex flex-wrap gap-1.5 border-b border-gray-100 px-2 py-2 dark:border-gray-800">
          {selectedOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                const next = new Set(selectedValues);
                next.delete(option.value);
                onChange(Array.from(next));
              }}
              className="rounded-full bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100 transition hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-200 dark:ring-brand-500/20"
            >
              {option.label} x
            </button>
          ))}
        </div>
      ) : null}
      <div className="max-h-44 overflow-y-auto p-1">
        {filteredOptions.length ? (
          filteredOptions.map((option) => {
            const checked = selectedValues.has(option.value);

            return (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-gray-700 transition hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/[0.04]"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => {
                    const next = new Set(selectedValues);
                    if (event.target.checked) next.add(option.value);
                    else next.delete(option.value);
                    onChange(Array.from(next));
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700"
                />
                <span className="min-w-0 truncate">{option.label}</span>
              </label>
            );
          })
        ) : (
          <p className="px-2 py-3 text-sm text-gray-400">No matches found.</p>
        )}
      </div>
    </div>
  );
}

function RepeatableInputField({
  name,
  onChange,
  question,
  values,
}: {
  name: string;
  onChange: (values: string[]) => void;
  question: SaleDiscoveryQuestion;
  values: string[];
}) {
  const [rows, setRows] = useState(() => (values.length ? values : [""]));
  const maxAnswers =
    question.answerMode === "MULTIPLE_MAX" ? question.maxAnswers ?? 2 : null;
  const canAdd = !maxAnswers || rows.length < maxAnswers;
  const type = inputType(question);
  const placeholder =
    question.answerType === "DOMAIN"
      ? "example.com"
      : question.answerType === "URL"
        ? "https://example.com"
        : "Capture the answer...";

  function updateRows(nextRows: string[]) {
    setRows(nextRows.length ? nextRows : [""]);
    onChange(nextRows.map((item) => item.trim()).filter(Boolean));
  }

  return (
    <div className="mt-2 space-y-2">
      <input type="hidden" name={name} value="" />
      {rows.map((value, index) => (
        <div key={index} className="flex gap-2">
          <input
            type={type}
            name={name}
            value={value}
            onChange={(event) => {
              const next = [...rows];
              next[index] = event.target.value;
              updateRows(next);
            }}
            className="h-10 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 shadow-theme-xs outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-950 dark:text-white/90"
            placeholder={placeholder}
          />
          <button
            type="button"
            onClick={() => {
              const next = rows.filter((_, rowIndex) => rowIndex !== index);
              updateRows(next);
            }}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.04]"
            aria-label={`Remove ${question.label} answer ${index + 1}`}
          >
            -
          </button>
        </div>
      ))}
      {canAdd ? (
        <button
          type="button"
          onClick={() => setRows([...rows, ""])}
          className="inline-flex h-8 items-center rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.04]"
        >
          Add another{maxAnswers ? ` (${rows.length}/${maxAnswers})` : ""}
        </button>
      ) : maxAnswers ? (
        <p className="text-xs font-medium text-gray-400">
          Maximum {maxAnswers} answers reached.
        </p>
      ) : null}
    </div>
  );
}

function DiscoveryField({
  onChange,
  pack,
  question,
  required,
  values,
}: {
  onChange: (values: string[]) => void;
  pack: SaleDiscoveryPack;
  question: SaleDiscoveryQuestion;
  required: boolean;
  values: string[];
}) {
  const name = answerName(pack, question.id);
  const baseClassName =
    "mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 shadow-theme-xs outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-950 dark:text-white/90";

  if (question.answerType === "LONG_TEXT") {
    return (
      <textarea
        name={name}
        value={values[0] ?? ""}
        onChange={(event) => onChange(event.target.value ? [event.target.value] : [])}
        required={required}
        rows={4}
        className={`${baseClassName} resize-none py-2.5 leading-6`}
        placeholder="Capture the answer..."
      />
    );
  }

  if (question.answerType === "BOOLEAN") {
    return (
      <select
        name={name}
        value={values[0] ?? ""}
        onChange={(event) => onChange(event.target.value ? [event.target.value] : [])}
        required={required}
        className={`${baseClassName} h-10`}
      >
        <option value="">Not answered</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }

  if (isMultiSelectQuestion(question) && question.options.length) {
    return (
      <SearchableMultiSelectField
        name={name}
        onChange={onChange}
        question={question}
        values={values}
      />
    );
  }

  if (
    (isSingleSelectQuestion(question) ||
      question.answerType === "CURRENCY_RANGE") &&
    question.options.length
  ) {
    return (
      <select
        name={name}
        value={values[0] ?? ""}
        onChange={(event) => onChange(event.target.value ? [event.target.value] : [])}
        required={required}
        className={`${baseClassName} h-10`}
      >
        <option value="">Choose...</option>
        {question.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (isRepeatableQuestion(question)) {
    return (
      <RepeatableInputField
        name={name}
        onChange={onChange}
        question={question}
        values={values}
      />
    );
  }

  if (question.answerType === "SLIDER") {
    const savedValue = values[0] ?? "";
    const displayValue = savedValue || "50";

    return (
      <div className="mt-2 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-theme-xs dark:border-gray-800 dark:bg-gray-950">
        <input type="hidden" name={name} value={savedValue} />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
            Low
          </span>
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
            {savedValue ? `${savedValue}/100` : "Not set"}
          </span>
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
            High
          </span>
        </div>
        <input
          type="range"
          value={displayValue}
          onChange={(event) => onChange([event.target.value])}
          min="0"
          max="100"
          step="1"
          className="mt-2 w-full accent-brand-500"
        />
      </div>
    );
  }

  return (
    <input
      type={inputType(question)}
      name={name}
      value={values[0] ?? ""}
      onChange={(event) => onChange(event.target.value ? [event.target.value] : [])}
      required={required}
      className={`${baseClassName} h-10`}
      placeholder={
        question.answerType === "CURRENCY"
          ? "0"
          : question.answerType === "DOMAIN"
            ? "example.com"
            : question.answerType === "URL"
              ? "https://example.com"
              : "Capture the answer..."
      }
      step={question.answerType === "CURRENCY" ? "0.01" : "1"}
    />
  );
}

export default function SaleDiscoveryPanel({
  packs,
  saleId,
}: SaleDiscoveryPanelProps) {
  const [state, formAction, isPending] = useActionState(
    updateSaleDiscoveryAnswersAction,
    initialState,
  );
  const { showToast } = useToast();
  const [answers, setAnswers] = useState(() => initialAnswerState(packs));
  const [activePackId, setActivePackId] = useState(() => packs[0]?.id ?? "");
  const activePack = useMemo(
    () => packs.find((pack) => pack.id === activePackId) ?? packs[0] ?? null,
    [activePackId, packs],
  );
  const activeQuestions = activePack ? visibleQuestions(activePack, answers) : [];

  useEffect(() => {
    if (state.ok && state.message) showToast(state.message);
  }, [showToast, state.message, state.ok]);

  function setQuestionAnswer(name: string, values: string[]) {
    setAnswers((current) => ({
      ...current,
      [name]: values.map((value) => value.trim()).filter(Boolean),
    }));
  }

  if (!packs.length) {
    return (
      <section className="p-5">
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center dark:border-gray-800 dark:bg-white/[0.03]">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            No discovery packs matched
          </h2>
          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
            Add lead, category or product discovery question packs in Products &
            Operations to make them appear here.
          </p>
        </div>
      </section>
    );
  }

  return (
    <form action={formAction} className="p-4 sm:p-5">
      <input type="hidden" name="saleId" value={saleId} />
      <div className="flex flex-col gap-4">
        <aside className="flex min-w-0 gap-2 overflow-x-auto rounded-xl border border-gray-200 bg-gray-50 p-2 dark:border-gray-800 dark:bg-white/[0.03]">
          {packs.map((pack) => {
            const isActive = pack.id === activePack?.id;
            const answered = answeredCount(pack, answers);
            const missingRequired = missingRequiredCount(pack, answers);
            const packQuestionCount = visibleQuestions(pack, answers).length;
            const hiddenCount = hiddenQuestionCount(pack, answers);

            return (
              <button
                key={pack.id}
                type="button"
                onClick={() => setActivePackId(pack.id)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                  isActive
                    ? "bg-white text-brand-700 shadow-theme-xs ring-1 ring-brand-100 dark:bg-gray-950 dark:text-brand-300 dark:ring-brand-900/40"
                    : "text-gray-600 hover:bg-white dark:text-gray-300 dark:hover:bg-white/[0.04]"
                } min-w-[220px] max-w-[320px] shrink-0`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {pack.contextName ?? pack.name}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
                    {scopeLabel(pack)}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      missingRequired
                        ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200"
                        : "bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400"
                    }`}
                  >
                    {missingRequired
                      ? `${missingRequired} req`
                      : `${answered}/${packQuestionCount}`}
                  </span>
                  {hiddenCount ? (
                    <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">
                      {hiddenCount} hidden
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </aside>

        <section className="min-w-0">
          {activePack ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 pb-4 dark:border-gray-800">
                <div className="min-w-0">
                  <p className="text-xs font-semibold tracking-wide text-brand-600 uppercase dark:text-brand-300">
                    {scopeLabel(activePack)}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                    {activePack.name}
                  </h2>
                  {activePack.description ? (
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
                      {activePack.description}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                      missingRequiredCount(activePack, answers)
                        ? "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-900/40"
                        : "bg-success-50 text-success-700 ring-success-200 dark:bg-success-500/10 dark:text-success-200 dark:ring-success-900/40"
                    }`}
                  >
                    {missingRequiredCount(activePack, answers)
                      ? `${missingRequiredCount(activePack, answers)} required missing`
                      : "Required complete"}
                  </span>
                  <span className="rounded-full bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-500 ring-1 ring-gray-200 dark:bg-white/[0.04] dark:text-gray-400 dark:ring-gray-800">
                    {answeredCount(activePack, answers)}/{activeQuestions.length} done
                  </span>
                  {hiddenQuestionCount(activePack, answers) ? (
                    <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700 ring-1 ring-purple-100 dark:bg-purple-500/10 dark:text-purple-200 dark:ring-purple-900/40">
                      {hiddenQuestionCount(activePack, answers)} hidden by logic
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all"
                  style={{
                    width: `${Math.round((answeredCount(activePack, answers) / Math.max(activeQuestions.length, 1)) * 100)}%`,
                  }}
                />
              </div>

              <div className="mt-4 grid gap-3">
                {activeQuestions.map((question, index) => {
                  const currentAnswerName = answerName(activePack, question.id);
                  const currentValues = answers[currentAnswerName] ?? [];
                  const dynamicRequired = isQuestionRequired(
                    activePack,
                    question,
                    answers,
                  );
                  const missingRequired =
                    dynamicRequired && !currentValues.length;
                  const visibilityRule = firstDiscoveryRule(
                    question.visibilityRules,
                  );
                  const requirementRule = firstDiscoveryRule(
                    question.requirementRules,
                  );

                  return (
                    <div
                      key={`${activePack.id}:${question.id}`}
                      className={`rounded-xl border bg-white p-4 shadow-theme-xs dark:bg-white/[0.03] ${
                        missingRequired
                          ? "border-amber-200 ring-2 ring-amber-50 dark:border-amber-900/50 dark:ring-amber-900/20"
                          : "border-gray-200 dark:border-gray-800"
                      }`}
                    >
                      <input
                        type="hidden"
                        name="requiredAnswer"
                        value={dynamicRequired ? currentAnswerName : ""}
                      />
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 inline-grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gray-50 text-xs font-semibold text-gray-500 ring-1 ring-gray-200 dark:bg-white/[0.04] dark:text-gray-400 dark:ring-gray-800">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <label className="text-sm font-semibold text-gray-800 dark:text-white/90">
                              {question.label}
                              {dynamicRequired ? (
                                <span className="ml-1 text-error-500">*</span>
                              ) : null}
                            </label>
                            <div className="flex flex-wrap justify-end gap-1">
                              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
                                {answerTypeLabel(question.answerType)}
                              </span>
                              {question.answerMode !== "SINGLE" ? (
                                <span className="rounded-full bg-blue-light-50 px-2 py-0.5 text-[11px] font-semibold text-blue-light-700 dark:bg-blue-light-500/15 dark:text-blue-light-300">
                                  {answerModeLabel(question)}
                                </span>
                              ) : null}
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                  missingRequired
                                    ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200"
                                    : dynamicRequired
                                      ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-200"
                                      : "bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400"
                                }`}
                              >
                                {missingRequired
                                  ? "Required"
                                  : dynamicRequired
                                    ? "Required answered"
                                    : "Optional"}
                              </span>
                            </div>
                          </div>
                          {question.helpText ? (
                            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                              {question.helpText}
                            </p>
                          ) : null}
                          {visibilityRule || requirementRule ? (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {visibilityRule ? (
                                <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700 dark:bg-purple-500/15 dark:text-purple-200">
                                  Shows {ruleSummary(activePack, visibilityRule)}
                                </span>
                              ) : null}
                              {requirementRule ? (
                                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-200">
                                  Required {ruleSummary(activePack, requirementRule)}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                          <DiscoveryField
                            onChange={(values) =>
                              setQuestionAnswer(currentAnswerName, values)
                            }
                            pack={activePack}
                            question={question}
                            required={dynamicRequired}
                            values={currentValues}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!activeQuestions.length ? (
                  <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-5 text-center dark:border-gray-800 dark:bg-white/[0.03]">
                    <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                      No visible questions in this pack
                    </p>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Current answers have hidden every question in this group.
                    </p>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </section>
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800">
        <ActionStateMessage state={state.message ? state : undefined} />
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white shadow-theme-xs transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Saving..." : "Save discovery"}
        </button>
      </div>
    </form>
  );
}
