import type { Prisma } from "@prisma/client";
import { DeferredCompanyCreateModal } from "@/components/crm-boilerplate/CompanyModalLoaders";
import type {
  CompanyRow,
  CompanySortDirection,
  CompanySortKey,
} from "@/components/crm-boilerplate/CompaniesTable";
import LazyCompaniesTable from "@/components/crm-boilerplate/LazyCompaniesTable";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import {
  parseInterfaceDefaults,
  resolveInterfacePageSizeFallback,
} from "@/lib/interface-defaults";
import { isGeoapifyAddressLookupEnabled } from "@/lib/integrations/geoapify";
import {
  parsePageSize,
  parsePositiveInteger,
  singleParam,
} from "@/lib/navigation/pagination";
import { requireUser } from "@/lib/auth";
import { companyWhereWithAccess } from "@/lib/crm-resource-access";
import { prisma } from "@/lib/prisma";
import { getCrmSettings } from "@/lib/settings";

type ClientsPageProps = {
  searchParams?: Promise<{
    direction?: string | string[];
    page?: string | string[];
    pageSize?: string | string[];
    q?: string | string[];
    sort?: string | string[];
  }>;
};

const companyPageSizes = [10, 25, 50, 100];
const defaultCompanyPageSize = 25;
const companySortKeys = [
  "name",
  "domain",
  "status",
  "owner",
  "city",
  "contacts",
  "updatedAt",
] as const satisfies readonly CompanySortKey[];

const companyListSelect = {
  id: true,
  name: true,
  domain: true,
  status: true,
  owner: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  county: true,
  postcode: true,
  country: true,
  updatedAt: true,
  _count: {
    select: {
      contacts: true,
      notes: true,
      opportunities: true,
      tasks: true,
    },
  },
} satisfies Prisma.CompanySelect;

function normalizeSortKey(
  value: string | string[] | undefined,
): CompanySortKey {
  const sort = singleParam(value);

  return companySortKeys.includes(sort as CompanySortKey)
    ? (sort as CompanySortKey)
    : "name";
}

function normalizeSortDirection(
  value: string | string[] | undefined,
): CompanySortDirection {
  return singleParam(value) === "desc" ? "desc" : "asc";
}

function companyOrderBy(
  sortKey: CompanySortKey,
  sortDirection: CompanySortDirection,
): Prisma.CompanyOrderByWithRelationInput {
  if (sortKey === "contacts") {
    return { contacts: { _count: sortDirection } };
  }

  return { [sortKey]: sortDirection };
}

export default async function ClientsPage({ searchParams }: ClientsPageProps) {
  const user = await requireUser();
  const params = (await searchParams) ?? {};
  const settings = await getCrmSettings();
  const interfaceDefaults = parseInterfaceDefaults(settings.interfaceDefaults);
  const requestedPage = parsePositiveInteger(params.page, 1);
  const pageSize = parsePageSize({
    fallback: resolveInterfacePageSizeFallback(
      interfaceDefaults,
      companyPageSizes,
      defaultCompanyPageSize,
    ),
    options: companyPageSizes,
    value: params.pageSize,
  });
  const query = (singleParam(params.q) ?? "").trim();
  const sortKey = normalizeSortKey(params.sort);
  const sortDirection = normalizeSortDirection(params.direction);
  const queryWhere: Prisma.CompanyWhereInput = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { domain: { contains: query, mode: "insensitive" } },
          { status: { contains: query, mode: "insensitive" } },
          { owner: { contains: query, mode: "insensitive" } },
          { addressLine1: { contains: query, mode: "insensitive" } },
          { addressLine2: { contains: query, mode: "insensitive" } },
          { city: { contains: query, mode: "insensitive" } },
          { county: { contains: query, mode: "insensitive" } },
          { postcode: { contains: query, mode: "insensitive" } },
          { country: { contains: query, mode: "insensitive" } },
        ],
      }
    : {};
  const where = companyWhereWithAccess(user, queryWhere);
  const allCompaniesWhere = companyWhereWithAccess(user);
  const [totalCount, allCompanyCount, addressLookupEnabled] = await Promise.all([
    prisma.company.count({ where }),
    prisma.company.count({ where: allCompaniesWhere }),
    isGeoapifyAddressLookupEnabled(),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const companies = await prisma.company.findMany({
    where,
    orderBy: companyOrderBy(sortKey, sortDirection),
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
    select: companyListSelect,
  });
  const companyRows: CompanyRow[] = companies.map((company) => ({
    id: company.id,
    counts: {
      contacts: company._count.contacts,
      notes: company._count.notes,
      opportunities: company._count.opportunities,
      tasks: company._count.tasks,
    },
    domain: company.domain,
    name: company.name,
    owner: company.owner,
    status: company.status,
    addressLine1: company.addressLine1,
    addressLine2: company.addressLine2,
    city: company.city,
    county: company.county,
    postcode: company.postcode,
    country: company.country,
    updatedAt: company.updatedAt.toISOString(),
  }));

  return (
    <>
      <PageHeader
        title="Companies"
        actions={
          <DeferredCompanyCreateModal
            addressLookupEnabled={addressLookupEnabled}
          />
        }
      />
      <LazyCompaniesTable
        addressLookupEnabled={addressLookupEnabled}
        allCompanyCount={allCompanyCount}
        companies={companyRows}
        page={currentPage}
        pageSize={pageSize}
        query={query}
        sortDirection={sortDirection}
        sortKey={sortKey}
        totalCount={totalCount}
      />
    </>
  );
}
