import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  gmailProviderMessageId,
  reconciledGmailSendMetadata,
} from "../src/lib/integrations/gmail-message-identity";

describe("Gmail send reconciliation", () => {
  it("uses the same stable provider identity for send and later sync", () => {
    assert.equal(
      gmailProviderMessageId("mailbox-1", "gmail-message-1"),
      "gmail:mailbox-1:gmail-message-1",
    );
  });

  it("preserves provider sync metadata while recording the CRM send", () => {
    assert.deepEqual(
      reconciledGmailSendMetadata({
        existing: {
          gmailHistoryId: "history-1",
          gmailLabelIds: ["SENT"],
          source: "gmail-sync",
        },
        fromEmail: "sales@example.test",
        gmailMessageId: "gmail-message-1",
        gmailThreadId: "gmail-thread-1",
        mailboxId: "mailbox-1",
        source: "inbox-gmail-reply",
      }),
      {
        fromEmail: "sales@example.test",
        gmailHistoryId: "history-1",
        gmailLabelIds: ["SENT"],
        gmailMessageId: "gmail-message-1",
        gmailThreadId: "gmail-thread-1",
        mailboxId: "mailbox-1",
        messageId: "gmail:mailbox-1:gmail-message-1",
        provider: "gmail",
        sendState: "sent",
        source: "inbox-gmail-reply",
      },
    );
  });
});
