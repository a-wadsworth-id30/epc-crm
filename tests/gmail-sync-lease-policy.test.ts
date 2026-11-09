import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  gmailSyncLeaseDurationMs,
  gmailSyncLeaseExpiresAt,
  gmailSyncLeaseIsActive,
} from "../src/lib/integrations/gmail-sync-lease-policy";

describe("Gmail sync lease policy", () => {
  it("uses a bounded five-minute lease", () => {
    const now = new Date("2026-11-09T10:00:00.000Z");

    assert.equal(gmailSyncLeaseDurationMs, 5 * 60 * 1_000);
    assert.equal(
      gmailSyncLeaseExpiresAt(now).toISOString(),
      "2026-11-09T10:05:00.000Z",
    );
  });

  it("treats only future lease expiries as active", () => {
    const now = new Date("2026-11-09T10:00:00.000Z");

    assert.equal(
      gmailSyncLeaseIsActive(new Date("2026-11-09T10:00:00.001Z"), now),
      true,
    );
    assert.equal(gmailSyncLeaseIsActive(now, now), false);
    assert.equal(gmailSyncLeaseIsActive(null, now), false);
  });
});
