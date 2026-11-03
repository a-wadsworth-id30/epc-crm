import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  completeEmailPlainText,
  latestInboundEmailPlainText,
} from "../src/lib/email/plain-text";

describe("email plain text", () => {
  it("keeps the richer HTML body available for a full email view", () => {
    const html = [
      "<p>Latest reply</p>",
      "<div>On Monday, Craig wrote:</div>",
      "<blockquote>Earlier message in the thread</blockquote>",
    ].join("");

    assert.equal(
      latestInboundEmailPlainText({ html, text: "Latest reply" }),
      "Latest reply",
    );
    assert.match(
      completeEmailPlainText({ html, text: "Latest reply" }),
      /Earlier message in the thread/,
    );
  });
});
