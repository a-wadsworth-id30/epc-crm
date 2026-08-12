import "server-only";

import {
  BackgroundJobRunStatus,
  MarketingConversionUploadStatus,
} from "@prisma/client";
import {
  runWithBackgroundJob,
  safeJobJson,
  warningStatusWhen,
} from "@/lib/maintenance/background-jobs";
import { prisma } from "@/lib/prisma";

const dayMs = 24 * 60 * 60 * 1000;

type RetentionTarget = {
  count: () => Promise<number>;
  delete: () => Promise<{ count: number }>;
  entity: string;
  id: string;
  label: string;
  retentionDays: number;
  cutoff: Date;
};

export type OperationalRetentionTargetResult = {
  cutoff: string;
  deleted: number;
  dryRun: boolean;
  entity: string;
  id: string;
  label: string;
  matched: number;
  retentionDays: number;
};

export type OperationalRetentionRunResult = {
  dryRun: boolean;
  finishedAt: string;
  startedAt: string;
  targets: OperationalRetentionTargetResult[];
  totals: {
    deleted: number;
    matched: number;
  };
  trigger: string;
};

type OperationalRetentionOptions = {
  actorId?: string | null;
  dryRun?: boolean;
  recordJobRun?: boolean;
  trigger?: string;
};

function cutoffDate(now: Date, retentionDays: number) {
  return new Date(now.getTime() - retentionDays * dayMs);
}

function retentionTargets(now: Date): RetentionTarget[] {
  const expiredSessionCutoff = cutoffDate(now, 30);
  const passwordResetCutoff = cutoffDate(now, 7);
  const authRateLimitCutoff = cutoffDate(now, 7);
  const installCheckCutoff = cutoffDate(now, 90);
  const reportRunCutoff = cutoffDate(now, 180);
  const marketingSyncCutoff = cutoffDate(now, 180);
  const conversionUploadCutoff = cutoffDate(now, 365);
  const backgroundJobRunCutoff = cutoffDate(now, 365);
  const auditLogCutoff = cutoffDate(now, 730);

  return [
    {
      id: "expired-sessions",
      label: "Expired sessions",
      entity: "Session",
      retentionDays: 30,
      cutoff: expiredSessionCutoff,
      count: () =>
        prisma.session.count({ where: { expiresAt: { lt: expiredSessionCutoff } } }),
      delete: () =>
        prisma.session.deleteMany({
          where: { expiresAt: { lt: expiredSessionCutoff } },
        }),
    },
    {
      id: "password-reset-tokens",
      label: "Expired password reset/setup tokens",
      entity: "PasswordResetToken",
      retentionDays: 7,
      cutoff: passwordResetCutoff,
      count: () =>
        prisma.passwordResetToken.count({
          where: { expiresAt: { lt: passwordResetCutoff } },
        }),
      delete: () =>
        prisma.passwordResetToken.deleteMany({
          where: { expiresAt: { lt: passwordResetCutoff } },
        }),
    },
    {
      id: "auth-rate-limit-buckets",
      label: "Dormant auth throttle buckets",
      entity: "AuthRateLimitBucket",
      retentionDays: 7,
      cutoff: authRateLimitCutoff,
      count: () =>
        prisma.authRateLimitBucket.count({
          where: {
            updatedAt: { lt: authRateLimitCutoff },
            OR: [{ blockedUntil: null }, { blockedUntil: { lte: now } }],
          },
        }),
      delete: () =>
        prisma.authRateLimitBucket.deleteMany({
          where: {
            updatedAt: { lt: authRateLimitCutoff },
            OR: [{ blockedUntil: null }, { blockedUntil: { lte: now } }],
          },
        }),
    },
    {
      id: "attribution-install-checks",
      label: "Attribution install check history",
      entity: "AttributionInstallCheck",
      retentionDays: 90,
      cutoff: installCheckCutoff,
      count: () =>
        prisma.attributionInstallCheck.count({
          where: { createdAt: { lt: installCheckCutoff } },
        }),
      delete: () =>
        prisma.attributionInstallCheck.deleteMany({
          where: { createdAt: { lt: installCheckCutoff } },
        }),
    },
    {
      id: "report-runs",
      label: "Report execution history",
      entity: "ReportRun",
      retentionDays: 180,
      cutoff: reportRunCutoff,
      count: () =>
        prisma.reportRun.count({ where: { createdAt: { lt: reportRunCutoff } } }),
      delete: () =>
        prisma.reportRun.deleteMany({
          where: { createdAt: { lt: reportRunCutoff } },
        }),
    },
    {
      id: "marketing-sync-logs",
      label: "Marketing integration sync logs",
      entity: "MarketingIntegrationSyncLog",
      retentionDays: 180,
      cutoff: marketingSyncCutoff,
      count: () =>
        prisma.marketingIntegrationSyncLog.count({
          where: { createdAt: { lt: marketingSyncCutoff } },
        }),
      delete: () =>
        prisma.marketingIntegrationSyncLog.deleteMany({
          where: { createdAt: { lt: marketingSyncCutoff } },
        }),
    },
    {
      id: "processed-conversion-uploads",
      label: "Processed conversion upload rows",
      entity: "MarketingConversionUpload",
      retentionDays: 365,
      cutoff: conversionUploadCutoff,
      count: () =>
        prisma.marketingConversionUpload.count({
          where: {
            status: {
              in: [
                MarketingConversionUploadStatus.SENT,
                MarketingConversionUploadStatus.SKIPPED,
              ],
            },
            updatedAt: { lt: conversionUploadCutoff },
          },
        }),
      delete: () =>
        prisma.marketingConversionUpload.deleteMany({
          where: {
            status: {
              in: [
                MarketingConversionUploadStatus.SENT,
                MarketingConversionUploadStatus.SKIPPED,
              ],
            },
            updatedAt: { lt: conversionUploadCutoff },
          },
        }),
    },
    {
      id: "background-job-runs",
      label: "Background job history",
      entity: "BackgroundJobRun",
      retentionDays: 365,
      cutoff: backgroundJobRunCutoff,
      count: () =>
        prisma.backgroundJobRun.count({
          where: {
            status: {
              in: [
                BackgroundJobRunStatus.SUCCESS,
                BackgroundJobRunStatus.WARNING,
                BackgroundJobRunStatus.ERROR,
              ],
            },
            createdAt: { lt: backgroundJobRunCutoff },
          },
        }),
      delete: () =>
        prisma.backgroundJobRun.deleteMany({
          where: {
            status: {
              in: [
                BackgroundJobRunStatus.SUCCESS,
                BackgroundJobRunStatus.WARNING,
                BackgroundJobRunStatus.ERROR,
              ],
            },
            createdAt: { lt: backgroundJobRunCutoff },
          },
        }),
    },
    {
      id: "audit-logs",
      label: "Audit logs",
      entity: "AuditLog",
      retentionDays: 730,
      cutoff: auditLogCutoff,
      count: () =>
        prisma.auditLog.count({ where: { createdAt: { lt: auditLogCutoff } } }),
      delete: () =>
        prisma.auditLog.deleteMany({
          where: { createdAt: { lt: auditLogCutoff } },
        }),
    },
  ];
}

export async function runOperationalDataRetention(
  options: OperationalRetentionOptions = {},
): Promise<OperationalRetentionRunResult> {
  const dryRun = options.dryRun ?? false;
  const trigger = options.trigger ?? "manual";

  if (options.recordJobRun === false) {
    return runOperationalDataRetentionCore({
      ...options,
      dryRun,
      trigger,
    });
  }

  return runWithBackgroundJob({
    actorId: options.actorId ?? null,
    dryRun,
    jobName: "operational-retention",
    jobType: "maintenance",
    metadata: safeJobJson({
      targetCount: retentionTargets(new Date()).length,
    }),
    trigger,
    run: () =>
      runOperationalDataRetentionCore({
        ...options,
        dryRun,
        trigger,
      }),
    complete: (result) => ({
      message: dryRun
        ? `Dry run matched ${result.totals.matched} operational row${
            result.totals.matched === 1 ? "" : "s"
          }.`
        : `Deleted ${result.totals.deleted} of ${
            result.totals.matched
          } matched operational row${result.totals.matched === 1 ? "" : "s"}.`,
      recordsRead: result.totals.matched,
      recordsWritten: result.totals.deleted,
      status: warningStatusWhen(dryRun && result.totals.matched > 0),
      summary: safeJobJson(result),
    }),
  });
}

async function runOperationalDataRetentionCore(
  options: OperationalRetentionOptions,
): Promise<OperationalRetentionRunResult> {
  const startedAt = new Date();
  const dryRun = options.dryRun ?? false;
  const trigger = options.trigger ?? "manual";
  const targets: OperationalRetentionTargetResult[] = [];

  for (const target of retentionTargets(startedAt)) {
    const matched = await target.count();
    const deleted = dryRun || matched === 0 ? 0 : (await target.delete()).count;

    targets.push({
      cutoff: target.cutoff.toISOString(),
      deleted,
      dryRun,
      entity: target.entity,
      id: target.id,
      label: target.label,
      matched,
      retentionDays: target.retentionDays,
    });
  }

  const finishedAt = new Date();
  const result: OperationalRetentionRunResult = {
    dryRun,
    finishedAt: finishedAt.toISOString(),
    startedAt: startedAt.toISOString(),
    targets,
    totals: {
      deleted: targets.reduce((total, target) => total + target.deleted, 0),
      matched: targets.reduce((total, target) => total + target.matched, 0),
    },
    trigger,
  };

  if (!dryRun) {
    await prisma.auditLog.create({
      data: {
        action: "maintenance.retention.run",
        actorId: options.actorId ?? null,
        entity: "OperationalRetention",
        entityId: startedAt.toISOString(),
        metadata: result,
      },
    });
  }

  return result;
}
