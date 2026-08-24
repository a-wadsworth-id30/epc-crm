import "server-only";

import { BackgroundJobRunStatus, type Prisma } from "@prisma/client";
import {
  defaultPipedriveApiBaseUrl,
  defaultPipedriveLeadSource,
  getPipedriveReadOnlyClient,
  hasPipedriveEnvironmentConfig,
  pipedriveProvider,
  pipedriveStoredConfigSchema,
} from "@/lib/integrations/pipedrive";
import {
  importPipedriveLeadIds,
  importPipedriveLeadNotePages,
  importPipedriveLeadPages,
  pipedriveLeadNoteImportMetadataRows,
  pipedriveLeadIdFromInput,
  pipedriveLeadImportMetadataRows,
  previewPipedriveLeadPage,
} from "@/lib/integrations/pipedrive-import";
import {
  backgroundJobStaleCutoff,
  completeBackgroundJobRun,
  failBackgroundJobRun,
  isBackgroundJobSchemaPending,
  startBackgroundJobRun,
} from "@/lib/maintenance/background-jobs";
import { prisma } from "@/lib/prisma";

type PipedriveLeadPullStatus = "SUCCESS" | "WARNING" | "ERROR";
const pipedriveLeadImportJobName = "pipedrive.lead_import";

export type PipedriveLeadPullResult = {
  connectionId: string;
  created: number;
  linkedExisting: number;
  message: string;
  metadata: Prisma.InputJsonObject;
  mode:
    | "already_running"
    | "continuation"
    | "direct"
    | "incremental"
    | "initial"
    | "not_configured"
    | "page";
  moreAvailable: boolean;
  noteCreated?: number;
  noteIgnored?: number;
  noteMoreAvailable?: boolean;
  notePagesRead?: number;
  noteRecordsRead?: number;
  noteRecordsWritten?: number;
  noteSkipped?: number;
  noteUpdated?: number;
  pagesRead: number;
  recordsRead: number;
  recordsWritten: number;
  skipped: number;
  status: PipedriveLeadPullStatus;
  warningCount: number;
};

type PipedriveLeadPullOptions = {
  actorId?: string | null;
  recordBackgroundJob?: boolean;
  trigger?: string;
};

type PipedriveLeadPullPreviewOptions = {
  limit?: number | null;
  start?: number | null;
};

type PipedriveApprovedLeadPageImportOptions = {
  actorId?: string | null;
  expectedWouldCreate?: number | null;
  limit?: number | null;
  recordBackgroundJob?: boolean;
  start?: number | null;
  trigger?: string;
};

type PipedriveDirectLeadImportOptions = {
  actorId?: string | null;
  leadInput?: string | null;
  recordBackgroundJob?: boolean;
  trigger?: string;
};

export type PipedriveLeadPullPreviewResult = {
  connected: boolean;
  connectionId: string | null;
  linkedExisting: number;
  message: string;
  moreAvailable: boolean;
  nextStart: number | null;
  pageLimit: number;
  pageStart: number | null;
  provider: typeof pipedriveProvider;
  pullOnly: true;
  recordsRead: number;
  recordsWritten: 0;
  skipped: number;
  status: PipedriveLeadPullStatus;
  warningCount: number;
  withCrmMatch: number;
  wouldCreate: number;
};

export type PipedriveApprovedLeadPageImportResult = PipedriveLeadPullResult & {
  approvedLeadCount: number;
  expectedWouldCreate: number | null;
  pageLimit: number;
  pageStart: number | null;
};

export type PipedriveDirectLeadImportResult = PipedriveLeadPullResult & {
  requestedLeadId: string | null;
};

export async function runPipedriveLeadPull({
  actorId = null,
  recordBackgroundJob = true,
  trigger = "manual",
}: PipedriveLeadPullOptions = {}): Promise<PipedriveLeadPullResult> {
  const normalizedTrigger = syncTrigger(trigger);
  const jobRun = recordBackgroundJob
    ? await startBackgroundJobRun({
        actorId,
        dryRun: false,
        jobName: pipedriveLeadImportJobName,
        jobType: "integration-sync",
        metadata: {
          provider: pipedriveProvider,
          pullOnly: true,
        },
        trigger: normalizedTrigger,
      })
    : null;

  try {
    const activeRun = await currentPipedriveLeadPullRun(jobRun);

    if (activeRun) {
      const result = await skipPipedriveLeadPull({
        actorId,
        activeRun,
        trigger: normalizedTrigger,
      });

      await completeBackgroundJobRun(jobRun, {
        message: result.message,
        metadata: {
          provider: pipedriveProvider,
          pullOnly: true,
          reason: "already-running",
          trigger: normalizedTrigger,
        },
        recordsRead: 0,
        recordsWritten: 0,
        status: BackgroundJobRunStatus.WARNING,
        summary: {
          activeRunId: activeRun.id,
          activeRunStartedAt: activeRun.startedAt.toISOString(),
          activeRunTrigger: activeRun.trigger,
          mode: result.mode,
        },
      });

      return result;
    }

    const result = await writePipedriveLeadPull({
      actorId,
      trigger: normalizedTrigger,
    });

    await completeBackgroundJobRun(jobRun, {
      message: result.message,
      metadata: {
        provider: pipedriveProvider,
        pullOnly: true,
        trigger: normalizedTrigger,
      },
      recordsRead: result.recordsRead,
      recordsWritten: result.recordsWritten,
      status: backgroundStatus(result.status),
      summary: {
        created: result.created,
        linkedExisting: result.linkedExisting,
        mode: result.mode,
        moreAvailable: result.moreAvailable,
        pagesRead: result.pagesRead,
        skipped: result.skipped,
        warningCount: result.warningCount,
      },
    });

    return result;
  } catch (error) {
    await failBackgroundJobRun(jobRun, {
      error,
      message:
        "Pipedrive lead import failed before sync history could be written.",
      metadata: {
        provider: pipedriveProvider,
        pullOnly: true,
        trigger: normalizedTrigger,
      },
    });

    throw error;
  }
}

export async function runPipedriveApprovedLeadPageImport({
  actorId = null,
  expectedWouldCreate = null,
  limit = 10,
  recordBackgroundJob = true,
  start = null,
  trigger = "api-approved-page",
}: PipedriveApprovedLeadPageImportOptions = {}): Promise<PipedriveApprovedLeadPageImportResult> {
  const normalizedTrigger = syncTrigger(trigger);
  const pageLimit = boundedApprovedImportLimit(limit);
  const pageStart = boundedPreviewStart(start);
  const normalizedExpectedWouldCreate =
    typeof expectedWouldCreate === "number" &&
    Number.isFinite(expectedWouldCreate)
      ? Math.trunc(expectedWouldCreate)
      : null;
  const jobRun = recordBackgroundJob
    ? await startBackgroundJobRun({
        actorId,
        dryRun: false,
        jobName: pipedriveLeadImportJobName,
        jobType: "integration-sync",
        metadata: {
          mode: "approved-page",
          provider: pipedriveProvider,
          pullOnly: true,
        },
        trigger: normalizedTrigger,
      })
    : null;

  try {
    const activeRun = await currentPipedriveLeadPullRun(jobRun);

    if (activeRun) {
      const result = await skipPipedriveApprovedLeadPageImport({
        actorId,
        activeRun,
        expectedWouldCreate: normalizedExpectedWouldCreate,
        pageLimit,
        pageStart,
        trigger: normalizedTrigger,
      });

      await completeBackgroundJobRun(jobRun, {
        message: result.message,
        metadata: {
          mode: "approved-page",
          provider: pipedriveProvider,
          pullOnly: true,
          reason: "already-running",
          trigger: normalizedTrigger,
        },
        recordsRead: 0,
        recordsWritten: 0,
        status: BackgroundJobRunStatus.WARNING,
        summary: {
          activeRunId: activeRun.id,
          activeRunStartedAt: activeRun.startedAt.toISOString(),
          activeRunTrigger: activeRun.trigger,
          mode: result.mode,
        },
      });

      return result;
    }

    const result = await writePipedriveApprovedLeadPageImport({
      actorId,
      expectedWouldCreate: normalizedExpectedWouldCreate,
      pageLimit,
      pageStart,
      trigger: normalizedTrigger,
    });

    await completeBackgroundJobRun(jobRun, {
      message: result.message,
      metadata: {
        mode: "approved-page",
        provider: pipedriveProvider,
        pullOnly: true,
        trigger: normalizedTrigger,
      },
      recordsRead: result.recordsRead,
      recordsWritten: result.recordsWritten,
      status: backgroundStatus(result.status),
      summary: {
        approvedLeadCount: result.approvedLeadCount,
        created: result.created,
        expectedWouldCreate: result.expectedWouldCreate,
        linkedExisting: result.linkedExisting,
        pageLimit: result.pageLimit,
        pageStart: result.pageStart,
        skipped: result.skipped,
        warningCount: result.warningCount,
      },
    });

    return result;
  } catch (error) {
    await failBackgroundJobRun(jobRun, {
      error,
      message:
        "Pipedrive approved page import failed before sync history could be written.",
      metadata: {
        mode: "approved-page",
        provider: pipedriveProvider,
        pullOnly: true,
        trigger: normalizedTrigger,
      },
    });

    throw error;
  }
}

export async function runPipedriveDirectLeadImport({
  actorId = null,
  leadInput = null,
  recordBackgroundJob = true,
  trigger = "manual-direct",
}: PipedriveDirectLeadImportOptions = {}): Promise<PipedriveDirectLeadImportResult> {
  const normalizedTrigger = syncTrigger(trigger);
  const requestedLeadId = pipedriveLeadIdFromInput(leadInput);
  const jobRun = recordBackgroundJob
    ? await startBackgroundJobRun({
        actorId,
        dryRun: false,
        jobName: pipedriveLeadImportJobName,
        jobType: "integration-sync",
        metadata: {
          mode: "direct-lead",
          provider: pipedriveProvider,
          pullOnly: true,
          requestedLeadId,
        },
        trigger: normalizedTrigger,
      })
    : null;

  try {
    const activeRun = await currentPipedriveLeadPullRun(jobRun);

    if (activeRun) {
      const result = await skipPipedriveDirectLeadImport({
        activeRun,
        actorId,
        requestedLeadId,
        trigger: normalizedTrigger,
      });

      await completeBackgroundJobRun(jobRun, {
        message: result.message,
        metadata: {
          mode: "direct-lead",
          provider: pipedriveProvider,
          pullOnly: true,
          reason: "already-running",
          requestedLeadId,
          trigger: normalizedTrigger,
        },
        recordsRead: 0,
        recordsWritten: 0,
        status: BackgroundJobRunStatus.WARNING,
        summary: {
          activeRunId: activeRun.id,
          activeRunStartedAt: activeRun.startedAt.toISOString(),
          activeRunTrigger: activeRun.trigger,
          mode: result.mode,
          requestedLeadId,
        },
      });

      return result;
    }

    const result = await writePipedriveDirectLeadImport({
      actorId,
      requestedLeadId,
      trigger: normalizedTrigger,
    });

    await completeBackgroundJobRun(jobRun, {
      message: result.message,
      metadata: {
        mode: "direct-lead",
        provider: pipedriveProvider,
        pullOnly: true,
        requestedLeadId,
        trigger: normalizedTrigger,
      },
      recordsRead: result.recordsRead,
      recordsWritten: result.recordsWritten,
      status: backgroundStatus(result.status),
      summary: {
        created: result.created,
        linkedExisting: result.linkedExisting,
        mode: result.mode,
        requestedLeadId,
        skipped: result.skipped,
        warningCount: result.warningCount,
      },
    });

    return result;
  } catch (error) {
    await failBackgroundJobRun(jobRun, {
      error,
      message:
        "Pipedrive direct lead import failed before sync history could be written.",
      metadata: {
        mode: "direct-lead",
        provider: pipedriveProvider,
        pullOnly: true,
        requestedLeadId,
        trigger: normalizedTrigger,
      },
    });

    throw error;
  }
}

export async function readPipedriveLeadPullReadiness() {
  const [connection, client] = await Promise.all([
    prisma.integrationConnection.findUnique({
      where: { provider: pipedriveProvider },
      select: {
        config: true,
        id: true,
        status: true,
        updatedAt: true,
      },
    }),
    getPipedriveReadOnlyClient(),
  ]);
  const config = pipedriveStoredConfigSchema.safeParse(
    connection?.config ?? {},
  );
  const storedConfig = config.success ? config.data : null;

  return {
    connected: Boolean(client),
    connectionId: connection?.id ?? null,
    hasContinuationCursor:
      typeof storedConfig?.lastFullLeadSyncNextStart === "number" ||
      typeof storedConfig?.lastLeadNoteSyncNextStart === "number",
    lastFullDealSyncAt: null,
    lastFullDealSyncNextCursor: null,
    lastFullLeadSyncAt: storedConfig?.lastFullLeadSyncAt ?? null,
    lastFullLeadSyncNextStart:
      typeof storedConfig?.lastFullLeadSyncNextStart === "number"
        ? storedConfig.lastFullLeadSyncNextStart
        : null,
    lastLeadSyncAt: storedConfig?.lastLeadSyncAt ?? null,
    lastLeadNoteSyncAt: storedConfig?.lastLeadNoteSyncAt ?? null,
    lastLeadNoteSyncNextStart:
      typeof storedConfig?.lastLeadNoteSyncNextStart === "number"
        ? storedConfig.lastLeadNoteSyncNextStart
        : null,
    lastLeadNoteSyncPendingUntil:
      typeof storedConfig?.lastLeadNoteSyncPendingUntil === "string"
        ? storedConfig.lastLeadNoteSyncPendingUntil
        : null,
    provider: pipedriveProvider,
    pullOnly: true,
    status: connection?.status ?? null,
    updatedAt: connection?.updatedAt.toISOString() ?? null,
  };
}

export async function readPipedriveLeadPullPreview({
  limit = 10,
  start = null,
}: PipedriveLeadPullPreviewOptions = {}): Promise<PipedriveLeadPullPreviewResult> {
  const [connection, client] = await Promise.all([
    prisma.integrationConnection.findUnique({
      where: { provider: pipedriveProvider },
      select: {
        id: true,
        status: true,
      },
    }),
    getPipedriveReadOnlyClient(),
  ]);
  const pageLimit = boundedPreviewLimit(limit);
  const pageStart = boundedPreviewStart(start);

  if (!client) {
    return {
      connected: false,
      connectionId: connection?.id ?? null,
      linkedExisting: 0,
      message:
        "Pipedrive API credentials are missing, so the lead preview could not run.",
      moreAvailable: false,
      nextStart: null,
      pageLimit,
      pageStart,
      provider: pipedriveProvider,
      pullOnly: true,
      recordsRead: 0,
      recordsWritten: 0,
      skipped: 0,
      status: "WARNING",
      warningCount: 1,
      withCrmMatch: 0,
      wouldCreate: 0,
    };
  }

  const result = await previewPipedriveLeadPage({
    client,
    params: { limit: pageLimit, start: pageStart },
  });
  const recordsRead = result.status === "ok" ? result.page.data.length : 0;
  const moreAvailable =
    result.status === "ok"
      ? result.page.pagination.moreItemsInCollection
      : false;
  const nextStart =
    result.status === "ok" ? result.page.pagination.nextStart : null;
  const warningCount =
    result.status === "ok"
      ? result.previews.reduce(
          (count, preview) => count + preview.warnings.length,
          0,
        )
      : 1;
  const withCrmMatch =
    result.status === "ok"
      ? result.previews.filter(
          (preview) =>
            preview.matchedCompanyId ||
            preview.matchedContactId ||
            preview.linkedOpportunityId,
        ).length
      : 0;
  const wouldCreate = result.status === "ok" ? result.wouldCreate : 0;
  const status: PipedriveLeadPullStatus =
    warningCount > 0 || result.skipped > 0 ? "WARNING" : "SUCCESS";

  return {
    connected: true,
    connectionId: connection?.id ?? null,
    linkedExisting: result.status === "ok" ? result.linkedExisting : 0,
    message:
      recordsRead === 0
        ? "Preview read no Pipedrive leads and did not write CRM records."
        : `Preview read ${recordsRead} Pipedrive lead${recordsRead === 1 ? "" : "s"} and would create ${wouldCreate} CRM lead${wouldCreate === 1 ? "" : "s"}.`,
    moreAvailable,
    nextStart,
    pageLimit,
    pageStart,
    provider: pipedriveProvider,
    pullOnly: true,
    recordsRead,
    recordsWritten: 0,
    skipped: result.skipped,
    status,
    warningCount,
    withCrmMatch,
    wouldCreate,
  };
}

type ActivePipedriveLeadPullRun = {
  id: string;
  startedAt: Date;
  trigger: string;
};

export async function ensurePipedriveIntegrationConnection() {
  return prisma.integrationConnection.upsert({
    where: { provider: pipedriveProvider },
    update: {},
    create: {
      config: {
        apiBaseUrl: defaultPipedriveApiBaseUrl,
        defaultLeadSource: defaultPipedriveLeadSource,
      },
      description: "Lead inbox import and CRM data synchronisation.",
      name: "Pipedrive",
      provider: pipedriveProvider,
      status: hasPipedriveEnvironmentConfig() ? "CONNECTED" : "NOT_CONNECTED",
    },
    select: { config: true, id: true },
  });
}

async function writePipedriveLeadPull({
  actorId,
  trigger,
}: {
  actorId: string | null;
  trigger: string;
}) {
  const startedAt = new Date();
  const connection = await ensurePipedriveIntegrationConnection();
  const client = await getPipedriveReadOnlyClient();

  if (!client) {
    const finishedAt = new Date();
    const message =
      "Pipedrive API credentials are missing, so lead import could not run.";
    const metadata: Prisma.InputJsonObject = {
      actorId,
      pullOnly: true,
      reason: "missing-credentials",
      trigger,
    };

    await prisma.marketingIntegrationSyncLog.create({
      data: {
        finishedAt,
        integrationId: connection.id,
        message,
        metadata,
        provider: pipedriveProvider,
        recordsRead: 0,
        recordsWritten: 0,
        startedAt,
        status: "WARNING",
        syncType: "lead-import",
      },
    });

    return {
      connectionId: connection.id,
      created: 0,
      linkedExisting: 0,
      message,
      metadata,
      mode: "not_configured",
      moreAvailable: false,
      pagesRead: 0,
      recordsRead: 0,
      recordsWritten: 0,
      skipped: 0,
      status: "WARNING",
      warningCount: 1,
    } satisfies PipedriveLeadPullResult;
  }

  try {
    const start = client.lastFullLeadSyncNextStart;
    const updatedSince = client.lastFullLeadSyncAt;
    const noteStart = client.lastLeadNoteSyncNextStart;
    const noteUpdatedSince = client.lastLeadNoteSyncAt;
    const noteUpdatedUntil =
      client.lastLeadNoteSyncPendingUntil ?? startedAt.toISOString();
    const leadSweepResult =
      start === null && updatedSince
        ? await importPipedriveLeadPages({
            client,
            maxPages: 1,
            params: { limit: 50 },
          })
        : null;
    const result = await importPipedriveLeadPages({
      client,
      params: { limit: 50, start, updatedSince },
    });
    const noteResult = await importPipedriveLeadNotePages({
      client,
      params: {
        limit: 50,
        start: noteStart,
        updatedSince: noteUpdatedSince,
        updatedUntil: noteUpdatedUntil,
      },
    });
    const finishedAt = new Date();
    const leadSweepRecordsRead =
      leadSweepResult?.status === "ok" ? leadSweepResult.recordsRead : 0;
    const leadSweepRecordsWritten =
      leadSweepResult?.status === "ok" ? leadSweepResult.created : 0;
    const leadSweepLinkedExisting =
      leadSweepResult?.status === "ok" ? leadSweepResult.linkedExisting : 0;
    const leadSweepSkipped =
      leadSweepResult?.status === "ok" ? leadSweepResult.skipped : 0;
    const leadCursorRecordsRead =
      result.status === "ok" ? result.recordsRead : 0;
    const leadCursorRecordsWritten =
      result.status === "ok" ? result.created : 0;
    const leadCursorLinkedExisting =
      result.status === "ok" ? result.linkedExisting : 0;
    const leadCursorSkipped = result.skipped;
    const leadRecordsRead = leadSweepRecordsRead + leadCursorRecordsRead;
    const leadRecordsWritten =
      leadSweepRecordsWritten + leadCursorRecordsWritten;
    const leadLinkedExisting =
      leadSweepLinkedExisting + leadCursorLinkedExisting;
    const leadSkipped = leadSweepSkipped + leadCursorSkipped;
    const leadMoreAvailable =
      result.status === "ok" ? result.moreAvailable : false;
    const leadSweepPagesRead =
      leadSweepResult?.status === "ok" ? leadSweepResult.pagesRead : 0;
    const leadCursorPagesRead = result.status === "ok" ? result.pagesRead : 0;
    const leadPagesRead = leadSweepPagesRead + leadCursorPagesRead;
    const noteRecordsRead =
      noteResult.status === "ok" ? noteResult.recordsRead : 0;
    const noteRecordsWritten =
      noteResult.status === "ok" ? noteResult.recordsWritten : 0;
    const noteCreated = noteResult.status === "ok" ? noteResult.created : 0;
    const noteUpdated = noteResult.status === "ok" ? noteResult.updated : 0;
    const noteIgnored = noteResult.status === "ok" ? noteResult.ignored : 0;
    const noteSkipped = noteResult.status === "ok" ? noteResult.skipped : 0;
    const noteMoreAvailable =
      noteResult.status === "ok" ? noteResult.moreAvailable : false;
    const notePagesRead =
      noteResult.status === "ok" ? noteResult.pagesRead : 0;
    const recordsRead = leadRecordsRead + noteRecordsRead;
    const recordsWritten = leadRecordsWritten + noteRecordsWritten;
    const linkedExisting = leadLinkedExisting;
    const skipped = leadSkipped;
    const moreAvailable = leadMoreAvailable || noteMoreAvailable;
    const pagesRead = leadPagesRead + notePagesRead;
    const warningCount =
      (leadSweepResult
        ? leadSweepResult.status === "ok"
          ? leadSweepResult.results.reduce(
              (count, leadResult) => count + leadResult.warnings.length,
              0,
            )
          : 1
        : 0) +
      (result.status === "ok"
        ? result.results.reduce(
            (count, leadResult) => count + leadResult.warnings.length,
            0,
          )
        : 1) +
      (noteResult.status === "ok"
        ? noteResult.results.reduce(
            (count, noteImport) => count + noteImport.warnings.length,
            0,
          )
        : 1);
    const status: PipedriveLeadPullStatus =
      warningCount > 0 || skipped > 0 || recordsRead === 0 || moreAvailable
        ? "WARNING"
        : "SUCCESS";
    const mode =
      start !== null
        ? "continuation"
        : updatedSince
          ? "incremental"
          : "initial";
    const importMode =
      mode === "continuation"
        ? "Continuation pull"
        : mode === "incremental"
          ? leadSweepResult
            ? "Latest sweep and incremental pull"
            : "Incremental pull"
          : "Initial pull";
    const pageSummary = pagesRead > 1 ? ` across ${pagesRead} pages` : "";
    const moreAvailableSummary = moreAvailable
      ? " More Pipedrive pages are available, so a continuation was saved and the relevant full-pull cursor was not advanced."
      : "";
    const noteSummary = noteRecordsRead
      ? ` Lead-note sweep: ${noteCreated} created, ${noteUpdated} updated, ${noteSkipped} skipped and ${noteIgnored} ignored from ${noteRecordsRead} Pipedrive note${noteRecordsRead === 1 ? "" : "s"}.`
      : "";
    const message =
      recordsRead === 0
        ? `${importMode}: no Pipedrive leads or notes were available to import.`
        : `${importMode}: ${leadRecordsWritten} lead${leadRecordsWritten === 1 ? "" : "s"} created, ${leadLinkedExisting} already linked, ${leadSkipped} skipped from ${leadRecordsRead}${pageSummary}.${noteSummary}${moreAvailableSummary}`;
    const importRows = [
      ...(leadSweepResult?.status === "ok"
        ? pipedriveLeadImportMetadataRows(leadSweepResult.results)
        : []),
      ...(result.status === "ok"
        ? pipedriveLeadImportMetadataRows(result.results)
        : []),
    ];
    const noteImportRows =
      noteResult.status === "ok"
        ? pipedriveLeadNoteImportMetadataRows(noteResult.results)
        : [];
    const existingConfig = pipedriveStoredConfigSchema.safeParse(
      connection.config ?? {},
    );
    const metadata: Prisma.InputJsonObject = {
      actorId,
      created: leadRecordsWritten,
      dealImportEnabled: false,
      imports: importRows,
      leadCreated: leadRecordsWritten,
      leadCursorCreated: leadCursorRecordsWritten,
      leadCursorLinkedExisting,
      leadCursorPagesRead,
      leadCursorRecordsRead,
      leadCursorSkipped,
      leadLinkedExisting,
      leadMaxPages: result.status === "ok" ? result.maxPages : null,
      leadMoreAvailable,
      leadNextStart: result.status === "ok" ? result.nextStart : null,
      leadPagesRead,
      leadRecordsRead,
      leadSkipped,
      leadSweepCreated: leadSweepRecordsWritten,
      leadSweepEnabled: Boolean(leadSweepResult),
      leadSweepLinkedExisting,
      leadSweepPagesRead,
      leadSweepRecordsRead,
      leadSweepSkipped,
      linkedExisting,
      mode,
      moreAvailable,
      noteCreated,
      noteIgnored,
      noteImports: noteImportRows,
      noteMaxPages: noteResult.status === "ok" ? noteResult.maxPages : null,
      noteMoreAvailable,
      noteNextStart: noteResult.status === "ok" ? noteResult.nextStart : null,
      notePagesRead,
      noteRecordsRead,
      noteRecordsWritten,
      noteSkipped,
      noteStart,
      noteUpdated,
      noteUpdatedSince,
      noteUpdatedUntil,
      pagesRead,
      pullOnly: true,
      recordsWritten,
      skipped,
      start,
      trigger,
      updatedSince,
      warningCount,
    };
    const writes: Prisma.PrismaPromise<unknown>[] = [
      prisma.marketingIntegrationSyncLog.create({
        data: {
          finishedAt,
          integrationId: connection.id,
          message,
          metadata,
          provider: pipedriveProvider,
          recordsRead,
          recordsWritten,
          startedAt,
          status,
          syncType: "lead-import",
        },
      }),
    ];

    if (existingConfig.success) {
      const finishedAtIso = finishedAt.toISOString();
      const nextConfig = {
        ...existingConfig.data,
        lastLeadSyncAt: finishedAtIso,
      };

      if (result.status === "ok") {
        if (result.moreAvailable && result.nextStart !== null) {
          nextConfig.lastFullLeadSyncNextStart = result.nextStart;
        } else {
          nextConfig.lastFullLeadSyncAt = finishedAtIso;
          nextConfig.lastFullLeadSyncNextStart = null;
        }
      }

      if (noteResult.status === "ok") {
        if (noteResult.moreAvailable && noteResult.nextStart !== null) {
          nextConfig.lastLeadNoteSyncNextStart = noteResult.nextStart;
          nextConfig.lastLeadNoteSyncPendingUntil = noteUpdatedUntil;
        } else {
          nextConfig.lastLeadNoteSyncAt = noteUpdatedUntil;
          nextConfig.lastLeadNoteSyncNextStart = null;
          nextConfig.lastLeadNoteSyncPendingUntil = null;
        }
      }

      writes.push(
        prisma.integrationConnection.update({
          where: { provider: pipedriveProvider },
          data: {
            config: nextConfig,
          },
        }),
      );
    }

    await prisma.$transaction(writes);

    return {
      connectionId: connection.id,
      created: leadRecordsWritten,
      linkedExisting,
      message,
      metadata,
      mode,
      moreAvailable,
      noteCreated,
      noteIgnored,
      noteMoreAvailable,
      notePagesRead,
      noteRecordsRead,
      noteRecordsWritten,
      noteSkipped,
      noteUpdated,
      pagesRead,
      recordsRead,
      recordsWritten,
      skipped,
      status,
      warningCount,
    } satisfies PipedriveLeadPullResult;
  } catch (error) {
    const finishedAt = new Date();
    const message =
      error instanceof Error ? error.message : "Pipedrive lead import failed.";
    const metadata: Prisma.InputJsonObject = {
      actorId,
      pullOnly: true,
      trigger,
    };

    await prisma.marketingIntegrationSyncLog.create({
      data: {
        finishedAt,
        integrationId: connection.id,
        message,
        metadata,
        provider: pipedriveProvider,
        recordsRead: 0,
        recordsWritten: 0,
        startedAt,
        status: "ERROR",
        syncType: "lead-import",
      },
    });

    return {
      connectionId: connection.id,
      created: 0,
      linkedExisting: 0,
      message,
      metadata,
      mode: "not_configured",
      moreAvailable: false,
      pagesRead: 0,
      recordsRead: 0,
      recordsWritten: 0,
      skipped: 0,
      status: "ERROR",
      warningCount: 1,
    } satisfies PipedriveLeadPullResult;
  }
}

async function writePipedriveApprovedLeadPageImport({
  actorId,
  expectedWouldCreate,
  pageLimit,
  pageStart,
  trigger,
}: {
  actorId: string | null;
  expectedWouldCreate: number | null;
  pageLimit: number;
  pageStart: number | null;
  trigger: string;
}): Promise<PipedriveApprovedLeadPageImportResult> {
  const startedAt = new Date();
  const connection = await ensurePipedriveIntegrationConnection();
  const client = await getPipedriveReadOnlyClient();

  if (!client) {
    const finishedAt = new Date();
    const message =
      "Pipedrive API credentials are missing, so approved page import could not run.";
    const metadata: Prisma.InputJsonObject = {
      actorId,
      expectedWouldCreate,
      mode: "approved-page",
      pageLimit,
      pageStart,
      pullOnly: true,
      reason: "missing-credentials",
      trigger,
    };

    await prisma.marketingIntegrationSyncLog.create({
      data: {
        finishedAt,
        integrationId: connection.id,
        message,
        metadata,
        provider: pipedriveProvider,
        recordsRead: 0,
        recordsWritten: 0,
        startedAt,
        status: "WARNING",
        syncType: "lead-import-approved-page",
      },
    });

    return {
      approvedLeadCount: 0,
      connectionId: connection.id,
      created: 0,
      expectedWouldCreate,
      linkedExisting: 0,
      message,
      metadata,
      mode: "not_configured",
      moreAvailable: false,
      pageLimit,
      pagesRead: 0,
      pageStart,
      recordsRead: 0,
      recordsWritten: 0,
      skipped: 0,
      status: "WARNING",
      warningCount: 1,
    };
  }

  try {
    const preview = await previewPipedriveLeadPage({
      client,
      params: { limit: pageLimit, start: pageStart },
    });
    const recordsRead = preview.status === "ok" ? preview.page.data.length : 0;
    const moreAvailable =
      preview.status === "ok"
        ? preview.page.pagination.moreItemsInCollection
        : false;
    const nextStart =
      preview.status === "ok" ? preview.page.pagination.nextStart : null;
    const skipped = preview.skipped;
    const warningCount =
      preview.status === "ok"
        ? preview.previews.reduce(
            (count, leadPreview) => count + leadPreview.warnings.length,
            0,
          )
        : 1;
    const approvedLeadIds =
      preview.status === "ok"
        ? preview.previews
            .filter((leadPreview) => leadPreview.status === "would_create")
            .map((leadPreview) => leadPreview.externalLeadId)
            .filter((leadId): leadId is string => Boolean(leadId))
        : [];
    const wouldCreate =
      preview.status === "ok" ? preview.wouldCreate : approvedLeadIds.length;
    const linkedExisting = preview.status === "ok" ? preview.linkedExisting : 0;
    const approvalMismatch =
      expectedWouldCreate === null || expectedWouldCreate !== wouldCreate;
    const unsafePreview =
      approvalMismatch ||
      recordsRead === 0 ||
      skipped > 0 ||
      warningCount > 0 ||
      approvedLeadIds.length !== wouldCreate ||
      approvedLeadIds.length > 10;

    if (unsafePreview) {
      const finishedAt = new Date();
      const reason =
        expectedWouldCreate === null
          ? "missing-expected-count"
          : approvalMismatch
            ? "expected-count-mismatch"
            : recordsRead === 0
              ? "empty-page"
              : skipped > 0
                ? "preview-skipped-records"
                : warningCount > 0
                  ? "preview-warnings"
                  : approvedLeadIds.length !== wouldCreate
                    ? "missing-approved-lead-ids"
                    : "approved-lead-limit-exceeded";
      const message =
        "Approved page import did not run because the live preview no longer matched the approved safe import conditions.";
      const metadata: Prisma.InputJsonObject = {
        actorId,
        approvedLeadCount: approvedLeadIds.length,
        expectedWouldCreate,
        linkedExisting,
        mode: "approved-page",
        moreAvailable,
        nextStart,
        pageLimit,
        pageStart,
        pullOnly: true,
        reason,
        skipped,
        trigger,
        warningCount,
        wouldCreate,
      };

      await prisma.marketingIntegrationSyncLog.create({
        data: {
          finishedAt,
          integrationId: connection.id,
          message,
          metadata,
          provider: pipedriveProvider,
          recordsRead,
          recordsWritten: 0,
          startedAt,
          status: "WARNING",
          syncType: "lead-import-approved-page",
        },
      });

      return {
        approvedLeadCount: approvedLeadIds.length,
        connectionId: connection.id,
        created: 0,
        expectedWouldCreate,
        linkedExisting,
        message,
        metadata,
        mode: "page",
        moreAvailable,
        pageLimit,
        pagesRead: preview.status === "ok" ? 1 : 0,
        pageStart,
        recordsRead,
        recordsWritten: 0,
        skipped,
        status: "WARNING",
        warningCount: Math.max(warningCount, 1),
      };
    }

    const importResult = await importPipedriveLeadIds({
      client,
      leadIds: approvedLeadIds,
    });
    const finishedAt = new Date();
    const recordsWritten =
      importResult.status === "ok" ? importResult.created : 0;
    const importedLinkedExisting =
      importResult.status === "ok" ? importResult.linkedExisting : 0;
    const importedSkipped = importResult.skipped;
    const importWarningCount =
      importResult.status === "ok"
        ? importResult.results.reduce(
            (count, leadResult) => count + leadResult.warnings.length,
            0,
          )
        : 1;
    const status: PipedriveLeadPullStatus =
      importWarningCount > 0 || importedSkipped > 0 ? "WARNING" : "SUCCESS";
    const message = `Approved page import: ${recordsWritten} created, ${importedLinkedExisting} already linked, ${importedSkipped} skipped from ${approvedLeadIds.length} approved Pipedrive lead${approvedLeadIds.length === 1 ? "" : "s"}.`;
    const importRows =
      importResult.status === "ok"
        ? pipedriveLeadImportMetadataRows(importResult.results)
        : [];
    const existingConfig = pipedriveStoredConfigSchema.safeParse(
      connection.config ?? {},
    );
    const metadata: Prisma.InputJsonObject = {
      actorId,
      approvedLeadCount: approvedLeadIds.length,
      created: recordsWritten,
      expectedWouldCreate,
      imports: importRows,
      linkedExisting: importedLinkedExisting,
      mode: "approved-page",
      pageLimit,
      pageStart,
      previewLinkedExisting: linkedExisting,
      previewRecordsRead: recordsRead,
      pullOnly: true,
      skipped: importedSkipped,
      trigger,
      warningCount: importWarningCount,
    };
    const writes: Prisma.PrismaPromise<unknown>[] = [
      prisma.marketingIntegrationSyncLog.create({
        data: {
          finishedAt,
          integrationId: connection.id,
          message,
          metadata,
          provider: pipedriveProvider,
          recordsRead: approvedLeadIds.length,
          recordsWritten,
          startedAt,
          status,
          syncType: "lead-import-approved-page",
        },
      }),
    ];

    if (existingConfig.success) {
      writes.push(
        prisma.integrationConnection.update({
          where: { provider: pipedriveProvider },
          data: {
            config: {
              ...existingConfig.data,
              lastLeadSyncAt: finishedAt.toISOString(),
            },
          },
        }),
      );
    }

    await prisma.$transaction(writes);

    return {
      approvedLeadCount: approvedLeadIds.length,
      connectionId: connection.id,
      created: recordsWritten,
      expectedWouldCreate,
      linkedExisting: importedLinkedExisting,
      message,
      metadata,
      mode: "page",
      moreAvailable,
      pageLimit,
      pagesRead: 1,
      pageStart,
      recordsRead: approvedLeadIds.length,
      recordsWritten,
      skipped: importedSkipped,
      status,
      warningCount: importWarningCount,
    };
  } catch (error) {
    const finishedAt = new Date();
    const message =
      error instanceof Error
        ? error.message
        : "Pipedrive approved page import failed.";
    const metadata: Prisma.InputJsonObject = {
      actorId,
      expectedWouldCreate,
      mode: "approved-page",
      pageLimit,
      pageStart,
      pullOnly: true,
      trigger,
    };

    await prisma.marketingIntegrationSyncLog.create({
      data: {
        finishedAt,
        integrationId: connection.id,
        message,
        metadata,
        provider: pipedriveProvider,
        recordsRead: 0,
        recordsWritten: 0,
        startedAt,
        status: "ERROR",
        syncType: "lead-import-approved-page",
      },
    });

    return {
      approvedLeadCount: 0,
      connectionId: connection.id,
      created: 0,
      expectedWouldCreate,
      linkedExisting: 0,
      message,
      metadata,
      mode: "page",
      moreAvailable: false,
      pageLimit,
      pagesRead: 0,
      pageStart,
      recordsRead: 0,
      recordsWritten: 0,
      skipped: 0,
      status: "ERROR",
      warningCount: 1,
    };
  }
}

async function writePipedriveDirectLeadImport({
  actorId,
  requestedLeadId,
  trigger,
}: {
  actorId: string | null;
  requestedLeadId: string | null;
  trigger: string;
}): Promise<PipedriveDirectLeadImportResult> {
  const startedAt = new Date();
  const connection = await ensurePipedriveIntegrationConnection();

  if (!requestedLeadId) {
    const finishedAt = new Date();
    const message =
      "Direct Pipedrive lead import did not run because the submitted value did not contain a valid Lead Inbox UUID.";
    const metadata: Prisma.InputJsonObject = {
      actorId,
      mode: "direct-lead",
      pullOnly: true,
      reason: "invalid-lead-id",
      requestedLeadId,
      trigger,
    };

    await prisma.marketingIntegrationSyncLog.create({
      data: {
        finishedAt,
        integrationId: connection.id,
        message,
        metadata,
        provider: pipedriveProvider,
        recordsRead: 0,
        recordsWritten: 0,
        startedAt,
        status: "WARNING",
        syncType: "lead-import-direct",
      },
    });

    return {
      connectionId: connection.id,
      created: 0,
      linkedExisting: 0,
      message,
      metadata,
      mode: "direct",
      moreAvailable: false,
      pagesRead: 0,
      recordsRead: 0,
      recordsWritten: 0,
      requestedLeadId,
      skipped: 0,
      status: "WARNING",
      warningCount: 1,
    };
  }

  const client = await getPipedriveReadOnlyClient();

  if (!client) {
    const finishedAt = new Date();
    const message =
      "Pipedrive API credentials are missing, so direct lead import could not run.";
    const metadata: Prisma.InputJsonObject = {
      actorId,
      mode: "direct-lead",
      pullOnly: true,
      reason: "missing-credentials",
      requestedLeadId,
      trigger,
    };

    await prisma.marketingIntegrationSyncLog.create({
      data: {
        finishedAt,
        integrationId: connection.id,
        message,
        metadata,
        provider: pipedriveProvider,
        recordsRead: 0,
        recordsWritten: 0,
        startedAt,
        status: "WARNING",
        syncType: "lead-import-direct",
      },
    });

    return {
      connectionId: connection.id,
      created: 0,
      linkedExisting: 0,
      message,
      metadata,
      mode: "not_configured",
      moreAvailable: false,
      pagesRead: 0,
      recordsRead: 0,
      recordsWritten: 0,
      requestedLeadId,
      skipped: 1,
      status: "WARNING",
      warningCount: 1,
    };
  }

  try {
    const importResult = await importPipedriveLeadIds({
      client,
      leadIds: [requestedLeadId],
    });
    const finishedAt = new Date();
    const recordsRead =
      importResult.status === "ok" ? importResult.requested : 0;
    const recordsWritten =
      importResult.status === "ok" ? importResult.created : 0;
    const linkedExisting =
      importResult.status === "ok" ? importResult.linkedExisting : 0;
    const skipped = importResult.skipped;
    const warningCount =
      importResult.status === "ok"
        ? importResult.results.reduce(
            (count, leadResult) => count + leadResult.warnings.length,
            0,
          )
        : 1;
    const status: PipedriveLeadPullStatus =
      warningCount > 0 || skipped > 0 || recordsRead === 0
        ? "WARNING"
        : "SUCCESS";
    const message =
      recordsRead === 0
        ? "Direct lead import found no Pipedrive lead to import."
        : `Direct lead import: ${recordsWritten} created, ${linkedExisting} already linked, ${skipped} skipped from ${recordsRead} requested Pipedrive lead.`;
    const importRows =
      importResult.status === "ok"
        ? pipedriveLeadImportMetadataRows(importResult.results)
        : [];
    const existingConfig = pipedriveStoredConfigSchema.safeParse(
      connection.config ?? {},
    );
    const metadata: Prisma.InputJsonObject = {
      actorId,
      created: recordsWritten,
      imports: importRows,
      linkedExisting,
      mode: "direct-lead",
      pullOnly: true,
      requestedLeadId,
      skipped,
      trigger,
      warningCount,
    };
    const writes: Prisma.PrismaPromise<unknown>[] = [
      prisma.marketingIntegrationSyncLog.create({
        data: {
          finishedAt,
          integrationId: connection.id,
          message,
          metadata,
          provider: pipedriveProvider,
          recordsRead,
          recordsWritten,
          startedAt,
          status,
          syncType: "lead-import-direct",
        },
      }),
    ];

    if (existingConfig.success) {
      writes.push(
        prisma.integrationConnection.update({
          where: { provider: pipedriveProvider },
          data: {
            config: {
              ...existingConfig.data,
              lastLeadSyncAt: finishedAt.toISOString(),
            },
          },
        }),
      );
    }

    await prisma.$transaction(writes);

    return {
      connectionId: connection.id,
      created: recordsWritten,
      linkedExisting,
      message,
      metadata,
      mode: "direct",
      moreAvailable: false,
      pagesRead: recordsRead ? 1 : 0,
      recordsRead,
      recordsWritten,
      requestedLeadId,
      skipped,
      status,
      warningCount,
    };
  } catch (error) {
    const finishedAt = new Date();
    const message =
      error instanceof Error
        ? error.message
        : "Pipedrive direct lead import failed.";
    const metadata: Prisma.InputJsonObject = {
      actorId,
      mode: "direct-lead",
      pullOnly: true,
      requestedLeadId,
      trigger,
    };

    await prisma.marketingIntegrationSyncLog.create({
      data: {
        finishedAt,
        integrationId: connection.id,
        message,
        metadata,
        provider: pipedriveProvider,
        recordsRead: 0,
        recordsWritten: 0,
        startedAt,
        status: "ERROR",
        syncType: "lead-import-direct",
      },
    });

    return {
      connectionId: connection.id,
      created: 0,
      linkedExisting: 0,
      message,
      metadata,
      mode: "direct",
      moreAvailable: false,
      pagesRead: 0,
      recordsRead: 0,
      recordsWritten: 0,
      requestedLeadId,
      skipped: 0,
      status: "ERROR",
      warningCount: 1,
    };
  }
}

async function currentPipedriveLeadPullRun(
  jobRun: { id: string; startedAt: Date } | null,
): Promise<ActivePipedriveLeadPullRun | null> {
  if (!jobRun) return null;

  try {
    const run = await prisma.backgroundJobRun.findFirst({
      orderBy: [{ startedAt: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        startedAt: true,
        trigger: true,
      },
      where: {
        jobName: pipedriveLeadImportJobName,
        startedAt: { gte: backgroundJobStaleCutoff() },
        status: BackgroundJobRunStatus.RUNNING,
      },
    });

    if (!run || run.id === jobRun.id) return null;

    return run;
  } catch (error) {
    if (isBackgroundJobSchemaPending(error)) return null;

    throw error;
  }
}

async function skipPipedriveLeadPull({
  actorId,
  activeRun,
  trigger,
}: {
  actorId: string | null;
  activeRun: ActivePipedriveLeadPullRun;
  trigger: string;
}) {
  const startedAt = new Date();
  const connection = await ensurePipedriveIntegrationConnection();
  const finishedAt = new Date();
  const message =
    "Pipedrive lead import skipped because another pull is already running.";
  const metadata: Prisma.InputJsonObject = {
    actorId,
    activeRunId: activeRun.id,
    activeRunStartedAt: activeRun.startedAt.toISOString(),
    activeRunTrigger: activeRun.trigger,
    pullOnly: true,
    reason: "already-running",
    trigger,
  };

  await prisma.marketingIntegrationSyncLog.create({
    data: {
      finishedAt,
      integrationId: connection.id,
      message,
      metadata,
      provider: pipedriveProvider,
      recordsRead: 0,
      recordsWritten: 0,
      startedAt,
      status: "WARNING",
      syncType: "lead-import",
    },
  });

  return {
    connectionId: connection.id,
    created: 0,
    linkedExisting: 0,
    message,
    metadata,
    mode: "already_running",
    moreAvailable: false,
    pagesRead: 0,
    recordsRead: 0,
    recordsWritten: 0,
    skipped: 0,
    status: "WARNING",
    warningCount: 1,
  } satisfies PipedriveLeadPullResult;
}

async function skipPipedriveApprovedLeadPageImport({
  actorId,
  activeRun,
  expectedWouldCreate,
  pageLimit,
  pageStart,
  trigger,
}: {
  actorId: string | null;
  activeRun: ActivePipedriveLeadPullRun;
  expectedWouldCreate: number | null;
  pageLimit: number;
  pageStart: number | null;
  trigger: string;
}) {
  const startedAt = new Date();
  const connection = await ensurePipedriveIntegrationConnection();
  const finishedAt = new Date();
  const message =
    "Pipedrive approved page import skipped because another pull is already running.";
  const metadata: Prisma.InputJsonObject = {
    actorId,
    activeRunId: activeRun.id,
    activeRunStartedAt: activeRun.startedAt.toISOString(),
    activeRunTrigger: activeRun.trigger,
    expectedWouldCreate,
    mode: "approved-page",
    pageLimit,
    pageStart,
    pullOnly: true,
    reason: "already-running",
    trigger,
  };

  await prisma.marketingIntegrationSyncLog.create({
    data: {
      finishedAt,
      integrationId: connection.id,
      message,
      metadata,
      provider: pipedriveProvider,
      recordsRead: 0,
      recordsWritten: 0,
      startedAt,
      status: "WARNING",
      syncType: "lead-import-approved-page",
    },
  });

  return {
    approvedLeadCount: 0,
    connectionId: connection.id,
    created: 0,
    expectedWouldCreate,
    linkedExisting: 0,
    message,
    metadata,
    mode: "already_running",
    moreAvailable: false,
    pageLimit,
    pagesRead: 0,
    pageStart,
    recordsRead: 0,
    recordsWritten: 0,
    skipped: 0,
    status: "WARNING",
    warningCount: 1,
  } satisfies PipedriveApprovedLeadPageImportResult;
}

async function skipPipedriveDirectLeadImport({
  actorId,
  activeRun,
  requestedLeadId,
  trigger,
}: {
  actorId: string | null;
  activeRun: ActivePipedriveLeadPullRun;
  requestedLeadId: string | null;
  trigger: string;
}) {
  const startedAt = new Date();
  const connection = await ensurePipedriveIntegrationConnection();
  const finishedAt = new Date();
  const message =
    "Pipedrive direct lead import skipped because another pull is already running.";
  const metadata: Prisma.InputJsonObject = {
    actorId,
    activeRunId: activeRun.id,
    activeRunStartedAt: activeRun.startedAt.toISOString(),
    activeRunTrigger: activeRun.trigger,
    mode: "direct-lead",
    pullOnly: true,
    reason: "already-running",
    requestedLeadId,
    trigger,
  };

  await prisma.marketingIntegrationSyncLog.create({
    data: {
      finishedAt,
      integrationId: connection.id,
      message,
      metadata,
      provider: pipedriveProvider,
      recordsRead: 0,
      recordsWritten: 0,
      startedAt,
      status: "WARNING",
      syncType: "lead-import-direct",
    },
  });

  return {
    connectionId: connection.id,
    created: 0,
    linkedExisting: 0,
    message,
    metadata,
    mode: "already_running",
    moreAvailable: false,
    pagesRead: 0,
    recordsRead: 0,
    recordsWritten: 0,
    requestedLeadId,
    skipped: 0,
    status: "WARNING",
    warningCount: 1,
  } satisfies PipedriveDirectLeadImportResult;
}

function backgroundStatus(status: PipedriveLeadPullStatus) {
  switch (status) {
    case "SUCCESS":
      return BackgroundJobRunStatus.SUCCESS;
    case "WARNING":
      return BackgroundJobRunStatus.WARNING;
    case "ERROR":
      return BackgroundJobRunStatus.ERROR;
  }
}

function boundedPreviewLimit(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 10;

  return Math.min(Math.max(Math.trunc(value), 1), 50);
}

function boundedApprovedImportLimit(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 10;

  return Math.min(Math.max(Math.trunc(value), 1), 10);
}

function boundedPreviewStart(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;

  return Math.max(Math.trunc(value), 0);
}

function syncTrigger(trigger: string) {
  const normalized = trigger.trim();

  return normalized || "manual";
}
