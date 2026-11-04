import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emailAvatarInitials,
  emailAvatarTone,
  safeCrmAvatarUrl,
} from "../src/lib/email/avatar";

describe("email avatars", () => {
  it("creates concise initials with a safe fallback", () => {
    assert.equal(emailAvatarInitials("Adam Wadsworth"), "AW");
    assert.equal(emailAvatarInitials("Craig"), "C");
    assert.equal(emailAvatarInitials(""), "?");
  });

  it("keeps fallback colours stable for the same sender", () => {
    assert.equal(
      emailAvatarTone("adam@example.com"),
      emailAvatarTone("ADAM@example.com"),
    );
  });

  it("allows managed CRM media only and rejects external avatar requests", () => {
    assert.equal(
      safeCrmAvatarUrl("/api/media/avatar-1"),
      "/api/media/avatar-1",
    );
    assert.equal(safeCrmAvatarUrl("https://example.com/avatar.png"), null);
    assert.equal(safeCrmAvatarUrl("//example.com/avatar.png"), null);
    assert.equal(safeCrmAvatarUrl('/api/media/avatar-1")'), null);
  });
});
