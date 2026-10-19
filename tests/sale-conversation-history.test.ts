import assert from "node:assert/strict";
import Module from "node:module";
import { before, describe, it } from "node:test";

type ModuleWithLoad = typeof Module & {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
};

type ConversationHistoryModule =
  typeof import("../src/lib/sales/conversation-history");

const moduleWithLoad = Module as ModuleWithLoad;
const originalLoad = moduleWithLoad._load;
let conversationHistory: ConversationHistoryModule;

const emailRows = Array.from({ length: 15 }, (_, index) => ({
  body: `Email body ${index + 1}`,
  channel: "EMAIL",
  contact: { firstName: "Adam", lastName: "Wadsworth" },
  direction: index % 2 ? "OUTBOUND" : "INBOUND",
  fromAddress: "customer@example.com",
  id: `email-${index + 1}`,
  metadata: null,
  occurredAt: new Date(Date.UTC(2026, 9, 19, 12, 0, -index)),
  subject: `Email ${index + 1}`,
  summary: `Email summary ${index + 1}`,
  toAddress: "sales@example.com",
  user: null,
}));

const communicationRows = [
  ...emailRows,
  {
    ...emailRows[0]!,
    body: "Note body",
    channel: "NOTE",
    direction: "INTERNAL",
    id: "note-1",
    occurredAt: new Date("2026-10-19T11:00:00.000Z"),
    subject: "Note 1",
    summary: "Note summary",
  },
  {
    ...emailRows[0]!,
    body: "System body",
    channel: "SYSTEM",
    direction: "INTERNAL",
    id: "system-1",
    occurredAt: new Date("2026-10-19T10:00:00.000Z"),
    subject: "System 1",
    summary: "System summary",
  },
  {
    ...emailRows[0]!,
    body: "Inbound customer call",
    channel: "PHONE",
    direction: "INBOUND",
    id: "phone-1",
    metadata: { transcript: "Customer requested a heat loss survey" },
    occurredAt: new Date("2026-10-19T09:00:00.000Z"),
    subject: "Inbound call",
    summary: "Call with customer",
  },
].sort(
  (left, right) => right.occurredAt.getTime() - left.occurredAt.getTime(),
);

before(async () => {
  moduleWithLoad._load = function loadWithConversationHistoryStubs(
    this: unknown,
    request: string,
    parent: unknown,
    isMain: boolean,
  ) {
    if (request === "server-only") return {};
    if (request === "@/lib/crm-resource-access") {
      return {
        salesOpportunityIdAccessWhere: (saleId: string) => ({ id: saleId }),
      };
    }
    if (request === "@/lib/integrations/pipedrive") {
      return { pipedriveProvider: "pipedrive" };
    }
    if (request === "@/lib/prisma") {
      return {
        prisma: {
          attributionRecord: {
            findMany: async () => [
              {
                createdAt: new Date("2026-10-19T12:00:20.000Z"),
                currentPage: null,
                firstTouch: null,
                id: "attribution-1",
                landingPage: null,
                lastTouch: null,
                referrer: null,
                timeline: null,
                touchpoints: [
                  {
                    campaign: "Autumn",
                    capturedAt: new Date("2026-10-19T12:00:20.000Z"),
                    createdAt: new Date("2026-10-19T12:00:20.000Z"),
                    id: "touch-1",
                    landingPage: "https://example.com/landing",
                    medium: "cpc",
                    position: 0,
                    referrer: null,
                    role: "FIRST",
                    source: "google",
                    url: "https://example.com/landing",
                  },
                ],
              },
            ],
          },
          externalRecordLink: {
            count: async () => 1,
            findMany: async (args: unknown) => {
              const query = args as { skip?: number; take?: number };
              const rows = [
                {
                  externalId: "file-1",
                  id: "file-link-1",
                  lastSeenAt: new Date("2026-10-19T12:01:00.000Z"),
                  metadata: {
                    name: "sample.pdf",
                    pipedriveFileType: "application/pdf",
                    sizeBytes: 2048,
                  },
                  updatedAt: new Date("2026-10-19T12:01:00.000Z"),
                },
              ];
              return rows.slice(
                query.skip ?? 0,
                (query.skip ?? 0) + (query.take ?? rows.length),
              );
            },
          },
          salesCommunication: {
            findMany: async (args: unknown) => {
              const query = args as {
                skip?: number;
                take?: number;
                where?: { channel?: { in?: string[] } };
              };
              const channels = query.where?.channel?.in;
              const rows = channels
                ? communicationRows.filter((row) =>
                    channels.includes(row.channel),
                  )
                : communicationRows;
              return rows.slice(
                query.skip ?? 0,
                (query.skip ?? 0) + (query.take ?? rows.length),
              );
            },
            groupBy: async () => [
              { _count: { _all: 15 }, channel: "EMAIL" },
              { _count: { _all: 1 }, channel: "NOTE" },
              { _count: { _all: 1 }, channel: "SYSTEM" },
              { _count: { _all: 1 }, channel: "PHONE" },
            ],
          },
          salesOpportunity: {
            findFirst: async () => ({
              attribution: {
                firstTouch: {
                  capturedAt: "2026-10-19T12:00:10.000Z",
                  params: { utm_source: "direct" },
                  url: "https://example.com/",
                },
              },
              contact: { firstName: "Adam", lastName: "Wadsworth" },
              contactId: "contact-1",
              createdAt: new Date("2026-10-19T12:00:10.000Z"),
              id: "sale-1",
            }),
          },
        },
      };
    }

    return Reflect.apply(originalLoad, this, [request, parent, isMain]);
  };

  try {
    conversationHistory = await import(
      "../src/lib/sales/conversation-history"
    );
  } finally {
    moduleWithLoad._load = originalLoad;
  }
});

describe("sale conversation history", () => {
  it("paginates a complete filtered email history on the server", async () => {
    const result = await conversationHistory.listSaleConversationPage({
      filter: "EMAIL",
      page: 2,
      saleId: "sale-1",
      user: { id: "admin-1", role: "ADMIN" },
    });

    assert.ok(result);
    assert.equal(result.total, 15);
    assert.equal(result.totalPages, 2);
    assert.equal(result.page, 2);
    assert.deepEqual(
      result.items.map((item) => item.id),
      ["email-13", "email-14", "email-15"],
    );
  });

  it("merges communication, file and website counts into the complete timeline", async () => {
    const result = await conversationHistory.listSaleConversationPage({
      filter: "ALL",
      page: 1,
      saleId: "sale-1",
      user: { id: "admin-1", role: "ADMIN" },
    });

    assert.ok(result);
    assert.deepEqual(result.counts, {
      ALL: 21,
      EMAIL: 15,
      FILE: 1,
      NOTE: 1,
      PHONE: 1,
      SMS: 0,
      WEBSITE: 2,
    });
    assert.equal(result.items.length, 12);
    assert.equal(result.items[0]?.id, "pipedrive-file:file-link-1");
    assert.ok(result.items.some((item) => item.channel === "WEBSITE"));
  });

  it("searches the complete history across message text and metadata", async () => {
    const result = await conversationHistory.listSaleConversationPage({
      filter: "PHONE",
      page: 1,
      query: "heat loss survey",
      saleId: "sale-1",
      user: { id: "admin-1", role: "ADMIN" },
    });

    assert.ok(result);
    assert.equal(result.query, "heat loss survey");
    assert.equal(result.total, 1);
    assert.deepEqual(result.items.map((item) => item.id), ["phone-1"]);
  });

  it("searches Pipedrive filenames and website attribution details", async () => {
    const fileResult = await conversationHistory.listSaleConversationPage({
      filter: "FILE",
      page: 1,
      query: "sample pdf",
      saleId: "sale-1",
      user: { id: "admin-1", role: "ADMIN" },
    });
    const websiteResult = await conversationHistory.listSaleConversationPage({
      filter: "WEBSITE",
      page: 1,
      query: "google autumn",
      saleId: "sale-1",
      user: { id: "admin-1", role: "ADMIN" },
    });

    assert.ok(fileResult);
    assert.deepEqual(fileResult.items.map((item) => item.id), [
      "pipedrive-file:file-link-1",
    ]);
    assert.ok(websiteResult);
    assert.equal(websiteResult.total, 1);
    assert.equal(websiteResult.items[0]?.channel, "WEBSITE");
  });
});
