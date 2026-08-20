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
  importPipedriveLeadPages,
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
    | "incremental"
    | "initial"
    | "not_configured"
    | "page";
  moreAvailable: boolean;
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
    lastFullLeadSyncAt: storedConfig?.lastFullLeadSyncAt ?? null,
    lastFullLeadSyncNextStart:
      typeof storedConfig?.lastFullLeadSyncNextStart === "number"
        ? storedConfig.lastFullLeadSyncNextStart
        : null,
    lastLeadSyncAt: storedConfig?.lastLeadSyncAt ?? null,
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
    const result = await importPipedriveLeadPages({
      client,
      params: { limit: 50, start, updatedSince },
    });
    const finishedAt = new Date();
    const recordsRead = result.status === "ok" ? result.recordsRead : 0;
    const recordsWritten = result.status === "ok" ? result.created : 0;
    const linkedExisting = result.status === "ok" ? result.linkedExisting : 0;
    const skipped = result.skipped;
    const moreAvailable = result.status === "ok" ? result.moreAvailable : false;
    const pagesRead = result.status === "ok" ? result.pagesRead : 0;
    const warningCount =
      result.status === "ok"
        ? result.results.reduce(
            (count, leadResult) => count + leadResult.warnings.length,
            0,
          )
        : 1;
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
          ? "Incremental pull"
          : "Initial pull";
    const pageSummary = pagesRead > 1 ? ` across ${pagesRead} pages` : "";
    const moreAvailableSummary = moreAvailable
      ? " More Pipedrive pages are available, so a continuation was saved and the full-pull cursor was not advanced."
      : "";
    const message =
      recordsRead === 0
        ? `${importMode}: no Pipedrive leads were available to import.`
        : `${importMode}: ${recordsWritten} created, ${linkedExisting} already linked, ${skipped} skipped from ${recordsRead} Pipedrive lead${recordsRead === 1 ? "" : "s"}${pageSummary}.${moreAvailableSummary}`;
    const importRows =
      result.status === "ok"
        ? pipedriveLeadImportMetadataRows(result.results)
        : [];
    const existingConfig = pipedriveStoredConfigSchema.safeParse(
      connection.config ?? {},
    );
    const metadata: Prisma.InputJsonObject = {
      actorId,
      created: recordsWritten,
      imports: importRows,
      linkedExisting,
      maxPages: result.status === "ok" ? result.maxPages : null,
      mode,
      moreAvailable,
      nextStart: result.status === "ok" ? result.nextStart : null,
      pagesRead,
      pullOnly: true,
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
      const nextConfig =
        moreAvailable && result.status === "ok" && result.nextStart !== null
          ? {
              ...existingConfig.data,
              lastFullLeadSyncNextStart: result.nextStart,
              lastLeadSyncAt: finishedAt.toISOString(),
            }
          : {
              ...existingConfig.data,
              lastFullLeadSyncAt: finishedAt.toISOString(),
              lastFullLeadSyncNextStart: null,
              lastLeadSyncAt: finishedAt.toISOString(),
            };

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
      created: recordsWritten,
      linkedExisting,
      message,
      metadata,
      mode,
      moreAvailable,
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
