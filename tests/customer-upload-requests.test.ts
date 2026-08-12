import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  customerUploadExpiryDate,
  customerUploadMaxExpiryDays,
  customerUploadRequestState,
  customerUploadRequestUrl,
  customerUploadTokenHash,
  generateCustomerUploadToken,
} from "../src/lib/customer-upload-requests";
import { buildCustomerUploadRequestEmailContent } from "../src/lib/customer-upload-email-content";
import {
  customerUploadEffectiveMaxUploadMb,
  customerUploadMultipartPartSizeBytes,
  customerUploadMultipartThresholdBytes,
} from "../src/lib/customer-upload-multipart-config";

describe("customer upload requests", () => {
  it("generates opaque tokens and stores only stable hashes", () => {
    const token = generateCustomerUploadToken();
    const hash = customerUploadTokenHash(token);

    assert.ok(token.length >= 40);
    assert.match(hash, /^[a-f0-9]{64}$/);
    assert.equal(customerUploadTokenHash(token), hash);
    assert.notEqual(hash, token);
  });

  it("builds public upload URLs without exposing query parameters", () => {
    const url = customerUploadRequestUrl({
      baseUrl: "https://crm.id30.com",
      token: "abc_123",
    });

    assert.equal(url, "https://crm.id30.com/upload/abc_123");
  });

  it("clamps expiry dates to the allowed range", () => {
    const now = new Date("2026-07-30T10:00:00.000Z");
    const expiresAt = customerUploadExpiryDate({
      days: 999,
      now,
    });

    assert.equal(
      expiresAt.toISOString(),
      new Date(
        now.getTime() + customerUploadMaxExpiryDays * 24 * 60 * 60 * 1000,
      ).toISOString(),
    );
  });

  it("derives request state from status and expiry", () => {
    const now = new Date("2026-07-30T10:00:00.000Z");

    assert.equal(
      customerUploadRequestState({
        expiresAt: new Date("2026-07-31T10:00:00.000Z"),
        now,
        status: "OPEN",
      }),
      "open",
    );
    assert.equal(
      customerUploadRequestState({
        expiresAt: new Date("2026-07-29T10:00:00.000Z"),
        now,
        status: "OPEN",
      }),
      "expired",
    );
    assert.equal(
      customerUploadRequestState({
        expiresAt: new Date("2026-07-31T10:00:00.000Z"),
        now,
        status: "REVOKED",
      }),
      "revoked",
    );
  });

  it("builds recipient email content with the secure upload link", () => {
    const content = buildCustomerUploadRequestEmailContent({
      documentLabels: ["Utility Bill", "Floor Plans & Drawings"],
      expiresAt: new Date("2026-08-07T16:30:00.000Z"),
      message: "Please add the latest versions.",
      recipientName: "Alex",
      uploadUrl: "https://crm.id30.com/upload/test_token",
    });

    assert.equal(content.subject, "Secure document upload request");
    assert.match(content.text, /Hi Alex,/);
    assert.match(content.text, /https:\/\/crm\.id30\.com\/upload\/test_token/);
    assert.match(content.text, /private, time-limited upload link/);
    assert.match(content.text, /encrypted connection/);
    assert.match(content.text, /- Utility Bill/);
    assert.match(content.text, /- Floor Plans & Drawings/);
    assert.match(content.text, /Please add the latest versions\./);
    assert.match(content.html, /Secure document upload request|Utility Bill/);
    assert.match(
      content.html,
      /<a href="https:\/\/crm\.id30\.com\/upload\/test_token">/,
    );
  });

  it("uses platform-safe chunk sizes for large customer uploads", () => {
    assert.equal(customerUploadMultipartPartSizeBytes, 5 * 1024 * 1024);
    assert.equal(customerUploadMultipartThresholdBytes, 20 * 1024 * 1024);
  });

  it("raises customer upload links above the legacy 25MB storage default", () => {
    assert.equal(customerUploadEffectiveMaxUploadMb(25), 100);
    assert.equal(customerUploadEffectiveMaxUploadMb(250), 250);
    assert.equal(customerUploadEffectiveMaxUploadMb(999), 500);
    assert.equal(customerUploadEffectiveMaxUploadMb(null), 100);
  });
});
