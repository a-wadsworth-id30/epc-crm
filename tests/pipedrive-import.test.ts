import assert from "node:assert/strict";
import Module from "node:module";
import { before, describe, it } from "node:test";

type ModuleWithLoad = typeof Module & {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
};

type PipedriveImportModule = typeof import("../src/lib/integrations/pipedrive-import");

const moduleWithLoad = Module as ModuleWithLoad;
const originalLoad = moduleWithLoad._load;

let pipedriveImport: PipedriveImportModule;

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
      return {
        prisma: {
          $transaction: async (callback: unknown) => {
            if (typeof callback !== "function") return null;
            return callback({});
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
