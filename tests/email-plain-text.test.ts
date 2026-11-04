import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  completeEmailPlainText,
  emailPlainTextViews,
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

  it("separates quoted history while preserving the latest signature", () => {
    const views = emailPlainTextViews(
      "Hello Craig\n\nKind regards\nAdam Wadsworth\n\nOn Monday, Craig wrote:\nEarlier message",
    );

    assert.match(views.latestText, /Kind regards\nAdam Wadsworth/);
    assert.match(views.quotedHistoryText, /On Monday, Craig wrote:/);
  });

  it("preserves Outlook-style history", () => {
    const views = emailPlainTextViews(
      "Latest response\n\nFrom: Craig <craig@example.com>\nSent: Monday\nTo: Adam <adam@example.com>\nSubject: Test\n\nEarlier message",
    );

    assert.equal(views.latestText, "Latest response");
    assert.match(views.quotedHistoryText, /From: Craig/);
  });
});
