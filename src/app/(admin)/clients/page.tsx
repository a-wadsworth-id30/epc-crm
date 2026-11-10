import type { Prisma } from "@prisma/client";
import CompanyImportModal from "@/components/crm-boilerplate/CompanyImportModal";
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
import {
  canEditCompanyField,
  visibleCompanyFields,
} from "@/lib/companies/field-access";
import { serializeCompanyCustomFieldValue } from "@/lib/companies/custom-fields";
import {
  companyCustomFieldFiltersWhere,
  parseCompanyCustomFieldFilters,
} from "@/lib/companies/filters";
import { companySearchWhere } from "@/lib/companies/query";
import { searchParamsFromRecord } from "@/lib/contacts/filters";
import { normalizeContactCustomFieldOptions } from "@/lib/contacts/custom-fields";
import { companyWhereWithAccess } from "@/lib/crm-resource-access";
import { prisma } from "@/lib/prisma";
import { getCrmSettings } from "@/lib/settings";

type ClientsPageProps = {
  searchParams?: Promise<{
    [key: string]: string | string[] | undefined;
    direction?: string | string[];
    owner?: string | string[];
    page?: string | string[];
    pageSize?: string | string[];
    q?: string | string[];
    sort?: string | string[];
    status?: string | string[];
    type?: string | string[];
  }>;
};

const companyPageSizes = [10, 25, 50, 100];
const defaultCompanyPageSize = 25;
const companyStatuses = ["Prospect", "Active", "Inactive"] as const;
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
  companyTypeId: true,
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
  customFieldValues: {
    select: {
      booleanValue: true,
      dateValue: true,
      fieldId: true,
      jsonValue: true,
      numberValue: true,
      textValue: true,
    },
  },
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
  const [companyTypes, companyCustomFields] = await Promise.all([
    prisma.companyType.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: {
        colourKey: true,
        description: true,
        iconKey: true,
        id: true,
        isActive: true,
        isDefault: true,
        name: true,
        pluralName: true,
        slug: true,
        systemKey: true,
      },
    }),
    prisma.companyTypeField.findMany({
      where: { isActive: true, companyType: { isActive: true } },
      orderBy: [{ displayOrder: "asc" }, { label: "asc" }],
      select: {
        companyTypeId: true,
        displayOrder: true,
        editRoleTemplates: true,
        externalEditable: true,
        fieldType: true,
        helpText: true,
        id: true,
        isActive: true,
        isSearchable: true,
        key: true,
        label: true,
        options: true,
        placeholder: true,
        requirementMode: true,
        showInTable: true,
        viewRoleTemplates: true,
      },
    }),
  ]);
  const normalizedCompanyCustomFields = visibleCompanyFields(
    companyCustomFields,
    user,
  ).map((field) => ({
    ...field,
    isReadOnly: !canEditCompanyField(field, user),
    options: normalizeContactCustomFieldOptions(field.options),
  }));
  const visibleCompanyCustomFieldIds = new Set(
    normalizedCompanyCustomFields.map((field) => field.id),
  );
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
  const requestedCompanyTypeSlug = singleParam(params.type) ?? "all";
  const activeCompanyType = companyTypes.find(
    (type) => type.slug === requestedCompanyTypeSlug,
  );
  const activeCompanyTypeSlug = activeCompanyType?.slug ?? "all";
  const requestedStatus = singleParam(params.status);
  const status = companyStatuses.includes(
    requestedStatus as (typeof companyStatuses)[number],
  )
    ? requestedStatus ?? ""
    : "";
  const owner = (singleParam(params.owner) ?? "").trim();
  const sortKey = normalizeSortKey(params.sort);
  const sortDirection = normalizeSortDirection(params.direction);
  const filterFields = activeCompanyType
    ? normalizedCompanyCustomFields.filter(
        (field) => field.companyTypeId === activeCompanyType.id,
      )
    : [];
  const customFieldFilterValues = parseCompanyCustomFieldFilters(
    searchParamsFromRecord(params),
    filterFields,
  );
  const customFieldFilterWhere = companyCustomFieldFiltersWhere(
    customFieldFilterValues,
    filterFields,
  );
  const searchWhere = companySearchWhere(
    query,
    normalizedCompanyCustomFields.map((field) => field.id),
  );
  const listFilters: Prisma.CompanyWhereInput[] = [
    ...(activeCompanyType ? [{ companyTypeId: activeCompanyType.id }] : []),
    ...(status ? [{ status }] : []),
    ...(owner
      ? [
          owner === "__unassigned__"
            ? { OR: [{ owner: null }, { owner: "" }] }
            : { owner },
        ]
      : []),
    ...(searchWhere ? [searchWhere] : []),
    ...(customFieldFilterWhere ? [customFieldFilterWhere] : []),
  ];
  const where = companyWhereWithAccess(
    user,
    listFilters.length ? { AND: listFilters } : undefined,
  );
  const allCompaniesWhere = companyWhereWithAccess(user);
  const [
    totalCount,
    allCompanyCount,
    companyTypeRows,
    ownerRows,
    addressLookupEnabled,
  ] = await Promise.all([
    prisma.company.count({ where }),
    prisma.company.count({ where: allCompaniesWhere }),
    prisma.company.groupBy({
      by: ["companyTypeId"],
      where: allCompaniesWhere,
      _count: { _all: true },
    }),
    prisma.company.findMany({
      where: companyWhereWithAccess(user, { owner: { not: null } }),
      distinct: ["owner"],
      orderBy: { owner: "asc" },
      select: { owner: true },
    }),
    isGeoapifyAddressLookupEnabled(),
  ]);
  const companyTypeCounts = Object.fromEntries(
    companyTypeRows.flatMap((row) =>
      row.companyTypeId ? [[row.companyTypeId, row._count._all]] : [],
    ),
  );
  const ownerOptions = ownerRows.flatMap((row) =>
    row.owner?.trim() ? [row.owner.trim()] : [],
  );
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
    companyTypeId: company.companyTypeId,
    customFieldValues: Object.fromEntries(
      company.customFieldValues
        .filter((value) => visibleCompanyCustomFieldIds.has(value.fieldId))
        .map((value) => [
          value.fieldId,
          serializeCompanyCustomFieldValue(value),
        ]),
    ),
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
        description="Manage customers, installer companies, trade partners, suppliers and other organisations."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {user.role === "ADMIN" ? (
              <CompanyImportModal
                companyTypes={companyTypes.map((type) => ({
                  fields: normalizedCompanyCustomFields.filter(
                    (field) => field.companyTypeId === type.id,
                  ),
                  id: type.id,
                  name: type.name,
                  slug: type.slug,
                }))}
              />
            ) : null}
            <DeferredCompanyCreateModal
              addressLookupEnabled={addressLookupEnabled}
              companyTypes={companyTypes}
              customFields={normalizedCompanyCustomFields}
            />
          </div>
        }
      />
      <LazyCompaniesTable
        addressLookupEnabled={addressLookupEnabled}
        allCompanyCount={allCompanyCount}
        activeCompanyTypeSlug={activeCompanyTypeSlug}
        companies={companyRows}
        companyTypes={companyTypes}
        companyTypeCounts={companyTypeCounts}
        customFieldFilterValues={customFieldFilterValues}
        customFields={normalizedCompanyCustomFields}
        ownerFilter={owner}
        ownerOptions={ownerOptions}
        page={currentPage}
        pageSize={pageSize}
        query={query}
        sortDirection={sortDirection}
        sortKey={sortKey}
        statusFilter={status}
        totalCount={totalCount}
      />
    </>
  );
}
