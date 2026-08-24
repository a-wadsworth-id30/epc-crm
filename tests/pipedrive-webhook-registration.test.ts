import assert from "node:assert/strict";
import Module from "node:module";
import { afterEach, before, beforeEach, describe, it } from "node:test";

type ModuleWithLoad = typeof Module & {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
};

type PipedriveWebhookRegistrationModule =
  typeof import("../src/lib/integrations/pipedrive-webhook-registration");

const moduleWithLoad = Module as ModuleWithLoad;
const originalFetch = globalThis.fetch;
const testAppBaseUrl = "https://crm.example.test";
const testReceiverUrl = `${testAppBaseUrl}/api/webhooks/pipedrive`;

let pipedriveWebhookRegistration: PipedriveWebhookRegistrationModule;
let runtimeConfig: {
  apiBaseUrl: string;
  apiToken: string | null;
};
let requests: Array<{ body: unknown; method: string; url: string }>;

before(async () => {
  const originalLoad = moduleWithLoad._load;

  moduleWithLoad._load = function loadWithPipedriveRegistrationStubs(
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
        getPipedriveRuntimeConfig: async () => runtimeConfig,
        pipedriveProvider: "pipedrive",
      };
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    pipedriveWebhookRegistration = await import(
      "../src/lib/integrations/pipedrive-webhook-registration"
    );
  } finally {
    moduleWithLoad._load = originalLoad;
  }
});

beforeEach(() => {
  runtimeConfig = {
    apiBaseUrl: "https://api.pipedrive.com/v1",
    apiToken: "token",
  };
  requests = [];
  process.env.APP_BASE_URL = testAppBaseUrl;
  process.env.PIPEDRIVE_WEBHOOK_BASIC_USER = "crm";
  process.env.PIPEDRIVE_WEBHOOK_SECRET = "receiver-secret";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.APP_BASE_URL;
  delete process.env.PIPEDRIVE_WEBHOOK_BASIC_USER;
  delete process.env.PIPEDRIVE_WEBHOOK_SECRET;
  delete process.env.PIPEDRIVE_WEBHOOK_SUBSCRIPTION_URL;
});

describe("Pipedrive webhook registration", () => {
  it("previews missing webhooks with a GET-only Pipedrive check", async () => {
    globalThis.fetch = (async (input, init) => {
      requests.push({
        body: init?.body ? JSON.parse(String(init.body)) : null,
        method: init?.method ?? "GET",
        url: String(input),
      });

      return jsonResponse({
        data: [
          {
            event_action: "create",
            event_object: "lead",
            id: 1,
            is_active: 1,
            name: "Existing lead create",
            subscription_url: testReceiverUrl,
            version: "2.0",
          },
          {
            event_action: "added",
            event_object: "persons",
            id: 2,
            is_active: 1,
            name: "Existing person create",
            subscription_url: testReceiverUrl,
            version: "2.0",
          },
          {
            event_action: "create",
            event_object: "organization",
            id: 3,
            is_active: 1,
            name: "Other event",
            subscription_url: testReceiverUrl,
            version: "2.0",
          },
        ],
        success: true,
      });
    }) as typeof fetch;

    const result =
      await pipedriveWebhookRegistration.planPipedriveWebhookRegistration();

    assert.equal(result.status, "READY");
    assert.equal(result.missingWebhooks.length, 4);
    assert.equal(result.pipedriveWritesPerformed, 0);
    assert.deepEqual(
      requests.map((request) => request.method),
      ["GET"],
    );
  });

  it("does not create provider webhooks without explicit write approval", async () => {
    globalThis.fetch = (async (input, init) => {
      requests.push({
        body: init?.body ? JSON.parse(String(init.body)) : null,
        method: init?.method ?? "GET",
        url: String(input),
      });

      return jsonResponse({ data: [], success: true });
    }) as typeof fetch;

    const result =
      await pipedriveWebhookRegistration.runPipedriveWebhookRegistration({
        providerWriteApproval: null,
      });

    assert.equal(result.status, "WARNING");
    assert.equal(result.pipedriveWritesPerformed, 0);
    assert.equal(result.pipedriveWritesRequired, 6);
    assert.deepEqual(
      requests.map((request) => request.method),
      ["GET"],
    );
  });

  it("creates only missing deal, lead and person webhooks when explicitly approved", async () => {
    globalThis.fetch = (async (input, init) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({
        body,
        method: init?.method ?? "GET",
        url: String(input),
      });

      if ((init?.method ?? "GET") === "GET") {
        return jsonResponse({
          data: [
            {
              event_action: "create",
              event_object: "lead",
              id: 1,
              is_active: 1,
              name: "Existing lead create",
              subscription_url: testReceiverUrl,
              version: "2.0",
            },
          ],
          success: true,
        });
      }

      return jsonResponse(
        {
          data: {
            event_action: body.event_action,
            event_object: body.event_object,
            id: 100,
            is_active: 1,
            name: body.name,
            subscription_url: body.subscription_url,
            version: "2.0",
          },
          success: true,
        },
        { status: 201 },
      );
    }) as typeof fetch;

    const result =
      await pipedriveWebhookRegistration.runPipedriveWebhookRegistration({
        providerWriteApproval:
          pipedriveWebhookRegistration.pipedriveWebhookRegistrationApproval,
      });
    const postBodies = requests
      .filter((request) => request.method === "POST")
      .map((request) => request.body as Record<string, unknown>);

    assert.equal(result.status, "SUCCESS");
    assert.equal(result.createdWebhooks.length, 5);
    assert.equal(result.pipedriveWritesPerformed, 5);
    assert.deepEqual(
      postBodies.map((body) => `${body.event_action}.${body.event_object}`),
      [
        "create.deal",
        "change.deal",
        "change.lead",
        "create.person",
        "change.person",
      ],
    );
    assert.ok(
      postBodies.every(
        (body) =>
          body.http_auth_user === "crm" &&
          body.http_auth_password === "receiver-secret" &&
          body.subscription_url === testReceiverUrl &&
          body.version === "2.0",
      ),
    );
  });
});

function jsonResponse(payload: unknown, init: ResponseInit = {}) {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      headers: { "content-type": "application/json" },
      status: init.status ?? 200,
    }),
  );
}
