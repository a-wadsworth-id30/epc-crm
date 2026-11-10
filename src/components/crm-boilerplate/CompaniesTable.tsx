"use client";

import Link from "next/link";
import { Download } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  DeferredCompanyDeleteModal,
  DeferredCompanyEditModal,
} from "@/components/crm-boilerplate/CompanyModalLoaders";
import {
  CrmDataTable,
  type CrmDataTableColumn,
  type CrmDataTableFilter,
  type CrmDataTableSortDirection,
  type FilterValue,
} from "@/components/crm-boilerplate/data-table";
import EmptyState from "@/components/crm-boilerplate/EmptyState";
import StatusBadge from "@/components/crm-boilerplate/StatusBadge";
import type {
  CompanyCustomFieldDefinition,
  CompanyCustomFieldFormValue,
} from "@/lib/companies/custom-fields";
import type { CompanyTypeOption } from "@/lib/companies/company-types";
import {
  isStructuredCompanyFilterField,
  writeCompanyCustomFieldFilterParams,
  type CompanyCustomFieldFilterValues,
} from "@/lib/companies/filters";
import {
  companyCustomFieldDisplayValue,
  companyCustomTableColumnId,
  companyTableColumnIds,
  companyTableCustomFields,
  parseVisibleCompanyColumnIds,
} from "@/lib/companies/table-columns";

export type CompanySortKey =
  | "contacts"
  | "city"
  | "domain"
  | "name"
  | "owner"
  | "status"
  | "updatedAt";
export type CompanySortDirection = "asc" | "desc";

export type CompanyRow = {
  id: string;
  companyTypeId: string | null;
  customFieldValues: Record<string, CompanyCustomFieldFormValue>;
  name: string;
  domain: string | null;
  status: string;
  owner: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  county: string | null;
  postcode: string | null;
  country: string | null;
  updatedAt: string;
  counts: {
    contacts: number;
    notes: number;
    opportunities: number;
    tasks: number;
  };
};

const pageSizes = [10, 25, 50, 100];

export type CompaniesTableProps = {
  activeCompanyTypeSlug: string;
  addressLookupEnabled: boolean;
  allCompanyCount: number;
  companies: CompanyRow[];
  companyTypes: CompanyTypeOption[];
  companyTypeCounts: Record<string, number>;
  customFieldFilterValues: CompanyCustomFieldFilterValues;
  customFields: CompanyCustomFieldDefinition[];
  ownerFilter: string;
  ownerOptions: string[];
  page: number;
  pageSize: number;
  query: string;
  sortDirection: CompanySortDirection;
  sortKey: CompanySortKey;
  statusFilter: string;
  totalCount: number;
};

export default function CompaniesTable({
  activeCompanyTypeSlug,
  addressLookupEnabled,
  allCompanyCount,
  companies,
  companyTypes,
  companyTypeCounts,
  customFieldFilterValues,
  customFields,
  ownerFilter,
  ownerOptions,
  page,
  pageSize,
  query,
  sortDirection,
  sortKey,
  statusFilter,
  totalCount,
}: CompaniesTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [localQuery, setLocalQuery] = useState(query);
  const activeCompanyType = companyTypes.find(
    (type) => type.slug === activeCompanyTypeSlug,
  );
  const tableCustomFields = companyTableCustomFields({
    activeCompanyTypeId: activeCompanyType?.id ?? null,
    fields: customFields,
  });
  const availableColumnIds = companyTableColumnIds(tableCustomFields);
  const visibleColumnIds = parseVisibleCompanyColumnIds({
    availableColumnIds,
    value: searchParams.get("columns"),
  });

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(updates).forEach(([key, value]) => {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      });

      const nextUrl = params.toString() ? `${pathname}?${params}` : pathname;
      router.push(nextUrl);
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    setLocalQuery(query);
  }, [query]);

  useEffect(() => {
    if (localQuery === query) return;

    const timer = window.setTimeout(() => {
      updateParams({ page: null, q: localQuery.trim() || null });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [localQuery, query, updateParams]);

  const filterableCustomFields = customFields.filter(
    (field) =>
      Boolean(activeCompanyType) &&
      isStructuredCompanyFilterField(field) &&
      field.companyTypeId === activeCompanyType?.id,
  );
  const exportParams = new URLSearchParams();
  if (query) exportParams.set("q", query);
  if (activeCompanyTypeSlug !== "all") {
    exportParams.set("type", activeCompanyTypeSlug);
  }
  if (statusFilter) exportParams.set("status", statusFilter);
  if (ownerFilter) exportParams.set("owner", ownerFilter);
  searchParams.forEach((value, key) => {
    if (key.startsWith("companyField.")) exportParams.append(key, value);
  });
  const exportHref = `/api/companies/export${exportParams.size ? `?${exportParams}` : ""}`;
  const filters: CrmDataTableFilter<CompanyRow>[] = [
    {
      id: "status",
      label: "Lifecycle status",
      type: "select",
      options: ["Prospect", "Active", "Inactive"].map((value) => ({
        label: value,
        value,
      })),
      defaultValue: statusFilter,
      getValue: (company) => company.status,
    },
    {
      id: "owner",
      label: "Owner",
      type: "select",
      options: [
        { label: "Unassigned", value: "__unassigned__" },
        ...ownerOptions.map((value) => ({ label: value, value })),
      ],
      defaultValue: ownerFilter,
      getValue: (company) => company.owner ?? "__unassigned__",
    },
    ...filterableCustomFields.map((field): CrmDataTableFilter<CompanyRow> => {
      const common = {
        id: field.id,
        label:
          activeCompanyType?.id === field.companyTypeId
            ? field.label
            : `${companyTypes.find((type) => type.id === field.companyTypeId)?.name ?? "Company"}: ${field.label}`,
      };
      if (field.fieldType === "BOOLEAN") {
        const value = customFieldFilterValues[field.id];
        return {
          ...common,
          type: "boolean",
          defaultValue:
            value === "true" || value === "false" ? value : "all",
          getValue: (company) => {
            const fieldValue = company.customFieldValues[field.id];
            return typeof fieldValue === "boolean" ? fieldValue : null;
          },
        };
      }
      if (field.fieldType === "DATE") {
        const value = customFieldFilterValues[field.id];
        return {
          ...common,
          type: "date-range",
          defaultValue:
            value && typeof value === "object" && !Array.isArray(value)
              ? value
              : {},
          getValue: (company) => {
            const fieldValue = company.customFieldValues[field.id];
            return typeof fieldValue === "string" ? fieldValue : null;
          },
        };
      }
      const options = field.options.map((value) => ({
        label: value,
        value,
      }));
      if (field.fieldType === "MULTI_SELECT") {
        const value = customFieldFilterValues[field.id];
        return {
          ...common,
          type: "multi-select",
          options,
          defaultValue: Array.isArray(value) ? value : [],
          getValue: (company) => {
            const fieldValue = company.customFieldValues[field.id];
            return Array.isArray(fieldValue) ? fieldValue : null;
          },
        };
      }
      const value = customFieldFilterValues[field.id];
      return {
        ...common,
        type: "select",
        options,
        defaultValue: typeof value === "string" ? value : "",
        getValue: (company) => {
          const fieldValue = company.customFieldValues[field.id];
          return typeof fieldValue === "string" ? fieldValue : null;
        },
      };
    }),
  ];

  function selectCompanyType(companyTypeSlug: string) {
    const params = new URLSearchParams(searchParams.toString());
    writeCompanyCustomFieldFilterParams(params, {});
    params.delete("columns");
    params.delete("page");
    if (companyTypeSlug === "all") params.delete("type");
    else params.set("type", companyTypeSlug);
    router.push(params.toString() ? `${pathname}?${params}` : pathname);
  }

  function updateFilters(values: Record<string, FilterValue>) {
    const params = new URLSearchParams(searchParams.toString());
    const statusValue = values.status;
    const ownerValue = values.owner;
    if (typeof statusValue === "string" && statusValue) {
      params.set("status", statusValue);
    } else {
      params.delete("status");
    }
    if (typeof ownerValue === "string" && ownerValue) {
      params.set("owner", ownerValue);
    } else {
      params.delete("owner");
    }
    const customValues = Object.fromEntries(
      filterableCustomFields.flatMap((field) =>
        values[field.id] === undefined ? [] : [[field.id, values[field.id]]],
      ),
    ) as CompanyCustomFieldFilterValues;
    writeCompanyCustomFieldFilterParams(params, customValues);
    params.delete("page");
    router.push(params.toString() ? `${pathname}?${params}` : pathname);
  }

  if (!allCompanyCount) {
    return (
      <EmptyState
        title="No companies yet"
        description="Use Add company to create the first account-level company record."
      />
    );
  }

  const columns: CrmDataTableColumn<CompanyRow>[] = [
    {
      id: "name",
      header: "Company",
      sortable: true,
      sortValue: (company) => company.name,
      cell: (company) => (
        <div>
          <Link
            href={`/clients/${company.id}`}
            className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
          >
            {company.name}
          </Link>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Updated {formatDate(company.updatedAt)}
          </p>
        </div>
      ),
    },
    {
      id: "type",
      header: "Type",
      cell: (company) => (
        <StatusBadge>
          {companyTypes.find((type) => type.id === company.companyTypeId)?.name ??
            "Other"}
        </StatusBadge>
      ),
    },
    {
      id: "domain",
      header: "Domain",
      sortable: true,
      sortValue: (company) => company.domain ?? "",
      cell: (company) =>
        company.domain ?? <span className="text-gray-400">None</span>,
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      sortValue: (company) => company.status,
      cell: (company) => <StatusBadge>{company.status}</StatusBadge>,
    },
    {
      id: "owner",
      header: "Owner",
      sortable: true,
      sortValue: (company) => company.owner ?? "",
      cell: (company) =>
        company.owner ?? <span className="text-gray-400">Unassigned</span>,
    },
    {
      id: "city",
      header: "Location",
      sortable: true,
      sortValue: (company) => company.city ?? company.postcode ?? "",
      cell: (company) => {
        const location = [company.city, company.county, company.postcode]
          .filter(Boolean)
          .join(", ");

        return location || <span className="text-gray-400">None</span>;
      },
    },
    {
      id: "contacts",
      header: "Contacts",
      sortable: true,
      align: "center",
      sortValue: (company) => company.counts.contacts,
      cell: (company) => company.counts.contacts,
    },
    {
      id: "activity",
      header: "Activity",
      cell: (company) => (
        <span className="text-sm text-gray-600 dark:text-gray-300">
          {company.counts.opportunities} sales / {company.counts.tasks} tasks /{" "}
          {company.counts.notes} notes
        </span>
      ),
    },
    ...tableCustomFields.map(
      (field): CrmDataTableColumn<CompanyRow> => ({
        id: companyCustomTableColumnId(field.id),
        header: field.label,
        visibilityLabel:
          activeCompanyType?.id === field.companyTypeId
            ? field.label
            : `${companyTypes.find((type) => type.id === field.companyTypeId)?.name ?? "Company"}: ${field.label}`,
        cell: (company) => {
          const displayValue = companyCustomFieldDisplayValue(
            company.customFieldValues[field.id],
          );
          return (
            <span
              className={
                displayValue === "Not set"
                  ? "text-gray-400"
                  : "block max-w-72 truncate"
              }
              title={displayValue === "Not set" ? undefined : displayValue}
            >
              {displayValue}
            </span>
          );
        },
      }),
    ),
  ];

  return (
    <div className="space-y-5">
      <CompanyTypeOverview
        activeCompanyTypeSlug={activeCompanyTypeSlug}
        allCompanyCount={allCompanyCount}
        companyTypeCounts={companyTypeCounts}
        companyTypes={companyTypes}
        onSelect={selectCompanyType}
      />
      <CrmDataTable
        data={companies}
        columns={columns}
        getRowId={(company) => company.id}
        title={
          activeCompanyType
            ? `${activeCompanyType.pluralName} (${totalCount})`
            : `All Companies (${totalCount})`
        }
        searchPlaceholder="Search companies..."
        toolbarActions={
          <a
            href={exportHref}
            title="Export the current Company search and filters, up to 5,000 companies"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </a>
        }
        query={localQuery}
        onQueryChange={setLocalQuery}
        filters={filters}
        filterValues={{
          status: statusFilter,
          owner: ownerFilter,
          ...customFieldFilterValues,
        }}
        onFilterValuesChange={updateFilters}
        filterPanelTitle="Company filters"
        filterPanelDescription="Filter lifecycle, ownership and structured fields without crowding the Company list."
        sort={{ columnId: sortKey, direction: sortDirection }}
        onSortChange={(nextSort) => {
          const nextKey = nextSort.columnId as CompanySortKey;
          const nextDirection = nextSort.direction as CrmDataTableSortDirection;
          const isDefault = nextKey === "name" && nextDirection === "asc";

          updateParams({
            direction: isDefault ? null : nextDirection,
            page: null,
            sort: isDefault ? null : nextKey,
          });
        }}
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        onPageChange={(nextPage) =>
          updateParams({ page: nextPage > 1 ? String(nextPage) : null })
        }
        onPageSizeChange={(nextPageSize) =>
          updateParams({ page: null, pageSize: String(nextPageSize) })
        }
        pageSizeOptions={pageSizes}
        enableColumnSelection
        visibleColumnIds={visibleColumnIds}
        onVisibleColumnIdsChange={(columnIds) =>
          updateParams({
            columns:
              columnIds.length === availableColumnIds.length
                ? null
                : columnIds.join(","),
          })
        }
        manualFiltering
        manualPagination
        manualSorting
        emptyState="No companies match this search."
        renderRowActions={(company) => (
          <>
            <DeferredCompanyEditModal
              addressLookupEnabled={addressLookupEnabled}
              company={company}
              companyTypes={companyTypes}
              customFields={customFields}
            />
            <DeferredCompanyDeleteModal
              companyId={company.id}
              companyName={company.name}
              relatedRecords={company.counts}
            />
          </>
        )}
      />
    </div>
  );
}

const countClassByColour: Record<string, string> = {
  gray: "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300",
  success:
    "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300",
  blue: "bg-blue-light-50 text-blue-light-700 dark:bg-blue-light-500/15 dark:text-blue-light-300",
  purple:
    "bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
  orange:
    "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
};

function CompanyTypeOverview({
  activeCompanyTypeSlug,
  allCompanyCount,
  companyTypeCounts,
  companyTypes,
  onSelect,
}: {
  activeCompanyTypeSlug: string;
  allCompanyCount: number;
  companyTypeCounts: Record<string, number>;
  companyTypes: CompanyTypeOption[];
  onSelect: (companyTypeSlug: string) => void;
}) {
  const tabs = [
    {
      count: allCompanyCount,
      countClassName: countClassByColour.gray,
      label: "All Companies",
      value: "all",
    },
    ...companyTypes.map((type) => ({
      count: companyTypeCounts[type.id] ?? 0,
      countClassName:
        countClassByColour[type.colourKey] ?? countClassByColour.gray,
      label: type.name,
      value: type.slug,
    })),
  ];

  return (
    <section aria-label="Filter companies by type">
      <div className="max-w-full overflow-x-auto pb-1 overscroll-x-contain">
        <div className="flex min-w-max items-center gap-2">
          {tabs.map((tab) => {
            const selected = activeCompanyTypeSlug === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => onSelect(tab.value)}
                aria-pressed={selected}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold shadow-theme-xs transition focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:outline-none dark:focus-visible:ring-offset-gray-900 ${
                  selected
                    ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-white"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                    selected
                      ? "bg-brand-100 text-brand-700 dark:bg-brand-500/25 dark:text-brand-200"
                      : tab.countClassName
                  }`}
                  aria-label={`${tab.count} companies`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
