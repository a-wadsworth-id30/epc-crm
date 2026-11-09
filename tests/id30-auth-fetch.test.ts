import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  fetchId30AuthWithResilience,
  resetId30AuthCircuitForTests,
} from "../src/lib/integrations/id30-auth-fetch";

afterEach(() => resetId30AuthCircuitForTests());

describe("iD30 Auth resilient fetch", () => {
  it("retries safe GET requests and rebuilds the request each time", async () => {
    let fetches = 0;
    let requestInitializations = 0;
    const result = await fetchId30AuthWithResilience({
      fetchImpl: async () => {
        fetches += 1;
        return fetches === 1
          ? new Response("unavailable", { status: 503 })
          : Response.json({ ok: true });
      },
      maxAttempts: 2,
      method: "GET",
      requestInit: (signal) => {
        requestInitializations += 1;
        return { headers: { "x-request": String(requestInitializations) }, signal };
      },
      retryDelayMs: 0,
      url: new URL("https://auth-retry.example/api/crm/providers"),
    });

    assert.equal(result.ok, true);
    assert.equal(result.attempts, 2);
    assert.equal(fetches, 2);
    assert.equal(requestInitializations, 2);
  });

  it("never automatically retries a POST request", async () => {
    let fetches = 0;
    const result = await fetchId30AuthWithResilience({
      fetchImpl: async () => {
        fetches += 1;
        return new Response("unavailable", { status: 503 });
      },
      maxAttempts: 3,
      method: "POST",
      requestInit: () => ({ body: "{}" }),
      retryDelayMs: 0,
      url: new URL("https://auth-post.example/api/crm/send"),
    });

    assert.equal(result.ok, true);
    assert.equal(result.attempts, 1);
    assert.equal(fetches, 1);
  });

  it("bounds a stalled request with a timeout", async () => {
    const result = await fetchId30AuthWithResilience({
      fetchImpl: (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
      maxAttempts: 1,
      method: "GET",
      requestInit: () => ({}),
      timeoutMs: 5,
      url: new URL("https://auth-timeout.example/api/crm/providers"),
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "timeout");
      assert.equal(result.status, 503);
    }
  });

  it("opens the circuit after repeated transient failures", async () => {
    let fetches = 0;
    const request = () =>
      fetchId30AuthWithResilience({
        circuitFailureThreshold: 2,
        circuitOpenMs: 10_000,
        fetchImpl: async () => {
          fetches += 1;
          throw new Error("offline");
        },
        maxAttempts: 1,
        method: "GET",
        requestInit: () => ({}),
        url: new URL("https://auth-circuit.example/api/crm/providers"),
      });

    await request();
    await request();
    const blocked = await request();

    assert.equal(fetches, 2);
    assert.equal(blocked.ok, false);
    if (!blocked.ok) {
      assert.equal(blocked.reason, "circuit-open");
      assert.equal(blocked.attempts, 0);
    }
  });
});
