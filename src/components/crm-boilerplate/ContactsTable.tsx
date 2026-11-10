"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  BriefcaseBusiness,
  Building2,
  Download,
  UserRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import {
  DeferredContactDeleteModal,
  DeferredContactEditModal,
} from "@/components/crm-boilerplate/ContactModalLoaders";
import type { ContactTagOption } from "@/components/crm-boilerplate/ContactTagInput";
import {
  CrmDataTable,
  type CrmDataTableColumn,
  type CrmDataTableFilter,
  type CrmDataTableSortDirection,
  type FilterValue,
} from "@/components/crm-boilerplate/data-table";
import EmptyState from "@/components/crm-boilerplate/EmptyState";
import ContactProfileCompleteness from "@/components/crm-boilerplate/ContactProfileCompleteness";
import { PhoneIcon } from "@/components/crm-boilerplate/SoftphoneIcons";
import type {
  ContactEmailMethod,
  ContactPhoneMethod,
} from "@/lib/contact-methods";
import {
  type ContactCategoryValue,
} from "@/lib/contacts/categories";
import type { ContactTypeOption } from "@/lib/contacts/contact-types";
import type {
  ContactCustomFieldDefinition,
  ContactCustomFieldFormValue,
} from "@/lib/contacts/custom-fields";
import { contactProfileCompleteness } from "@/lib/contacts/profile-completeness";
import {
  isStructuredContactFilterField,
  writeContactCustomFieldFilterParams,
  type ContactCustomFieldFilterValues,
} from "@/lib/contacts/filters";
import {
  contactCustomFieldDisplayValue,
  contactCustomTableColumnId,
  contactTableColumnIds,
  contactTableCustomFields,
  defaultVisibleContactColumnIds,
  parseVisibleContactColumnIds,
  serializeVisibleContactColumnIds,
} from "@/lib/contacts/table-columns";
import { triggerSoftphoneDial } from "@/lib/telephony/softphone-dial";

type CompanyOption = {
  id: string;
  name: string;
};

type ContactRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  additionalEmails: ContactEmailMethod[];
  additionalPhones: ContactPhoneMethod[];
  category: ContactCategoryValue;
  contactTypeId: string | null;
  contactType: ContactTypeOption | null;
  customFieldValues: Record<string, ContactCustomFieldFormValue>;
  leadSource: string | null;
  role: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  county: string | null;
  postcode: string | null;
  country: string | null;
  companyId: string | null;
  companyName: string | null;
  companyAddressLine1: string | null;
  companyAddressLine2: string | null;
  companyCity: string | null;
  companyCounty: string | null;
  companyPostcode: string | null;
  companyCountry: string | null;
  tags: ContactTagOption[];
};

type SortKey =
  | "name"
  | "company"
  | "category"
  | "source"
  | "role"
  | "email"
  | "phone"
  | "address";
type SortDirection = "asc" | "desc";

const pageSizes = [10, 25, 50, 100];

function contactName(contact: ContactRow) {
  return `${contact.firstName} ${contact.lastName}`.trim();
}

function contactAddress(contact: ContactRow) {
  return [
    contact.addressLine1,
    contact.addressLine2,
    contact.city,
    contact.county,
    contact.postcode,
    contact.country,
  ]
    .filter(Boolean)
    .join(", ");
}

function companyAddress(contact: ContactRow) {
  return [
    contact.companyAddressLine1,
    contact.companyAddressLine2,
    contact.companyCity,
    contact.companyCounty,
    contact.companyPostcode,
    contact.companyCountry,
  ]
    .filter(Boolean)
    .join(", ");
}

export default function ContactsTable({
  addressLookupEnabled,
  activeContactTypeSlug,
  contactTypeCounts,
  contactTypes,
  customFields,
  customFieldFilterValues,
  contacts,
  companies,
  companiesEnabled,
  availableTags,
  allContactCount,
  page,
  pageSize,
  query,
  sortDirection,
  sortKey,
  totalCount,
}: {
  addressLookupEnabled: boolean;
  activeContactTypeSlug: string;
  contactTypeCounts: Record<string, number>;
  contactTypes: ContactTypeOption[];
  customFields: ContactCustomFieldDefinition[];
  customFieldFilterValues: ContactCustomFieldFilterValues;
  contacts: ContactRow[];
  companies: CompanyOption[];
  companiesEnabled: boolean;
  availableTags: ContactTagOption[];
  allContactCount: number;
  page: number;
  pageSize: number;
  query: string;
  sortDirection: SortDirection;
  sortKey: SortKey;
  totalCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [localQuery, setLocalQuery] = useState(query);
  const activeContactType = contactTypes.find(
    (contactType) => contactType.slug === activeContactTypeSlug,
  );
  const tableCustomFields = contactTableCustomFields({
    activeContactTypeId: activeContactType?.id ?? null,
    fields: customFields,
  });
  const availableColumnIds = contactTableColumnIds(tableCustomFields);
  const defaultColumnIds = defaultVisibleContactColumnIds(tableCustomFields);
  const visibleColumnIds = parseVisibleContactColumnIds({
    availableColumnIds,
    defaultColumnIds,
    value: searchParams.get("columns"),
  });
  const filterableCustomFields = customFields.filter(
    (field) =>
      isStructuredContactFilterField(field) &&
      (!activeContactType || field.contactTypeId === activeContactType.id),
  );
  const customFilters: CrmDataTableFilter<ContactRow>[] =
    filterableCustomFields.map((field) => {
      const common = {
        id: field.id,
        label:
          activeContactType?.id === field.contactTypeId
            ? field.label
            : `${contactTypes.find((type) => type.id === field.contactTypeId)?.name ?? "Person"}: ${field.label}`,
      };

      if (field.fieldType === "BOOLEAN") {
        const value = customFieldFilterValues[field.id];
        return {
          ...common,
          getValue: (contact: ContactRow) => {
            const fieldValue = contact.customFieldValues[field.id];
            return typeof fieldValue === "boolean" ? fieldValue : null;
          },
          defaultValue:
            value === "true" || value === "false"
              ? value
              : "all",
          type: "boolean" as const,
        };
      }
      if (field.fieldType === "DATE") {
        const value = customFieldFilterValues[field.id];
        return {
          ...common,
          getValue: (contact: ContactRow) => {
            const fieldValue = contact.customFieldValues[field.id];
            return typeof fieldValue === "string" ? fieldValue : null;
          },
          defaultValue:
            value && typeof value === "object" && !Array.isArray(value)
              ? value
              : {},
          type: "date-range" as const,
        };
      }
      const options = field.options.map((option) => ({
        label: option,
        value: option,
      }));
      if (field.fieldType === "MULTI_SELECT") {
        const value = customFieldFilterValues[field.id];
        return {
          ...common,
          getValue: (contact: ContactRow) => {
            const fieldValue = contact.customFieldValues[field.id];
            return Array.isArray(fieldValue) ? fieldValue : null;
          },
          defaultValue: Array.isArray(value) ? value : [],
          options,
          type: "multi-select" as const,
        };
      }
      const value = customFieldFilterValues[field.id];
      return {
        ...common,
        getValue: (contact: ContactRow) => {
          const fieldValue = contact.customFieldValues[field.id];
          return typeof fieldValue === "string" ? fieldValue : null;
        },
        defaultValue: typeof value === "string" ? value : "",
        options,
        type: "select" as const,
      };
    });
  const exportParams = new URLSearchParams();
  if (query) exportParams.set("q", query);
  if (activeContactTypeSlug !== "all") {
    exportParams.set("type", activeContactTypeSlug);
  }
  searchParams.forEach((value, key) => {
    if (key.startsWith("cf.")) exportParams.append(key, value);
  });
  const exportHref = `/api/contacts/export${exportParams.size ? `?${exportParams}` : ""}`;

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

  if (!allContactCount) {
    return (
      <EmptyState
        title="No people yet"
        description="Use Add person to create the first person record."
      />
    );
  }

  function updateVisibleColumns(nextColumnIds: string[]) {
    const serializedColumns = serializeVisibleContactColumnIds({
      availableColumnIds,
      defaultColumnIds,
      selectedColumnIds: nextColumnIds,
    });
    const nextVisibleColumnIds = new Set(
      serializedColumns
        ? parseVisibleContactColumnIds({
            availableColumnIds,
            defaultColumnIds,
            value: serializedColumns,
          })
        : defaultColumnIds,
    );
    const hidesActiveSort =
      sortKey !== "name" && !nextVisibleColumnIds.has(sortKey);
    const updates: Record<string, string | null> = {
      columns: serializedColumns,
    };

    if (hidesActiveSort) {
      updates.direction = null;
      updates.sort = null;
    }

    updateParams(updates);
  }

  function updateCustomFilters(values: Record<string, FilterValue>) {
    const params = new URLSearchParams(searchParams.toString());
    writeContactCustomFieldFilterParams(
      params,
      values as ContactCustomFieldFilterValues,
    );
    params.delete("page");
    router.push(params.toString() ? `${pathname}?${params}` : pathname);
  }

  function selectContactType(contactTypeSlug: string) {
    const params = new URLSearchParams(searchParams.toString());
    writeContactCustomFieldFilterParams(params, {});
    params.delete("category");
    params.delete("page");
    if (contactTypeSlug === "all") {
      params.delete("type");
    } else {
      params.set("type", contactTypeSlug);
    }
    router.push(params.toString() ? `${pathname}?${params}` : pathname);
  }

  const columns: CrmDataTableColumn<ContactRow>[] = [
    {
      id: "name",
      header: "Name",
      enableHiding: false,
      sortable: true,
      sortValue: contactName,
      cell: (contact) => (
        <ContactNameCell contact={contact} customFields={customFields} />
      ),
    },
    {
      id: "company",
      header: "Company",
      sortable: true,
      sortValue: (contact) => contact.companyName ?? "",
      cell: (contact) => (
        <ContactCompanyCell
          companiesEnabled={companiesEnabled}
          contact={contact}
        />
      ),
    },
    {
      id: "category",
      header: "Category",
      sortable: true,
      sortValue: (contact) => contact.category,
      cell: (contact) => <ContactTypeBadge contactType={contact.contactType} />,
    },
    {
      id: "role",
      header: "Role",
      sortable: true,
      sortValue: (contact) => contact.role ?? "",
      cell: (contact) => contact.role ?? "None",
    },
    {
      id: "source",
      header: "Source",
      sortable: true,
      sortValue: (contact) => contact.leadSource ?? "",
      cell: (contact) => contact.leadSource ?? "Not set",
    },
    {
      id: "email",
      header: "Email",
      sortable: true,
      sortValue: (contact) =>
        contact.email ?? contact.additionalEmails[0]?.email ?? "",
      cell: (contact) => <ContactEmailCell contact={contact} />,
    },
    {
      id: "phone",
      header: "Phone",
      sortable: true,
      sortValue: (contact) => contact.phone ?? "",
      cell: (contact) => <ContactPhoneButton contact={contact} />,
    },
    {
      id: "tags",
      header: "Tags",
      cell: (contact) => <ContactTags contact={contact} />,
    },
    {
      id: "address",
      header: "Address",
      defaultVisible: false,
      sortable: true,
      sortValue: contactAddress,
      cell: (contact) => <ContactAddressCell contact={contact} />,
    },
    ...tableCustomFields.map(
      (field): CrmDataTableColumn<ContactRow> => ({
        id: contactCustomTableColumnId(field.id),
        header: field.label,
        visibilityLabel:
          activeContactType?.id === field.contactTypeId
            ? field.label
            : `${contactTypes.find((type) => type.id === field.contactTypeId)?.name ?? "Person"}: ${field.label}`,
        cell: (contact) => {
          const displayValue = contactCustomFieldDisplayValue(
            contact.customFieldValues[field.id],
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
      <ContactTypeOverview
        activeContactTypeSlug={activeContactTypeSlug}
        allContactCount={allContactCount}
        contactTypeCounts={contactTypeCounts}
        contactTypes={contactTypes}
        onSelect={selectContactType}
      />
      <CrmDataTable
        data={contacts}
        columns={columns}
        getRowId={(contact) => contact.id}
        title={
          activeContactType
            ? `${activeContactType.pluralName} (${totalCount})`
            : `All People (${totalCount})`
        }
        searchPlaceholder="Search people..."
        toolbarActions={
          <a
            href={exportHref}
            title="Export the current search and person type filter, up to 5,000 people"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </a>
        }
        query={localQuery}
        onQueryChange={setLocalQuery}
        filters={customFilters}
        filterValues={customFieldFilterValues}
        onFilterValuesChange={updateCustomFilters}
        filterPanelTitle="People filters"
        filterPanelDescription="Filter structured fields configured for the selected person type."
        sort={{ columnId: sortKey, direction: sortDirection }}
        onSortChange={(nextSort) => {
          const nextKey = nextSort.columnId as SortKey;
          const nextDirection = nextSort.direction as CrmDataTableSortDirection;

          updateParams({
            direction:
              nextKey === "name" && nextDirection === "asc"
                ? null
                : nextDirection,
            page: null,
            sort:
              nextKey === "name" && nextDirection === "asc" ? null : nextKey,
          });
        }}
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        enableColumnSelection
        visibleColumnIds={visibleColumnIds}
        onVisibleColumnIdsChange={updateVisibleColumns}
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
        emptyState="No people match this search."
        renderRowActions={(contact) => (
          <ContactActions
            availableTags={availableTags}
            companies={companies}
            companiesEnabled={companiesEnabled}
            contactTypes={contactTypes}
            customFields={customFields}
            contact={contact}
            addressLookupEnabled={addressLookupEnabled}
          />
        )}
      />
    </div>
  );
}

const iconByKey: Record<string, LucideIcon> = {
  user: UserRound,
  briefcase: BriefcaseBusiness,
  wrench: Wrench,
  building: Building2,
};

const cardClassByColour: Record<string, string> = {
  gray: "border-gray-200 bg-gray-50/40 dark:border-gray-700 dark:bg-white/[0.03]",
  success: "border-success-200 bg-success-50/40 dark:border-success-800 dark:bg-success-500/10",
  blue: "border-blue-light-200 bg-blue-light-50 dark:border-blue-light-800 dark:bg-blue-light-500/10",
  purple: "border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-500/10",
  orange: "border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-500/10",
};

const countClassByColour: Record<string, string> = {
  gray: "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300",
  success: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300",
  blue: "bg-blue-light-50 text-blue-light-700 dark:bg-blue-light-500/15 dark:text-blue-light-300",
  purple: "bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
  orange: "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
};

const tableClassByColour = countClassByColour;

function ContactTypeOverview({
  activeContactTypeSlug,
  allContactCount,
  contactTypeCounts,
  contactTypes,
  onSelect,
}: {
  activeContactTypeSlug: string;
  allContactCount: number;
  contactTypeCounts: Record<string, number>;
  contactTypes: ContactTypeOption[];
  onSelect: (contactTypeSlug: string) => void;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 dark:border-gray-800">
        {[
          { label: "All People", value: "all" as const },
          ...contactTypes.map((option) => ({
            label: option.name,
            value: option.slug,
          })),
        ].map((tab) => {
          const selected = activeContactTypeSlug === tab.value;

          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onSelect(tab.value)}
              className={`border-b-2 px-3 py-2 text-sm font-semibold transition ${
                selected
                  ? "border-brand-500 text-brand-600 dark:text-brand-300"
                  : "border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {contactTypes.map((option, index) => {
          const Icon = iconByKey[option.iconKey] ?? UserRound;
          const count = contactTypeCounts[option.id] ?? 0;
          const selected = activeContactTypeSlug === option.slug;

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelect(option.slug)}
              className={`min-h-44 rounded-lg border bg-white p-4 text-left shadow-theme-xs transition hover:-translate-y-0.5 hover:shadow-theme-sm dark:bg-white/[0.03] ${
                selected
                  ? "border-brand-400 ring-2 ring-brand-500/15"
                  : cardClassByColour[option.colourKey] ?? cardClassByColour.gray
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${countClassByColour[option.colourKey] ?? countClassByColour.gray}`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                    {index + 1}. {option.name}
                  </p>
                  <p className="mt-1 text-sm leading-5 text-gray-800 dark:text-white/90">
                    {option.description}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 dark:border-white/10">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {option.pluralName}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${countClassByColour[option.colourKey] ?? countClassByColour.gray}`}
                >
                  {count}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {activeContactTypeSlug !== "all" ? (
        <button
          type="button"
          onClick={() => onSelect("all")}
          className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
        >
          Show all {allContactCount} people
        </button>
      ) : null}
    </section>
  );
}

function AddressSubline({ address }: { address: string }) {
  if (!address) {
    return null;
  }

  return (
    <span
      className="mt-1 block max-w-72 truncate text-xs font-normal text-gray-500 dark:text-gray-400"
      title={address}
    >
      {address}
    </span>
  );
}

function ContactNameCell({
  contact,
  customFields,
}: {
  contact: ContactRow;
  customFields: ContactCustomFieldDefinition[];
}) {
  const address = contactAddress(contact);
  const completeness = contactProfileCompleteness({
    contactTypeId: contact.contactTypeId ?? contact.contactType?.id ?? null,
    definitions: customFields,
    values: contact.customFieldValues,
  });

  return (
    <div className="min-w-0">
      <Link
        href={`/contacts/${contact.id}`}
        className="block truncate font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
      >
        {contactName(contact)}
      </Link>
      <ContactProfileCompleteness value={completeness} variant="compact" />
      <AddressSubline address={address} />
    </div>
  );
}

function ContactCompanyCell({
  companiesEnabled,
  contact,
}: {
  companiesEnabled: boolean;
  contact: ContactRow;
}) {
  if (!contact.companyName) {
    return <span className="text-gray-400">None</span>;
  }

  const address = companyAddress(contact);
  const companyName =
    companiesEnabled && contact.companyId ? (
      <Link
        href={`/clients/${contact.companyId}`}
        className="block truncate font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
      >
        {contact.companyName}
      </Link>
    ) : (
      <span className="block truncate">{contact.companyName}</span>
    );

  return (
    <div className="min-w-0">
      {companyName}
      <AddressSubline address={address} />
    </div>
  );
}

function ContactAddressCell({ contact }: { contact: ContactRow }) {
  const address = contactAddress(contact);

  if (!address) {
    return <span className="text-gray-400">None</span>;
  }

  return (
    <span className="block max-w-72 truncate" title={address}>
      {address}
    </span>
  );
}

function ContactPhoneButton({ contact }: { contact: ContactRow }) {
  const phone = contact.phone ?? contact.additionalPhones[0]?.phone ?? null;
  const hiddenCount = contact.phone
    ? contact.additionalPhones.length
    : Math.max(0, contact.additionalPhones.length - 1);

  if (!phone) return <span className="text-gray-400">None</span>;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <button
        type="button"
        onClick={() => triggerSoftphoneDial(phone, contactName(contact))}
        aria-label={`Call ${contactName(contact)}`}
        className="inline-flex min-w-0 items-center gap-2 font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
      >
        <PhoneIcon className="h-4 w-4 shrink-0" />
        <span className="truncate">{phone}</span>
      </button>
      <MethodCountBadge count={hiddenCount} />
    </div>
  );
}

function ContactEmailCell({ contact }: { contact: ContactRow }) {
  const email = contact.email ?? contact.additionalEmails[0]?.email ?? null;
  const hiddenCount = contact.email
    ? contact.additionalEmails.length
    : Math.max(0, contact.additionalEmails.length - 1);

  if (!email) {
    return <span className="text-gray-400">None</span>;
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="truncate">{email}</span>
      <MethodCountBadge count={hiddenCount} />
    </div>
  );
}

function MethodCountBadge({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-gray-100 px-1.5 text-[11px] font-semibold text-gray-500 dark:bg-white/10 dark:text-gray-300">
      +{count}
    </span>
  );
}

function ContactTags({ contact }: { contact: ContactRow }) {
  if (!contact.tags.length) {
    return <span className="text-sm text-gray-400">No tags</span>;
  }

  return (
    <div className="flex max-w-56 flex-wrap gap-1.5">
      {contact.tags.slice(0, 3).map((tag) => (
        <span
          key={tag.id}
          className="inline-flex h-6 items-center rounded-full bg-gray-100 px-2 text-xs font-medium text-gray-700 dark:bg-white/10 dark:text-gray-300"
        >
          {tag.name}
        </span>
      ))}
      {contact.tags.length > 3 && (
        <span className="inline-flex h-6 items-center rounded-full bg-gray-50 px-2 text-xs font-medium text-gray-500 dark:bg-white/5 dark:text-gray-400">
          +{contact.tags.length - 3}
        </span>
      )}
    </div>
  );
}

function ContactTypeBadge({ contactType }: { contactType: ContactTypeOption | null }) {
  return (
    <span
      className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold ${tableClassByColour[contactType?.colourKey ?? "gray"] ?? tableClassByColour.gray}`}
    >
      {contactType?.name ?? "Unassigned"}
    </span>
  );
}

function ContactActions({
  addressLookupEnabled,
  availableTags,
  companies,
  companiesEnabled,
  contactTypes,
  customFields,
  contact,
}: {
  addressLookupEnabled: boolean;
  availableTags: ContactTagOption[];
  companies: CompanyOption[];
  companiesEnabled: boolean;
  contactTypes: ContactTypeOption[];
  customFields: ContactCustomFieldDefinition[];
  contact: ContactRow;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <DeferredContactEditModal
        companies={companies}
        companiesEnabled={companiesEnabled}
        contactTypes={contactTypes}
        customFields={customFields}
        availableTags={availableTags}
        addressLookupEnabled={addressLookupEnabled}
        contact={contact}
      />
      <DeferredContactDeleteModal
        contactId={contact.id}
        contactName={contactName(contact)}
      />
    </div>
  );
}
