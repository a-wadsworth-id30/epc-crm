import "server-only";

import { BackgroundJobRunStatus, type Prisma } from "@prisma/client";
import {
  getPipedriveReadOnlyClient,
  pipedriveProvider,
} from "@/lib/integrations/pipedrive";
import {
  importPipedriveLeadIds,
  importPipedrivePersonIds,
  pipedriveLeadImportMetadataRows,
  pipedrivePersonImportMetadataRows,
} from "@/lib/integrations/pipedrive-import";
import { ensurePipedriveIntegrationConnection } from "@/lib/integrations/pipedrive-lead-sync";
import {
  completeBackgroundJobRun,
  failBackgroundJobRun,
  startBackgroundJobRun,
} from "@/lib/maintenance/background-jobs";
import { prisma } from "@/lib/prisma";

type PipedriveWebhookStatus = "SUCCESS" | "WARNING" | "ERROR";
type PipedriveWebhookAction =
  | "change"
  | "create"
  | "delete"
  | "test"
  | "unknown";
type PipedriveWebhookEntity =
  | "deal"
  | "lead"
  | "organization"
  | "person"
  | "receiver"
  | "unknown";

const pipedriveWebhookJobName = "pipedrive.webhook";

export type PipedriveWebhookEvent = {
  action: PipedriveWebhookAction;
  attempt: number | null;
  entity: PipedriveWebhookEntity;
  entityId: string | null;
  eventId: string | null;
  host: string | null;
  timestamp: string | null;
  webhookId: string | null;
  version: string | null;
};

export type PipedriveWebhookResult = {
  action: PipedriveWebhookAction;
  entity: PipedriveWebhookEntity;
  entityId: string | null;
  message: string;
  recordsRead: number;
  recordsWritten: number;
  status: PipedriveWebhookStatus;
  syncType: string;
  warningCount: number;
};

export async function processPipedriveWebhook(
  payload: unknown,
): Promise<PipedriveWebhookResult> {
  const event = parsePipedriveWebhookEvent(payload);
  const jobRun = await startBackgroundJobRun({
    dryRun: false,
    jobName: pipedriveWebhookJobName,
    jobType: "integration-webhook",
    metadata: webhookMetadata(event),
    trigger: "webhook",
  });

  try {
    const result = await writePipedriveWebhookResult(event);

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
      message: "Pipedrive webhook failed before sync history could be written.",
      metadata: webhookMetadata(event),
    });

    throw error;
  }
}

export function parsePipedriveWebhookEvent(
  payload: unknown,
): PipedriveWebhookEvent {
  const body = objectValue(payload);
  const meta = objectValue(body.meta);
  const data = objectValue(body.data ?? body.current);
  const previous = objectValue(body.previous);
  const eventName = textValue(body.event);
  const eventParts = eventName?.split(".") ?? [];
  const rawAction =
    textValue(meta.action) ?? textValue(eventParts[0]) ?? "unknown";
  const rawEntity =
    textValue(meta.entity) ??
    textValue(meta.object) ??
    textValue(eventParts[1]) ??
    "unknown";
  const entityId =
    textValue(meta.entity_id) ??
    textValue(data.id) ??
    textValue(meta.id) ??
    textValue(previous.id);

  return {
    action: normalizeWebhookAction(rawAction),
    attempt: numberValue(meta.attempt ?? body.retry),
    entity: normalizeWebhookEntity(rawEntity),
    entityId,
    eventId:
      textValue(meta.correlation_id) ??
      textValue(meta.event_id) ??
      textValue(meta.id),
    host: textValue(meta.host),
    timestamp: textValue(meta.timestamp),
    version: textValue(meta.version ?? meta.v ?? body.v),
    webhookId: textValue(meta.webhook_id),
  };
}

async function writePipedriveWebhookResult(
  event: PipedriveWebhookEvent,
): Promise<PipedriveWebhookResult> {
  const connection = await ensurePipedriveIntegrationConnection();
  const startedAt = new Date();
  const metadata = webhookMetadata(event);

  if (event.action === "test" && event.entity === "receiver") {
    return writeWebhookLog({
      connectionId: connection.id,
      finishedAt: new Date(),
      message:
        "Pipedrive webhook receiver self-test completed. No Pipedrive records were read or written.",
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

  if (event.action === "unknown" || event.entity === "unknown") {
    return writeWebhookLog({
      connectionId: connection.id,
      finishedAt: new Date(),
      message: "Pipedrive webhook ignored because its action or entity was not supported.",
      metadata: {
        ...metadata,
        reason: "unsupported-event",
      },
      recordsRead: 0,
      recordsWritten: 0,
      startedAt,
      status: "WARNING",
      syncType: "webhook",
      warningCount: 1,
    });
  }

  if (event.entity === "organization") {
    return writeWebhookLog({
      connectionId: connection.id,
      finishedAt: new Date(),
      message:
        "Pipedrive organization webhook recorded. CRM organization updates are applied when linked people or leads are pulled.",
      metadata: {
        ...metadata,
        reason: "organization-deferred",
      },
      recordsRead: 0,
      recordsWritten: 0,
      startedAt,
      status: "WARNING",
      syncType: "webhook",
      warningCount: 1,
    });
  }

  if (event.action === "delete") {
    return writeWebhookLog({
      connectionId: connection.id,
      finishedAt: new Date(),
      message:
        "Pipedrive delete webhook recorded. Pull-only CRM policy does not delete CRM records automatically.",
      metadata: {
        ...metadata,
        reason: "delete-ignored",
      },
      recordsRead: 0,
      recordsWritten: 0,
      startedAt,
      status: "WARNING",
      syncType: "webhook",
      warningCount: 1,
    });
  }

  if (!event.entityId) {
    return writeWebhookLog({
      connectionId: connection.id,
      finishedAt: new Date(),
      message:
        "Pipedrive webhook ignored because it did not include an entity ID.",
      metadata: {
        ...metadata,
        reason: "missing-entity-id",
      },
      recordsRead: 0,
      recordsWritten: 0,
      startedAt,
      status: "WARNING",
      syncType: "webhook",
      warningCount: 1,
    });
  }

  if (event.entity === "deal") {
    return writeWebhookLog({
      connectionId: connection.id,
      finishedAt: new Date(),
      message:
        "Pipedrive deal webhook recorded. CRM imports only Pipedrive leads into the sales list.",
      metadata: {
        ...metadata,
        reason: "deal-import-disabled",
      },
      recordsRead: 0,
      recordsWritten: 0,
      startedAt,
      status: "WARNING",
      syncType: "webhook",
      warningCount: 1,
    });
  }

  const client = await getPipedriveReadOnlyClient();

  if (!client) {
    return writeWebhookLog({
      connectionId: connection.id,
      finishedAt: new Date(),
      message:
        "Pipedrive webhook could not import because API credentials are missing.",
      metadata: {
        ...metadata,
        reason: "missing-credentials",
      },
      recordsRead: 0,
      recordsWritten: 0,
      startedAt,
      status: "WARNING",
      syncType: "webhook",
      warningCount: 1,
    });
  }

  if (event.entity === "lead") {
    const result = await importPipedriveLeadIds({
      client,
      leadIds: [event.entityId],
    });
    const recordsRead = result.status === "ok" ? result.requested : 0;
    const recordsWritten = result.status === "ok" ? result.created : 0;
    const linkedExisting = result.status === "ok" ? result.linkedExisting : 0;
    const skipped = result.skipped;
    const warningCount =
      result.status === "ok"
        ? result.results.reduce(
            (count, importResult) => count + importResult.warnings.length,
            0,
          )
        : 1;
    const status =
      warningCount > 0 || skipped > 0 || recordsRead === 0
        ? "WARNING"
        : "SUCCESS";
    const message = `Pipedrive webhook lead import: ${recordsWritten} created, ${linkedExisting} already linked, ${skipped} skipped from ${recordsRead} lead${recordsRead === 1 ? "" : "s"}.`;

    return writeWebhookLog({
      connectionId: connection.id,
      finishedAt: new Date(),
      message,
      metadata: {
        ...metadata,
        created: recordsWritten,
        imports:
          result.status === "ok"
            ? pipedriveLeadImportMetadataRows(result.results)
            : [],
        linkedExisting,
        skipped,
        warningCount,
      },
      recordsRead,
      recordsWritten,
      startedAt,
      status,
      syncType: "lead-import-webhook",
      warningCount,
    });
  }

  const personId = Number(event.entityId);

  if (!Number.isInteger(personId) || personId <= 0) {
    return writeWebhookLog({
      connectionId: connection.id,
      finishedAt: new Date(),
      message:
        "Pipedrive person webhook ignored because the person ID was invalid.",
      metadata: {
        ...metadata,
        reason: "invalid-person-id",
      },
      recordsRead: 0,
      recordsWritten: 0,
      startedAt,
      status: "WARNING",
      syncType: "contact-import-webhook",
      warningCount: 1,
    });
  }

  const result = await importPipedrivePersonIds({
    client,
    personIds: [personId],
  });
  const recordsRead = result.status === "ok" ? result.requested : 0;
  const recordsWritten = result.status === "ok" ? result.created : 0;
  const linkedExisting = result.status === "ok" ? result.linkedExisting : 0;
  const skipped = result.skipped;
  const warningCount =
    result.status === "ok"
      ? result.results.reduce(
          (count, importResult) => count + importResult.warnings.length,
          0,
        )
      : 1;
  const status =
    warningCount > 0 || skipped > 0 || recordsRead === 0
      ? "WARNING"
      : "SUCCESS";
  const message = `Pipedrive webhook contact import: ${recordsWritten} created, ${linkedExisting} already linked, ${skipped} skipped from ${recordsRead} person${recordsRead === 1 ? "" : "s"}.`;

  return writeWebhookLog({
    connectionId: connection.id,
    finishedAt: new Date(),
    message,
    metadata: {
      ...metadata,
      created: recordsWritten,
      imports:
        result.status === "ok"
          ? pipedrivePersonImportMetadataRows(result.results)
          : [],
      linkedExisting,
      skipped,
      warningCount,
    },
    recordsRead,
    recordsWritten,
    startedAt,
    status,
    syncType: "contact-import-webhook",
    warningCount,
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
  status: PipedriveWebhookStatus;
  syncType: string;
  warningCount: number;
}): Promise<PipedriveWebhookResult> {
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

  return {
    action: metadata.action as PipedriveWebhookAction,
    entity: metadata.entity as PipedriveWebhookEntity,
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

function webhookMetadata(event: PipedriveWebhookEvent) {
  return {
    action: event.action,
    attempt: event.attempt,
    entity: event.entity,
    entityId: event.entityId,
    eventId: event.eventId,
    host: event.host,
    pullOnly: true,
    timestamp: event.timestamp,
    version: event.version,
    webhookId: event.webhookId,
  } satisfies Prisma.InputJsonObject;
}

function backgroundStatus(status: PipedriveWebhookStatus) {
  if (status === "ERROR") return BackgroundJobRunStatus.ERROR;
  if (status === "WARNING") return BackgroundJobRunStatus.WARNING;

  return BackgroundJobRunStatus.SUCCESS;
}

function normalizeWebhookAction(value: string): PipedriveWebhookAction {
  const normalized = value.trim().toLowerCase();

  if (["ping", "test"].includes(normalized)) return "test";

  if (["add", "added", "create", "created"].includes(normalized)) {
    return "create";
  }

  if (
    ["change", "changed", "merge", "merged", "update", "updated"].includes(
      normalized,
    )
  ) {
    return "change";
  }

  if (["delete", "deleted"].includes(normalized)) return "delete";

  return "unknown";
}

function normalizeWebhookEntity(value: string): PipedriveWebhookEntity {
  const normalized = value.trim().toLowerCase();

  if (["deal", "deals"].includes(normalized)) return "deal";
  if (["lead", "leads"].includes(normalized)) return "lead";
  if (["organization", "organizations", "org"].includes(normalized)) {
    return "organization";
  }
  if (["person", "persons", "people"].includes(normalized)) return "person";
  if (["receiver", "webhook-receiver"].includes(normalized)) {
    return "receiver";
  }

  return "unknown";
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function textValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }

  return typeof value === "string" && value.trim() ? value.trim() : null;
}
