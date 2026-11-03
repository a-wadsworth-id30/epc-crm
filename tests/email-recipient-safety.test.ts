import assert from "node:assert/strict";
import test from "node:test";
import {
  isReplyRecipientOverride,
  isUntrustedReplyRecipient,
} from "../src/lib/inbox/recipient-safety";

test("the original reply address and linked contact email are trusted", () => {
  const trusted = ["reply@example.com", "contact@example.com"];

  assert.equal(isUntrustedReplyRecipient("REPLY@example.com", trusted), false);
  assert.equal(isUntrustedReplyRecipient("contact@example.com", trusted), false);
});

test("an unrelated replacement address is flagged", () => {
  assert.equal(
    isUntrustedReplyRecipient("other@example.com", ["contact@example.com"]),
    true,
  );
});

test("recipient overrides compare normalized addresses", () => {
  assert.equal(
    isReplyRecipientOverride(" Reply@Example.com ", "reply@example.com"),
    false,
  );
  assert.equal(
    isReplyRecipientOverride("other@example.com", "reply@example.com"),
    true,
  );
});
