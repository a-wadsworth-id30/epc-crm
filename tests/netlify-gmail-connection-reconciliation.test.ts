import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import handler, {
  config,
} from "../netlify/functions/reconcile-gmail-connections.mjs";

const envNames = [
  "APP_BASE_URL",
  "CRON_SECRET",
  "DEPLOY_URL",
  "GMAIL_SYNC_SECRET",
  "NEXT_PUBLIC_APP_URL",
  "URL",
] as const;
const originalEnv = Object.fromEntries(
  envNames.map((name) => [name, process.env[name]]),
);
const originalFetch = globalThis.fetch;

afterEach(() => {
  for (const name of envNames) {
    const value = originalEnv[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  globalThis.fetch = originalFetch;
});

describe("scheduled Gmail connection reconciliation", () => {
  it("runs every 15 minutes", () => {
    assert.equal(config.schedule, "*/15 * * * *");
  });

  it("requires the existing protected Gmail maintenance secret", async () => {
    delete process.env.GMAIL_SYNC_SECRET;
    delete process.env.CRON_SECRET;
    process.env.APP_BASE_URL = "https://crm.example.test";

    const response = await handler();
    assert.equal(response.status, 500);
  });

  it("calls the protected reconciliation route without mailbox details", async () => {
    process.env.GMAIL_SYNC_SECRET = "gmail-test-secret";
    process.env.APP_BASE_URL = "https://crm.example.test/";
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    globalThis.fetch = (async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return Response.json({ changed: 1, checked: 2, failed: 0, ok: true });
    }) as typeof fetch;

    const response = await handler();
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(
      requestUrl,
      "https://crm.example.test/api/maintenance/gmail-connections?limit=25&timeBudgetMs=20000",
    );
    assert.equal(
      new Headers(requestInit?.headers).get("authorization"),
      "Bearer gmail-test-secret",
    );
    assert.deepEqual(body, {
      ok: true,
      summary: { changed: 1, checked: 2, failed: 0, status: 200 },
    });
    assert.equal(JSON.stringify(body).includes("@"), false);
  });
});
