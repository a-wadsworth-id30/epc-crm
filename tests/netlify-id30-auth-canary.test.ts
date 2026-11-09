import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import handler, { config } from "../netlify/functions/run-id30-auth-canary.mjs";

const originalFetch = globalThis.fetch;
const originalSecret = process.env.CRON_SECRET;
const originalUrl = process.env.APP_BASE_URL;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
  if (originalUrl === undefined) delete process.env.APP_BASE_URL;
  else process.env.APP_BASE_URL = originalUrl;
});

describe("scheduled iD30 Auth canary", () => {
  it("runs every ten minutes", () => assert.equal(config.schedule, "*/10 * * * *"));

  it("calls the protected route and returns only compact health data", async () => {
    process.env.CRON_SECRET = "test-secret";
    process.env.APP_BASE_URL = "https://crm.example.test";
    let requestUrl = "";
    globalThis.fetch = (async (input) => {
      requestUrl = String(input);
      return Response.json({ ok: true, durationMs: 42, roundTrip: true });
    }) as typeof fetch;

    const response = await handler();
    assert.equal(requestUrl, "https://crm.example.test/api/maintenance/id30-auth-canary");
    assert.deepEqual(await response.json(), {
      durationMs: 42,
      ok: true,
      roundTrip: true,
      status: 200,
    });
  });
});
