import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isReplyRecipientOverride,
  isUntrustedReplyRecipient,
} from "../src/lib/inbox/recipient-safety";

test("the original reply address and linked contact email are trusted", () => {
  const trusted = ["reply@example.com", "contact@example.com"];

  assert.equal(isUntrustedReplyRecipient("REPLY@example.com", trusted), false);
  assert.equal(
    isUntrustedReplyRecipient("contact@example.com", trusted),
    false,
  );
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

test("untrusted reply overrides require explicit server-side confirmation", () => {
  const action = readFileSync("src/lib/actions/inbox.ts", "utf8");
  const field = readFileSync(
    "src/components/crm-boilerplate/LockedEmailRecipientField.tsx",
    "utf8",
  );
  const outbound = readFileSync("src/lib/sales/outbound-messages.ts", "utf8");

  assert.match(action, /recipientOverrideConfirmed/);
  assert.match(action, /Confirm the changed recipient/);
  assert.match(action, /recipientTrusted/);
  assert.doesNotMatch(action, /selectedRecipient: replyRecipient/);
  assert.match(field, /I have checked this recipient/);
  assert.match(outbound, /allowUnlinkedRecipient/);
  assert.doesNotMatch(outbound, /if \(user\.role === "ADMIN"\) return/);
});
