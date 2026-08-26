import "server-only";

import { BackgroundJobRunStatus, type Prisma } from "@prisma/client";
import {
  ensureSpruceZapierIntegrationConnection,
  spruceProvider,
} from "@/lib/integrations/spruce-zapier";
import {
  importSpruceJobCreatedPayload,
  type SpruceJobImportResult,
} from "@/lib/integrations/spruce-zapier-import";
import {
  completeBackgroundJobRun,
  failBackgroundJobRun,
  startBackgroundJobRun,
} from "@/lib/maintenance/background-jobs";
import { prisma } from "@/lib/prisma";

type SpruceWebhookStatus = "SUCCESS" | "WARNING" | "ERROR";
type SpruceWebhookAction =
  | "accept"
  | "change"
  | "create"
  | "download"
  | "open"
  | "send"
  | "test"
  | "unknown";
type SpruceWebhookEntity =
  | "estimate"
  | "handover_pack"
  | "job"
  | "proposal"
  | "receiver"
  | "report"
  | "unknown";

const spruceWebhookJobName = "spruce.webhook";

export type SpruceWebhookEvent = {
  action: SpruceWebhookAction;
  entity: SpruceWebhookEntity;
  entityId: string | null;
  eventId: string | null;
  eventName: string | null;
  payloadShape: Prisma.InputJsonObject;
  timestamp: string | null;
};

export type SpruceWebhookResult = {
  action: SpruceWebhookAction;
  entity: SpruceWebhookEntity;
  entityId: string | null;
  message: string;
  recordsRead: number;
  recordsWritten: number;
  status: SpruceWebhookStatus;
  syncType: string;
  warningCount: number;
};

export async function processSpruceZapierWebhook(
  payload: unknown,
): Promise<SpruceWebhookResult> {
  const event = parseSpruceZapierWebhookEvent(payload);
  const jobRun = await startBackgroundJobRun({
    dryRun: false,
    jobName: spruceWebhookJobName,
    jobType: "integration-webhook",
    metadata: webhookMetadata(event),
    trigger: "webhook",
  });

  try {
    const result = await writeSpruceWebhookResult(event, payload);

    await completeBackgroundJobRun(jobRun, {
      message: result.message,
      metadata: webhookMetadata(event),
      recordsRead: result.recordsRead,
      recordsWritten: result.recordsWritten,
      status: backgroundStatus(result.status),
      summary: {
        action: result.action,
        entity: result.entity,
        entityId: result.entityId,
        syncType: result.syncType,
        warningCount: result.warningCount,
      },
    });

    return result;
  } catch (error) {
    await failBackgroundJobRun(jobRun, {
      error,
      message: "Spruce/Zapier webhook failed before sync history could be written.",
      metadata: webhookMetadata(event),
    });

    throw error;
  }
}

export function parseSpruceZapierWebhookEvent(
  payload: unknown,
): SpruceWebhookEvent {
  const body = objectValue(payload);
  const data = objectValue(body.data);
  const job = objectValue(body.job ?? data.job);
  const proposal = objectValue(body.proposal ?? data.proposal);
  const estimate = objectValue(body.estimate ?? data.estimate);
  const report = objectValue(body.report ?? data.report);
  const eventName =
    textValue(body.event) ??
    textValue(body.event_type) ??
    textValue(body.eventType) ??
    textValue(body.trigger) ??
    textValue(body.zapier_trigger) ??
    textValue(body.zapierTrigger) ??
    textValue(data.event) ??
    textValue(data.event_type) ??
    textValue(data.eventType);

  return {
    action: normalizeSpruceAction(eventName, body),
    entity: normalizeSpruceEntity(eventName, body),
    entityId:
      textValue(body.job_id) ??
      textValue(body.jobId) ??
      textValue(data.job_id) ??
      textValue(data.jobId) ??
      textValue(job.id) ??
      textValue(body.proposal_id) ??
      textValue(body.proposalId) ??
      textValue(proposal.id) ??
      textValue(body.estimate_id) ??
      textValue(body.estimateId) ??
      textValue(estimate.id) ??
      textValue(body.report_id) ??
      textValue(body.reportId) ??
      textValue(report.id) ??
      textValue(body.id) ??
      textValue(data.id),
    eventId:
      textValue(body.event_id) ??
      textValue(body.eventId) ??
      textValue(body.zap_id) ??
      textValue(body.zapId) ??
      textValue(data.event_id) ??
      textValue(data.eventId),
    eventName,
    payloadShape: payloadShape(body),
    timestamp:
      textValue(body.timestamp) ??
      textValue(body.created_at) ??
      textValue(body.createdAt) ??
      textValue(body.updated_at) ??
      textValue(body.updatedAt) ??
      textValue(data.timestamp),
  };
}

async function writeSpruceWebhookResult(
  event: SpruceWebhookEvent,
  payload: unknown,
): Promise<SpruceWebhookResult> {
  const connection = await ensureSpruceZapierIntegrationConnection();
  const startedAt = new Date();
  const metadata = webhookMetadata(event);

  if (event.action === "test" && event.entity === "receiver") {
    return writeWebhookLog({
      connectionId: connection.id,
      finishedAt: new Date(),
      message:
        "Spruce/Zapier webhook receiver self-test completed. No Spruce records were read or CRM records written.",
      metadata: {
        ...metadata,
        reason: "receiver-self-test",
      },
      recordsRead: 0,
      recordsWritten: 0,
      startedAt,
      status: "SUCCESS",
      syncType: "webhook-receiver-test",
      warningCount: 0,
    });
  }

  if (event.action === "create" && event.entity === "job") {
    const importResult = await importSpruceJobCreatedPayload({
      integrationId: connection.id,
      now: startedAt,
      payload,
    });
    const status =
      importResult.status === "skipped" || importResult.warnings.length
        ? "WARNING"
        : "SUCCESS";

    return writeWebhookLog({
      connectionId: connection.id,
      finishedAt: new Date(),
      message: spruceJobImportMessage(importResult),
      metadata: {
        ...metadata,
        crmWritesEnabled: true,
        importResult: spruceJobImportMetadata(importResult),
        outboundWriteBackDisabled: true,
      },
      recordsRead: 1,
      recordsWritten: importResult.recordsWritten,
      startedAt,
      status,
      syncType: "job-created-import",
      warningCount: importResult.warnings.length,
    });
  }

  return writeWebhookLog({
    connectionId: connection.id,
    finishedAt: new Date(),
    message:
      "Spruce/Zapier webhook captured. CRM mapping is enabled for job-created events only, so no CRM records were written for this event.",
    metadata: {
      ...metadata,
      crmWritesEnabled: false,
      outboundWriteBackDisabled: true,
      reason: "unsupported-event",
    },
    recordsRead: 1,
    recordsWritten: 0,
    startedAt,
    status: "WARNING",
    syncType: "webhook-captured",
    warningCount: 1,
  });
}

async function writeWebhookLog({
  connectionId,
  finishedAt,
  message,
  metadata,
  recordsRead,
  recordsWritten,
  startedAt,
  status,
  syncType,
  warningCount,
}: {
  connectionId: string;
  finishedAt: Date;
  message: string;
  metadata: Prisma.InputJsonObject;
  recordsRead: number;
  recordsWritten: number;
  startedAt: Date;
  status: SpruceWebhookStatus;
  syncType: string;
  warningCount: number;
}): Promise<SpruceWebhookResult> {
  await prisma.marketingIntegrationSyncLog.create({
    data: {
      finishedAt,
      integrationId: connectionId,
      message,
      metadata,
      provider: spruceProvider,
      recordsRead,
      recordsWritten,
      startedAt,
      status,
      syncType,
    },
  });

  return {
    action: metadata.action as SpruceWebhookAction,
    entity: metadata.entity as SpruceWebhookEntity,
    entityId:
      typeof metadata.entityId === "string" ? metadata.entityId : null,
    message,
    recordsRead,
    recordsWritten,
    status,
    syncType,
    warningCount,
  };
}

function webhookMetadata(event: SpruceWebhookEvent) {
  return {
    action: event.action,
    entity: event.entity,
    entityId: event.entityId,
    eventId: event.eventId,
    eventName: event.eventName,
    inboundOnly: true,
    payloadShape: event.payloadShape,
    timestamp: event.timestamp,
  } satisfies Prisma.InputJsonObject;
}

function spruceJobImportMessage(result: SpruceJobImportResult) {
  if (result.status === "created") {
    return `Spruce/Zapier job import created CRM sale "${result.title ?? "Untitled"}" from Spruce job ${result.externalJobId ?? "unknown"}.`;
  }

  if (result.status === "linked_existing") {
    return `Spruce/Zapier job import updated existing CRM sale "${result.title ?? "Untitled"}" for Spruce job ${result.externalJobId ?? "unknown"}.`;
  }

  return `Spruce/Zapier job import skipped: ${result.warnings.join(" ") || "No writable CRM mapping was available."}`;
}

function spruceJobImportMetadata(result: SpruceJobImportResult) {
  return {
    contactId: result.contactId,
    createdContact: result.created.contact,
    createdOpportunity: result.created.opportunity,
    externalJobId: result.externalJobId,
    opportunityId: result.opportunityId,
    recordsWritten: result.recordsWritten,
    status: result.status,
    title: result.title,
    updatedContact: result.updated.contact,
    updatedNote: result.updated.note,
    updatedOpportunity: result.updated.opportunity,
    warnings: result.warnings,
  } satisfies Prisma.InputJsonObject;
}

function payloadShape(body: Record<string, unknown>) {
  const nested: Record<string, string[]> = {};

  for (const key of [
    "customer",
    "data",
    "estimate",
    "handover_pack",
    "job",
    "lead",
    "proposal",
    "report",
  ]) {
    const value = objectValue(body[key]);
    const keys = Object.keys(value).sort().slice(0, 40);
    if (keys.length) nested[key] = keys;
  }

  return {
    nestedKeys: nested,
    topLevelKeys: Object.keys(body).sort().slice(0, 60),
  } satisfies Prisma.InputJsonObject;
}

function backgroundStatus(status: SpruceWebhookStatus) {
  if (status === "ERROR") return BackgroundJobRunStatus.ERROR;
  if (status === "WARNING") return BackgroundJobRunStatus.WARNING;

  return BackgroundJobRunStatus.SUCCESS;
}

function normalizeSpruceAction(
  eventName: string | null,
  body: Record<string, unknown>,
): SpruceWebhookAction {
  const normalized = [
    eventName,
    textValue(body.action),
    textValue(body.status),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[_-]+/g, " ");

  if (!normalized) return "unknown";
  if (normalized.includes("test") || normalized.includes("receiver")) {
    return "test";
  }
  if (normalized.includes("download")) return "download";
  if (normalized.includes("accepted")) return "accept";
  if (normalized.includes("opened")) return "open";
  if (normalized.includes("sent")) return "send";
  if (normalized.includes("status changed") || normalized.includes("updated")) {
    return "change";
  }
  if (normalized.includes("created")) return "create";

  return "unknown";
}

function normalizeSpruceEntity(
  eventName: string | null,
  body: Record<string, unknown>,
): SpruceWebhookEntity {
  const normalized = [
    eventName,
    textValue(body.entity),
    textValue(body.object),
    textValue(body.resource),
    textValue(body.type),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[_-]+/g, " ");

  if (!normalized) return "unknown";
  if (normalized.includes("test") || normalized.includes("receiver")) {
    return "receiver";
  }
  if (normalized.includes("handover")) return "handover_pack";
  if (normalized.includes("proposal")) return "proposal";
  if (normalized.includes("estimate")) return "estimate";
  if (normalized.includes("report")) return "report";
  if (normalized.includes("job")) return "job";

  return "unknown";
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }

  return typeof value === "string" && value.trim() ? value.trim() : null;
}
