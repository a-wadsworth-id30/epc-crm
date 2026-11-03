import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canOwnPersonalGmailMailbox,
  defaultGmailMailboxPurpose,
  gmailMailboxTeamPurposeOptions,
  isLegacyGmailMailboxPurpose,
} from "../src/lib/integrations/gmail-mailbox-purpose";

describe("Gmail mailbox purposes", () => {
  it("matches the Phone System team options", () => {
    assert.deepEqual(
      gmailMailboxTeamPurposeOptions.map((option) => option.label),
      ["Sales", "New Business", "Customer Success", "Support"],
    );
  });

  it("reserves personal mailboxes for the Owner/director role template", () => {
    assert.equal(canOwnPersonalGmailMailbox({ roleTemplate: "owner" }), true);
    assert.equal(canOwnPersonalGmailMailbox({ roleTemplate: "admin" }), false);
    assert.equal(canOwnPersonalGmailMailbox({ roleTemplate: "manager" }), false);
    assert.equal(canOwnPersonalGmailMailbox({ roleTemplate: null }), false);
  });

  it("defaults director mailboxes to Personal and all others to Sales", () => {
    assert.equal(defaultGmailMailboxPurpose({ roleTemplate: "owner" }), "PERSONAL");
    assert.equal(defaultGmailMailboxPurpose({ roleTemplate: "sales-user" }), "SALES");
    assert.equal(defaultGmailMailboxPurpose(null), "SALES");
  });

  it("recognizes only the superseded purpose values as legacy", () => {
    assert.equal(isLegacyGmailMailboxPurpose("ACCOUNTS"), true);
    assert.equal(isLegacyGmailMailboxPurpose("SHARED"), true);
    assert.equal(isLegacyGmailMailboxPurpose("SUPPORT"), false);
  });
});
