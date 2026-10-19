"use client";

import { ListFilter } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

const kanbanFiltersStorageKey = "sales-kanban-filters-visible";

export default function SalesPipelineLayout({
  children,
  filters,
  view,
}: {
  children: ReactNode;
  filters: ReactNode;
  view: "table" | "kanban";
}) {
  const [kanbanFiltersVisible, setKanbanFiltersVisible] = useState(false);

  useEffect(() => {
    if (view !== "kanban") return;

    const timer = window.setTimeout(() => {
      setKanbanFiltersVisible(
        window.sessionStorage.getItem(kanbanFiltersStorageKey) === "true",
      );
    }, 0);

    return () => window.clearTimeout(timer);
  }, [view]);

  function toggleKanbanFilters() {
    setKanbanFiltersVisible((current) => {
      const next = !current;
      window.sessionStorage.setItem(kanbanFiltersStorageKey, String(next));
      return next;
    });
  }

  const filtersVisible = view === "table" || kanbanFiltersVisible;

  return (
    <>
      {view === "kanban" ? (
        <div className="flex justify-end border-b border-gray-200 bg-gray-50/60 px-4 py-2 dark:border-gray-800 dark:bg-white/[0.02]">
          <button
            type="button"
            aria-expanded={kanbanFiltersVisible}
            onClick={toggleKanbanFilters}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-theme-xs transition hover:border-brand-200 hover:text-brand-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:border-brand-900/60 dark:hover:text-brand-300"
          >
            <ListFilter className="h-4 w-4" aria-hidden="true" />
            {kanbanFiltersVisible ? "Hide filters" : "Show filters"}
          </button>
        </div>
      ) : null}

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
