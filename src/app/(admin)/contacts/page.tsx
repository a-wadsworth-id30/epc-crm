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
  defaultContactCategory,
  isContactCategoryValue,
} from "@/lib/contacts/categories";
import {
  normalizeContactCustomFieldOptions,
  serializeContactCustomFieldValue,
} from "@/lib/contacts/custom-fields";
import { requireUser } from "@/lib/auth";
import {
  companyWhereWithAccess,
  contactAccessWhere,
  contactWhereWithAccess,
} from "@/lib/crm-resource-access";
import { prisma } from "@/lib/prisma";
import { getCrmSettings } from "@/lib/settings";
import { contactSearchWhere } from "@/lib/contacts/query";
import ContactImportModal from "@/components/crm-boilerplate/ContactImportModal";

type ContactsPageProps = {
  searchParams?: Promise<{
    direction?: string | string[];
    columns?: string | string[];
    page?: string | string[];
    pageSize?: string | string[];
    q?: string | string[];
    sort?: string | string[];
    category?: string | string[];
    type?: string | string[];
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

function hasContactWhere(
  value: Prisma.ContactWhereInput | undefined,
): value is Prisma.ContactWhereInput {
  return Boolean(value && Object.keys(value).length > 0);
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
        { contactType: { name: direction } },
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
  const requestedPage = parsePositiveInteger(params.page, 1);
  const settings = await getCrmSettings();
  const contactTypes = await prisma.contactType.findMany({
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
  });
  const requestedType = singleParam(params.type);
  const legacyCategory = singleParam(params.category);
  const activeContactType =
    contactTypes.find((contactType) => contactType.slug === requestedType) ??
    (isContactCategoryValue(legacyCategory)
      ? contactTypes.find(
          (contactType) => contactType.systemKey === legacyCategory,
        )
      : null) ??
    null;
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
  const searchWhere = contactSearchWhere(query);
  const contactTypeWhere: Prisma.ContactWhereInput | undefined =
    activeContactType
      ? {
          OR: [
            { contactTypeId: activeContactType.id },
            ...(activeContactType.systemKey
              ? [
                  {
                    contactTypeId: null,
                    category: activeContactType.systemKey,
                  },
                ]
              : []),
          ],
        }
      : undefined;
  const whereFilters = [contactTypeWhere, searchWhere].filter(hasContactWhere);
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
    contactTypeRows,
    customFields,
    companies,
    availableTags,
    addressLookupEnabled,
  ] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.count({ where: allContactsWhere }),
    prisma.contact.groupBy({
      by: ["contactTypeId", "category"],
      where: allContactsWhere,
      _count: { _all: true },
    }),
    prisma.contactTypeField.findMany({
      where: { isActive: true, contactType: { isActive: true } },
      orderBy: [{ displayOrder: "asc" }, { label: "asc" }],
      select: {
        contactTypeId: true,
        displayOrder: true,
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
      },
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
      contactTypeId: true,
      contactType: {
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
      },
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
          <div className="flex flex-wrap items-center gap-2">
            {user.role === "ADMIN" ? (
              <ContactImportModal
                contactTypes={contactTypes.map((type) => ({
                  fields: customFields
                    .filter((field) => field.contactTypeId === type.id)
                    .map((field) => ({
                      ...field,
                      options: normalizeContactCustomFieldOptions(field.options),
                    })),
                  id: type.id,
                  name: type.name,
                  slug: type.slug,
                  systemKey: type.systemKey,
                }))}
              />
            ) : null}
            <DeferredContactCreateModal
              companies={companies}
              companiesEnabled={settings.companiesEnabled}
              contactTypes={contactTypes}
              customFields={customFields.map((field) => ({
                ...field,
                options: normalizeContactCustomFieldOptions(field.options),
              }))}
              availableTags={availableTags}
              addressLookupEnabled={addressLookupEnabled}
            />
          </div>
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
          contactTypeId: contact.contactTypeId,
          contactType:
            contact.contactType ??
            contactTypes.find(
              (contactType) => contactType.systemKey === contact.category,
            ) ??
            null,
          customFieldValues: Object.fromEntries(
            contact.customFieldValues.map((value) => [
              value.fieldId,
              serializeContactCustomFieldValue(value),
            ]),
          ),
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
        activeContactTypeSlug={activeContactType?.slug ?? "all"}
        contactTypes={contactTypes}
        customFields={customFields.map((field) => ({
          ...field,
          options: normalizeContactCustomFieldOptions(field.options),
        }))}
        contactTypeCounts={Object.fromEntries(
          contactTypes.map((contactType) => [
            contactType.id,
            contactTypeRows
              .filter(
                (row) =>
                  row.contactTypeId === contactType.id ||
                  (!row.contactTypeId &&
                    row.category === contactType.systemKey),
              )
              .reduce((total, row) => total + row._count._all, 0),
          ]),
        )}
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
