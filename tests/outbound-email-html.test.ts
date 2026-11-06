import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gmailMultipartAlternative } from "../src/lib/email/gmail-mime";
import {
  plainTextToEmailHtml,
  sanitizeOutboundEmailHtml,
} from "../src/lib/email/outbound-html";

describe("outbound rich email", () => {
  it("preserves supported formatting and removes unsafe content", () => {
    const result = sanitizeOutboundEmailHtml(
      '<p>Hello <strong>Craig</strong></p><script>alert(1)</script><img src="https://tracker.test/pixel"><a href="javascript:alert(1)">unsafe</a><ul><li>One</li></ul>',
      "Hello Craig\n\nOne",
    );

    assert.match(result, /<strong>Craig<\/strong>/);
    assert.match(result, /<ul><li>One<\/li><\/ul>/);
    assert.doesNotMatch(result, /script|img|javascript:/i);
  });

  it("creates safe HTML from the plain-text fallback", () => {
    assert.equal(
      plainTextToEmailHtml("Hello <Craig>\n\nNext line"),
      "<p>Hello &lt;Craig&gt;</p><p>Next line</p>",
    );
  });

  it("builds Gmail multipart alternative content with both representations", () => {
    const content = gmailMultipartAlternative({
      boundary: "test-boundary",
      html: "<p>Hello <strong>Craig</strong></p>",
      text: "Hello Craig",
    }).join("\r\n");

    assert.match(content, /multipart\/alternative/);
    assert.match(content, /Content-Type: text\/plain/);
    assert.match(content, /Hello Craig/);
    assert.match(content, /Content-Type: text\/html/);
    assert.match(content, /<strong>Craig<\/strong>/);
    assert.ok(content.endsWith("--test-boundary--"));
  });
});
