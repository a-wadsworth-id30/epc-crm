import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  gmailWatchRenewalState,
  gmailWatchRetryDelayMs,
} from "../src/lib/integrations/gmail-watch-policy";

describe("Gmail watch renewal policy", () => {
  const now = new Date("2026-11-09T12:00:00.000Z");

  it("renews missing and near-expiry watches but not healthy watches", () => {
    assert.equal(
      gmailWatchRenewalState({ expiresAt: null, retryAt: null }, now).due,
      true,
    );
    assert.equal(
      gmailWatchRenewalState(
        { expiresAt: "2026-11-11T11:59:59.000Z", retryAt: null },
        now,
      ).due,
      true,
    );
    assert.equal(
      gmailWatchRenewalState(
        { expiresAt: "2026-11-11T12:00:01.000Z", retryAt: null },
        now,
      ).due,
      false,
    );
  });

  it("keeps failed renewals cooling down until their retry time", () => {
    assert.equal(
      gmailWatchRenewalState(
        { expiresAt: null, retryAt: "2026-11-09T13:00:00.000Z" },
        now,
      ).coolingDown,
      true,
    );
    assert.equal(
      gmailWatchRenewalState(
        { expiresAt: null, retryAt: "2026-11-09T12:00:00.000Z" },
        now,
      ).coolingDown,
      false,
    );
  });

  it("backs off from one hour to a six-hour cap", () => {
    assert.equal(gmailWatchRetryDelayMs(1), 60 * 60 * 1_000);
    assert.equal(gmailWatchRetryDelayMs(2), 2 * 60 * 60 * 1_000);
    assert.equal(gmailWatchRetryDelayMs(20), 6 * 60 * 60 * 1_000);
  });
});
