import type { Prisma } from "@prisma/client";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import { DeferredContactCreateModal } from "@/components/crm-boilerplate/ContactModalLoaders";
import ContactsTable from "@/components/crm-boilerplate/LazyContactsTable";
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
import {
  normalizeContactEmailMethods,
  normalizeContactPhoneMethods,
} from "@/lib/contact-methods";
import {
  contactCategoryOptions,
  contactCategoryValues,
  defaultContactCategory,
  isContactCategoryValue,
  type ContactCategoryValue,
} from "@/lib/contacts/categories";
import { requireUser } from "@/lib/auth";
import {
  companyWhereWithAccess,
  contactAccessWhere,
  contactWhereWithAccess,
} from "@/lib/crm-resource-access";
import { prisma } from "@/lib/prisma";
import { getCrmSettings } from "@/lib/settings";

type ContactsPageProps = {
  searchParams?: Promise<{
    direction?: string | string[];
    columns?: string | string[];
    page?: string | string[];
    pageSize?: string | string[];
    q?: string | string[];
    sort?: string | string[];
    category?: string | string[];
  }>;
};

const contactPageSizes = [10, 25, 50, 100];
const defaultContactPageSize = 25;
const contactSortKeys = [
  "name",
  "company",
  "category",
  "source",
  "role",
  "email",
  "phone",
  "address",
] as const;
type ContactSortKey = (typeof contactSortKeys)[number];
type SortDirection = "asc" | "desc";
type ContactCategoryFilter = "all" | ContactCategoryValue;

function parseSortKey(value: string | string[] | undefined): ContactSortKey {
  const parsed = singleParam(value);
  return parsed && contactSortKeys.includes(parsed as ContactSortKey)
    ? (parsed as ContactSortKey)
    : "name";
}

function parseSortDirection(
  value: string | string[] | undefined,
): SortDirection {
  return singleParam(value) === "desc" ? "desc" : "asc";
}

function parseCategoryFilter(
  value: string | string[] | undefined,
): ContactCategoryFilter {
  const parsed = singleParam(value);
  return isContactCategoryValue(parsed) ? parsed : "all";
}

function contains(term: string) {
  return { contains: term, mode: "insensitive" as const };
}

function hasContactWhere(
  value: Prisma.ContactWhereInput | undefined,
): value is Prisma.ContactWhereInput {
  return Boolean(value && Object.keys(value).length > 0);
}

function contactWhere(query: string): Prisma.ContactWhereInput | undefined {
  const terms = query
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);

  if (!terms.length) {
    return undefined;
  }

  return {
    AND: terms.map((term) => {
      const normalizedTerm = term.toLowerCase();
      const matchingCategories = contactCategoryOptions
        .filter(
          (option) =>
            option.value.toLowerCase().includes(normalizedTerm) ||
            option.label.toLowerCase().includes(normalizedTerm) ||
            option.pluralLabel.toLowerCase().includes(normalizedTerm),
        )
        .map((option) => option.value);

      return {
        OR: [
          { firstName: contains(term) },
          { lastName: contains(term) },
          { email: contains(term) },
          { phone: contains(term) },
          { additionalEmails: { some: { email: contains(term) } } },
          { additionalPhones: { some: { phone: contains(term) } } },
          { additionalPhones: { some: { phoneNormalized: contains(term) } } },
          { leadSource: contains(term) },
          { role: contains(term) },
          { addressLine1: contains(term) },
          { addressLine2: contains(term) },
          { city: contains(term) },
          { county: contains(term) },
          { postcode: contains(term) },
          { country: contains(term) },
          { companyName: contains(term) },
          { company: { name: contains(term) } },
          { company: { addressLine1: contains(term) } },
          { company: { addressLine2: contains(term) } },
          { company: { city: contains(term) } },
          { company: { county: contains(term) } },
          { company: { postcode: contains(term) } },
          { company: { country: contains(term) } },
          { tagAssignments: { some: { tag: { name: contains(term) } } } },
          ...(matchingCategories.length
            ? [{ category: { in: matchingCategories } }]
            : []),
        ],
      };
    }),
  };
}

function contactOrderBy(
  sortKey: ContactSortKey,
  direction: SortDirection,
): Prisma.ContactOrderByWithRelationInput[] {
  switch (sortKey) {
    case "company":
      return [
        { companyName: direction },
        { lastName: "asc" },
        { firstName: "asc" },
      ];
    case "category":
      return [
        { category: direction },
        { lastName: "asc" },
        { firstName: "asc" },
      ];
    case "role":
      return [{ role: direction }, { lastName: "asc" }, { firstName: "asc" }];
    case "source":
      return [
        { leadSource: direction },
        { lastName: "asc" },
        { firstName: "asc" },
      ];
    case "email":
      return [{ email: direction }, { lastName: "asc" }, { firstName: "asc" }];
    case "phone":
      return [{ phone: direction }, { lastName: "asc" }, { firstName: "asc" }];
    case "address":
      return [
        { addressLine1: direction },
        { city: direction },
        { postcode: direction },
        { lastName: "asc" },
        { firstName: "asc" },
      ];
    case "name":
      return [{ lastName: direction }, { firstName: direction }];
  }
}

export default async function ContactsPage({
  searchParams,
}: ContactsPageProps) {
  const user = await requireUser();
  const params = (await searchParams) ?? {};
  const query = (singleParam(params.q) ?? "").trim();
  const sortKey = parseSortKey(params.sort);
  const sortDirection = parseSortDirection(params.direction);
  const activeCategory = parseCategoryFilter(params.category);
  const requestedPage = parsePositiveInteger(params.page, 1);
  const settings = await getCrmSettings();
  const interfaceDefaults = parseInterfaceDefaults(settings.interfaceDefaults);
  const pageSize = parsePageSize({
    fallback: resolveInterfacePageSizeFallback(
      interfaceDefaults,
      contactPageSizes,
      defaultContactPageSize,
    ),
    options: contactPageSizes,
    value: params.pageSize,
  });
  const searchWhere = contactWhere(query);
  const categoryWhere: Prisma.ContactWhereInput | undefined =
    activeCategory === "all" ? undefined : { category: activeCategory };
  const whereFilters = [categoryWhere, searchWhere].filter(hasContactWhere);
  const where = contactWhereWithAccess(
    user,
    whereFilters.length ? { AND: whereFilters } : undefined,
  );
  const allContactsWhere = contactWhereWithAccess(user);
  const contactTagsWhere: Prisma.ContactTagWhereInput =
    user.role === "ADMIN"
      ? {}
      : { assignments: { some: { contact: contactAccessWhere(user) } } };
  const [
    totalCount,
    allContactCount,
    categoryRows,
    companies,
    availableTags,
    addressLookupEnabled,
  ] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.count({ where: allContactsWhere }),
    prisma.contact.groupBy({
      by: ["category"],
      where: allContactsWhere,
      _count: { _all: true },
    }),
    settings.companiesEnabled
      ? prisma.company.findMany({
          where: companyWhereWithAccess(user),
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    prisma.contactTag.findMany({
      where: contactTagsWhere,
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    isGeoapifyAddressLookupEnabled(),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const contacts = await prisma.contact.findMany({
    where,
    orderBy: contactOrderBy(sortKey, sortDirection),
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
    select: {
      additionalEmails: {
        orderBy: { createdAt: "asc" },
        select: { email: true, id: true, label: true },
      },
      additionalPhones: {
        orderBy: { createdAt: "asc" },
        select: { id: true, label: true, phone: true, phoneNormalized: true },
      },
      addressLine1: true,
      addressLine2: true,
      city: true,
      companyId: true,
      companyName: true,
      country: true,
      county: true,
      email: true,
      firstName: true,
      id: true,
      lastName: true,
      category: true,
      leadSource: true,
      phone: true,
      postcode: true,
      role: true,
      company: {
        select: {
          addressLine1: true,
          addressLine2: true,
          city: true,
          country: true,
          county: true,
          name: true,
          postcode: true,
        },
      },
      tagAssignments: {
        orderBy: { tag: { name: "asc" } },
        select: {
          tag: {
            select: { id: true, name: true },
          },
        },
      },
    },
  });

  return (
    <>
      <PageHeader
        title="People"
        description="Manage consumers, trade contacts, installers and company-type people."
        actions={
          <DeferredContactCreateModal
            companies={companies}
            companiesEnabled={settings.companiesEnabled}
            availableTags={availableTags}
            addressLookupEnabled={addressLookupEnabled}
          />
        }
      />
      <ContactsTable
        addressLookupEnabled={addressLookupEnabled}
        companies={companies}
        companiesEnabled={settings.companiesEnabled}
        availableTags={availableTags}
        allContactCount={allContactCount}
        contacts={contacts.map((contact) => ({
          id: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          phone: contact.phone,
          category: contact.category ?? defaultContactCategory,
          additionalEmails: normalizeContactEmailMethods(
            contact.additionalEmails,
            contact.email,
          ),
          additionalPhones: normalizeContactPhoneMethods(
            contact.additionalPhones,
            contact.phone,
          ),
          leadSource: contact.leadSource,
          role: contact.role,
          addressLine1: contact.addressLine1,
          addressLine2: contact.addressLine2,
          city: contact.city,
          county: contact.county,
          postcode: contact.postcode,
          country: contact.country,
          companyId: contact.companyId,
          companyName: contact.company?.name ?? contact.companyName ?? null,
          companyAddressLine1: contact.company?.addressLine1 ?? null,
          companyAddressLine2: contact.company?.addressLine2 ?? null,
          companyCity: contact.company?.city ?? null,
          companyCounty: contact.company?.county ?? null,
          companyPostcode: contact.company?.postcode ?? null,
          companyCountry: contact.company?.country ?? null,
          tags: contact.tagAssignments.map((assignment) => ({
            id: assignment.tag.id,
            name: assignment.tag.name,
          })),
        }))}
        activeCategory={activeCategory}
        categoryCounts={
          Object.fromEntries(
            contactCategoryValues.map((category) => [
              category,
              categoryRows.find((row) => row.category === category)?._count
                ._all ?? 0,
            ]),
          ) as Record<ContactCategoryValue, number>
        }
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
