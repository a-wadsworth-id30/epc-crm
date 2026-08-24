import assert from "node:assert/strict";
import Module from "node:module";
import { before, beforeEach, describe, it } from "node:test";

type ModuleWithLoad = typeof Module & {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
};

type PipedriveImportModule =
  typeof import("../src/lib/integrations/pipedrive-import");

const moduleWithLoad = Module as ModuleWithLoad;
const originalLoad = moduleWithLoad._load;

let pipedriveImport: PipedriveImportModule;
let crmWriteCalls = 0;
let crmWriteLabels: string[] = [];
let companyRows: Array<{ id: string; name: string }> = [];
let contactRows: Array<{
  email: string | null;
  firstName: string | null;
  id: string;
  lastName: string | null;
  phoneNormalized?: string | null;
}> = [];
let externalRecordLinkRows: Array<{
  externalId: string;
  externalType: string;
  internalId: string;
  internalType: string;
  provider: string;
}> = [];
let salesCommunicationRows: Array<{
  body?: string | null;
  contactId?: string | null;
  externalId?: string | null;
  id: string;
  metadata?: unknown;
  opportunityId?: string | null;
  summary?: string | null;
}> = [];

async function findExternalRecordLink(args: unknown) {
  const key = (
    args as {
      where?: {
        provider_externalType_externalId?: {
          externalId?: string;
          externalType?: string;
          provider?: string;
        };
      };
    }
  ).where?.provider_externalType_externalId;

  if (!key) return null;

  return (
    externalRecordLinkRows.find(
      (row) =>
        row.externalId === key.externalId &&
        row.externalType === key.externalType &&
        row.provider === key.provider,
    ) ?? null
  );
}

async function findCompanyById(args: unknown) {
  const id = (args as { where?: { id?: string } }).where?.id;
  return companyRows.find((row) => row.id === id) ?? null;
}

async function findCompanyByName(args: unknown) {
  const name = (args as { where?: { name?: { equals?: string } } }).where?.name
    ?.equals;

  if (!name) return null;

  return (
    companyRows.find((row) => row.name.toLowerCase() === name.toLowerCase()) ??
    null
  );
}

async function findContactById(args: unknown) {
  const id = (args as { where?: { id?: string } }).where?.id;
  return contactRows.find((row) => row.id === id) ?? null;
}

async function findContactByIdentity(args: unknown) {
  const lookup = JSON.stringify(args).toLowerCase();

  return (
    contactRows.find(
      (row) =>
        (row.email && lookup.includes(row.email.toLowerCase())) ||
        (row.phoneNormalized &&
          lookup.includes(row.phoneNormalized.toLowerCase())),
    ) ?? null
  );
}

function recordCrmWriteFor(label: string) {
  return async () => {
    crmWriteCalls += 1;
    crmWriteLabels.push(label);
    return { id: "stub-id", name: "Stub record" };
  };
}

async function createSalesCommunication(args: unknown) {
  crmWriteCalls += 1;
  crmWriteLabels.push("salesCommunication.create");
  const data = (args as { data?: Record<string, unknown> }).data ?? {};
  const row = {
    body: typeof data.body === "string" ? data.body : null,
    contactId: typeof data.contactId === "string" ? data.contactId : null,
    externalId: typeof data.externalId === "string" ? data.externalId : null,
    id: `sales-communication-${salesCommunicationRows.length + 1}`,
    metadata: data.metadata,
    opportunityId:
      typeof data.opportunityId === "string" ? data.opportunityId : null,
    summary: typeof data.summary === "string" ? data.summary : null,
  };
  salesCommunicationRows.push(row);
  return { id: row.id };
}

async function findSalesCommunication(args: unknown) {
  const where = (args as {
    where?: { externalId?: string; opportunityId?: string };
  }).where;

  return (
    salesCommunicationRows.find(
      (row) =>
        row.externalId === where?.externalId &&
        row.opportunityId === where?.opportunityId,
    ) ?? null
  );
}

async function updateSalesCommunication(args: unknown) {
  crmWriteCalls += 1;
  crmWriteLabels.push("salesCommunication.update");
  const id = (args as { where?: { id?: string } }).where?.id;
  const data = (args as { data?: Record<string, unknown> }).data ?? {};
  const row = salesCommunicationRows.find((candidate) => candidate.id === id);

  if (!row) return { id: id ?? "missing" };

  if (typeof data.body === "string") row.body = data.body;
  if (typeof data.contactId === "string" || data.contactId === null) {
    row.contactId = data.contactId;
  }
  if (typeof data.externalId === "string") row.externalId = data.externalId;
  if (data.metadata !== undefined) row.metadata = data.metadata;
  if (typeof data.opportunityId === "string") {
    row.opportunityId = data.opportunityId;
  }
  if (typeof data.summary === "string") row.summary = data.summary;

  return { id: row.id };
}

before(async () => {
  moduleWithLoad._load = function loadWithPipedriveImportStubs(
    this: unknown,
    request: string,
    parent: unknown,
    isMain: boolean,
  ) {
    if (request === "server-only") {
      return {};
    }

    if (request === "@/lib/crypto/secrets") {
      return { decryptSecret: (value: string) => value };
    }

    if (request === "@/lib/prisma") {
      const transactionClient = {
        company: {
          create: recordCrmWriteFor("company.create"),
          findFirst: async () => null,
          findUnique: async () => null,
        },
        contact: {
          create: recordCrmWriteFor("contact.create"),
          findFirst: async () => null,
          findUnique: async () => null,
          update: recordCrmWriteFor("contact.update"),
        },
        externalRecordLink: {
          findUnique: findExternalRecordLink,
          upsert: recordCrmWriteFor("externalRecordLink.upsert"),
        },
        salesCommunication: {
          create: createSalesCommunication,
          findFirst: findSalesCommunication,
          update: updateSalesCommunication,
        },
        salesLifecycleEvent: {
          create: recordCrmWriteFor("salesLifecycleEvent.create"),
        },
        salesOpportunity: {
          create: recordCrmWriteFor("salesOpportunity.create"),
          findUnique: async (args: unknown) => ({
            contactId: "contact-existing",
            id: (args as { where?: { id?: string } }).where?.id ?? "opportunity-existing",
          }),
        },
        salesPipelineStage: {
          findFirst: async () => null,
        },
      };

      return {
        prisma: {
          $transaction: async (operation: unknown) => {
            if (Array.isArray(operation)) return Promise.all(operation);
            if (typeof operation !== "function") return null;
            return operation(transactionClient);
          },
          externalRecordLink: {
            findUnique: findExternalRecordLink,
          },
          integrationConnection: {
            findUnique: async () => null,
          },
          company: {
            findFirst: findCompanyByName,
            findUnique: findCompanyById,
          },
          contact: {
            findFirst: findContactByIdentity,
            findUnique: findContactById,
          },
        },
      };
    }

    if (request === "@/lib/settings") {
      return {
        getCrmSettings: async () => ({
          salesDefaults: {},
          workspaceDefaults: {},
        }),
      };
    }

    return Reflect.apply(originalLoad, this, [request, parent, isMain]);
  };

  try {
    pipedriveImport = await import("../src/lib/integrations/pipedrive-import");
  } finally {
    moduleWithLoad._load = originalLoad;
  }
});

beforeEach(() => {
  crmWriteCalls = 0;
  crmWriteLabels = [];
  companyRows = [];
  contactRows = [];
  externalRecordLinkRows = [];
  salesCommunicationRows = [];
});

describe("Pipedrive lead import mapping", () => {
  it("requests the latest updated leads first when importing a page", async () => {
    const listCalls: unknown[] = [];
    const result = await pipedriveImport.importPipedriveLeadPage({
      client: {
        defaultLeadSource: "Pipedrive",
        getOrganization: async () => ({}),
        getPerson: async () => ({}),
        listLeads: async (params) => {
          listCalls.push(params);
          return {
            data: [],
            pagination: {
              limit: 50,
              moreItemsInCollection: false,
              nextStart: null,
              start: 0,
            },
            relatedObjects: null,
          };
        },
      },
    });

    assert.equal(result.status, "ok");
    assert.deepEqual(listCalls, [{ limit: 50, sort: "update_time DESC" }]);
  });

  it("forwards an updated-since cursor for incremental full pulls", async () => {
    const listCalls: unknown[] = [];
    const result = await pipedriveImport.importPipedriveLeadPage({
      client: {
        defaultLeadSource: "Pipedrive",
        getOrganization: async () => ({}),
        getPerson: async () => ({}),
        listLeads: async (params) => {
          listCalls.push(params);
          return {
            data: [],
            pagination: {
              limit: 50,
              moreItemsInCollection: false,
              nextStart: null,
              start: 0,
            },
            relatedObjects: null,
          };
        },
      },
      params: { limit: 50, updatedSince: "2026-08-20T10:00:00.000Z" },
    });

    assert.equal(result.status, "ok");
    assert.deepEqual(listCalls, [
      {
        limit: 50,
        sort: "update_time DESC",
        updatedSince: "2026-08-20T10:00:00.000Z",
      },
    ]);
  });

  it("follows Pipedrive pagination for bounded full pulls", async () => {
    const listCalls: unknown[] = [];
    const result = await pipedriveImport.importPipedriveLeadPages({
      client: {
        defaultLeadSource: "Pipedrive",
        getOrganization: async () => ({}),
        getPerson: async () => ({}),
        listLeads: async (params) => {
          listCalls.push(params);
          return {
            data: [],
            pagination:
              listCalls.length === 1
                ? {
                    limit: 2,
                    moreItemsInCollection: true,
                    nextStart: 2,
                    start: 0,
                  }
                : {
                    limit: 2,
                    moreItemsInCollection: false,
                    nextStart: null,
                    start: 2,
                  },
            relatedObjects: null,
          };
        },
      },
      maxPages: 3,
      params: { limit: 2, updatedSince: "2026-08-20T10:00:00.000Z" },
    });

    assert.equal(result.status, "ok");
    assert.equal(result.pagesRead, 2);
    assert.equal(result.recordsRead, 0);
    assert.equal(result.moreAvailable, false);
    assert.equal(result.nextStart, null);
    assert.deepEqual(listCalls, [
      {
        limit: 2,
        sort: "update_time DESC",
        updatedSince: "2026-08-20T10:00:00.000Z",
      },
      {
        limit: 2,
        sort: "update_time DESC",
        start: 2,
        updatedSince: "2026-08-20T10:00:00.000Z",
      },
    ]);
  });

  it("starts bounded full pulls at a saved pagination continuation", async () => {
    const listCalls: unknown[] = [];
    const result = await pipedriveImport.importPipedriveLeadPages({
      client: {
        defaultLeadSource: "Pipedrive",
        getOrganization: async () => ({}),
        getPerson: async () => ({}),
        listLeads: async (params) => {
          listCalls.push(params);
          return {
            data: [],
            pagination: {
              limit: 2,
              moreItemsInCollection: false,
              nextStart: null,
              start: 100,
            },
            relatedObjects: null,
          };
        },
      },
      maxPages: 2,
      params: {
        limit: 2,
        start: 100,
        updatedSince: "2026-08-20T10:00:00.000Z",
      },
    });

    assert.equal(result.status, "ok");
    assert.equal(result.pagesRead, 1);
    assert.deepEqual(listCalls, [
      {
        limit: 2,
        sort: "update_time DESC",
        start: 100,
        updatedSince: "2026-08-20T10:00:00.000Z",
      },
    ]);
  });

  it("reports when bounded full pulls leave more Pipedrive pages available", async () => {
    const result = await pipedriveImport.importPipedriveLeadPages({
      client: {
        defaultLeadSource: "Pipedrive",
        getOrganization: async () => ({}),
        getPerson: async () => ({}),
        listLeads: async () => ({
          data: [],
          pagination: {
            limit: 50,
            moreItemsInCollection: true,
            nextStart: 50,
            start: 0,
          },
          relatedObjects: null,
        }),
      },
      maxPages: 1,
    });

    assert.equal(result.status, "ok");
    assert.equal(result.maxPages, 1);
    assert.equal(result.pagesRead, 1);
    assert.equal(result.moreAvailable, true);
    assert.equal(result.nextStart, 50);
  });

  it("does not read Pipedrive deals when importing a deal page", async () => {
    const listCalls: unknown[] = [];
    const result = await pipedriveImport.importPipedriveDealPage({
      client: {
        defaultLeadSource: "Pipedrive",
        getOrganization: async () => ({}),
        getPerson: async () => ({}),
        listDeals: async (params) => {
          listCalls.push(params);
          return {
            data: [],
            pagination: {
              limit: 50,
              moreItemsInCollection: false,
              nextCursor: null,
              nextStart: null,
              start: null,
            },
            relatedObjects: null,
          };
        },
      },
    });

    assert.equal(result.status, "ok");
    assert.equal(result.created, 0);
    assert.equal(result.skipped, 0);
    assert.deepEqual(result.page.data, []);
    assert.deepEqual(listCalls, []);
  });

  it("does not read Pipedrive deals during bounded deal pulls", async () => {
    const listCalls: unknown[] = [];
    const result = await pipedriveImport.importPipedriveDealPages({
      client: {
        defaultLeadSource: "Pipedrive",
        getOrganization: async () => ({}),
        getPerson: async () => ({}),
        listDeals: async (params) => {
          listCalls.push(params);
          return {
            data: [],
            pagination:
              listCalls.length === 1
                ? {
                    limit: 2,
                    moreItemsInCollection: false,
                    nextCursor: "deal-cursor-2",
                    nextStart: null,
                    start: null,
                  }
                : {
                    limit: 2,
                    moreItemsInCollection: false,
                    nextCursor: null,
                    nextStart: null,
                    start: null,
                  },
            relatedObjects: null,
          };
        },
      },
      maxPages: 3,
      params: { limit: 2, updatedSince: "2026-08-20T10:00:00.000Z" },
    });

    assert.equal(result.status, "ok");
    assert.equal(result.pagesRead, 0);
    assert.equal(result.recordsRead, 0);
    assert.equal(result.moreAvailable, false);
    assert.equal(result.nextCursor, null);
    assert.deepEqual(listCalls, []);
  });

  it("follows cursor pagination for bounded Pipedrive person pulls", async () => {
    const listCalls: unknown[] = [];
    const result = await pipedriveImport.importPipedrivePersonPages({
      client: {
        defaultLeadSource: "Pipedrive",
        getOrganization: async () => ({}),
        getPerson: async () => ({}),
        listPersons: async (params) => {
          listCalls.push(params);
          return {
            data: [],
            pagination:
              listCalls.length === 1
                ? {
                    limit: 2,
                    moreItemsInCollection: false,
                    nextCursor: "cursor-2",
                    nextStart: null,
                    start: null,
                  }
                : {
                    limit: 2,
                    moreItemsInCollection: false,
                    nextCursor: null,
                    nextStart: null,
                    start: null,
                  },
            relatedObjects: null,
          };
        },
      },
      maxPages: 3,
      params: { limit: 2, updatedSince: "2026-08-20T10:00:00.000Z" },
    });

    assert.equal(result.status, "ok");
    assert.equal(result.pagesRead, 2);
    assert.equal(result.recordsRead, 0);
    assert.equal(result.moreAvailable, false);
    assert.equal(result.nextCursor, null);
    assert.deepEqual(listCalls, [
      {
        limit: 2,
        sortBy: "update_time",
        sortDirection: "desc",
        updatedSince: "2026-08-20T10:00:00.000Z",
      },
      {
        cursor: "cursor-2",
        limit: 2,
        sortBy: "update_time",
        sortDirection: "desc",
        updatedSince: "2026-08-20T10:00:00.000Z",
      },
    ]);
  });

  it("imports Pipedrive persons as CRM contacts without creating opportunities", async () => {
    const result = await pipedriveImport.importPipedrivePersonPage({
      client: {
        defaultLeadSource: "Pipedrive",
        getOrganization: async (id) => ({
          id,
          name: "Contact Homes",
        }),
        getPerson: async () => ({}),
        listPersons: async () => ({
          data: [
            {
              emails: [{ primary: true, value: "casey@example.com" }],
              id: 123,
              name: "Casey Contact",
              org_id: 321,
              phones: [{ primary: true, value: "07123 111222" }],
            },
          ],
          pagination: {
            limit: 50,
            moreItemsInCollection: false,
            nextCursor: null,
            nextStart: null,
            start: null,
          },
          relatedObjects: null,
        }),
      },
    });

    assert.equal(result.status, "ok");
    assert.equal(result.created, 1);
    assert.equal(result.linkedExisting, 0);
    assert.equal(result.results[0]?.externalPersonId, "123");
    assert.equal(result.results[0]?.name, "Casey Contact");
    assert.equal(crmWriteLabels.includes("salesOpportunity.create"), false);
    assert.equal(crmWriteLabels.includes("salesCommunication.create"), false);
    assert.deepEqual(
      pipedriveImport.pipedrivePersonImportMetadataRows(result.results),
      [
        {
          companyId: "stub-id",
          contactId: "stub-id",
          createdCompany: true,
          createdContact: true,
          externalPersonId: "123",
          name: "Casey Contact",
          status: "created",
          warningCount: 0,
          warnings: [],
        },
      ],
    );
  });

  it("previews latest leads without writing CRM records", async () => {
    const listCalls: unknown[] = [];
    const result = await pipedriveImport.previewPipedriveLeadPage({
      client: {
        defaultLeadSource: "Pipedrive",
        getOrganization: async (id) => ({
          id,
          name: "Preview Homes",
        }),
        getPerson: async (id) => ({
          email: [{ primary: true, value: "pat@example.com" }],
          first_name: "Pat",
          id,
          last_name: "Lee",
          phone: [{ primary: true, value: "07123 456789" }],
        }),
        listLeads: async (params) => {
          listCalls.push(params);
          return {
            data: [
              {
                expected_close_date: "2026-09-20",
                id: "lead-preview",
                organization_id: 321,
                person_id: { id: 654 },
                title: "Preview retrofit",
                value: { amount: "500", currency: "GBP" },
              },
            ],
            pagination: {
              limit: 50,
              moreItemsInCollection: false,
              nextStart: null,
              start: 0,
            },
            relatedObjects: null,
          };
        },
      },
    });

    assert.equal(result.status, "ok");
    assert.deepEqual(listCalls, [{ limit: 50, sort: "update_time DESC" }]);
    assert.equal(result.wouldCreate, 1);
    assert.equal(result.linkedExisting, 0);
    assert.equal(result.skipped, 0);
    assert.equal(result.previews[0]?.status, "would_create");
    assert.equal(result.previews[0]?.title, "Preview retrofit");
    assert.equal(result.previews[0]?.companyName, "Preview Homes");
    assert.equal(result.previews[0]?.contactName, "Pat Lee");
    assert.equal(result.previews[0]?.contactEmail, "pat@example.com");
    assert.equal(result.previews[0]?.valueCents, 50000);
    assert.equal(
      result.previews[0]?.expectedCloseDate?.toISOString(),
      "2026-09-20T00:00:00.000Z",
    );
    assert.deepEqual(
      pipedriveImport.pipedriveLeadPreviewMetadataRows(result.previews),
      [
        {
          companyName: "Preview Homes",
          contactEmail: "pat@example.com",
          contactName: "Pat Lee",
          contactPhone: "07123 456789",
          currency: "GBP",
          expectedCloseDate: "2026-09-20",
          externalLeadId: "lead-preview",
          linkedOpportunityId: null,
          matchedCompanyId: null,
          matchedCompanyName: null,
          matchedContactId: null,
          matchedContactName: null,
          status: "would_create",
          title: "Preview retrofit",
          valueCents: 50000,
          warningCount: 0,
          warnings: [],
        },
      ],
    );
    assert.equal(crmWriteCalls, 0);
  });

  it("shows CRM company and contact matches in preview metadata without writing", async () => {
    companyRows = [{ id: "company-existing", name: "Preview Homes" }];
    contactRows = [
      {
        email: "pat@example.com",
        firstName: "Pat",
        id: "contact-existing",
        lastName: "Lee",
      },
    ];

    const result = await pipedriveImport.previewPipedriveLeadPage({
      client: {
        defaultLeadSource: "Pipedrive",
        getOrganization: async (id) => ({
          id,
          name: "Preview Homes",
        }),
        getPerson: async (id) => ({
          email: [{ primary: true, value: "pat@example.com" }],
          first_name: "Pat",
          id,
          last_name: "Lee",
        }),
        listLeads: async () => ({
          data: [
            {
              id: "lead-preview",
              organization_id: 321,
              person_id: { id: 654 },
              title: "Preview retrofit",
            },
          ],
          pagination: {
            limit: 50,
            moreItemsInCollection: false,
            nextStart: null,
            start: 0,
          },
          relatedObjects: null,
        }),
      },
    });

    assert.equal(result.status, "ok");
    assert.equal(result.wouldCreate, 1);
    assert.equal(result.previews[0]?.matchedCompanyId, "company-existing");
    assert.equal(result.previews[0]?.matchedCompanyName, "Preview Homes");
    assert.equal(result.previews[0]?.matchedContactId, "contact-existing");
    assert.equal(result.previews[0]?.matchedContactName, "Pat Lee");
    assert.deepEqual(
      pipedriveImport.pipedriveLeadPreviewMetadataRows(result.previews),
      [
        {
          companyName: "Preview Homes",
          contactEmail: "pat@example.com",
          contactName: "Pat Lee",
          contactPhone: null,
          currency: "GBP",
          expectedCloseDate: null,
          externalLeadId: "lead-preview",
          linkedOpportunityId: null,
          matchedCompanyId: "company-existing",
          matchedCompanyName: "Preview Homes",
          matchedContactId: "contact-existing",
          matchedContactName: "Pat Lee",
          status: "would_create",
          title: "Preview retrofit",
          valueCents: 0,
          warningCount: 0,
          warnings: [],
        },
      ],
    );
    assert.equal(crmWriteCalls, 0);
  });

  it("extracts only importable lead IDs from preview metadata", () => {
    assert.deepEqual(
      pipedriveImport.pipedriveImportablePreviewLeadIdsFromMetadata({
        previews: [
          { externalLeadId: "lead-create", status: "would_create" },
          { externalLeadId: "lead-linked", status: "linked_existing" },
          { externalLeadId: "lead-skipped", status: "skipped" },
          { externalLeadId: " lead-trimmed ", status: "would_create" },
          { externalLeadId: "", status: "would_create" },
          { externalLeadId: "lead-create", status: "would_create" },
        ],
      }),
      ["lead-create", "lead-trimmed"],
    );
    assert.deepEqual(
      pipedriveImport.pipedriveImportablePreviewLeadIdsFromMetadata(null),
      [],
    );
  });

  it("marks already linked Pipedrive leads as existing in preview", async () => {
    externalRecordLinkRows = [
      {
        externalId: "lead-linked",
        externalType: "lead",
        internalId: "opportunity-1",
        internalType: "salesOpportunity",
        provider: "pipedrive",
      },
    ];

    const result = await pipedriveImport.previewPipedriveLeadPage({
      client: {
        defaultLeadSource: "Pipedrive",
        getOrganization: async () => ({}),
        getPerson: async () => ({}),
        listLeads: async () => ({
          data: [{ id: "lead-linked", title: "Existing lead" }],
          pagination: {
            limit: 50,
            moreItemsInCollection: false,
            nextStart: null,
            start: 0,
          },
          relatedObjects: null,
        }),
      },
    });

    assert.equal(result.status, "ok");
    assert.equal(result.wouldCreate, 0);
    assert.equal(result.linkedExisting, 1);
    assert.equal(result.previews[0]?.status, "linked_existing");
    assert.equal(result.previews[0]?.linkedOpportunityId, "opportunity-1");
    assert.equal(crmWriteCalls, 0);
  });

  it("skips CRM-deleted Pipedrive leads in preview", async () => {
    externalRecordLinkRows = [
      {
        externalId: "lead-deleted",
        externalType: "lead",
        internalId: "opportunity-deleted",
        internalType: "salesOpportunityDeleted",
        provider: "pipedrive",
      },
    ];

    const result = await pipedriveImport.previewPipedriveLeadPage({
      client: {
        defaultLeadSource: "Pipedrive",
        getOrganization: async () => ({}),
        getPerson: async () => ({}),
        listLeads: async () => ({
          data: [{ id: "lead-deleted", title: "Deleted lead" }],
          pagination: {
            limit: 50,
            moreItemsInCollection: false,
            nextStart: null,
            start: 0,
          },
          relatedObjects: null,
        }),
      },
    });

    assert.equal(result.status, "ok");
    assert.equal(result.wouldCreate, 0);
    assert.equal(result.linkedExisting, 0);
    assert.equal(result.skipped, 1);
    assert.equal(result.previews[0]?.status, "skipped");
    assert.equal(result.previews[0]?.linkedOpportunityId, null);
    assert.deepEqual(result.previews[0]?.warnings, [
      "Pipedrive lead was previously deleted from CRM.",
    ]);
    assert.equal(crmWriteCalls, 0);
  });

  it("imports selected lead IDs after reading each Pipedrive lead once", async () => {
    const getLeadCalls: string[] = [];
    externalRecordLinkRows = [
      {
        externalId: "lead-a",
        externalType: "lead",
        internalId: "opportunity-a",
        internalType: "salesOpportunity",
        provider: "pipedrive",
      },
      {
        externalId: "lead-b",
        externalType: "lead",
        internalId: "opportunity-b",
        internalType: "salesOpportunity",
        provider: "pipedrive",
      },
    ];

    const result = await pipedriveImport.importPipedriveLeadIds({
      client: {
        defaultLeadSource: "Pipedrive",
        getLead: async (id) => {
          getLeadCalls.push(id);
          return { id, title: `Selected ${id}` };
        },
        getOrganization: async () => ({}),
        getPerson: async () => ({}),
      },
      leadIds: [" lead-a ", "lead-a", "", "lead-b"],
    });

    assert.equal(result.status, "ok");
    if (result.status !== "ok") throw new Error("Expected selected import");
    assert.deepEqual(getLeadCalls, ["lead-a", "lead-b"]);
    assert.equal(result.requested, 2);
    assert.equal(result.created, 0);
    assert.equal(result.linkedExisting, 2);
    assert.equal(result.skipped, 0);
    assert.deepEqual(
      result.results.map((leadResult) => leadResult.opportunityId),
      ["opportunity-a", "opportunity-b"],
    );
    assert.deepEqual(
      pipedriveImport.pipedriveLeadImportMetadataRows(result.results),
      [
        {
          companyId: null,
          contactId: null,
          createdCompany: false,
          createdContact: false,
          createdOpportunity: false,
          externalLeadId: "lead-a",
          opportunityId: "opportunity-a",
          status: "linked_existing",
          title: "Selected lead-a",
          warningCount: 0,
          warnings: [],
        },
        {
          companyId: null,
          contactId: null,
          createdCompany: false,
          createdContact: false,
          createdOpportunity: false,
          externalLeadId: "lead-b",
          opportunityId: "opportunity-b",
          status: "linked_existing",
          title: "Selected lead-b",
          warningCount: 0,
          warnings: [],
        },
      ],
    );
    assert.equal(crmWriteCalls, 2);
  });

  it("imports Pipedrive lead notes into linked CRM sale notes", async () => {
    const listNoteCalls: unknown[] = [];
    externalRecordLinkRows = [
      {
        externalId: "lead-notes",
        externalType: "lead",
        internalId: "opportunity-notes",
        internalType: "salesOpportunity",
        provider: "pipedrive",
      },
    ];

    const result = await pipedriveImport.importPipedriveLeadRecord({
      client: {
        defaultLeadSource: "Pipedrive",
        getOrganization: async () => ({}),
        getPerson: async () => ({}),
        listNotes: async (params) => {
          listNoteCalls.push(params);
          return {
            data: [
              {
                add_time: "2026-08-22T09:30:00Z",
                content: "<p>Survey booked</p><p>Customer wants Tuesday.</p>",
                id: 88,
                lead_id: "lead-notes",
                update_time: "2026-08-22T10:00:00Z",
                user: { id: 7, name: "Pipedrive User" },
              },
            ],
            pagination: {
              limit: 100,
              moreItemsInCollection: false,
              nextStart: null,
              start: 0,
            },
            relatedObjects: null,
          };
        },
      },
      lead: { id: "lead-notes", title: "Lead with note" },
      now: new Date("2026-08-24T12:00:00Z"),
    });

    assert.equal(result.status, "linked_existing");
    assert.deepEqual(listNoteCalls, [
      { leadId: "lead-notes", limit: 100, sort: "update_time DESC" },
    ]);
    assert.equal(salesCommunicationRows.length, 1);
    assert.equal(
      salesCommunicationRows[0]?.externalId,
      "pipedrive:note:88",
    );
    assert.equal(
      salesCommunicationRows[0]?.body,
      "Survey booked\n\nCustomer wants Tuesday.",
    );
    assert.equal(salesCommunicationRows[0]?.contactId, "contact-existing");
    assert.equal(salesCommunicationRows[0]?.opportunityId, "opportunity-notes");
  });

  it("updates existing Pipedrive lead notes instead of creating duplicates", async () => {
    externalRecordLinkRows = [
      {
        externalId: "lead-notes",
        externalType: "lead",
        internalId: "opportunity-notes",
        internalType: "salesOpportunity",
        provider: "pipedrive",
      },
    ];
    salesCommunicationRows = [
      {
        body: "Old note",
        externalId: "pipedrive:note:88",
        id: "sales-communication-existing",
        opportunityId: "opportunity-notes",
        summary: "Old note",
      },
    ];

    const result = await pipedriveImport.importPipedriveLeadRecord({
      client: {
        defaultLeadSource: "Pipedrive",
        getOrganization: async () => ({}),
        getPerson: async () => ({}),
        listNotes: async () => ({
          data: [
            {
              content: "<p>Updated survey note</p>",
              id: 88,
              lead_id: "lead-notes",
              update_time: "2026-08-23T10:00:00Z",
            },
          ],
          pagination: {
            limit: 100,
            moreItemsInCollection: false,
            nextStart: null,
            start: 0,
          },
          relatedObjects: null,
        }),
      },
      lead: { id: "lead-notes", title: "Lead with updated note" },
      now: new Date("2026-08-24T12:00:00Z"),
    });

    assert.equal(result.status, "linked_existing");
    assert.equal(salesCommunicationRows.length, 1);
    assert.equal(salesCommunicationRows[0]?.body, "Updated survey note");
    assert.equal(salesCommunicationRows[0]?.summary, "Updated survey note");
    assert.equal(
      crmWriteLabels.filter((label) => label === "salesCommunication.create")
        .length,
      0,
    );
    assert.equal(
      crmWriteLabels.filter((label) => label === "salesCommunication.update")
        .length,
      1,
    );
  });

  it("extracts Pipedrive Lead Inbox UUIDs from URLs or raw IDs", () => {
    const leadId = "3f214f00-9f9f-11f1-982e-6d2d290071c8";

    assert.equal(
      pipedriveImport.pipedriveLeadIdFromInput(
        `https://epcimprovements.pipedrive.com/leads/inbox/${leadId}`,
      ),
      leadId,
    );
    assert.equal(
      pipedriveImport.pipedriveLeadIdFromInput(
        `https://epcimprovements.pipedrive.com/lead/inbox/${leadId}?tab=notes`,
      ),
      leadId,
    );
    assert.equal(
      pipedriveImport.pipedriveLeadIdFromInput(leadId.toUpperCase()),
      leadId,
    );
    assert.equal(
      pipedriveImport.pipedriveLeadIdFromInput(
        "https://epcimprovements.pipedrive.com/deal/13059",
      ),
      null,
    );
  });

  it("does not recreate CRM-deleted Pipedrive leads during selected import", async () => {
    externalRecordLinkRows = [
      {
        externalId: "lead-deleted",
        externalType: "lead",
        internalId: "opportunity-deleted",
        internalType: "salesOpportunityDeleted",
        provider: "pipedrive",
      },
    ];

    const result = await pipedriveImport.importPipedriveLeadIds({
      client: {
        defaultLeadSource: "Pipedrive",
        getLead: async (id) => ({ id, title: `Selected ${id}` }),
        getOrganization: async () => ({}),
        getPerson: async () => ({}),
      },
      leadIds: ["lead-deleted"],
    });

    assert.equal(result.status, "ok");
    if (result.status !== "ok") throw new Error("Expected selected import");
    assert.equal(result.requested, 1);
    assert.equal(result.created, 0);
    assert.equal(result.linkedExisting, 0);
    assert.equal(result.skipped, 1);
    assert.deepEqual(crmWriteLabels, ["externalRecordLink.upsert"]);
    assert.deepEqual(
      pipedriveImport.pipedriveLeadImportMetadataRows(result.results),
      [
        {
          companyId: null,
          contactId: null,
          createdCompany: false,
          createdContact: false,
          createdOpportunity: false,
          externalLeadId: "lead-deleted",
          opportunityId: null,
          status: "skipped",
          title: "Selected lead-deleted",
          warningCount: 1,
          warnings: ["Pipedrive lead was previously deleted from CRM."],
        },
      ],
    );
  });

  it("skips selected deal IDs without reading Pipedrive or writing CRM sales", async () => {
    const getDealCalls: number[] = [];
    const result = await pipedriveImport.importPipedriveDealIds({
      client: {
        defaultLeadSource: "Pipedrive",
        getDeal: async (id) => {
          getDealCalls.push(id);
          return {
            currency: "GBP",
            expected_close_date: "2026-09-01",
            id,
            org_id: 25,
            person_id: 45,
            title: `Selected deal ${id}`,
            value: 2500,
          };
        },
        getOrganization: async (id) => ({
          id,
          name: "Deal Homes",
        }),
        getPerson: async (id) => ({
          email: [{ primary: true, value: "deal@example.com" }],
          id,
          name: "Dana Deal",
          phone: [{ primary: true, value: "07700 900456" }],
        }),
      },
      dealIds: ["13059", "13059", "bad"],
    });

    assert.equal(result.status, "ok");
    if (result.status !== "ok") throw new Error("Expected selected import");
    assert.deepEqual(getDealCalls, []);
    assert.equal(result.requested, 1);
    assert.equal(result.created, 0);
    assert.equal(result.linkedExisting, 0);
    assert.equal(result.skipped, 1);
    assert.equal(result.results[0]?.externalDealId, "13059");
    assert.equal(result.results[0]?.status, "skipped");
    assert.match(
      result.results[0]?.warnings[0] ?? "",
      /Pipedrive deal imports are disabled/,
    );
    assert.equal(crmWriteLabels.includes("salesOpportunity.create"), false);
    assert.equal(crmWriteLabels.includes("salesCommunication.create"), false);
    assert.equal(crmWriteLabels.includes("externalRecordLink.upsert"), false);
    assert.deepEqual(
      pipedriveImport.pipedriveDealImportMetadataRows(result.results),
      [
        {
          companyId: null,
          contactId: null,
          createdCompany: false,
          createdContact: false,
          createdOpportunity: false,
          externalDealId: "13059",
          opportunityId: null,
          status: "skipped",
          title: null,
          warningCount: 1,
          warnings: [
            "Pipedrive deal imports are disabled. CRM imports Pipedrive Lead Inbox records only.",
          ],
        },
      ],
    );
  });

  it("maps Pipedrive lead, person and organisation fields into CRM records", () => {
    const mapping = pipedriveImport.mapPipedriveLeadToCrm({
      defaultLeadSource: "Pipedrive Import",
      lead: {
        add_time: "2026-08-18T09:00:00Z",
        expected_close_date: "2026-09-01",
        id: "lead-1",
        person_id: { id: 456 },
        organization_id: 123,
        title: "Kitchen retrofit",
        update_time: "2026-08-19T10:00:00Z",
        value: { amount: "1234.56", currency: "GBP" },
      },
      organization: {
        address: "10 High Street",
        id: 123,
        name: "Acme Homes",
      },
      person: {
        email: [
          { primary: false, value: "old@example.com" },
          { primary: true, value: "jane@example.com" },
        ],
        first_name: "Jane",
        id: 456,
        last_name: "Smith",
        phone: [{ primary: true, value: "07700 900123" }],
      },
      workspaceCurrency: "GBP",
    });

    assert.deepEqual(mapping.externalIds, {
      deal: null,
      lead: "lead-1",
      organization: "123",
      person: "456",
    });
    assert.equal(mapping.company?.name, "Acme Homes");
    assert.equal(mapping.company?.addressLine1, "10 High Street");
    assert.equal(mapping.contact?.firstName, "Jane");
    assert.equal(mapping.contact?.lastName, "Smith");
    assert.equal(mapping.contact?.email, "jane@example.com");
    assert.equal(mapping.contact?.phoneNormalized, "+447700900123");
    assert.equal(mapping.contact?.leadSource, "Pipedrive Import");
    assert.equal(mapping.opportunity.title, "Kitchen retrofit");
    assert.equal(mapping.opportunity.currency, "GBP");
    assert.equal(mapping.opportunity.valueCents, 123456);
    assert.equal(
      mapping.opportunity.expectedCloseDate?.toISOString(),
      "2026-09-01T00:00:00.000Z",
    );
    assert.equal(mapping.communication.metadata.externalLeadId, "lead-1");
    assert.match(
      mapping.communication.body,
      /Imported from Pipedrive lead lead-1/,
    );
  });

  it("keeps legacy Pipedrive deal mapping deterministic without importing", () => {
    const mapping = pipedriveImport.mapPipedriveDealToCrm({
      deal: {
        add_time: "2026-08-18T09:00:00Z",
        currency: "GBP",
        expected_close_date: "2026-09-01",
        id: 13059,
        org_id: { id: 25, name: "Deal Homes" },
        person_id: {
          email: "dana@example.com",
          id: 45,
          name: "Dana Deal",
          phone: "07700 900456",
        },
        title: "Pipedrive fake deal",
        update_time: "2026-08-19T10:00:00Z",
        value: 2500,
      },
      defaultLeadSource: "Pipedrive Import",
      workspaceCurrency: "GBP",
    });

    assert.deepEqual(mapping.externalIds, {
      deal: "13059",
      lead: null,
      organization: "25",
      person: "45",
    });
    assert.equal(mapping.company?.name, "Deal Homes");
    assert.equal(mapping.contact?.firstName, "Dana");
    assert.equal(mapping.contact?.lastName, "Deal");
    assert.equal(mapping.contact?.email, "dana@example.com");
    assert.equal(mapping.contact?.phoneNormalized, "+447700900456");
    assert.equal(mapping.contact?.leadSource, "Pipedrive Import");
    assert.equal(mapping.opportunity.title, "Pipedrive fake deal");
    assert.equal(mapping.opportunity.currency, "GBP");
    assert.equal(mapping.opportunity.valueCents, 250000);
    assert.equal(
      mapping.opportunity.expectedCloseDate?.toISOString(),
      "2026-09-01T00:00:00.000Z",
    );
    assert.equal(mapping.communication.metadata.externalDealId, "13059");
    assert.match(
      mapping.communication.body,
      /Imported from Pipedrive deal 13059/,
    );
  });

  it("uses embedded related objects when separate reads are unavailable", () => {
    const mapping = pipedriveImport.mapPipedriveLeadToCrm({
      lead: {
        id: "99",
        organization_id: { id: 25, name: "Embedded Org" },
        person_id: {
          email: "sam@example.com",
          id: 45,
          name: "Sam Taylor",
          phone: "+441234567890",
        },
      },
      workspaceCurrency: "EUR",
    });

    assert.equal(mapping.externalIds.lead, "99");
    assert.equal(mapping.externalIds.organization, "25");
    assert.equal(mapping.externalIds.person, "45");
    assert.equal(mapping.company?.name, "Embedded Org");
    assert.equal(mapping.contact?.firstName, "Sam");
    assert.equal(mapping.contact?.lastName, "Taylor");
    assert.equal(mapping.opportunity.currency, "EUR");
    assert.equal(mapping.opportunity.source, "Pipedrive");
  });

  it("does not create a placeholder contact for organisation-only leads", () => {
    const mapping = pipedriveImport.mapPipedriveLeadToCrm({
      lead: {
        id: "lead-org-only",
        organization_id: { id: 12, name: "Org Only Ltd" },
        title: "Commercial enquiry",
      },
      workspaceCurrency: "GBP",
    });

    assert.equal(mapping.company?.name, "Org Only Ltd");
    assert.equal(mapping.contact, null);
    assert.equal(mapping.opportunity.title, "Commercial enquiry");
  });

  it("falls back safely when Pipedrive omits optional fields", () => {
    const mapping = pipedriveImport.mapPipedriveLeadToCrm({
      lead: { id: "lead-minimal" },
      workspaceCurrency: "GBP",
    });

    assert.equal(mapping.externalIds.lead, "lead-minimal");
    assert.equal(mapping.company, null);
    assert.equal(mapping.contact, null);
    assert.equal(mapping.opportunity.title, "Pipedrive lead lead-minimal");
    assert.equal(mapping.opportunity.valueCents, 0);
    assert.equal(mapping.opportunity.expectedCloseDate, null);
  });
});
