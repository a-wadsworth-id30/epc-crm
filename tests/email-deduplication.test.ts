import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deduplicateConversationEmailItems,
  emailInternetMessageIdentity,
  emailMessagesAreDuplicates,
} from "../src/lib/email/deduplication";

describe("email deduplication", () => {
  it("extracts a stable RFC Message-ID from provider headers", () => {
    assert.equal(
      emailInternetMessageIdentity({
        headers: { "Message-ID": " <ABC123@example.com> " },
      }),
      "abc123@example.com",
    );
  });

  it("matches cross-provider copies by Message-ID", () => {
    assert.equal(
      emailMessagesAreDuplicates(
        {
          body: "Pipedrive body",
          direction: "INBOUND",
          internetMessageId: "<same@example.com>",
          occurredAt: "2026-11-03T10:00:00.000Z",
        },
        {
          body: "Gmail body with different formatting",
          direction: "INBOUND",
          internetMessageId: "same@example.com",
          occurredAt: "2026-11-03T10:10:00.000Z",
        },
      ),
      true,
    );
  });

  it("uses a strict content and time fallback without hiding later replies", () => {
    const base = {
      body: "Thanks for your message",
      direction: "INBOUND",
      fromAddress: "customer@example.com",
      subject: "Re: Quote",
      toAddress: "sales@example.com",
    };

    assert.equal(
      emailMessagesAreDuplicates(
        { ...base, occurredAt: "2026-11-03T10:00:00.000Z" },
        { ...base, occurredAt: "2026-11-03T10:01:30.000Z" },
      ),
      true,
    );
    assert.equal(
      emailMessagesAreDuplicates(
        { ...base, occurredAt: "2026-11-03T10:00:00.000Z" },
        { ...base, occurredAt: "2026-11-03T10:05:00.000Z" },
      ),
      false,
    );
  });

  it("keeps the richer Gmail card when the conversation contains duplicates", () => {
    const items = deduplicateConversationEmailItems([
      {
        body: "Same message",
        channel: "EMAIL",
        direction: "INBOUND",
        emailIdentity: "same@example.com",
        emailProvider: "pipedrive",
        fromAddress: "customer@example.com",
        id: "pipedrive-card",
        occurredAt: "2026-11-03T10:00:00.000Z",
        subject: "Question",
        toAddress: "sales@example.com",
      },
      {
        body: "Same message",
        channel: "EMAIL",
        direction: "INBOUND",
        emailIdentity: "same@example.com",
        emailProvider: "gmail",
        fromAddress: "customer@example.com",
        fullEmailHtmlBody: "<p>Same message</p>",
        id: "gmail-card",
        occurredAt: "2026-11-03T10:00:00.000Z",
        subject: "Question",
        toAddress: "sales@example.com",
      },
    ]);

    assert.deepEqual(
      items.map((item) => item.id),
      ["gmail-card"],
    );
  });
});
