import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emailReplyDraftKey,
  readEmailReplyDraft,
  removeEmailReplyDraft,
  writeEmailReplyDraft,
} from "../src/lib/email/reply-drafts";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("email reply drafts", () => {
  it("isolates and restores a draft by user and message", () => {
    const storage = memoryStorage();
    const saved = writeEmailReplyDraft(storage, "user-1", "message-1", {
      body: "Hello Craig",
      htmlBody: "<p>Hello <strong>Craig</strong></p>",
      mailboxId: "mailbox-1",
      recipient: "craig@example.com",
      subject: "Re: Enquiry",
    }, new Date("2026-11-06T12:00:00.000Z"));

    assert.ok(saved);
    assert.equal(
      readEmailReplyDraft(storage, "user-1", "message-1", Date.parse("2026-11-06T12:01:00.000Z"))?.body,
      "Hello Craig",
    );
    assert.equal(readEmailReplyDraft(storage, "user-2", "message-1"), null);
  });

  it("removes empty, expired and explicitly discarded drafts", () => {
    const storage = memoryStorage();
    writeEmailReplyDraft(storage, "user", "message", {
      body: "Draft",
      htmlBody: "<p>Draft</p>",
      mailboxId: "mailbox",
      recipient: "lead@example.com",
      subject: "Subject",
    }, new Date("2026-10-01T00:00:00.000Z"));

    assert.equal(readEmailReplyDraft(storage, "user", "message", Date.parse("2026-11-06T00:00:00.000Z")), null);
    assert.equal(storage.getItem(emailReplyDraftKey("user", "message")), null);

    writeEmailReplyDraft(storage, "user", "message", {
      body: "Draft",
      htmlBody: "<p>Draft</p>",
      mailboxId: "mailbox",
      recipient: "lead@example.com",
      subject: "Subject",
    });
    removeEmailReplyDraft(storage, "user", "message");
    assert.equal(storage.getItem(emailReplyDraftKey("user", "message")), null);
  });
});
