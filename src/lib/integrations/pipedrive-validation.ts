import "server-only";

import { prisma } from "@/lib/prisma";
import { pipedriveProvider } from "@/lib/integrations/pipedrive";
import { readPipedriveContactPullReadiness } from "@/lib/integrations/pipedrive-contact-sync";
import { readPipedriveLeadPullReadiness } from "@/lib/integrations/pipedrive-lead-sync";
import { planPipedriveWebhookRegistration } from "@/lib/integrations/pipedrive-webhook-registration";

type PipedriveValidationStatus = "ERROR" | "SUCCESS" | "WARNING";

export type PipedriveValidationSummaryOptions = {
  includeWebhookRegistration?: boolean;
  limit?: number | null;
};

export type PipedriveValidationSummary = {
  backgroundJobs: Array<{
    dryRun: boolean;
    finishedAt: string | null;
    jobName: string;
    message: string | null;
    recordsRead: number;
    recordsWritten: number;
    startedAt: string;
    status: string;
    trigger: string;
  }>;
  contactReadiness: SanitizedReadiness;
  externalRecordLinks: Array<{
    count: number;
    externalType: string;
    internalType: string;
  }>;
  generatedAt: string;
  leadReadiness: SanitizedReadiness;
  provider: typeof pipedriveProvider;
  pullOnly: true;
  status: PipedriveValidationStatus;
  syncLogs: Array<{
    finishedAt: string | null;
    message: string | null;
    recordsRead: number;
    recordsWritten: number;
    startedAt: string;
    status: string;
    syncType: string;
  }>;
  webhookActivity: {
    deliveryStatus: "ERROR" | "RECEIVED" | "AWAITING";
    errorCount: number;
    lastReceivedAt: string | null;
    lastProviderReceivedAt: string | null;
    providerEventCount: number;
    recent: Array<{
      action: string | null;
      entity: string | null;
      finishedAt: string | null;
      message: string | null;
      reason: string | null;
      recordsRead: number;
      recordsWritten: number;
      startedAt: string;
      status: string;
      syncType: string;
    }>;
    recentCount: number;
    selfTestCount: number;
    successCount: number;
    warningCount: number;
  };
  webhookRegistration: {
    desiredCount: number | null;
    existingEvents: string[];
    existingTargetCount: number | null;
    message: string | null;
    missingCount: number | null;
    missingEvents: string[];
    pipedriveWritesPerformed: number | null;
    pipedriveWritesRequired: number | null;
    receiverAuthConfigured: boolean | null;
    status: string;
    subscriptionUrl: string | null;
  } | null;
};

type ReadinessPayload = Record<string, unknown>;

type SanitizedReadiness = {
  connected: boolean;
  credentialSource: string | null;
  defaultLeadSource: string | null;
  hasContinuationCursor: boolean;
  lastFullDealSyncAt: string | null;
  lastFullDealSyncNextCursor: string | null;
  lastContactSyncAt: string | null;
  lastFullLeadSyncAt: string | null;
  lastFullLeadSyncNextStart: number | null;
  lastFullPersonSyncAt: string | null;
  lastFullPersonSyncNextCursor: string | null;
  lastLeadSyncAt: string | null;
  provider: typeof pipedriveProvider;
  pullOnly: true;
  status: string | null;
  updatedAt: string | null;
};

const defaultValidationLimit = 15;
const maxValidationLimit = 50;
const pipedriveWebhookSyncTypes = [
  "contact-import-webhook",
  "deal-import-webhook",
  "lead-import-webhook",
  "webhook",
  "webhook-receiver-test",
];

export async function readPipedriveValidationSummary({
  includeWebhookRegistration = true,
  limit,
}: PipedriveValidationSummaryOptions = {}): Promise<PipedriveValidationSummary> {
  const rowLimit = boundedLimit(limit);
  const [
    leadReadiness,
    contactReadiness,
    externalRecordLinks,
    syncLogs,
    webhookLogs,
    jobs,
  ] = await Promise.all([
    readPipedriveLeadPullReadiness(),
    readPipedriveContactPullReadiness(),
    prisma.externalRecordLink.groupBy({
      _count: { _all: true },
      by: ["externalType", "internalType"],
      where: { provider: pipedriveProvider },
    }),
    prisma.marketingIntegrationSyncLog.findMany({
      orderBy: { startedAt: "desc" },
      select: {
        finishedAt: true,
        message: true,
        recordsRead: true,
        recordsWritten: true,
        startedAt: true,
        status: true,
        syncType: true,
      },
      take: rowLimit,
      where: { provider: pipedriveProvider },
    }),
    prisma.marketingIntegrationSyncLog.findMany({
      orderBy: { startedAt: "desc" },
      select: {
        finishedAt: true,
        message: true,
        metadata: true,
        recordsRead: true,
        recordsWritten: true,
        startedAt: true,
        status: true,
        syncType: true,
      },
      take: rowLimit,
      where: {
        provider: pipedriveProvider,
        syncType: { in: pipedriveWebhookSyncTypes },
      },
    }),
    prisma.backgroundJobRun.findMany({
      orderBy: { startedAt: "desc" },
      select: {
        dryRun: true,
        finishedAt: true,
        jobName: true,
        message: true,
        recordsRead: true,
        recordsWritten: true,
        startedAt: true,
        status: true,
        trigger: true,
      },
      take: rowLimit,
      where: { jobName: { startsWith: "pipedrive." } },
    }),
  ]);
  const webhookRegistration = includeWebhookRegistration
    ? await safeWebhookRegistrationSummary()
    : null;

  return {
    backgroundJobs: jobs.map((job) => ({
      dryRun: job.dryRun,
      finishedAt: isoDate(job.finishedAt),
      jobName: job.jobName,
      message: job.message,
      recordsRead: job.recordsRead,
      recordsWritten: job.recordsWritten,
      startedAt: isoDate(job.startedAt) ?? new Date(0).toISOString(),
      status: job.status,
      trigger: job.trigger,
    })),
    contactReadiness: sanitizeReadiness(contactReadiness),
    externalRecordLinks: externalRecordLinks
      .map((row) => ({
        count: row._count._all,
        externalType: row.externalType,
        internalType: row.internalType,
      }))
      .sort((a, b) =>
        `${a.externalType}.${a.internalType}`.localeCompare(
          `${b.externalType}.${b.internalType}`,
        ),
      ),
    generatedAt: new Date().toISOString(),
    leadReadiness: sanitizeReadiness(leadReadiness),
    provider: pipedriveProvider,
    pullOnly: true,
    status: validationStatus({
      contactReadiness: sanitizeReadiness(contactReadiness),
      leadReadiness: sanitizeReadiness(leadReadiness),
      webhookRegistration,
    }),
    syncLogs: syncLogs.map((log) => ({
      finishedAt: isoDate(log.finishedAt),
      message: log.message,
      recordsRead: log.recordsRead,
      recordsWritten: log.recordsWritten,
      startedAt: isoDate(log.startedAt) ?? new Date(0).toISOString(),
      status: log.status,
      syncType: log.syncType,
    })),
    webhookActivity: sanitizedWebhookActivity(webhookLogs),
    webhookRegistration,
  };
}

async function safeWebhookRegistrationSummary() {
  try {
    const result = await planPipedriveWebhookRegistration();

    return {
      desiredCount: result.desiredWebhooks.length,
      existingEvents: result.existingTargetWebhooks.map(
        (webhook) => `${webhook.eventAction}.${webhook.eventObject}`,
      ),
      existingTargetCount: result.existingTargetWebhooks.length,
      message: result.message,
      missingCount: result.missingWebhooks.length,
      missingEvents: result.missingWebhooks.map(
        (webhook) => `${webhook.eventAction}.${webhook.eventObject}`,
      ),
      pipedriveWritesPerformed: result.pipedriveWritesPerformed,
      pipedriveWritesRequired: result.pipedriveWritesRequired,
      receiverAuthConfigured: result.receiverAuthConfigured,
      status: result.status,
      subscriptionUrl: result.subscriptionUrl,
    };
  } catch (error) {
    return {
      desiredCount: null,
      existingEvents: [],
      existingTargetCount: null,
      message:
        error instanceof Error
          ? error.message
          : "Pipedrive webhook registration check failed.",
      missingCount: null,
      missingEvents: [],
      pipedriveWritesPerformed: 0,
      pipedriveWritesRequired: null,
      receiverAuthConfigured: null,
      status: "ERROR",
      subscriptionUrl: null,
    };
  }
}

function sanitizeReadiness(value: ReadinessPayload): SanitizedReadiness {
  const lastFullDealSyncNextCursor = stringValue(
    value.lastFullDealSyncNextCursor,
  );
  const lastFullPersonSyncNextCursor = stringValue(
    value.lastFullPersonSyncNextCursor,
  );

  return {
    connected: value.connected === true,
    credentialSource: stringValue(value.credentialSource),
    defaultLeadSource: stringValue(value.defaultLeadSource),
    hasContinuationCursor:
      value.hasContinuationCursor === true ||
      Boolean(lastFullDealSyncNextCursor) ||
      typeof value.lastFullLeadSyncNextStart === "number" ||
      Boolean(lastFullPersonSyncNextCursor),
    lastContactSyncAt: stringValue(value.lastContactSyncAt),
    lastFullDealSyncAt: stringValue(value.lastFullDealSyncAt),
    lastFullDealSyncNextCursor,
    lastFullLeadSyncAt: stringValue(value.lastFullLeadSyncAt),
    lastFullLeadSyncNextStart:
      typeof value.lastFullLeadSyncNextStart === "number"
        ? value.lastFullLeadSyncNextStart
        : null,
    lastFullPersonSyncAt: stringValue(value.lastFullPersonSyncAt),
    lastFullPersonSyncNextCursor,
    lastLeadSyncAt: stringValue(value.lastLeadSyncAt),
    provider: pipedriveProvider,
    pullOnly: true,
    status: stringValue(value.status),
    updatedAt: stringValue(value.updatedAt),
  };
}

function sanitizedWebhookActivity(
  logs: Array<{
    finishedAt: Date | string | null;
    message: string | null;
    metadata: unknown;
    recordsRead: number;
    recordsWritten: number;
    startedAt: Date | string | null;
    status: string;
    syncType: string;
  }>,
): PipedriveValidationSummary["webhookActivity"] {
  const recent = logs.map((log) => {
    const metadata = objectValue(log.metadata);

    return {
      action: stringValue(metadata.action),
      entity: stringValue(metadata.entity),
      finishedAt: isoDate(log.finishedAt),
      message: log.message,
      reason: stringValue(metadata.reason),
      recordsRead: log.recordsRead,
      recordsWritten: log.recordsWritten,
      startedAt: isoDate(log.startedAt) ?? new Date(0).toISOString(),
      status: log.status,
      syncType: log.syncType,
    };
  });
  const providerEvents = recent.filter(
    (log) => log.syncType !== "webhook-receiver-test",
  );
  const selfTests = recent.filter(
    (log) => log.syncType === "webhook-receiver-test",
  );
  const providerErrorCount = providerEvents.filter(
    (log) => log.status === "ERROR",
  ).length;

  return {
    deliveryStatus: providerErrorCount
      ? "ERROR"
      : providerEvents.length
        ? "RECEIVED"
        : "AWAITING",
    errorCount: recent.filter((log) => log.status === "ERROR").length,
    lastReceivedAt: recent[0]?.startedAt ?? null,
    lastProviderReceivedAt: providerEvents[0]?.startedAt ?? null,
    providerEventCount: providerEvents.length,
    recent,
    recentCount: recent.length,
    selfTestCount: selfTests.length,
    successCount: recent.filter((log) => log.status === "SUCCESS").length,
    warningCount: recent.filter((log) => log.status === "WARNING").length,
  };
}

function validationStatus({
  contactReadiness,
  leadReadiness,
  webhookRegistration,
}: {
  contactReadiness: SanitizedReadiness;
  leadReadiness: SanitizedReadiness;
  webhookRegistration: PipedriveValidationSummary["webhookRegistration"];
}): PipedriveValidationStatus {
  if (
    webhookRegistration?.status === "ERROR" ||
    !contactReadiness.connected ||
    !leadReadiness.connected
  ) {
    return "ERROR";
  }

  if (
    contactReadiness.hasContinuationCursor ||
    leadReadiness.hasContinuationCursor ||
    (webhookRegistration?.missingCount ?? 0) > 0 ||
    webhookRegistration?.status === "WARNING"
  ) {
    return "WARNING";
  }

  return "SUCCESS";
}

function boundedLimit(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultValidationLimit;
  }

  return Math.max(1, Math.min(Math.trunc(value), maxValidationLimit));
}

function isoDate(value: Date | string | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();

  return value;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
