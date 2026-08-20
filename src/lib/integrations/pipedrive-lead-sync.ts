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
  importPipedriveLeadPages,
  pipedriveLeadImportMetadataRows,
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
    | "not_configured";
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
    const linkedExisting =
      result.status === "ok" ? result.linkedExisting : 0;
    const skipped = result.skipped;
    const moreAvailable =
      result.status === "ok" ? result.moreAvailable : false;
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
      start !== null ? "continuation" : updatedSince ? "incremental" : "initial";
    const importMode =
      mode === "continuation"
        ? "Continuation pull"
        : mode === "incremental"
          ? "Incremental pull"
          : "Initial pull";
    const pageSummary =
      pagesRead > 1 ? ` across ${pagesRead} pages` : "";
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
      error instanceof Error
        ? error.message
        : "Pipedrive lead import failed.";
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

function syncTrigger(trigger: string) {
  const normalized = trigger.trim();

  return normalized || "manual";
}
