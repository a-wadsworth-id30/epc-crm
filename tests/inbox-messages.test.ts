import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { serializeInboxMessageSummary } from "../src/lib/inbox/messages";

type InboxSummaryRow = Parameters<typeof serializeInboxMessageSummary>[0];

function inboxRow(
  overrides: Partial<InboxSummaryRow> = {},
): InboxSummaryRow {
  return {
    contact: {
      email: "linked-contact@example.com",
      firstName: "Linked",
      lastName: "Contact",
    },
    direction: "INBOUND",
    fromAddress: null,
    fromName: null,
    headers: null,
    id: "message-1",
    inboundRouteId: null,
    mailbox: { emailAddress: "craig@epc-improvements.co.uk" },
    metadata: null,
    opportunity: null,
    provider: "gmail",
    receivedAt: new Date("2026-11-03T10:00:00.000Z"),
    status: "UNREAD",
    subject: "Imported message",
    summary: "Hello",
    toAddress: null,
    ...overrides,
  };
}

describe("inbox message serialization", () => {
  it("uses the linked contact for an existing inbound Gmail row with no sender", () => {
    const result = serializeInboxMessageSummary(inboxRow());

    assert.equal(result.fromAddress, "linked-contact@example.com");
    assert.equal(result.toAddress, "craig@epc-improvements.co.uk");
  });

  it("prefers the stored reply-to address when Gmail omitted from", () => {
    const result = serializeInboxMessageSummary(
      inboxRow({ metadata: { replyTo: 'Customer <customer@example.com>' } }),
    );

    assert.equal(result.fromAddress, "customer@example.com");
  });

  it("uses the connected mailbox as the sender for existing outbound rows", () => {
    const result = serializeInboxMessageSummary(
      inboxRow({ direction: "OUTBOUND" }),
    );

    assert.equal(result.fromAddress, "craig@epc-improvements.co.uk");
  });
});
