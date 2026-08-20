import assert from "node:assert/strict";
import Module from "node:module";
import { before, beforeEach, describe, it } from "node:test";

type ModuleWithLoad = typeof Module & {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
};

type PipedriveLeadSyncModule = typeof import("../src/lib/integrations/pipedrive-lead-sync");

const moduleWithLoad = Module as ModuleWithLoad;

let pipedriveLeadSync: PipedriveLeadSyncModule;
let client: {
  defaultLeadSource: string;
  lastFullLeadSyncAt: string | null;
  lastFullLeadSyncNextStart: number | null;
} | null;
let connectionConfig: Record<string, unknown>;
let importPagesArgs: unknown;
let importPagesResult: Record<string, unknown>;
let completedJob: unknown;
let startedJob: unknown;
let transactionWrites: unknown[];

before(async () => {
  const originalLoad = moduleWithLoad._load;

  moduleWithLoad._load = function loadWithPipedriveLeadSyncStubs(
    this: unknown,
    request: string,
    parent: unknown,
    isMain: boolean,
  ) {
    if (request === "server-only") {
      return {};
    }

    if (request === "@prisma/client") {
      return {
        BackgroundJobRunStatus: {
          ERROR: "ERROR",
          SUCCESS: "SUCCESS",
          WARNING: "WARNING",
        },
      };
    }

    if (request === "@/lib/integrations/pipedrive") {
      return {
        defaultPipedriveApiBaseUrl: "https://api.pipedrive.com/v1",
        defaultPipedriveLeadSource: "Pipedrive",
        getPipedriveReadOnlyClient: async () => client,
        hasPipedriveEnvironmentConfig: () => false,
        pipedriveProvider: "pipedrive",
        pipedriveStoredConfigSchema: {
          safeParse: (value: unknown) => ({
            data: value,
            success: true,
          }),
        },
      };
    }

    if (request === "@/lib/integrations/pipedrive-import") {
      return {
        importPipedriveLeadPages: async (args: unknown) => {
          importPagesArgs = args;
          return importPagesResult;
        },
        pipedriveLeadImportMetadataRows: () => [
          {
            externalLeadId: "lead-1",
            status: "created",
            warningCount: 0,
            warnings: [],
          },
        ],
      };
    }

    if (request === "@/lib/maintenance/background-jobs") {
      return {
        completeBackgroundJobRun: async (
          handle: unknown,
          completion: unknown,
        ) => {
          completedJob = { completion, handle };
        },
        failBackgroundJobRun: async () => {},
        startBackgroundJobRun: async (input: unknown) => {
          startedJob = input;
          return {
            id: "job-1",
            startedAt: new Date("2026-08-20T10:00:00.000Z"),
          };
        },
      };
    }

    if (request === "@/lib/prisma") {
      return {
        prisma: {
          $transaction: async (writes: unknown[]) => {
            transactionWrites = writes;
            return writes;
          },
          integrationConnection: {
            findUnique: async () => ({
              config: connectionConfig,
              id: "integration-1",
              status: "CONNECTED",
              updatedAt: new Date("2026-08-20T09:00:00.000Z"),
            }),
            update: (args: unknown) => ({
              args,
              type: "integration.update",
            }),
            upsert: async () => ({
              config: connectionConfig,
              id: "integration-1",
            }),
          },
          marketingIntegrationSyncLog: {
            create: (args: unknown) => ({
              args,
              type: "sync.create",
            }),
          },
        },
      };
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  pipedriveLeadSync = await import("../src/lib/integrations/pipedrive-lead-sync");
});

beforeEach(() => {
  client = {
    defaultLeadSource: "Pipedrive",
    lastFullLeadSyncAt: "2026-08-20T08:00:00.000Z",
    lastFullLeadSyncNextStart: null,
  };
  connectionConfig = {
    apiBaseUrl: "https://api.pipedrive.com/v1",
    defaultLeadSource: "Pipedrive",
    lastFullLeadSyncAt: "2026-08-20T08:00:00.000Z",
    lastLeadSyncAt: "2026-08-20T08:05:00.000Z",
  };
  importPagesArgs = null;
  importPagesResult = {
    created: 1,
    linkedExisting: 0,
    maxPages: 5,
    moreAvailable: true,
    nextStart: 50,
    pagesRead: 5,
    recordsRead: 2,
    results: [
      {
        warnings: [],
      },
    ],
    skipped: 0,
    status: "ok",
  };
  completedJob = null;
  startedJob = null;
  transactionWrites = [];
});

describe("Pipedrive scheduled lead sync", () => {
  it("saves a pagination continuation without advancing the full cursor", async () => {
    const result = await pipedriveLeadSync.runPipedriveLeadPull({
      actorId: "user-1",
      trigger: "manual",
    });

    assert.equal(result.status, "WARNING");
    assert.equal(result.moreAvailable, true);
    assert.deepEqual(
      (importPagesArgs as { params?: unknown }).params,
      {
        limit: 50,
        start: null,
        updatedSince: "2026-08-20T08:00:00.000Z",
      },
    );

    const updateWrite = transactionWrites.find(
      (write) =>
        (write as { type?: string }).type === "integration.update",
    ) as { args: { data: { config: Record<string, unknown> } } };

    assert.equal(
      updateWrite.args.data.config.lastFullLeadSyncAt,
      "2026-08-20T08:00:00.000Z",
    );
    assert.equal(updateWrite.args.data.config.lastFullLeadSyncNextStart, 50);
    assert.equal(typeof updateWrite.args.data.config.lastLeadSyncAt, "string");
  });

  it("records compact background job history for scheduled pulls", async () => {
    importPagesResult = {
      ...importPagesResult,
      moreAvailable: false,
      nextStart: null,
      pagesRead: 1,
      recordsRead: 1,
    };
    client = {
      defaultLeadSource: "Pipedrive",
      lastFullLeadSyncAt: "2026-08-20T08:00:00.000Z",
      lastFullLeadSyncNextStart: 50,
    };

    const result = await pipedriveLeadSync.runPipedriveLeadPull({
      recordBackgroundJob: true,
      trigger: "scheduled",
    });

    assert.equal(result.status, "SUCCESS");
    assert.equal(
      (startedJob as { jobName?: string; trigger?: string }).jobName,
      "pipedrive.lead_import",
    );
    assert.equal(
      (startedJob as { jobName?: string; trigger?: string }).trigger,
      "scheduled",
    );
    assert.equal(
      (
        completedJob as {
          completion?: { status?: string; summary?: { mode?: string } };
        }
      ).completion?.status,
      "SUCCESS",
    );
    assert.equal(
      (
        completedJob as {
          completion?: { status?: string; summary?: { mode?: string } };
        }
      ).completion?.summary?.mode,
      "continuation",
    );
  });
});
