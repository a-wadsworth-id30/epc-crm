"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  BriefcaseBusiness,
  Building2,
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
  type CrmDataTableSortDirection,
} from "@/components/crm-boilerplate/data-table";
import EmptyState from "@/components/crm-boilerplate/EmptyState";
import { PhoneIcon } from "@/components/crm-boilerplate/SoftphoneIcons";
import type {
  ContactEmailMethod,
  ContactPhoneMethod,
} from "@/lib/contact-methods";
import {
  contactCategoryOption,
  contactCategoryOptions,
  defaultContactCategory,
  type ContactCategoryValue,
} from "@/lib/contacts/categories";
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
const defaultContactColumnIds = [
  "name",
  "company",
  "category",
  "role",
  "source",
  "email",
  "phone",
  "tags",
] as const;
const contactColumnIds = [...defaultContactColumnIds, "address"] as const;
type ContactColumnId = (typeof contactColumnIds)[number];
const contactColumnIdSet = new Set<string>(contactColumnIds);
const defaultContactColumnIdSet = new Set<string>(defaultContactColumnIds);

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

function parseVisibleContactColumns(value: string | null) {
  if (!value) {
    return [...defaultContactColumnIds];
  }

  const parsedColumnIds = value
    .split(",")
    .map((columnId) => columnId.trim())
    .filter((columnId): columnId is ContactColumnId =>
      contactColumnIdSet.has(columnId),
    );
  const nextColumnIds = new Set<ContactColumnId>(["name"]);

  parsedColumnIds.forEach((columnId) => nextColumnIds.add(columnId));

  return contactColumnIds.filter((columnId) => nextColumnIds.has(columnId));
}

function serializeVisibleContactColumns(columnIds: string[]) {
  const normalizedColumnIds = parseVisibleContactColumns(columnIds.join(","));
  const isDefault =
    normalizedColumnIds.length === defaultContactColumnIds.length &&
    normalizedColumnIds.every((columnId) =>
      defaultContactColumnIdSet.has(columnId),
    );

  return isDefault ? null : normalizedColumnIds.join(",");
}

export default function ContactsTable({
  addressLookupEnabled,
  activeCategory,
  categoryCounts,
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
  activeCategory: "all" | ContactCategoryValue;
  categoryCounts: Record<ContactCategoryValue, number>;
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
  const visibleColumnIds = parseVisibleContactColumns(
    searchParams.get("columns"),
  );
  const activeCategoryOption =
    activeCategory === "all" ? null : contactCategoryOption(activeCategory);

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
    const serializedColumns = serializeVisibleContactColumns(nextColumnIds);
    const nextVisibleColumnIds = new Set(
      serializedColumns
        ? parseVisibleContactColumns(serializedColumns)
        : defaultContactColumnIds,
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

  const columns: CrmDataTableColumn<ContactRow>[] = [
    {
      id: "name",
      header: "Name",
      enableHiding: false,
      sortable: true,
      sortValue: contactName,
      cell: (contact) => <ContactNameCell contact={contact} />,
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
      cell: (contact) => <ContactCategoryBadge category={contact.category} />,
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
  ];

  return (
    <div className="space-y-5">
      <ContactCategoryOverview
        activeCategory={activeCategory}
        allContactCount={allContactCount}
        categoryCounts={categoryCounts}
        onSelect={(category) =>
          updateParams({
            category: category === "all" ? null : category,
            page: null,
          })
        }
      />
      <CrmDataTable
        data={contacts}
        columns={columns}
        getRowId={(contact) => contact.id}
        title={
          activeCategoryOption
            ? `${activeCategoryOption.pluralLabel} (${totalCount})`
            : `All People (${totalCount})`
        }
        searchPlaceholder="Search people..."
        query={localQuery}
        onQueryChange={setLocalQuery}
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
            contact={contact}
            addressLookupEnabled={addressLookupEnabled}
          />
        )}
      />
    </div>
  );
}

const categoryIconByValue: Record<ContactCategoryValue, LucideIcon> = {
  CONSUMER: UserRound,
  TRADE: BriefcaseBusiness,
  INSTALLER: Wrench,
  COMPANY: Building2,
};

function ContactCategoryOverview({
  activeCategory,
  allContactCount,
  categoryCounts,
  onSelect,
}: {
  activeCategory: "all" | ContactCategoryValue;
  allContactCount: number;
  categoryCounts: Record<ContactCategoryValue, number>;
  onSelect: (category: "all" | ContactCategoryValue) => void;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 dark:border-gray-800">
        {[
          { label: "All People", value: "all" as const },
          ...contactCategoryOptions.map((option) => ({
            label: option.label,
            value: option.value,
          })),
        ].map((tab) => {
          const selected = activeCategory === tab.value;

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
        {contactCategoryOptions.map((option, index) => {
          const Icon = categoryIconByValue[option.value];
          const count = categoryCounts[option.value] ?? 0;
          const selected = activeCategory === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onSelect(option.value)}
              className={`min-h-44 rounded-lg border bg-white p-4 text-left shadow-theme-xs transition hover:-translate-y-0.5 hover:shadow-theme-sm dark:bg-white/[0.03] ${
                selected
                  ? "border-brand-400 ring-2 ring-brand-500/15"
                  : option.cardClassName
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${option.countClassName}`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                    {index + 1}. {option.label}
                  </p>
                  <p className="mt-1 text-sm leading-5 text-gray-800 dark:text-white/90">
                    {option.description}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {option.examples.map((example) => (
                  <span
                    key={example}
                    className="rounded-full bg-white px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-gray-200 dark:bg-white/[0.04] dark:text-gray-300 dark:ring-white/10"
                  >
                    {example}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 dark:border-white/10">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {option.pluralLabel}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${option.countClassName}`}
                >
                  {count}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {activeCategory !== "all" ? (
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

function ContactNameCell({ contact }: { contact: ContactRow }) {
  const address = contactAddress(contact);

  return (
    <div className="min-w-0">
      <Link
        href={`/contacts/${contact.id}`}
        className="block truncate font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
      >
        {contactName(contact)}
      </Link>
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

function ContactCategoryBadge({
  category,
}: {
  category: ContactCategoryValue | null | undefined;
}) {
  const option = contactCategoryOption(category ?? defaultContactCategory);

  return (
    <span
      className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold ${option.tableClassName}`}
    >
      {option.label}
    </span>
  );
}

function ContactActions({
  addressLookupEnabled,
  availableTags,
  companies,
  companiesEnabled,
  contact,
}: {
  addressLookupEnabled: boolean;
  availableTags: ContactTagOption[];
  companies: CompanyOption[];
  companiesEnabled: boolean;
  contact: ContactRow;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <DeferredContactEditModal
        companies={companies}
        companiesEnabled={companiesEnabled}
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
