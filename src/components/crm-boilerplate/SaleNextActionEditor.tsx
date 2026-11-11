"use client";

import { useActionState, useEffect, useState } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import {
  updateSaleNextActionAction,
  type SaleNextActionState,
} from "@/lib/actions/sale-next-action";
import { saleNextActionMaxLength } from "@/lib/sales/next-action";

type SaleNextActionEditorProps = {
  initialNextAction: string | null;
  saleId: string;
};

const initialState: SaleNextActionState = { message: "", ok: false };

export default function SaleNextActionEditor({
  initialNextAction,
  saleId,
}: SaleNextActionEditorProps) {
  const [state, formAction, isPending] = useActionState(
    updateSaleNextActionAction,
    initialState,
  );
  const { showToast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [savedValue, setSavedValue] = useState(initialNextAction ?? "");
  const [draft, setDraft] = useState(initialNextAction ?? "");

  useEffect(() => {
    if (!state.ok) return;

    const nextValue = state.nextAction ?? "";
    queueMicrotask(() => {
      setSavedValue(nextValue);
      setDraft(nextValue);
      setIsEditing(false);
    });
    showToast(state.message || "Next action updated.");
  }, [showToast, state.message, state.nextAction, state.ok]);

  useEffect(() => {
    if (isEditing) return;
    const nextValue = initialNextAction ?? "";
    queueMicrotask(() => {
      setSavedValue(nextValue);
      setDraft(nextValue);
    });
  }, [initialNextAction, isEditing]);

  function cancelEditing() {
    setDraft(savedValue);
    setIsEditing(false);
  }

  if (!isEditing) {
    return (
      <div className="mt-3 flex flex-col gap-2 rounded-lg bg-gray-50 px-3 py-2 ring-1 ring-gray-100 dark:bg-white/[0.03] dark:ring-gray-800 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 text-sm leading-6">
          <p className="font-semibold text-gray-800 dark:text-white">
            Next action
          </p>
          <p className="whitespace-pre-wrap text-gray-600 dark:text-gray-300">
            {savedValue || "Not captured"}
          </p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Shared with the connected Person and Company.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-theme-xs transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-white/[0.04]"
        >
          {savedValue ? "Edit" : "Add next action"}
        </button>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="mt-3 space-y-3 rounded-lg bg-gray-50 px-3 py-3 ring-1 ring-gray-100 dark:bg-white/[0.03] dark:ring-gray-800"
    >
      <input type="hidden" name="saleId" value={saleId} />
      <div>
        <label
          htmlFor={`sale-next-action-${saleId}`}
          className="text-xs font-semibold text-gray-700 dark:text-gray-300"
        >
          Next action
        </label>
        <textarea
          id={`sale-next-action-${saleId}`}
          name="nextAction"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={saleNextActionMaxLength}
          rows={3}
          autoFocus
          placeholder="Example: Call the customer on Friday to confirm the survey date."
          className="mt-1.5 w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm leading-6 text-gray-800 shadow-theme-xs outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-950 dark:text-white/90"
        />
        <div className="mt-1 flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span>This is the committed CRM action, not an AI suggestion.</span>
          <span>
            {draft.length}/{saleNextActionMaxLength}
          </span>
        </div>
      </div>
      <ActionStateMessage state={state.ok ? undefined : state} />
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={cancelEditing}
          disabled={isPending}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 shadow-theme-xs transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-white/[0.04]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending || draft.trim() === savedValue.trim()}
          className="inline-flex h-9 items-center justify-center rounded-lg bg-brand-500 px-3 text-sm font-semibold text-white shadow-theme-xs transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Save next action"}
        </button>
      </div>
    </form>
  );
}
