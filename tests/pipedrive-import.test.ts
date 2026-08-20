import assert from "node:assert/strict";
import Module from "node:module";
import { before, beforeEach, describe, it } from "node:test";

type ModuleWithLoad = typeof Module & {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
};

type PipedriveImportModule = typeof import("../src/lib/integrations/pipedrive-import");

const moduleWithLoad = Module as ModuleWithLoad;
const originalLoad = moduleWithLoad._load;

let pipedriveImport: PipedriveImportModule;
let crmWriteCalls = 0;
let externalRecordLinkRows: Array<{
  externalId: string;
  externalType: string;
  internalId: string;
  internalType: string;
  provider: string;
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

async function recordCrmWrite() {
  crmWriteCalls += 1;
  return { id: "stub-id", name: "Stub record" };
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
          create: recordCrmWrite,
          findFirst: async () => null,
          findUnique: async () => null,
        },
        contact: {
          create: recordCrmWrite,
          findFirst: async () => null,
          findUnique: async () => null,
          update: recordCrmWrite,
        },
        externalRecordLink: {
          findUnique: findExternalRecordLink,
          upsert: recordCrmWrite,
        },
        salesCommunication: {
          create: recordCrmWrite,
        },
        salesOpportunity: {
          create: recordCrmWrite,
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
  externalRecordLinkRows = [];
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
    assert.deepEqual(pipedriveImport.pipedriveLeadPreviewMetadataRows(result.previews), [
      {
        companyName: "Preview Homes",
        contactEmail: "pat@example.com",
        contactName: "Pat Lee",
        contactPhone: "07123 456789",
        currency: "GBP",
        expectedCloseDate: "2026-09-20",
        externalLeadId: "lead-preview",
        linkedOpportunityId: null,
        status: "would_create",
        title: "Preview retrofit",
        valueCents: 50000,
        warningCount: 0,
        warnings: [],
      },
    ]);
    assert.equal(crmWriteCalls, 0);
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
    assert.equal(
      mapping.communication.metadata.externalLeadId,
      "lead-1",
    );
    assert.match(mapping.communication.body, /Imported from Pipedrive lead lead-1/);
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
