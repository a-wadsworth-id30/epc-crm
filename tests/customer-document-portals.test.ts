import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCustomerDocumentPortalEmailContent } from "../src/lib/customer-document-portal-email-content";
import {
  customerDocumentPortalExpiryDate,
  customerDocumentPortalMaxExpiryDays,
  customerDocumentPortalState,
  customerDocumentPortalTokenHash,
  customerDocumentPortalUrl,
  generateCustomerDocumentPortalToken,
} from "../src/lib/customer-document-portals";

describe("customer document portals", () => {
  it("generates opaque tokens and stores only stable hashes", () => {
    const token = generateCustomerDocumentPortalToken();
    const hash = customerDocumentPortalTokenHash(token);

    assert.ok(token.length >= 40);
    assert.match(hash, /^[a-f0-9]{64}$/);
    assert.equal(customerDocumentPortalTokenHash(token), hash);
    assert.notEqual(hash, token);
  });

  it("builds public portal URLs without exposing query parameters", () => {
    const url = customerDocumentPortalUrl({
      baseUrl: "https://crm.id30.com",
      token: "abc_123",
    });

    assert.equal(url, "https://crm.id30.com/portal/abc_123");
  });

  it("clamps expiry dates to the allowed range", () => {
    const now = new Date("2026-08-03T10:00:00.000Z");
    const expiresAt = customerDocumentPortalExpiryDate({
      days: 999,
      now,
    });

    assert.equal(
      expiresAt.toISOString(),
      new Date(
        now.getTime() +
          customerDocumentPortalMaxExpiryDays * 24 * 60 * 60 * 1000,
      ).toISOString(),
    );
  });

  it("derives portal state from status and expiry", () => {
    const now = new Date("2026-08-03T10:00:00.000Z");

    assert.equal(
      customerDocumentPortalState({
        expiresAt: new Date("2026-08-04T10:00:00.000Z"),
        now,
        status: "OPEN",
      }),
      "open",
    );
    assert.equal(
      customerDocumentPortalState({
        expiresAt: new Date("2026-08-02T10:00:00.000Z"),
        now,
        status: "OPEN",
      }),
      "expired",
    );
    assert.equal(
      customerDocumentPortalState({
        expiresAt: new Date("2026-08-04T10:00:00.000Z"),
        now,
        status: "REVOKED",
      }),
      "revoked",
    );
  });

  it("builds recipient email content with all portal sections", () => {
    const content = buildCustomerDocumentPortalEmailContent({
      documentNames: ["Quotation.pdf"],
      expiresAt: new Date("2026-08-31T16:30:00.000Z"),
      message: "Please upload the missing files before Friday.",
      portalUrl: "https://crm.id30.com/portal/test_token",
      recipientName: "Alex",
      requestedDocumentLabels: ["Utility Bill", "Floor Plans & Drawings"],
      signatureRequestCount: 1,
      subject: "Your iD30 document portal",
    });

    assert.equal(content.subject, "Your iD30 document portal");
    assert.match(content.text, /Hi Alex,/);
    assert.match(content.text, /https:\/\/crm\.id30\.com\/portal\/test_token/);
    assert.match(content.text, /- Utility Bill/);
    assert.match(content.text, /- Quotation\.pdf/);
    assert.match(content.text, /Signature requests: 1/);
    assert.match(
      content.text,
      /Please upload the missing files before Friday\./,
    );
    assert.match(
      content.html,
      /<a href="https:\/\/crm\.id30\.com\/portal\/test_token">/,
    );
  });
});
