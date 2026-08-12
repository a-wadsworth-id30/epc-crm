"use client";

import { CloseIcon } from "@/icons";
import type { CrmDataTableFilter, FilterValue } from "./CrmDataTable";

type CrmDataTableFilterPanelProps<TData> = {
  filterDefaults: Record<string, FilterValue>;
  filterPanelDescription: string;
  filterPanelTitle: string;
  filterValues: Record<string, FilterValue>;
  filters: CrmDataTableFilter<TData>[];
  onChange: (filterId: string, value: FilterValue) => void;
  onClose: () => void;
  onReset: () => void;
};

export default function CrmDataTableFilterPanel<TData>({
  filterDefaults,
  filterPanelDescription,
  filterPanelTitle,
  filterValues,
  filters,
  onChange,
  onClose,
  onReset,
}: CrmDataTableFilterPanelProps<TData>) {
  return (
    <div className="fixed inset-0 z-99999 flex justify-end bg-gray-900/20 backdrop-blur-[1px]">
      <button
        type="button"
        aria-label="Close filters"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-[420px] flex-col border-l border-gray-200 bg-white shadow-theme-xl dark:border-gray-800 dark:bg-gray-950">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 p-5 dark:border-gray-800">
          <div>
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              {filterPanelTitle}
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {filterPanelDescription}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
            aria-label="Close filters"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {filters.map((filter) => (
            <CrmDataTableFilterControl
              key={filter.id}
              filter={filter}
              value={filterValues[filter.id] ?? filterDefaults[filter.id] ?? ""}
              onChange={(value) => onChange(filter.id, value)}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-200 p-5 dark:border-gray-800">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex h-11 items-center justify-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-500 px-5 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
          >
            Apply filters
          </button>
        </div>
      </aside>
    </div>
  );
}

function CrmDataTableFilterControl<TData>({
  filter,
  value,
  onChange,
}: {
  filter: CrmDataTableFilter<TData>;
  value: FilterValue;
  onChange: (value: FilterValue) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
        {filter.label}
      </label>

      {filter.type === "select" ? (
        <select
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-700 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
        >
          <option value="">Any</option>
          {filter.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}

      {filter.type === "multi-select" ? (
        <div className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-800">
          {filter.options.map((option) => {
            const selectedValues = Array.isArray(value) ? value : [];
            const checked = selectedValues.includes(option.value);

            return (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-3 text-sm text-gray-700 dark:text-gray-300"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => {
                    if (event.target.checked) {
                      onChange([...selectedValues, option.value]);
                    } else {
                      onChange(
                        selectedValues.filter((current) => current !== option.value),
                      );
                    }
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                />
                {option.label}
              </label>
            );
          })}
        </div>
      ) : null}

      {filter.type === "boolean" ? (
        <select
          value={typeof value === "string" ? value : "all"}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-700 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
        >
          <option value="all">Any</option>
          <option value="true">{filter.trueLabel ?? "Yes"}</option>
          <option value="false">{filter.falseLabel ?? "No"}</option>
        </select>
      ) : null}

      {filter.type === "date-range" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            type="date"
            value={
              typeof value === "object" && !Array.isArray(value)
                ? value.from ?? ""
                : ""
            }
            onChange={(event) =>
              onChange({
                ...(typeof value === "object" && !Array.isArray(value)
                  ? value
                  : {}),
                from: event.target.value,
              })
            }
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-700 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
          />
          <input
            type="date"
            value={
              typeof value === "object" && !Array.isArray(value)
                ? value.to ?? ""
                : ""
            }
            onChange={(event) =>
              onChange({
                ...(typeof value === "object" && !Array.isArray(value)
                  ? value
                  : {}),
                to: event.target.value,
              })
            }
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-700 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
          />
        </div>
      ) : null}
    </div>
  );
}
