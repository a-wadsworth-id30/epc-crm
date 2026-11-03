import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canPreserveGmailThread,
  isReplySenderOverride,
} from "../src/lib/inbox/sender-mailbox";

describe("email reply sender mailbox safety", () => {
  it("preserves an exact Gmail thread only in its original mailbox", () => {
    assert.equal(
      canPreserveGmailThread({
        messageMailboxId: "mailbox-sales",
        provider: "gmail",
        providerThreadId: "thread-1",
        selectedMailboxId: "mailbox-sales",
      }),
      true,
    );
    assert.equal(
      canPreserveGmailThread({
        messageMailboxId: "mailbox-sales",
        provider: "gmail",
        providerThreadId: "thread-1",
        selectedMailboxId: "mailbox-personal",
      }),
      false,
    );
  });

  it("does not reuse Gmail threading for another provider", () => {
    assert.equal(
      canPreserveGmailThread({
        messageMailboxId: "mailbox-sales",
        provider: "mailersend",
        providerThreadId: "thread-1",
        selectedMailboxId: "mailbox-sales",
      }),
      false,
    );
  });

  it("detects an explicit sender account change", () => {
    assert.equal(
      isReplySenderOverride("mailbox-personal", "mailbox-sales"),
      true,
    );
    assert.equal(
      isReplySenderOverride("mailbox-sales", "mailbox-sales"),
      false,
    );
    assert.equal(isReplySenderOverride(undefined, "mailbox-sales"), false);
  });
});
