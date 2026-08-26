import "server-only";

import type { Prisma } from "@prisma/client";
import {
  ensureSpruceZapierIntegrationConnection,
  getSpruceZapierRuntimeConfig,
  spruceProvider,
} from "@/lib/integrations/spruce-zapier";
import { normalizedContactPhone } from "@/lib/phone-normalization";
import { prisma } from "@/lib/prisma";
import {
  parseSalesDefaults,
  resolveSalesDefaultOwnerId,
} from "@/lib/sales/defaults";
import {
  lifecycleOpportunityDataForPipelineStage,
  recordSalesOpportunityCreated,
} from "@/lib/sales/lifecycle";
import { getCrmSettings } from "@/lib/settings";
import { parseWorkspaceDefaults } from "@/lib/workspace-defaults";

const spruceImportSource = "spruce-zapier-import";
const spruceExternalTypes = {
  job: "job",
} as const;
const spruceInternalTypes = {
  opportunity: "salesOpportunity",
} as const;
const spruceCustomerNotesExternalIdPrefix = "spruce:job-customer-notes:";
const spruceImportExternalIdPrefix = "spruce:job-import:";

type SpruceJobImportStatus = "created" | "linked_existing" | "skipped";

export type SpruceJobPayloadMapping = {
  address: string | null;
  attribution: Prisma.InputJsonObject;
  contact: {
    email: string | null;
    firstName: string;
    lastName: string;
    leadSource: string;
    phone: string | null;
    phoneNormalized: string | null;
    role: string;
  };
  crmSaleId: string | null;
  customerNotes: string | null;
  eventName: string | null;
  externalJobId: string | null;
  leadScope: Prisma.InputJsonObject;
  opportunity: {
    currency: string;
    nextStep: string;
    source: string;
    title: string;
  };
  occurredAt: Date;
  postcode: string | null;
  status: string | null;
  systemCommunication: {
    body: string;
    metadata: Prisma.InputJsonObject;
    subject: string;
    summary: string;
  };
};

export type SpruceJobImportResult = {
  contactId: string | null;
  created: {
    contact: boolean;
    opportunity: boolean;
  };
  externalJobId: string | null;
  opportunityId: string | null;
  recordsWritten: number;
  status: SpruceJobImportStatus;
  title: string | null;
  updated: {
    contact: boolean;
    note: boolean;
    opportunity: boolean;
  };
  warnings: string[];
};

export async function importSpruceJobCreatedPayload({
  integrationId = null,
  now = new Date(),
  payload,
}: {
  integrationId?: string | null;
  now?: Date;
  payload: unknown;
}): Promise<SpruceJobImportResult> {
  const [runtimeConfig, settings, ensuredConnection] = await Promise.all([
    getSpruceZapierRuntimeConfig(),
    getCrmSettings(),
    integrationId
      ? Promise.resolve(null)
      : ensureSpruceZapierIntegrationConnection(),
  ]);
  const workspaceDefaults = parseWorkspaceDefaults(settings.workspaceDefaults);
  const salesDefaults = parseSalesDefaults(settings.salesDefaults);
  const resolvedIntegrationId = integrationId ?? ensuredConnection?.id ?? null;
  const mapping = mapSpruceJobPayloadToCrm({
    defaultLeadSource: runtimeConfig.defaultLeadSource,
    now,
    payload,
    workspaceCurrency: workspaceDefaults.currency,
  });

  if (!mapping.externalJobId) {
    return skippedSpruceJobResult({
      title: mapping.opportunity.title,
      warning: "Spruce job webhook was missing job_id.",
    });
  }

  const externalJobId = mapping.externalJobId;

  return prisma.$transaction(async (tx) => {
    const existingJobLink = await tx.externalRecordLink.findUnique({
      where: {
        provider_externalType_externalId: {
          externalId: externalJobId,
          externalType: spruceExternalTypes.job,
          provider: spruceProvider,
        },
      },
      select: { internalId: true, internalType: true },
    });

    if (
      existingJobLink?.internalType === spruceInternalTypes.opportunity &&
      existingJobLink.internalId
    ) {
      return updateExistingSpruceSale(tx, {
        integrationId: resolvedIntegrationId,
        mapping,
        now,
        opportunityId: existingJobLink.internalId,
      });
    }

    if (mapping.crmSaleId) {
      const linkedSale = await tx.salesOpportunity.findUnique({
        where: { id: mapping.crmSaleId },
        select: { id: true },
      });

      if (linkedSale) {
        return updateExistingSpruceSale(tx, {
          integrationId: resolvedIntegrationId,
          mapping,
          now,
          opportunityId: linkedSale.id,
        });
      }
    }

    const contactResult = await resolveSpruceContact(tx, {
      mapping,
    });
    const occurredAt = mapping.occurredAt;
    const lifecycleData = await lifecycleOpportunityDataForPipelineStage(
      tx,
      salesDefaults.defaultSalesPipelineStageId,
      "LEAD",
      occurredAt,
    );
    const opportunity = await tx.salesOpportunity.create({
      data: {
        title: mapping.opportunity.title,
        ...lifecycleData,
        attribution: mapping.attribution,
        contactId: contactResult.contact.id,
        currency: mapping.opportunity.currency,
        leadScope: mapping.leadScope,
        nextStep: mapping.opportunity.nextStep,
        ownerId: resolveSalesDefaultOwnerId({ salesDefaults }),
        source: mapping.opportunity.source,
        valueCents: 0,
      },
      select: { id: true },
    });
    let recordsWritten = contactResult.created ? 2 : 1;

    if (contactResult.updated) {
      recordsWritten += 1;
    }

    await recordSalesOpportunityCreated(tx, {
      opportunityId: opportunity.id,
      occurredAt,
      salesPipelineStageId: lifecycleData.salesPipelineStageId,
      source: spruceImportSource,
      stage: lifecycleData.stage,
    });
    recordsWritten += 1;

    await tx.salesCommunication.create({
      data: {
        opportunityId: opportunity.id,
        body: mapping.systemCommunication.body,
        channel: "SYSTEM",
        contactId: contactResult.contact.id,
        direction: "INTERNAL",
        externalId: `${spruceImportExternalIdPrefix}${mapping.externalJobId}`,
        metadata: mapping.systemCommunication.metadata,
        occurredAt,
        subject: mapping.systemCommunication.subject,
        summary: mapping.systemCommunication.summary,
      },
      select: { id: true },
    });
    recordsWritten += 1;

    const noteResult = await upsertSpruceCustomerNote(tx, {
      contactId: contactResult.contact.id,
      mapping,
      opportunityId: opportunity.id,
    });
    recordsWritten += noteResult.created + noteResult.updated;

    await upsertSpruceExternalRecordLink(tx, {
      externalId: externalJobId,
      integrationId: resolvedIntegrationId,
      internalId: opportunity.id,
      internalType: spruceInternalTypes.opportunity,
      metadata: mapping.systemCommunication.metadata,
      now,
    });
    recordsWritten += 1;

    return {
      contactId: contactResult.contact.id,
      created: {
        contact: contactResult.created,
        opportunity: true,
      },
      externalJobId: mapping.externalJobId,
      opportunityId: opportunity.id,
      recordsWritten,
      status: "created" as const,
      title: mapping.opportunity.title,
      updated: {
        contact: contactResult.updated,
        note: noteResult.updated > 0,
        opportunity: false,
      },
      warnings: [],
    };
  });
}

export function mapSpruceJobPayloadToCrm({
  defaultLeadSource,
  now,
  payload,
  workspaceCurrency,
}: {
  defaultLeadSource: string;
  now: Date;
  payload: unknown;
  workspaceCurrency: string;
}): SpruceJobPayloadMapping {
  const body = objectValue(payload);
  const data = objectValue(body.data);
  const job = objectValue(body.job ?? data.job);
  const homeowner = objectValue(
    body.homeowner ?? data.homeowner ?? body.customer ?? data.customer,
  );
  const eventName =
    firstText(
      body.event,
      body.event_type,
      body.eventType,
      data.event,
      data.event_type,
      data.eventType,
    ) ?? null;
  const externalJobId = firstText(
    body.job_id,
    body.jobId,
    data.job_id,
    data.jobId,
    job.id,
    body.id,
    data.id,
  );
  const firstName = firstText(
    body.homeowner_first_name,
    body.homeownerFirstName,
    data.homeowner_first_name,
    data.homeownerFirstName,
    homeowner.first_name,
    homeowner.firstName,
  );
  const lastName = firstText(
    body.homeowner_last_name,
    body.homeownerLastName,
    data.homeowner_last_name,
    data.homeownerLastName,
    homeowner.last_name,
    homeowner.lastName,
  );
  const email = emailValue(
    firstText(
      body.homeowner_email,
      body.homeownerEmail,
      data.homeowner_email,
      data.homeownerEmail,
      homeowner.email,
      body.email,
      data.email,
    ),
  );
  const phone = firstText(
    body.homeowner_phone,
    body.homeownerPhone,
    data.homeowner_phone,
    data.homeownerPhone,
    homeowner.phone,
    body.phone,
    data.phone,
  );
  const address = firstText(
    body.address,
    body.property_address,
    body.propertyAddress,
    data.address,
    data.property_address,
    data.propertyAddress,
    job.address,
  );
  const postcode = firstText(
    body.postcode,
    body.post_code,
    body.postCode,
    data.postcode,
    data.post_code,
    data.postCode,
    job.postcode,
  );
  const customerNotes = firstText(
    body.customer_notes,
    body.customerNotes,
    data.customer_notes,
    data.customerNotes,
    job.customer_notes,
    job.customerNotes,
  );
  const crmSaleId =
    firstText(
      body.crm_sale_id,
      body.crmSaleId,
      data.crm_sale_id,
      data.crmSaleId,
      job.crm_sale_id,
      job.crmSaleId,
    ) ?? crmSaleIdFromText(customerNotes);
  const status = firstText(body.status, data.status, job.status);
  const occurredAt =
    dateValue(
      firstText(
        body.timestamp,
        body.created_at,
        body.createdAt,
        data.timestamp,
        data.created_at,
        data.createdAt,
        job.created_at,
        job.createdAt,
      ),
    ) ?? now;
  const safeFirstName = firstName ?? "Spruce";
  const safeLastName = lastName ?? "Customer";
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  const titleSubject = fullName || address || postcode || externalJobId || "job";
  const title = truncateText(`Spruce job - ${titleSubject}`, 160);
  const phoneNormalized = normalizedContactPhone(phone);
  const leadSource = cleanText(defaultLeadSource) ?? "Spruce";
  const attribution = jsonObject({
    address,
    eventName,
    externalJobId,
    crmSaleId,
    homeownerEmail: email,
    homeownerPhone: phone,
    importedFrom: "spruce",
    outboundWriteBackDisabled: true,
    postcode,
    provider: spruceProvider,
    source: spruceImportSource,
    status,
  });
  const leadScope = jsonObject({
    address,
    crmSaleId,
    externalJobId,
    importedFrom: "spruce",
    postcode,
    status,
  });
  const summary = truncateText(
    [
      `Imported Spruce job ${externalJobId ?? "without job ID"}.`,
      fullName ? `Homeowner: ${fullName}.` : null,
      address ? `Address: ${address}.` : null,
      postcode ? `Postcode: ${postcode}.` : null,
      status ? `Status: ${status}.` : null,
    ]
      .filter(Boolean)
      .join(" "),
    240,
  );
  const bodyLines = [
    `Spruce job ID: ${externalJobId ?? "Missing"}`,
    eventName ? `Event: ${eventName}` : null,
    `Homeowner: ${fullName || "Not supplied"}`,
    email ? `Email: ${email}` : null,
    phone ? `Phone: ${phone}` : null,
    address ? `Address: ${address}` : null,
    postcode ? `Postcode: ${postcode}` : null,
    status ? `Status: ${status}` : null,
  ].filter(Boolean);

  return {
    address,
    attribution,
    contact: {
      email,
      firstName: safeFirstName,
      lastName: safeLastName,
      leadSource,
      phone,
      phoneNormalized,
      role: "Spruce job homeowner",
    },
    crmSaleId,
    customerNotes,
    eventName,
    externalJobId,
    leadScope,
    opportunity: {
      currency: workspaceCurrency,
      nextStep: "Review Spruce job in CRM and follow up.",
      source: leadSource,
      title,
    },
    occurredAt,
    postcode,
    status,
    systemCommunication: {
      body: bodyLines.join("\n"),
      metadata: attribution,
      subject: "Spruce job imported",
      summary,
    },
  };
}

async function updateExistingSpruceSale(
  tx: Prisma.TransactionClient,
  {
    integrationId,
    mapping,
    now,
    opportunityId,
  }: {
    integrationId: string | null;
    mapping: SpruceJobPayloadMapping;
    now: Date;
    opportunityId: string;
  },
): Promise<SpruceJobImportResult> {
  const opportunity = await tx.salesOpportunity.findUnique({
    where: { id: opportunityId },
    select: {
      contactId: true,
      id: true,
      source: true,
      title: true,
    },
  });

  if (!opportunity) {
    return skippedSpruceJobResult({
      externalJobId: mapping.externalJobId,
      title: mapping.opportunity.title,
      warning: "Spruce job is linked to a CRM sale that no longer exists.",
    });
  }

  let recordsWritten = 0;
  let contactUpdated = false;

  if (opportunity.contactId) {
    const contact = await tx.contact.findUnique({
      where: { id: opportunity.contactId },
      select: spruceContactSelect,
    });

    if (contact) {
      const contactUpdate = missingContactUpdateData(contact, mapping);
      if (Object.keys(contactUpdate).length) {
        await tx.contact.update({
          where: { id: contact.id },
          data: contactUpdate,
          select: { id: true },
        });
        contactUpdated = true;
        recordsWritten += 1;
      }
    }
  }

  await tx.salesOpportunity.update({
    where: { id: opportunity.id },
    data: {
      attribution: mapping.attribution,
      leadScope: mapping.leadScope,
      source: opportunity.source ?? mapping.opportunity.source,
    },
    select: { id: true },
  });
  recordsWritten += 1;

  const noteResult = await upsertSpruceCustomerNote(tx, {
    contactId: opportunity.contactId,
    mapping,
    opportunityId: opportunity.id,
  });
  recordsWritten += noteResult.created + noteResult.updated;

  if (mapping.externalJobId) {
    await upsertSpruceExternalRecordLink(tx, {
      externalId: mapping.externalJobId,
      integrationId,
      internalId: opportunity.id,
      internalType: spruceInternalTypes.opportunity,
      metadata: mapping.systemCommunication.metadata,
      now,
    });
    recordsWritten += 1;
  }

  return {
    contactId: opportunity.contactId,
    created: {
      contact: false,
      opportunity: false,
    },
    externalJobId: mapping.externalJobId,
    opportunityId: opportunity.id,
    recordsWritten,
    status: "linked_existing",
    title: opportunity.title,
    updated: {
      contact: contactUpdated,
      note: noteResult.updated > 0 || noteResult.created > 0,
      opportunity: true,
    },
    warnings: [],
  };
}

const spruceContactSelect = {
  addressLine1: true,
  attribution: true,
  email: true,
  firstName: true,
  id: true,
  lastName: true,
  leadSource: true,
  phone: true,
  phoneNormalized: true,
  postcode: true,
  role: true,
} satisfies Prisma.ContactSelect;

type SpruceContactRecord = Prisma.ContactGetPayload<{
  select: typeof spruceContactSelect;
}>;

async function resolveSpruceContact(
  tx: Prisma.TransactionClient,
  {
    mapping,
  }: {
    mapping: SpruceJobPayloadMapping;
  },
) {
  const existingContact = await findMatchingSpruceContact(tx, mapping);

  if (existingContact) {
    const updateData = missingContactUpdateData(existingContact, mapping);

    if (Object.keys(updateData).length) {
      const contact = await tx.contact.update({
        where: { id: existingContact.id },
        data: updateData,
        select: { id: true },
      });

      return { contact, created: false, updated: true };
    }

    return {
      contact: { id: existingContact.id },
      created: false,
      updated: false,
    };
  }

  const contact = await tx.contact.create({
    data: {
      addressLine1: mapping.address,
      attribution: mapping.attribution,
      email: mapping.contact.email,
      firstName: mapping.contact.firstName,
      lastName: mapping.contact.lastName,
      leadSource: mapping.contact.leadSource,
      phone: mapping.contact.phone,
      phoneNormalized: mapping.contact.phoneNormalized,
      postcode: mapping.postcode,
      role: mapping.contact.role,
    },
    select: { id: true },
  });

  return { contact, created: true, updated: false };
}

async function findMatchingSpruceContact(
  tx: Prisma.TransactionClient,
  mapping: SpruceJobPayloadMapping,
) {
  const matchFilters: Prisma.ContactWhereInput[] = [];

  if (mapping.contact.email) {
    matchFilters.push({
      OR: [
        {
          email: {
            equals: mapping.contact.email,
            mode: "insensitive",
          },
        },
        {
          additionalEmails: {
            some: {
              email: {
                equals: mapping.contact.email,
                mode: "insensitive",
              },
            },
          },
        },
      ],
    });
  }

  if (mapping.contact.phoneNormalized) {
    matchFilters.push({
      OR: [
        { phoneNormalized: mapping.contact.phoneNormalized },
        {
          additionalPhones: {
            some: { phoneNormalized: mapping.contact.phoneNormalized },
          },
        },
      ],
    });
  }

  if (!matchFilters.length) return null;

  return tx.contact.findFirst({
    where: { OR: matchFilters },
    orderBy: { updatedAt: "desc" },
    select: spruceContactSelect,
  });
}

function missingContactUpdateData(
  contact: SpruceContactRecord,
  mapping: SpruceJobPayloadMapping,
) {
  const data: Prisma.ContactUpdateInput = {};

  if (!contact.email && mapping.contact.email) data.email = mapping.contact.email;
  if (!contact.phone && mapping.contact.phone) data.phone = mapping.contact.phone;
  if (!contact.phoneNormalized && mapping.contact.phoneNormalized) {
    data.phoneNormalized = mapping.contact.phoneNormalized;
  }
  if (!contact.leadSource) data.leadSource = mapping.contact.leadSource;
  if (!contact.role) data.role = mapping.contact.role;
  if (!contact.addressLine1 && mapping.address) data.addressLine1 = mapping.address;
  if (!contact.postcode && mapping.postcode) data.postcode = mapping.postcode;
  if (!contact.attribution) data.attribution = mapping.attribution;

  return data;
}

async function upsertSpruceCustomerNote(
  tx: Prisma.TransactionClient,
  {
    contactId,
    mapping,
    opportunityId,
  }: {
    contactId: string | null;
    mapping: SpruceJobPayloadMapping;
    opportunityId: string;
  },
) {
  if (!mapping.customerNotes || !mapping.externalJobId) {
    return { created: 0, updated: 0 };
  }

  const externalId = `${spruceCustomerNotesExternalIdPrefix}${mapping.externalJobId}`;
  const body = mapping.customerNotes;
  const noteData = {
    body,
    channel: "NOTE" as const,
    contactId,
    direction: "INTERNAL" as const,
    externalId,
    metadata: {
      ...mapping.attribution,
      source: `${spruceImportSource}:customer-notes`,
    } satisfies Prisma.InputJsonObject,
    occurredAt: mapping.occurredAt,
    opportunityId,
    subject: "Spruce customer notes",
    summary: truncateText(body.replace(/\s+/g, " "), 180),
  };
  const existingNote = await tx.salesCommunication.findFirst({
    where: {
      externalId,
      opportunityId,
    },
    select: { id: true },
  });

  if (existingNote) {
    await tx.salesCommunication.update({
      where: { id: existingNote.id },
      data: noteData,
      select: { id: true },
    });

    return { created: 0, updated: 1 };
  }

  await tx.salesCommunication.create({
    data: noteData,
    select: { id: true },
  });

  return { created: 1, updated: 0 };
}

async function upsertSpruceExternalRecordLink(
  tx: Prisma.TransactionClient,
  {
    externalId,
    integrationId,
    internalId,
    internalType,
    metadata,
    now,
  }: {
    externalId: string;
    integrationId: string | null;
    internalId: string;
    internalType: string;
    metadata: Prisma.InputJsonObject;
    now: Date;
  },
) {
  await tx.externalRecordLink.upsert({
    where: {
      provider_externalType_externalId: {
        externalId,
        externalType: spruceExternalTypes.job,
        provider: spruceProvider,
      },
    },
    create: {
      externalId,
      externalType: spruceExternalTypes.job,
      integrationId,
      internalId,
      internalType,
      lastSeenAt: now,
      metadata,
      provider: spruceProvider,
    },
    update: {
      integrationId,
      internalId,
      internalType,
      lastSeenAt: now,
      metadata,
    },
  });
}

function skippedSpruceJobResult({
  externalJobId = null,
  title = null,
  warning,
}: {
  externalJobId?: string | null;
  title?: string | null;
  warning: string;
}): SpruceJobImportResult {
  return {
    contactId: null,
    created: {
      contact: false,
      opportunity: false,
    },
    externalJobId,
    opportunityId: null,
    recordsWritten: 0,
    status: "skipped",
    title,
    updated: {
      contact: false,
      note: false,
      opportunity: false,
    },
    warnings: [warning],
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanText(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value !== "string") return null;

  const text = value.trim();

  return text ? text : null;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }

  return null;
}

function emailValue(value: string | null) {
  const email = cleanText(value)?.toLowerCase();

  return email && email.includes("@") ? email : null;
}

function dateValue(value: string | null) {
  if (!value) return null;

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function crmSaleIdFromText(value: string | null) {
  if (!value) return null;

  return value.match(/\bCRM sale ID:\s*([a-z0-9]+)/i)?.[1] ?? null;
}

function jsonObject(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue != null),
  ) as Prisma.InputJsonObject;
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;

  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}
