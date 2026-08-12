"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  DeferredCompanyDeleteModal,
  DeferredCompanyEditModal,
} from "@/components/crm-boilerplate/CompanyModalLoaders";
import {
  CrmDataTable,
  type CrmDataTableColumn,
  type CrmDataTableSortDirection,
} from "@/components/crm-boilerplate/data-table";
import EmptyState from "@/components/crm-boilerplate/EmptyState";
import StatusBadge from "@/components/crm-boilerplate/StatusBadge";

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
  addressLookupEnabled: boolean;
  allCompanyCount: number;
  companies: CompanyRow[];
  page: number;
  pageSize: number;
  query: string;
  sortDirection: CompanySortDirection;
  sortKey: CompanySortKey;
  totalCount: number;
};

export default function CompaniesTable({
  addressLookupEnabled,
  allCompanyCount,
  companies,
  page,
  pageSize,
  query,
  sortDirection,
  sortKey,
  totalCount,
}: CompaniesTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [localQuery, setLocalQuery] = useState(query);

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
  ];

  return (
    <CrmDataTable
      data={companies}
      columns={columns}
      getRowId={(company) => company.id}
      searchPlaceholder="Search companies..."
      query={localQuery}
      onQueryChange={setLocalQuery}
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
      manualFiltering
      manualPagination
      manualSorting
      emptyState="No companies match this search."
      renderRowActions={(company) => (
        <>
          <DeferredCompanyEditModal
            addressLookupEnabled={addressLookupEnabled}
            company={company}
          />
          <DeferredCompanyDeleteModal
            companyId={company.id}
            companyName={company.name}
            relatedRecords={company.counts}
          />
        </>
      )}
    />
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
