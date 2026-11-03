import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizedEmailHtml } from "../src/lib/email/sanitized-html";

describe("sanitized email HTML", () => {
  it("preserves basic email formatting and safe links", () => {
    const result = sanitizedEmailHtml(
      '<p><strong>Important</strong></p><ul><li>First item</li></ul><span style="font-weight: 700; background-image: url(javascript:alert(1))">Styled bold</span><a href="https://example.com">Open</a>',
    );

    assert.match(result ?? "", /<strong>Important<\/strong>/);
    assert.match(result ?? "", /<ul><li>First item<\/li><\/ul>/);
    assert.match(result ?? "", /style="font-weight:700"/);
    assert.doesNotMatch(result ?? "", /background-image|javascript/i);
    assert.match(result ?? "", /rel="noopener noreferrer"/);
    assert.match(result ?? "", /target="_blank"/);
  });

  it("removes executable markup, remote images and unsafe links", () => {
    const result = sanitizedEmailHtml(
      '<p onclick="alert(1)">Hello<script>alert(2)</script></p><img src="https://tracker.example/pixel"><a href="javascript:alert(3)">Bad</a>',
      { includeQuotedHistory: true },
    );

    assert.doesNotMatch(result ?? "", /onclick|script|img|javascript/i);
    assert.match(result ?? "", /<p>Hello<\/p>/);
  });

  it("omits quoted history from the latest view and keeps it in the full view", () => {
    const html =
      '<p><b>Latest reply</b></p><div class="gmail_quote"><blockquote>Earlier reply</blockquote></div>';

    const latest = sanitizedEmailHtml(html);
    const full = sanitizedEmailHtml(html, { includeQuotedHistory: true });

    assert.match(latest ?? "", /Latest reply/);
    assert.doesNotMatch(latest ?? "", /Earlier reply/);
    assert.match(full ?? "", /Earlier reply/);
  });
});
