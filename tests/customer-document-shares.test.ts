import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCustomerDocumentShareEmailContent } from "../src/lib/customer-document-share-email-content";
import {
  customerDocumentShareExpiryDate,
  customerDocumentShareMaxExpiryDays,
  customerDocumentShareState,
  customerDocumentShareTokenHash,
  customerDocumentShareUrl,
  generateCustomerDocumentShareToken,
} from "../src/lib/customer-document-shares";

describe("customer document shares", () => {
  it("generates opaque tokens and stores only stable hashes", () => {
    const token = generateCustomerDocumentShareToken();
    const hash = customerDocumentShareTokenHash(token);

    assert.ok(token.length >= 40);
    assert.match(hash, /^[a-f0-9]{64}$/);
    assert.equal(customerDocumentShareTokenHash(token), hash);
    assert.notEqual(hash, token);
  });

  it("builds public share URLs without exposing query parameters", () => {
    const url = customerDocumentShareUrl({
      baseUrl: "https://crm.id30.com",
      token: "abc_123",
    });

    assert.equal(url, "https://crm.id30.com/share/abc_123");
  });

  it("clamps expiry dates to the allowed range", () => {
    const now = new Date("2026-08-03T10:00:00.000Z");
    const expiresAt = customerDocumentShareExpiryDate({
      days: 999,
      now,
    });

    assert.equal(
      expiresAt.toISOString(),
      new Date(
        now.getTime() +
          customerDocumentShareMaxExpiryDays * 24 * 60 * 60 * 1000,
      ).toISOString(),
    );
  });

  it("derives share state from status and expiry", () => {
    const now = new Date("2026-08-03T10:00:00.000Z");

    assert.equal(
      customerDocumentShareState({
        expiresAt: new Date("2026-08-04T10:00:00.000Z"),
        now,
        status: "OPEN",
      }),
      "open",
    );
    assert.equal(
      customerDocumentShareState({
        expiresAt: new Date("2026-08-02T10:00:00.000Z"),
        now,
        status: "OPEN",
      }),
      "expired",
    );
    assert.equal(
      customerDocumentShareState({
        expiresAt: new Date("2026-08-04T10:00:00.000Z"),
        now,
        status: "REVOKED",
      }),
      "revoked",
    );
  });

  it("builds recipient email content with the secure share link", () => {
    const content = buildCustomerDocumentShareEmailContent({
      documentNames: ["Quotation.pdf", "Floor Plans & Drawings.pdf"],
      expiresAt: new Date("2026-08-07T16:30:00.000Z"),
      message: "Please review these before our call.",
      recipientName: "Alex",
      shareUrl: "https://crm.id30.com/share/test_token",
      subject: "Documents for review",
    });

    assert.equal(content.subject, "Documents for review");
    assert.match(content.text, /Hi Alex,/);
    assert.match(content.text, /https:\/\/crm\.id30\.com\/share\/test_token/);
    assert.match(content.text, /- Quotation\.pdf/);
    assert.match(content.text, /- Floor Plans & Drawings\.pdf/);
    assert.match(content.text, /Please review these before our call\./);
    assert.match(
      content.html,
      /<a href="https:\/\/crm\.id30\.com\/share\/test_token">/,
    );
  });
});
