import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gmailMailboxHealth } from "../src/lib/integrations/gmail-mailbox-health";

const now = new Date("2026-11-09T12:00:00.000Z");

function mailbox(
  overrides: Partial<Parameters<typeof gmailMailboxHealth>[0]> = {},
) {
  return {
    lastError: null,
    lastSyncAt: "2026-11-09T11:50:00.000Z",
    status: "CONNECTED" as const,
    syncEnabled: true,
    ...overrides,
  };
}

describe("Gmail mailbox health", () => {
  it("marks a recently synced connected mailbox as healthy", () => {
    assert.equal(gmailMailboxHealth(mailbox(), now).state, "healthy");
  });

  it("requires action when Google authorisation must be renewed", () => {
    assert.deepEqual(
      gmailMailboxHealth(
        mailbox({
          lastError: "Google authorisation expired.",
          status: "NEEDS_REAUTH",
        }),
        now,
      ),
      {
        canReconnect: true,
        detail: "Google authorisation expired.",
        label: "Reconnect required",
        state: "attention",
      },
    );
  });

  it("shows a connected mailbox with disabled imports as paused", () => {
    assert.equal(
      gmailMailboxHealth(mailbox({ syncEnabled: false }), now).state,
      "paused",
    );
  });

  it("distinguishes a first sync from a delayed sync", () => {
    assert.equal(
      gmailMailboxHealth(mailbox({ lastSyncAt: null }), now).state,
      "pending",
    );
    assert.equal(
      gmailMailboxHealth(
        mailbox({ lastSyncAt: "2026-11-09T11:00:00.000Z" }),
        now,
      ).state,
      "delayed",
    );
  });

  it("surfaces the latest connected sync warning", () => {
    const result = gmailMailboxHealth(
      mailbox({ lastError: "One inline attachment could not be retained." }),
      now,
    );
    assert.equal(result.state, "warning");
    assert.equal(result.detail, "One inline attachment could not be retained.");
  });
});
