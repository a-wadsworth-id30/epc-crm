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
  lastFullDealSyncAt: string | null;
  lastFullDealSyncNextCursor: string | null;
  lastFullLeadSyncAt: string | null;
  lastFullLeadSyncNextStart: number | null;
  lastLeadEmailThreadSyncCompletedAt?: string | null;
  lastLeadEmailThreadSyncFolder?: string | null;
  lastLeadEmailThreadSyncNextStart?: number | null;
  lastLeadNoteSyncAt: string | null;
  lastLeadNoteSyncNextStart: number | null;
  lastLeadNoteSyncPendingUntil: string | null;
} | null;
let connectionConfig: Record<string, unknown>;
let importDealPagesArgs: unknown;
let importDealPagesResult: Record<string, unknown>;
let importLeadIdsArgs: unknown;
let importLeadIdsResult: Record<string, unknown>;
let importLeadEmailThreadPagesArgs: unknown;
let importLeadEmailThreadPagesResult: Record<string, unknown>;
let importLeadNotePagesArgs: unknown;
let importLeadNotePagesResult: Record<string, unknown>;
let importPagesArgs: unknown;
let importPagesCalls: unknown[];
let importPagesResult: Record<string, unknown>;
let previewPageArgs: unknown;
let previewPageResult: Record<string, unknown>;
let runningJobRun: { id: string; startedAt: Date; trigger: string } | null;
let latestLeadImportLog: { startedAt: Date; status: string; syncType: string } | null;
let recentWebhookLog: { startedAt: Date; status: string; syncType: string } | null;
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
        defaultPipedriveLeadEmailThreadSweepMaxPages: 3,
        importPipedriveLeadEmailThreadPages: async (args: unknown) => {
          importLeadEmailThreadPagesArgs = args;
          return importLeadEmailThreadPagesResult;
        },
        importPipedriveDealPages: async (args: unknown) => {
          importDealPagesArgs = args;
          return importDealPagesResult;
        },
        importPipedriveLeadIds: async (args: unknown) => {
          importLeadIdsArgs = args;
          return importLeadIdsResult;
        },
        importPipedriveLeadNotePages: async (args: unknown) => {
          importLeadNotePagesArgs = args;
          return importLeadNotePagesResult;
        },
        importPipedriveLeadPages: async (args: unknown) => {
          importPagesArgs = args;
          importPagesCalls.push(args);
          return importPagesResult;
        },
        pipedriveLeadIdFromInput: (value: unknown) => {
          const match = String(value ?? "").match(
            /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
          );

          return match?.[0].toLowerCase() ?? null;
        },
        pipedriveLeadEmailThreadFolders: ["inbox", "sent", "archive"],
        pipedriveDealImportMetadataRows: () => [
          {
            externalDealId: "deal-1",
            status: "created",
            warningCount: 0,
            warnings: [],
          },
        ],
        pipedriveLeadImportMetadataRows: () => [
          {
            externalLeadId: "lead-1",
            status: "created",
            warningCount: 0,
            warnings: [],
          },
        ],
        pipedriveLeadNoteImportMetadataRows: () => [
          {
            externalLeadId: "lead-1",
            externalNoteId: "88",
            status: "updated",
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
            findFirst: async (args: {
              where?: { syncType?: string | { in?: string[] } };
            }) => {
              const syncType = args.where?.syncType;

              if (syncType && typeof syncType === "object") {
                return recentWebhookLog;
              }

              if (syncType === "lead-import") {
                return latestLeadImportLog;
              }

              return null;
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
    lastFullDealSyncAt: null,
    lastFullDealSyncNextCursor: null,
    lastFullLeadSyncAt: "2026-08-20T08:00:00.000Z",
    lastFullLeadSyncNextStart: null,
    lastLeadEmailThreadSyncCompletedAt: null,
    lastLeadEmailThreadSyncFolder: null,
    lastLeadEmailThreadSyncNextStart: null,
    lastLeadNoteSyncAt: "2026-08-20T08:10:00.000Z",
    lastLeadNoteSyncNextStart: null,
    lastLeadNoteSyncPendingUntil: null,
  };
  connectionConfig = {
    apiBaseUrl: "https://api.pipedrive.com/v1",
    defaultLeadSource: "Pipedrive",
    lastFullDealSyncAt: null,
    lastFullDealSyncNextCursor: null,
    lastFullLeadSyncAt: "2026-08-20T08:00:00.000Z",
    lastLeadSyncAt: "2026-08-20T08:05:00.000Z",
    lastLeadEmailThreadSyncCompletedAt: null,
    lastLeadEmailThreadSyncFolder: null,
    lastLeadEmailThreadSyncNextStart: null,
    lastLeadNoteSyncAt: "2026-08-20T08:10:00.000Z",
    lastLeadNoteSyncNextStart: null,
    lastLeadNoteSyncPendingUntil: null,
  };
  importDealPagesArgs = null;
  importDealPagesResult = {
    created: 0,
    linkedExisting: 0,
    maxPages: 5,
    moreAvailable: false,
    nextCursor: null,
    pagesRead: 1,
    recordsRead: 0,
    results: [],
    skipped: 0,
    status: "ok",
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
  importLeadEmailThreadPagesArgs = null;
  importLeadEmailThreadPagesResult = {
    completedCycle: false,
    created: 0,
    emailsRead: 0,
    folder: "inbox",
    maxPages: 3,
    moreAvailable: false,
    nextFolder: "inbox",
    nextStart: null,
    pagesRead: 0,
    recordsWritten: 0,
    rows: [],
    skipped: 0,
    start: null,
    status: "ok",
    threadsMatched: 0,
    threadsRead: 0,
    updated: 0,
    warnings: [],
  };
  importLeadNotePagesArgs = null;
  importLeadNotePagesResult = {
    created: 0,
    ignored: 0,
    maxPages: 3,
    moreAvailable: false,
    nextStart: null,
    pagesRead: 1,
    recordsRead: 0,
    recordsWritten: 0,
    results: [],
    skipped: 0,
    status: "ok",
    updated: 0,
  };
  importPagesArgs = null;
  importPagesCalls = [];
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
  latestLeadImportLog = {
    startedAt: new Date("2026-08-20T09:00:00.000Z"),
    status: "SUCCESS",
    syncType: "lead-import",
  };
  recentWebhookLog = null;
  completedJob = null;
  startedJob = null;
  syncCreates = [];
  transactionWrites = [];
});

describe("Pipedrive scheduled lead sync", () => {
  it("skips adaptive scheduled pulls when recent provider webhooks are healthy", async () => {
    recentWebhookLog = {
      startedAt: new Date("2026-08-20T09:45:00.000Z"),
      status: "SUCCESS",
      syncType: "lead-import-webhook",
    };

    const decision =
      await pipedriveLeadSync.readPipedriveScheduledLeadPullDecision({
        maxSkipMinutes: 180,
        now: new Date("2026-08-20T10:00:00.000Z"),
        webhookWindowMinutes: 90,
      });

    assert.equal(decision.shouldRun, false);
    assert.equal(decision.skipReason, "recent-provider-webhook");
    assert.equal(decision.recentProviderWebhookAt, "2026-08-20T09:45:00.000Z");
    assert.equal(decision.lastLeadImportAt, "2026-08-20T09:00:00.000Z");
  });

  it("keeps adaptive scheduled pulls running when a continuation is pending", async () => {
    connectionConfig.lastLeadEmailThreadSyncNextStart = 150;
    recentWebhookLog = {
      startedAt: new Date("2026-08-20T09:45:00.000Z"),
      status: "SUCCESS",
      syncType: "lead-import-webhook",
    };

    const decision =
      await pipedriveLeadSync.readPipedriveScheduledLeadPullDecision({
        maxSkipMinutes: 180,
        now: new Date("2026-08-20T10:00:00.000Z"),
        webhookWindowMinutes: 90,
      });

    assert.equal(decision.shouldRun, true);
    assert.equal(decision.skipReason, "continuation-pending");
  });

  it("forces adaptive scheduled pulls after the max skip window", async () => {
    latestLeadImportLog = {
      startedAt: new Date("2026-08-20T06:30:00.000Z"),
      status: "SUCCESS",
      syncType: "lead-import",
    };
    recentWebhookLog = {
      startedAt: new Date("2026-08-20T09:45:00.000Z"),
      status: "SUCCESS",
      syncType: "lead-import-webhook",
    };

    const decision =
      await pipedriveLeadSync.readPipedriveScheduledLeadPullDecision({
        maxSkipMinutes: 180,
        now: new Date("2026-08-20T10:00:00.000Z"),
        webhookWindowMinutes: 90,
      });

    assert.equal(decision.shouldRun, true);
    assert.equal(decision.skipReason, "latest-import-too-old");
  });

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

  it("sweeps the latest lead page before an incremental cursor pull", async () => {
    importPagesResult = {
      ...importPagesResult,
      created: 0,
      linkedExisting: 1,
      moreAvailable: false,
      nextStart: null,
      pagesRead: 1,
      recordsRead: 1,
      results: [{ warnings: [] }],
    };

    const result = await pipedriveLeadSync.runPipedriveLeadPull({
      actorId: "user-1",
      recordBackgroundJob: false,
      trigger: "scheduled",
    });

    assert.equal(result.status, "SUCCESS");
    assert.equal(result.mode, "incremental");
    assert.equal(result.recordsRead, 2);
    assert.equal(importPagesCalls.length, 2);
    assert.equal((importPagesCalls[0] as { maxPages?: unknown }).maxPages, 1);
    assert.deepEqual((importPagesCalls[0] as { params?: unknown }).params, {
      limit: 50,
    });
    assert.deepEqual((importPagesCalls[1] as { params?: unknown }).params, {
      limit: 50,
      start: null,
      updatedSince: "2026-08-20T08:00:00.000Z",
    });

    const syncWrite = transactionWrites.find(
      (write) => (write as { type?: string }).type === "sync.create",
    ) as {
      args: {
        data: {
          metadata: Record<string, unknown>;
        };
      };
    };
    assert.equal(syncWrite.args.data.metadata.leadSweepEnabled, true);
    assert.equal(syncWrite.args.data.metadata.leadSweepRecordsRead, 1);
    assert.equal(syncWrite.args.data.metadata.leadCursorRecordsRead, 1);
  });

  it("pulls updated lead notes during scheduled lead pulls", async () => {
    importPagesResult = {
      ...importPagesResult,
      created: 0,
      linkedExisting: 0,
      moreAvailable: false,
      nextStart: null,
      pagesRead: 1,
      recordsRead: 0,
      results: [],
      skipped: 0,
    };
    importLeadNotePagesResult = {
      created: 1,
      ignored: 2,
      maxPages: 3,
      moreAvailable: false,
      nextStart: null,
      pagesRead: 1,
      recordsRead: 3,
      recordsWritten: 1,
      results: [
        {
          created: 1,
          externalLeadId: "lead-1",
          externalNoteId: "88",
          ignored: false,
          opportunityId: "opportunity-1",
          skipped: 0,
          status: "created",
          updated: 0,
          warnings: [],
        },
      ],
      skipped: 0,
      status: "ok",
      updated: 0,
    };

    const result = await pipedriveLeadSync.runPipedriveLeadPull({
      actorId: "user-1",
      recordBackgroundJob: false,
      trigger: "scheduled",
    });

    assert.equal(result.noteRecordsRead, 3);
    assert.equal(result.noteRecordsWritten, 1);
    assert.equal(result.noteCreated, 1);
    const noteParams = (importLeadNotePagesArgs as {
      params?: Record<string, unknown>;
    }).params;
    assert.equal(noteParams?.limit, 50);
    assert.equal(noteParams?.start, null);
    assert.equal(noteParams?.updatedSince, "2026-08-20T08:10:00.000Z");
    assert.equal(typeof noteParams?.updatedUntil, "string");

    const syncWrite = transactionWrites.find(
      (write) => (write as { type?: string }).type === "sync.create",
    ) as {
      args: {
        data: {
          metadata: Record<string, unknown>;
          recordsRead: number;
          recordsWritten: number;
        };
      };
    };
    assert.equal(syncWrite.args.data.recordsRead, 3);
    assert.equal(syncWrite.args.data.recordsWritten, 1);
    assert.equal(syncWrite.args.data.metadata.noteRecordsRead, 3);
    assert.equal(syncWrite.args.data.metadata.noteRecordsWritten, 1);

    const updateWrite = transactionWrites.find(
      (write) => (write as { type?: string }).type === "integration.update",
    ) as { args: { data: { config: Record<string, unknown> } } };
    assert.equal(
      updateWrite.args.data.config.lastLeadNoteSyncAt,
      noteParams?.updatedUntil,
    );
    assert.equal(updateWrite.args.data.config.lastLeadNoteSyncNextStart, null);
  });

  it("sweeps Pipedrive lead email threads from the saved mailbox cursor", async () => {
    connectionConfig = {
      ...connectionConfig,
      lastLeadEmailThreadSyncFolder: "sent",
      lastLeadEmailThreadSyncNextStart: 150,
    };
    importPagesResult = {
      ...importPagesResult,
      created: 0,
      linkedExisting: 0,
      moreAvailable: false,
      nextStart: null,
      pagesRead: 1,
      recordsRead: 0,
      results: [],
      skipped: 0,
    };
    importLeadEmailThreadPagesResult = {
      ...importLeadEmailThreadPagesResult,
      created: 1,
      emailsRead: 2,
      folder: "sent",
      moreAvailable: true,
      nextFolder: "sent",
      nextStart: 200,
      pagesRead: 3,
      recordsWritten: 1,
      rows: [
        {
          created: 1,
          emailRead: 2,
          externalLeadId: "lead-1",
          opportunityId: "opportunity-1",
          skipped: 0,
          threadCount: 1,
          updated: 0,
          warningCount: 0,
        },
      ],
      start: 150,
      threadsMatched: 1,
      threadsRead: 150,
      updated: 0,
    };

    const result = await pipedriveLeadSync.runPipedriveLeadPull({
      recordBackgroundJob: false,
      trigger: "scheduled",
    });

    assert.equal(result.emailThreadCreated, 1);
    assert.equal(result.emailThreadEmailsRead, 2);
    assert.equal(result.emailThreadThreadsRead, 150);
    assert.deepEqual(importLeadEmailThreadPagesArgs, {
      client,
      folder: "sent",
      maxPages: 3,
      now: (importLeadEmailThreadPagesArgs as { now?: Date }).now,
      start: 150,
    });

    const updateWrite = transactionWrites.find(
      (write) => (write as { type?: string }).type === "integration.update",
    ) as { args: { data: { config: Record<string, unknown> } } };
    assert.equal(
      updateWrite.args.data.config.lastLeadEmailThreadSyncFolder,
      "sent",
    );
    assert.equal(
      updateWrite.args.data.config.lastLeadEmailThreadSyncNextStart,
      200,
    );

    const syncWrite = transactionWrites.find(
      (write) => (write as { type?: string }).type === "sync.create",
    ) as {
      args: {
        data: {
          metadata: Record<string, unknown>;
          recordsRead: number;
          recordsWritten: number;
        };
      };
    };
    assert.equal(syncWrite.args.data.recordsRead, 152);
    assert.equal(syncWrite.args.data.recordsWritten, 1);
    assert.equal(syncWrite.args.data.metadata.emailThreadCreated, 1);
    assert.equal(syncWrite.args.data.metadata.emailThreadNextStart, 200);
  });

  it("saves a lead-note continuation without advancing the note cursor", async () => {
    connectionConfig = {
      ...connectionConfig,
      lastLeadNoteSyncPendingUntil: "2026-08-20T09:55:00.000Z",
      lastLeadNoteSyncNextStart: 50,
    };
    client = {
      ...client!,
      lastLeadNoteSyncPendingUntil: "2026-08-20T09:55:00.000Z",
      lastLeadNoteSyncNextStart: 50,
    };
    importPagesResult = {
      ...importPagesResult,
      created: 0,
      moreAvailable: false,
      nextStart: null,
      pagesRead: 1,
      recordsRead: 0,
      results: [],
      skipped: 0,
    };
    importLeadNotePagesResult = {
      ...importLeadNotePagesResult,
      moreAvailable: true,
      nextStart: 100,
      pagesRead: 3,
      recordsRead: 150,
    };

    const result = await pipedriveLeadSync.runPipedriveLeadPull({
      recordBackgroundJob: false,
      trigger: "scheduled",
    });

    assert.equal(result.status, "WARNING");
    assert.equal(result.noteMoreAvailable, true);
    assert.deepEqual(
      (importLeadNotePagesArgs as { params?: unknown }).params,
      {
        limit: 50,
        start: 50,
        updatedSince: "2026-08-20T08:10:00.000Z",
        updatedUntil: "2026-08-20T09:55:00.000Z",
      },
    );

    const updateWrite = transactionWrites.find(
      (write) => (write as { type?: string }).type === "integration.update",
    ) as { args: { data: { config: Record<string, unknown> } } };
    assert.equal(
      updateWrite.args.data.config.lastLeadNoteSyncAt,
      "2026-08-20T08:10:00.000Z",
    );
    assert.equal(updateWrite.args.data.config.lastLeadNoteSyncNextStart, 100);
    assert.equal(
      updateWrite.args.data.config.lastLeadNoteSyncPendingUntil,
      "2026-08-20T09:55:00.000Z",
    );
  });

  it("does not import Pipedrive deals during lead pulls", async () => {
    connectionConfig = {
      ...connectionConfig,
      lastFullDealSyncAt: "2026-08-19T08:00:00.000Z",
    };
    client = {
      defaultLeadSource: "Pipedrive",
      lastFullDealSyncAt: "2026-08-19T08:00:00.000Z",
      lastFullDealSyncNextCursor: null,
      lastFullLeadSyncAt: "2026-08-20T08:00:00.000Z",
      lastFullLeadSyncNextStart: null,
      lastLeadNoteSyncAt: "2026-08-20T08:10:00.000Z",
      lastLeadNoteSyncNextStart: null,
      lastLeadNoteSyncPendingUntil: null,
    };
    importPagesResult = {
      ...importPagesResult,
      created: 0,
      moreAvailable: false,
      nextStart: null,
      pagesRead: 1,
      recordsRead: 0,
      results: [],
    };
    importDealPagesResult = {
      created: 1,
      linkedExisting: 0,
      maxPages: 5,
      moreAvailable: true,
      nextCursor: "deal-cursor-2",
      pagesRead: 5,
      recordsRead: 2,
      results: [{ warnings: [] }],
      skipped: 0,
      status: "ok",
    };

    const result = await pipedriveLeadSync.runPipedriveLeadPull({
      actorId: "user-1",
      trigger: "manual",
    });

    assert.equal(result.status, "WARNING");
    assert.equal(result.moreAvailable, false);
    assert.equal(importDealPagesArgs, null);

    const updateWrite = transactionWrites.find(
      (write) => (write as { type?: string }).type === "integration.update",
    ) as { args: { data: { config: Record<string, unknown> } } };

    assert.equal(
      updateWrite.args.data.config.lastFullDealSyncAt,
      "2026-08-19T08:00:00.000Z",
    );
    assert.equal(
      updateWrite.args.data.config.lastFullDealSyncNextCursor,
      null,
    );
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
      lastFullDealSyncAt: null,
      lastFullDealSyncNextCursor: null,
      lastFullLeadSyncAt: "2026-08-20T08:00:00.000Z",
      lastFullLeadSyncNextStart: 50,
      lastLeadNoteSyncAt: "2026-08-20T08:10:00.000Z",
      lastLeadNoteSyncNextStart: null,
      lastLeadNoteSyncPendingUntil: null,
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

  it("imports a direct Pipedrive Lead Inbox URL by UUID", async () => {
    const leadId = "3f214f00-9f9f-11f1-982e-6d2d290071c8";
    importLeadIdsResult = {
      created: 1,
      linkedExisting: 0,
      requested: 1,
      results: [
        {
          created: {
            company: true,
            contact: true,
            opportunity: true,
          },
          externalLeadId: leadId,
          status: "created",
          warnings: [],
        },
      ],
      skipped: 0,
      status: "ok",
    };

    const result = await pipedriveLeadSync.runPipedriveDirectLeadImport({
      actorId: "user-1",
      leadInput: `https://epcimprovements.pipedrive.com/leads/inbox/${leadId}`,
      recordBackgroundJob: false,
    });

    assert.equal(result.status, "SUCCESS");
    assert.equal(result.mode, "direct");
    assert.equal(result.requestedLeadId, leadId);
    assert.equal(result.recordsRead, 1);
    assert.equal(result.recordsWritten, 1);
    assert.deepEqual((importLeadIdsArgs as { leadIds?: unknown }).leadIds, [
      leadId,
    ]);

    const syncWrite = transactionWrites.find(
      (write) => (write as { type?: string }).type === "sync.create",
    ) as {
      args: {
        data: {
          metadata: Record<string, unknown>;
          syncType: string;
        };
      };
    };
    assert.equal(syncWrite.args.data.syncType, "lead-import-direct");
    assert.equal(syncWrite.args.data.metadata.requestedLeadId, leadId);

    const updateWrite = transactionWrites.find(
      (write) => (write as { type?: string }).type === "integration.update",
    ) as { args: { data: { config: Record<string, unknown> } } };
    assert.equal(
      updateWrite.args.data.config.lastFullLeadSyncAt,
      "2026-08-20T08:00:00.000Z",
    );
    assert.equal(typeof updateWrite.args.data.config.lastLeadSyncAt, "string");
  });

  it("does not read Pipedrive when direct import input has no lead UUID", async () => {
    const result = await pipedriveLeadSync.runPipedriveDirectLeadImport({
      actorId: "user-1",
      leadInput: "https://epcimprovements.pipedrive.com/deal/13059",
      recordBackgroundJob: false,
    });

    assert.equal(result.status, "WARNING");
    assert.equal(result.requestedLeadId, null);
    assert.equal(importLeadIdsArgs, null);
    assert.equal(transactionWrites.length, 0);
    assert.equal(syncCreates.length, 1);
    assert.equal(
      (syncCreates[0] as { args: { data: { syncType: string } } }).args.data
        .syncType,
      "lead-import-direct",
    );
    assert.equal(
      (
        syncCreates[0] as {
          args: { data: { metadata: Record<string, unknown> } };
        }
      ).args.data.metadata.reason,
      "invalid-lead-id",
    );
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
