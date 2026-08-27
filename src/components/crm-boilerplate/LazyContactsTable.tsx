"use client";

import dynamic from "next/dynamic";
import type { ContactTagOption } from "@/components/crm-boilerplate/ContactTagInput";
import type {
  ContactEmailMethod,
  ContactPhoneMethod,
} from "@/lib/contact-methods";

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

type ContactsTableProps = {
  addressLookupEnabled: boolean;
  allContactCount: number;
  availableTags: ContactTagOption[];
  companies: CompanyOption[];
  companiesEnabled: boolean;
  contacts: ContactRow[];
  page: number;
  pageSize: number;
  query: string;
  sortDirection: "asc" | "desc";
  sortKey:
    | "name"
    | "company"
    | "source"
    | "role"
    | "email"
    | "phone"
    | "address";
  totalCount: number;
};

function ContactsTableLoading() {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 p-5 dark:border-gray-800">
        <div className="h-10 w-full max-w-sm rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
      </div>
      <div className="divide-y divide-gray-100 lg:hidden dark:divide-gray-800">
        {["one", "two", "three", "four"].map((item) => (
          <div key={item} className="space-y-3 px-5 py-4">
            <div className="h-4 w-36 max-w-full rounded bg-gray-100 dark:bg-white/[0.08]" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-3 rounded bg-gray-50 dark:bg-white/[0.05]" />
              <div className="h-3 rounded bg-gray-50 dark:bg-white/[0.05]" />
              <div className="h-3 rounded bg-gray-50 dark:bg-white/[0.05]" />
              <div className="h-3 rounded bg-gray-50 dark:bg-white/[0.05]" />
            </div>
            <div className="flex gap-1.5">
              <div className="h-6 w-16 rounded-full bg-gray-50 dark:bg-white/[0.05]" />
              <div className="h-6 w-16 rounded-full bg-gray-50 dark:bg-white/[0.05]" />
            </div>
          </div>
        ))}
      </div>
      <div className="hidden max-w-full min-w-0 overflow-x-auto lg:block">
        <div className="min-w-[920px] divide-y divide-gray-100 dark:divide-gray-800">
          <div className="grid grid-cols-[1.2fr_1fr_0.9fr_0.9fr_1.2fr_1fr_1fr_0.6fr] gap-4 bg-gray-50 px-5 py-3 dark:bg-white/[0.02]">
            {["Name", "Company", "Source", "Role", "Email", "Phone", "Tags", "Actions"].map(
              (item) => (
                <div
                  key={item}
                  className="h-3 w-20 rounded bg-gray-100 dark:bg-white/[0.08]"
                >
                  <span className="sr-only">{item}</span>
                </div>
              ),
            )}
          </div>
          {["one", "two", "three", "four"].map((item) => (
            <div
              key={item}
              className="grid grid-cols-[1.2fr_1fr_0.9fr_0.9fr_1.2fr_1fr_1fr_0.6fr] gap-4 px-5 py-4"
            >
              <div className="h-4 w-36 rounded bg-gray-100 dark:bg-white/[0.08]" />
              <div className="h-4 w-32 rounded bg-gray-50 dark:bg-white/[0.05]" />
              <div className="h-4 w-28 rounded bg-gray-50 dark:bg-white/[0.05]" />
              <div className="h-4 w-28 rounded bg-gray-50 dark:bg-white/[0.05]" />
              <div className="h-4 w-44 rounded bg-gray-50 dark:bg-white/[0.05]" />
              <div className="h-4 w-32 rounded bg-gray-50 dark:bg-white/[0.05]" />
              <div className="flex gap-1.5">
                <div className="h-6 w-16 rounded-full bg-gray-50 dark:bg-white/[0.05]" />
                <div className="h-6 w-16 rounded-full bg-gray-50 dark:bg-white/[0.05]" />
              </div>
              <div className="ml-auto h-9 w-20 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const ContactsTable = dynamic<ContactsTableProps>(
  () => import("@/components/crm-boilerplate/ContactsTable"),
  {
    loading: ContactsTableLoading,
    ssr: false,
  },
);

export default function LazyContactsTable(props: ContactsTableProps) {
  return <ContactsTable {...props} />;
}
