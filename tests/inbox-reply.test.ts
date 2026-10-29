import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  inboxReplyRecipient,
  inboxReplySubject,
} from "../src/lib/inbox/reply";

describe("Inbox Gmail reply helpers", () => {
  it("replies to the sender of an inbound message", () => {
    assert.equal(
      inboxReplyRecipient({
        direction: "INBOUND",
        fromAddress: "customer@example.com",
        toAddress: "sales@example.com",
      }),
      "customer@example.com",
    );
  });

  it("keeps replying to the customer when an outbound thread message is selected", () => {
    assert.equal(
      inboxReplyRecipient({
        direction: "OUTBOUND",
        fromAddress: "sales@example.com",
        toAddress: "customer@example.com",
      }),
      "customer@example.com",
    );
  });

  it("normalizes repeated reply prefixes", () => {
    assert.equal(inboxReplySubject("Re: RE:  Project update"), "Re: Project update");
    assert.equal(inboxReplySubject(null), "Re: Your email");
  });
});
