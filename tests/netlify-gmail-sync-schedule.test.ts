import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import handler, {
  config,
} from "../netlify/functions/sync-gmail-mailboxes.mjs";

const envNames = [
  "APP_BASE_URL",
  "CRON_SECRET",
  "DEPLOY_URL",
  "GMAIL_SYNC_CRON_ENABLED",
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
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
  globalThis.fetch = originalFetch;
});

describe("scheduled Gmail sync Netlify function", () => {
  it("runs every 10 minutes", () => {
    assert.equal(config.schedule, "*/10 * * * *");
  });

  it("does not call the maintenance route while disabled", async () => {
    process.env.GMAIL_SYNC_CRON_ENABLED = "false";
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return Response.json({ ok: true });
    }) as typeof fetch;

    const response = await handler();

    assert.equal(response.status, 200);
    assert.equal(called, false);
    assert.deepEqual(await response.json(), {
      ok: true,
      skipped: true,
      message: "Scheduled Gmail sync is disabled.",
    });
  });

  it("rejects an enabled schedule without a maintenance secret", async () => {
    process.env.GMAIL_SYNC_CRON_ENABLED = "true";
    delete process.env.GMAIL_SYNC_SECRET;
    delete process.env.CRON_SECRET;

    const response = await handler();

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: "GMAIL_SYNC_SECRET or CRON_SECRET is required.",
    });
  });

  it("calls the protected production route without exposing mailbox details", async () => {
    process.env.GMAIL_SYNC_CRON_ENABLED = "true";
    process.env.GMAIL_SYNC_SECRET = "gmail-test-secret";
    process.env.APP_BASE_URL = "https://crm.example.test/";
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    globalThis.fetch = (async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return Response.json({
        ok: true,
        processed: 2,
        failed: 0,
        results: [
          { emailAddress: "private@example.test", ok: true },
          { emailAddress: "shared@example.test", ok: true },
        ],
      });
    }) as typeof fetch;

    const response = await handler();
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(requestUrl, "https://crm.example.test/api/maintenance/gmail-sync");
    assert.equal(requestInit?.method, "POST");
    assert.equal(
      new Headers(requestInit?.headers).get("authorization"),
      "Bearer gmail-test-secret",
    );
    assert.deepEqual(body, {
      ok: true,
      status: 200,
      endpoint: "/api/maintenance/gmail-sync",
      summary: { failed: 0, processed: 2, succeeded: 2 },
    });
    assert.equal(JSON.stringify(body).includes("private@example.test"), false);
  });

  it("returns a gateway error when the maintenance route fails", async () => {
    process.env.GMAIL_SYNC_CRON_ENABLED = "true";
    process.env.CRON_SECRET = "shared-test-secret";
    process.env.URL = "https://crm.example.test";
    globalThis.fetch = (async () =>
      Response.json(
        { ok: false, processed: 1, failed: 1, results: [{ ok: false }] },
        { status: 502 },
      )) as typeof fetch;

    const response = await handler();

    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      ok: false,
      status: 502,
      endpoint: "/api/maintenance/gmail-sync",
      summary: { failed: 1, processed: 1, succeeded: 0 },
    });
  });
});
