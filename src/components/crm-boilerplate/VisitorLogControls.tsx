"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

type FilterOption = {
  label: string;
  value: string;
};

type SavedView = {
  description: string;
  label: string;
  params: Record<string, string | undefined>;
};

export type VisitorLogControlsProps = {
  confidence: string;
  confidenceOptions: FilterOption[];
  convertedOnly: boolean;
  pageSize: string;
  pageSizeOptions: FilterOption[];
  query: string;
  range: string;
  rangeOptions: FilterOption[];
  savedViews: SavedView[];
  sort: string;
  sortOptions: FilterOption[];
  source: string;
  sourceOptions: FilterOption[];
  totalEntries: number;
};

const defaults: Record<string, string> = {
  confidence: "all",
  pageSize: "20",
  range: "30",
  sort: "last-desc",
  source: "all",
};

function setFilterParam(params: URLSearchParams, name: string, value: string) {
  params.delete("page");

  if (!value || value === defaults[name]) {
    params.delete(name);
    return;
  }

  params.set(name, value);
}

export default function VisitorLogControls({
  confidence,
  confidenceOptions,
  convertedOnly,
  pageSize,
  pageSizeOptions,
  query,
  range,
  rangeOptions,
  savedViews,
  sort,
  sortOptions,
  source,
  sourceOptions,
  totalEntries,
}: VisitorLogControlsProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState(query);
  const [isPending, startTransition] = useTransition();

  const currentParams = useMemo(
    () => new URLSearchParams(searchParams.toString()),
    [searchParams],
  );

  const applyParams = useCallback(
    (nextParams: URLSearchParams) => {
      const queryString = nextParams.toString();
      startTransition(() => {
        router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
          scroll: false,
        });
      });
    },
    [pathname, router],
  );

  const applyFilter = useCallback(
    (name: string, value: string) => {
      const nextParams = new URLSearchParams(currentParams);
      setFilterParam(nextParams, name, value);
      applyParams(nextParams);
    },
    [applyParams, currentParams],
  );

  const applySavedView = useCallback(
    (params: Record<string, string | undefined>) => {
      const nextParams = new URLSearchParams();

      for (const [name, value] of Object.entries(params)) {
        if (!value) continue;
        setFilterParam(nextParams, name, value);
      }

      applyParams(nextParams);
    },
    [applyParams],
  );

  useEffect(() => {
    setSearchValue(query);
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextValue = searchValue.trim();
      const currentValue = currentParams.get("q") ?? "";

      if (nextValue === currentValue) return;

      const nextParams = new URLSearchParams(currentParams);
      nextParams.delete("page");
      if (nextValue) {
        nextParams.set("q", nextValue);
      } else {
        nextParams.delete("q");
      }
      applyParams(nextParams);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [applyParams, currentParams, searchValue]);

  const selectClassName =
    "h-9 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-800 outline-none transition focus:border-brand-500 dark:border-gray-800 dark:bg-gray-950 dark:text-white/90";

  return (
    <aside
      aria-busy={isPending}
      className="rounded-xl border border-gray-200 bg-white p-3 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90">
            Filters
          </h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {totalEntries} matching session{totalEntries === 1 ? "" : "s"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => applyParams(new URLSearchParams())}
          className="rounded-lg px-2 py-1 text-xs font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
        >
          Reset
        </button>
      </div>

      <label className="mt-3 block">
        <span className="mb-1.5 block text-xs font-semibold text-gray-500 dark:text-gray-400">
          Search
        </span>
        <input
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder="Visitor, page, source..."
          className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none transition focus:border-brand-500 dark:border-gray-800 dark:bg-gray-950 dark:text-white/90"
        />
      </label>

      <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-1">
        <FilterSelect
          className={selectClassName}
          label="Date range"
          onChange={(value) => applyFilter("range", value)}
          options={rangeOptions}
          value={range}
        />
        <FilterSelect
          className={selectClassName}
          label="Sort"
          onChange={(value) => applyFilter("sort", value)}
          options={sortOptions}
          value={sort}
        />
        <FilterSelect
          className={selectClassName}
          label="Confidence"
          onChange={(value) => applyFilter("confidence", value)}
          options={confidenceOptions}
          value={confidence}
        />
        <FilterSelect
          className={selectClassName}
          label="Page size"
          onChange={(value) => applyFilter("pageSize", value)}
          options={pageSizeOptions}
          value={pageSize}
        />
      </div>

      <label className="mt-3 inline-flex h-8 items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
        <input
          type="checkbox"
          checked={convertedOnly}
          onChange={(event) => applyFilter("converted", event.target.checked ? "1" : "")}
          className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700"
        />
        Only converted
      </label>

      <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-800">
        <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
          Sources
        </p>
        <div className="mt-2 grid grid-cols-2 gap-1.5 xl:grid-cols-1">
          {sourceOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => applyFilter("source", option.value)}
              className={`flex h-8 items-center justify-between rounded-lg border px-2.5 text-left text-xs font-semibold transition ${
                source === option.value
                  ? "border-brand-100 bg-brand-50 text-brand-700 dark:border-brand-900/50 dark:bg-brand-500/10 dark:text-brand-300"
                  : "border-gray-100 bg-white text-gray-700 hover:border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-white/[0.04]"
              }`}
            >
              <span className="truncate">{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-800">
        <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
          Saved views
        </p>
        <div className="mt-2 space-y-1.5">
          {savedViews.map((view) => (
            <button
              key={view.label}
              type="button"
              title={view.description}
              onClick={() => applySavedView(view.params)}
              className="flex h-8 w-full items-center rounded-lg border border-gray-100 bg-white px-2.5 text-left text-xs font-semibold text-gray-700 transition hover:border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-white/[0.04]"
            >
              <span className="truncate">{view.label}</span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

function FilterSelect({
  className,
  label,
  onChange,
  options,
  value,
}: {
  className: string;
  label: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-gray-500 dark:text-gray-400">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={className}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
