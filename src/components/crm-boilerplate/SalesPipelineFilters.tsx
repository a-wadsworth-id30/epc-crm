"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";

type FilterOption = {
  color?: string | null;
  label: string;
  value: string;
};

export type SalesPipelineFiltersProps = {
  customerCategoryCounts?: Array<{ category: string; count: number }>;
  customerCategoryOptions?: FilterOption[];
  defaultSortValue?: string;
  openStageValues?: string[];
  ownerOptions: FilterOption[];
  selectedOwner: string;
  selectedSort: string;
  selectedStage: string;
  selectedCustomerCategory?: string;
  resetHref?: string;
  sortOptions: FilterOption[];
  stageCounts?: Array<{ stage: string; count: number }>;
  stageOptions: FilterOption[];
  query: string;
  variant?: "bar" | "rail";
};

function updateParam(
  params: URLSearchParams,
  name: string,
  value: string,
  defaultSortValue: string,
) {
  if (
    !value ||
    value === "all" ||
    (name === "sort" && value === defaultSortValue)
  ) {
    params.delete(name);
    return;
  }

  params.set(name, value);
}

const stageDotClasses: Record<string, string> = {
  LEAD: "bg-gray-400",
  QUALIFIED: "bg-brand-500",
  PROPOSAL: "bg-orange-500",
  NEGOTIATION: "bg-theme-purple-500",
  WON: "bg-success-500",
  LOST: "bg-error-500",
};

const defaultOpenStageValues = ["LEAD", "QUALIFIED", "PROPOSAL", "NEGOTIATION"];
const selectClassName =
  "h-9 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm font-medium text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90";
const compactSelectClassName =
  "h-9 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-800 outline-none transition focus:border-brand-500 dark:border-gray-800 dark:bg-gray-950 dark:text-white/90";

export default function SalesPipelineFilters({
  customerCategoryCounts = [],
  customerCategoryOptions = [],
  defaultSortValue = "close-asc",
  openStageValues = defaultOpenStageValues,
  ownerOptions,
  selectedOwner,
  selectedSort,
  selectedStage,
  selectedCustomerCategory = "all",
  resetHref = "/sales",
  sortOptions,
  stageCounts = [],
  stageOptions,
  query,
  variant = "bar",
}: SalesPipelineFiltersProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState(query);
  const [isPending, startTransition] = useTransition();

  const currentParams = useMemo(
    () => new URLSearchParams(searchParams.toString()),
    [searchParams],
  );

  const applyFilter = useCallback(
    (name: string, value: string) => {
      const nextParams = new URLSearchParams(currentParams);
      updateParam(nextParams, name, value, defaultSortValue);
      nextParams.delete("page");
      const queryString = nextParams.toString();

      startTransition(() => {
        router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
          scroll: false,
        });
      });
    },
    [currentParams, defaultSortValue, pathname, router],
  );

  useEffect(() => {
    setSearchValue(query);
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextValue = searchValue.trim();
      const currentValue = currentParams.get("q") ?? "";

      if (nextValue === currentValue) return;
      applyFilter("q", nextValue);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [applyFilter, currentParams, searchValue]);

  const { categoryButtonOptions, openCount, stageButtonOptions, totalCount } =
    useMemo(() => {
      const stageCountByValue = new Map(
        stageCounts.map((item) => [item.stage, item.count]),
      );
      const categoryCountByValue = new Map(
        customerCategoryCounts.map((item) => [item.category, item.count]),
      );
      const openStageValueSet = new Set(openStageValues);
      const categoryTotalCount = customerCategoryCounts.reduce(
        (total, item) => total + item.count,
        0,
      );

      return {
        categoryButtonOptions: customerCategoryOptions.map((option) => ({
          ...option,
          count:
            option.value === "all"
              ? categoryTotalCount
              : (categoryCountByValue.get(option.value) ?? 0),
        })),
        openCount: stageCounts.reduce(
          (total, item) =>
            openStageValueSet.has(item.stage) ? total + item.count : total,
          0,
        ),
        stageButtonOptions: stageOptions
          .filter((option) => option.value !== "all" && option.value !== "open")
          .map((option) => ({
            ...option,
            count: stageCountByValue.get(option.value) ?? 0,
          })),
        totalCount: stageCounts.reduce((total, item) => total + item.count, 0),
      };
    }, [
      customerCategoryCounts,
      customerCategoryOptions,
      openStageValues,
      stageCounts,
      stageOptions,
    ]);

  if (variant === "rail") {
    return (
      <aside
        aria-busy={isPending}
        className="border-b border-gray-100 bg-gray-50/50 p-3 xl:border-r xl:border-b-0 dark:border-gray-800 dark:bg-white/[0.02]"
      >
        <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-theme-xs dark:border-gray-800 dark:bg-gray-950">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Sales filters
              </h3>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {totalCount} total opportunities
              </p>
            </div>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-700 dark:bg-white/[0.06] dark:text-gray-300">
              {openCount} open
            </span>
          </div>

          {categoryButtonOptions.length ? (
            <div className="mt-3">
              <div className="mb-1.5 text-[11px] font-semibold text-gray-500 uppercase dark:text-gray-400">
                Customer status
              </div>
              <div className="grid grid-cols-2 gap-1.5 xl:block xl:space-y-1.5">
                {categoryButtonOptions.map((option) => {
                  const isActive = selectedCustomerCategory === option.value;
                  const dotStyle = option.color
                    ? { backgroundColor: option.color }
                    : undefined;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        applyFilter("customerCategory", option.value)
                      }
                      className={`flex h-8 w-full items-center justify-between gap-2 rounded-lg border px-2.5 text-left text-xs font-semibold transition ${
                        isActive
                          ? "border-brand-100 bg-brand-50 text-brand-700 shadow-theme-xs dark:border-brand-900/50 dark:bg-brand-500/10 dark:text-brand-300"
                          : "border-gray-100 bg-white text-gray-700 hover:border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-white/[0.04]"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full bg-gray-400"
                          style={dotStyle}
                        />
                        <span className="truncate">{option.label}</span>
                      </span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                          isActive
                            ? "bg-white text-brand-700 dark:bg-white/[0.08] dark:text-brand-200"
                            : "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400"
                        }`}
                      >
                        {option.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-3">
            <div className="mb-1.5 text-[11px] font-semibold text-gray-500 uppercase dark:text-gray-400">
              Pipeline stage
            </div>
            <div className="grid grid-cols-2 gap-1.5 xl:block xl:space-y-1.5">
              {stageButtonOptions.map((option) => {
                const isActive = selectedStage === option.value;
                const dotClass = option.color
                  ? ""
                  : option.value === "all" || option.value === "open"
                    ? "bg-gray-400"
                    : (stageDotClasses[option.value] ?? "bg-gray-400");
                const dotStyle = option.color
                  ? { backgroundColor: option.color }
                  : undefined;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => applyFilter("stage", option.value)}
                    className={`flex h-8 w-full items-center justify-between gap-2 rounded-lg border px-2.5 text-left text-xs font-semibold transition ${
                      isActive
                        ? "border-brand-100 bg-brand-50 text-brand-700 shadow-theme-xs dark:border-brand-900/50 dark:bg-brand-500/10 dark:text-brand-300"
                        : "border-gray-100 bg-white text-gray-700 hover:border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-white/[0.04]"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${dotClass}`}
                        style={dotStyle}
                      />
                      <span className="truncate">{option.label}</span>
                    </span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                        isActive
                          ? "bg-white text-brand-700 dark:bg-white/[0.08] dark:text-brand-200"
                          : "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400"
                      }`}
                    >
                      {option.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:block xl:space-y-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-gray-500 uppercase dark:text-gray-400">
                Search
              </span>
              <input
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search deals..."
                className="h-9 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-800 transition outline-none focus:border-brand-500 dark:border-gray-800 dark:bg-gray-950 dark:text-white/90"
              />
            </label>

            {customerCategoryOptions.length ? (
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-gray-500 uppercase dark:text-gray-400">
                  Customer status
                </span>
                <select
                  name="customerCategory"
                  value={selectedCustomerCategory}
                  onChange={(event) =>
                    applyFilter("customerCategory", event.target.value)
                  }
                  className={compactSelectClassName}
                >
                  {customerCategoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-gray-500 uppercase dark:text-gray-400">
                Stage
              </span>
              <select
                name="stage"
                value={selectedStage}
                onChange={(event) => applyFilter("stage", event.target.value)}
                className={compactSelectClassName}
              >
                {stageOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-gray-500 uppercase dark:text-gray-400">
                Owner
              </span>
              <select
                name="owner"
                value={selectedOwner}
                onChange={(event) => applyFilter("owner", event.target.value)}
                className={compactSelectClassName}
              >
                {ownerOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-gray-500 uppercase dark:text-gray-400">
                Sort by
              </span>
              <select
                name="sort"
                value={selectedSort}
                onChange={(event) => applyFilter("sort", event.target.value)}
                className={compactSelectClassName}
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <Link
              href={resetHref}
              className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 sm:col-span-2 xl:col-span-1 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-white/[0.05]"
            >
              Reset filters
            </Link>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <div
      aria-busy={isPending}
      className="grid gap-2 border-b border-gray-100 p-3 xl:grid-cols-[minmax(280px,1fr)_170px_170px_170px_180px_auto] xl:items-end dark:border-gray-800"
    >
      <label className="block">
        <span className="sr-only">Search</span>
        <input
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder="Deal, customer, owner, source"
          className="h-9 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 transition outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90"
        />
      </label>

      {customerCategoryOptions.length ? (
        <label className="block">
          <span className="sr-only">Customer status</span>
          <select
            name="customerCategory"
            value={selectedCustomerCategory}
            onChange={(event) =>
              applyFilter("customerCategory", event.target.value)
            }
            className={selectClassName}
          >
            {customerCategoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="block">
        <span className="sr-only">Stage</span>
        <select
          name="stage"
          value={selectedStage}
          onChange={(event) => applyFilter("stage", event.target.value)}
          className={selectClassName}
        >
          {stageOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="sr-only">Owner</span>
        <select
          name="owner"
          value={selectedOwner}
          onChange={(event) => applyFilter("owner", event.target.value)}
          className={selectClassName}
        >
          {ownerOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="sr-only">Sort</span>
        <select
          name="sort"
          value={selectedSort}
          onChange={(event) => applyFilter("sort", event.target.value)}
          className={selectClassName}
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <Link
        href={resetHref}
        className="inline-flex h-9 min-w-[80px] items-center justify-center rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.05]"
      >
        Reset
      </Link>
    </div>
  );
}
