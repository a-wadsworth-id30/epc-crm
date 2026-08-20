import assert from "node:assert/strict";
import Module from "node:module";
import { before, beforeEach, describe, it } from "node:test";

type ModuleWithLoad = typeof Module & {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
};

type PipedriveLeadSyncModule =
  typeof import("../src/lib/integrations/pipedrive-lead-sync");

const moduleWithLoad = Module as ModuleWithLoad;

let pipedriveLeadSync: PipedriveLeadSyncModule;
let client: {
  defaultLeadSource: string;
  lastFullLeadSyncAt: string | null;
  lastFullLeadSyncNextStart: number | null;
} | null;
let connectionConfig: Record<string, unknown>;
let importLeadIdsArgs: unknown;
let importLeadIdsResult: Record<string, unknown>;
let importPagesArgs: unknown;
let importPagesResult: Record<string, unknown>;
let previewPageArgs: unknown;
let previewPageResult: Record<string, unknown>;
let runningJobRun: { id: string; startedAt: Date; trigger: string } | null;
let completedJob: unknown;
let startedJob: unknown;
let syncCreates: unknown[];
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
        importPipedriveLeadIds: async (args: unknown) => {
          importLeadIdsArgs = args;
          return importLeadIdsResult;
        },
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
        previewPipedriveLeadPage: async (args: unknown) => {
          previewPageArgs = args;
          return previewPageResult;
        },
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
            upsert: async () => ({
              config: connectionConfig,
              id: "integration-1",
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

  pipedriveLeadSync =
    await import("../src/lib/integrations/pipedrive-lead-sync");
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
  importLeadIdsArgs = null;
  importLeadIdsResult = {
    created: 2,
    linkedExisting: 0,
    requested: 2,
    results: [
      {
        created: {
          company: true,
          contact: true,
          opportunity: true,
        },
        externalLeadId: "lead-1",
        status: "created",
        warnings: [],
      },
      {
        created: {
          company: true,
          contact: true,
          opportunity: true,
        },
        externalLeadId: "lead-2",
        status: "created",
        warnings: [],
      },
    ],
    skipped: 0,
    status: "ok",
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
  previewPageArgs = null;
  previewPageResult = {
    linkedExisting: 1,
    page: {
      data: [{ id: "lead-1" }, { id: "lead-2" }, { id: "lead-3" }],
      pagination: {
        moreItemsInCollection: true,
        nextStart: 3,
      },
    },
    previews: [
      {
        linkedOpportunityId: null,
        matchedCompanyId: "company-1",
        matchedContactId: null,
        status: "would_create",
        warnings: [],
      },
      {
        linkedOpportunityId: "opportunity-1",
        matchedCompanyId: null,
        matchedContactId: null,
        status: "linked_existing",
        warnings: [],
      },
      {
        linkedOpportunityId: null,
        matchedCompanyId: null,
        matchedContactId: null,
        status: "would_create",
        warnings: ["Missing related person"],
      },
    ],
    skipped: 0,
    status: "ok",
    wouldCreate: 2,
  };
  runningJobRun = null;
  completedJob = null;
  startedJob = null;
  syncCreates = [];
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
    assert.deepEqual((importPagesArgs as { params?: unknown }).params, {
      limit: 50,
      start: null,
      updatedSince: "2026-08-20T08:00:00.000Z",
    });

    const updateWrite = transactionWrites.find(
      (write) => (write as { type?: string }).type === "integration.update",
    ) as { args: { data: { config: Record<string, unknown> } } };

    assert.equal(
      updateWrite.args.data.config.lastFullLeadSyncAt,
      "2026-08-20T08:00:00.000Z",
    );
    assert.equal(updateWrite.args.data.config.lastFullLeadSyncNextStart, 50);
    assert.equal(typeof updateWrite.args.data.config.lastLeadSyncAt, "string");
  });

  it("skips a pull when another non-stale Pipedrive pull is running", async () => {
    runningJobRun = {
      id: "job-active",
      startedAt: new Date("2026-08-20T09:45:00.000Z"),
      trigger: "scheduled",
    };

    const result = await pipedriveLeadSync.runPipedriveLeadPull({
      actorId: "user-1",
      trigger: "manual",
    });

    assert.equal(result.status, "WARNING");
    assert.equal(result.mode, "already_running");
    assert.equal(importPagesArgs, null);
    assert.equal(transactionWrites.length, 0);
    assert.equal(syncCreates.length, 1);
    assert.match(result.message, /already running/);
    assert.equal(
      (
        completedJob as {
          completion?: { summary?: { activeRunId?: string } };
        }
      ).completion?.summary?.activeRunId,
      "job-active",
    );
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

  it("returns a sanitized read-only preview summary without creating CRM records", async () => {
    const result = await pipedriveLeadSync.readPipedriveLeadPullPreview({
      limit: 100,
      start: -1,
    });

    assert.equal(result.connected, true);
    assert.equal(result.pullOnly, true);
    assert.equal(result.recordsRead, 3);
    assert.equal(result.recordsWritten, 0);
    assert.equal(result.wouldCreate, 2);
    assert.equal(result.linkedExisting, 1);
    assert.equal(result.warningCount, 1);
    assert.equal(result.withCrmMatch, 2);
    assert.equal(result.moreAvailable, true);
    assert.equal(result.nextStart, 3);
    assert.equal(result.pageLimit, 50);
    assert.equal(result.pageStart, 0);
    assert.equal(importPagesArgs, null);
    assert.equal(syncCreates.length, 0);
    assert.equal(transactionWrites.length, 0);
    assert.deepEqual((previewPageArgs as { params?: unknown }).params, {
      limit: 50,
      start: 0,
    });
  });

  it("does not run a preview when Pipedrive credentials are missing", async () => {
    client = null;

    const result = await pipedriveLeadSync.readPipedriveLeadPullPreview();

    assert.equal(result.connected, false);
    assert.equal(result.status, "WARNING");
    assert.equal(result.recordsRead, 0);
    assert.equal(result.recordsWritten, 0);
    assert.equal(result.warningCount, 1);
    assert.equal(previewPageArgs, null);
  });

  it("does not import an approved page when the expected count no longer matches", async () => {
    previewPageResult = cleanWouldCreatePreviewResult();

    const result = await pipedriveLeadSync.runPipedriveApprovedLeadPageImport({
      expectedWouldCreate: 3,
      limit: 10,
      recordBackgroundJob: false,
      start: 50,
    });

    assert.equal(result.status, "WARNING");
    assert.equal(result.recordsWritten, 0);
    assert.equal(result.approvedLeadCount, 2);
    assert.equal(importLeadIdsArgs, null);
    assert.equal(syncCreates.length, 1);
    assert.match(result.message, /did not run/);
  });

  it("imports only the approved would-create leads from a bounded page", async () => {
    previewPageResult = cleanWouldCreatePreviewResult();

    const result = await pipedriveLeadSync.runPipedriveApprovedLeadPageImport({
      expectedWouldCreate: 2,
      limit: 50,
      recordBackgroundJob: false,
      start: 50,
    });

    assert.equal(result.status, "SUCCESS");
    assert.equal(result.recordsRead, 2);
    assert.equal(result.recordsWritten, 2);
    assert.equal(result.approvedLeadCount, 2);
    assert.equal(result.pageLimit, 10);
    assert.deepEqual((previewPageArgs as { params?: unknown }).params, {
      limit: 10,
      start: 50,
    });
    assert.deepEqual((importLeadIdsArgs as { leadIds?: unknown }).leadIds, [
      "lead-1",
      "lead-2",
    ]);
    assert.equal(transactionWrites.length, 2);
  });
});

function cleanWouldCreatePreviewResult() {
  return {
    ...previewPageResult,
    linkedExisting: 0,
    previews: [
      {
        externalLeadId: "lead-1",
        linkedOpportunityId: null,
        matchedCompanyId: null,
        matchedContactId: null,
        status: "would_create",
        warnings: [],
      },
      {
        externalLeadId: "lead-2",
        linkedOpportunityId: null,
        matchedCompanyId: null,
        matchedContactId: null,
        status: "would_create",
        warnings: [],
      },
    ],
    skipped: 0,
    wouldCreate: 2,
  };
}
