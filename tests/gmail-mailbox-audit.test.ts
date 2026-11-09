import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gmailMailboxConfigurationChanges } from "../src/lib/integrations/gmail-mailbox-audit";

describe("Gmail mailbox configuration audit", () => {
  const previous = {
    accessUserIds: ["user-b", "user-a"],
    ownerUserId: "owner-a",
    purpose: "SALES",
    sendEnabled: true,
    syncEnabled: true,
  };

  it("does not report changes for reordered or repeated access users", () => {
    assert.deepEqual(
      gmailMailboxConfigurationChanges(previous, {
        ...previous,
        accessUserIds: ["user-a", "user-b", "user-a"],
      }),
      {},
    );
  });

  it("records only fields that changed with before and after values", () => {
    assert.deepEqual(
      gmailMailboxConfigurationChanges(previous, {
        accessUserIds: ["user-c"],
        ownerUserId: "owner-b",
        purpose: "SUPPORT",
        sendEnabled: false,
        syncEnabled: true,
      }),
      {
        accessUserIds: {
          from: ["user-a", "user-b"],
          to: ["user-c"],
        },
        ownerUserId: { from: "owner-a", to: "owner-b" },
        purpose: { from: "SALES", to: "SUPPORT" },
        sendEnabled: { from: true, to: false },
      },
    );
  });
});
