import type { Prisma } from "@prisma/client";
import { requireApiUser } from "@/lib/api-auth";
import {
  normalizeContactCustomFieldOptions,
} from "@/lib/contacts/custom-fields";
import {
  serializeCompanyCustomFieldValue,
} from "@/lib/companies/custom-fields";
import { visibleCompanyFields } from "@/lib/companies/field-access";
import {
  companyCustomFieldFiltersWhere,
  parseCompanyCustomFieldFilters,
} from "@/lib/companies/filters";
import { companySearchWhere } from "@/lib/companies/query";
import { companyWhereWithAccess } from "@/lib/crm-resource-access";
import { toCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";

const exportLimit = 5_000;
const companyStatuses = ["Prospect", "Active", "Inactive"];

function displayCustomValue(
  value: ReturnType<typeof serializeCompanyCustomFieldValue>,
) {
  if (Array.isArray(value)) return value.join(" | ");
  if (value === true) return "Yes";
  if (value === false) return "No";
  return value ?? "";
}

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const user = auth.user;
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const typeSlug = (url.searchParams.get("type") ?? "").trim();
  const status = (url.searchParams.get("status") ?? "").trim();
  const owner = (url.searchParams.get("owner") ?? "").trim();
  if (status && !companyStatuses.includes(status)) {
    return Response.json({ error: "That lifecycle status is not available." }, { status: 400 });
  }

  const selectedType = typeSlug
    ? await prisma.companyType.findFirst({
        where: { isActive: true, slug: typeSlug },
        select: { id: true, name: true },
      })
    : null;
  if (typeSlug && !selectedType) {
    return Response.json({ error: "That Company Type is not available." }, { status: 400 });
  }

  const availableFields = await prisma.companyTypeField.findMany({
    where: {
      isActive: true,
      companyType: { isActive: true },
      ...(selectedType ? { companyTypeId: selectedType.id } : {}),
    },
    orderBy: [
      { companyType: { displayOrder: "asc" } },
      { displayOrder: "asc" },
      { label: "asc" },
    ],
    select: {
      companyType: { select: { name: true } },
      companyTypeId: true,
      displayOrder: true,
      editRoleTemplates: true,
      fieldType: true,
      id: true,
      isSearchable: true,
      label: true,
      options: true,
      viewRoleTemplates: true,
    },
  });
  const visibleFields = visibleCompanyFields(availableFields, user);
  const filterFields = visibleFields.map((field) => ({
    ...field,
    options: normalizeContactCustomFieldOptions(field.options),
  }));
  const customFieldFilterValues = parseCompanyCustomFieldFilters(
    url.searchParams,
    selectedType ? filterFields : [],
  );
  const customFieldFilterWhere = companyCustomFieldFiltersWhere(
    customFieldFilterValues,
    selectedType ? filterFields : [],
  );
  const filters: Prisma.CompanyWhereInput[] = [
    ...(selectedType ? [{ companyTypeId: selectedType.id }] : []),
    ...(status ? [{ status }] : []),
    ...(owner
      ? [owner === "__unassigned__" ? { OR: [{ owner: null }, { owner: "" }] } : { owner }]
      : []),
  ];
  const searchWhere = companySearchWhere(
    query,
    visibleFields.map((field) => field.id),
  );
  if (searchWhere) filters.push(searchWhere);
  if (customFieldFilterWhere) filters.push(customFieldFilterWhere);
  const where = companyWhereWithAccess(
    user,
    filters.length ? { AND: filters } : undefined,
  );

  const companies = await prisma.company.findMany({
    where,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: exportLimit,
    select: {
      _count: { select: { contacts: true } },
      addressLine1: true,
      addressLine2: true,
      city: true,
      companyType: { select: { name: true } },
      country: true,
      county: true,
      createdAt: true,
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
      domain: true,
      name: true,
      owner: true,
      postcode: true,
      status: true,
      updatedAt: true,
    },
  });
  const includeTypeInFieldLabel = !selectedType;
  const rows: unknown[][] = [
    [
      "Company type",
      "Name",
      "Domain",
      "Lifecycle status",
      "Owner",
      "Address line 1",
      "Address line 2",
      "City",
      "County",
      "Postcode",
      "Country",
      "Linked people",
      "Created at",
      "Updated at",
      ...visibleFields.map((field) =>
        includeTypeInFieldLabel
          ? `${field.companyType.name}: ${field.label}`
          : field.label,
      ),
    ],
    ...companies.map((company) => {
      const values = new Map(
        company.customFieldValues.map((value) => [
          value.fieldId,
          displayCustomValue(serializeCompanyCustomFieldValue(value)),
        ]),
      );
      return [
        company.companyType?.name ?? "Unassigned",
        company.name,
        company.domain ?? "",
        company.status,
        company.owner ?? "",
        company.addressLine1 ?? "",
        company.addressLine2 ?? "",
        company.city ?? "",
        company.county ?? "",
        company.postcode ?? "",
        company.country ?? "",
        company._count.contacts,
        company.createdAt.toISOString(),
        company.updatedAt.toISOString(),
        ...visibleFields.map((field) => values.get(field.id) ?? ""),
      ];
    }),
  ];

  await prisma.auditLog.create({
    data: {
      action: "companies.exported",
      actorId: user.id,
      entity: "Company",
      metadata: {
        customFieldFilterCount: Object.keys(customFieldFilterValues).length,
        exportedCount: companies.length,
        limit: exportLimit,
        ownerApplied: Boolean(owner),
        queryApplied: Boolean(query),
        statusApplied: Boolean(status),
        typeId: selectedType?.id ?? null,
      },
    },
  });

  return new Response(toCsv(rows), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="companies-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
      "X-Export-Limit": String(exportLimit),
      "X-Export-Row-Count": String(companies.length),
    },
  });
}
