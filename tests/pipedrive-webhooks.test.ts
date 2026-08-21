import assert from "node:assert/strict";
import Module from "node:module";
import { before, beforeEach, describe, it } from "node:test";

type ModuleWithLoad = typeof Module & {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
};

type PipedriveWebhooksModule =
  typeof import("../src/lib/integrations/pipedrive-webhooks");

type SyncLogWrite = {
  data: {
    metadata: Record<string, unknown>;
    recordsRead: number;
    recordsWritten: number;
    status: string;
    syncType: string;
  };
};

const moduleWithLoad = Module as ModuleWithLoad;

let pipedriveWebhooks: PipedriveWebhooksModule;
let completedJobs: Array<{
  result: {
    recordsRead: number;
    recordsWritten: number;
    status: unknown;
    summary: Record<string, unknown>;
  };
}>;
let leadImportCalls: number;
let personImportCalls: number;
let readClientCalls: number;
let syncLogWrites: SyncLogWrite[];

before(async () => {
  const originalLoad = moduleWithLoad._load;

  moduleWithLoad._load = function loadWithPipedriveWebhookStubs(
    this: unknown,
    request: string,
    parent: unknown,
    isMain: boolean,
  ) {
    if (request === "server-only") {
      return {};
    }

    if (request === "@/lib/integrations/pipedrive") {
      return {
        getPipedriveReadOnlyClient: async () => {
          readClientCalls += 1;
          return null;
        },
        pipedriveProvider: "pipedrive",
      };
    }

    if (request === "@/lib/integrations/pipedrive-import") {
      return {
        importPipedriveLeadIds: async () => {
          leadImportCalls += 1;
          return { skipped: 0, status: "ok" };
        },
        importPipedrivePersonIds: async () => {
          personImportCalls += 1;
          return { skipped: 0, status: "ok" };
        },
        pipedriveLeadImportMetadataRows: () => [],
        pipedrivePersonImportMetadataRows: () => [],
      };
    }

    if (request === "@/lib/integrations/pipedrive-lead-sync") {
      return {
        ensurePipedriveIntegrationConnection: async () => ({
          id: "integration-1",
        }),
      };
    }

    if (request === "@/lib/maintenance/background-jobs") {
      return {
        completeBackgroundJobRun: async (
          _jobRun: unknown,
          result: {
            recordsRead: number;
            recordsWritten: number;
            status: unknown;
            summary: Record<string, unknown>;
          },
        ) => {
          completedJobs.push({ result });
        },
        failBackgroundJobRun: async () => {
          throw new Error("failBackgroundJobRun should not be called.");
        },
        startBackgroundJobRun: async () => ({ id: "job-1" }),
      };
    }

    if (request === "@/lib/prisma") {
      return {
        prisma: {
          marketingIntegrationSyncLog: {
            create: async (write: SyncLogWrite) => {
              syncLogWrites.push(write);
              return { id: "sync-log-1" };
            },
          },
        },
      };
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    pipedriveWebhooks = await import(
      "../src/lib/integrations/pipedrive-webhooks"
    );
  } finally {
    moduleWithLoad._load = originalLoad;
  }
});

beforeEach(() => {
  completedJobs = [];
  leadImportCalls = 0;
  personImportCalls = 0;
  readClientCalls = 0;
  syncLogWrites = [];
});

describe("Pipedrive webhook receiver self-test", () => {
  it("records a successful no-op receiver test without reading Pipedrive", async () => {
    const result = await pipedriveWebhooks.processPipedriveWebhook({
      event: "test.receiver",
      meta: {
        action: "test",
        entity: "receiver",
        event_id: "self-test-1",
        timestamp: "2026-08-21T12:00:00.000Z",
        version: "crm-self-test",
      },
    });

    assert.equal(result.status, "SUCCESS");
    assert.equal(result.syncType, "webhook-receiver-test");
    assert.equal(result.recordsRead, 0);
    assert.equal(result.recordsWritten, 0);
    assert.equal(readClientCalls, 0);
    assert.equal(leadImportCalls, 0);
    assert.equal(personImportCalls, 0);
    assert.equal(syncLogWrites.length, 1);
    assert.equal(syncLogWrites[0]!.data.syncType, "webhook-receiver-test");
    assert.equal(syncLogWrites[0]!.data.status, "SUCCESS");
    assert.equal(syncLogWrites[0]!.data.metadata.action, "test");
    assert.equal(syncLogWrites[0]!.data.metadata.entity, "receiver");
    assert.equal(
      syncLogWrites[0]!.data.metadata.reason,
      "receiver-self-test",
    );
    assert.equal(completedJobs.length, 1);
    assert.equal(completedJobs[0]!.result.status, "SUCCESS");
    assert.deepEqual(completedJobs[0]!.result.summary, {
      action: "test",
      entity: "receiver",
      entityId: null,
      syncType: "webhook-receiver-test",
      warningCount: 0,
    });
  });
});
