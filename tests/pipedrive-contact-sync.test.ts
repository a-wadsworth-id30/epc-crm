import assert from "node:assert/strict";
import Module from "node:module";
import { before, beforeEach, describe, it } from "node:test";

type ModuleWithLoad = typeof Module & {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
};

type PipedriveContactSyncModule =
  typeof import("../src/lib/integrations/pipedrive-contact-sync");

const moduleWithLoad = Module as ModuleWithLoad;

let pipedriveContactSync: PipedriveContactSyncModule;
let client: {
  defaultLeadSource: string;
  lastFullPersonSyncAt: string | null;
  lastFullPersonSyncNextCursor: string | null;
} | null;
let connectionConfig: Record<string, unknown>;
let importPagesArgs: unknown;
let importPagesResult: Record<string, unknown>;
let runningJobRun: { id: string; startedAt: Date; trigger: string } | null;
let completedJob: unknown;
let startedJob: unknown;
let syncCreates: unknown[];
let transactionWrites: unknown[];

before(async () => {
  const originalLoad = moduleWithLoad._load;

  moduleWithLoad._load = function loadWithPipedriveContactSyncStubs(
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
          RUNNING: "RUNNING",
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
        importPipedrivePersonPages: async (args: unknown) => {
          importPagesArgs = args;
          return importPagesResult;
        },
        pipedrivePersonImportMetadataRows: () => [
          {
            externalPersonId: "person-1",
            status: "created",
            warningCount: 0,
            warnings: [],
          },
        ],
      };
    }

    if (request === "@/lib/integrations/pipedrive-lead-sync") {
      return {
        ensurePipedriveIntegrationConnection: async () => ({
          config: connectionConfig,
          id: "integration-1",
          status: "CONNECTED",
          updatedAt: new Date("2026-08-20T09:00:00.000Z"),
        }),
      };
    }

    if (request === "@/lib/maintenance/background-jobs") {
      return {
        backgroundJobStaleCutoff: () => new Date("2026-08-20T09:30:00.000Z"),
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
        isBackgroundJobSchemaPending: () => false,
      };
    }

    if (request === "@/lib/prisma") {
      return {
        prisma: {
          $transaction: async (writes: unknown[]) => {
            transactionWrites = writes;
            return writes;
          },
          backgroundJobRun: {
            findFirst: async () => runningJobRun,
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
          },
          marketingIntegrationSyncLog: {
            create: (args: unknown) => {
              const write = {
                args,
                type: "sync.create",
              };
              syncCreates.push(write);

              return write;
            },
          },
        },
      };
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  pipedriveContactSync =
    await import("../src/lib/integrations/pipedrive-contact-sync");
});

beforeEach(() => {
  client = {
    defaultLeadSource: "Pipedrive",
    lastFullPersonSyncAt: "2026-08-20T08:00:00.000Z",
    lastFullPersonSyncNextCursor: null,
  };
  connectionConfig = {
    apiBaseUrl: "https://api.pipedrive.com/v1",
    defaultLeadSource: "Pipedrive",
    lastContactSyncAt: "2026-08-20T08:05:00.000Z",
    lastFullPersonSyncAt: "2026-08-20T08:00:00.000Z",
  };
  importPagesArgs = null;
  importPagesResult = {
    created: 1,
    linkedExisting: 0,
    maxPages: 5,
    moreAvailable: true,
    nextCursor: "cursor-2",
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
  runningJobRun = null;
  completedJob = null;
  startedJob = null;
  syncCreates = [];
  transactionWrites = [];
});

describe("Pipedrive contact sync", () => {
  it("saves a cursor continuation without advancing the full person cursor", async () => {
    const result = await pipedriveContactSync.runPipedriveContactPull({
      actorId: "user-1",
      trigger: "manual",
    });

    assert.equal(result.status, "WARNING");
    assert.equal(result.moreAvailable, true);
    assert.deepEqual((importPagesArgs as { params?: unknown }).params, {
      cursor: null,
      limit: 50,
      updatedSince: "2026-08-20T08:00:00.000Z",
    });

    const updateWrite = transactionWrites.find(
      (write) => (write as { type?: string }).type === "integration.update",
    ) as { args: { data: { config: Record<string, unknown> } } };

    assert.equal(
      updateWrite.args.data.config.lastFullPersonSyncAt,
      "2026-08-20T08:00:00.000Z",
    );
    assert.equal(
      updateWrite.args.data.config.lastFullPersonSyncNextCursor,
      "cursor-2",
    );
    assert.equal(typeof updateWrite.args.data.config.lastContactSyncAt, "string");
  });

  it("records compact background job history for scheduled contact pulls", async () => {
    importPagesResult = {
      ...importPagesResult,
      moreAvailable: false,
      nextCursor: null,
      pagesRead: 1,
      recordsRead: 1,
    };
    client = {
      defaultLeadSource: "Pipedrive",
      lastFullPersonSyncAt: "2026-08-20T08:00:00.000Z",
      lastFullPersonSyncNextCursor: "cursor-2",
    };

    const result = await pipedriveContactSync.runPipedriveContactPull({
      recordBackgroundJob: true,
      trigger: "scheduled",
    });

    assert.equal(result.status, "SUCCESS");
    assert.equal(
      (startedJob as { jobName?: string; trigger?: string }).jobName,
      "pipedrive.contact_import",
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
