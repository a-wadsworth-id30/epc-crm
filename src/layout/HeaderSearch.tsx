"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useHeaderSearchRecords } from "@/hooks/search/useHeaderSearchRecords";
import {
  canShowHeaderSearchEntry,
  headerQuerySearchTargets,
  headerSearchEntries,
  normalizeHeaderSearchText,
  recordToHeaderSearchEntry,
  scoreHeaderSearchEntry,
  type HeaderSearchEntry,
  type HeaderSearchRole,
} from "@/lib/navigation/header-search";
import type { ModuleToggles } from "@/lib/module-toggles";

type HeaderSearchProps = {
  companiesEnabled: boolean;
  currentUserRole: HeaderSearchRole;
  enableGlobalShortcut?: boolean;
  moduleToggles: ModuleToggles;
  onNavigate?: () => void;
};

export default function HeaderSearch({
  companiesEnabled,
  currentUserRole,
  enableGlobalShortcut = true,
  moduleToggles,
  onNavigate,
}: HeaderSearchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const reactId = useId().replace(/:/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const { isLoading: isLoadingRecords, records } =
    useHeaderSearchRecords(query);
  const currentQuery = searchParams.toString();
  const currentPath = currentQuery ? `${pathname}?${currentQuery}` : pathname;

  const visibleEntries = useMemo(
    () =>
      headerSearchEntries.filter((entry) =>
        canShowHeaderSearchEntry({
          companiesEnabled,
          currentUserRole,
          entry,
          moduleToggles,
        }),
      ),
    [companiesEnabled, currentUserRole, moduleToggles],
  );

  const results = useMemo(() => {
    const normalizedQuery = normalizeHeaderSearchText(query);

    if (!normalizedQuery) {
      return [...visibleEntries]
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
        .slice(0, 8);
    }

    const words = normalizedQuery.split(" ").filter(Boolean);
    const recordEntries = records.map((record) =>
      recordToHeaderSearchEntry(record),
    );
    const queryResults: HeaderSearchEntry[] = headerQuerySearchTargets
      .filter((entry) =>
        canShowHeaderSearchEntry({
          companiesEnabled,
          currentUserRole,
          entry,
          moduleToggles,
        }),
      )
      .map((target) => ({
        description: target.description,
        href: `${target.href}?q=${encodeURIComponent(query.trim())}`,
        keywords: target.keywords,
        priority: 120,
        resultKind: "query" as const,
        section: target.section,
        title: `Search ${target.title} for "${query.trim()}"`,
      }));

    const pageResults = visibleEntries
      .map((entry) => ({
        entry,
        score: scoreHeaderSearchEntry(entry, normalizedQuery, words),
      }))
      .filter((result) => result.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score || a.entry.title.localeCompare(b.entry.title),
      )
      .map((result) => result.entry);

    return [...recordEntries, ...queryResults, ...pageResults].slice(0, 10);
  }, [companiesEnabled, currentUserRole, moduleToggles, query, records, visibleEntries]);

  useEffect(() => {
    if (!enableGlobalShortcut) {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!containerRef.current?.getClientRects().length) {
        return;
      }

      const target = event.target;
      const isEditableTarget =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT");

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen(true);
        inputRef.current?.focus();
        return;
      }

      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isEditableTarget ||
        event.key.length !== 1 ||
        event.key === " "
      ) {
        return;
      }

      event.preventDefault();
      setQuery(event.key);
      setActiveIndex(0);
      setIsOpen(true);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [enableGlobalShortcut]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  function navigateTo(entry: HeaderSearchEntry) {
    setIsOpen(false);
    setQuery("");
    onNavigate?.();
    router.push(entry.href);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const firstResult = results[activeIndex] ?? results[0];

    if (firstResult) {
      navigateTo(firstResult);
    }
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) =>
        results.length ? (current + 1) % results.length : 0,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) =>
        results.length ? (current - 1 + results.length) % results.length : 0,
      );
      return;
    }

    if (event.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  }

  const listId = `${reactId}-global-header-search-results`;
  const activeResultId = results[activeIndex]
    ? `${reactId}-global-header-search-result-${activeIndex}`
    : undefined;

  return (
    <form role="search" onSubmit={handleSubmit} className="w-full">
      <div ref={containerRef} className="relative w-full">
        <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2">
          <svg
            className="fill-gray-500 dark:fill-gray-400"
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M3.04175 9.37363C3.04175 5.87693 5.87711 3.04199 9.37508 3.04199C12.8731 3.04199 15.7084 5.87693 15.7084 9.37363C15.7084 12.8703 12.8731 15.7053 9.37508 15.7053C5.87711 15.7053 3.04175 12.8703 3.04175 9.37363ZM9.37508 1.54199C5.04902 1.54199 1.54175 5.04817 1.54175 9.37363C1.54175 13.6991 5.04902 17.2053 9.37508 17.2053C11.2674 17.2053 13.003 16.5344 14.357 15.4176L17.177 18.238C17.4699 18.5309 17.9448 18.5309 18.2377 18.238C18.5306 17.9451 18.5306 17.4703 18.2377 17.1774L15.418 14.3573C16.5365 13.0033 17.2084 11.2669 17.2084 9.37363C17.2084 5.04817 13.7011 1.54199 9.37508 1.54199Z"
              fill=""
            />
          </svg>
        </span>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleInputKeyDown}
          placeholder="Search or type command..."
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={isOpen}
          aria-activedescendant={activeResultId}
          className="dark:bg-dark-900 h-11 w-full rounded-lg border border-gray-200 bg-transparent py-2.5 pr-14 pl-12 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden xl:w-[430px] dark:border-gray-800 dark:bg-gray-900 dark:bg-white/[0.03] dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
        />
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            inputRef.current?.focus();
          }}
          className="absolute top-1/2 right-2.5 inline-flex -translate-y-1/2 items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 px-[7px] py-[4.5px] text-xs text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400"
          aria-label="Focus global search"
        >
          <span>⌘</span>
          <span>K</span>
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 z-[100000] mt-2 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-950">
            <div className="border-b border-gray-100 px-3 py-2 text-xs font-semibold tracking-normal text-gray-500 uppercase dark:border-gray-800 dark:text-gray-400">
              {query.trim()
                ? isLoadingRecords
                  ? "Searching CRM records"
                  : "Search results"
                : "Quick links"}
            </div>
            <div
              id={listId}
              role="listbox"
              className="max-h-[360px] overflow-y-auto py-2"
            >
              {results.length ? (
                results.map((entry, index) => {
                  const isActive = index === activeIndex;
                  const isCurrentPage = entry.href === currentPath;

                  return (
                    <button
                      key={`${entry.href}-${entry.title}`}
                      id={`${reactId}-global-header-search-result-${index}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => navigateTo(entry)}
                      className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition ${
                        isActive
                          ? "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-200"
                          : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                      }`}
                    >
                      <span
                        className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-semibold ${
                          isActive
                            ? "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
                            : "bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400"
                        }`}
                        aria-hidden="true"
                      >
                        {entry.section.slice(0, 1)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold">
                            {entry.title}
                          </span>
                          {isCurrentPage && (
                            <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-gray-500 ring-1 ring-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:ring-white/10">
                              Current
                            </span>
                          )}
                          {entry.badge && (
                            <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-gray-500 ring-1 ring-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:ring-white/10">
                              {entry.badge}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
                          {entry.section} / {entry.description}
                        </span>
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                  No matching pages or commands.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </form>
  );
}
