"use client";

import dynamic from "next/dynamic";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  TableIcon,
} from "@/icons";
import { cn } from "@/utils";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export type CrmDataTableSortDirection = "asc" | "desc";

export type CrmDataTableColumn<TData> = {
  id: string;
  header: ReactNode;
  cell: (row: TData) => ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
  defaultVisible?: boolean;
  enableHiding?: boolean;
  headerClassName?: string;
  searchable?: boolean;
  searchValue?: (row: TData) => string | number | null | undefined;
  sortable?: boolean;
  sortValue?: (row: TData) => string | number | Date | null | undefined;
  visibilityLabel?: string;
  width?: string;
};

export type CrmDataTableFilterOption = {
  label: string;
  value: string;
};

export type CrmDataTableFilter<TData> =
  | {
      id: string;
      label: string;
      type: "select";
      options: CrmDataTableFilterOption[];
      getValue: (row: TData) => string | null | undefined;
      defaultValue?: string;
    }
  | {
      id: string;
      label: string;
      type: "multi-select";
      options: CrmDataTableFilterOption[];
      getValue: (row: TData) => string | string[] | null | undefined;
      defaultValue?: string[];
    }
  | {
      id: string;
      label: string;
      type: "boolean";
      trueLabel?: string;
      falseLabel?: string;
      getValue: (row: TData) => boolean | null | undefined;
      defaultValue?: "all" | "true" | "false";
    }
  | {
      id: string;
      label: string;
      type: "date-range";
      getValue: (row: TData) => string | Date | null | undefined;
      defaultValue?: { from?: string; to?: string };
    };

export type CrmDataTableAction<TData> = {
  id: string;
  label: string;
  href?: (row: TData) => string;
  onSelect?: (row: TData) => void;
  disabled?: (row: TData) => boolean;
  hidden?: (row: TData) => boolean;
  icon?: "view" | "edit" | "delete" | "duplicate" | "download" | IconComponent;
  variant?: "default" | "danger";
};

export type CrmDataTableProps<TData> = {
  data: TData[];
  columns: CrmDataTableColumn<TData>[];
  getRowId: (row: TData) => string;
  title?: ReactNode;
  description?: ReactNode;
  emptyState?: ReactNode;
  searchPlaceholder?: string;
  getSearchValue?: (row: TData) => string;
  filters?: CrmDataTableFilter<TData>[];
  filterPanelTitle?: string;
  filterPanelDescription?: string;
  enableColumnSelection?: boolean;
  columnSelectionLabel?: string;
  visibleColumnIds?: string[];
  onVisibleColumnIdsChange?: (columnIds: string[]) => void;
  rowActions?: CrmDataTableAction<TData>[] | ((row: TData) => CrmDataTableAction<TData>[]);
  renderRowActions?: (row: TData) => ReactNode;
  getRowClassName?: (row: TData) => string;
  pageSizeOptions?: number[];
  initialPageSize?: number;
  initialSort?: { columnId: string; direction: CrmDataTableSortDirection };
  query?: string;
  onQueryChange?: (query: string) => void;
  sort?: { columnId: string; direction: CrmDataTableSortDirection } | null;
  onSortChange?: (sort: { columnId: string; direction: CrmDataTableSortDirection }) => void;
  page?: number;
  pageSize?: number;
  totalCount?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  manualFiltering?: boolean;
  manualSorting?: boolean;
  manualPagination?: boolean;
  className?: string;
};

export type FilterValue = string | string[] | { from?: string; to?: string };

const defaultPageSizeOptions = [10, 25, 50, 100];
const emptyFilters: CrmDataTableFilter<never>[] = [];

type CrmDataTableActionsComponent = <TData>({
  actions,
  row,
}: {
  actions: CrmDataTableAction<TData>[];
  row: TData;
}) => ReactNode;

type CrmDataTableFilterPanelComponent = <TData>({
  filterDefaults,
  filterPanelDescription,
  filterPanelTitle,
  filterValues,
  filters,
  onChange,
  onClose,
  onReset,
}: {
  filterDefaults: Record<string, FilterValue>;
  filterPanelDescription: string;
  filterPanelTitle: string;
  filterValues: Record<string, FilterValue>;
  filters: CrmDataTableFilter<TData>[];
  onChange: (filterId: string, value: FilterValue) => void;
  onClose: () => void;
  onReset: () => void;
}) => ReactNode;

const CrmDataTableActions = dynamic(() => import("./CrmDataTableActions"), {
  loading: () => null,
  ssr: false,
}) as CrmDataTableActionsComponent;

const CrmDataTableFilterPanel = dynamic(
  () => import("./CrmDataTableFilterPanel"),
  {
    loading: () => null,
    ssr: false,
  },
) as CrmDataTableFilterPanelComponent;

function normalize(value: unknown) {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "number") {
    return value;
  }

  return String(value ?? "").toLowerCase();
}

function dateValue(value: string | Date | null | undefined) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  const time = parsed.getTime();
  return Number.isFinite(time) ? time : null;
}

function hasFilterValue(value: FilterValue | undefined) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object" && value) return Boolean(value.from || value.to);
  return Boolean(value && value !== "all");
}

function defaultFilterValue<TData>(filter: CrmDataTableFilter<TData>): FilterValue {
  if (filter.type === "multi-select") return filter.defaultValue ?? [];
  if (filter.type === "date-range") return filter.defaultValue ?? {};
  if (filter.type === "boolean") return filter.defaultValue ?? "all";
  return filter.defaultValue ?? "";
}

function buttonAlignment(align: CrmDataTableColumn<unknown>["align"]) {
  if (align === "center") return "justify-center text-center";
  if (align === "right") return "justify-end text-right";
  return "justify-start text-left";
}

function columnLabel<TData>(column: CrmDataTableColumn<TData>) {
  if (column.visibilityLabel) return column.visibilityLabel;
  if (typeof column.header === "string") return column.header;
  return column.id;
}

function defaultVisibleColumnIds<TData>(columns: CrmDataTableColumn<TData>[]) {
  return columns
    .filter((column) => column.enableHiding === false || column.defaultVisible !== false)
    .map((column) => column.id);
}

function normalizeVisibleColumnIds<TData>(
  columnIds: string[],
  columns: CrmDataTableColumn<TData>[],
) {
  const availableIds = new Set(columns.map((column) => column.id));
  const requestedIds = new Set(
    columnIds.filter((columnId) => availableIds.has(columnId)),
  );
  const lockedIds = new Set(
    columns
      .filter((column) => column.enableHiding === false)
      .map((column) => column.id),
  );
  const normalizedIds = columns
    .filter(
      (column) => lockedIds.has(column.id) || requestedIds.has(column.id),
    )
    .map((column) => column.id);

  return normalizedIds.length || !columns[0] ? normalizedIds : [columns[0].id];
}

export default function CrmDataTable<TData>({
  data,
  columns,
  getRowId,
  title,
  description,
  emptyState,
  searchPlaceholder = "Search...",
  getSearchValue,
  filters,
  filterPanelTitle = "Filters",
  filterPanelDescription = "Refine the table without crowding the page.",
  enableColumnSelection = false,
  columnSelectionLabel = "Columns",
  visibleColumnIds: controlledVisibleColumnIds,
  onVisibleColumnIdsChange,
  rowActions,
  renderRowActions,
  getRowClassName,
  pageSizeOptions = defaultPageSizeOptions,
  initialPageSize,
  initialSort,
  query: controlledQuery,
  onQueryChange,
  sort: controlledSort,
  onSortChange,
  page: controlledPage,
  pageSize: controlledPageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
  manualFiltering = false,
  manualSorting = false,
  manualPagination = false,
  className,
}: CrmDataTableProps<TData>) {
  const normalizedPageSizes = pageSizeOptions.length ? pageSizeOptions : defaultPageSizeOptions;
  const tableFilters = (filters ?? emptyFilters) as CrmDataTableFilter<TData>[];
  const filterDefaultsKey = useMemo(
    () =>
      JSON.stringify(
        tableFilters.map((filter) => ({
          defaultValue: filter.defaultValue ?? null,
          id: filter.id,
          type: filter.type,
        })),
      ),
    [tableFilters],
  );
  const filterDefaults = useMemo(() => {
    const defaults = JSON.parse(filterDefaultsKey) as Array<{
      defaultValue: FilterValue | null;
      id: string;
    }>;

    return Object.fromEntries(
      defaults.map((filter) => [filter.id, filter.defaultValue ?? ""]),
    ) as Record<string, FilterValue>;
  }, [filterDefaultsKey]);
  const [localQuery, setLocalQuery] = useState("");
  const [localPage, setLocalPage] = useState(1);
  const [localPageSize, setLocalPageSize] = useState(initialPageSize ?? normalizedPageSizes[0]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [localSort, setLocalSort] = useState(initialSort ?? null);
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const columnMenuRef = useRef<HTMLDivElement>(null);
  const [localVisibleColumnIds, setLocalVisibleColumnIds] = useState(() =>
    defaultVisibleColumnIds(columns),
  );
  const [filterState, setFilterState] = useState<{
    key: string;
    values: Record<string, FilterValue>;
  }>(() => ({
    key: filterDefaultsKey,
    values: filterDefaults,
  }));
  const query = controlledQuery ?? localQuery;
  const page = controlledPage ?? localPage;
  const pageSize = controlledPageSize ?? localPageSize;
  const sort = controlledSort ?? localSort;
  const filterValues =
    filterState.key === filterDefaultsKey ? filterState.values : filterDefaults;
  const defaultColumnIds = useMemo(
    () => defaultVisibleColumnIds(columns),
    [columns],
  );
  const requestedColumnIds =
    controlledVisibleColumnIds ?? localVisibleColumnIds;
  const normalizedVisibleColumnIds = useMemo(
    () =>
      enableColumnSelection
        ? normalizeVisibleColumnIds(
            requestedColumnIds.length ? requestedColumnIds : defaultColumnIds,
            columns,
          )
        : columns.map((column) => column.id),
    [columns, defaultColumnIds, enableColumnSelection, requestedColumnIds],
  );
  const visibleColumnIdSet = useMemo(
    () => new Set(normalizedVisibleColumnIds),
    [normalizedVisibleColumnIds],
  );
  const visibleColumns = useMemo(
    () =>
      columns.filter((column) => visibleColumnIdSet.has(column.id)),
    [columns, visibleColumnIdSet],
  );
  const selectedColumnCount = visibleColumns.length;
  const selectableColumnCount = columns.length;

  useEffect(() => {
    if (!columnMenuOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        columnMenuRef.current &&
        !columnMenuRef.current.contains(event.target as Node)
      ) {
        setColumnMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [columnMenuOpen]);

  const activeFilterCount = useMemo(
    () => Object.values(filterValues).filter(hasFilterValue).length,
    [filterValues],
  );

  const processedRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const searchableColumns = columns.filter((column) => column.searchable !== false);

    const searched = normalizedQuery && !manualFiltering
      ? data.filter((row) => {
          const rowSearchValue =
            getSearchValue?.(row) ??
            searchableColumns
              .map((column) => column.searchValue?.(row) ?? column.sortValue?.(row) ?? "")
              .join(" ");

          return rowSearchValue.toLowerCase().includes(normalizedQuery);
        })
      : data;

    const filtered = tableFilters.length && !manualFiltering
      ? searched.filter((row) =>
          tableFilters.every((filter) => {
            const value = filterValues[filter.id] ?? defaultFilterValue(filter);

            if (!hasFilterValue(value)) return true;

            if (filter.type === "select") {
              return String(filter.getValue(row) ?? "") === value;
            }

            if (filter.type === "multi-select") {
              const selectedValues = Array.isArray(value) ? value : [];
              const rowValue = filter.getValue(row);
              const rowValues = Array.isArray(rowValue)
                ? rowValue.map(String)
                : [String(rowValue ?? "")];

              return selectedValues.some((selected) => rowValues.includes(selected));
            }

            if (filter.type === "boolean") {
              if (value === "all") return true;
              return String(Boolean(filter.getValue(row))) === value;
            }

            const range = typeof value === "object" && !Array.isArray(value) ? value : {};
            const rowTime = dateValue(filter.getValue(row));
            if (!rowTime) return false;

            const fromTime = range.from ? dateValue(range.from) : null;
            const toTime = range.to ? dateValue(range.to) : null;

            return (!fromTime || rowTime >= fromTime) && (!toTime || rowTime <= toTime);
          }),
        )
      : searched;

    if (!sort || manualSorting) return filtered;

    const sortColumn = columns.find((column) => column.id === sort.columnId);
    if (!sortColumn?.sortValue) return filtered;

    return [...filtered].sort((firstRow, secondRow) => {
      const first = normalize(sortColumn.sortValue?.(firstRow));
      const second = normalize(sortColumn.sortValue?.(secondRow));
      const result =
        typeof first === "number" && typeof second === "number"
          ? first - second
          : String(first).localeCompare(String(second));

      return sort.direction === "asc" ? result : -result;
    });
  }, [
    columns,
    data,
    filterValues,
    tableFilters,
    getSearchValue,
    manualFiltering,
    manualSorting,
    query,
    sort,
  ]);

  const rowCount = totalCount ?? processedRows.length;
  const totalPages = Math.max(1, Math.ceil(rowCount / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const visibleRows = manualPagination ? processedRows : processedRows.slice(start, start + pageSize);
  const firstRow = rowCount ? start + 1 : 0;
  const lastRow = Math.min(start + pageSize, rowCount);
  const hasActions = Boolean(rowActions || renderRowActions);

  function updateQuery(value: string) {
    if (onQueryChange) {
      onQueryChange(value);
    } else {
      setLocalQuery(value);
    }
    if (!controlledPage) setLocalPage(1);
  }

  function updateSort(column: CrmDataTableColumn<TData>) {
    if (!column.sortable || !column.sortValue) return;

    const nextSort =
      sort?.columnId === column.id
        ? {
            columnId: column.id,
            direction: sort.direction === "asc" ? ("desc" as const) : ("asc" as const),
          }
        : { columnId: column.id, direction: "asc" as const };

    if (onSortChange) {
      onSortChange(nextSort);
    } else {
      setLocalSort(nextSort);
    }
    if (!controlledPage) setLocalPage(1);
  }

  function updateFilter(filterId: string, value: FilterValue) {
    setFilterState({
      key: filterDefaultsKey,
      values: { ...filterValues, [filterId]: value },
    });
    if (!controlledPage) setLocalPage(1);
  }

  function resetFilters() {
    setFilterState({ key: filterDefaultsKey, values: filterDefaults });
    if (!controlledPage) setLocalPage(1);
  }

  function updateVisibleColumns(columnIds: string[]) {
    const normalizedIds = normalizeVisibleColumnIds(columnIds, columns);

    if (onVisibleColumnIdsChange) {
      onVisibleColumnIdsChange(normalizedIds);
    } else {
      setLocalVisibleColumnIds(normalizedIds);
    }
  }

  function toggleColumn(column: CrmDataTableColumn<TData>) {
    if (column.enableHiding === false) return;

    const selectedIds = new Set(normalizedVisibleColumnIds);

    if (selectedIds.has(column.id)) {
      selectedIds.delete(column.id);
    } else {
      selectedIds.add(column.id);
    }

    updateVisibleColumns(
      columns
        .filter((candidate) => selectedIds.has(candidate.id))
        .map((candidate) => candidate.id),
    );
  }

  function resetVisibleColumns() {
    updateVisibleColumns(defaultColumnIds);
  }

  function updatePage(nextPage: number) {
    if (onPageChange) {
      onPageChange(nextPage);
    } else {
      setLocalPage(nextPage);
    }
  }

  function updatePageSize(nextPageSize: number) {
    if (onPageSizeChange) {
      onPageSizeChange(nextPageSize);
    } else {
      setLocalPageSize(nextPageSize);
      setLocalPage(1);
    }
  }

  return (
    <div
      className={cn(
        "max-w-full min-w-0 rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]",
        className,
      )}
    >
      {(title || description) && (
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
          {title ? (
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              {title}
            </h2>
          ) : null}
          {description ? (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
          ) : null}
        </div>
      )}

      <div className="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-gray-800 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-[380px]">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2">
              <svg
                className="fill-gray-500 dark:fill-gray-400"
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
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
              type="search"
              value={query}
              onChange={(event) => updateQuery(event.target.value)}
              placeholder={searchPlaceholder}
              className="dark:bg-dark-900 shadow-theme-xs h-11 w-full rounded-lg border border-gray-300 bg-transparent py-2.5 pl-11 pr-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>

          {tableFilters.length ? (
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
            >
              Filters
              {activeFilterCount ? (
                <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs font-semibold text-white">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {enableColumnSelection ? (
            <div ref={columnMenuRef} className="relative">
              <button
                type="button"
                aria-expanded={columnMenuOpen}
                aria-haspopup="menu"
                onClick={() => setColumnMenuOpen((isOpen) => !isOpen)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
              >
                <TableIcon className="h-4 w-4" />
                {columnSelectionLabel}
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 dark:bg-white/10 dark:text-gray-300">
                  {selectedColumnCount}/{selectableColumnCount}
                </span>
              </button>

              {columnMenuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-950"
                >
                  <div className="mb-2 flex items-center justify-between gap-3 border-b border-gray-100 pb-2 dark:border-gray-800">
                    <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                      Table columns
                    </p>
                    <button
                      type="button"
                      onClick={resetVisibleColumns}
                      className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
                    >
                      Reset
                    </button>
                  </div>

                  <div className="max-h-72 space-y-1 overflow-y-auto">
                    {columns.map((column) => {
                      const checked = visibleColumnIdSet.has(column.id);
                      const locked = column.enableHiding === false;
                      const disabled =
                        locked || (checked && selectedColumnCount <= 1);

                      return (
                        <label
                          key={column.id}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.05]",
                            disabled && "cursor-not-allowed opacity-70",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggleColumn(column)}
                            className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-950"
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {columnLabel(column)}
                          </span>
                          {locked ? (
                            <span className="text-[11px] font-semibold text-gray-400">
                              Fixed
                            </span>
                          ) : null}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <label className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
            Rows
            <select
              value={pageSize}
              onChange={(event) => {
                updatePageSize(Number(event.target.value));
              }}
              className="h-11 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-700 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
            >
              {normalizedPageSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="max-w-full min-w-0 overflow-x-auto overscroll-x-contain">
        <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-white/[0.02]">
            <tr className="text-left">
              {visibleColumns.map((column) => {
                const isSorted = sort?.columnId === column.id;

                return (
                  <th
                    key={column.id}
                    scope="col"
                    style={{ width: column.width }}
                    className={cn("px-5 py-3", column.headerClassName)}
                  >
                    {column.sortable ? (
                      <button
                        type="button"
                        onClick={() => updateSort(column)}
                        className={cn(
                          "inline-flex h-8 w-full items-center gap-2 text-xs font-medium uppercase text-gray-500 hover:text-brand-500 dark:text-gray-400",
                          buttonAlignment(column.align),
                        )}
                      >
                        {column.header}
                        <span className="flex h-4 w-4 items-center justify-center">
                          {isSorted ? (
                            sort.direction === "asc" ? (
                              <ArrowUpIcon className="h-3.5 w-3.5" />
                            ) : (
                              <ArrowDownIcon className="h-3.5 w-3.5" />
                            )
                          ) : null}
                        </span>
                      </button>
                    ) : (
                      <span
                        className={cn(
                          "block text-xs font-medium uppercase text-gray-500 dark:text-gray-400",
                          column.align === "center" && "text-center",
                          column.align === "right" && "text-right",
                        )}
                      >
                        {column.header}
                      </span>
                    )}
                  </th>
                );
              })}
              {hasActions ? (
                <th className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                  Actions
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {visibleRows.length ? (
              visibleRows.map((row) => (
                <tr
                  key={getRowId(row)}
                  className={cn(
                    "text-gray-700 dark:text-gray-300",
                    getRowClassName?.(row),
                  )}
                >
                  {visibleColumns.map((column) => (
                    <td
                      key={column.id}
                      className={cn(
                        "px-5 py-4",
                        column.align === "center" && "text-center",
                        column.align === "right" && "text-right",
                        column.className,
                      )}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                  {hasActions ? (
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {renderRowActions ? renderRowActions(row) : null}
                        {rowActions ? (
                          <CrmDataTableActions
                            actions={typeof rowActions === "function" ? rowActions(row) : rowActions}
                            row={row}
                          />
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={visibleColumns.length + (hasActions ? 1 : 0)}
                  className="px-5 py-12 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  {emptyState ?? "No records match the current table view."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 rounded-b-2xl border-t border-gray-200 bg-gray-50 px-5 py-4 dark:border-gray-800 dark:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {rowCount ? `Showing ${firstRow}-${lastRow} of ${rowCount}` : "No rows to show"}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => updatePage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            aria-label="Previous page"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <span className="flex h-10 min-w-20 items-center justify-center rounded-lg border border-gray-200 px-3 text-sm text-gray-600 dark:border-gray-800 dark:text-gray-400">
            {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => updatePage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            aria-label="Next page"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
          >
            <ChevronLeftIcon className="h-5 w-5 rotate-180" />
          </button>
        </div>
      </div>

      {filtersOpen ? (
        <CrmDataTableFilterPanel
          filterDefaults={filterDefaults}
          filterPanelDescription={filterPanelDescription}
          filterPanelTitle={filterPanelTitle}
          filterValues={filterValues}
          filters={tableFilters}
          onChange={updateFilter}
          onClose={() => setFiltersOpen(false)}
          onReset={resetFilters}
        />
      ) : null}
    </div>
  );
}
