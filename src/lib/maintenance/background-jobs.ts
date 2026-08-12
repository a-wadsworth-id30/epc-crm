import "server-only";

import { BackgroundJobRunStatus, Prisma } from "@prisma/client";
import {
  backgroundJobStaleCutoff,
  backgroundJobStaleMinutes,
} from "@/lib/maintenance/background-job-health";
import { prisma } from "@/lib/prisma";
import { isPrismaMissingSchemaError } from "@/lib/prisma-errors";

const dayMs = 24 * 60 * 60 * 1000;

export {
  backgroundJobStaleCutoff,
  backgroundJobStaleMinutes,
  formatBackgroundJobName,
  isBackgroundJobRunStale,
} from "@/lib/maintenance/background-job-health";

export type BackgroundJobRunInput = {
  actorId?: string | null;
  dryRun?: boolean;
  jobName: string;
  jobType: string;
  metadata?: Prisma.InputJsonValue;
  trigger?: string;
};

export type BackgroundJobRunCompletion = {
  message?: string | null;
  metadata?: Prisma.InputJsonValue;
  recordsRead?: number;
  recordsWritten?: number;
  status?: BackgroundJobRunStatus;
  summary?: Prisma.InputJsonValue;
};

export type BackgroundJobRunFailure = {
  error: unknown;
  message?: string | null;
  metadata?: Prisma.InputJsonValue;
  recordsRead?: number;
  recordsWritten?: number;
  summary?: Prisma.InputJsonValue;
};

type BackgroundJobRunHandle = {
  id: string;
  startedAt: Date;
} | null;

export type BackgroundJobHealthSummary =
  | {
      available: true;
      latestError: {
        errorMessage: string | null;
        jobName: string;
        message: string | null;
        startedAt: Date;
      } | null;
      recentErrorCount: number;
      recentErrorDays: number;
      runningCount: number;
      staleCutoff: Date;
      staleMinutes: number;
      staleRunningCount: number;
    }
  | {
      available: false;
      latestError: null;
      recentErrorCount: null;
      recentErrorDays: number;
      runningCount: null;
      staleCutoff: Date;
      staleMinutes: number;
      staleRunningCount: null;
    };

export async function startBackgroundJobRun(
  input: BackgroundJobRunInput,
): Promise<BackgroundJobRunHandle> {
  const startedAt = new Date();

  try {
    const run = await prisma.backgroundJobRun.create({
      data: {
        actorId: input.actorId ?? null,
        dryRun: input.dryRun ?? false,
        jobName: input.jobName,
        jobType: input.jobType,
        metadata: input.metadata ?? undefined,
        startedAt,
        trigger: input.trigger ?? "manual",
      },
      select: {
        id: true,
        startedAt: true,
      },
    });

    return run;
  } catch (error) {
    if (isBackgroundJobSchemaPending(error)) {
      return null;
    }

    throw error;
  }
}

export async function completeBackgroundJobRun(
  handle: BackgroundJobRunHandle,
  completion: BackgroundJobRunCompletion = {},
) {
  if (!handle) return;

  const finishedAt = new Date();

  await safeJobHistoryWrite(() =>
    prisma.backgroundJobRun.update({
      where: { id: handle.id },
      data: {
        durationMs: durationMs(handle.startedAt, finishedAt),
        finishedAt,
        message: completion.message ?? null,
        metadata: completion.metadata ?? undefined,
        recordsRead: completion.recordsRead ?? 0,
        recordsWritten: completion.recordsWritten ?? 0,
        status: completion.status ?? BackgroundJobRunStatus.SUCCESS,
        summary: completion.summary ?? undefined,
      },
    }),
  );
}

export async function failBackgroundJobRun(
  handle: BackgroundJobRunHandle,
  failure: BackgroundJobRunFailure,
) {
  if (!handle) return;

  const finishedAt = new Date();
  const errorMessage = errorMessageFromUnknown(failure.error);

  await safeJobHistoryWrite(() =>
    prisma.backgroundJobRun.update({
      where: { id: handle.id },
      data: {
        durationMs: durationMs(handle.startedAt, finishedAt),
        errorMessage,
        finishedAt,
        message: failure.message ?? errorMessage,
        metadata: failure.metadata ?? undefined,
        recordsRead: failure.recordsRead ?? 0,
        recordsWritten: failure.recordsWritten ?? 0,
        status: BackgroundJobRunStatus.ERROR,
        summary: failure.summary ?? undefined,
      },
    }),
  );
}

export async function runWithBackgroundJob<T>(
  input: BackgroundJobRunInput & {
    complete: (result: T) => BackgroundJobRunCompletion;
    run: () => Promise<T>;
  },
) {
  const handle = await startBackgroundJobRun(input);

  try {
    const result = await input.run();
    await completeBackgroundJobRun(handle, input.complete(result));

    return result;
  } catch (error) {
    await failBackgroundJobRun(handle, { error });
    throw error;
  }
}

export function warningStatusWhen(condition: boolean) {
  return condition ? BackgroundJobRunStatus.WARNING : BackgroundJobRunStatus.SUCCESS;
}

export async function readBackgroundJobHealthSummary({
  now = new Date(),
  recentErrorDays = 7,
  staleMinutes = backgroundJobStaleMinutes(),
}: {
  now?: Date;
  recentErrorDays?: number;
  staleMinutes?: number;
} = {}): Promise<BackgroundJobHealthSummary> {
  const staleCutoff = backgroundJobStaleCutoff(now, staleMinutes);
  const recentErrorCutoff = new Date(
    now.getTime() - Math.max(1, recentErrorDays) * dayMs,
  );

  try {
    const [runningCount, staleRunningCount, recentErrorCount, latestError] =
      await Promise.all([
        prisma.backgroundJobRun.count({
          where: { status: BackgroundJobRunStatus.RUNNING },
        }),
        prisma.backgroundJobRun.count({
          where: {
            startedAt: { lt: staleCutoff },
            status: BackgroundJobRunStatus.RUNNING,
          },
        }),
        prisma.backgroundJobRun.count({
          where: {
            createdAt: { gte: recentErrorCutoff },
            status: BackgroundJobRunStatus.ERROR,
          },
        }),
        prisma.backgroundJobRun.findFirst({
          where: {
            createdAt: { gte: recentErrorCutoff },
            status: BackgroundJobRunStatus.ERROR,
          },
          orderBy: { startedAt: "desc" },
          select: {
            errorMessage: true,
            jobName: true,
            message: true,
            startedAt: true,
          },
        }),
      ]);

    return {
      available: true,
      latestError,
      recentErrorCount,
      recentErrorDays,
      runningCount,
      staleCutoff,
      staleMinutes,
      staleRunningCount,
    };
  } catch (error) {
    if (isBackgroundJobSchemaPending(error)) {
      return unavailableBackgroundJobHealthSummary({
        recentErrorDays,
        staleCutoff,
        staleMinutes,
      });
    }

    throw error;
  }
}

export function safeJobJson(value: unknown): Prisma.InputJsonValue {
  if (value === undefined) return null as unknown as Prisma.InputJsonValue;

  return JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  ) as Prisma.InputJsonValue;
}

function durationMs(startedAt: Date, finishedAt: Date) {
  return Math.max(0, finishedAt.getTime() - startedAt.getTime());
}

function errorMessageFromUnknown(error: unknown) {
  return error instanceof Error ? error.message : "Background job failed.";
}

async function safeJobHistoryWrite(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    if (isBackgroundJobSchemaPending(error)) return;

    throw error;
  }
}

export function isBackgroundJobSchemaPending(error: unknown) {
  return isPrismaMissingSchemaError(error, {
    modelName: "BackgroundJobRun",
    tableName: "BackgroundJobRun",
  });
}

function unavailableBackgroundJobHealthSummary({
  recentErrorDays,
  staleCutoff,
  staleMinutes,
}: {
  recentErrorDays: number;
  staleCutoff: Date;
  staleMinutes: number;
}): BackgroundJobHealthSummary {
  return {
    available: false,
    latestError: null,
    recentErrorCount: null,
    recentErrorDays,
    runningCount: null,
    staleCutoff,
    staleMinutes,
    staleRunningCount: null,
  };
}
