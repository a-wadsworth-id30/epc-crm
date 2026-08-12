"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import {
  updateSaleLeadScopeAction,
  type LeadScopeActionState,
} from "@/lib/actions/sales";
import {
  leadScopeProductTypes,
  normaliseLeadScope,
  type LeadScope,
  type LeadScopeProductType,
} from "@/lib/sales/lead-scope";
import { SparkIcon } from "@/icons";

type SaleLeadScopePanelProps = {
  initialScope: LeadScope;
  saleId: string;
  suggestedScope: LeadScope;
  variant?: "sidebar" | "embedded";
};

const initialState: LeadScopeActionState = {
  ok: false,
  message: "",
};

function scopeSourceLabel(scope: LeadScope) {
  if (scope.source === "inferred") return "Suggested";
  if (scope.source === "mixed") return "Edited suggestion";
  return "Manual";
}

export default function SaleLeadScopePanel({
  initialScope,
  saleId,
  suggestedScope,
  variant = "sidebar",
}: SaleLeadScopePanelProps) {
  const [state, formAction, isPending] = useActionState(
    updateSaleLeadScopeAction,
    initialState,
  );
  const { showToast } = useToast();
  const [scope, setScope] = useState(() => normaliseLeadScope(initialScope));
  const [customProductTypes, setCustomProductTypes] = useState(
    scope.customProductTypes.join(", "),
  );
  const [budget, setBudget] = useState(scope.budget ?? "");
  const [timeframe, setTimeframe] = useState(scope.timeframe ?? "");
  const [notes, setNotes] = useState(scope.notes ?? "");

  useEffect(() => {
    if (!state.ok || !state.scope) return;

    const savedScope = normaliseLeadScope(state.scope);
    queueMicrotask(() => {
      setScope(savedScope);
      setCustomProductTypes(savedScope.customProductTypes.join(", "));
      setBudget(savedScope.budget ?? "");
      setTimeframe(savedScope.timeframe ?? "");
      setNotes(savedScope.notes ?? "");
    });
    showToast(state.message || "Lead scope saved.");
  }, [showToast, state.message, state.ok, state.scope]);

  const selectedProductTypes = scope.productTypes;
  const suggestedProducts = useMemo(
    () =>
      suggestedScope.productTypes.filter(
        (product) => !selectedProductTypes.includes(product),
      ),
    [selectedProductTypes, suggestedScope.productTypes],
  );
  const completedFields = [
    selectedProductTypes.length || customProductTypes.trim(),
    budget.trim(),
    timeframe.trim(),
    notes.trim(),
  ].filter(Boolean).length;

  function toggleProduct(product: LeadScopeProductType) {
    setScope((current) => {
      const selected = current.productTypes.includes(product);

      return {
        ...current,
        productTypes: selected
          ? current.productTypes.filter((item) => item !== product)
          : [...current.productTypes, product],
      };
    });
  }

  return (
    <form
      action={formAction}
      className={
        variant === "embedded"
          ? "bg-transparent"
          : "sticky top-24 rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
      }
    >
      <input type="hidden" name="saleId" value={saleId} />
      <div
        className={`flex items-start justify-between gap-3 ${
          variant === "embedded"
            ? "border-b border-gray-200 pb-3 dark:border-gray-800"
            : ""
        }`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Lead scope
            </h2>
            <LazyHelpTooltip content="Editable lead requirements captured from forms, emails and sales notes. Product selection can drive separate Discovery questions." />
          </div>
          <p className="mt-1 text-sm leading-5 text-gray-500 dark:text-gray-400">
            Products requested, budget and timing for the discovery call.
          </p>
        </div>
        <span className="rounded-full bg-gray-50 px-2 py-0.5 text-[11px] font-semibold text-gray-500 ring-1 ring-gray-200 dark:bg-white/[0.04] dark:text-gray-400 dark:ring-gray-800">
          {completedFields}/4
        </span>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
              Products requested
            </label>
            <span className="text-[11px] font-semibold text-gray-400">
              {scopeSourceLabel(scope)}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {leadScopeProductTypes.map((product) => {
              const selected = selectedProductTypes.includes(product);

              return (
                <label
                  key={product}
                  className={`inline-flex cursor-pointer items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition ring-inset ${
                    selected
                      ? "bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-900/20 dark:text-brand-300 dark:ring-brand-900/40"
                      : "bg-gray-50 text-gray-600 ring-gray-200 hover:bg-gray-100 dark:bg-white/[0.04] dark:text-gray-300 dark:ring-gray-800 dark:hover:bg-white/[0.08]"
                  }`}
                >
                  <input
                    type="checkbox"
                    name="productTypes"
                    value={product}
                    checked={selected}
                    onChange={() => toggleProduct(product)}
                    className="sr-only"
                  />
                  {product}
                </label>
              );
            })}
          </div>
          {suggestedProducts.length ? (
            <p className="mt-2 text-xs leading-5 text-purple-700 dark:text-purple-300">
              Suggested: {suggestedProducts.join(", ")}
            </p>
          ) : null}
          <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
            Linked Discovery groups decide which qualification questions appear
            for these products.
          </p>
        </div>

        <div>
          <label
            htmlFor="customProductTypes"
            className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400"
          >
            Other scope
          </label>
          <input
            id="customProductTypes"
            name="customProductTypes"
            value={customProductTypes}
            onChange={(event) => setCustomProductTypes(event.target.value)}
            placeholder="Photography, copywriting..."
            className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 shadow-theme-xs outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-950 dark:text-white/90"
          />
        </div>

        <div
          className={`grid gap-3 ${
            variant === "embedded"
              ? "sm:grid-cols-2"
              : "sm:grid-cols-2 xl:grid-cols-1"
          }`}
        >
          <div>
            <label
              htmlFor="budget"
              className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400"
            >
              Budget
            </label>
            <input
              id="budget"
              name="budget"
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
              placeholder="£10-20k"
              className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 shadow-theme-xs outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-950 dark:text-white/90"
            />
          </div>
          <div>
            <label
              htmlFor="timeframe"
              className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400"
            >
              Timing
            </label>
            <input
              id="timeframe"
              name="timeframe"
              value={timeframe}
              onChange={(event) => setTimeframe(event.target.value)}
              placeholder="Next 3 months"
              className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 shadow-theme-xs outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-950 dark:text-white/90"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="notes"
            className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400"
          >
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={4}
            placeholder="Key requirements to confirm on the call..."
            className="mt-2 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm leading-6 text-gray-800 shadow-theme-xs outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90"
          />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <ActionStateMessage state={state.message ? state : undefined} />
        <button
          type="submit"
          name="mode"
          value="manual"
          disabled={isPending}
          className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-brand-500 px-3 text-sm font-semibold text-white shadow-theme-xs transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Saving..." : "Save scope"}
        </button>
        <button
          type="submit"
          name="mode"
          value="infer"
          disabled={isPending}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-purple-100 bg-white px-3 text-sm font-semibold text-purple-700 shadow-theme-xs transition hover:border-purple-200 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-purple-900/40 dark:bg-gray-950 dark:text-purple-300 dark:hover:bg-purple-900/20"
        >
          <SparkIcon className="h-4 w-4" />
          Apply suggestions
        </button>
      </div>
    </form>
  );
}
