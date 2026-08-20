import "server-only";

import type { Prisma } from "@prisma/client";
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
import {
  defaultPipedriveLeadSource,
  getPipedriveReadOnlyClient,
  pipedriveProvider,
  type PipedriveLead,
  type PipedriveListLeadsParams,
  type PipedriveListResult,
  type PipedriveOrganization,
  type PipedrivePerson,
  type PipedriveReadOnlyClient,
} from "@/lib/integrations/pipedrive";

const pipedriveImportSource = "pipedrive-import";
const pipedriveExternalTypes = {
  lead: "lead",
  organization: "organization",
  person: "person",
} as const;
const pipedriveInternalTypes = {
  company: "company",
  contact: "contact",
  opportunity: "salesOpportunity",
} as const;

type JsonObject = Record<string, unknown>;

type PipedriveRelatedRecordClient = Pick<
  PipedriveReadOnlyClient,
  "defaultLeadSource" | "getOrganization" | "getPerson"
>;

export type PipedriveImportClient = PipedriveRelatedRecordClient &
  Pick<PipedriveReadOnlyClient, "listLeads">;

export type PipedriveSelectedImportClient = PipedriveRelatedRecordClient &
  Pick<PipedriveReadOnlyClient, "getLead">;

export type PipedriveLeadImportMapping = {
  company: {
    addressLine1: string | null;
    name: string;
  } | null;
  contact: {
    companyName: string | null;
    email: string | null;
    firstName: string;
    lastName: string;
    leadSource: string;
    phone: string | null;
    phoneNormalized: string | null;
    role: string | null;
  } | null;
  externalIds: {
    lead: string | null;
    organization: string | null;
    person: string | null;
  };
  opportunity: {
    attribution: Prisma.InputJsonObject;
    currency: string;
    expectedCloseDate: Date | null;
    nextStep: string;
    source: string;
    title: string;
    valueCents: number;
  };
  communication: {
    body: string;
    fromAddress: string | null;
    metadata: Prisma.InputJsonObject;
    subject: string;
    summary: string;
  };
};

export type PipedriveLeadImportResult = {
  companyId: string | null;
  contactId: string | null;
  created: {
    company: boolean;
    contact: boolean;
    opportunity: boolean;
  };
  externalLeadId: string | null;
  opportunityId: string | null;
  status: "created" | "linked_existing" | "skipped";
  title: string | null;
  warnings: string[];
};

export type PipedriveLeadPreviewResult = {
  companyName: string | null;
  contactEmail: string | null;
  contactName: string | null;
  contactPhone: string | null;
  currency: string | null;
  expectedCloseDate: Date | null;
  externalLeadId: string | null;
  linkedOpportunityId: string | null;
  status: "would_create" | "linked_existing" | "skipped";
  title: string | null;
  valueCents: number | null;
  warnings: string[];
};

export type PipedriveLeadPreviewMetadataRow = {
  companyName: string | null;
  contactEmail: string | null;
  contactName: string | null;
  contactPhone: string | null;
  currency: string | null;
  expectedCloseDate: string | null;
  externalLeadId: string | null;
  linkedOpportunityId: string | null;
  status: PipedriveLeadPreviewResult["status"];
  title: string | null;
  valueCents: number | null;
  warningCount: number;
  warnings: string[];
};

export type PipedriveLeadImportMetadataRow = {
  companyId: string | null;
  contactId: string | null;
  createdCompany: boolean;
  createdContact: boolean;
  createdOpportunity: boolean;
  externalLeadId: string | null;
  opportunityId: string | null;
  status: PipedriveLeadImportResult["status"];
  title: string | null;
  warningCount: number;
  warnings: string[];
};

type ResolvedCompany = {
  created: boolean;
  id: string | null;
  name: string | null;
};

type ResolvedContact = {
  created: boolean;
  id: string | null;
};

type ImportLeadRecordOptions = {
  client: PipedriveRelatedRecordClient;
  lead: PipedriveLead;
  now?: Date;
};

type ImportLeadPageOptions = {
  client?: PipedriveImportClient | null;
  params?: PipedriveListLeadsParams;
};

type PreviewLeadRecordOptions = {
  client: PipedriveRelatedRecordClient;
  lead: PipedriveLead;
};

type PreviewLeadPageOptions = {
  client?: PipedriveImportClient | null;
  params?: PipedriveListLeadsParams;
};

type ImportLeadIdsOptions = {
  client?: PipedriveSelectedImportClient | null;
  leadIds: string[];
  now?: Date;
};

type ImportedRelatedRecords = {
  organization: PipedriveOrganization | null;
  person: PipedrivePerson | null;
  warnings: string[];
};

export async function importPipedriveLeadPage({
  client,
  params = {},
}: ImportLeadPageOptions = {}) {
  const readClient = client ?? (await getPipedriveReadOnlyClient());

  if (!readClient) {
    return {
      results: [],
      skipped: 0,
      status: "not_configured" as const,
    };
  }

  const page = await readClient.listLeads(latestLeadListParams(params));
  const results: PipedriveLeadImportResult[] = [];

  for (const lead of page.data) {
    results.push(await importPipedriveLeadRecord({ client: readClient, lead }));
  }

  return {
    created: results.filter((result) => result.status === "created").length,
    linkedExisting: results.filter(
      (result) => result.status === "linked_existing",
    ).length,
    page: page as PipedriveListResult<PipedriveLead>,
    results,
    skipped: results.filter((result) => result.status === "skipped").length,
    status: "ok" as const,
  };
}

export async function previewPipedriveLeadPage({
  client,
  params = {},
}: PreviewLeadPageOptions = {}) {
  const readClient = client ?? (await getPipedriveReadOnlyClient());

  if (!readClient) {
    return {
      linkedExisting: 0,
      page: null,
      previews: [],
      skipped: 0,
      status: "not_configured" as const,
      wouldCreate: 0,
    };
  }

  const page = await readClient.listLeads(latestLeadListParams(params));
  const previews = await Promise.all(
    page.data.map((lead) =>
      previewPipedriveLeadRecord({ client: readClient, lead }),
    ),
  );

  return {
    linkedExisting: previews.filter(
      (preview) => preview.status === "linked_existing",
    ).length,
    page: page as PipedriveListResult<PipedriveLead>,
    previews,
    skipped: previews.filter((preview) => preview.status === "skipped").length,
    status: "ok" as const,
    wouldCreate: previews.filter(
      (preview) => preview.status === "would_create",
    ).length,
  };
}

export async function previewPipedriveLeadRecord({
  client,
  lead,
}: PreviewLeadRecordOptions): Promise<PipedriveLeadPreviewResult> {
  const leadId = externalId(lead.id);

  if (!leadId) {
    return skippedLeadPreviewResult({
      lead,
      warning: "Pipedrive lead was missing an ID.",
    });
  }

  const [existingLeadLink, relatedRecords, settings] = await Promise.all([
    prisma.externalRecordLink.findUnique({
      where: {
        provider_externalType_externalId: {
          externalId: leadId,
          externalType: pipedriveExternalTypes.lead,
          provider: pipedriveProvider,
        },
      },
      select: { internalId: true, internalType: true },
    }),
    fetchRelatedRecords(client, lead),
    getCrmSettings(),
  ]);
  const workspaceDefaults = parseWorkspaceDefaults(settings.workspaceDefaults);
  const mapping = mapPipedriveLeadToCrm({
    defaultLeadSource: client.defaultLeadSource,
    lead,
    organization: relatedRecords.organization,
    person: relatedRecords.person,
    workspaceCurrency: workspaceDefaults.currency,
  });
  const externalLeadId = mapping.externalIds.lead;

  if (!externalLeadId) {
    return skippedLeadPreviewResult({
      lead,
      warning: "Pipedrive lead was missing an ID.",
    });
  }

  const preview = previewFieldsFromMapping(mapping);

  if (
    existingLeadLink?.internalType === pipedriveInternalTypes.opportunity
  ) {
    return {
      ...preview,
      externalLeadId,
      linkedOpportunityId: existingLeadLink.internalId,
      status: "linked_existing",
      warnings: relatedRecords.warnings,
    };
  }

  return {
    ...preview,
    externalLeadId,
    linkedOpportunityId: null,
    status: "would_create",
    warnings: relatedRecords.warnings,
  };
}

export function pipedriveLeadPreviewMetadataRows(
  previews: PipedriveLeadPreviewResult[],
): PipedriveLeadPreviewMetadataRow[] {
  return previews.map((preview) => ({
    companyName: previewMetadataText(preview.companyName),
    contactEmail: previewMetadataText(preview.contactEmail),
    contactName: previewMetadataText(preview.contactName),
    contactPhone: previewMetadataText(preview.contactPhone),
    currency: previewMetadataText(preview.currency),
    expectedCloseDate: preview.expectedCloseDate
      ? preview.expectedCloseDate.toISOString().slice(0, 10)
      : null,
    externalLeadId: previewMetadataText(preview.externalLeadId),
    linkedOpportunityId: previewMetadataText(preview.linkedOpportunityId),
    status: preview.status,
    title: previewMetadataText(preview.title),
    valueCents: preview.valueCents,
    warningCount: preview.warnings.length,
    warnings: preview.warnings
      .slice(0, 3)
      .map((warning) => truncateText(warning, 240)),
  }));
}

export function pipedriveLeadImportMetadataRows(
  results: PipedriveLeadImportResult[],
): PipedriveLeadImportMetadataRow[] {
  return results.map((result) => ({
    companyId: previewMetadataText(result.companyId),
    contactId: previewMetadataText(result.contactId),
    createdCompany: result.created.company,
    createdContact: result.created.contact,
    createdOpportunity: result.created.opportunity,
    externalLeadId: previewMetadataText(result.externalLeadId),
    opportunityId: previewMetadataText(result.opportunityId),
    status: result.status,
    title: previewMetadataText(result.title),
    warningCount: result.warnings.length,
    warnings: result.warnings
      .slice(0, 3)
      .map((warning) => truncateText(warning, 240)),
  }));
}

export async function importPipedriveLeadIds({
  client,
  leadIds,
  now = new Date(),
}: ImportLeadIdsOptions) {
  const selectedLeadIds = normalizedSelectedLeadIds(leadIds);
  const readClient = client ?? (await getPipedriveReadOnlyClient());

  if (!readClient) {
    return {
      requested: selectedLeadIds.length,
      results: [],
      skipped: selectedLeadIds.length,
      status: "not_configured" as const,
    };
  }

  const results: PipedriveLeadImportResult[] = [];

  for (const leadId of selectedLeadIds) {
    try {
      const lead = await readClient.getLead(leadId);
      results.push(
        await importPipedriveLeadRecord({
          client: readClient,
          lead,
          now,
        }),
      );
    } catch (error) {
      results.push(
        skippedLeadResult({
          externalLeadId: leadId,
          warning: pipedriveReadWarning("lead", leadId, error),
        }),
      );
    }
  }

  return {
    created: results.filter((result) => result.status === "created").length,
    linkedExisting: results.filter(
      (result) => result.status === "linked_existing",
    ).length,
    requested: selectedLeadIds.length,
    results,
    skipped: results.filter((result) => result.status === "skipped").length,
    status: "ok" as const,
  };
}

export async function importPipedriveLeadRecord({
  client,
  lead,
  now = new Date(),
}: ImportLeadRecordOptions): Promise<PipedriveLeadImportResult> {
  const leadId = externalId(lead.id);

  if (!leadId) {
    return skippedLeadResult({
      title: cleanText(lead.title),
      warning: "Pipedrive lead was missing an ID.",
    });
  }

  const [integration, relatedRecords, settings] = await Promise.all([
    prisma.integrationConnection.findUnique({
      where: { provider: pipedriveProvider },
      select: { id: true },
    }),
    fetchRelatedRecords(client, lead),
    getCrmSettings(),
  ]);
  const integrationId = integration?.id ?? null;
  const workspaceDefaults = parseWorkspaceDefaults(settings.workspaceDefaults);
  const salesDefaults = parseSalesDefaults(settings.salesDefaults);
  const mapping = mapPipedriveLeadToCrm({
    defaultLeadSource: client.defaultLeadSource,
    lead,
    organization: relatedRecords.organization,
    person: relatedRecords.person,
    workspaceCurrency: workspaceDefaults.currency,
  });

  const externalLeadId = mapping.externalIds.lead;

  if (!externalLeadId) {
    return skippedLeadResult({
      title: mapping.opportunity.title,
      warning: "Pipedrive lead was missing an ID.",
    });
  }

  return prisma.$transaction(async (tx) => {
    const existingLeadLink = await tx.externalRecordLink.findUnique({
      where: {
        provider_externalType_externalId: {
          externalId: externalLeadId,
          externalType: pipedriveExternalTypes.lead,
          provider: pipedriveProvider,
        },
      },
      select: { internalId: true, internalType: true },
    });

    if (
      existingLeadLink?.internalType === pipedriveInternalTypes.opportunity
    ) {
      await upsertExternalRecordLink(tx, {
        externalId: externalLeadId,
        externalType: pipedriveExternalTypes.lead,
        integrationId,
        internalId: existingLeadLink.internalId,
        internalType: pipedriveInternalTypes.opportunity,
        metadata: mapping.communication.metadata,
        now,
      });

      return {
        companyId: null,
        contactId: null,
        created: { company: false, contact: false, opportunity: false },
        externalLeadId,
        opportunityId: existingLeadLink.internalId,
        status: "linked_existing" as const,
        title: mapping.opportunity.title,
        warnings: relatedRecords.warnings,
      };
    }

    const company = await resolvePipedriveCompany(tx, {
      integrationId,
      mapping,
      now,
    });
    const contact = await resolvePipedriveContact(tx, {
      company,
      integrationId,
      mapping,
      now,
    });
    const occurredAt = now;
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
        attribution: mapping.opportunity.attribution,
        companyId: company.id,
        contactId: contact.id,
        currency: mapping.opportunity.currency,
        expectedCloseDate: mapping.opportunity.expectedCloseDate,
        nextStep: mapping.opportunity.nextStep,
        ownerId: resolveSalesDefaultOwnerId({ salesDefaults }),
        source: mapping.opportunity.source,
        valueCents: mapping.opportunity.valueCents,
      },
      select: { id: true },
    });

    await recordSalesOpportunityCreated(tx, {
      opportunityId: opportunity.id,
      occurredAt,
      salesPipelineStageId: lifecycleData.salesPipelineStageId,
      source: pipedriveImportSource,
      stage: lifecycleData.stage,
    });

    await tx.salesCommunication.create({
      data: {
        opportunityId: opportunity.id,
        body: mapping.communication.body,
        channel: "SYSTEM",
        contactId: contact.id,
        direction: "INTERNAL",
        fromAddress: mapping.communication.fromAddress,
        metadata: mapping.communication.metadata,
        subject: mapping.communication.subject,
        summary: mapping.communication.summary,
      },
      select: { id: true },
    });

    await upsertExternalRecordLink(tx, {
      externalId: externalLeadId,
      externalType: pipedriveExternalTypes.lead,
      integrationId,
      internalId: opportunity.id,
      internalType: pipedriveInternalTypes.opportunity,
      metadata: mapping.communication.metadata,
      now,
    });

    return {
      companyId: company.id,
      contactId: contact.id,
      created: {
        company: company.created,
        contact: contact.created,
        opportunity: true,
      },
      externalLeadId,
      opportunityId: opportunity.id,
      status: "created" as const,
      title: mapping.opportunity.title,
      warnings: relatedRecords.warnings,
    };
  });
}

export function mapPipedriveLeadToCrm({
  defaultLeadSource,
  lead,
  organization,
  person,
  workspaceCurrency,
}: {
  defaultLeadSource?: string | null;
  lead: PipedriveLead;
  organization?: PipedriveOrganization | null;
  person?: PipedrivePerson | null;
  workspaceCurrency: string;
}): PipedriveLeadImportMapping {
  const leadRecord = objectValue(lead);
  const embeddedPerson = objectValue(
    leadRecord.person ?? leadRecord.person_id,
  ) as PipedrivePerson;
  const embeddedOrganization = objectValue(
    leadRecord.organization ?? leadRecord.org_id ?? leadRecord.organization_id,
  ) as PipedriveOrganization;
  const personRecord = objectValue(person) as PipedrivePerson;
  const organizationRecord = objectValue(
    organization,
  ) as PipedriveOrganization;
  const resolvedPerson = Object.keys(personRecord).length
    ? personRecord
    : embeddedPerson;
  const resolvedOrganization = Object.keys(organizationRecord).length
    ? organizationRecord
    : embeddedOrganization;
  const source = cleanText(defaultLeadSource) ?? defaultPipedriveLeadSource;
  const title =
    cleanText(lead.title) ??
    cleanText(leadRecord.name) ??
    `Pipedrive lead ${externalId(lead.id) ?? "import"}`;
  const companyName = cleanText(resolvedOrganization.name);
  const personName =
    cleanText(resolvedPerson.name) ??
    [cleanText(resolvedPerson.first_name), cleanText(resolvedPerson.last_name)]
      .filter(Boolean)
      .join(" ")
      .trim();
  const email = firstContactValue(resolvedPerson.email);
  const phone = firstContactValue(resolvedPerson.phone);
  const contactName = contactNameParts({
    email,
    fallbackTitle: title,
    name: personName,
  });
  const value = opportunityValue(leadRecord.value, workspaceCurrency);
  const expectedCloseDate = parsePipedriveDate(lead.expected_close_date);
  const externalIds = {
    lead: externalId(lead.id),
    organization:
      externalId(resolvedOrganization.id) ??
      externalId(leadRecord.organization_id) ??
      externalId(leadRecord.org_id),
    person:
      externalId(resolvedPerson.id) ??
      externalId(leadRecord.person_id) ??
      externalId(leadRecord.person),
  };
  const attribution = {
    externalLeadId: externalIds.lead,
    externalOrganizationId: externalIds.organization,
    externalPersonId: externalIds.person,
    provider: pipedriveProvider,
    source,
  } satisfies Prisma.InputJsonObject;
  const metadata = {
    ...attribution,
    importedFrom: "pipedrive",
    pipedriveAddTime: cleanText(lead.add_time),
    pipedriveUpdateTime: cleanText(lead.update_time),
    source: pipedriveImportSource,
  } satisfies Prisma.InputJsonObject;
  const company = companyName
    ? {
        addressLine1: cleanText(resolvedOrganization.address),
        name: companyName,
      }
    : null;
  const hasContactIdentity = Boolean(externalIds.person || email || phone);
  const contact = hasContactIdentity
    ? {
        companyName,
        email,
        firstName: contactName.firstName,
        lastName: contactName.lastName,
        leadSource: source,
        phone,
        phoneNormalized: normalizedContactPhone(phone),
        role: "Pipedrive lead contact",
      }
    : null;

  return {
    communication: {
      body: pipedriveImportBody({
        companyName,
        email,
        expectedCloseDate,
        externalIds,
        phone,
        title,
        value,
      }),
      fromAddress: email,
      metadata,
      subject: `Pipedrive lead imported: ${title}`,
      summary: `Imported Pipedrive lead${companyName ? ` for ${companyName}` : ""}.`,
    },
    company,
    contact,
    externalIds,
    opportunity: {
      attribution,
      currency: value.currency,
      expectedCloseDate,
      nextStep: "Review Pipedrive lead and follow up.",
      source,
      title,
      valueCents: value.valueCents,
    },
  };
}

async function fetchRelatedRecords(
  client: PipedriveRelatedRecordClient,
  lead: PipedriveLead,
): Promise<ImportedRelatedRecords> {
  const warnings: string[] = [];
  const leadRecord = objectValue(lead);
  const personId =
    numericId(leadRecord.person_id) ?? numericId(leadRecord.person);
  const organizationId =
    numericId(leadRecord.organization_id) ?? numericId(leadRecord.org_id);
  const [person, organization] = await Promise.all([
    personId ? readPipedrivePerson(client, personId, warnings) : null,
    organizationId
      ? readPipedriveOrganization(client, organizationId, warnings)
      : null,
  ]);

  return { organization, person, warnings };
}

function latestLeadListParams(params: PipedriveListLeadsParams = {}) {
  const leadParams: PipedriveListLeadsParams = {
    limit: params.limit ?? 50,
    sort: params.sort ?? "update_time DESC",
  };

  if (params.start !== undefined) leadParams.start = params.start;
  if (params.updatedSince !== undefined) {
    leadParams.updatedSince = params.updatedSince;
  }

  return leadParams;
}

function previewFieldsFromMapping(
  mapping: PipedriveLeadImportMapping,
): Omit<
  PipedriveLeadPreviewResult,
  "externalLeadId" | "linkedOpportunityId" | "status" | "warnings"
> {
  const contactName = mapping.contact
    ? `${mapping.contact.firstName} ${mapping.contact.lastName}`.trim()
    : null;

  return {
    companyName: mapping.company?.name ?? mapping.contact?.companyName ?? null,
    contactEmail: mapping.contact?.email ?? null,
    contactName: contactName || null,
    contactPhone: mapping.contact?.phone ?? null,
    currency: mapping.opportunity.currency,
    expectedCloseDate: mapping.opportunity.expectedCloseDate,
    title: mapping.opportunity.title,
    valueCents: mapping.opportunity.valueCents,
  };
}

async function readPipedrivePerson(
  client: PipedriveRelatedRecordClient,
  personId: number,
  warnings: string[],
) {
  try {
    return await client.getPerson(personId);
  } catch (error) {
    warnings.push(pipedriveReadWarning("person", personId, error));
    return null;
  }
}

async function readPipedriveOrganization(
  client: PipedriveRelatedRecordClient,
  organizationId: number,
  warnings: string[],
) {
  try {
    return await client.getOrganization(organizationId);
  } catch (error) {
    warnings.push(pipedriveReadWarning("organization", organizationId, error));
    return null;
  }
}

function pipedriveReadWarning(
  recordType: string,
  recordId: number | string,
  error: unknown,
) {
  const detail = error instanceof Error ? `: ${error.message}` : "";
  return `Could not read Pipedrive ${recordType} ${recordId}${detail}`;
}

async function resolvePipedriveCompany(
  tx: Prisma.TransactionClient,
  {
    integrationId,
    mapping,
    now,
  }: {
    integrationId: string | null;
    mapping: PipedriveLeadImportMapping;
    now: Date;
  },
): Promise<ResolvedCompany> {
  if (!mapping.company) return { created: false, id: null, name: null };

  const externalOrganizationId = mapping.externalIds.organization;
  const existingLinkedCompany = externalOrganizationId
    ? await linkedInternalRecord(tx, {
        externalId: externalOrganizationId,
        externalType: pipedriveExternalTypes.organization,
        internalType: pipedriveInternalTypes.company,
      })
    : null;

  if (existingLinkedCompany) {
    return {
      created: false,
      id: existingLinkedCompany.id,
      name: existingLinkedCompany.name,
    };
  }

  const existingCompany = await tx.company.findFirst({
    where: {
      name: { equals: mapping.company.name, mode: "insensitive" },
    },
    select: { id: true, name: true },
  });
  const company =
    existingCompany ??
    (await tx.company.create({
      data: {
        addressLine1: mapping.company.addressLine1,
        name: mapping.company.name,
        status: "Prospect",
      },
      select: { id: true, name: true },
    }));

  if (externalOrganizationId) {
    await upsertExternalRecordLink(tx, {
      externalId: externalOrganizationId,
      externalType: pipedriveExternalTypes.organization,
      integrationId,
      internalId: company.id,
      internalType: pipedriveInternalTypes.company,
      metadata: {
        name: company.name,
        source: pipedriveImportSource,
      },
      now,
    });
  }

  return {
    created: !existingCompany,
    id: company.id,
    name: company.name,
  };
}

async function resolvePipedriveContact(
  tx: Prisma.TransactionClient,
  {
    company,
    integrationId,
    mapping,
    now,
  }: {
    company: ResolvedCompany;
    integrationId: string | null;
    mapping: PipedriveLeadImportMapping;
    now: Date;
  },
): Promise<ResolvedContact> {
  if (!mapping.contact) return { created: false, id: null };

  const externalPersonId = mapping.externalIds.person;
  const existingLinkedContact = externalPersonId
    ? await linkedInternalRecord(tx, {
        externalId: externalPersonId,
        externalType: pipedriveExternalTypes.person,
        internalType: pipedriveInternalTypes.contact,
      })
    : null;

  if (existingLinkedContact) {
    return { created: false, id: existingLinkedContact.id };
  }

  const existingContact = await findExistingContact(tx, mapping.contact);
  const contact =
    existingContact ??
    (await tx.contact.create({
      data: {
        companyId: company.id,
        companyName: company.name ?? mapping.contact.companyName,
        email: mapping.contact.email,
        firstName: mapping.contact.firstName,
        lastName: mapping.contact.lastName,
        leadSource: mapping.contact.leadSource,
        phone: mapping.contact.phone,
        phoneNormalized: mapping.contact.phoneNormalized,
        role: mapping.contact.role,
      },
      select: { id: true },
    }));

  if (existingContact) {
    await tx.contact.update({
      where: { id: existingContact.id },
      data: {
        companyId: existingContact.companyId ?? company.id,
        companyName:
          existingContact.companyName ??
          company.name ??
          mapping.contact.companyName,
        email: existingContact.email ?? mapping.contact.email,
        leadSource: existingContact.leadSource ?? mapping.contact.leadSource,
        phone: existingContact.phone ?? mapping.contact.phone,
        phoneNormalized:
          existingContact.phoneNormalized ?? mapping.contact.phoneNormalized,
        role: existingContact.role ?? mapping.contact.role,
      },
      select: { id: true },
    });
  }

  if (externalPersonId) {
    await upsertExternalRecordLink(tx, {
      externalId: externalPersonId,
      externalType: pipedriveExternalTypes.person,
      integrationId,
      internalId: contact.id,
      internalType: pipedriveInternalTypes.contact,
      metadata: {
        email: mapping.contact.email,
        name: `${mapping.contact.firstName} ${mapping.contact.lastName}`.trim(),
        source: pipedriveImportSource,
      },
      now,
    });
  }

  return { created: !existingContact, id: contact.id };
}

async function findExistingContact(
  tx: Prisma.TransactionClient,
  contact: NonNullable<PipedriveLeadImportMapping["contact"]>,
) {
  const matches: Prisma.ContactWhereInput[] = [];

  if (contact.email) {
    matches.push(
      { email: { equals: contact.email, mode: "insensitive" } },
      {
        additionalEmails: {
          some: { email: { equals: contact.email, mode: "insensitive" } },
        },
      },
    );
  }

  if (contact.phoneNormalized) {
    matches.push(
      { phoneNormalized: contact.phoneNormalized },
      { additionalPhones: { some: { phoneNormalized: contact.phoneNormalized } } },
    );
  }

  if (!matches.length) return null;

  return tx.contact.findFirst({
    where: { OR: matches },
    select: {
      companyId: true,
      companyName: true,
      email: true,
      id: true,
      leadSource: true,
      phone: true,
      phoneNormalized: true,
      role: true,
    },
  });
}

async function linkedInternalRecord(
  tx: Prisma.TransactionClient,
  {
    externalId,
    externalType,
    internalType,
  }: {
    externalId: string;
    externalType: string;
    internalType: string;
  },
): Promise<{ id: string; name: string | null } | null> {
  const link = await tx.externalRecordLink.findUnique({
    where: {
      provider_externalType_externalId: {
        externalId,
        externalType,
        provider: pipedriveProvider,
      },
    },
    select: { internalId: true, internalType: true },
  });

  if (link?.internalType !== internalType) return null;

  if (internalType === pipedriveInternalTypes.company) {
    return tx.company.findUnique({
      where: { id: link.internalId },
      select: { id: true, name: true },
    });
  }

  if (internalType === pipedriveInternalTypes.contact) {
    const contact = await tx.contact.findUnique({
      where: { id: link.internalId },
      select: { id: true },
    });

    return contact ? { id: contact.id, name: null } : null;
  }

  return null;
}

async function upsertExternalRecordLink(
  tx: Prisma.TransactionClient,
  {
    externalId,
    externalType,
    integrationId,
    internalId,
    internalType,
    metadata,
    now,
  }: {
    externalId: string;
    externalType: string;
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
        externalType,
        provider: pipedriveProvider,
      },
    },
    create: {
      externalId,
      externalType,
      integrationId,
      internalId,
      internalType,
      lastSeenAt: now,
      metadata,
      provider: pipedriveProvider,
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

function skippedLeadResult({
  externalLeadId = null,
  title = null,
  warning,
}: {
  externalLeadId?: string | null;
  title?: string | null;
  warning: string;
}): PipedriveLeadImportResult {
  return {
    companyId: null,
    contactId: null,
    created: { company: false, contact: false, opportunity: false },
    externalLeadId,
    opportunityId: null,
    status: "skipped",
    title,
    warnings: [warning],
  };
}

function skippedLeadPreviewResult({
  lead,
  warning,
}: {
  lead: PipedriveLead;
  warning: string;
}): PipedriveLeadPreviewResult {
  const leadRecord = objectValue(lead);

  return {
    companyName: null,
    contactEmail: null,
    contactName: null,
    contactPhone: null,
    currency: null,
    expectedCloseDate: null,
    externalLeadId: null,
    linkedOpportunityId: null,
    status: "skipped",
    title: cleanText(lead.title) ?? cleanText(leadRecord.name),
    valueCents: null,
    warnings: [warning],
  };
}

function normalizedSelectedLeadIds(leadIds: string[]) {
  const selectedLeadIds = new Set<string>();

  for (const leadId of leadIds) {
    const normalized = cleanText(leadId);
    if (normalized) selectedLeadIds.add(normalized);
    if (selectedLeadIds.size >= 50) break;
  }

  return [...selectedLeadIds];
}

function opportunityValue(value: unknown, workspaceCurrency: string) {
  const valueRecord = objectValue(value);
  const amount =
    numberValue(valueRecord.amount) ??
    numberValue(valueRecord.value) ??
    numberValue(value);
  const currency = cleanText(valueRecord.currency) ?? workspaceCurrency;

  return {
    currency,
    valueCents:
      amount !== null && amount >= 0 ? Math.round(amount * 100) : 0,
  };
}

function pipedriveImportBody({
  companyName,
  email,
  expectedCloseDate,
  externalIds,
  phone,
  title,
  value,
}: {
  companyName: string | null;
  email: string | null;
  expectedCloseDate: Date | null;
  externalIds: PipedriveLeadImportMapping["externalIds"];
  phone: string | null;
  title: string;
  value: { currency: string; valueCents: number };
}) {
  return [
    `Imported from Pipedrive lead ${externalIds.lead ?? "unknown"}.`,
    `Title: ${title}`,
    companyName ? `Organisation: ${companyName}` : null,
    email ? `Email: ${email}` : null,
    phone ? `Phone: ${phone}` : null,
    value.valueCents
      ? `Value: ${value.currency} ${(value.valueCents / 100).toFixed(2)}`
      : null,
    expectedCloseDate
      ? `Expected close date: ${expectedCloseDate.toISOString().slice(0, 10)}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function contactNameParts({
  email,
  fallbackTitle,
  name,
}: {
  email: string | null;
  fallbackTitle: string;
  name: string | null;
}) {
  const parts = (name ?? "")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length) {
    return {
      firstName: truncateText(parts[0]!, 160),
      lastName: truncateText(parts.slice(1).join(" ") || "Pipedrive", 160),
    };
  }

  const emailName = email?.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  if (emailName) {
    return {
      firstName: truncateText(emailName.split(/\s+/)[0] || "Pipedrive", 160),
      lastName: "Lead",
    };
  }

  return {
    firstName: "Pipedrive",
    lastName: truncateText(fallbackTitle || "Lead", 160),
  };
}

function firstContactValue(value: unknown) {
  if (typeof value === "string") return cleanText(value);

  if (Array.isArray(value)) {
    const preferred = value.find(
      (entry) => objectValue(entry).primary === true,
    );
    return firstContactValue(preferred ?? value[0]);
  }

  const record = objectValue(value);
  return cleanText(record.value ?? record.email ?? record.phone);
}

function parsePipedriveDate(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;

  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00.000Z` : text,
  );

  return Number.isNaN(date.getTime()) ? null : date;
}

function externalId(value: unknown) {
  const record = objectValue(value);
  const candidate = Object.keys(record).length ? record.id : value;

  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    return String(Math.trunc(candidate));
  }

  return cleanText(candidate);
}

function numericId(value: unknown) {
  const id = externalId(value);
  if (!id) return null;

  const numeric = Number(id);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;

  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function objectValue(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function previewMetadataText(value: string | null) {
  return value ? truncateText(value, 240) : null;
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;

  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}
