import "server-only";

import type { Prisma } from "@prisma/client";
import {
  normalizeContactEmailMethods,
  normalizeContactPhoneMethods,
  type ContactEmailMethod,
  type ContactPhoneMethod,
} from "@/lib/contact-methods";
import { emailTextSummary, toEmailPlainText } from "@/lib/email/plain-text";
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
  type PipedriveDeal,
  type PipedriveFile,
  type PipedriveLead,
  type PipedriveListDealsParams,
  type PipedriveListFilesParams,
  type PipedriveListLeadsParams,
  type PipedriveListMailThreadsParams,
  type PipedriveListNotesParams,
  type PipedriveListPersonMailMessagesParams,
  type PipedriveListPersonsParams,
  type PipedriveListResult,
  type PipedriveMailMessage,
  type PipedriveMailThread,
  type PipedriveNote,
  type PipedriveOrganization,
  type PipedrivePerson,
  type PipedriveReadOnlyClient,
} from "@/lib/integrations/pipedrive";

const pipedriveImportSource = "pipedrive-import";
const pipedriveDealImportDisabledWarning =
  "Pipedrive deal imports are disabled. CRM imports Pipedrive Lead Inbox records only.";
const pipedriveExternalTypes = {
  deal: "deal",
  file: "file",
  lead: "lead",
  organization: "organization",
  person: "person",
} as const;
const defaultPipedriveFullPullMaxPages = 5;
const defaultPipedriveFullPersonPullMaxPages = 5;
const pipedriveLeadUuidPattern =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const pipedriveInternalTypes = {
  company: "company",
  contact: "contact",
  deletedOpportunity: "salesOpportunityDeleted",
  opportunity: "salesOpportunity",
} as const;
const pipedriveFileImportSource = "pipedrive-file-import";
const pipedriveMailImportSource = "pipedrive-mail-import";
const pipedriveMailExternalIdPrefix = "pipedrive:mail:";
const pipedriveNoteImportSource = "pipedrive-note-import";
const pipedriveNoteExternalIdPrefix = "pipedrive:note:";
const defaultPipedriveLeadFileMaxPages = 3;
const defaultPipedriveLeadEmailMaxPages = 3;
export const manualPipedriveLeadEmailMaxPages = 25;
export const defaultPipedriveLeadEmailThreadSweepMaxPages = 3;
const defaultPipedriveLeadNoteMaxPages = 3;
export const pipedriveLeadEmailThreadFolders = [
  "inbox",
  "sent",
  "archive",
] as const;
export type PipedriveLeadEmailThreadFolder =
  (typeof pipedriveLeadEmailThreadFolders)[number];

type JsonObject = Record<string, unknown>;

type PipedriveRelatedRecordClient = Pick<
  PipedriveReadOnlyClient,
  "defaultLeadSource" | "getOrganization" | "getPerson"
> & {
  getLead?: PipedriveReadOnlyClient["getLead"];
  getMailMessage?: PipedriveReadOnlyClient["getMailMessage"];
  listFiles?: PipedriveReadOnlyClient["listFiles"];
  listMailThreadMessages?: PipedriveReadOnlyClient["listMailThreadMessages"];
  listMailThreads?: PipedriveReadOnlyClient["listMailThreads"];
  listPersonMailMessages?: PipedriveReadOnlyClient["listPersonMailMessages"];
  listNotes?: PipedriveReadOnlyClient["listNotes"];
};

export type PipedriveImportClient = PipedriveRelatedRecordClient &
  Pick<PipedriveReadOnlyClient, "listLeads">;

export type PipedriveDealImportClient = PipedriveRelatedRecordClient &
  Pick<PipedriveReadOnlyClient, "listDeals">;

export type PipedriveSelectedImportClient = PipedriveRelatedRecordClient &
  Pick<PipedriveReadOnlyClient, "getLead">;

export type PipedriveSelectedDealImportClient = PipedriveRelatedRecordClient &
  Pick<PipedriveReadOnlyClient, "getDeal">;

export type PipedrivePersonImportClient = PipedriveRelatedRecordClient &
  Pick<PipedriveReadOnlyClient, "listPersons">;

export type PipedriveSelectedPersonImportClient = PipedriveRelatedRecordClient &
  Pick<PipedriveReadOnlyClient, "getPerson">;

export type PipedriveLeadNoteImportClient = Pick<
  PipedriveReadOnlyClient,
  "listNotes"
>;

export type PipedriveSelectedLeadNoteImportClient = Pick<
  PipedriveReadOnlyClient,
  "getNote"
>;

export type PipedriveLeadImportMapping = {
  company: {
    addressLine1: string | null;
    name: string;
  } | null;
  contact: {
    companyName: string | null;
    email: string | null;
    emailMethods: ContactEmailMethod[];
    firstName: string;
    lastName: string;
    leadSource: string;
    phone: string | null;
    phoneMethods: ContactPhoneMethod[];
    phoneNormalized: string | null;
    role: string | null;
  } | null;
  externalIds: {
    deal: string | null;
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
  matchedCompanyId: string | null;
  matchedCompanyName: string | null;
  matchedContactId: string | null;
  matchedContactName: string | null;
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
  matchedCompanyId: string | null;
  matchedCompanyName: string | null;
  matchedContactId: string | null;
  matchedContactName: string | null;
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

export type PipedriveDealImportResult = Omit<
  PipedriveLeadImportResult,
  "externalLeadId"
> & {
  externalDealId: string | null;
};

export type PipedriveDealImportMetadataRow = Omit<
  PipedriveLeadImportMetadataRow,
  "externalLeadId"
> & {
  externalDealId: string | null;
};

export type PipedrivePersonImportResult = {
  companyId: string | null;
  contactId: string | null;
  created: {
    company: boolean;
    contact: boolean;
  };
  externalPersonId: string | null;
  name: string | null;
  status: "created" | "linked_existing" | "skipped";
  warnings: string[];
};

export type PipedrivePersonImportMetadataRow = {
  companyId: string | null;
  contactId: string | null;
  createdCompany: boolean;
  createdContact: boolean;
  externalPersonId: string | null;
  name: string | null;
  status: PipedrivePersonImportResult["status"];
  warningCount: number;
  warnings: string[];
};

export type PipedriveLeadNotesSyncResult =
  | {
      created: number;
      externalLeadId: string;
      notesRead: number;
      opportunityId: string;
      skipped: number;
      status: "ok";
      updated: number;
      warnings: string[];
    }
  | {
      created: 0;
      externalLeadId: null;
      notesRead: 0;
      opportunityId: string;
      skipped: 0;
      status: "not_configured" | "not_linked";
      updated: 0;
      warnings: string[];
    };

export type PipedriveLeadFilesSyncResult =
  | {
      created: number;
      externalLeadId: string;
      filesMatched: number;
      filesRead: number;
      opportunityId: string;
      skipped: number;
      status: "ok";
      updated: number;
      warnings: string[];
    }
  | {
      created: 0;
      externalLeadId: null;
      filesMatched: 0;
      filesRead: 0;
      opportunityId: string;
      skipped: 0;
      status: "not_configured" | "not_linked";
      updated: 0;
      warnings: string[];
    };

export type PipedriveLeadEmailsSyncResult =
  | {
      created: number;
      emailsRead: number;
      externalLeadId: string;
      externalPersonId: string | null;
      opportunityId: string;
      skipped: number;
      status: "ok";
      updated: number;
      warnings: string[];
    }
  | {
      created: 0;
      emailsRead: 0;
      externalLeadId: string | null;
      externalPersonId: string | null;
      opportunityId: string;
      skipped: 0;
      status: "not_configured" | "not_linked" | "not_supported";
      updated: 0;
      warnings: string[];
    };

export type PipedriveLeadEmailThreadPageImportRow = {
  created: number;
  emailRead: number;
  externalLeadId: string;
  opportunityId: string;
  skipped: number;
  threadCount: number;
  updated: number;
  warningCount: number;
};

export type PipedriveLeadEmailThreadPageImportResult = {
  completedCycle: boolean;
  created: number;
  emailsRead: number;
  folder: PipedriveLeadEmailThreadFolder;
  maxPages: number;
  moreAvailable: boolean;
  nextFolder: PipedriveLeadEmailThreadFolder;
  nextStart: number | null;
  pagesRead: number;
  recordsWritten: number;
  rows: PipedriveLeadEmailThreadPageImportRow[];
  skipped: number;
  start: number | null;
  status: "not_configured" | "not_supported" | "ok";
  threadsMatched: number;
  threadsRead: number;
  updated: number;
  warnings: string[];
};

export type PipedriveLeadFileBatchSyncItem = {
  externalLeadId: string;
  opportunityId: string;
};

export type PipedriveLeadFilesBatchSyncResult = {
  created: number;
  filesMatched: number;
  filesRead: number;
  results: PipedriveLeadFilesSyncResult[];
  skipped: number;
  status: "ok" | "not_configured";
  updated: number;
  warnings: string[];
};

export type PipedriveLeadNoteImportResult = {
  created: number;
  externalLeadId: string | null;
  externalNoteId: string | null;
  ignored: boolean;
  opportunityId: string | null;
  skipped: number;
  status: "created" | "ignored" | "skipped" | "updated";
  updated: number;
  warnings: string[];
};

export type PipedriveLeadNoteImportMetadataRow = {
  created: number;
  externalLeadId: string | null;
  externalNoteId: string | null;
  ignored: boolean;
  opportunityId: string | null;
  skipped: number;
  status: PipedriveLeadNoteImportResult["status"];
  updated: number;
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

type ImportDealRecordOptions = {
  client: PipedriveRelatedRecordClient;
  deal: PipedriveDeal;
  now?: Date;
};

type ImportLeadPageOptions = {
  client?: PipedriveImportClient | null;
  params?: PipedriveListLeadsParams;
};

type ImportDealPageOptions = {
  client?: PipedriveDealImportClient | null;
  params?: PipedriveListDealsParams;
};

type ImportLeadPagesOptions = ImportLeadPageOptions & {
  maxPages?: number;
};

type ImportDealPagesOptions = ImportDealPageOptions & {
  maxPages?: number;
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

type ImportDealIdsOptions = {
  client?: PipedriveSelectedDealImportClient | null;
  dealIds: Array<number | string>;
  now?: Date;
};

type ImportPersonRecordOptions = {
  client: PipedriveRelatedRecordClient;
  now?: Date;
  person: PipedrivePerson;
};

type ImportPersonPageOptions = {
  client?: PipedrivePersonImportClient | null;
  params?: PipedriveListPersonsParams;
};

type ImportPersonPagesOptions = ImportPersonPageOptions & {
  maxPages?: number;
};

type ImportPersonIdsOptions = {
  client?: PipedriveSelectedPersonImportClient | null;
  now?: Date;
  personIds: Array<number | string>;
};

type ImportLeadNotePageOptions = {
  client?: PipedriveLeadNoteImportClient | null;
  now?: Date;
  params?: PipedriveListNotesParams;
  warnWhenUnlinked?: boolean;
};

type ImportLeadNotePagesOptions = ImportLeadNotePageOptions & {
  maxPages?: number;
};

type ImportLeadNoteIdsOptions = {
  client?: PipedriveSelectedLeadNoteImportClient | null;
  noteIds: Array<number | string>;
  now?: Date;
  warnWhenUnlinked?: boolean;
};

export type PipedriveLeadNotePageImportResult =
  | {
      created: number;
      ignored: number;
      maxPages: number;
      moreAvailable: boolean;
      nextStart: number | null;
      pagesRead: number;
      recordsRead: number;
      recordsWritten: number;
      results: PipedriveLeadNoteImportResult[];
      skipped: number;
      status: "ok";
      updated: number;
    }
  | {
      created: 0;
      ignored: 0;
      maxPages: number;
      moreAvailable: false;
      nextStart: null;
      pagesRead: 0;
      recordsRead: 0;
      recordsWritten: 0;
      results: [];
      skipped: 0;
      status: "not_configured";
      updated: 0;
    };

export type PipedriveLeadNoteIdsImportResult =
  | {
      created: number;
      ignored: number;
      recordsRead: number;
      recordsWritten: number;
      requested: number;
      results: PipedriveLeadNoteImportResult[];
      skipped: number;
      status: "ok";
      updated: number;
    }
  | {
      created: 0;
      ignored: 0;
      recordsRead: 0;
      recordsWritten: 0;
      requested: number;
      results: [];
      skipped: number;
      status: "not_configured";
      updated: 0;
    };

type ImportedRelatedRecords = {
  organization: PipedriveOrganization | null;
  person: PipedrivePerson | null;
  warnings: string[];
};

type PreviewCrmMatch = {
  id: string;
  name: string | null;
};

type PreviewCrmMatches = {
  company: PreviewCrmMatch | null;
  contact: PreviewCrmMatch | null;
};

type PipedriveLeadFilesReadResult = {
  files: PipedriveFile[];
  filesMatched: number;
  filesRead: number;
  warnings: string[];
};

type PipedriveLeadFilesWriteResult = {
  created: number;
  skipped: number;
  updated: number;
};

type PipedriveLeadEmailsReadResult = {
  emails: PipedriveMailMessage[];
  emailsRead: number;
  warnings: string[];
};

type PipedriveLeadEmailsWriteResult = {
  created: number;
  skipped: number;
  updated: number;
};

type PipedriveLeadNotesReadResult = {
  notes: PipedriveNote[];
  notesRead: number;
  warnings: string[];
};

type PipedriveLeadNotesWriteResult = {
  created: number;
  skipped: number;
  updated: number;
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

export async function importPipedriveLeadPages({
  client,
  maxPages,
  params = {},
}: ImportLeadPagesOptions = {}) {
  const readClient = client ?? (await getPipedriveReadOnlyClient());
  const pageLimit = boundedFullPullMaxPages(maxPages);

  if (!readClient) {
    return {
      maxPages: pageLimit,
      moreAvailable: false,
      nextStart: null,
      pagesRead: 0,
      recordsRead: 0,
      results: [],
      skipped: 0,
      status: "not_configured" as const,
    };
  }

  const results: PipedriveLeadImportResult[] = [];
  let moreAvailable = false;
  let nextStart: number | null = null;
  let pagesRead = 0;
  let recordsRead = 0;
  let start = params.start ?? null;

  while (pagesRead < pageLimit) {
    const pageParams: PipedriveListLeadsParams = { ...params };
    if (start !== null) pageParams.start = start;

    const page = await readClient.listLeads(latestLeadListParams(pageParams));
    pagesRead += 1;
    recordsRead += page.data.length;

    for (const lead of page.data) {
      results.push(
        await importPipedriveLeadRecord({ client: readClient, lead }),
      );
    }

    moreAvailable = page.pagination.moreItemsInCollection;
    nextStart = page.pagination.nextStart;

    if (!moreAvailable || nextStart === null) {
      moreAvailable = false;
      nextStart = null;
      break;
    }

    start = nextStart;
  }

  return {
    created: results.filter((result) => result.status === "created").length,
    linkedExisting: results.filter(
      (result) => result.status === "linked_existing",
    ).length,
    maxPages: pageLimit,
    moreAvailable,
    nextStart,
    pagesRead,
    recordsRead,
    results,
    skipped: results.filter((result) => result.status === "skipped").length,
    status: "ok" as const,
  };
}

export async function syncPipedriveLeadFilesForOpportunity({
  client,
  maxPages,
  now = new Date(),
  opportunityId,
}: {
  client?: PipedriveRelatedRecordClient | null;
  maxPages?: number;
  now?: Date;
  opportunityId: string;
}): Promise<PipedriveLeadFilesSyncResult> {
  const readClient = client ?? (await getPipedriveReadOnlyClient());

  if (!readClient) {
    return {
      created: 0,
      externalLeadId: null,
      filesMatched: 0,
      filesRead: 0,
      opportunityId,
      skipped: 0,
      status: "not_configured",
      updated: 0,
      warnings: ["Pipedrive is not configured."],
    };
  }

  const [leadLink, opportunity, integration] = await Promise.all([
    prisma.externalRecordLink.findFirst({
      where: {
        externalType: pipedriveExternalTypes.lead,
        internalId: opportunityId,
        internalType: pipedriveInternalTypes.opportunity,
        provider: pipedriveProvider,
      },
      select: { externalId: true },
    }),
    prisma.salesOpportunity.findUnique({
      where: { id: opportunityId },
      select: { id: true },
    }),
    prisma.integrationConnection.findUnique({
      where: { provider: pipedriveProvider },
      select: { id: true },
    }),
  ]);

  if (!leadLink || !opportunity) {
    return {
      created: 0,
      externalLeadId: null,
      filesMatched: 0,
      filesRead: 0,
      opportunityId,
      skipped: 0,
      status: "not_linked",
      updated: 0,
      warnings: ["Sale is not linked to a Pipedrive lead."],
    };
  }

  const fileRead = await readPipedriveLeadFiles(
    readClient,
    leadLink.externalId,
    maxPages,
  );
  const writeResult = await prisma.$transaction((tx) =>
    syncPipedriveLeadFileRecords(tx, {
      externalLeadId: leadLink.externalId,
      files: fileRead.files,
      integrationId: integration?.id ?? null,
      now,
      opportunityId: opportunity.id,
    }),
  );

  return {
    created: writeResult.created,
    externalLeadId: leadLink.externalId,
    filesMatched: fileRead.filesMatched,
    filesRead: fileRead.filesRead,
    opportunityId,
    skipped: writeResult.skipped,
    status: "ok",
    updated: writeResult.updated,
    warnings: fileRead.warnings,
  };
}

export async function syncPipedriveLeadNotesForOpportunity({
  client,
  maxPages,
  now = new Date(),
  opportunityId,
}: {
  client?: PipedriveRelatedRecordClient | null;
  maxPages?: number;
  now?: Date;
  opportunityId: string;
}): Promise<PipedriveLeadNotesSyncResult> {
  const readClient = client ?? (await getPipedriveReadOnlyClient());

  if (!readClient) {
    return {
      created: 0,
      externalLeadId: null,
      notesRead: 0,
      opportunityId,
      skipped: 0,
      status: "not_configured",
      updated: 0,
      warnings: ["Pipedrive is not configured."],
    };
  }

  const [leadLink, opportunity] = await Promise.all([
    prisma.externalRecordLink.findFirst({
      where: {
        externalType: pipedriveExternalTypes.lead,
        internalId: opportunityId,
        internalType: pipedriveInternalTypes.opportunity,
        provider: pipedriveProvider,
      },
      select: { externalId: true },
    }),
    prisma.salesOpportunity.findUnique({
      where: { id: opportunityId },
      select: { contactId: true, id: true },
    }),
  ]);

  if (!leadLink || !opportunity) {
    return {
      created: 0,
      externalLeadId: null,
      notesRead: 0,
      opportunityId,
      skipped: 0,
      status: "not_linked",
      updated: 0,
      warnings: ["Sale is not linked to a Pipedrive lead."],
    };
  }

  const noteRead = await readPipedriveLeadNotes(
    readClient,
    leadLink.externalId,
    maxPages,
  );
  const writeResult = await prisma.$transaction((tx) =>
    syncPipedriveLeadNoteRecords(tx, {
      contactId: opportunity.contactId,
      externalLeadId: leadLink.externalId,
      notes: noteRead.notes,
      now,
      opportunityId: opportunity.id,
    }),
  );

  return {
    created: writeResult.created,
    externalLeadId: leadLink.externalId,
    notesRead: noteRead.notesRead,
    opportunityId,
    skipped: writeResult.skipped,
    status: "ok",
    updated: writeResult.updated,
    warnings: noteRead.warnings,
  };
}

export async function syncPipedriveLeadEmailsForOpportunity({
  client,
  maxPages,
  now = new Date(),
  opportunityId,
}: {
  client?: PipedriveRelatedRecordClient | null;
  maxPages?: number;
  now?: Date;
  opportunityId: string;
}): Promise<PipedriveLeadEmailsSyncResult> {
  const readClient = client ?? (await getPipedriveReadOnlyClient());

  if (!readClient) {
    return {
      created: 0,
      emailsRead: 0,
      externalLeadId: null,
      externalPersonId: null,
      opportunityId,
      skipped: 0,
      status: "not_configured",
      updated: 0,
      warnings: ["Pipedrive is not configured."],
    };
  }

  const canReadLeadMailThreads =
    typeof readClient.listMailThreads === "function" &&
    typeof readClient.listMailThreadMessages === "function";
  const canReadPersonMailMessages =
    typeof readClient.listPersonMailMessages === "function";

  if (!canReadLeadMailThreads && !canReadPersonMailMessages) {
    return {
      created: 0,
      emailsRead: 0,
      externalLeadId: null,
      externalPersonId: null,
      opportunityId,
      skipped: 0,
      status: "not_supported",
      updated: 0,
      warnings: ["Pipedrive mail message reads are not supported."],
    };
  }

  const [leadLink, opportunity] = await Promise.all([
    prisma.externalRecordLink.findFirst({
      where: {
        externalType: pipedriveExternalTypes.lead,
        internalId: opportunityId,
        internalType: pipedriveInternalTypes.opportunity,
        provider: pipedriveProvider,
      },
      select: { externalId: true, metadata: true },
    }),
    prisma.salesOpportunity.findUnique({
      where: { id: opportunityId },
      select: {
        contactId: true,
        id: true,
        contact: {
          select: {
            email: true,
            additionalEmails: { select: { email: true } },
          },
        },
      },
    }),
  ]);

  if (!leadLink || !opportunity) {
    return {
      created: 0,
      emailsRead: 0,
      externalLeadId: null,
      externalPersonId: null,
      opportunityId,
      skipped: 0,
      status: "not_linked",
      updated: 0,
      warnings: ["Sale is not linked to a Pipedrive lead."],
    };
  }

  const warnings: string[] = [];
  const personId = await resolvePipedrivePersonIdForLeadEmailSync({
    client: readClient,
    contactId: opportunity.contactId,
    externalLeadId: leadLink.externalId,
    leadMetadata: leadLink.metadata,
    warnings,
  });

  if (!personId && !canReadLeadMailThreads) {
    return {
      created: 0,
      emailsRead: 0,
      externalLeadId: leadLink.externalId,
      externalPersonId: null,
      opportunityId,
      skipped: 0,
      status: "not_linked",
      updated: 0,
      warnings: [
        ...warnings,
        "Linked Pipedrive lead does not have a readable Pipedrive person.",
      ],
    };
  }

  const emailRead = await readPipedriveLeadEmails(
    readClient,
    leadLink.externalId,
    personId,
    maxPages,
  );
  const writeResult = await prisma.$transaction((tx) =>
    syncPipedriveLeadEmailRecords(tx, {
      contactEmails: contactEmailValues(opportunity.contact),
      contactId: opportunity.contactId,
      emails: emailRead.emails,
      externalLeadId: leadLink.externalId,
      externalPersonId: personId ? String(personId) : null,
      now,
      opportunityId: opportunity.id,
    }),
  );

  return {
    created: writeResult.created,
    emailsRead: emailRead.emailsRead,
    externalLeadId: leadLink.externalId,
    externalPersonId: personId ? String(personId) : null,
    opportunityId,
    skipped: writeResult.skipped,
    status: "ok",
    updated: writeResult.updated,
    warnings: [...warnings, ...emailRead.warnings],
  };
}

export async function importPipedriveLeadEmailThreadPages({
  client,
  folder,
  maxPages = defaultPipedriveLeadEmailThreadSweepMaxPages,
  now = new Date(),
  start = null,
}: {
  client?: PipedriveRelatedRecordClient | null;
  folder?: string | null;
  maxPages?: number | null;
  now?: Date;
  start?: number | null;
} = {}): Promise<PipedriveLeadEmailThreadPageImportResult> {
  const readClient = client ?? (await getPipedriveReadOnlyClient());
  const sweepFolder = pipedriveLeadEmailThreadFolderValue(folder);
  const sweepStart = boundedOptionalStart(start);
  const pageLimit = boundedFullPullMaxPages(
    maxPages,
    defaultPipedriveLeadEmailThreadSweepMaxPages,
    manualPipedriveLeadEmailMaxPages,
  );
  const emptyResult = (
    status: PipedriveLeadEmailThreadPageImportResult["status"],
    warnings: string[],
  ): PipedriveLeadEmailThreadPageImportResult => ({
    completedCycle: false,
    created: 0,
    emailsRead: 0,
    folder: sweepFolder,
    maxPages: pageLimit,
    moreAvailable: false,
    nextFolder: sweepFolder,
    nextStart: sweepStart,
    pagesRead: 0,
    recordsWritten: 0,
    rows: [],
    skipped: 0,
    start: sweepStart,
    status,
    threadsMatched: 0,
    threadsRead: 0,
    updated: 0,
    warnings,
  });

  if (!readClient) {
    return emptyResult("not_configured", ["Pipedrive is not configured."]);
  }

  if (
    typeof readClient.listMailThreads !== "function" ||
    typeof readClient.listMailThreadMessages !== "function"
  ) {
    return emptyResult("not_supported", [
      "Pipedrive mailbox thread reads are not supported.",
    ]);
  }

  const threadRead = await readPipedriveLeadEmailThreadPagesForFolder(
    readClient,
    sweepFolder,
    sweepStart,
    pageLimit,
  );
  const nextFolder = threadRead.moreAvailable
    ? sweepFolder
    : nextPipedriveLeadEmailThreadFolder(sweepFolder);
  const completedCycle =
    !threadRead.moreAvailable && isLastPipedriveLeadEmailThreadFolder(sweepFolder);
  const nextStart = threadRead.moreAvailable ? threadRead.nextStart : null;

  if (!threadRead.threadsByLeadId.size) {
    return {
      completedCycle,
      created: 0,
      emailsRead: 0,
      folder: sweepFolder,
      maxPages: pageLimit,
      moreAvailable: threadRead.moreAvailable || !completedCycle,
      nextFolder,
      nextStart,
      pagesRead: threadRead.pagesRead,
      recordsWritten: 0,
      rows: [],
      skipped: 0,
      start: sweepStart,
      status: "ok",
      threadsMatched: 0,
      threadsRead: threadRead.threadsRead,
      updated: 0,
      warnings: threadRead.warnings,
    };
  }

  const leadIds = [...threadRead.threadsByLeadId.keys()];
  const leadLinks = await prisma.externalRecordLink.findMany({
    where: {
      externalId: { in: leadIds },
      externalType: pipedriveExternalTypes.lead,
      internalType: pipedriveInternalTypes.opportunity,
      provider: pipedriveProvider,
    },
    select: { externalId: true, internalId: true },
  });
  const linksByLeadId = new Map<
    string,
    Array<{ externalId: string; internalId: string }>
  >();
  for (const link of leadLinks) {
    const links = linksByLeadId.get(link.externalId) ?? [];
    links.push(link);
    linksByLeadId.set(link.externalId, links);
  }

  const matchedLeadIds = new Set(linksByLeadId.keys());
  const matchedThreadsByLeadId = new Map<string, PipedriveMailThread[]>();
  let threadsMatched = 0;
  for (const [leadId, threads] of threadRead.threadsByLeadId) {
    if (!matchedLeadIds.has(leadId)) continue;
    matchedThreadsByLeadId.set(leadId, threads);
    threadsMatched += threads.length;
  }

  if (!matchedThreadsByLeadId.size) {
    return {
      completedCycle,
      created: 0,
      emailsRead: 0,
      folder: sweepFolder,
      maxPages: pageLimit,
      moreAvailable: threadRead.moreAvailable || !completedCycle,
      nextFolder,
      nextStart,
      pagesRead: threadRead.pagesRead,
      recordsWritten: 0,
      rows: [],
      skipped: 0,
      start: sweepStart,
      status: "ok",
      threadsMatched: 0,
      threadsRead: threadRead.threadsRead,
      updated: 0,
      warnings: threadRead.warnings,
    };
  }

  const opportunityIds = [
    ...new Set(leadLinks.map((link) => link.internalId).filter(Boolean)),
  ];
  const opportunities = await prisma.salesOpportunity.findMany({
    where: { id: { in: opportunityIds } },
    select: {
      contactId: true,
      id: true,
      contact: {
        select: {
          additionalEmails: { select: { email: true } },
          email: true,
        },
      },
    },
  });
  const opportunityById = new Map(
    opportunities.map((opportunity) => [opportunity.id, opportunity]),
  );
  const warnings = [...threadRead.warnings];
  const emailsByLeadId = new Map<string, PipedriveMailMessage[]>();
  let emailsRead = 0;

  for (const [externalLeadId, threads] of matchedThreadsByLeadId) {
    for (const thread of threads) {
      const threadId = pipedriveMailThreadId(thread);
      if (!threadId) continue;

      try {
        const page = await readClient.listMailThreadMessages(threadId);
        emailsRead += page.data.length;

        for (const message of page.data) {
          const messageWithThreadContext = withPipedriveMailThreadContext({
            externalLeadId,
            message,
            thread,
            threadId,
          });
          if (
            !shouldImportPipedriveMailMessageForLead(
              messageWithThreadContext,
              externalLeadId,
            )
          ) {
            continue;
          }

          const email = await readFullPipedriveMailMessageIfNeeded(
            readClient,
            messageWithThreadContext,
            warnings,
          );
          const emails = emailsByLeadId.get(externalLeadId) ?? [];
          emails.push(email);
          emailsByLeadId.set(externalLeadId, emails);
        }
      } catch (error) {
        warnings.push(
          pipedriveReadWarning(
            "lead email thread messages",
            `${externalLeadId}/${threadId}`,
            error,
          ),
        );
      }
    }
  }

  const rows: PipedriveLeadEmailThreadPageImportRow[] = [];
  let created = 0;
  let skipped = 0;
  let updated = 0;

  await prisma.$transaction(async (tx) => {
    for (const [externalLeadId, emails] of emailsByLeadId) {
      const links = linksByLeadId.get(externalLeadId) ?? [];
      const threadCount =
        matchedThreadsByLeadId.get(externalLeadId)?.length ?? 0;
      const uniqueEmails = deduplicatePipedriveMailMessages(emails);

      for (const link of links) {
        const opportunity = opportunityById.get(link.internalId);
        if (!opportunity) {
          warnings.push(
            `CRM sale ${link.internalId} is no longer available for Pipedrive lead ${externalLeadId}.`,
          );
          continue;
        }

        const writeResult = await syncPipedriveLeadEmailRecords(tx, {
          contactEmails: contactEmailValues(opportunity.contact),
          contactId: opportunity.contactId,
          emails: uniqueEmails,
          externalLeadId,
          externalPersonId: null,
          now,
          opportunityId: opportunity.id,
        });

        created += writeResult.created;
        skipped += writeResult.skipped;
        updated += writeResult.updated;
        rows.push({
          created: writeResult.created,
          emailRead: uniqueEmails.length,
          externalLeadId,
          opportunityId: opportunity.id,
          skipped: writeResult.skipped,
          threadCount,
          updated: writeResult.updated,
          warningCount: 0,
        });
      }
    }
  });

  return {
    completedCycle,
    created,
    emailsRead,
    folder: sweepFolder,
    maxPages: pageLimit,
    moreAvailable: threadRead.moreAvailable || !completedCycle,
    nextFolder,
    nextStart,
    pagesRead: threadRead.pagesRead,
    recordsWritten: created + updated,
    rows,
    skipped,
    start: sweepStart,
    status: "ok",
    threadsMatched,
    threadsRead: threadRead.threadsRead,
    updated,
    warnings,
  };
}

export async function syncPipedriveLeadFilesForOpportunityBatch({
  client,
  items,
  maxPages,
  now = new Date(),
}: {
  client?: PipedriveRelatedRecordClient | null;
  items: PipedriveLeadFileBatchSyncItem[];
  maxPages?: number;
  now?: Date;
}): Promise<PipedriveLeadFilesBatchSyncResult> {
  const readClient = client ?? (await getPipedriveReadOnlyClient());
  const uniqueItems = deduplicateLeadFileBatchItems(items);

  if (!readClient) {
    return {
      created: 0,
      filesMatched: 0,
      filesRead: 0,
      results: uniqueItems.map((item) => ({
        created: 0,
        externalLeadId: null,
        filesMatched: 0,
        filesRead: 0,
        opportunityId: item.opportunityId,
        skipped: 0,
        status: "not_configured",
        updated: 0,
        warnings: ["Pipedrive is not configured."],
      })),
      skipped: 0,
      status: "not_configured",
      updated: 0,
      warnings: ["Pipedrive is not configured."],
    };
  }

  if (!uniqueItems.length) {
    return {
      created: 0,
      filesMatched: 0,
      filesRead: 0,
      results: [],
      skipped: 0,
      status: "ok",
      updated: 0,
      warnings: [],
    };
  }

  const fileRead = await readPipedriveLeadFilesForLeadIds(
    readClient,
    new Set(uniqueItems.map((item) => item.externalLeadId)),
    maxPages,
  );
  const integration = await prisma.integrationConnection.findUnique({
    where: { provider: pipedriveProvider },
    select: { id: true },
  });
  const results: PipedriveLeadFilesSyncResult[] = [];
  let created = 0;
  let skipped = 0;
  let updated = 0;

  await prisma.$transaction(async (tx) => {
    for (const item of uniqueItems) {
      const files = fileRead.filesByLeadId.get(item.externalLeadId) ?? [];
      const writeResult = await syncPipedriveLeadFileRecords(tx, {
        externalLeadId: item.externalLeadId,
        files,
        integrationId: integration?.id ?? null,
        now,
        opportunityId: item.opportunityId,
      });

      created += writeResult.created;
      skipped += writeResult.skipped;
      updated += writeResult.updated;
      results.push({
        created: writeResult.created,
        externalLeadId: item.externalLeadId,
        filesMatched: files.length,
        filesRead: fileRead.filesRead,
        opportunityId: item.opportunityId,
        skipped: writeResult.skipped,
        status: "ok",
        updated: writeResult.updated,
        warnings: fileRead.warnings,
      });
    }
  });

  return {
    created,
    filesMatched: fileRead.filesMatched,
    filesRead: fileRead.filesRead,
    results,
    skipped,
    status: "ok",
    updated,
    warnings: fileRead.warnings,
  };
}

export async function importPipedriveLeadNotePages({
  client,
  maxPages = defaultPipedriveLeadNoteMaxPages,
  now = new Date(),
  params = {},
  warnWhenUnlinked = false,
}: ImportLeadNotePagesOptions = {}): Promise<PipedriveLeadNotePageImportResult> {
  const readClient = client ?? (await getPipedriveReadOnlyClient());
  const pageLimit = boundedFullPullMaxPages(
    maxPages,
    defaultPipedriveLeadNoteMaxPages,
  );

  if (!readClient) {
    return {
      created: 0,
      ignored: 0,
      maxPages: pageLimit,
      moreAvailable: false,
      nextStart: null,
      pagesRead: 0,
      recordsRead: 0,
      recordsWritten: 0,
      results: [],
      skipped: 0,
      status: "not_configured",
      updated: 0,
    };
  }

  const results: PipedriveLeadNoteImportResult[] = [];
  let moreAvailable = false;
  let nextStart: number | null = null;
  let pagesRead = 0;
  let recordsRead = 0;
  let start = params.start ?? null;

  while (pagesRead < pageLimit) {
    const page = await readClient.listNotes(
      latestLeadNoteListParams({ ...params, start }),
    );
    pagesRead += 1;
    recordsRead += page.data.length;

    for (const note of page.data) {
      results.push(
        await syncPipedriveLeadNoteRecord({
          note,
          now,
          warnWhenUnlinked,
        }),
      );
    }

    moreAvailable = page.pagination.moreItemsInCollection;
    nextStart = page.pagination.nextStart;

    if (!moreAvailable || nextStart === null) {
      moreAvailable = false;
      nextStart = null;
      break;
    }

    start = nextStart;
  }

  const created = results.reduce((count, result) => count + result.created, 0);
  const updated = results.reduce((count, result) => count + result.updated, 0);

  return {
    created,
    ignored: results.filter((result) => result.ignored).length,
    maxPages: pageLimit,
    moreAvailable,
    nextStart,
    pagesRead,
    recordsRead,
    recordsWritten: created + updated,
    results,
    skipped: results.reduce((count, result) => count + result.skipped, 0),
    status: "ok",
    updated,
  };
}

export async function importPipedriveLeadNoteIds({
  client,
  noteIds,
  now = new Date(),
  warnWhenUnlinked = true,
}: ImportLeadNoteIdsOptions): Promise<PipedriveLeadNoteIdsImportResult> {
  const selectedNoteIds = normalizedSelectedNoteIds(noteIds);
  const readClient = client ?? (await getPipedriveReadOnlyClient());

  if (!readClient) {
    return {
      created: 0,
      ignored: 0,
      recordsRead: 0,
      recordsWritten: 0,
      requested: selectedNoteIds.length,
      results: [],
      skipped: selectedNoteIds.length,
      status: "not_configured",
      updated: 0,
    };
  }

  const results: PipedriveLeadNoteImportResult[] = [];

  for (const noteId of selectedNoteIds) {
    try {
      const note = await readClient.getNote(noteId);
      results.push(
        await syncPipedriveLeadNoteRecord({
          note,
          now,
          warnWhenUnlinked,
        }),
      );
    } catch (error) {
      results.push(
        skippedLeadNoteResult({
          externalNoteId: String(noteId),
          warning: pipedriveReadWarning("note", String(noteId), error),
        }),
      );
    }
  }

  const created = results.reduce((count, result) => count + result.created, 0);
  const updated = results.reduce((count, result) => count + result.updated, 0);

  return {
    created,
    ignored: results.filter((result) => result.ignored).length,
    recordsRead: selectedNoteIds.length,
    recordsWritten: created + updated,
    requested: selectedNoteIds.length,
    results,
    skipped: results.reduce((count, result) => count + result.skipped, 0),
    status: "ok",
    updated,
  };
}

export async function importPipedriveDealPage({
  client,
  params = {},
}: ImportDealPageOptions = {}) {
  const readClient = client ?? (await getPipedriveReadOnlyClient());

  if (!readClient) {
    return {
      results: [],
      skipped: 0,
      status: "not_configured" as const,
    };
  }

  void params;

  return {
    created: 0,
    linkedExisting: 0,
    page: emptyPipedriveDealPage(),
    results: [],
    skipped: 0,
    status: "ok" as const,
  };
}

export async function importPipedriveDealPages({
  client,
  maxPages,
  params = {},
}: ImportDealPagesOptions = {}) {
  const readClient = client ?? (await getPipedriveReadOnlyClient());
  const pageLimit = boundedFullPullMaxPages(maxPages);

  if (!readClient) {
    return {
      maxPages: pageLimit,
      moreAvailable: false,
      nextCursor: null,
      pagesRead: 0,
      recordsRead: 0,
      results: [],
      skipped: 0,
      status: "not_configured" as const,
    };
  }

  void params;

  return {
    created: 0,
    linkedExisting: 0,
    maxPages: pageLimit,
    moreAvailable: false,
    nextCursor: null,
    pagesRead: 0,
    recordsRead: 0,
    results: [],
    skipped: 0,
    status: "ok" as const,
  };
}

export async function importPipedrivePersonPage({
  client,
  params = {},
}: ImportPersonPageOptions = {}) {
  const readClient = client ?? (await getPipedriveReadOnlyClient());

  if (!readClient) {
    return {
      results: [],
      skipped: 0,
      status: "not_configured" as const,
    };
  }

  const page = await readClient.listPersons(latestPersonListParams(params));
  const results: PipedrivePersonImportResult[] = [];

  for (const person of page.data) {
    results.push(
      await importPipedrivePersonRecord({ client: readClient, person }),
    );
  }

  return {
    created: results.filter((result) => result.status === "created").length,
    linkedExisting: results.filter(
      (result) => result.status === "linked_existing",
    ).length,
    page: page as PipedriveListResult<PipedrivePerson>,
    results,
    skipped: results.filter((result) => result.status === "skipped").length,
    status: "ok" as const,
  };
}

export async function importPipedrivePersonPages({
  client,
  maxPages,
  params = {},
}: ImportPersonPagesOptions = {}) {
  const readClient = client ?? (await getPipedriveReadOnlyClient());
  const pageLimit = boundedFullPullMaxPages(
    maxPages,
    defaultPipedriveFullPersonPullMaxPages,
  );

  if (!readClient) {
    return {
      maxPages: pageLimit,
      moreAvailable: false,
      nextCursor: null,
      pagesRead: 0,
      recordsRead: 0,
      results: [],
      skipped: 0,
      status: "not_configured" as const,
    };
  }

  const results: PipedrivePersonImportResult[] = [];
  let cursor = params.cursor ?? null;
  let nextCursor: string | null = null;
  let pagesRead = 0;
  let recordsRead = 0;

  while (pagesRead < pageLimit) {
    const pageParams: PipedriveListPersonsParams = { ...params };
    if (cursor) pageParams.cursor = cursor;

    const page = await readClient.listPersons(
      latestPersonListParams(pageParams),
    );
    pagesRead += 1;
    recordsRead += page.data.length;

    for (const person of page.data) {
      results.push(
        await importPipedrivePersonRecord({ client: readClient, person }),
      );
    }

    nextCursor = page.pagination.nextCursor ?? null;

    if (!nextCursor) break;

    cursor = nextCursor;
  }

  return {
    created: results.filter((result) => result.status === "created").length,
    linkedExisting: results.filter(
      (result) => result.status === "linked_existing",
    ).length,
    maxPages: pageLimit,
    moreAvailable: Boolean(nextCursor),
    nextCursor,
    pagesRead,
    recordsRead,
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
    wouldCreate: previews.filter((preview) => preview.status === "would_create")
      .length,
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

  const crmMatches = await previewCrmMatches(mapping);
  const preview = previewFieldsFromMapping(mapping, crmMatches);

  if (
    existingLeadLink?.internalType === pipedriveInternalTypes.deletedOpportunity
  ) {
    return {
      ...preview,
      externalLeadId,
      linkedOpportunityId: null,
      status: "skipped",
      warnings: [
        ...relatedRecords.warnings,
        "Pipedrive lead was previously deleted from CRM.",
      ],
    };
  }

  if (existingLeadLink?.internalType === pipedriveInternalTypes.opportunity) {
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
    matchedCompanyId: previewMetadataText(preview.matchedCompanyId),
    matchedCompanyName: previewMetadataText(preview.matchedCompanyName),
    matchedContactId: previewMetadataText(preview.matchedContactId),
    matchedContactName: previewMetadataText(preview.matchedContactName),
    status: preview.status,
    title: previewMetadataText(preview.title),
    valueCents: preview.valueCents,
    warningCount: preview.warnings.length,
    warnings: preview.warnings
      .slice(0, 3)
      .map((warning) => truncateText(warning, 240)),
  }));
}

export function pipedriveImportablePreviewLeadIdsFromMetadata(
  metadata: unknown,
) {
  const record = objectValue(metadata);
  const previews = Array.isArray(record.previews) ? record.previews : [];
  const leadIds = new Set<string>();

  for (const preview of previews) {
    const previewRecord = objectValue(preview);
    const externalLeadId = cleanText(previewRecord.externalLeadId);

    if (previewRecord.status === "would_create" && externalLeadId) {
      leadIds.add(externalLeadId);
    }

    if (leadIds.size >= 50) break;
  }

  return [...leadIds];
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

export function pipedriveLeadIdFromInput(value: unknown) {
  const input = cleanText(value);
  if (!input) return null;

  const match = input.match(pipedriveLeadUuidPattern);

  return match?.[0].toLowerCase() ?? null;
}

export function pipedriveDealImportMetadataRows(
  results: PipedriveDealImportResult[],
): PipedriveDealImportMetadataRow[] {
  return results.map((result) => ({
    companyId: previewMetadataText(result.companyId),
    contactId: previewMetadataText(result.contactId),
    createdCompany: result.created.company,
    createdContact: result.created.contact,
    createdOpportunity: result.created.opportunity,
    externalDealId: previewMetadataText(result.externalDealId),
    opportunityId: previewMetadataText(result.opportunityId),
    status: result.status,
    title: previewMetadataText(result.title),
    warningCount: result.warnings.length,
    warnings: result.warnings
      .slice(0, 3)
      .map((warning) => truncateText(warning, 240)),
  }));
}

export function pipedrivePersonImportMetadataRows(
  results: PipedrivePersonImportResult[],
): PipedrivePersonImportMetadataRow[] {
  return results.map((result) => ({
    companyId: previewMetadataText(result.companyId),
    contactId: previewMetadataText(result.contactId),
    createdCompany: result.created.company,
    createdContact: result.created.contact,
    externalPersonId: previewMetadataText(result.externalPersonId),
    name: previewMetadataText(result.name),
    status: result.status,
    warningCount: result.warnings.length,
    warnings: result.warnings
      .slice(0, 3)
      .map((warning) => truncateText(warning, 240)),
  }));
}

export function pipedriveLeadNoteImportMetadataRows(
  results: PipedriveLeadNoteImportResult[],
): PipedriveLeadNoteImportMetadataRow[] {
  return results.map((result) => ({
    created: result.created,
    externalLeadId: previewMetadataText(result.externalLeadId),
    externalNoteId: previewMetadataText(result.externalNoteId),
    ignored: result.ignored,
    opportunityId: previewMetadataText(result.opportunityId),
    skipped: result.skipped,
    status: result.status,
    updated: result.updated,
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

export async function importPipedriveDealIds({
  client,
  dealIds,
  now = new Date(),
}: ImportDealIdsOptions) {
  const selectedDealIds = normalizedSelectedDealIds(dealIds);
  const readClient = client ?? (await getPipedriveReadOnlyClient());

  if (!readClient) {
    return {
      requested: selectedDealIds.length,
      results: [],
      skipped: selectedDealIds.length,
      status: "not_configured" as const,
    };
  }

  void now;
  const results = selectedDealIds.map((dealId) =>
    skippedDealResult({
      externalDealId: String(dealId),
      warning: pipedriveDealImportDisabledWarning,
    }),
  );

  return {
    created: results.filter((result) => result.status === "created").length,
    linkedExisting: results.filter(
      (result) => result.status === "linked_existing",
    ).length,
    requested: selectedDealIds.length,
    results,
    skipped: results.filter((result) => result.status === "skipped").length,
    status: "ok" as const,
  };
}

export async function importPipedrivePersonIds({
  client,
  now = new Date(),
  personIds,
}: ImportPersonIdsOptions) {
  const selectedPersonIds = normalizedSelectedPersonIds(personIds);
  const readClient = client ?? (await getPipedriveReadOnlyClient());

  if (!readClient) {
    return {
      requested: selectedPersonIds.length,
      results: [],
      skipped: selectedPersonIds.length,
      status: "not_configured" as const,
    };
  }

  const results: PipedrivePersonImportResult[] = [];

  for (const personId of selectedPersonIds) {
    try {
      const person = await readClient.getPerson(personId);
      results.push(
        await importPipedrivePersonRecord({
          client: readClient,
          now,
          person,
        }),
      );
    } catch (error) {
      results.push(
        skippedPersonResult({
          externalPersonId: String(personId),
          warning: pipedriveReadWarning("person", personId, error),
        }),
      );
    }
  }

  return {
    created: results.filter((result) => result.status === "created").length,
    linkedExisting: results.filter(
      (result) => result.status === "linked_existing",
    ).length,
    requested: selectedPersonIds.length,
    results,
    skipped: results.filter((result) => result.status === "skipped").length,
    status: "ok" as const,
  };
}

export async function importPipedrivePersonRecord({
  client,
  now = new Date(),
  person,
}: ImportPersonRecordOptions): Promise<PipedrivePersonImportResult> {
  const personId = externalId(person.id);

  if (!personId) {
    return skippedPersonResult({
      name: cleanText(person.name),
      warning: "Pipedrive person was missing an ID.",
    });
  }

  const [integration, relatedRecords] = await Promise.all([
    prisma.integrationConnection.findUnique({
      where: { provider: pipedriveProvider },
      select: { id: true },
    }),
    fetchPersonRelatedRecords(client, person),
  ]);
  const integrationId = integration?.id ?? null;
  const mapping = mapPipedrivePersonToCrm({
    defaultLeadSource: client.defaultLeadSource,
    organization: relatedRecords.organization,
    person,
  });

  if (!mapping.contact) {
    return skippedPersonResult({
      externalPersonId: personId,
      name: cleanText(person.name),
      warning: "Pipedrive person did not include enough contact identity.",
    });
  }
  const contactMapping = mapping.contact;

  return prisma.$transaction(async (tx) => {
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

    if (!contact.id) {
      return skippedPersonResult({
        externalPersonId: personId,
        name: `${contactMapping.firstName} ${contactMapping.lastName}`.trim(),
        warning: "Pipedrive person could not be linked to a CRM contact.",
      });
    }

    return {
      companyId: company.id,
      contactId: contact.id,
      created: {
        company: company.created,
        contact: contact.created,
      },
      externalPersonId: personId,
      name: `${contactMapping.firstName} ${contactMapping.lastName}`.trim(),
      status: contact.created ? "created" : ("linked_existing" as const),
      warnings: relatedRecords.warnings,
    };
  });
}

export async function importPipedriveDealRecord({
  client,
  deal,
  now = new Date(),
}: ImportDealRecordOptions): Promise<PipedriveDealImportResult> {
  if (pipedriveDealImportsDisabled()) {
    return skippedDealResult({
      externalDealId: externalId(deal.id),
      title: cleanText(deal.title),
      warning: pipedriveDealImportDisabledWarning,
    });
  }

  const dealId = externalId(deal.id);

  if (!dealId) {
    return skippedDealResult({
      title: cleanText(deal.title),
      warning: "Pipedrive deal was missing an ID.",
    });
  }

  const [integration, relatedRecords, settings] = await Promise.all([
    prisma.integrationConnection.findUnique({
      where: { provider: pipedriveProvider },
      select: { id: true },
    }),
    fetchDealRelatedRecords(client, deal),
    getCrmSettings(),
  ]);
  const integrationId = integration?.id ?? null;
  const workspaceDefaults = parseWorkspaceDefaults(settings.workspaceDefaults);
  const salesDefaults = parseSalesDefaults(settings.salesDefaults);
  const mapping = mapPipedriveDealToCrm({
    deal,
    defaultLeadSource: client.defaultLeadSource,
    organization: relatedRecords.organization,
    person: relatedRecords.person,
    workspaceCurrency: workspaceDefaults.currency,
  });

  const externalDealId = mapping.externalIds.deal;

  if (!externalDealId) {
    return skippedDealResult({
      title: mapping.opportunity.title,
      warning: "Pipedrive deal was missing an ID.",
    });
  }

  return prisma.$transaction(async (tx) => {
    const existingDealLink = await tx.externalRecordLink.findUnique({
      where: {
        provider_externalType_externalId: {
          externalId: externalDealId,
          externalType: pipedriveExternalTypes.deal,
          provider: pipedriveProvider,
        },
      },
      select: { internalId: true, internalType: true },
    });

    if (
      existingDealLink?.internalType ===
      pipedriveInternalTypes.deletedOpportunity
    ) {
      await upsertExternalRecordLink(tx, {
        externalId: externalDealId,
        externalType: pipedriveExternalTypes.deal,
        integrationId,
        internalId: existingDealLink.internalId,
        internalType: pipedriveInternalTypes.deletedOpportunity,
        metadata: {
          ...mapping.communication.metadata,
          deletedFromCrm: true,
          source: pipedriveImportSource,
        },
        now,
      });

      return skippedDealResult({
        externalDealId,
        title: mapping.opportunity.title,
        warning: "Pipedrive deal was previously deleted from CRM.",
      });
    }

    if (existingDealLink?.internalType === pipedriveInternalTypes.opportunity) {
      await upsertExternalRecordLink(tx, {
        externalId: externalDealId,
        externalType: pipedriveExternalTypes.deal,
        integrationId,
        internalId: existingDealLink.internalId,
        internalType: pipedriveInternalTypes.opportunity,
        metadata: mapping.communication.metadata,
        now,
      });

      return {
        companyId: null,
        contactId: null,
        created: { company: false, contact: false, opportunity: false },
        externalDealId,
        opportunityId: existingDealLink.internalId,
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
      externalId: externalDealId,
      externalType: pipedriveExternalTypes.deal,
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
      externalDealId,
      opportunityId: opportunity.id,
      status: "created" as const,
      title: mapping.opportunity.title,
      warnings: relatedRecords.warnings,
    };
  });
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

  const [integration, relatedRecords, noteRead, settings] = await Promise.all([
    prisma.integrationConnection.findUnique({
      where: { provider: pipedriveProvider },
      select: { id: true },
    }),
    fetchRelatedRecords(client, lead),
    readPipedriveLeadNotes(client, leadId),
    getCrmSettings(),
  ]);
  const warnings = [...relatedRecords.warnings, ...noteRead.warnings];
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
      existingLeadLink?.internalType ===
      pipedriveInternalTypes.deletedOpportunity
    ) {
      await upsertExternalRecordLink(tx, {
        externalId: externalLeadId,
        externalType: pipedriveExternalTypes.lead,
        integrationId,
        internalId: existingLeadLink.internalId,
        internalType: pipedriveInternalTypes.deletedOpportunity,
        metadata: {
          ...mapping.communication.metadata,
          deletedFromCrm: true,
          source: pipedriveImportSource,
        },
        now,
      });

      return skippedLeadResult({
        externalLeadId,
        title: mapping.opportunity.title,
        warning: "Pipedrive lead was previously deleted from CRM.",
      });
    }

    if (existingLeadLink?.internalType === pipedriveInternalTypes.opportunity) {
      const linkedOpportunity = await tx.salesOpportunity.findUnique({
        where: { id: existingLeadLink.internalId },
        select: { contactId: true, id: true },
      });

      await upsertExternalRecordLink(tx, {
        externalId: externalLeadId,
        externalType: pipedriveExternalTypes.lead,
        integrationId,
        internalId: existingLeadLink.internalId,
        internalType: pipedriveInternalTypes.opportunity,
        metadata: mapping.communication.metadata,
        now,
      });

      if (linkedOpportunity) {
        await syncPipedriveLeadNoteRecords(tx, {
          contactId: linkedOpportunity.contactId,
          externalLeadId,
          notes: noteRead.notes,
          now,
          opportunityId: linkedOpportunity.id,
        });
      }

      return {
        companyId: null,
        contactId: null,
        created: { company: false, contact: false, opportunity: false },
        externalLeadId,
        opportunityId: existingLeadLink.internalId,
        status: "linked_existing" as const,
        title: mapping.opportunity.title,
        warnings,
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

    await syncPipedriveLeadNoteRecords(tx, {
      contactId: contact.id,
      externalLeadId,
      notes: noteRead.notes,
      now,
      opportunityId: opportunity.id,
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
      warnings,
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
  const organizationRecord = objectValue(organization) as PipedriveOrganization;
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
  const emailMethods = pipedriveEmailContactMethods(
    resolvedPerson.email,
    resolvedPerson.emails,
  );
  const phoneMethods = pipedrivePhoneContactMethods(
    resolvedPerson.phone,
    resolvedPerson.phones,
  );
  const email = emailMethods[0]?.email ?? null;
  const phone = phoneMethods[0]?.phone ?? null;
  const contactName = contactNameParts({
    email,
    fallbackTitle: title,
    name: personName,
  });
  const value = opportunityValue(leadRecord.value, workspaceCurrency);
  const expectedCloseDate = parsePipedriveDate(lead.expected_close_date);
  const externalIds = {
    deal: null,
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
        emailMethods,
        firstName: contactName.firstName,
        lastName: contactName.lastName,
        leadSource: source,
        phone,
        phoneMethods,
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

export function mapPipedriveDealToCrm({
  deal,
  defaultLeadSource,
  organization,
  person,
  workspaceCurrency,
}: {
  deal: PipedriveDeal;
  defaultLeadSource?: string | null;
  organization?: PipedriveOrganization | null;
  person?: PipedrivePerson | null;
  workspaceCurrency: string;
}): PipedriveLeadImportMapping {
  const dealRecord = objectValue(deal);
  const embeddedPerson = objectValue(
    dealRecord.person ?? dealRecord.person_id,
  ) as PipedrivePerson;
  const embeddedOrganization = objectValue(
    dealRecord.organization ?? dealRecord.org_id ?? dealRecord.organization_id,
  ) as PipedriveOrganization;
  const personRecord = objectValue(person) as PipedrivePerson;
  const organizationRecord = objectValue(organization) as PipedriveOrganization;
  const resolvedPerson = Object.keys(personRecord).length
    ? personRecord
    : embeddedPerson;
  const resolvedOrganization = Object.keys(organizationRecord).length
    ? organizationRecord
    : embeddedOrganization;
  const source = cleanText(defaultLeadSource) ?? defaultPipedriveLeadSource;
  const title =
    cleanText(deal.title) ??
    cleanText(dealRecord.name) ??
    `Pipedrive deal ${externalId(deal.id) ?? "import"}`;
  const companyName = cleanText(resolvedOrganization.name);
  const personName =
    cleanText(resolvedPerson.name) ??
    [cleanText(resolvedPerson.first_name), cleanText(resolvedPerson.last_name)]
      .filter(Boolean)
      .join(" ")
      .trim();
  const embeddedPersonRecord = objectValue(dealRecord.person);
  const emailMethods = pipedriveEmailContactMethods(
    resolvedPerson.email,
    resolvedPerson.emails,
    embeddedPersonRecord.email,
    embeddedPersonRecord.emails,
  );
  const phoneMethods = pipedrivePhoneContactMethods(
    resolvedPerson.phone,
    resolvedPerson.phones,
    embeddedPersonRecord.phone,
    embeddedPersonRecord.phones,
  );
  const email = emailMethods[0]?.email ?? null;
  const phone = phoneMethods[0]?.phone ?? null;
  const contactName = contactNameParts({
    email,
    fallbackTitle: title,
    name: personName,
  });
  const dealValueRecord = objectValue(dealRecord.value);
  const value = opportunityValue(
    Object.keys(dealValueRecord).length
      ? dealRecord.value
      : {
          amount: dealRecord.value,
          currency: deal.currency ?? dealRecord.currency,
        },
    workspaceCurrency,
  );
  const expectedCloseDate = parsePipedriveDate(
    deal.expected_close_date ??
      dealRecord.expected_close_date ??
      dealRecord.close_time,
  );
  const externalIds = {
    deal: externalId(deal.id),
    lead: null,
    organization:
      externalId(resolvedOrganization.id) ??
      externalId(dealRecord.organization_id) ??
      externalId(dealRecord.org_id),
    person:
      externalId(resolvedPerson.id) ??
      externalId(dealRecord.person_id) ??
      externalId(dealRecord.person),
  };
  const attribution = {
    externalDealId: externalIds.deal,
    externalOrganizationId: externalIds.organization,
    externalPersonId: externalIds.person,
    provider: pipedriveProvider,
    source,
  } satisfies Prisma.InputJsonObject;
  const metadata = {
    ...attribution,
    importedFrom: "pipedrive",
    pipedriveAddTime: cleanText(deal.add_time),
    pipedriveUpdateTime: cleanText(deal.update_time),
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
        emailMethods,
        firstName: contactName.firstName,
        lastName: contactName.lastName,
        leadSource: source,
        phone,
        phoneMethods,
        phoneNormalized: normalizedContactPhone(phone),
        role: "Pipedrive deal contact",
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
      subject: `Pipedrive deal imported: ${title}`,
      summary: `Imported Pipedrive deal${companyName ? ` for ${companyName}` : ""}.`,
    },
    company,
    contact,
    externalIds,
    opportunity: {
      attribution,
      currency: value.currency,
      expectedCloseDate,
      nextStep: "Review Pipedrive deal and follow up.",
      source,
      title,
      valueCents: value.valueCents,
    },
  };
}

export function mapPipedrivePersonToCrm({
  defaultLeadSource,
  organization,
  person,
}: {
  defaultLeadSource?: string | null;
  organization?: PipedriveOrganization | null;
  person: PipedrivePerson;
}): PipedriveLeadImportMapping {
  const personRecord = objectValue(person);
  const embeddedOrganization = objectValue(
    personRecord.organization ??
      personRecord.org_id ??
      personRecord.organization_id,
  ) as PipedriveOrganization;
  const organizationRecord = objectValue(organization) as PipedriveOrganization;
  const resolvedOrganization = Object.keys(organizationRecord).length
    ? organizationRecord
    : embeddedOrganization;
  const source = cleanText(defaultLeadSource) ?? defaultPipedriveLeadSource;
  const externalPersonId = externalId(person.id);
  const companyName =
    cleanText(resolvedOrganization.name) ??
    cleanText(embeddedOrganization.name);
  const personName =
    cleanText(person.name) ??
    [cleanText(person.first_name), cleanText(person.last_name)]
      .filter(Boolean)
      .join(" ")
      .trim();
  const emailMethods = pipedriveEmailContactMethods(
    personRecord.email,
    personRecord.emails,
  );
  const phoneMethods = pipedrivePhoneContactMethods(
    personRecord.phone,
    personRecord.phones,
  );
  const email = emailMethods[0]?.email ?? null;
  const phone = phoneMethods[0]?.phone ?? null;
  const contactName = contactNameParts({
    email,
    fallbackTitle: `person ${externalPersonId ?? "import"}`,
    name: personName,
  });
  const externalOrganizationId =
    externalId(resolvedOrganization.id) ??
    externalId(embeddedOrganization.id) ??
    externalId(objectValue(embeddedOrganization).value) ??
    externalId(personRecord.organization_id) ??
    externalId(personRecord.org_id);
  const attribution = {
    externalOrganizationId,
    externalPersonId,
    provider: pipedriveProvider,
    source,
  } satisfies Prisma.InputJsonObject;
  const metadata = {
    ...attribution,
    importedFrom: "pipedrive",
    pipedriveAddTime: cleanText(person.add_time),
    pipedriveUpdateTime: cleanText(person.update_time),
    source: "pipedrive-contact-import",
  } satisfies Prisma.InputJsonObject;

  return {
    communication: {
      body: "",
      fromAddress: email,
      metadata,
      subject: "",
      summary: "",
    },
    company: companyName
      ? {
          addressLine1: cleanText(resolvedOrganization.address),
          name: companyName,
        }
      : null,
    contact:
      externalPersonId || email || phone
        ? {
            companyName,
            email,
            emailMethods,
            firstName: contactName.firstName,
            lastName: contactName.lastName,
            leadSource: source,
            phone,
            phoneMethods,
            phoneNormalized: normalizedContactPhone(phone),
            role: "Pipedrive contact",
          }
        : null,
    externalIds: {
      deal: null,
      lead: null,
      organization: externalOrganizationId,
      person: externalPersonId,
    },
    opportunity: {
      attribution,
      currency: "GBP",
      expectedCloseDate: null,
      nextStep: "",
      source,
      title: "",
      valueCents: 0,
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

async function fetchDealRelatedRecords(
  client: PipedriveRelatedRecordClient,
  deal: PipedriveDeal,
): Promise<ImportedRelatedRecords> {
  const warnings: string[] = [];
  const dealRecord = objectValue(deal);
  const personId =
    numericId(dealRecord.person_id) ??
    numericId(dealRecord.person) ??
    numericId(objectValue(dealRecord.person_id).value) ??
    numericId(objectValue(dealRecord.person).value);
  const organizationId =
    numericId(dealRecord.organization_id) ??
    numericId(dealRecord.organization) ??
    numericId(dealRecord.org_id) ??
    numericId(objectValue(dealRecord.organization_id).value) ??
    numericId(objectValue(dealRecord.organization).value) ??
    numericId(objectValue(dealRecord.org_id).value);
  const [person, organization] = await Promise.all([
    personId ? readPipedrivePerson(client, personId, warnings) : null,
    organizationId
      ? readPipedriveOrganization(client, organizationId, warnings)
      : null,
  ]);

  return { organization, person, warnings };
}

async function fetchPersonRelatedRecords(
  client: PipedriveRelatedRecordClient,
  person: PipedrivePerson,
): Promise<Omit<ImportedRelatedRecords, "person">> {
  const warnings: string[] = [];
  const personRecord = objectValue(person);
  const organizationId =
    numericId(personRecord.organization_id) ??
    numericId(personRecord.organization) ??
    numericId(personRecord.org_id) ??
    numericId(objectValue(personRecord.org_id).value);
  const organization = organizationId
    ? await readPipedriveOrganization(client, organizationId, warnings)
    : null;

  return { organization, warnings };
}

async function readPipedriveLeadNotes(
  client: PipedriveRelatedRecordClient,
  externalLeadId: string,
  maxPages = defaultPipedriveLeadNoteMaxPages,
): Promise<PipedriveLeadNotesReadResult> {
  if (typeof client.listNotes !== "function") {
    return { notes: [], notesRead: 0, warnings: [] };
  }

  const notes: PipedriveNote[] = [];
  const warnings: string[] = [];
  const pageLimit = boundedFullPullMaxPages(
    maxPages,
    defaultPipedriveLeadNoteMaxPages,
  );
  let notesRead = 0;
  let pagesRead = 0;
  let start: number | null = null;

  try {
    while (pagesRead < pageLimit) {
      const params: PipedriveListNotesParams = {
        leadId: externalLeadId,
        limit: 100,
        sort: "update_time DESC",
      };
      if (start !== null) params.start = start;

      const page = await client.listNotes(params);
      pagesRead += 1;
      notesRead += page.data.length;
      notes.push(...page.data);

      if (
        !page.pagination.moreItemsInCollection ||
        page.pagination.nextStart === null
      ) {
        break;
      }

      start = page.pagination.nextStart;
    }
  } catch (error) {
    warnings.push(pipedriveReadWarning("lead notes", externalLeadId, error));
  }

  return { notes, notesRead, warnings };
}

async function readPipedriveLeadFiles(
  client: PipedriveRelatedRecordClient,
  externalLeadId: string,
  maxPages = defaultPipedriveLeadFileMaxPages,
): Promise<PipedriveLeadFilesReadResult> {
  if (typeof client.listFiles !== "function") {
    return { files: [], filesMatched: 0, filesRead: 0, warnings: [] };
  }

  const files: PipedriveFile[] = [];
  const warnings: string[] = [];
  const pageLimit = boundedFullPullMaxPages(
    maxPages,
    defaultPipedriveLeadFileMaxPages,
  );
  let filesRead = 0;
  let pagesRead = 0;
  let start: number | null = null;

  try {
    while (pagesRead < pageLimit) {
      const params: PipedriveListFilesParams = {
        limit: 100,
        sort: "update_time DESC",
      };
      if (start !== null) params.start = start;

      const page = await client.listFiles(params);
      pagesRead += 1;
      filesRead += page.data.length;
      files.push(
        ...page.data.filter(
          (file) => pipedriveLeadIdFromFile(file) === externalLeadId,
        ),
      );

      if (
        !page.pagination.moreItemsInCollection ||
        page.pagination.nextStart === null
      ) {
        break;
      }

      start = page.pagination.nextStart;
    }
  } catch (error) {
    warnings.push(pipedriveReadWarning("lead files", externalLeadId, error));
  }

  return {
    files,
    filesMatched: files.length,
    filesRead,
    warnings,
  };
}

async function readPipedriveLeadFilesForLeadIds(
  client: PipedriveRelatedRecordClient,
  externalLeadIds: Set<string>,
  maxPages = defaultPipedriveLeadFileMaxPages,
): Promise<PipedriveLeadFilesReadResult & { filesByLeadId: Map<string, PipedriveFile[]> }> {
  if (typeof client.listFiles !== "function" || externalLeadIds.size === 0) {
    return {
      files: [],
      filesByLeadId: new Map(),
      filesMatched: 0,
      filesRead: 0,
      warnings: [],
    };
  }

  const files: PipedriveFile[] = [];
  const filesByLeadId = new Map<string, PipedriveFile[]>();
  const warnings: string[] = [];
  const pageLimit = boundedFullPullMaxPages(
    maxPages,
    defaultPipedriveLeadFileMaxPages,
  );
  let filesRead = 0;
  let pagesRead = 0;
  let start: number | null = null;

  try {
    while (pagesRead < pageLimit) {
      const params: PipedriveListFilesParams = {
        limit: 500,
        sort: "update_time DESC",
      };
      if (start !== null) params.start = start;

      const page = await client.listFiles(params);
      pagesRead += 1;
      filesRead += page.data.length;

      for (const file of page.data) {
        const externalLeadId = pipedriveLeadIdFromFile(file);
        if (!externalLeadId || !externalLeadIds.has(externalLeadId)) continue;

        files.push(file);
        const currentFiles = filesByLeadId.get(externalLeadId) ?? [];
        currentFiles.push(file);
        filesByLeadId.set(externalLeadId, currentFiles);
      }

      if (
        !page.pagination.moreItemsInCollection ||
        page.pagination.nextStart === null
      ) {
        break;
      }

      start = page.pagination.nextStart;
    }
  } catch (error) {
    warnings.push(pipedriveReadWarning("lead files", "linked-sale batch", error));
  }

  return {
    files,
    filesByLeadId,
    filesMatched: files.length,
    filesRead,
    warnings,
  };
}

async function resolvePipedrivePersonIdForLeadEmailSync({
  client,
  contactId,
  externalLeadId,
  leadMetadata,
  warnings,
}: {
  client: PipedriveRelatedRecordClient;
  contactId: string | null;
  externalLeadId: string;
  leadMetadata: unknown;
  warnings: string[];
}) {
  const metadataPersonId = numericId(objectValue(leadMetadata).externalPersonId);
  if (metadataPersonId) return metadataPersonId;

  if (contactId) {
    const contactPersonLink = await prisma.externalRecordLink.findFirst({
      where: {
        externalType: pipedriveExternalTypes.person,
        internalId: contactId,
        internalType: pipedriveInternalTypes.contact,
        provider: pipedriveProvider,
      },
      select: { externalId: true },
    });
    const linkedPersonId = numericId(contactPersonLink?.externalId);
    if (linkedPersonId) return linkedPersonId;
  }

  if (typeof client.getLead !== "function") return null;

  try {
    return pipedrivePersonIdFromLead(await client.getLead(externalLeadId));
  } catch (error) {
    warnings.push(pipedriveReadWarning("lead", externalLeadId, error));
    return null;
  }
}

async function readPipedriveLeadEmails(
  client: PipedriveRelatedRecordClient,
  externalLeadId: string,
  personId: number | null,
  maxPages = defaultPipedriveLeadEmailMaxPages,
): Promise<PipedriveLeadEmailsReadResult> {
  const emails: PipedriveMailMessage[] = [];
  const warnings: string[] = [];
  let emailsRead = 0;

  const threadEmailRead = await readPipedriveLeadThreadEmails(
    client,
    externalLeadId,
    maxPages,
  );
  emails.push(...threadEmailRead.emails);
  emailsRead += threadEmailRead.emailsRead;
  warnings.push(...threadEmailRead.warnings);

  if (personId && typeof client.listPersonMailMessages === "function") {
    const personEmailRead = await readPipedrivePersonEmailsForLead(
      client,
      externalLeadId,
      personId,
      maxPages,
    );
    emails.push(...personEmailRead.emails);
    emailsRead += personEmailRead.emailsRead;
    warnings.push(...personEmailRead.warnings);
  }

  return {
    emails: deduplicatePipedriveMailMessages(emails),
    emailsRead,
    warnings,
  };
}

async function readPipedriveLeadThreadEmails(
  client: PipedriveRelatedRecordClient,
  externalLeadId: string,
  maxPages = defaultPipedriveLeadEmailMaxPages,
): Promise<PipedriveLeadEmailsReadResult> {
  if (
    typeof client.listMailThreads !== "function" ||
    typeof client.listMailThreadMessages !== "function"
  ) {
    return { emails: [], emailsRead: 0, warnings: [] };
  }

  const emails: PipedriveMailMessage[] = [];
  const matchedThreads = new Map<number, PipedriveMailThread>();
  const warnings: string[] = [];
  const pageLimit = boundedFullPullMaxPages(
    maxPages,
    defaultPipedriveLeadEmailMaxPages,
    manualPipedriveLeadEmailMaxPages,
  );
  let emailsRead = 0;

  for (const folder of pipedriveLeadEmailThreadFolders) {
    const threadRead = await readPipedriveLeadEmailThreadPagesForFolder(
      client,
      folder,
      null,
      pageLimit,
    );
    warnings.push(...threadRead.warnings);

    for (const thread of threadRead.threadsByLeadId.get(externalLeadId) ?? []) {
      const threadId = pipedriveMailThreadId(thread);
      if (!threadId) continue;

      matchedThreads.set(threadId, thread);
    }
  }

  for (const [threadId, thread] of matchedThreads) {
    try {
      const page = await client.listMailThreadMessages(threadId);
      emailsRead += page.data.length;

      for (const message of page.data) {
        const messageWithThreadContext = withPipedriveMailThreadContext({
          externalLeadId,
          message,
          thread,
          threadId,
        });
        if (
          !shouldImportPipedriveMailMessageForLead(
            messageWithThreadContext,
            externalLeadId,
          )
        ) {
          continue;
        }

        emails.push(
          await readFullPipedriveMailMessageIfNeeded(
            client,
            messageWithThreadContext,
            warnings,
          ),
        );
      }
    } catch (error) {
      warnings.push(
        pipedriveReadWarning(
          "lead email thread messages",
          `${externalLeadId}/${threadId}`,
          error,
        ),
      );
    }
  }

  return { emails, emailsRead, warnings };
}

async function readPipedriveLeadEmailThreadPagesForFolder(
  client: PipedriveRelatedRecordClient,
  folder: PipedriveLeadEmailThreadFolder,
  start: number | null,
  maxPages: number,
): Promise<{
  moreAvailable: boolean;
  nextStart: number | null;
  pagesRead: number;
  threadsByLeadId: Map<string, PipedriveMailThread[]>;
  threadsRead: number;
  warnings: string[];
}> {
  const threadsByLeadId = new Map<string, PipedriveMailThread[]>();
  const warnings: string[] = [];
  let pagesRead = 0;
  let threadsRead = 0;
  let nextStart = start;

  try {
    while (pagesRead < maxPages) {
      const params: PipedriveListMailThreadsParams = {
        folder,
        limit: 50,
      };
      if (nextStart !== null) params.start = nextStart;

      const page = await client.listMailThreads!(params);
      pagesRead += 1;
      threadsRead += page.data.length;

      for (const thread of page.data) {
        const threadLeadId = pipedriveLeadIdFromMailThread(thread);
        if (!threadLeadId) continue;

        const threads = threadsByLeadId.get(threadLeadId) ?? [];
        threads.push(thread);
        threadsByLeadId.set(threadLeadId, threads);
      }

      if (
        !page.pagination.moreItemsInCollection ||
        page.pagination.nextStart === null
      ) {
        return {
          moreAvailable: false,
          nextStart: null,
          pagesRead,
          threadsByLeadId,
          threadsRead,
          warnings,
        };
      }

      nextStart = page.pagination.nextStart;
    }
  } catch (error) {
    warnings.push(
      pipedriveReadWarning(
        "lead email thread pages",
        `${folder}/${nextStart ?? 0}`,
        error,
      ),
    );

    return {
      moreAvailable: true,
      nextStart,
      pagesRead,
      threadsByLeadId,
      threadsRead,
      warnings,
    };
  }

  return {
    moreAvailable: nextStart !== null,
    nextStart,
    pagesRead,
    threadsByLeadId,
    threadsRead,
    warnings,
  };
}

async function readPipedrivePersonEmailsForLead(
  client: PipedriveRelatedRecordClient,
  externalLeadId: string,
  personId: number,
  maxPages = defaultPipedriveLeadEmailMaxPages,
): Promise<PipedriveLeadEmailsReadResult> {
  if (typeof client.listPersonMailMessages !== "function") {
    return { emails: [], emailsRead: 0, warnings: [] };
  }

  const emails: PipedriveMailMessage[] = [];
  const warnings: string[] = [];
  const pageLimit = boundedFullPullMaxPages(
    maxPages,
    defaultPipedriveLeadEmailMaxPages,
  );
  let emailsRead = 0;
  let pagesRead = 0;
  let start: number | null = null;

  try {
    while (pagesRead < pageLimit) {
      const params: PipedriveListPersonMailMessagesParams = {
        includeBody: true,
        limit: 50,
      };
      if (start !== null) params.start = start;

      const page = await client.listPersonMailMessages(personId, params);
      pagesRead += 1;
      emailsRead += page.data.length;
      emails.push(
        ...page.data.filter((message) =>
          shouldImportPipedriveMailMessageForLead(message, externalLeadId),
        ),
      );

      if (
        !page.pagination.moreItemsInCollection ||
        page.pagination.nextStart === null
      ) {
        break;
      }

      start = page.pagination.nextStart;
    }
  } catch (error) {
    warnings.push(
      pipedriveReadWarning("lead emails", `${externalLeadId}/${personId}`, error),
    );
  }

  return { emails, emailsRead, warnings };
}

function deduplicatePipedriveMailMessages(emails: PipedriveMailMessage[]) {
  const uniqueEmails: PipedriveMailMessage[] = [];
  const seen = new Set<string>();

  for (const email of emails) {
    const mailId = pipedriveMailMessageExternalId(email);
    if (!mailId) {
      uniqueEmails.push(email);
      continue;
    }
    if (seen.has(mailId)) continue;

    seen.add(mailId);
    uniqueEmails.push(email);
  }

  return uniqueEmails;
}

async function readFullPipedriveMailMessageIfNeeded(
  client: PipedriveRelatedRecordClient,
  message: PipedriveMailMessage,
  warnings: string[],
) {
  if (
    pipedriveMailMessageHasBody(message) ||
    typeof client.getMailMessage !== "function"
  ) {
    return message;
  }

  const mailId = numericId(pipedriveMailMessageExternalId(message));
  if (!mailId) return message;

  try {
    const fullMessage = await client.getMailMessage(mailId, {
      includeBody: true,
    });
    const fullRecord = objectValue(fullMessage);
    const fullDataRecord = pipedriveMailMessageDataRecord(fullMessage);
    const messageRecord = objectValue(message);
    const messageDataRecord = pipedriveMailMessageDataRecord(message);

    return {
      ...message,
      ...fullMessage,
      deal_id:
        fullMessage.deal_id ??
        fullRecord.deal_id ??
        fullDataRecord.deal_id ??
        message.deal_id ??
        messageRecord.deal_id ??
        messageDataRecord.deal_id,
      lead_id:
        fullMessage.lead_id ??
        fullRecord.lead_id ??
        fullDataRecord.lead_id ??
        message.lead_id ??
        messageRecord.lead_id ??
        messageDataRecord.lead_id,
      mail_thread_id:
        fullMessage.mail_thread_id ??
        fullRecord.mail_thread_id ??
        fullDataRecord.mail_thread_id ??
        message.mail_thread_id ??
        messageRecord.mail_thread_id ??
        messageDataRecord.mail_thread_id,
    } satisfies PipedriveMailMessage;
  } catch (error) {
    warnings.push(
      pipedriveReadWarning(
        "mail message body",
        pipedriveMailMessageExternalId(message) ?? "unknown",
        error,
      ),
    );
    return message;
  }
}

function withPipedriveMailThreadContext({
  externalLeadId,
  message,
  thread,
  threadId,
}: {
  externalLeadId: string;
  message: PipedriveMailMessage;
  thread: PipedriveMailThread;
  threadId: number;
}) {
  const messageRecord = objectValue(message);
  const messageLeadId = pipedriveLeadIdFromMailMessage(message);
  const threadDealId = pipedriveDealIdFromMailThread(thread);

  return {
    ...message,
    deal_id: messageRecord.deal_id ?? threadDealId,
    lead_id: messageLeadId ?? externalLeadId,
    mail_thread_id:
      message.mail_thread_id ??
      messageRecord.mail_thread_id ??
      messageRecord.thread_id ??
      threadId,
  } satisfies PipedriveMailMessage;
}

async function syncPipedriveLeadEmailRecords(
  tx: Prisma.TransactionClient,
  {
    contactEmails,
    contactId,
    emails,
    externalLeadId,
    externalPersonId,
    now,
    opportunityId,
  }: {
    contactEmails: string[];
    contactId: string | null;
    emails: PipedriveMailMessage[];
    externalLeadId: string;
    externalPersonId: string | null;
    now: Date;
    opportunityId: string;
  },
): Promise<PipedriveLeadEmailsWriteResult> {
  let created = 0;
  let skipped = 0;
  let updated = 0;

  for (const email of emails) {
    const mapped = mapPipedriveMailMessageToSalesEmail({
      contactEmails,
      contactId,
      email,
      externalLeadId,
      externalPersonId,
      now,
      opportunityId,
    });

    if (!mapped) {
      skipped += 1;
      continue;
    }

    const existingCommunication = await tx.salesCommunication.findFirst({
      where: {
        externalId: mapped.externalId,
        opportunityId,
      },
      select: { id: true },
    });
    const communication = existingCommunication
      ? await tx.salesCommunication.update({
          where: { id: existingCommunication.id },
          data: mapped.communicationData,
          select: { id: true },
        })
      : await tx.salesCommunication.create({
          data: mapped.communicationData,
          select: { id: true },
        });

    if (existingCommunication) {
      updated += 1;
    } else {
      created += 1;
    }

    const existingEmail = await tx.emailMessage.findUnique({
      where: { providerMessageId: mapped.providerMessageId },
      select: {
        id: true,
        opportunityId: true,
        salesCommunicationId: true,
      },
    });

    if (!existingEmail) {
      await tx.emailMessage.create({
        data: {
          ...mapped.emailData,
          salesCommunicationId: communication.id,
        },
        select: { id: true },
      });
      continue;
    }

    if (
      existingEmail.opportunityId === opportunityId ||
      existingEmail.salesCommunicationId === communication.id ||
      !existingEmail.salesCommunicationId
    ) {
      await tx.emailMessage.update({
        where: { id: existingEmail.id },
        data: {
          ...mapped.emailData,
          salesCommunicationId: communication.id,
        },
        select: { id: true },
      });
    }
  }

  return { created, skipped, updated };
}

function mapPipedriveMailMessageToSalesEmail({
  contactEmails,
  contactId,
  email,
  externalLeadId,
  externalPersonId,
  now,
  opportunityId,
}: {
  contactEmails: string[];
  contactId: string | null;
  email: PipedriveMailMessage;
  externalLeadId: string;
  externalPersonId: string | null;
  now: Date;
  opportunityId: string;
}) {
  const emailRecord = objectValue(email);
  const emailDataRecord = pipedriveMailMessageDataRecord(email);
  const externalMailId = pipedriveMailMessageExternalId(email);

  if (!externalMailId) return null;

  const externalThreadId =
    externalId(email.mail_thread_id) ??
    externalId(emailRecord.mail_thread_id) ??
    externalId(emailDataRecord.mail_thread_id) ??
    externalId(emailRecord.thread_id) ??
    externalId(emailDataRecord.thread_id) ??
    externalId(emailRecord.mail_thread) ??
    externalId(emailDataRecord.mail_thread);
  const fromAddress = firstEmailAddress(
    email.from ??
      emailRecord.from ??
      emailDataRecord.from ??
      emailRecord.from_address ??
      emailDataRecord.from_address ??
      emailRecord.from_email ??
      emailDataRecord.from_email ??
      emailRecord.sender ??
      emailDataRecord.sender,
  );
  const toAddress = firstEmailAddress(
    email.to ??
      emailRecord.to ??
      emailDataRecord.to ??
      emailRecord.to_address ??
      emailDataRecord.to_address ??
      emailRecord.to_email ??
      emailDataRecord.to_email,
  );
  const fromName = firstEmailName(
    email.from ??
      emailRecord.from ??
      emailDataRecord.from ??
      emailRecord.from_address ??
      emailDataRecord.from_address ??
      emailRecord.from_email ??
      emailDataRecord.from_email ??
      emailRecord.sender ??
      emailDataRecord.sender,
  );
  const subject =
    cleanText(email.subject) ??
    cleanText(emailRecord.subject) ??
    cleanText(emailDataRecord.subject) ??
    "Pipedrive email";
  const bodySource =
    cleanText(email.body_plain) ??
    cleanText(emailRecord.body_plain) ??
    cleanText(emailDataRecord.body_plain) ??
    cleanText(emailRecord.body_text) ??
    cleanText(emailDataRecord.body_text) ??
    cleanText(emailRecord.text) ??
    cleanText(emailDataRecord.text) ??
    cleanText(email.body) ??
    cleanText(emailRecord.body) ??
    cleanText(emailDataRecord.body) ??
    cleanText(emailRecord.content) ??
    cleanText(emailDataRecord.content) ??
    cleanText(email.snippet) ??
    cleanText(emailRecord.snippet) ??
    cleanText(emailDataRecord.snippet);
  const plainBody =
    toEmailPlainText(bodySource) ||
    cleanText(email.snippet) ||
    cleanText(emailRecord.snippet) ||
    cleanText(emailDataRecord.snippet) ||
    subject;
  const htmlBody =
    bodySource && /<\/?[a-z][\s\S]*>/i.test(bodySource) ? bodySource : null;
  const occurredAt =
    parsePipedriveDate(email.message_time) ??
    parsePipedriveDate(emailRecord.message_time) ??
    parsePipedriveDate(emailDataRecord.message_time) ??
    parsePipedriveDate(email.timestamp) ??
    parsePipedriveDate(emailRecord.timestamp) ??
    parsePipedriveDate(emailDataRecord.timestamp) ??
    parsePipedriveDate(email.add_time) ??
    parsePipedriveDate(emailRecord.add_time) ??
    parsePipedriveDate(emailDataRecord.add_time) ??
    parsePipedriveDate(email.update_time) ??
    parsePipedriveDate(emailRecord.update_time) ??
    parsePipedriveDate(emailDataRecord.update_time) ??
    now;
  const normalizedContactEmails = new Set(
    contactEmails.map((value) => value.toLowerCase()),
  );
  const direction =
    fromAddress && normalizedContactEmails.has(fromAddress)
      ? ("INBOUND" as const)
      : ("OUTBOUND" as const);
  const providerMessageId = `${pipedriveMailExternalIdPrefix}${externalMailId}`;
  const matchedLeadId = pipedriveLeadIdFromMailMessage(email);
  const matchedDealId = pipedriveDealIdFromMailMessage(email);
  const metadata = {
    externalLeadId,
    externalMailId,
    externalPersonId: externalPersonId ?? null,
    externalThreadId: externalThreadId ?? null,
    importedFrom: "pipedrive",
    matchedDealId,
    matchedLeadId,
    pipedriveAddTime:
      cleanText(email.add_time) ??
      cleanText(emailRecord.add_time) ??
      cleanText(emailDataRecord.add_time),
    pipedriveMessageTime:
      cleanText(email.message_time ?? email.timestamp) ??
      cleanText(emailRecord.message_time ?? emailRecord.timestamp) ??
      cleanText(emailDataRecord.message_time ?? emailDataRecord.timestamp),
    pipedriveUpdateTime:
      cleanText(email.update_time) ??
      cleanText(emailRecord.update_time) ??
      cleanText(emailDataRecord.update_time),
    provider: pipedriveProvider,
    source: pipedriveMailImportSource,
  } satisfies Prisma.InputJsonObject;
  const summary = emailTextSummary(plainBody, "Pipedrive email");

  return {
    communicationData: {
      body: plainBody || null,
      channel: "EMAIL" as const,
      contactId,
      direction,
      externalId: providerMessageId,
      fromAddress,
      metadata,
      occurredAt,
      opportunityId,
      subject,
      summary,
      toAddress,
    },
    emailData: {
      attachments: jsonValue(
        emailRecord.attachments ?? emailDataRecord.attachments,
      ),
      ccAddresses: jsonValue(emailRecord.cc ?? emailDataRecord.cc),
      contactId,
      direction,
      fromAddress,
      fromName,
      headers: jsonValue(emailRecord.headers ?? emailDataRecord.headers),
      htmlBody,
      metadata,
      opportunityId,
      provider: pipedriveProvider,
      providerMessageId,
      receivedAt: occurredAt,
      status: "READ" as const,
      subject,
      summary,
      textBody: plainBody || null,
      toAddress,
    },
    externalId: providerMessageId,
    providerMessageId,
  };
}

async function syncPipedriveLeadFileRecords(
  tx: Prisma.TransactionClient,
  {
    externalLeadId,
    files,
    integrationId,
    now,
    opportunityId,
  }: {
    externalLeadId: string;
    files: PipedriveFile[];
    integrationId: string | null;
    now: Date;
    opportunityId: string;
  },
): Promise<PipedriveLeadFilesWriteResult> {
  let created = 0;
  let skipped = 0;
  let updated = 0;

  for (const file of files) {
    const mapped = mapPipedriveFileToExternalLink({
      externalLeadId,
      file,
      now,
      opportunityId,
    });

    if (!mapped) {
      skipped += 1;
      continue;
    }

    const existingFileLink = await tx.externalRecordLink.findUnique({
      where: {
        provider_externalType_externalId: {
          externalId: mapped.externalId,
          externalType: mapped.externalType,
          provider: pipedriveProvider,
        },
      },
      select: { id: true },
    });

    await upsertExternalRecordLink(tx, {
      externalId: mapped.externalId,
      externalType: mapped.externalType,
      integrationId,
      internalId: mapped.internalId,
      internalType: mapped.internalType,
      metadata: mapped.metadata,
      now,
    });

    if (existingFileLink) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  return { created, skipped, updated };
}

function mapPipedriveFileToExternalLink({
  externalLeadId,
  file,
  now,
  opportunityId,
}: {
  externalLeadId: string;
  file: PipedriveFile;
  now: Date;
  opportunityId: string;
}) {
  if (file.active_flag === false) return null;

  const externalFileId = externalId(file.id);
  if (!externalFileId) return null;

  const linkedLeadId = pipedriveLeadIdFromFile(file);
  if (linkedLeadId !== externalLeadId) return null;

  const name =
    cleanText(file.name) ??
    cleanText(file.file_name) ??
    `Pipedrive file ${externalFileId}`;
  const pipedriveUrl =
    httpsUrl(file.url) ?? httpsUrl(file.download_url) ?? null;
  const sizeBytes =
    nonNegativeInteger(file.file_size) ?? nonNegativeInteger(file.size);
  const metadata = {
    externalFileId,
    externalLeadId,
    importedFrom: "pipedrive",
    name,
    pipedriveAddTime: cleanText(file.add_time),
    pipedriveFileName: cleanText(file.file_name),
    pipedriveFileType:
      cleanText(file.file_type) ?? cleanText(file.mime_type) ?? null,
    pipedriveUpdateTime: cleanText(file.update_time),
    pipedriveUrl,
    provider: pipedriveProvider,
    sizeBytes,
    source: pipedriveFileImportSource,
    syncedAt: now.toISOString(),
  } satisfies Prisma.InputJsonObject;

  return {
    externalId: externalFileId,
    externalType: pipedriveExternalTypes.file,
    internalId: opportunityId,
    internalType: pipedriveInternalTypes.opportunity,
    metadata,
  };
}

async function syncPipedriveLeadNoteRecord({
  note,
  now,
  warnWhenUnlinked,
}: {
  note: PipedriveNote;
  now: Date;
  warnWhenUnlinked: boolean;
}): Promise<PipedriveLeadNoteImportResult> {
  const externalNoteId = externalId(note.id);

  if (!externalNoteId) {
    return skippedLeadNoteResult({
      warning: "Pipedrive note was missing an ID.",
    });
  }

  const externalLeadId = pipedriveLeadIdFromNote(note);

  if (!externalLeadId) {
    return {
      created: 0,
      externalLeadId: null,
      externalNoteId,
      ignored: true,
      opportunityId: null,
      skipped: 0,
      status: "ignored",
      updated: 0,
      warnings: [],
    };
  }

  const linkedOpportunity = await prisma.externalRecordLink.findFirst({
    where: {
      externalId: externalLeadId,
      externalType: pipedriveExternalTypes.lead,
      internalType: pipedriveInternalTypes.opportunity,
      provider: pipedriveProvider,
    },
    select: {
      internalId: true,
    },
  });

  if (!linkedOpportunity) {
    return skippedLeadNoteResult({
      externalLeadId,
      externalNoteId,
      warning: warnWhenUnlinked
        ? "Pipedrive note lead is not linked to a CRM sale."
        : null,
    });
  }

  const opportunity = await prisma.salesOpportunity.findUnique({
    where: { id: linkedOpportunity.internalId },
    select: { contactId: true, id: true },
  });

  if (!opportunity) {
    return skippedLeadNoteResult({
      externalLeadId,
      externalNoteId,
      opportunityId: linkedOpportunity.internalId,
      warning: warnWhenUnlinked
        ? "Linked CRM sale could not be found for the Pipedrive note."
        : null,
    });
  }

  const writeResult = await prisma.$transaction((tx) =>
    syncPipedriveLeadNoteRecords(tx, {
      contactId: opportunity.contactId,
      externalLeadId,
      notes: [note],
      now,
      opportunityId: opportunity.id,
    }),
  );
  const status =
    writeResult.created > 0
      ? "created"
      : writeResult.updated > 0
        ? "updated"
        : "skipped";

  return {
    created: writeResult.created,
    externalLeadId,
    externalNoteId,
    ignored: false,
    opportunityId: opportunity.id,
    skipped: writeResult.skipped,
    status,
    updated: writeResult.updated,
    warnings: [],
  };
}

async function syncPipedriveLeadNoteRecords(
  tx: Prisma.TransactionClient,
  {
    contactId,
    externalLeadId,
    notes,
    now,
    opportunityId,
  }: {
    contactId: string | null;
    externalLeadId: string;
    notes: PipedriveNote[];
    now: Date;
    opportunityId: string;
  },
): Promise<PipedriveLeadNotesWriteResult> {
  let created = 0;
  let skipped = 0;
  let updated = 0;

  for (const note of notes) {
    const mapped = mapPipedriveNoteToSalesCommunication({
      contactId,
      externalLeadId,
      note,
      now,
      opportunityId,
    });

    if (!mapped) {
      skipped += 1;
      continue;
    }

    const existingNote = await tx.salesCommunication.findFirst({
      where: {
        externalId: mapped.externalId,
        opportunityId,
      },
      select: { id: true },
    });

    if (existingNote) {
      await tx.salesCommunication.update({
        where: { id: existingNote.id },
        data: mapped.data,
      });
      updated += 1;
      continue;
    }

    await tx.salesCommunication.create({
      data: mapped.data,
      select: { id: true },
    });
    created += 1;
  }

  return { created, skipped, updated };
}

function mapPipedriveNoteToSalesCommunication({
  contactId,
  externalLeadId,
  note,
  now,
  opportunityId,
}: {
  contactId: string | null;
  externalLeadId: string;
  note: PipedriveNote;
  now: Date;
  opportunityId: string;
}) {
  if (note.active_flag === false) return null;

  const externalNoteId = externalId(note.id);
  if (!externalNoteId) return null;

  const body = toEmailPlainText(cleanText(note.content));
  if (!body) return null;

  const userRecord = objectValue(note.user);
  const pipedriveUserId = externalId(note.user_id) ?? externalId(userRecord.id);
  const pipedriveUserName =
    cleanText(userRecord.name) ?? cleanText(userRecord.email);
  const occurredAt =
    parsePipedriveDate(note.add_time) ??
    parsePipedriveDate(note.update_time) ??
    now;
  const metadata = {
    externalLeadId,
    externalNoteId,
    importedFrom: "pipedrive",
    pipedriveAddTime: cleanText(note.add_time),
    pipedriveUpdateTime: cleanText(note.update_time),
    provider: pipedriveProvider,
    ...(pipedriveUserId ? { pipedriveUserId } : {}),
    ...(pipedriveUserName ? { pipedriveUserName } : {}),
    source: pipedriveNoteImportSource,
  } satisfies Prisma.InputJsonObject;
  const summary = truncateText(body.replace(/\s+/g, " "), 180);

  return {
    data: {
      body,
      channel: "NOTE" as const,
      contactId,
      direction: "INTERNAL" as const,
      externalId: `${pipedriveNoteExternalIdPrefix}${externalNoteId}`,
      metadata,
      occurredAt,
      opportunityId,
      subject: "Pipedrive note",
      summary,
    },
    externalId: `${pipedriveNoteExternalIdPrefix}${externalNoteId}`,
  };
}

function skippedLeadNoteResult({
  externalLeadId = null,
  externalNoteId = null,
  opportunityId = null,
  warning = null,
}: {
  externalLeadId?: string | null;
  externalNoteId?: string | null;
  opportunityId?: string | null;
  warning?: string | null;
}): PipedriveLeadNoteImportResult {
  return {
    created: 0,
    externalLeadId,
    externalNoteId,
    ignored: false,
    opportunityId,
    skipped: 1,
    status: "skipped",
    updated: 0,
    warnings: warning ? [warning] : [],
  };
}

function pipedriveLeadIdFromNote(note: PipedriveNote) {
  const noteRecord = objectValue(note);
  const leadRecord = objectValue(noteRecord.lead);
  const leadIdRecord = objectValue(noteRecord.lead_id);

  return (
    externalId(note.lead_id) ??
    externalId(leadRecord.id) ??
    externalId(leadIdRecord.id) ??
    externalId(leadIdRecord.value)
  );
}

function pipedriveLeadIdFromFile(file: PipedriveFile) {
  const fileRecord = objectValue(file);
  const leadRecord = objectValue(fileRecord.lead);
  const leadIdRecord = objectValue(fileRecord.lead_id);

  return (
    externalId(file.lead_id) ??
    externalId(leadRecord.id) ??
    externalId(leadIdRecord.id) ??
    externalId(leadIdRecord.value)
  );
}

function pipedrivePersonIdFromLead(lead: PipedriveLead) {
  const leadRecord = objectValue(lead);
  const personRecord = objectValue(leadRecord.person);
  const personIdRecord = objectValue(leadRecord.person_id);

  return (
    numericId(leadRecord.person_id) ??
    numericId(personRecord.id) ??
    numericId(personIdRecord.id) ??
    numericId(personIdRecord.value) ??
    numericId(leadRecord.person)
  );
}

function shouldImportPipedriveMailMessageForLead(
  email: PipedriveMailMessage,
  externalLeadId: string,
) {
  const matchedLeadId = pipedriveLeadIdFromMailMessage(email);

  if (matchedLeadId) return matchedLeadId === externalLeadId;

  return !pipedriveDealIdFromMailMessage(email);
}

function pipedriveMailMessageExternalId(email: PipedriveMailMessage) {
  const emailRecord = objectValue(email);
  const emailDataRecord = pipedriveMailMessageDataRecord(email);
  const mailMessageIdRecord = objectValue(
    emailRecord.mail_message_id ?? emailDataRecord.mail_message_id,
  );
  const messageIdRecord = objectValue(
    emailRecord.message_id ?? emailDataRecord.message_id,
  );

  return firstExternalId(
    email.id,
    emailRecord.id,
    emailDataRecord.id,
    emailRecord.mail_message_id,
    emailDataRecord.mail_message_id,
    mailMessageIdRecord.id,
    mailMessageIdRecord.value,
    emailRecord.mailMessageId,
    emailDataRecord.mailMessageId,
    emailRecord.mail_id,
    emailDataRecord.mail_id,
    emailRecord.mailId,
    emailDataRecord.mailId,
    emailRecord.message_id,
    emailDataRecord.message_id,
    messageIdRecord.id,
    messageIdRecord.value,
    emailRecord.messageId,
    emailDataRecord.messageId,
  );
}

function pipedriveMailMessageDataRecord(email: PipedriveMailMessage) {
  return objectValue(objectValue(email).data);
}

function pipedriveMailMessageHasBody(email: PipedriveMailMessage) {
  const emailRecord = objectValue(email);
  const emailDataRecord = pipedriveMailMessageDataRecord(email);

  return Boolean(
    cleanText(email.body_plain) ??
      cleanText(emailRecord.body_plain) ??
      cleanText(emailDataRecord.body_plain) ??
      cleanText(emailRecord.body_text) ??
      cleanText(emailDataRecord.body_text) ??
      cleanText(emailRecord.text) ??
      cleanText(emailDataRecord.text) ??
      cleanText(email.body) ??
      cleanText(emailRecord.body) ??
      cleanText(emailDataRecord.body) ??
      cleanText(emailRecord.content) ??
      cleanText(emailDataRecord.content),
  );
}

function pipedriveLeadIdFromMailMessage(email: PipedriveMailMessage) {
  const emailRecord = objectValue(email);
  const emailDataRecord = pipedriveMailMessageDataRecord(email);
  const leadRecord = objectValue(emailRecord.lead ?? emailDataRecord.lead);
  const leadIdRecord = objectValue(
    emailRecord.lead_id ?? emailDataRecord.lead_id,
  );

  return firstExternalId(
    email.lead_id,
    emailRecord.lead_id,
    emailDataRecord.lead_id,
    leadRecord.id,
    leadIdRecord.id,
    leadIdRecord.value,
  );
}

function pipedriveLeadIdFromMailThread(thread: PipedriveMailThread) {
  const threadRecord = objectValue(thread);
  const leadRecord = objectValue(threadRecord.lead);
  const leadIdRecord = objectValue(threadRecord.lead_id);

  return (
    externalId(threadRecord.lead_id) ??
    externalId(leadRecord.id) ??
    externalId(leadIdRecord.id) ??
    externalId(leadIdRecord.value)
  );
}

function pipedriveDealIdFromMailMessage(email: PipedriveMailMessage) {
  const emailRecord = objectValue(email);
  const emailDataRecord = pipedriveMailMessageDataRecord(email);
  const dealRecord = objectValue(emailRecord.deal ?? emailDataRecord.deal);
  const dealIdRecord = objectValue(
    emailRecord.deal_id ?? emailDataRecord.deal_id,
  );

  return firstExternalId(
    email.deal_id,
    emailRecord.deal_id,
    emailDataRecord.deal_id,
    dealRecord.id,
    dealIdRecord.id,
    dealIdRecord.value,
  );
}

function pipedriveDealIdFromMailThread(thread: PipedriveMailThread) {
  const threadRecord = objectValue(thread);
  const dealRecord = objectValue(threadRecord.deal);
  const dealIdRecord = objectValue(threadRecord.deal_id);

  return (
    externalId(threadRecord.deal_id) ??
    externalId(dealRecord.id) ??
    externalId(dealIdRecord.id) ??
    externalId(dealIdRecord.value)
  );
}

function pipedriveMailThreadId(thread: PipedriveMailThread) {
  const threadRecord = objectValue(thread);

  return (
    numericId(thread.id) ??
    numericId(threadRecord.mail_thread_id) ??
    numericId(threadRecord.thread_id)
  );
}

function contactEmailValues(
  contact:
    | {
        additionalEmails: Array<{ email: string }>;
        email: string | null;
      }
    | null,
) {
  return [
    contact?.email,
    ...(contact?.additionalEmails.map((item) => item.email) ?? []),
  ]
    .map((value) => cleanText(value)?.toLowerCase())
    .filter((value): value is string => Boolean(value));
}

function firstEmailAddress(value: unknown) {
  return emailAddressCandidates(value)[0] ?? null;
}

function firstEmailName(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const name = firstEmailName(item);
      if (name) return name;
    }

    return null;
  }

  const record = objectValue(value);
  return cleanText(record.name ?? record.label ?? record.display_name);
}

function emailAddressCandidates(value: unknown): string[] {
  if (value === null || value === undefined) return [];

  if (Array.isArray(value)) {
    return value.flatMap(emailAddressCandidates);
  }

  if (typeof value === "string") {
    const matches = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);

    return matches
      ? matches.map((email) => email.trim().toLowerCase()).filter(Boolean)
      : [];
  }

  const record = objectValue(value);
  if (!Object.keys(record).length) return [];

  const directValues = [
    record.email,
    record.address,
    record.mail,
    record.value,
    record.raw,
  ];

  return [
    ...directValues.flatMap(emailAddressCandidates),
    ...emailAddressCandidates(record.data),
  ];
}

function deduplicateLeadFileBatchItems(items: PipedriveLeadFileBatchSyncItem[]) {
  const seen = new Set<string>();
  const uniqueItems: PipedriveLeadFileBatchSyncItem[] = [];

  for (const item of items) {
    const externalLeadId = item.externalLeadId.trim();
    const opportunityId = item.opportunityId.trim();
    const key = `${opportunityId}:${externalLeadId}`;

    if (!externalLeadId || !opportunityId || seen.has(key)) continue;

    seen.add(key);
    uniqueItems.push({ externalLeadId, opportunityId });
  }

  return uniqueItems;
}

function httpsUrl(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;

  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function nonNegativeInteger(value: unknown) {
  const number = numberValue(value);
  if (number === null || number < 0) return null;

  return Math.trunc(number);
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

function latestLeadNoteListParams(params: PipedriveListNotesParams = {}) {
  const noteParams: PipedriveListNotesParams = {
    limit: params.limit ?? 50,
    sort: params.sort ?? "update_time DESC",
  };

  if (params.leadId !== undefined) noteParams.leadId = params.leadId;
  if (params.start !== undefined) noteParams.start = params.start;
  if (params.updatedSince !== undefined) {
    noteParams.updatedSince = params.updatedSince;
  }
  if (params.updatedUntil !== undefined) {
    noteParams.updatedUntil = params.updatedUntil;
  }

  return noteParams;
}

function emptyPipedriveDealPage(): PipedriveListResult<PipedriveDeal> {
  return {
    data: [],
    pagination: {
      limit: null,
      moreItemsInCollection: false,
      nextCursor: null,
      nextStart: null,
      start: null,
    },
    relatedObjects: null,
  };
}

function pipedriveDealImportsDisabled() {
  return true;
}

function latestPersonListParams(params: PipedriveListPersonsParams = {}) {
  const personParams: PipedriveListPersonsParams = {
    limit: params.limit ?? 50,
    sortBy: params.sortBy ?? "update_time",
    sortDirection: params.sortDirection ?? "desc",
  };

  if (params.cursor) personParams.cursor = params.cursor;
  if (params.filterId !== undefined) personParams.filterId = params.filterId;
  if (params.ids !== undefined) personParams.ids = params.ids;
  if (params.organizationId !== undefined) {
    personParams.organizationId = params.organizationId;
  }
  if (params.ownerId !== undefined) personParams.ownerId = params.ownerId;
  if (params.updatedSince !== undefined) {
    personParams.updatedSince = params.updatedSince;
  }
  if (params.updatedUntil !== undefined) {
    personParams.updatedUntil = params.updatedUntil;
  }

  return personParams;
}

function boundedFullPullMaxPages(
  value: number | null | undefined,
  defaultValue = defaultPipedriveFullPullMaxPages,
  maxValue = 10,
) {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? Math.min(value, maxValue)
    : defaultValue;
}

function boundedOptionalStart(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : null;
}

function isLastPipedriveLeadEmailThreadFolder(
  folder: PipedriveLeadEmailThreadFolder,
) {
  return (
    pipedriveLeadEmailThreadFolders.indexOf(folder) ===
    pipedriveLeadEmailThreadFolders.length - 1
  );
}

function nextPipedriveLeadEmailThreadFolder(
  folder: PipedriveLeadEmailThreadFolder,
): PipedriveLeadEmailThreadFolder {
  const currentIndex = pipedriveLeadEmailThreadFolders.indexOf(folder);
  const nextIndex =
    currentIndex >= 0
      ? (currentIndex + 1) % pipedriveLeadEmailThreadFolders.length
      : 0;

  return pipedriveLeadEmailThreadFolders[nextIndex];
}

function pipedriveLeadEmailThreadFolderValue(
  value: string | null | undefined,
): PipedriveLeadEmailThreadFolder {
  return pipedriveLeadEmailThreadFolders.includes(
    value as PipedriveLeadEmailThreadFolder,
  )
    ? (value as PipedriveLeadEmailThreadFolder)
    : "inbox";
}

function previewFieldsFromMapping(
  mapping: PipedriveLeadImportMapping,
  crmMatches: PreviewCrmMatches,
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
    matchedCompanyId: crmMatches.company?.id ?? null,
    matchedCompanyName: crmMatches.company?.name ?? null,
    matchedContactId: crmMatches.contact?.id ?? null,
    matchedContactName: crmMatches.contact?.name ?? null,
    title: mapping.opportunity.title,
    valueCents: mapping.opportunity.valueCents,
  };
}

async function previewCrmMatches(
  mapping: PipedriveLeadImportMapping,
): Promise<PreviewCrmMatches> {
  const [company, contact] = await Promise.all([
    previewMatchedCompany(mapping),
    previewMatchedContact(mapping),
  ]);

  return { company, contact };
}

async function previewMatchedCompany(
  mapping: PipedriveLeadImportMapping,
): Promise<PreviewCrmMatch | null> {
  if (!mapping.company) return null;

  const externalOrganizationId = mapping.externalIds.organization;

  if (externalOrganizationId) {
    const linkedCompany = await prisma.externalRecordLink.findUnique({
      where: {
        provider_externalType_externalId: {
          externalId: externalOrganizationId,
          externalType: pipedriveExternalTypes.organization,
          provider: pipedriveProvider,
        },
      },
      select: { internalId: true, internalType: true },
    });

    if (linkedCompany?.internalType === pipedriveInternalTypes.company) {
      const company = await prisma.company.findUnique({
        where: { id: linkedCompany.internalId },
        select: { id: true, name: true },
      });

      if (company) return { id: company.id, name: company.name };
    }
  }

  const existingCompany = await prisma.company.findFirst({
    where: {
      name: { equals: mapping.company.name, mode: "insensitive" },
    },
    select: { id: true, name: true },
  });

  return existingCompany
    ? { id: existingCompany.id, name: existingCompany.name }
    : null;
}

async function previewMatchedContact(
  mapping: PipedriveLeadImportMapping,
): Promise<PreviewCrmMatch | null> {
  if (!mapping.contact) return null;

  const externalPersonId = mapping.externalIds.person;

  if (externalPersonId) {
    const linkedContact = await prisma.externalRecordLink.findUnique({
      where: {
        provider_externalType_externalId: {
          externalId: externalPersonId,
          externalType: pipedriveExternalTypes.person,
          provider: pipedriveProvider,
        },
      },
      select: { internalId: true, internalType: true },
    });

    if (linkedContact?.internalType === pipedriveInternalTypes.contact) {
      const contact = await prisma.contact.findUnique({
        where: { id: linkedContact.internalId },
        select: { email: true, firstName: true, id: true, lastName: true },
      });

      if (contact) {
        return { id: contact.id, name: previewContactName(contact) };
      }
    }
  }

  const matches = contactIdentityMatches(mapping.contact);

  if (!matches.length) return null;

  const existingContact = await prisma.contact.findFirst({
    where: { OR: matches },
    select: { email: true, firstName: true, id: true, lastName: true },
  });

  return existingContact
    ? { id: existingContact.id, name: previewContactName(existingContact) }
    : null;
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
    await syncExistingPipedriveContactDetails(tx, {
      company,
      contactId: existingLinkedContact.id,
      mapping,
    });
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
    await syncExistingPipedriveContactDetails(tx, {
      company,
      contactId: existingContact.id,
      mapping,
    });
  } else {
    await createMissingPipedriveContactMethods(tx, {
      contact: mapping.contact,
      contactId: contact.id,
      primaryEmail: mapping.contact.email,
      primaryPhone: mapping.contact.phone,
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

async function syncExistingPipedriveContactDetails(
  tx: Prisma.TransactionClient,
  {
    company,
    contactId,
    mapping,
  }: {
    company: ResolvedCompany;
    contactId: string;
    mapping: PipedriveLeadImportMapping;
  },
) {
  if (!mapping.contact) return;

  const existingContact = await tx.contact.findUnique({
    where: { id: contactId },
    select: {
      companyId: true,
      companyName: true,
      email: true,
      leadSource: true,
      phone: true,
      phoneNormalized: true,
      role: true,
    },
  });

  if (!existingContact) return;

  const primaryEmail = existingContact.email ?? mapping.contact.email;
  const primaryPhone = existingContact.phone ?? mapping.contact.phone;
  const primaryPhoneNormalized =
    normalizedContactPhone(primaryPhone) ?? mapping.contact.phoneNormalized;

  await tx.contact.update({
    where: { id: contactId },
    data: {
      companyId: existingContact.companyId ?? company.id,
      companyName:
        existingContact.companyName ??
        company.name ??
        mapping.contact.companyName,
      email: primaryEmail,
      leadSource: existingContact.leadSource ?? mapping.contact.leadSource,
      phone: primaryPhone,
      phoneNormalized: existingContact.phoneNormalized ?? primaryPhoneNormalized,
      role: existingContact.role ?? mapping.contact.role,
    },
    select: { id: true },
  });

  await createMissingPipedriveContactMethods(tx, {
    contact: mapping.contact,
    contactId,
    primaryEmail,
    primaryPhone,
  });
}

async function createMissingPipedriveContactMethods(
  tx: Prisma.TransactionClient,
  {
    contact,
    contactId,
    primaryEmail,
    primaryPhone,
  }: {
    contact: NonNullable<PipedriveLeadImportMapping["contact"]>;
    contactId: string;
    primaryEmail: string | null;
    primaryPhone: string | null;
  },
) {
  const additionalEmails = normalizeContactEmailMethods(
    contact.emailMethods,
    primaryEmail,
  );
  const additionalPhones = normalizeContactPhoneMethods(
    contact.phoneMethods,
    primaryPhone,
  );

  await Promise.all([
    additionalEmails.length
      ? tx.contactEmailAddress.createMany({
          data: additionalEmails.map((method) => ({
            contactId,
            email: method.email,
            label: method.label,
          })),
          skipDuplicates: true,
        })
      : Promise.resolve(),
    additionalPhones.length
      ? tx.contactPhoneNumber.createMany({
          data: additionalPhones.map((method) => ({
            contactId,
            label: method.label,
            phone: method.phone,
            phoneNormalized: method.phoneNormalized,
          })),
          skipDuplicates: true,
        })
      : Promise.resolve(),
  ]);
}

async function findExistingContact(
  tx: Prisma.TransactionClient,
  contact: NonNullable<PipedriveLeadImportMapping["contact"]>,
) {
  const matches = contactIdentityMatches(contact);

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

function contactIdentityMatches(
  contact: NonNullable<PipedriveLeadImportMapping["contact"]>,
) {
  const matches: Prisma.ContactWhereInput[] = [];
  const emails = contact.emailMethods.length
    ? contact.emailMethods.map((method) => method.email)
    : contact.email
      ? [contact.email]
      : [];

  for (const email of emails) {
    matches.push(
      { email: { equals: email, mode: "insensitive" } },
      {
        additionalEmails: {
          some: { email: { equals: email, mode: "insensitive" } },
        },
      },
    );
  }

  const phoneNormalizedValues = contact.phoneMethods.length
    ? contact.phoneMethods
        .map((method) => method.phoneNormalized)
        .filter((value): value is string => Boolean(value))
    : contact.phoneNormalized
      ? [contact.phoneNormalized]
      : [];

  for (const phoneNormalized of phoneNormalizedValues) {
    matches.push(
      { phoneNormalized },
      {
        additionalPhones: {
          some: { phoneNormalized },
        },
      },
    );
  }

  return matches;
}

function previewContactName({
  email,
  firstName,
  id,
  lastName,
}: {
  email: string | null;
  firstName: string | null;
  id: string;
  lastName: string | null;
}) {
  return (
    [cleanText(firstName), cleanText(lastName)].filter(Boolean).join(" ") ||
    cleanText(email) ||
    id
  );
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

function skippedDealResult({
  externalDealId = null,
  title = null,
  warning,
}: {
  externalDealId?: string | null;
  title?: string | null;
  warning: string;
}): PipedriveDealImportResult {
  return {
    companyId: null,
    contactId: null,
    created: { company: false, contact: false, opportunity: false },
    externalDealId,
    opportunityId: null,
    status: "skipped",
    title,
    warnings: [warning],
  };
}

function skippedPersonResult({
  externalPersonId = null,
  name = null,
  warning,
}: {
  externalPersonId?: string | null;
  name?: string | null;
  warning: string;
}): PipedrivePersonImportResult {
  return {
    companyId: null,
    contactId: null,
    created: { company: false, contact: false },
    externalPersonId,
    name,
    status: "skipped",
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
    matchedCompanyId: null,
    matchedCompanyName: null,
    matchedContactId: null,
    matchedContactName: null,
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

function normalizedSelectedDealIds(dealIds: Array<number | string>) {
  const selectedDealIds = new Set<number>();

  for (const dealId of dealIds) {
    const numeric = numericId(dealId);
    if (numeric) selectedDealIds.add(numeric);
    if (selectedDealIds.size >= 50) break;
  }

  return [...selectedDealIds];
}

function normalizedSelectedPersonIds(personIds: Array<number | string>) {
  const selectedPersonIds = new Set<number>();

  for (const personId of personIds) {
    const numeric = numericId(personId);
    if (numeric) selectedPersonIds.add(numeric);
    if (selectedPersonIds.size >= 50) break;
  }

  return [...selectedPersonIds];
}

function normalizedSelectedNoteIds(noteIds: Array<number | string>) {
  const selectedNoteIds = new Set<number>();

  for (const noteId of noteIds) {
    const numeric = numericId(noteId);
    if (numeric) selectedNoteIds.add(numeric);
    if (selectedNoteIds.size >= 50) break;
  }

  return [...selectedNoteIds];
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
    valueCents: amount !== null && amount >= 0 ? Math.round(amount * 100) : 0,
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
  const recordLabel = externalIds.deal
    ? `deal ${externalIds.deal}`
    : `lead ${externalIds.lead ?? "unknown"}`;

  return [
    `Imported from Pipedrive ${recordLabel}.`,
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

  const emailName = email
    ?.split("@")[0]
    ?.replace(/[._-]+/g, " ")
    .trim();
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

function pipedriveEmailContactMethods(...values: unknown[]) {
  const candidates: Array<
    ContactEmailMethod & { order: number; primary: boolean }
  > = [];

  for (const value of values) {
    appendPipedriveEmailMethods(candidates, value);
  }

  candidates.sort(contactMethodSort);

  return normalizeContactEmailMethods(candidates, null);
}

function pipedrivePhoneContactMethods(...values: unknown[]) {
  const candidates: Array<
    ContactPhoneMethod & { order: number; primary: boolean }
  > = [];

  for (const value of values) {
    appendPipedrivePhoneMethods(candidates, value);
  }

  candidates.sort(contactMethodSort);

  return normalizeContactPhoneMethods(candidates, null);
}

function appendPipedriveEmailMethods(
  candidates: Array<ContactEmailMethod & { order: number; primary: boolean }>,
  value: unknown,
) {
  if (Array.isArray(value)) {
    for (const item of value) {
      appendPipedriveEmailMethods(candidates, item);
    }
    return;
  }

  const record = objectValue(value);
  const rawValue = Object.keys(record).length
    ? record.value ?? record.email
    : value;
  const email = emailAddressCandidates(rawValue)[0] ?? null;

  if (!email) return;

  candidates.push({
    email,
    label: pipedriveContactMethodLabel(record, "email"),
    order: candidates.length,
    primary: record.primary === true,
  });
}

function appendPipedrivePhoneMethods(
  candidates: Array<ContactPhoneMethod & { order: number; primary: boolean }>,
  value: unknown,
) {
  if (Array.isArray(value)) {
    for (const item of value) {
      appendPipedrivePhoneMethods(candidates, item);
    }
    return;
  }

  const record = objectValue(value);
  const rawValue = Object.keys(record).length
    ? record.value ?? record.phone
    : value;
  const phone = cleanText(rawValue);

  if (!phone) return;

  candidates.push({
    label: pipedriveContactMethodLabel(record, "phone"),
    order: candidates.length,
    phone,
    phoneNormalized: normalizedContactPhone(phone),
    primary: record.primary === true,
  });
}

function contactMethodSort(
  left: { order: number; primary: boolean },
  right: { order: number; primary: boolean },
) {
  if (left.primary !== right.primary) return left.primary ? -1 : 1;
  return left.order - right.order;
}

function pipedriveContactMethodLabel(
  record: Record<string, unknown>,
  kind: "email" | "phone",
) {
  const rawLabel = cleanText(record.label ?? record.type ?? record.name);
  const lowerLabel = rawLabel?.toLowerCase();

  if (kind === "email") {
    if (lowerLabel === "work" || lowerLabel === "business") return "Work";
    if (lowerLabel === "home" || lowerLabel === "personal") return "Personal";
    if (lowerLabel === "accounts" || lowerLabel === "billing") {
      return "Accounts";
    }
  }

  if (kind === "phone") {
    if (lowerLabel === "mobile" || lowerLabel === "cell") return "Mobile";
    if (lowerLabel === "work" || lowerLabel === "business") return "Work";
    if (lowerLabel === "home") return "Home";
  }

  return rawLabel ?? "Other";
}

function parsePipedriveDate(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;

  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00.000Z` : text,
  );

  return Number.isNaN(date.getTime()) ? null : date;
}

function firstExternalId(...values: unknown[]) {
  for (const value of values) {
    const id = externalId(value) ?? externalId(objectValue(value).value);
    if (id) return id;
  }

  return null;
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

function jsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : (value as Prisma.InputJsonValue);
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
