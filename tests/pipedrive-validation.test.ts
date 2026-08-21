import assert from "node:assert/strict";
import Module from "node:module";
import { before, beforeEach, describe, it } from "node:test";

type ModuleWithLoad = typeof Module & {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
};

type PipedriveValidationModule =
  typeof import("../src/lib/integrations/pipedrive-validation");

const moduleWithLoad = Module as ModuleWithLoad;

let pipedriveValidation: PipedriveValidationModule;
let webhookPlanCalls: number;
let webhookPlanResult: unknown;
let leadReadiness: Record<string, unknown>;
let contactReadiness: Record<string, unknown>;

before(async () => {
  const originalLoad = moduleWithLoad._load;

  moduleWithLoad._load = function loadWithPipedriveValidationStubs(
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
        pipedriveProvider: "pipedrive",
      };
    }

    if (request === "@/lib/integrations/pipedrive-contact-sync") {
      return {
        readPipedriveContactPullReadiness: async () => contactReadiness,
      };
    }

    if (request === "@/lib/integrations/pipedrive-lead-sync") {
      return {
        readPipedriveLeadPullReadiness: async () => leadReadiness,
      };
    }

    if (request === "@/lib/integrations/pipedrive-webhook-registration") {
      return {
        planPipedriveWebhookRegistration: async () => {
          webhookPlanCalls += 1;
          return webhookPlanResult;
        },
      };
    }

    if (request === "@/lib/prisma") {
      return {
        prisma: {
          backgroundJobRun: {
            findMany: async () => [
              {
                dryRun: false,
                finishedAt: new Date("2026-08-21T10:02:00.000Z"),
                jobName: "pipedrive.contact_import",
                message: "Imported contacts.",
                metadata: { secret: "do-not-return" },
                recordsRead: 250,
                recordsWritten: 240,
                startedAt: new Date("2026-08-21T10:00:00.000Z"),
                status: "SUCCESS",
                trigger: "scheduled",
              },
            ],
          },
          externalRecordLink: {
            groupBy: async () => [
              {
                _count: { _all: 10 },
                externalType: "person",
                internalType: "contact",
              },
              {
                _count: { _all: 3 },
                externalType: "lead",
                internalType: "salesOpportunity",
              },
            ],
          },
          marketingIntegrationSyncLog: {
            findMany: async () => [
              {
                finishedAt: new Date("2026-08-21T10:02:00.000Z"),
                message: "Contact import completed.",
                metadata: { imports: [{ externalPersonId: "123" }] },
                recordsRead: 250,
                recordsWritten: 240,
                startedAt: new Date("2026-08-21T10:00:00.000Z"),
                status: "SUCCESS",
                syncType: "contact-import",
              },
            ],
          },
        },
      };
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    pipedriveValidation = await import(
      "../src/lib/integrations/pipedrive-validation"
    );
  } finally {
    moduleWithLoad._load = originalLoad;
  }
});

beforeEach(() => {
  webhookPlanCalls = 0;
  leadReadiness = {
    connected: true,
    credentialSource: "database",
    defaultLeadSource: "Pipedrive",
    lastFullLeadSyncAt: "2026-08-20T14:36:41.525Z",
    lastFullLeadSyncNextStart: null,
    lastLeadSyncAt: "2026-08-20T14:36:41.525Z",
    pullOnly: true,
    status: "CONNECTED",
    updatedAt: "2026-08-21T10:34:18.103Z",
  };
  contactReadiness = {
    connected: true,
    credentialSource: "database",
    defaultLeadSource: "Pipedrive",
    hasContinuationCursor: false,
    lastContactSyncAt: "2026-08-21T10:34:18.097Z",
    lastFullPersonSyncAt: "2026-08-21T10:34:18.097Z",
    lastFullPersonSyncNextCursor: null,
    pullOnly: true,
    status: "CONNECTED",
    updatedAt: "2026-08-21T10:34:18.103Z",
  };
  webhookPlanResult = {
    desiredWebhooks: [{ eventAction: "create", eventObject: "lead" }],
    existingTargetWebhooks: [{ eventAction: "create", eventObject: "lead" }],
    message: "All required Pipedrive webhooks are already registered.",
    missingWebhooks: [],
    pipedriveWritesPerformed: 0,
    pipedriveWritesRequired: 0,
    receiverAuthConfigured: true,
    status: "SUCCESS",
    subscriptionUrl: "https://crm.example.test/api/webhooks/pipedrive",
  };
});

describe("Pipedrive validation summary", () => {
  it("returns compact operational state without raw metadata", async () => {
    const result = await pipedriveValidation.readPipedriveValidationSummary();

    assert.equal(result.status, "SUCCESS");
    assert.equal(result.pullOnly, true);
    assert.equal(result.leadReadiness.connected, true);
    assert.equal(result.contactReadiness.connected, true);
    assert.equal(result.webhookRegistration?.missingCount, 0);
    assert.deepEqual(result.webhookRegistration?.existingEvents, [
      "create.lead",
    ]);
    assert.deepEqual(result.externalRecordLinks, [
      {
        count: 3,
        externalType: "lead",
        internalType: "salesOpportunity",
      },
      {
        count: 10,
        externalType: "person",
        internalType: "contact",
      },
    ]);
    assert.deepEqual(Object.keys(result.syncLogs[0]!).sort(), [
      "finishedAt",
      "message",
      "recordsRead",
      "recordsWritten",
      "startedAt",
      "status",
      "syncType",
    ]);
    assert.equal(JSON.stringify(result).includes("do-not-return"), false);
    assert.equal(JSON.stringify(result).includes("externalPersonId"), false);
  });

  it("can skip the live webhook registration check", async () => {
    const result = await pipedriveValidation.readPipedriveValidationSummary({
      includeWebhookRegistration: false,
    });

    assert.equal(result.webhookRegistration, null);
    assert.equal(webhookPlanCalls, 0);
  });

  it("reports warning while a cursor continuation is still present", async () => {
    contactReadiness = {
      ...contactReadiness,
      lastFullPersonSyncNextCursor: "cursor-2",
    };

    const result = await pipedriveValidation.readPipedriveValidationSummary();

    assert.equal(result.status, "WARNING");
    assert.equal(result.contactReadiness.hasContinuationCursor, true);
    assert.equal(
      result.contactReadiness.lastFullPersonSyncNextCursor,
      "cursor-2",
    );
  });
});
