"use client";

import { ListFilter } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

const filtersStorageKeys = {
  table: "sales-table-filters-visible",
  kanban: "sales-kanban-filters-visible",
} as const;

export default function SalesPipelineLayout({
  children,
  filters,
  view,
}: {
  children: ReactNode;
  filters: ReactNode;
  view: "table" | "kanban";
}) {
  const [filtersVisible, setFiltersVisible] = useState(view === "table");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedValue = window.sessionStorage.getItem(
        filtersStorageKeys[view],
      );
      setFiltersVisible(
        storedValue === null ? view === "table" : storedValue === "true",
      );
    }, 0);

    return () => window.clearTimeout(timer);
  }, [view]);

  function toggleFilters() {
    setFiltersVisible((current) => {
      const next = !current;
      window.sessionStorage.setItem(filtersStorageKeys[view], String(next));
      return next;
    });
  }

  return (
    <>
      <div className="flex justify-end border-b border-gray-200 bg-gray-50/60 px-4 py-2 dark:border-gray-800 dark:bg-white/[0.02]">
        <button
          type="button"
          aria-expanded={filtersVisible}
          onClick={toggleFilters}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-theme-xs transition hover:border-brand-200 hover:text-brand-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:border-brand-900/60 dark:hover:text-brand-300"
        >
          <ListFilter className="h-4 w-4" aria-hidden="true" />
          {filtersVisible ? "Hide filters" : "Show filters"}
        </button>
      </div>

      <div
        className={
          filtersVisible ? "grid xl:grid-cols-[250px_minmax(0,1fr)]" : "block"
        }
      >
        {filtersVisible ? filters : null}
        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}
