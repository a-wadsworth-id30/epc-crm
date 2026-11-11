import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  DeferredCompanyDeleteModal,
  DeferredCompanyEditModal,
  DeferredCompanyMergeModal,
} from "@/components/crm-boilerplate/CompanyModalLoaders";
import type { CompanyFormValues } from "@/components/crm-boilerplate/CompanyForm";
import CompanyDetailWorkspace from "@/components/crm-boilerplate/CompanyDetailWorkspace";
import CompanyActivityTimeline, {
  type CompanyActivityItem,
} from "@/components/crm-boilerplate/CompanyActivityTimeline";
import ConnectedRecordContext from "@/components/crm-boilerplate/ConnectedRecordContext";
import CompanyDocumentRequirements from "@/components/crm-boilerplate/CompanyDocumentRequirements";
import CompanyHierarchyEditor from "@/components/crm-boilerplate/CompanyHierarchyEditor";
import CompanyProfileCompleteness from "@/components/crm-boilerplate/CompanyProfileCompleteness";
import {
  CompanyContactLinker,
  CompanyContactPrimaryButton,
  CompanyContactResponsibilitiesEditor,
  CompanyContactUnlinkButton,
} from "@/components/crm-boilerplate/CompanyContactRelationships";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import { DeferredAddSaleModal } from "@/components/crm-boilerplate/SalesRouteLoaders";
import RecordDocumentLibrary from "@/components/crm-boilerplate/RecordDocumentLibrary";
import StatusBadge from "@/components/crm-boilerplate/StatusBadge";
import { ChevronLeftIcon } from "@/icons";
import { getCurrentUser, requireUser } from "@/lib/auth";
import {
  canEditCompanyField,
  visibleCompanyFields,
} from "@/lib/companies/field-access";
import { serializeCompanyCustomFieldValue } from "@/lib/companies/custom-fields";
import { companyProfileCompleteness } from "@/lib/companies/profile-completeness";
import { companyRelatedSalesWhere } from "@/lib/companies/related-sales";
import { companyOwnerOptionsForUser } from "@/lib/companies/owner-assignment";
import {
  companyDocumentRequirementStatuses,
  parseCompanyDocumentUploadType,
} from "@/lib/companies/document-requirements";
import {
  normalizeContactEmailMethods,
  normalizeContactPhoneMethods,
} from "@/lib/contact-methods";
import { normalizeContactCustomFieldOptions } from "@/lib/contacts/custom-fields";
import {
  companyIdAccessWhere,
  companyWhereWithAccess,
  contactAccessWhere,
  contactWhereWithAccess,
  salesOpportunityWhereWithAccess,
} from "@/lib/crm-resource-access";
import { listRecordCustomerDocumentShares } from "@/lib/customer-document-share-list";
import { listRecordCustomerDocumentPortals } from "@/lib/customer-document-portal-list";
import { listRecordCustomerUploadRequests } from "@/lib/customer-upload-request-list";
import { parseDocumentLibrarySettings } from "@/lib/document-library";
import { isGeoapifyAddressLookupEnabled } from "@/lib/integrations/geoapify";
import { prisma } from "@/lib/prisma";
import {
  parseSalesDefaults,
  resolveSalesDefaultOwnerId,
} from "@/lib/sales/defaults";
import { saleOwnerOptionsForUser } from "@/lib/sales/owner-assignment";
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

function formatCustomFieldValue(
  value: ReturnType<typeof serializeCompanyCustomFieldValue>,
) {
  if (Array.isArray(value)) return value.join(", ") || "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value || "Not set";
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
  const [
    company,
    companyTypes,
    companyCustomFields,
    companyTypeDocumentRequirements,
    settings,
    companyDocuments,
    companyUploadRequests,
    companyDocumentShares,
    companyDocumentPortals,
    companySignatureRequests,
    r2Integration,
    addressLookupEnabled,
    hierarchyCompanyOptions,
    activeOwnerUsers,
    mergeCompanyCandidates,
    pipelineStages,
  ] = await Promise.all([
    prisma.company.findFirst({
      where: companyIdAccessWhere(id, user),
      select: {
        addressLine1: true,
        addressLine2: true,
        city: true,
        companyTypeId: true,
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
        contactAffiliations: {
          orderBy: [
            { isPrimary: "desc" },
            { contact: { lastName: "asc" } },
            { contact: { firstName: "asc" } },
          ],
          where:
            user.role === "ADMIN"
              ? undefined
              : { contact: contactWhereWithAccess(user) },
          select: {
            isPrimary: true,
            responsibilities: true,
            contact: {
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
            },
          },
          take: 100,
        },
        country: true,
        county: true,
        domain: true,
        id: true,
        name: true,
        owner: true,
        ownerUserId: true,
        ownerUser: { select: { id: true, name: true, status: true } },
        parentCompanyId: true,
        postcode: true,
        status: true,
        updatedAt: true,
        _count: {
          select: {
            contactAffiliations: true,
            notes: true,
            tasks: true,
          },
        },
      },
    }),
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
    prisma.companyTypeDocumentRequirement.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: "asc" }, { label: "asc" }],
      select: {
        companyTypeId: true,
        description: true,
        displayOrder: true,
        id: true,
        isActive: true,
        isRequired: true,
        label: true,
        uploadType: true,
      },
    }),
    getCrmSettings(),
    prisma.fileAsset.findMany({
      where: { entityId: id, entityType: "Company" },
      orderBy: { createdAt: "desc" },
      take: 120,
      select: {
        createdAt: true,
        documentExpiresAt: true,
        documentIssuedAt: true,
        documentExpiryReminderAt: true,
        documentExpiryReminderDays: true,
        documentRenewalTaskId: true,
        documentFolder: true,
        documentUploadType: true,
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
    prisma.company.findMany({
      where: companyWhereWithAccess(user, { id: { not: id } }),
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
      take: 1_000,
    }),
    prisma.user.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
    }),
    user.role === "ADMIN"
      ? prisma.company.findMany({
          where: { id: { not: id } },
          orderBy: [{ name: "asc" }, { id: "asc" }],
          select: {
            companyType: { select: { name: true } },
            domain: true,
            id: true,
            name: true,
            status: true,
            _count: {
              select: {
                contactAffiliations: true,
                notes: true,
                opportunities: true,
                tasks: true,
              },
            },
          },
          take: 1_000,
        })
      : Promise.resolve([]),
    prisma.salesPipelineStage.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { bucket: true, id: true, name: true },
    }),
  ]);

  if (!company) {
    notFound();
  }

  const companyOpportunityRelationshipWhere = companyRelatedSalesWhere(
    company.id,
  );
  const companyNoteRelationshipWhere = {
    OR: [
      { companyId: company.id },
      {
        contact: {
          companyAffiliations: { some: { companyId: company.id } },
        },
      },
    ],
  } satisfies Prisma.NoteWhereInput;
  const companyTaskRelationshipWhere = {
    OR: [
      { companyId: company.id },
      {
        contact: {
          companyAffiliations: { some: { companyId: company.id } },
        },
      },
    ],
  } satisfies Prisma.TaskWhereInput;
  const companyTaskAccessWhere: Prisma.TaskWhereInput =
    user.role === "ADMIN"
      ? companyTaskRelationshipWhere
      : {
          AND: [
            companyTaskRelationshipWhere,
            {
              OR: [
                { assigneeId: user.id },
                { creatorId: user.id },
                { contact: contactAccessWhere(user) },
              ],
            },
          ],
        };

  const [
    parentCompany,
    childCompanies,
    activityCommunications,
    activityNotes,
    activityTasks,
    relatedCompanySales,
    relatedCompanySalesCount,
  ] = await Promise.all([
    company.parentCompanyId
      ? prisma.company.findFirst({
          where: companyIdAccessWhere(company.parentCompanyId, user),
          select: { id: true, name: true },
        })
      : Promise.resolve(null),
    prisma.company.findMany({
      where: companyWhereWithAccess(user, { parentCompanyId: company.id }),
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
      take: 250,
    }),
    prisma.salesCommunication.findMany({
      where: {
        opportunity: salesOpportunityWhereWithAccess(
          user,
          companyOpportunityRelationshipWhere,
        ),
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: 60,
      select: {
        channel: true,
        contact: { select: { firstName: true, lastName: true } },
        direction: true,
        id: true,
        occurredAt: true,
        opportunity: { select: { id: true, title: true } },
        subject: true,
        summary: true,
        user: { select: { email: true, name: true } },
      },
    }),
    prisma.note.findMany({
      where:
        user.role === "ADMIN"
          ? companyNoteRelationshipWhere
          : { AND: [companyNoteRelationshipWhere, { userId: user.id }] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 60,
      select: {
        body: true,
        contact: { select: { firstName: true, id: true, lastName: true } },
        createdAt: true,
        id: true,
        user: { select: { email: true, name: true } },
      },
    }),
    prisma.task.findMany({
      where: companyTaskAccessWhere,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 60,
      select: {
        assignee: { select: { email: true, name: true } },
        contact: { select: { firstName: true, id: true, lastName: true } },
        creator: { select: { email: true, name: true } },
        description: true,
        id: true,
        status: true,
        title: true,
        updatedAt: true,
      },
    }),
    prisma.salesOpportunity.findMany({
      where: salesOpportunityWhereWithAccess(
        user,
        companyOpportunityRelationshipWhere,
      ),
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 100,
      select: {
        closedAt: true,
        companyId: true,
        currency: true,
        id: true,
        nextStep: true,
        source: true,
        stage: true,
        title: true,
        updatedAt: true,
        valueCents: true,
        contact: {
          select: {
            firstName: true,
            id: true,
            lastName: true,
            companyAffiliations: {
              where: { companyId: company.id },
              select: { id: true },
              take: 1,
            },
          },
        },
        owner: { select: { name: true } },
        participants: {
          where: {
            contact: {
              companyAffiliations: { some: { companyId: company.id } },
            },
          },
          select: {
            role: true,
            contact: {
              select: { firstName: true, id: true, lastName: true },
            },
          },
          take: 5,
        },
        salesPipelineStage: { select: { name: true } },
      },
    }),
    prisma.salesOpportunity.count({
      where: salesOpportunityWhereWithAccess(
        user,
        companyOpportunityRelationshipWhere,
      ),
    }),
  ]);

  const activityItems: CompanyActivityItem[] = [
    ...activityCommunications.map((communication) => ({
      actor:
        communication.direction === "INBOUND"
          ? communication.contact
            ? contactName(communication.contact)
            : communication.user?.name ||
              communication.user?.email ||
              "External contact"
          : communication.user?.name ||
            communication.user?.email ||
            (communication.contact
              ? contactName(communication.contact)
              : "CRM user"),
      date: communication.occurredAt.toISOString(),
      detail: communication.opportunity.title,
      href: `/sales/${communication.opportunity.id}`,
      id: communication.id,
      kind: "Communication" as const,
      status: `${communication.direction === "INBOUND" ? "Received" : "Sent"} | ${communication.channel}`,
      summary: communication.summary,
      title: communication.subject || `${communication.channel} communication`,
    })),
    ...activityNotes.map((note) => ({
      actor: note.user.name || note.user.email,
      date: note.createdAt.toISOString(),
      detail: note.contact ? contactName(note.contact) : "Company note",
      href: note.contact ? `/contacts/${note.contact.id}` : null,
      id: note.id,
      kind: "Note" as const,
      status: null,
      summary: note.body,
      title: note.contact
        ? `Note about ${contactName(note.contact)}`
        : "Company note",
    })),
    ...activityTasks.map((task) => ({
      actor:
        task.assignee?.name ||
        task.assignee?.email ||
        task.creator.name ||
        task.creator.email,
      date: task.updatedAt.toISOString(),
      detail: task.contact ? contactName(task.contact) : "Company task",
      href: task.contact ? `/contacts/${task.contact.id}` : null,
      id: task.id,
      kind: "Task" as const,
      status: task.status.replaceAll("_", " "),
      summary: task.description || task.title,
      title: task.title,
    })),
  ]
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 100);

  const normalizedCompanyCustomFields = visibleCompanyFields(
    companyCustomFields,
    user,
  ).map((field) => ({
    ...field,
    isReadOnly: !canEditCompanyField(field, user),
    options: normalizeContactCustomFieldOptions(field.options),
  }));
  const ownerOptions = companyOwnerOptionsForUser(activeOwnerUsers, user);
  const salesDefaults = parseSalesDefaults(settings.salesDefaults);
  const saleOwnerOptions = saleOwnerOptionsForUser(activeOwnerUsers, user).map(
    (activeUser) => ({
      label: activeUser.name,
      value: activeUser.id,
    }),
  );
  const activePipelineStageOptions = pipelineStages.map((stage) => ({
    bucket: stage.bucket,
    label: stage.name,
    value: stage.id,
  }));
  const ownerLabel = company.ownerUser?.name ?? company.owner;
  const connectedPerson =
    company.contactAffiliations.find((affiliation) => affiliation.isPrimary)
      ?.contact ??
    company.contactAffiliations[0]?.contact ??
    null;
  const connectedSale =
    relatedCompanySales.find(
      (opportunity) =>
        !opportunity.closedAt &&
        opportunity.stage !== "WON" &&
        opportunity.stage !== "LOST",
    ) ??
    relatedCompanySales[0] ??
    null;
  const visibleCompanyCustomFieldIds = new Set(
    normalizedCompanyCustomFields.map((field) => field.id),
  );

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
    documentExpiresAt: document.documentExpiresAt?.toISOString() ?? null,
    documentIssuedAt: document.documentIssuedAt?.toISOString() ?? null,
    documentExpiryReminderAt:
      document.documentExpiryReminderAt?.toISOString() ?? null,
    documentExpiryReminderDays: document.documentExpiryReminderDays,
    documentRenewalTaskId: document.documentRenewalTaskId,
    documentFolder: document.documentFolder,
    documentUploadType: document.documentUploadType,
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
      ? {
          contacts: company._count.contactAffiliations,
          notes: company._count.notes,
          opportunities: relatedCompanySalesCount,
          tasks: company._count.tasks,
        }
      : {
          contacts: await prisma.companyContactAffiliation.count({
            where: {
              companyId: company.id,
              contact: contactWhereWithAccess(user),
            },
          }),
          notes: await prisma.note.count({
            where: { companyId: company.id, userId: user.id },
          }),
          opportunities: relatedCompanySalesCount,
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
    companyTypeId: company.companyTypeId,
    customFieldValues: Object.fromEntries(
      company.customFieldValues
        .filter((value) => visibleCompanyCustomFieldIds.has(value.fieldId))
        .map((value) => [
          value.fieldId,
          serializeCompanyCustomFieldValue(value),
        ]),
    ),
    name: company.name,
    owner: ownerLabel,
    ownerUserId: company.ownerUserId,
    postcode: company.postcode,
    status: company.status,
  };
  const companyType =
    companyTypes.find((type) => type.id === company.companyTypeId) ?? null;
  const companyTypeLabel = companyType?.name ?? "Other";
  const serializedCompanyCustomFieldValues =
    editableCompany.customFieldValues ?? {};
  const companyTypeCustomFields = normalizedCompanyCustomFields.filter(
    (field) => field.companyTypeId === company.companyTypeId,
  );
  const companyProfile = companyProfileCompleteness({
    companyTypeId: company.companyTypeId,
    definitions: normalizedCompanyCustomFields,
    values: serializedCompanyCustomFieldValues,
  });
  const companyDocumentStatuses = companyDocumentRequirementStatuses({
    companyTypeId: company.companyTypeId,
    documents: companyDocuments.map((document) => ({
      documentUploadType: document.documentUploadType,
      id: document.id,
    })),
    requirements: companyTypeDocumentRequirements.flatMap((requirement) => {
      const uploadType = parseCompanyDocumentUploadType(requirement.uploadType);
      return uploadType ? [{ ...requirement, uploadType }] : [];
    }),
  });
  const companyDetailPanel = (
    <div className="p-5">
      <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
        Company details
      </h2>
      <CompanyProfileCompleteness value={companyProfile} />
      <dl className="mt-4 grid gap-4 text-sm md:grid-cols-2">
        <div>
          <dt className="text-gray-500 dark:text-gray-400">Company type</dt>
          <dd className="mt-1">
            <StatusBadge>{companyTypeLabel}</StatusBadge>
            {companyType?.description ? (
              <span className="mt-1.5 block text-xs leading-5 text-gray-500 dark:text-gray-400">
                {companyType.description}
              </span>
            ) : null}
          </dd>
        </div>
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
            {ownerLabel ?? "Unassigned"}
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
        {companyTypeCustomFields.length ? (
          <div className="border-t border-gray-100 pt-4 md:col-span-2 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
              {companyTypeLabel} details
            </h3>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              {companyTypeCustomFields.map((field) => (
                <div key={field.id}>
                  <dt className="text-gray-500 dark:text-gray-400">
                    {field.label}
                  </dt>
                  <dd className="mt-1 font-medium break-words whitespace-pre-wrap text-gray-800 dark:text-white/90">
                    {formatCustomFieldValue(
                      serializedCompanyCustomFieldValues[field.id] ?? null,
                    )}
                  </dd>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </dl>
      <CompanyHierarchyEditor
        childCompanies={childCompanies}
        companyId={company.id}
        companyOptions={hierarchyCompanyOptions}
        hasRestrictedParent={Boolean(company.parentCompanyId && !parentCompany)}
        parentCompany={parentCompany}
      />
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
        <div className="flex items-center gap-2">
          <CompanyContactLinker companyId={company.id} />
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-gray-100 px-2 text-xs font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
            {scopedCounts.contacts}
          </span>
        </div>
      </div>
      <div className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
        {company.contactAffiliations.length ? (
          company.contactAffiliations.map((affiliation) => {
            const contact = affiliation.contact;
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

            const name = contactName(contact);

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
                    {name}
                  </Link>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {contact.role ?? "Role not set"}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className={
                        affiliation.isPrimary
                          ? "rounded-full bg-success-50 px-2 py-0.5 text-xs font-semibold text-success-700 dark:bg-success-500/10 dark:text-success-300"
                          : "rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
                      }
                    >
                      {affiliation.isPrimary
                        ? "Primary Company"
                        : "Additional Company"}
                    </span>
                    {!affiliation.isPrimary ? (
                      <CompanyContactPrimaryButton
                        companyId={company.id}
                        contactId={contact.id}
                      />
                    ) : null}
                  </div>
                  <CompanyContactResponsibilitiesEditor
                    companyId={company.id}
                    contactId={contact.id}
                    responsibilities={affiliation.responsibilities}
                  />
                  <CompanyContactUnlinkButton
                    companyId={company.id}
                    contactId={contact.id}
                    contactName={name}
                  />
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
          {relatedCompanySalesCount}
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {relatedCompanySales.length ? (
          relatedCompanySales.map((sale) => {
            const linkedPeople = [
              ...(sale.contact?.companyAffiliations.length
                ? [sale.contact]
                : []),
              ...sale.participants.map((participant) => participant.contact),
            ];
            const uniqueLinkedPeople = [
              ...new Map(
                linkedPeople.map((person) => [person.id, person]),
              ).values(),
            ];
            const relationshipLabel =
              sale.companyId === company.id
                ? "Direct company"
                : uniqueLinkedPeople.length
                  ? `Via ${contactName(uniqueLinkedPeople[0])}${
                      uniqueLinkedPeople.length > 1
                        ? ` +${uniqueLinkedPeople.length - 1}`
                        : ""
                    }`
                  : "Related company";

            return (
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
                      {[
                        relationshipLabel,
                        sale.source,
                        sale.owner?.name ?? "Unassigned",
                      ]
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
            );
          })
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
      <CompanyDocumentRequirements requirements={companyDocumentStatuses} />
      <RecordDocumentLibrary
        documentPortals={companyDocumentPortals}
        documentRequirements={companyDocumentStatuses.map(
          ({ description, isRequired, label, satisfied, uploadType }) => ({
            description,
            isRequired,
            label,
            satisfied,
            uploadType,
          }),
        )}
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
  const activityPanel = <CompanyActivityTimeline items={activityItems} />;

  return (
    <>
      <PageHeader
        title={company.name}
        description={company.domain ?? "Company record"}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <DeferredAddSaleModal
              contacts={company.contactAffiliations.map(({ contact }) => ({
                companyId: company.id,
                companyName: company.name,
                email: contact.email,
                id: contact.id,
                leadSource: contact.leadSource,
                name: contactName(contact),
                phone: contact.phone,
              }))}
              defaultOwnerId={resolveSalesDefaultOwnerId({
                fallbackUserId: user.id,
                salesDefaults,
              })}
              defaultStageId={salesDefaults.defaultSalesPipelineStageId}
              linkedCompany={{ id: company.id, name: company.name }}
              owners={saleOwnerOptions}
              stages={activePipelineStageOptions}
              triggerLabel="Create lead"
            />
            <DeferredCompanyEditModal
              addressLookupEnabled={addressLookupEnabled}
              company={editableCompany}
              companyTypes={companyTypes}
              customFields={normalizedCompanyCustomFields}
              ownerOptions={
                company.ownerUserId &&
                ownerLabel &&
                !ownerOptions.some((owner) => owner.id === company.ownerUserId)
                  ? [
                      ...ownerOptions,
                      { id: company.ownerUserId, name: ownerLabel },
                    ]
                  : ownerOptions
              }
            />
            {user.role === "ADMIN" ? (
              <>
                <DeferredCompanyMergeModal
                  candidates={mergeCompanyCandidates.map((candidate) => ({
                    companyType: candidate.companyType?.name ?? "Other",
                    domain: candidate.domain,
                    id: candidate.id,
                    name: candidate.name,
                    relatedCount:
                      candidate._count.contactAffiliations +
                      candidate._count.notes +
                      candidate._count.opportunities +
                      candidate._count.tasks,
                    status: candidate.status,
                  }))}
                  companyId={company.id}
                  companyName={company.name}
                />
                <DeferredCompanyDeleteModal
                  companyId={company.id}
                  companyName={company.name}
                  relatedRecords={scopedCounts}
                />
              </>
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

      <ConnectedRecordContext
        company={{
          detail: ownerLabel ? `Owner: ${ownerLabel}` : "Owner: Unassigned",
          label: "Company",
          meta: company.status,
          name: company.name,
        }}
        currentRecord="company"
        nextAction={connectedSale?.nextStep}
        person={
          connectedPerson
            ? {
                detail: connectedPerson.role || "Role not captured",
                href: `/contacts/${connectedPerson.id}`,
                label: "Primary person",
                name: contactName(connectedPerson),
              }
            : null
        }
        sale={
          connectedSale
            ? {
                detail: connectedSale.owner?.name
                  ? `Owner: ${connectedSale.owner.name}`
                  : "Owner: Unassigned",
                href: `/sales/${connectedSale.id}`,
                label: "Active sale",
                meta:
                  connectedSale.salesPipelineStage?.name ?? connectedSale.stage,
                name: connectedSale.title,
              }
            : null
        }
      />

      <CompanyDetailWorkspace
        activityPanel={activityPanel}
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
          companyTypeLabel,
          domain: company.domain,
          owner: ownerLabel,
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
