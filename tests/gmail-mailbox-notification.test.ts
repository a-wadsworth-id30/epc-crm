import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gmailMailboxHealthNotification } from "../src/lib/integrations/gmail-mailbox-notification";

function mailbox(
  overrides: Partial<Parameters<typeof gmailMailboxHealthNotification>[0][number]> = {},
) {
  return {
    lastError: null,
    lastSyncAt: new Date("2026-11-09T09:50:00.000Z"),
    status: "CONNECTED" as const,
    syncEnabled: true,
    ...overrides,
  };
}

describe("Gmail mailbox health notifications", () => {
  const now = new Date("2026-11-09T10:00:00.000Z");

  it("does not alert for healthy, paused or first-sync mailboxes", () => {
    assert.equal(
      gmailMailboxHealthNotification(
        [mailbox(), mailbox({ syncEnabled: false }), mailbox({ lastSyncAt: null })],
        now,
      ),
      null,
    );
  });

  it("creates a critical privacy-safe alert for reconnect states", () => {
    assert.deepEqual(
      gmailMailboxHealthNotification(
        [mailbox({ lastSyncAt: null, status: "NEEDS_REAUTH" })],
        now,
      ),
      {
        detail:
          "1 requires reconnection or connection review. Open Gmail settings to review the affected mailbox.",
        severity: "critical",
        title: "Gmail mailbox needs attention",
      },
    );
  });

  it("summarizes delayed and warning mailboxes without exposing identities", () => {
    const result = gmailMailboxHealthNotification(
      [
        mailbox({ lastSyncAt: new Date("2026-11-09T09:00:00.000Z") }),
        mailbox({ lastError: "Provider temporarily unavailable" }),
      ],
      now,
    );

    assert.deepEqual(result, {
      detail:
        "1 is delayed; 1 has a sync warning. Open Gmail settings to review the affected mailboxes.",
      severity: "warning",
      title: "Gmail mailboxes need attention",
    });
    assert.equal(JSON.stringify(result).includes("Provider temporarily unavailable"), false);
  });
});
