import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveInboxMessageAddresses } from "../src/lib/inbox/addresses";
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
    mailboxId: "mailbox-1",
    metadata: null,
    opportunity: null,
    provider: "gmail",
    receivedAt: new Date("2026-11-03T10:00:00.000Z"),
    salesCommunicationId: null,
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
    assert.equal(result.replyToAddress, "customer@example.com");
  });

  it("keeps the visible sender separate from a header reply-to address", () => {
    const result = serializeInboxMessageSummary(
      inboxRow({
        fromAddress: "mailer@example.net",
        headers: { "Reply-To": 'Customer <customer@example.com>' },
      }),
    );

    assert.equal(result.fromAddress, "mailer@example.net");
    assert.equal(result.replyToAddress, "customer@example.com");
    assert.equal(result.mailboxAddress, "craig@epc-improvements.co.uk");
  });

  it("uses the connected mailbox as the sender for existing outbound rows", () => {
    const result = serializeInboxMessageSummary(
      inboxRow({ direction: "OUTBOUND" }),
    );

    assert.equal(result.fromAddress, "craig@epc-improvements.co.uk");
  });

  it("reads the recipient display name from stored provider headers", () => {
    const result = resolveInboxMessageAddresses(
      inboxRow({ headers: { To: 'Craig McAllister <craig@example.com>' } }),
    );

    assert.equal(result.toName, "Craig McAllister");
  });

  it("keeps the linked sales communication available for focused AI replies", () => {
    const result = serializeInboxMessageSummary(
      inboxRow({ salesCommunicationId: "communication-1" }),
    );

    assert.equal(result.salesCommunicationId, "communication-1");
  });
});
