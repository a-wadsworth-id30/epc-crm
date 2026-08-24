import assert from "node:assert/strict";
import Module from "node:module";
import { afterEach, before, describe, it } from "node:test";

type ModuleWithLoad = typeof Module & {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
};

type PipedriveModule = typeof import("../src/lib/integrations/pipedrive");

const moduleWithLoad = Module as ModuleWithLoad;
const originalLoad = moduleWithLoad._load;
const originalFetch = globalThis.fetch;

let pipedrive: PipedriveModule;

before(async () => {
  moduleWithLoad._load = function loadWithPipedriveStubs(
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
          integrationConnection: {
            findUnique: async () => null,
          },
        },
      };
    }

    return Reflect.apply(originalLoad, this, [request, parent, isMain]);
  };

  try {
    pipedrive = await import("../src/lib/integrations/pipedrive");
  } finally {
    moduleWithLoad._load = originalLoad;
  }
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Pipedrive read-only client", () => {
  it("uses GET requests with the x-api-token header", async () => {
    const requests: Array<{ init?: RequestInit; url: string }> = [];
    globalThis.fetch = (async (input, init) => {
      requests.push({ init, url: String(input) });
      return jsonResponse({
        data: { company_domain: "id30", id: 7 },
        success: true,
      });
    }) as typeof fetch;

    const client = createClient();
    const user = await client.getCurrentUser();

    assert.equal(user.id, 7);
    assert.equal(requests[0]?.url, "https://api.pipedrive.com/v1/users/me");
    assert.equal(requests[0]?.init?.method, "GET");
    assert.equal(requests[0]?.init?.cache, "no-store");
    assert.equal(headerValue(requests[0]?.init?.headers, "x-api-token"), "token");
  });

  it("normalizes lead list query parameters and pagination", async () => {
    const requests: Array<{ url: string }> = [];
    globalThis.fetch = (async (input) => {
      requests.push({ url: String(input) });
      return jsonResponse({
        additional_data: {
          pagination: {
            limit: 500,
            more_items_in_collection: true,
            next_start: 500,
            start: 0,
          },
        },
        data: [{ id: "lead-1", title: "Website enquiry" }],
        success: true,
      });
    }) as typeof fetch;

    const result = await createClient().listLeads({
      limit: 999,
      ownerId: 42,
      sort: "update_time DESC",
      start: -10,
      updatedSince: "2026-08-19T10:20:00.123Z",
    });
    const url = new URL(requests[0]!.url);

    assert.equal(url.pathname, "/v1/leads");
    assert.equal(url.searchParams.get("limit"), "500");
    assert.equal(url.searchParams.get("owner_id"), "42");
    assert.equal(url.searchParams.get("sort"), "update_time DESC");
    assert.equal(url.searchParams.get("start"), "0");
    assert.equal(
      url.searchParams.get("updated_since"),
      "2026-08-19T10:20:00Z",
    );
    assert.equal(result.data[0]?.title, "Website enquiry");
    assert.equal(result.pagination.moreItemsInCollection, true);
    assert.equal(result.pagination.nextStart, 500);
  });

  it("uses the v2 persons endpoint with cursor pagination", async () => {
    const requests: Array<{ url: string }> = [];
    globalThis.fetch = (async (input) => {
      requests.push({ url: String(input) });
      return jsonResponse({
        additional_data: {
          next_cursor: "cursor-2",
        },
        data: [{ id: 123, name: "Casey Contact" }],
        success: true,
      });
    }) as typeof fetch;

    const result = await createClient({
      apiBaseUrl: "https://example.pipedrive.com/api/v1/",
    }).listPersons({
      cursor: "cursor-1",
      limit: 999,
      organizationId: 42,
      sortBy: "update_time",
      sortDirection: "desc",
      updatedSince: "2026-08-20T10:20:00.456Z",
      updatedUntil: "2026-08-21T11:30:40.789Z",
    });
    const url = new URL(requests[0]!.url);

    assert.equal(url.pathname, "/api/v2/persons");
    assert.equal(url.searchParams.get("cursor"), "cursor-1");
    assert.equal(url.searchParams.get("limit"), "500");
    assert.equal(url.searchParams.get("org_id"), "42");
    assert.equal(url.searchParams.get("sort_by"), "update_time");
    assert.equal(url.searchParams.get("sort_direction"), "desc");
    assert.equal(
      url.searchParams.get("updated_since"),
      "2026-08-20T10:20:00Z",
    );
    assert.equal(
      url.searchParams.get("updated_until"),
      "2026-08-21T11:30:40Z",
    );
    assert.equal(result.data[0]?.name, "Casey Contact");
    assert.equal(result.pagination.nextCursor, "cursor-2");
  });

  it("lists lead notes through the v1 notes endpoint", async () => {
    const requests: Array<{ url: string }> = [];
    globalThis.fetch = (async (input) => {
      requests.push({ url: String(input) });
      return jsonResponse({
        additional_data: {
          pagination: {
            limit: 100,
            more_items_in_collection: false,
            next_start: null,
            start: 0,
          },
        },
        data: [{ content: "<p>Survey booked</p>", id: 88 }],
        success: true,
      });
    }) as typeof fetch;

    const result = await createClient().listNotes({
      leadId: "3f214f00-9f9f-11f1-982e-6d2d290071c8",
      limit: 999,
      sort: "update_time DESC",
      start: -5,
      updatedSince: "2026-08-20T10:20:00.456Z",
      updatedUntil: "2026-08-21T11:30:40.789Z",
    });
    const url = new URL(requests[0]!.url);

    assert.equal(url.pathname, "/v1/notes");
    assert.equal(
      url.searchParams.get("lead_id"),
      "3f214f00-9f9f-11f1-982e-6d2d290071c8",
    );
    assert.equal(url.searchParams.get("limit"), "500");
    assert.equal(url.searchParams.get("sort"), "update_time DESC");
    assert.equal(url.searchParams.get("start"), "0");
    assert.equal(
      url.searchParams.get("updated_since"),
      "2026-08-20T10:20:00Z",
    );
    assert.equal(
      url.searchParams.get("updated_until"),
      "2026-08-21T11:30:40Z",
    );
    assert.equal(result.data[0]?.id, 88);
    assert.equal(result.pagination.moreItemsInCollection, false);
  });

  it("uses the v2 deals endpoint with cursor pagination", async () => {
    const requests: Array<{ url: string }> = [];
    globalThis.fetch = (async (input) => {
      requests.push({ url: String(input) });
      return jsonResponse({
        additional_data: {
          next_cursor: "deal-cursor-2",
        },
        data: [{ id: 13059, title: "Fake deal" }],
        success: true,
      });
    }) as typeof fetch;

    const result = await createClient({
      apiBaseUrl: "https://example.pipedrive.com/api/v1/",
    }).listDeals({
      cursor: "deal-cursor-1",
      limit: 999,
      organizationId: 42,
      sortBy: "update_time",
      sortDirection: "desc",
      status: "open",
      updatedSince: "2026-08-20T10:20:00.456Z",
      updatedUntil: "2026-08-21T11:30:40.789Z",
    });
    const url = new URL(requests[0]!.url);

    assert.equal(url.pathname, "/api/v2/deals");
    assert.equal(url.searchParams.get("cursor"), "deal-cursor-1");
    assert.equal(url.searchParams.get("limit"), "500");
    assert.equal(url.searchParams.get("org_id"), "42");
    assert.equal(url.searchParams.get("sort_by"), "update_time");
    assert.equal(url.searchParams.get("sort_direction"), "desc");
    assert.equal(url.searchParams.get("status"), "open");
    assert.equal(
      url.searchParams.get("updated_since"),
      "2026-08-20T10:20:00Z",
    );
    assert.equal(
      url.searchParams.get("updated_until"),
      "2026-08-21T11:30:40Z",
    );
    assert.equal(result.data[0]?.title, "Fake deal");
    assert.equal(result.pagination.nextCursor, "deal-cursor-2");
  });

  it("uses the global API v2 path for the default persons endpoint", async () => {
    const requests: Array<{ url: string }> = [];
    globalThis.fetch = (async (input) => {
      requests.push({ url: String(input) });
      return jsonResponse({
        additional_data: { next_cursor: null },
        data: [],
        success: true,
      });
    }) as typeof fetch;

    await createClient().listPersons({ limit: 50 });

    assert.equal(
      requests[0]?.url,
      "https://api.pipedrive.com/api/v2/persons?limit=50",
    );
  });

  it("reads a single deal through the global API v2 path", async () => {
    const requests: Array<{ url: string }> = [];
    globalThis.fetch = (async (input) => {
      requests.push({ url: String(input) });
      return jsonResponse({
        data: { id: 13059, title: "Fake deal" },
        success: true,
      });
    }) as typeof fetch;

    const deal = await createClient().getDeal(13059);

    assert.equal(deal.title, "Fake deal");
    assert.equal(
      requests[0]?.url,
      "https://api.pipedrive.com/api/v2/deals/13059",
    );
  });

  it("supports company-domain API base URLs", async () => {
    const requests: Array<{ url: string }> = [];
    globalThis.fetch = (async (input) => {
      requests.push({ url: String(input) });
      return jsonResponse({
        data: { id: 123, name: "Acme" },
        success: true,
      });
    }) as typeof fetch;

    const client = createClient({
      apiBaseUrl: "https://example.pipedrive.com/api/v1/",
    });
    const organization = await client.getOrganization(123);

    assert.equal(organization.name, "Acme");
    assert.equal(
      requests[0]?.url,
      "https://example.pipedrive.com/api/v1/organizations/123",
    );
  });

  it("rejects blank record IDs before requesting Pipedrive", async () => {
    let requestCount = 0;
    globalThis.fetch = (async () => {
      requestCount += 1;
      return jsonResponse({ data: {}, success: true });
    }) as typeof fetch;

    await assert.rejects(
      () => createClient().getLead("   "),
      /Missing Pipedrive lead ID/,
    );
    assert.equal(requestCount, 0);
  });

  it("surfaces provider errors without exposing the API token", async () => {
    globalThis.fetch = (async () =>
      jsonResponse(
        {
          error: "Unauthorized",
          error_info: "The supplied token was rejected.",
          success: false,
        },
        { status: 401 },
      )) as typeof fetch;

    const client = createClient();

    await assert.rejects(
      () => client.getCurrentUser(),
      (error) => {
        assert.ok(error instanceof pipedrive.PipedriveApiError);
        assert.equal(error.status, 401);
        assert.equal(error.message, "Unauthorized");
        assert.equal(error.message.includes("token"), false);
        return true;
      },
    );
  });
});

function createClient(
  overrides: Partial<ConstructorParameters<typeof pipedrive.PipedriveReadOnlyClient>[0]> = {},
) {
  return new pipedrive.PipedriveReadOnlyClient(
    {
      apiBaseUrl: "https://api.pipedrive.com/v1",
      apiToken: "token",
      defaultLeadSource: "Pipedrive",
      lastContactSyncAt: null,
      lastFullDealSyncAt: null,
      lastFullDealSyncNextCursor: null,
      lastFullLeadSyncAt: null,
      lastFullLeadSyncNextStart: null,
      lastFullPersonSyncAt: null,
      lastFullPersonSyncNextCursor: null,
      lastLeadSyncAt: null,
      ...overrides,
    },
    { timeoutMs: 1_000 },
  );
}

function jsonResponse(payload: unknown, init: ResponseInit = {}) {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      headers: { "content-type": "application/json" },
      status: init.status ?? 200,
    }),
  );
}

function headerValue(headers: HeadersInit | undefined, key: string) {
  return new Headers(headers).get(key);
}
