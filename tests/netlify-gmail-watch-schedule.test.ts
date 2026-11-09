import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import handler, {
  config,
} from "../netlify/functions/renew-gmail-watches.mjs";

const envNames = [
  "APP_BASE_URL",
  "CRON_SECRET",
  "DEPLOY_URL",
  "GMAIL_PUSH_ENABLED",
  "GMAIL_SYNC_SECRET",
  "GMAIL_WATCH_RENEWAL_LIMIT",
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

describe("scheduled Gmail watch renewal Netlify function", () => {
  it("runs hourly away from the normal sync minute", () => {
    assert.equal(config.schedule, "17 * * * *");
  });

  it("does not call the CRM until Gmail push is explicitly enabled", async () => {
    process.env.GMAIL_PUSH_ENABLED = "false";
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return Response.json({ ok: true });
    }) as typeof fetch;

    const response = await handler();

    assert.equal(called, false);
    assert.deepEqual(await response.json(), {
      ok: true,
      skipped: true,
      message: "Scheduled Gmail push renewal is disabled.",
    });
  });

  it("calls the protected bounded renewal route without mailbox details", async () => {
    process.env.GMAIL_PUSH_ENABLED = "true";
    process.env.GMAIL_SYNC_SECRET = "test-secret";
    process.env.APP_BASE_URL = "https://crm.example.test/";
    process.env.GMAIL_WATCH_RENEWAL_LIMIT = "99";
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    globalThis.fetch = (async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return Response.json({
        deferred: 1,
        failed: 0,
        ok: true,
        processed: 2,
        renewed: 2,
      });
    }) as typeof fetch;

    const response = await handler();

    assert.equal(
      requestUrl,
      "https://crm.example.test/api/maintenance/gmail-watch?limit=25&timeBudgetMs=20000",
    );
    assert.equal(
      new Headers(requestInit?.headers).get("authorization"),
      "Bearer test-secret",
    );
    assert.deepEqual(await response.json(), {
      endpoint: "/api/maintenance/gmail-watch",
      ok: true,
      status: 200,
      summary: { deferred: 1, failed: 0, processed: 2, renewed: 2 },
    });
  });

  it("requires the existing maintenance secret when enabled", async () => {
    process.env.GMAIL_PUSH_ENABLED = "true";
    delete process.env.GMAIL_SYNC_SECRET;
    delete process.env.CRON_SECRET;

    const response = await handler();

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: "GMAIL_SYNC_SECRET or CRON_SECRET is required.",
    });
  });
});
