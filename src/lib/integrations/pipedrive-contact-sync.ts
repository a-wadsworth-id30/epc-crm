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
  importPipedrivePersonPages,
  pipedrivePersonImportMetadataRows,
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

type PipedriveContactPullStatus = "SUCCESS" | "WARNING" | "ERROR";
const pipedriveContactImportJobName = "pipedrive.contact_import";

export type PipedriveContactPullResult = {
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
  nextCursor: string | null;
  pagesRead: number;
  recordsRead: number;
  recordsWritten: number;
  skipped: number;
  status: PipedriveContactPullStatus;
  warningCount: number;
};

type PipedriveContactPullOptions = {
  actorId?: string | null;
  recordBackgroundJob?: boolean;
  trigger?: string;
};

type ActivePipedriveContactPullRun = {
  id: string;
  startedAt: Date;
  trigger: string;
};

export async function runPipedriveContactPull({
  actorId = null,
  recordBackgroundJob = true,
  trigger = "manual",
}: PipedriveContactPullOptions = {}): Promise<PipedriveContactPullResult> {
  const normalizedTrigger = syncTrigger(trigger);
  const jobRun = recordBackgroundJob
    ? await startBackgroundJobRun({
        actorId,
        dryRun: false,
        jobName: pipedriveContactImportJobName,
        jobType: "integration-sync",
        metadata: {
          provider: pipedriveProvider,
          pullOnly: true,
        },
        trigger: normalizedTrigger,
      })
    : null;

  try {
    const activeRun = await currentPipedriveContactPullRun(jobRun);

    if (activeRun) {
      const result = await skipPipedriveContactPull({
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

    const result = await writePipedriveContactPull({
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
        "Pipedrive contact import failed before sync history could be written.",
      metadata: {
        provider: pipedriveProvider,
        pullOnly: true,
        trigger: normalizedTrigger,
      },
    });

    throw error;
  }
}

export async function readPipedriveContactPullReadiness() {
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
    credentialSource: storedConfig?.credentials?.apiToken
      ? "database"
      : hasPipedriveEnvironmentConfig()
        ? "environment"
        : "missing",
    defaultLeadSource:
      storedConfig?.defaultLeadSource ?? defaultPipedriveLeadSource,
    lastContactSyncAt: storedConfig?.lastContactSyncAt ?? null,
    lastFullPersonSyncAt: storedConfig?.lastFullPersonSyncAt ?? null,
    lastFullPersonSyncNextCursor:
      storedConfig?.lastFullPersonSyncNextCursor ?? null,
    provider: pipedriveProvider,
    pullOnly: true as const,
    status: connection?.status ?? "NOT_CONNECTED",
    updatedAt: connection?.updatedAt?.toISOString() ?? null,
    usingApiBaseUrl: storedConfig?.apiBaseUrl ?? defaultPipedriveApiBaseUrl,
  };
}

async function writePipedriveContactPull({
  actorId,
  trigger,
}: {
  actorId: string | null;
  trigger: string;
}): Promise<PipedriveContactPullResult> {
  const startedAt = new Date();
  const connection = await ensurePipedriveIntegrationConnection();
  const client = await getPipedriveReadOnlyClient();

  if (!client) {
    const finishedAt = new Date();
    const message =
      "Pipedrive API credentials are missing, so contact import could not run.";
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
        syncType: "contact-import",
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
      nextCursor: null,
      pagesRead: 0,
      recordsRead: 0,
      recordsWritten: 0,
      skipped: 0,
      status: "WARNING",
      warningCount: 1,
    };
  }

  try {
    const cursor = client.lastFullPersonSyncNextCursor;
    const updatedSince = client.lastFullPersonSyncAt;
    const result = await importPipedrivePersonPages({
      client,
      params: {
        cursor,
        limit: 50,
        updatedSince,
      },
    });
    const finishedAt = new Date();
    const recordsRead = result.status === "ok" ? result.recordsRead : 0;
    const recordsWritten = result.status === "ok" ? result.created : 0;
    const linkedExisting = result.status === "ok" ? result.linkedExisting : 0;
    const skipped = result.skipped;
    const moreAvailable = result.status === "ok" ? result.moreAvailable : false;
    const nextCursor = result.status === "ok" ? result.nextCursor : null;
    const pagesRead = result.status === "ok" ? result.pagesRead : 0;
    const warningCount =
      result.status === "ok"
        ? result.results.reduce(
            (count, personResult) => count + personResult.warnings.length,
            0,
          )
        : 1;
    const status: PipedriveContactPullStatus =
      warningCount > 0 || skipped > 0 || recordsRead === 0 || moreAvailable
        ? "WARNING"
        : "SUCCESS";
    const mode = cursor
      ? "continuation"
      : updatedSince
        ? "incremental"
        : "initial";
    const importMode =
      mode === "continuation"
        ? "Continuation contact pull"
        : mode === "incremental"
          ? "Incremental contact pull"
          : "Initial contact pull";
    const pageSummary = pagesRead > 1 ? ` across ${pagesRead} pages` : "";
    const moreAvailableSummary = moreAvailable
      ? " More Pipedrive person pages are available, so a continuation cursor was saved and the full contact cursor was not advanced."
      : "";
    const message =
      recordsRead === 0
        ? `${importMode}: no Pipedrive persons were available to import.`
        : `${importMode}: ${recordsWritten} contacts created, ${linkedExisting} already linked, ${skipped} skipped from ${recordsRead} Pipedrive person${recordsRead === 1 ? "" : "s"}${pageSummary}.${moreAvailableSummary}`;
    const importRows =
      result.status === "ok"
        ? pipedrivePersonImportMetadataRows(result.results)
        : [];
    const existingConfig = pipedriveStoredConfigSchema.safeParse(
      connection.config ?? {},
    );
    const metadata: Prisma.InputJsonObject = {
      actorId,
      created: recordsWritten,
      cursor,
      imports: importRows,
      linkedExisting,
      maxPages: result.status === "ok" ? result.maxPages : null,
      mode,
      moreAvailable,
      nextCursor,
      pagesRead,
      pullOnly: true,
      skipped,
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
          syncType: "contact-import",
        },
      }),
    ];

    if (existingConfig.success) {
      const nextConfig =
        moreAvailable && nextCursor
          ? {
              ...existingConfig.data,
              lastContactSyncAt: finishedAt.toISOString(),
              lastFullPersonSyncNextCursor: nextCursor,
            }
          : {
              ...existingConfig.data,
              lastContactSyncAt: finishedAt.toISOString(),
              lastFullPersonSyncAt: finishedAt.toISOString(),
              lastFullPersonSyncNextCursor: null,
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
      nextCursor,
      pagesRead,
      recordsRead,
      recordsWritten,
      skipped,
      status,
      warningCount,
    } satisfies PipedriveContactPullResult;
  } catch (error) {
    const finishedAt = new Date();
    const message =
      error instanceof Error
        ? error.message
        : "Pipedrive contact import failed.";
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
        syncType: "contact-import",
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
      nextCursor: null,
      pagesRead: 0,
      recordsRead: 0,
      recordsWritten: 0,
      skipped: 0,
      status: "ERROR",
      warningCount: 1,
    } satisfies PipedriveContactPullResult;
  }
}

async function currentPipedriveContactPullRun(
  jobRun: { id: string; startedAt: Date } | null,
): Promise<ActivePipedriveContactPullRun | null> {
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
        jobName: pipedriveContactImportJobName,
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

async function skipPipedriveContactPull({
  actorId,
  activeRun,
  trigger,
}: {
  actorId: string | null;
  activeRun: ActivePipedriveContactPullRun;
  trigger: string;
}) {
  const startedAt = new Date();
  const connection = await ensurePipedriveIntegrationConnection();
  const finishedAt = new Date();
  const message =
    "Pipedrive contact import skipped because another pull is already running.";
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
      syncType: "contact-import",
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
    nextCursor: null,
    pagesRead: 0,
    recordsRead: 0,
    recordsWritten: 0,
    skipped: 0,
    status: "WARNING",
    warningCount: 1,
  } satisfies PipedriveContactPullResult;
}

function backgroundStatus(status: PipedriveContactPullStatus) {
  if (status === "ERROR") return BackgroundJobRunStatus.ERROR;
  if (status === "WARNING") return BackgroundJobRunStatus.WARNING;

  return BackgroundJobRunStatus.SUCCESS;
}

function syncTrigger(value: string | undefined) {
  const trigger = value?.trim() || "manual";
  return trigger.slice(0, 40) || "manual";
}
