"use client";

import { useActionState, useState } from "react";
import {
  createContactSegmentAction,
  generateContactSegmentAction,
  type SegmentActionState,
  type SegmentBuilderState,
} from "@/lib/actions/contact-segments";

const initialBuilderState: SegmentBuilderState = {
  ok: false,
  message: "",
  draft: null,
};

const initialSaveState: SegmentActionState = {
  ok: false,
  message: "",
};

const examples = [
  "People that have started digital marketing in the last 12 months",
  "Contacts with an open lead and a phone number",
  "Won customers with an email address",
];

type SegmentCriteriaPreview = {
  match?: "all" | "any";
  rules?: Array<{ label?: string; type?: string }>;
};

export default function ContactSegmentBuilder() {
  const [prompt, setPrompt] = useState(examples[0]);
  const [builderState, generateAction, isGenerating] = useActionState(
    generateContactSegmentAction,
    initialBuilderState,
  );
  const [saveState, saveAction, isSaving] = useActionState(
    createContactSegmentAction,
    initialSaveState,
  );

  const draft = builderState.draft;
  let criteria: SegmentCriteriaPreview | null = null;
  let criteriaError = "";

  if (draft?.criteriaJson) {
    try {
      criteria = JSON.parse(draft.criteriaJson) as SegmentCriteriaPreview;
    } catch {
      criteria = null;
      criteriaError = "Criteria JSON is not valid. Fix it before saving.";
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 p-5 dark:border-gray-800">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <form action={generateAction} className="min-w-0 space-y-4">
            <div>
              <label
                htmlFor="segment-prompt"
                className="text-sm font-semibold text-gray-800 dark:text-white/90"
              >
                Segment builder
              </label>
              <textarea
                id="segment-prompt"
                name="prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={3}
                className="mt-2 w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 outline-none transition focus:border-brand-500 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90"
                placeholder="Describe the people you want to group..."
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {examples.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setPrompt(example)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 transition hover:border-brand-300 hover:text-brand-600 dark:border-gray-800 dark:text-gray-300"
                >
                  {example}
                </button>
              ))}
            </div>
            <button
              type="submit"
              disabled={isGenerating}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white shadow-theme-xs transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGenerating ? "Building..." : "Build segment"}
            </button>
            {builderState.message ? (
              <p
                className={`text-sm ${
                  builderState.ok
                    ? "text-success-700 dark:text-success-300"
                    : "text-error-600 dark:text-error-300"
                }`}
              >
                {builderState.message}
              </p>
            ) : null}
          </form>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.04]">
            <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
              Current preview
            </p>
            {draft ? (
              <div className="mt-3 space-y-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      {draft.matchCount}
                    </p>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600 dark:bg-white/[0.08] dark:text-gray-300">
                      {draft.mode === "openai" ? "AI drafted" : "Fallback rules"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    matching {draft.matchCount === 1 ? "person" : "people"}
                  </p>
                </div>
                <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">
                  {draft.summary}
                </p>
                {draft.note ? (
                  <p className="rounded-lg bg-warning-50 px-3 py-2 text-xs font-medium text-warning-700 dark:bg-warning-900/20 dark:text-warning-300">
                    {draft.note}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">
                Build a segment to preview the rule set and current match count.
              </p>
            )}
          </div>
        </div>
      </div>

      {draft ? (
        <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Criteria review
              </p>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600 dark:bg-white/[0.08] dark:text-gray-300">
                {criteria?.rules?.length ?? 0} rule{criteria?.rules?.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {criteria?.rules?.map((rule, index) => (
                <span
                  key={`${rule.type ?? "rule"}-${index}`}
                  className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700 dark:bg-white/10 dark:text-gray-300"
                >
                  {rule.label ?? rule.type ?? "Segment rule"}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              Match mode: {criteria?.match === "any" ? "Any rule" : "All rules"}
            </p>
            <label className="mt-4 block">
              <span className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                Editable criteria JSON
              </span>
              <textarea
                defaultValue={draft.criteriaJson}
                form="segment-save-form"
                name="criteriaJson"
                rows={10}
                spellCheck={false}
                className="mt-1 w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-xs leading-5 text-gray-800 outline-none transition focus:border-brand-500 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90"
              />
            </label>
            {criteriaError ? (
              <p className="mt-2 rounded-lg bg-error-50 px-3 py-2 text-xs font-medium text-error-700 dark:bg-error-900/20 dark:text-error-300">
                {criteriaError}
              </p>
            ) : (
              <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                Match count is calculated when the draft is generated. Edited
                criteria are validated when saved.
              </p>
            )}
          </div>

          <form
            id="segment-save-form"
            action={saveAction}
            className="space-y-3"
          >
            <input type="hidden" name="prompt" value={draft.prompt} />
            <input type="hidden" name="aiSummary" value={draft.summary} />
            <div>
              <label className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                Name
              </label>
              <input
                name="name"
                defaultValue={draft.name}
                className="mt-1 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none transition focus:border-brand-500 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                Description
              </label>
              <textarea
                name="description"
                defaultValue={draft.description ?? ""}
                rows={2}
                className="mt-1 w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-brand-500 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90"
              />
            </div>
            <button
              type="submit"
              disabled={isSaving || Boolean(criteriaError)}
              className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white shadow-theme-xs transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-gray-900"
            >
              {isSaving ? "Saving..." : "Save segment"}
            </button>
            {saveState.message ? (
              <p
                className={`text-sm ${
                  saveState.ok
                    ? "text-success-700 dark:text-success-300"
                    : "text-error-600 dark:text-error-300"
                }`}
              >
                {saveState.message}
              </p>
            ) : null}
          </form>
        </div>
      ) : null}
    </section>
  );
}
