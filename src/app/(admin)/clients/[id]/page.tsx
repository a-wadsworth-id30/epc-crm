import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  DeferredCompanyDeleteModal,
  DeferredCompanyEditModal,
} from "@/components/crm-boilerplate/CompanyModalLoaders";
import type { CompanyFormValues } from "@/components/crm-boilerplate/CompanyForm";
import CompanyDetailWorkspace from "@/components/crm-boilerplate/CompanyDetailWorkspace";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import RecordDocumentLibrary from "@/components/crm-boilerplate/RecordDocumentLibrary";
import StatusBadge from "@/components/crm-boilerplate/StatusBadge";
import { ChevronLeftIcon } from "@/icons";
import { getCurrentUser, requireUser } from "@/lib/auth";
import {
  normalizeContactEmailMethods,
  normalizeContactPhoneMethods,
} from "@/lib/contact-methods";
import {
  companyIdAccessWhere,
  contactAccessWhere,
  contactWhereWithAccess,
  salesOpportunityAccessWhere,
  salesOpportunityWhereWithAccess,
} from "@/lib/crm-resource-access";
import { listRecordCustomerDocumentShares } from "@/lib/customer-document-share-list";
import { listRecordCustomerDocumentPortals } from "@/lib/customer-document-portal-list";
import { listRecordCustomerUploadRequests } from "@/lib/customer-upload-request-list";
import { parseDocumentLibrarySettings } from "@/lib/document-library";
import { isGeoapifyAddressLookupEnabled } from "@/lib/integrations/geoapify";
import { prisma } from "@/lib/prisma";
import { getCrmSettings } from "@/lib/settings";
import { listRecordSignatureRequests } from "@/lib/signature-request-list";
import { mediaAssetUrl } from "@/lib/storage/media";
import { cloudflareR2Provider, r2StoredConfigSchema } from "@/lib/storage/r2";

type CompanyPageProps = {
  params: Promise<{ id: string }>;
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

function formatMoney(valueCents: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    currency,
    maximumFractionDigits: 0,
    style: "currency",
  }).format(valueCents / 100);
}

function contactName(contact: { firstName: string; lastName: string }) {
  return `${contact.firstName} ${contact.lastName}`.trim();
}

function formatAddress(company: {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  county: string | null;
  postcode: string | null;
  country: string | null;
}) {
  return [
    company.addressLine1,
    company.addressLine2,
    company.city,
    company.county,
    company.postcode,
    company.country,
  ].filter((line): line is string => Boolean(line));
}

export async function generateMetadata({
  params,
}: CompanyPageProps): Promise<Metadata> {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user) {
    return { title: "Company | Companies" };
  }

  const company = await prisma.company.findFirst({
    where: companyIdAccessWhere(id, user),
    select: { name: true },
  });

  return {
    title: company ? `${company.name} | Companies` : "Company | Companies",
  };
}

export default async function CompanyDetailPage({ params }: CompanyPageProps) {
  const { id } = await params;
  const user = await requireUser();
  const opportunityAccessWhere = salesOpportunityAccessWhere(user);
  const [
    company,
    settings,
    companyDocuments,
    companyUploadRequests,
    companyDocumentShares,
    companyDocumentPortals,
    companySignatureRequests,
    r2Integration,
    addressLookupEnabled,
  ] = await Promise.all([
    prisma.company.findFirst({
      where: companyIdAccessWhere(id, user),
      select: {
        addressLine1: true,
        addressLine2: true,
        city: true,
        contacts: {
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          where:
            user.role === "ADMIN" ? undefined : contactWhereWithAccess(user),
          select: {
            additionalEmails: {
              orderBy: { createdAt: "asc" },
              select: { email: true, id: true, label: true },
            },
            additionalPhones: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                label: true,
                phone: true,
                phoneNormalized: true,
              },
            },
            email: true,
            firstName: true,
            id: true,
            lastName: true,
            leadSource: true,
            phone: true,
            role: true,
          },
          take: 100,
        },
        country: true,
        county: true,
        domain: true,
        id: true,
        name: true,
        opportunities: {
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          select: {
            currency: true,
            id: true,
            source: true,
            stage: true,
            title: true,
            updatedAt: true,
            valueCents: true,
            owner: { select: { name: true } },
            salesPipelineStage: { select: { name: true } },
          },
          take: 50,
          where: user.role === "ADMIN" ? undefined : opportunityAccessWhere,
        },
        owner: true,
        postcode: true,
        status: true,
        updatedAt: true,
        _count: {
          select: {
            contacts: true,
            notes: true,
            opportunities: true,
            tasks: true,
          },
        },
      },
    }),
    getCrmSettings(),
    prisma.fileAsset.findMany({
      where: { entityId: id, entityType: "Company" },
      orderBy: { createdAt: "desc" },
      take: 120,
      select: {
        createdAt: true,
        documentFolder: true,
        id: true,
        mimeType: true,
        notes: true,
        originalName: true,
        sizeBytes: true,
        tags: true,
        uploadedBy: { select: { email: true, name: true } },
      },
    }),
    listRecordCustomerUploadRequests({
      entityId: id,
      entityType: "Company",
    }),
    listRecordCustomerDocumentShares({
      entityId: id,
      entityType: "Company",
    }),
    listRecordCustomerDocumentPortals({
      entityId: id,
      entityType: "Company",
    }),
    listRecordSignatureRequests({
      entityId: id,
      entityType: "Company",
    }),
    prisma.integrationConnection.findUnique({
      where: { provider: cloudflareR2Provider },
      select: { config: true },
    }),
    isGeoapifyAddressLookupEnabled(),
  ]);

  if (!company) {
    notFound();
  }

  const documentLibrary = parseDocumentLibrarySettings(
    settings.documentLibrary,
  );
  const r2Config = r2StoredConfigSchema.safeParse(r2Integration?.config ?? {});
  const documentUploadPolicy = {
    allowedMimeTypes: r2Config.success ? r2Config.data.allowedMimeTypes : "",
    isConfigured: Boolean(r2Config.success && r2Config.data.credentials),
    maxUploadMb: r2Config.success ? r2Config.data.maxUploadMb : 25,
  };
  const recordDocuments = companyDocuments.map((document) => ({
    createdAt: document.createdAt.toISOString(),
    documentFolder: document.documentFolder,
    id: document.id,
    mimeType: document.mimeType,
    name: document.originalName,
    notes: document.notes,
    sizeBytes: document.sizeBytes,
    tags: document.tags,
    uploadedBy:
      document.uploadedBy?.name || document.uploadedBy?.email || "CRM user",
    url: mediaAssetUrl(document.id),
  }));

  const scopedCounts =
    user.role === "ADMIN"
      ? company._count
      : {
          contacts: await prisma.contact.count({
            where: contactWhereWithAccess(user, { companyId: company.id }),
          }),
          notes: await prisma.note.count({
            where: { companyId: company.id, userId: user.id },
          }),
          opportunities: await prisma.salesOpportunity.count({
            where: salesOpportunityWhereWithAccess(user, {
              companyId: company.id,
            }),
          }),
          tasks: await prisma.task.count({
            where: {
              companyId: company.id,
              OR: [
                { assigneeId: user.id },
                { creatorId: user.id },
                { contact: contactAccessWhere(user) },
              ],
            },
          }),
        };
  const addressLines = formatAddress(company);
  const addressLabel = addressLines.length
    ? [company.city, company.postcode].filter(Boolean).join(", ") ||
      addressLines[0]
    : "Not captured";
  const editableCompany: CompanyFormValues = {
    addressLine1: company.addressLine1,
    addressLine2: company.addressLine2,
    city: company.city,
    country: company.country,
    county: company.county,
    domain: company.domain,
    id: company.id,
    name: company.name,
    owner: company.owner,
    postcode: company.postcode,
    status: company.status,
  };
  const companyDetailPanel = (
    <div className="p-5">
      <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
        Company details
      </h2>
      <dl className="mt-4 grid gap-4 text-sm md:grid-cols-2">
        <div>
          <dt className="text-gray-500 dark:text-gray-400">Status</dt>
          <dd className="mt-1">
            <StatusBadge>{company.status}</StatusBadge>
          </dd>
        </div>
        <div>
          <dt className="text-gray-500 dark:text-gray-400">Domain</dt>
          <dd className="mt-1 font-medium text-gray-800 dark:text-white/90">
            {company.domain ? (
              <a
                href={`https://${company.domain}`}
                target="_blank"
                rel="noreferrer"
                className="text-brand-600 hover:text-brand-700 dark:text-brand-400"
              >
                {company.domain}
              </a>
            ) : (
              "Not set"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500 dark:text-gray-400">Owner</dt>
          <dd className="mt-1 font-medium text-gray-800 dark:text-white/90">
            {company.owner ?? "Unassigned"}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500 dark:text-gray-400">Updated</dt>
          <dd className="mt-1 font-medium text-gray-800 dark:text-white/90">
            {formatDate(company.updatedAt)}
          </dd>
        </div>
        <div className="md:col-span-2">
          <dt className="text-gray-500 dark:text-gray-400">Address</dt>
          <dd className="mt-1 font-medium text-gray-800 dark:text-white/90">
            {addressLines.length ? (
              <span className="block space-y-1">
                {addressLines.map((line, index) => (
                  <span key={`${line}-${index}`} className="block">
                    {line}
                  </span>
                ))}
              </span>
            ) : (
              "Not set"
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
  const linkedRecordsPanel = (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
        Linked records
      </h2>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Metric label="Contacts" value={scopedCounts.contacts} />
        <Metric label="Leads" value={scopedCounts.opportunities} />
        <Metric label="Tasks" value={scopedCounts.tasks} />
        <Metric label="Notes" value={scopedCounts.notes} />
      </dl>
    </section>
  );
  const contactsPanel = (
    <div className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Contacts
        </h2>
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-gray-100 px-2 text-xs font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
          {company.contacts.length}
        </span>
      </div>
      <div className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
        {company.contacts.length ? (
          company.contacts.map((contact) => {
            const additionalEmails = normalizeContactEmailMethods(
              contact.additionalEmails,
              contact.email,
            );
            const additionalPhones = normalizeContactPhoneMethods(
              contact.additionalPhones,
              contact.phone,
            );
            const email = contact.email ?? additionalEmails[0]?.email ?? null;
            const phone = contact.phone ?? additionalPhones[0]?.phone ?? null;

            return (
              <div
                key={contact.id}
                className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <Link
                    href={`/contacts/${contact.id}`}
                    className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
                  >
                    {contactName(contact)}
                  </Link>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {contact.role ?? "Role not set"}
                  </p>
                </div>
                <div className="min-w-0 text-sm text-gray-600 sm:text-right dark:text-gray-300">
                  <p>{email ?? "No email"}</p>
                  <p className="mt-1 text-gray-500 dark:text-gray-400">
                    {[phone, contact.leadSource].filter(Boolean).join(" | ") ||
                      "No phone or source"}
                  </p>
                </div>
              </div>
            );
          })
        ) : (
          <p className="py-4 text-sm text-gray-500 dark:text-gray-400">
            No contacts linked to this company.
          </p>
        )}
      </div>
    </div>
  );
  const leadsPanel = (
    <div className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Leads
        </h2>
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-gray-100 px-2 text-xs font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
          {company.opportunities.length}
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {company.opportunities.length ? (
          company.opportunities.map((sale) => (
            <Link
              key={sale.id}
              href={`/sales/${sale.id}`}
              className="block rounded-xl border border-gray-200 p-3 text-sm transition hover:border-brand-200 hover:bg-brand-50/50 dark:border-gray-800 dark:hover:border-brand-900/40 dark:hover:bg-brand-900/10"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-gray-800 dark:text-white/90">
                    {sale.title}
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {[sale.source, sale.owner?.name ?? "Unassigned"]
                      .filter(Boolean)
                      .join(" | ")}
                    {" | Updated "}
                    {formatDate(sale.updatedAt)}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-gray-700 dark:text-gray-200">
                  {formatMoney(sale.valueCents, sale.currency)}
                </span>
              </div>
              <div className="mt-3">
                <StatusBadge>
                  {sale.salesPipelineStage?.name ?? sale.stage}
                </StatusBadge>
              </div>
            </Link>
          ))
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No leads linked to this company.
          </p>
        )}
      </div>
    </div>
  );
  const documentsPanel = (
    <div className="p-4 sm:p-5">
      <RecordDocumentLibrary
        documentPortals={companyDocumentPortals}
        documentShares={companyDocumentShares}
        documents={recordDocuments}
        entityId={company.id}
        entityLabel={company.name}
        entityType="Company"
        folders={documentLibrary.folders}
        signatureRequests={companySignatureRequests}
        uploadRequests={companyUploadRequests}
        uploadPolicy={documentUploadPolicy}
      />
    </div>
  );

  return (
    <>
      <PageHeader
        title={company.name}
        description={company.domain ?? "Company record"}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <DeferredCompanyEditModal
              addressLookupEnabled={addressLookupEnabled}
              company={editableCompany}
            />
            {user.role === "ADMIN" ? (
              <DeferredCompanyDeleteModal
                companyId={company.id}
                companyName={company.name}
                relatedRecords={scopedCounts}
              />
            ) : null}
            <Link
              href="/clients"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
            >
              <ChevronLeftIcon className="h-4 w-4" />
              Companies
            </Link>
          </div>
        }
      />

      <CompanyDetailWorkspace
        contactsCount={scopedCounts.contacts}
        contactsPanel={contactsPanel}
        detailPanel={companyDetailPanel}
        documentsCount={recordDocuments.length}
        documentsPanel={documentsPanel}
        leadsCount={scopedCounts.opportunities}
        leadsPanel={leadsPanel}
        linkedRecordsPanel={linkedRecordsPanel}
        summary={{
          addressLabel,
          companyName: company.name,
          domain: company.domain,
          owner: company.owner,
          status: company.status,
        }}
      />
    </>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03]">
      <dt className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
        {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
        {value}
      </dd>
    </div>
  );
}
