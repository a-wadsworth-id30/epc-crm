import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  gmailMailboxErrorFromAuth,
  gmailMailboxStatusFromAuth,
} from "../src/lib/integrations/gmail-connection-status";
import { gmailConnectionReconciliationStatus } from "../src/lib/integrations/gmail-connection-operations";

describe("Gmail connection reconciliation", () => {
  it("maps Auth connection states onto CRM mailbox states", () => {
    assert.equal(gmailMailboxStatusFromAuth("CONNECTED", false), "CONNECTED");
    assert.equal(
      gmailMailboxStatusFromAuth("NEEDS_REAUTH", true),
      "NEEDS_REAUTH",
    );
    assert.equal(
      gmailMailboxStatusFromAuth("DISCONNECTED", true),
      "DISCONNECTED",
    );
    assert.equal(gmailMailboxStatusFromAuth("FAILED", true), "NEEDS_REAUTH");
    assert.equal(gmailMailboxStatusFromAuth("FAILED", false), "ERROR");
  });

  it("clears stale errors after recovery and bounds provider errors", () => {
    assert.equal(
      gmailMailboxErrorFromAuth({
        authStatus: "CONNECTED",
        lastError: "old error",
        reconnectRequired: false,
      }),
      null,
    );
    assert.equal(
      gmailMailboxErrorFromAuth({
        authStatus: "NEEDS_REAUTH",
        lastError: null,
        reconnectRequired: true,
      }),
      "Reconnect this Gmail mailbox through iD30 Auth.",
    );
    assert.equal(
      gmailMailboxErrorFromAuth({
        authStatus: "FAILED",
        lastError: "x".repeat(600),
        reconnectRequired: false,
      })?.length,
      500,
    );
  });

  it("reports warnings without treating reconnect-required mailboxes as job failures", () => {
    const base = {
      changed: 0,
      checked: 1,
      connected: 1,
      deferred: 0,
      disconnected: 0,
      failed: 0,
      reconnectRequired: 0,
    };
    assert.equal(gmailConnectionReconciliationStatus(base), "SUCCESS");
    assert.equal(
      gmailConnectionReconciliationStatus({
        ...base,
        connected: 0,
        reconnectRequired: 1,
      }),
      "WARNING",
    );
    assert.equal(
      gmailConnectionReconciliationStatus({ ...base, connected: 0, failed: 1 }),
      "ERROR",
    );
  });
});
