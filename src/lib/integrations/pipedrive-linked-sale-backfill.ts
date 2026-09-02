import "server-only";

import { BackgroundJobRunStatus, type Prisma } from "@prisma/client";
import {
  getPipedriveReadOnlyClient,
  pipedriveProvider,
} from "@/lib/integrations/pipedrive";
import {
  syncPipedriveLeadEmailsForOpportunity,
  syncPipedriveLeadFilesForOpportunityBatch,
  syncPipedriveLeadNotesForOpportunity,
} from "@/lib/integrations/pipedrive-import";
import { ensurePipedriveIntegrationConnection } from "@/lib/integrations/pipedrive-lead-sync";
import {
  backgroundJobStaleCutoff,
  completeBackgroundJobRun,
  failBackgroundJobRun,
  isBackgroundJobSchemaPending,
  startBackgroundJobRun,
} from "@/lib/maintenance/background-jobs";
import { prisma } from "@/lib/prisma";

const pipedriveLinkedSaleBackfillJobName =
  "pipedrive.linked_sale_backfill";
const pipedriveLinkedSaleBackfillPreviewSyncType =
  "linked-sale-backfill-preview";
const pipedriveLinkedSaleBackfillSyncType = "linked-sale-backfill";
const pipedriveLeadExternalType = "lead";
const pipedriveFileExternalType = "file";
const crmSalesOpportunityInternalType = "salesOpportunity";
const pipedriveMailExternalIdPrefix = "pipedrive:mail:";
const pipedriveNoteExternalIdPrefix = "pipedrive:note:";

export type PipedriveLinkedSaleBackfillMode = "import" | "preview";

export type PipedriveLinkedSaleBackfillStatus =
  | "ERROR"
  | "SUCCESS"
  | "WARNING";

export type PipedriveLinkedSaleBackfillRow = {
  emailCreated: number;
  emailRead: number;
  emailSkipped: number;
  emailUpdated: number;
  existingPipedriveFiles: number | null;
  existingPipedriveEmails: number | null;
  existingPipedriveNotes: number | null;
  externalLeadId: string | null;
  fileCreated: number;
  fileMatched: number;
  fileSkipped: number;
  fileUpdated: number;
  linkId: string | null;
  noteCreated: number;
  noteRead: number;
  noteSkipped: number;
  noteUpdated: number;
  opportunityId: string | null;
  status: "error" | "missing-sale" | "not-configured" | "preview" | "synced";
  title: string | null;
  warningCount: number;
  warnings: string[];
};

export type PipedriveLinkedSaleBackfillResult = {
  batchLimit: number;
  connectionId: string;
  cursor: string | null;
  emailCreated: number;
  emailRead: number;
  emailSkipped: number;
  emailUpdated: number;
  fileMaxPages: number;
  fileCreated: number;
  fileMatched: number;
  fileRead: number;
  fileSkipped: number;
  fileUpdated: number;
  linkedSales: number;
  message: string;
  metadata: Prisma.InputJsonObject;
  mode: PipedriveLinkedSaleBackfillMode | "already-running" | "not-configured";
  moreAvailable: boolean;
  nextCursor: string | null;
  noteCreated: number;
  noteRead: number;
  noteSkipped: number;
  noteUpdated: number;
  processed: number;
  recordsRead: number;
  recordsWritten: number;
  rows: PipedriveLinkedSaleBackfillRow[];
  skippedMissingSale: number;
  status: PipedriveLinkedSaleBackfillStatus;
  unlinkedSales: number;
  warningCount: number;
};

type PipedriveLinkedSaleBackfillOptions = {
  actorId?: string | null;
  cursor?: string | null;
  fileMaxPages?: number | null;
  limit?: number | null;
  mode?: PipedriveLinkedSaleBackfillMode;
  recordBackgroundJob?: boolean;
  trigger?: string;
};

type PipedriveLinkedSaleBackfillContinuationOptions = {
  actorId?: string | null;
  fileMaxPages?: number | null;
  limit?: number | null;
  recordBackgroundJob?: boolean;
  trigger?: string;
};

type LinkedSaleBatchItem = {
  externalLeadId: string;
  linkId: string;
  opportunityId: string;
  title: string | null;
};

type LinkedSaleBatch = {
  items: LinkedSaleBatchItem[];
  linkedSales: number;
  moreAvailable: boolean;
  nextCursor: string | null;
  skippedMissingSale: number;
  unlinkedSales: number;
  rows: PipedriveLinkedSaleBackfillRow[];
};

type ActivePipedriveLinkedSaleBackfillRun = {
  id: string;
  startedAt: Date;
  trigger: string;
};

export async function runPipedriveLinkedSaleBackfill({
  actorId = null,
  cursor = null,
  fileMaxPages = 10,
  limit = 10,
  mode = "preview",
  recordBackgroundJob = true,
  trigger = "manual",
}: PipedriveLinkedSaleBackfillOptions = {}): Promise<PipedriveLinkedSaleBackfillResult> {
  const normalizedMode = mode === "import" ? "import" : "preview";
  const normalizedTrigger = syncTrigger(trigger);
  const normalizedCursor = cursorValue(cursor);
  const batchLimit = boundedBackfillLimit(limit);
  const normalizedFileMaxPages = boundedFileMaxPages(fileMaxPages);
  const connection = await ensurePipedriveIntegrationConnection();
  const jobRun = recordBackgroundJob
    ? await startBackgroundJobRun({
        actorId,
        dryRun: normalizedMode === "preview",
        jobName: pipedriveLinkedSaleBackfillJobName,
        jobType: "integration-sync",
        metadata: {
          cursor: normalizedCursor,
          mode: normalizedMode,
          provider: pipedriveProvider,
          pullOnly: true,
        },
        trigger: normalizedTrigger,
      })
    : null;

  try {
    const activeRun = await currentPipedriveLinkedSaleBackfillRun(jobRun);

    if (activeRun) {
      const result = await writeAlreadyRunningBackfill({
        activeRun,
        actorId,
        batchLimit,
        connectionId: connection.id,
        cursor: normalizedCursor,
        fileMaxPages: normalizedFileMaxPages,
        mode: normalizedMode,
        trigger: normalizedTrigger,
      });

      await completeBackgroundJobRun(jobRun, {
        message: result.message,
        metadata: {
          activeRunId: activeRun.id,
          mode: normalizedMode,
          provider: pipedriveProvider,
          pullOnly: true,
          reason: "already-running",
          trigger: normalizedTrigger,
        },
        recordsRead: 0,
        recordsWritten: 0,
        status: BackgroundJobRunStatus.WARNING,
        summary: {
          activeRunStartedAt: activeRun.startedAt.toISOString(),
          activeRunTrigger: activeRun.trigger,
          mode: result.mode,
        },
      });

      return result;
    }

    const result =
      normalizedMode === "import"
        ? await writePipedriveLinkedSaleBackfill({
            actorId,
            batchLimit,
            connectionId: connection.id,
            cursor: normalizedCursor,
            fileMaxPages: normalizedFileMaxPages,
            trigger: normalizedTrigger,
          })
        : await writePipedriveLinkedSaleBackfillPreview({
            actorId,
            batchLimit,
            connectionId: connection.id,
            cursor: normalizedCursor,
            fileMaxPages: normalizedFileMaxPages,
            trigger: normalizedTrigger,
          });

    await completeBackgroundJobRun(jobRun, {
      message: result.message,
      metadata: {
        cursor: result.cursor,
        mode: normalizedMode,
        nextCursor: result.nextCursor,
        provider: pipedriveProvider,
        pullOnly: true,
        trigger: normalizedTrigger,
      },
      recordsRead: result.recordsRead,
      recordsWritten: result.recordsWritten,
      status: backgroundStatus(result.status),
      summary: {
        emailCreated: result.emailCreated,
        emailRead: result.emailRead,
        emailUpdated: result.emailUpdated,
        fileCreated: result.fileCreated,
        fileRead: result.fileRead,
        fileUpdated: result.fileUpdated,
        linkedSales: result.linkedSales,
        moreAvailable: result.moreAvailable,
        noteCreated: result.noteCreated,
        noteRead: result.noteRead,
        noteUpdated: result.noteUpdated,
        processed: result.processed,
        skippedMissingSale: result.skippedMissingSale,
        warningCount: result.warningCount,
      },
    });

    return result;
  } catch (error) {
    await failBackgroundJobRun(jobRun, {
      error,
      message:
        "Pipedrive linked-sale backfill failed before sync history could be written.",
      metadata: {
        cursor: normalizedCursor,
        mode: normalizedMode,
        provider: pipedriveProvider,
        pullOnly: true,
        trigger: normalizedTrigger,
      },
    });

    throw error;
  }
}

export async function runPipedriveLinkedSaleBackfillContinuation({
  actorId = null,
  fileMaxPages = 10,
  limit = 10,
  recordBackgroundJob = true,
  trigger = "scheduled",
}: PipedriveLinkedSaleBackfillContinuationOptions = {}): Promise<PipedriveLinkedSaleBackfillResult> {
  const cursor = await readLatestBackfillNextCursor();

  return runPipedriveLinkedSaleBackfill({
    actorId,
    cursor,
    fileMaxPages,
    limit,
    mode: "import",
    recordBackgroundJob,
    trigger,
  });
}

export async function readPipedriveLinkedSaleBackfillContinuationState() {
  const nextCursor = await readLatestBackfillNextCursor();

  return {
    hasContinuationCursor: Boolean(nextCursor),
    nextCursor: nextCursor ? "present" : null,
  };
}

async function writePipedriveLinkedSaleBackfillPreview({
  actorId,
  batchLimit,
  connectionId,
  cursor,
  fileMaxPages,
  trigger,
}: {
  actorId: string | null;
  batchLimit: number;
  connectionId: string;
  cursor: string | null;
  fileMaxPages: number;
  trigger: string;
}): Promise<PipedriveLinkedSaleBackfillResult> {
  const startedAt = new Date();
  const batch = await readLinkedSaleBatch({ cursor, limit: batchLimit });
  const rows = await readPreviewRows(batch);
  const processed = rows.filter((row) => row.status === "preview").length;
  const warningCount = rows.reduce((count, row) => count + row.warningCount, 0);
  const status: PipedriveLinkedSaleBackfillStatus =
    warningCount > 0 || processed === 0 || batch.moreAvailable
      ? "WARNING"
      : "SUCCESS";
  const message =
    processed === 0
      ? "Preview found no Pipedrive-linked CRM sales in this batch. No Pipedrive records were read or written."
      : `Preview checked ${processed} Pipedrive-linked CRM sale${
          processed === 1 ? "" : "s"
        }. No Pipedrive records were read or written.${
          batch.moreAvailable ? " More linked sales are available." : ""
        }`;
  const metadata = linkedSaleBackfillMetadata({
    actorId,
    batchLimit,
    cursor,
    fileMaxPages,
    mode: "preview",
    result: {
      emailCreated: 0,
      emailRead: 0,
      emailSkipped: 0,
      emailUpdated: 0,
      fileCreated: 0,
      fileMatched: 0,
      fileRead: 0,
      fileSkipped: 0,
      fileUpdated: 0,
      linkedSales: batch.linkedSales,
      moreAvailable: batch.moreAvailable,
      nextCursor: batch.nextCursor,
      noteCreated: 0,
      noteRead: 0,
      noteSkipped: 0,
      noteUpdated: 0,
      processed,
      skippedMissingSale: batch.skippedMissingSale,
      unlinkedSales: batch.unlinkedSales,
      warningCount,
    },
    rows,
    trigger,
  });
  const result = {
    batchLimit,
    connectionId,
    cursor,
    emailCreated: 0,
    emailRead: 0,
    emailSkipped: 0,
    emailUpdated: 0,
    fileCreated: 0,
    fileMatched: 0,
    fileMaxPages,
    fileRead: 0,
    fileSkipped: 0,
    fileUpdated: 0,
    linkedSales: batch.linkedSales,
    message,
    metadata,
    mode: "preview" as const,
    moreAvailable: batch.moreAvailable,
    nextCursor: batch.nextCursor,
    noteCreated: 0,
    noteRead: 0,
    noteSkipped: 0,
    noteUpdated: 0,
    processed,
    recordsRead: 0,
    recordsWritten: 0,
    rows,
    skippedMissingSale: batch.skippedMissingSale,
    status,
    unlinkedSales: batch.unlinkedSales,
    warningCount,
  } satisfies PipedriveLinkedSaleBackfillResult;

  await writeSyncLog({
    connectionId,
    finishedAt: new Date(),
    message,
    metadata,
    recordsRead: 0,
    recordsWritten: 0,
    startedAt,
    status,
    syncType: pipedriveLinkedSaleBackfillPreviewSyncType,
  });

  return result;
}

async function readLatestBackfillNextCursor() {
  const latestBackfill = await prisma.marketingIntegrationSyncLog.findFirst({
    orderBy: { startedAt: "desc" },
    select: { metadata: true },
    where: {
      provider: pipedriveProvider,
      syncType: pipedriveLinkedSaleBackfillSyncType,
    },
  });
  const metadata = jsonObject(latestBackfill?.metadata);
  const nextCursor = stringValue(metadata.nextCursor);

  return nextCursor || null;
}

async function writePipedriveLinkedSaleBackfill({
  actorId,
  batchLimit,
  connectionId,
  cursor,
  fileMaxPages,
  trigger,
}: {
  actorId: string | null;
  batchLimit: number;
  connectionId: string;
  cursor: string | null;
  fileMaxPages: number;
  trigger: string;
}): Promise<PipedriveLinkedSaleBackfillResult> {
  const startedAt = new Date();
  const [batch, client] = await Promise.all([
    readLinkedSaleBatch({ cursor, limit: batchLimit }),
    getPipedriveReadOnlyClient(),
  ]);

  if (!client) {
    const rows = batch.rows.map((row) => ({
      ...row,
      status: "not-configured" as const,
      warningCount: row.warningCount + 1,
      warnings: [...row.warnings, "Pipedrive is not configured."],
    }));
    const warningCount = rows.reduce(
      (count, row) => count + row.warningCount,
      0,
    );
    const message =
      "Pipedrive API credentials are missing, so linked-sale backfill could not run.";
    const metadata = linkedSaleBackfillMetadata({
      actorId,
      batchLimit,
      cursor,
      fileMaxPages,
      mode: "import",
      result: {
        emailCreated: 0,
        emailRead: 0,
        emailSkipped: 0,
        emailUpdated: 0,
        fileCreated: 0,
        fileMatched: 0,
        fileRead: 0,
        fileSkipped: 0,
        fileUpdated: 0,
        linkedSales: batch.linkedSales,
        moreAvailable: batch.moreAvailable,
        nextCursor: batch.nextCursor,
        noteCreated: 0,
        noteRead: 0,
        noteSkipped: 0,
        noteUpdated: 0,
        processed: 0,
        skippedMissingSale: batch.skippedMissingSale,
        unlinkedSales: batch.unlinkedSales,
        warningCount,
      },
      rows,
      trigger,
    });
    const result = {
      batchLimit,
      connectionId,
      cursor,
      emailCreated: 0,
      emailRead: 0,
      emailSkipped: 0,
      emailUpdated: 0,
      fileCreated: 0,
      fileMatched: 0,
      fileMaxPages,
      fileRead: 0,
      fileSkipped: 0,
      fileUpdated: 0,
      linkedSales: batch.linkedSales,
      message,
      metadata,
      mode: "not-configured" as const,
      moreAvailable: batch.moreAvailable,
      nextCursor: batch.nextCursor,
      noteCreated: 0,
      noteRead: 0,
      noteSkipped: 0,
      noteUpdated: 0,
      processed: 0,
      recordsRead: 0,
      recordsWritten: 0,
      rows,
      skippedMissingSale: batch.skippedMissingSale,
      status: "WARNING" as const,
      unlinkedSales: batch.unlinkedSales,
      warningCount,
    } satisfies PipedriveLinkedSaleBackfillResult;

    await writeSyncLog({
      connectionId,
      finishedAt: new Date(),
      message,
      metadata,
      recordsRead: 0,
      recordsWritten: 0,
      startedAt,
      status: "WARNING",
      syncType: pipedriveLinkedSaleBackfillSyncType,
    });

    return result;
  }

  const now = new Date();
  const rows = [...batch.rows];
  const rowByOpportunityId = new Map(
    rows
      .filter((row) => row.opportunityId)
      .map((row) => [row.opportunityId as string, row]),
  );
  let noteCreated = 0;
  let noteRead = 0;
  let noteSkipped = 0;
  let noteUpdated = 0;
  let emailCreated = 0;
  let emailRead = 0;
  let emailSkipped = 0;
  let emailUpdated = 0;

  for (const item of batch.items) {
    const row = rowByOpportunityId.get(item.opportunityId);
    if (!row) continue;

    try {
      const noteResult = await syncPipedriveLeadNotesForOpportunity({
        client,
        maxPages: fileMaxPages,
        now,
        opportunityId: item.opportunityId,
      });

      row.noteCreated = noteResult.created;
      row.noteRead = noteResult.notesRead;
      row.noteSkipped = noteResult.skipped;
      row.noteUpdated = noteResult.updated;
      row.warnings.push(...noteResult.warnings);
      noteCreated += noteResult.created;
      noteRead += noteResult.notesRead;
      noteSkipped += noteResult.skipped;
      noteUpdated += noteResult.updated;

      if (noteResult.status === "not_configured") {
        row.status = "not-configured";
      }
    } catch (error) {
      row.status = "error";
      row.warnings.push(errorMessage(error));
    }

    try {
      const emailResult = await syncPipedriveLeadEmailsForOpportunity({
        client,
        maxPages: fileMaxPages,
        now,
        opportunityId: item.opportunityId,
      });

      row.emailCreated = emailResult.created;
      row.emailRead = emailResult.emailsRead;
      row.emailSkipped = emailResult.skipped;
      row.emailUpdated = emailResult.updated;
      row.warnings.push(...emailResult.warnings);
      emailCreated += emailResult.created;
      emailRead += emailResult.emailsRead;
      emailSkipped += emailResult.skipped;
      emailUpdated += emailResult.updated;

      if (
        emailResult.status === "not_configured" ||
        emailResult.status === "not_supported"
      ) {
        row.status = "not-configured";
      }
    } catch (error) {
      row.status = "error";
      row.warnings.push(errorMessage(error));
    }
  }

  const fileResult = await syncPipedriveLeadFilesForOpportunityBatch({
    client,
    items: batch.items.map((item) => ({
      externalLeadId: item.externalLeadId,
      opportunityId: item.opportunityId,
    })),
    maxPages: fileMaxPages,
    now,
  });
  let fileCreated = 0;
  let fileMatched = 0;
  let fileSkipped = 0;
  let fileUpdated = 0;

  for (const result of fileResult.results) {
    const row = rowByOpportunityId.get(result.opportunityId);
    if (!row) continue;

    row.fileCreated = result.created;
    row.fileMatched = result.filesMatched;
    row.fileSkipped = result.skipped;
    row.fileUpdated = result.updated;
    row.warnings.push(...result.warnings);

    if (result.status === "not_configured") {
      row.status = "not-configured";
    } else if (row.status !== "error" && row.status !== "not-configured") {
      row.status = "synced";
    }

    fileCreated += result.created;
    fileMatched += result.filesMatched;
    fileSkipped += result.skipped;
    fileUpdated += result.updated;
  }

  for (const row of rows) {
    row.warningCount = row.warnings.length;
  }

  const processed = rows.filter((row) => row.status === "synced").length;
  const warningCount = rows.reduce((count, row) => count + row.warningCount, 0);
  const recordsRead = noteRead + emailRead + fileResult.filesRead;
  const recordsWritten =
    noteCreated +
    noteUpdated +
    emailCreated +
    emailUpdated +
    fileCreated +
    fileUpdated;
  const status: PipedriveLinkedSaleBackfillStatus =
    warningCount > 0 ||
    processed === 0 ||
    batch.skippedMissingSale > 0 ||
    batch.moreAvailable
      ? "WARNING"
      : "SUCCESS";
  const message =
    processed === 0
      ? "Linked-sale backfill found no CRM sales to update in this batch."
      : `Linked-sale backfill pulled ${noteCreated} new and ${noteUpdated} updated Pipedrive note${
          noteCreated + noteUpdated === 1 ? "" : "s"
        }, ${emailCreated} new and ${emailUpdated} updated email${
          emailCreated + emailUpdated === 1 ? "" : "s"
        }, plus ${fileCreated} new and ${fileUpdated} updated file reference${
          fileCreated + fileUpdated === 1 ? "" : "s"
        }, for ${processed} CRM sale${processed === 1 ? "" : "s"}.${
          batch.moreAvailable ? " More linked sales are available." : ""
        }`;
  const metadata = linkedSaleBackfillMetadata({
    actorId,
    batchLimit,
    cursor,
    fileMaxPages,
    mode: "import",
    result: {
      emailCreated,
      emailRead,
      emailSkipped,
      emailUpdated,
      fileCreated,
      fileMatched,
      fileRead: fileResult.filesRead,
      fileSkipped,
      fileUpdated,
      linkedSales: batch.linkedSales,
      moreAvailable: batch.moreAvailable,
      nextCursor: batch.nextCursor,
      noteCreated,
      noteRead,
      noteSkipped,
      noteUpdated,
      processed,
      skippedMissingSale: batch.skippedMissingSale,
      unlinkedSales: batch.unlinkedSales,
      warningCount,
    },
    rows,
    trigger,
  });
  const result = {
    batchLimit,
    connectionId,
    cursor,
    emailCreated,
    emailRead,
    emailSkipped,
    emailUpdated,
    fileCreated,
    fileMatched,
    fileMaxPages,
    fileRead: fileResult.filesRead,
    fileSkipped,
    fileUpdated,
    linkedSales: batch.linkedSales,
    message,
    metadata,
    mode: "import" as const,
    moreAvailable: batch.moreAvailable,
    nextCursor: batch.nextCursor,
    noteCreated,
    noteRead,
    noteSkipped,
    noteUpdated,
    processed,
    recordsRead,
    recordsWritten,
    rows,
    skippedMissingSale: batch.skippedMissingSale,
    status,
    unlinkedSales: batch.unlinkedSales,
    warningCount,
  } satisfies PipedriveLinkedSaleBackfillResult;

  await writeSyncLog({
    connectionId,
    finishedAt: new Date(),
    message,
    metadata,
    recordsRead,
    recordsWritten,
    startedAt,
    status,
    syncType: pipedriveLinkedSaleBackfillSyncType,
  });

  return result;
}

async function readLinkedSaleBatch({
  cursor,
  limit,
}: {
  cursor: string | null;
  limit: number;
}): Promise<LinkedSaleBatch> {
  const linkWhere = {
    externalType: pipedriveLeadExternalType,
    internalType: crmSalesOpportunityInternalType,
    provider: pipedriveProvider,
  } satisfies Prisma.ExternalRecordLinkWhereInput;
  const [links, linkedSales, totalSales] = await Promise.all([
    prisma.externalRecordLink.findMany({
      orderBy: { id: "asc" },
      select: {
        externalId: true,
        id: true,
        internalId: true,
      },
      take: limit + 1,
      where: {
        ...linkWhere,
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
    }),
    prisma.externalRecordLink.count({ where: linkWhere }),
    prisma.salesOpportunity.count(),
  ]);
  const pageLinks = links.slice(0, limit);
  const moreAvailable = links.length > limit;
  const nextCursor =
    moreAvailable && pageLinks.length
      ? pageLinks[pageLinks.length - 1]?.id ?? null
      : null;
  const sales = pageLinks.length
    ? await prisma.salesOpportunity.findMany({
        select: {
          id: true,
          title: true,
        },
        where: { id: { in: pageLinks.map((link) => link.internalId) } },
      })
    : [];
  const salesById = new Map(sales.map((sale) => [sale.id, sale]));
  const rows: PipedriveLinkedSaleBackfillRow[] = [];
  const items: LinkedSaleBatchItem[] = [];
  let skippedMissingSale = 0;

  for (const link of pageLinks) {
    const sale = salesById.get(link.internalId);

    if (!sale) {
      skippedMissingSale += 1;
      rows.push({
        emailCreated: 0,
        emailRead: 0,
        emailSkipped: 0,
        emailUpdated: 0,
        existingPipedriveFiles: null,
        existingPipedriveEmails: null,
        existingPipedriveNotes: null,
        externalLeadId: link.externalId,
        fileCreated: 0,
        fileMatched: 0,
        fileSkipped: 0,
        fileUpdated: 0,
        linkId: link.id,
        noteCreated: 0,
        noteRead: 0,
        noteSkipped: 0,
        noteUpdated: 0,
        opportunityId: link.internalId,
        status: "missing-sale",
        title: null,
        warningCount: 1,
        warnings: ["Linked CRM sale could not be found."],
      });
      continue;
    }

    const row = {
      emailCreated: 0,
      emailRead: 0,
      emailSkipped: 0,
      emailUpdated: 0,
      existingPipedriveFiles: null,
      existingPipedriveEmails: null,
      existingPipedriveNotes: null,
      externalLeadId: link.externalId,
      fileCreated: 0,
      fileMatched: 0,
      fileSkipped: 0,
      fileUpdated: 0,
      linkId: link.id,
      noteCreated: 0,
      noteRead: 0,
      noteSkipped: 0,
      noteUpdated: 0,
      opportunityId: sale.id,
      status: "preview" as const,
      title: sale.title,
      warningCount: 0,
      warnings: [],
    };

    rows.push(row);
    items.push({
      externalLeadId: link.externalId,
      linkId: link.id,
      opportunityId: sale.id,
      title: sale.title,
    });
  }

  return {
    items,
    linkedSales,
    moreAvailable,
    nextCursor,
    rows,
    skippedMissingSale,
    unlinkedSales: Math.max(totalSales - linkedSales, 0),
  };
}

async function readPreviewRows(batch: LinkedSaleBatch) {
  await Promise.all(
    batch.rows.map(async (row) => {
      if (!row.opportunityId || row.status === "missing-sale") return;

      const [existingPipedriveNotes, existingPipedriveFiles] =
        await Promise.all([
          prisma.salesCommunication.count({
            where: {
              externalId: { startsWith: pipedriveNoteExternalIdPrefix },
              opportunityId: row.opportunityId,
            },
          }),
          prisma.externalRecordLink.count({
            where: {
              externalType: pipedriveFileExternalType,
              internalId: row.opportunityId,
              internalType: crmSalesOpportunityInternalType,
              provider: pipedriveProvider,
            },
          }),
        ]);
      const existingPipedriveEmails = await prisma.salesCommunication.count({
        where: {
          externalId: { startsWith: pipedriveMailExternalIdPrefix },
          opportunityId: row.opportunityId,
        },
      });

      row.existingPipedriveEmails = existingPipedriveEmails;
      row.existingPipedriveFiles = existingPipedriveFiles;
      row.existingPipedriveNotes = existingPipedriveNotes;
    }),
  );

  return batch.rows;
}

async function writeAlreadyRunningBackfill({
  activeRun,
  actorId,
  batchLimit,
  connectionId,
  cursor,
  fileMaxPages,
  mode,
  trigger,
}: {
  activeRun: ActivePipedriveLinkedSaleBackfillRun;
  actorId: string | null;
  batchLimit: number;
  connectionId: string;
  cursor: string | null;
  fileMaxPages: number;
  mode: PipedriveLinkedSaleBackfillMode;
  trigger: string;
}): Promise<PipedriveLinkedSaleBackfillResult> {
  const startedAt = new Date();
  const message =
    "Pipedrive linked-sale backfill skipped because another backfill is already running.";
  const metadata = linkedSaleBackfillMetadata({
    actorId,
    batchLimit,
    cursor,
    fileMaxPages,
    mode,
    result: {
      activeRunId: activeRun.id,
      activeRunStartedAt: activeRun.startedAt.toISOString(),
      activeRunTrigger: activeRun.trigger,
      emailCreated: 0,
      emailRead: 0,
      emailSkipped: 0,
      emailUpdated: 0,
      fileCreated: 0,
      fileMatched: 0,
      fileRead: 0,
      fileSkipped: 0,
      fileUpdated: 0,
      linkedSales: 0,
      moreAvailable: false,
      nextCursor: null,
      noteCreated: 0,
      noteRead: 0,
      noteSkipped: 0,
      noteUpdated: 0,
      processed: 0,
      reason: "already-running",
      skippedMissingSale: 0,
      unlinkedSales: 0,
      warningCount: 1,
    },
    rows: [],
    trigger,
  });

  await writeSyncLog({
    connectionId,
    finishedAt: new Date(),
    message,
    metadata,
    recordsRead: 0,
    recordsWritten: 0,
    startedAt,
    status: "WARNING",
    syncType:
      mode === "preview"
        ? pipedriveLinkedSaleBackfillPreviewSyncType
        : pipedriveLinkedSaleBackfillSyncType,
  });

  return {
    batchLimit,
    connectionId,
    cursor,
    emailCreated: 0,
    emailRead: 0,
    emailSkipped: 0,
    emailUpdated: 0,
    fileCreated: 0,
    fileMatched: 0,
    fileMaxPages,
    fileRead: 0,
    fileSkipped: 0,
    fileUpdated: 0,
    linkedSales: 0,
    message,
    metadata,
    mode: "already-running",
    moreAvailable: false,
    nextCursor: null,
    noteCreated: 0,
    noteRead: 0,
    noteSkipped: 0,
    noteUpdated: 0,
    processed: 0,
    recordsRead: 0,
    recordsWritten: 0,
    rows: [],
    skippedMissingSale: 0,
    status: "WARNING",
    unlinkedSales: 0,
    warningCount: 1,
  };
}

async function currentPipedriveLinkedSaleBackfillRun(
  currentRun: { id: string } | null,
): Promise<ActivePipedriveLinkedSaleBackfillRun | null> {
  try {
    return await prisma.backgroundJobRun.findFirst({
      orderBy: [{ startedAt: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        startedAt: true,
        trigger: true,
      },
      where: {
        ...(currentRun ? { id: { not: currentRun.id } } : {}),
        jobName: pipedriveLinkedSaleBackfillJobName,
        startedAt: { gte: backgroundJobStaleCutoff() },
        status: BackgroundJobRunStatus.RUNNING,
      },
    });
  } catch (error) {
    if (isBackgroundJobSchemaPending(error)) return null;
    throw error;
  }
}

async function writeSyncLog({
  connectionId,
  finishedAt,
  message,
  metadata,
  recordsRead,
  recordsWritten,
  startedAt,
  status,
  syncType,
}: {
  connectionId: string;
  finishedAt: Date;
  message: string;
  metadata: Prisma.InputJsonObject;
  recordsRead: number;
  recordsWritten: number;
  startedAt: Date;
  status: PipedriveLinkedSaleBackfillStatus;
  syncType: string;
}) {
  await prisma.marketingIntegrationSyncLog.create({
    data: {
      finishedAt,
      integrationId: connectionId,
      message,
      metadata,
      provider: pipedriveProvider,
      recordsRead,
      recordsWritten,
      startedAt,
      status,
      syncType,
    },
  });
}

function linkedSaleBackfillMetadata({
  actorId,
  batchLimit,
  cursor,
  fileMaxPages,
  mode,
  result,
  rows,
  trigger,
}: {
  actorId: string | null;
  batchLimit: number;
  cursor: string | null;
  fileMaxPages: number;
  mode: string;
  result: Prisma.InputJsonObject;
  rows: PipedriveLinkedSaleBackfillRow[];
  trigger: string;
}): Prisma.InputJsonObject {
  return {
    actorId,
    batchLimit,
    cursor,
    fileMaxPages,
    mode,
    provider: pipedriveProvider,
    pullOnly: true,
    rows: metadataRows(rows),
    trigger,
    ...result,
  };
}

function metadataRows(
  rows: PipedriveLinkedSaleBackfillRow[],
): Prisma.InputJsonArray {
  return rows.slice(0, 50).map((row) => ({
    emailCreated: row.emailCreated,
    emailRead: row.emailRead,
    emailSkipped: row.emailSkipped,
    emailUpdated: row.emailUpdated,
    existingPipedriveFiles: row.existingPipedriveFiles,
    existingPipedriveEmails: row.existingPipedriveEmails,
    existingPipedriveNotes: row.existingPipedriveNotes,
    externalLeadId: row.externalLeadId,
    fileCreated: row.fileCreated,
    fileMatched: row.fileMatched,
    fileSkipped: row.fileSkipped,
    fileUpdated: row.fileUpdated,
    linkId: row.linkId,
    noteCreated: row.noteCreated,
    noteRead: row.noteRead,
    noteSkipped: row.noteSkipped,
    noteUpdated: row.noteUpdated,
    opportunityId: row.opportunityId,
    status: row.status,
    title: truncateText(row.title, 160),
    warningCount: row.warningCount,
    warnings: row.warnings.slice(0, 3).map((warning) => truncateText(warning, 240)),
  }));
}

function boundedBackfillLimit(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 10;

  return Math.min(Math.max(Math.trunc(value), 1), 25);
}

function boundedFileMaxPages(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 10;

  return Math.min(Math.max(Math.trunc(value), 1), 10);
}

function cursorValue(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  return trimmed.slice(0, 120);
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : null;
}

function syncTrigger(trigger: string) {
  const normalized = trigger.trim();

  return normalized || "manual";
}

function backgroundStatus(status: PipedriveLinkedSaleBackfillStatus) {
  switch (status) {
    case "SUCCESS":
      return BackgroundJobRunStatus.SUCCESS;
    case "WARNING":
      return BackgroundJobRunStatus.WARNING;
    case "ERROR":
      return BackgroundJobRunStatus.ERROR;
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Pipedrive backfill failed.";
}

function truncateText(value: string | null, maxLength: number) {
  if (!value) return null;
  if (value.length <= maxLength) return value;

  return `${value.slice(0, Math.max(0, maxLength - 1))}...`;
}
