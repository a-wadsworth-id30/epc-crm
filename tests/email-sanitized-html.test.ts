import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  sanitizedEmailHtml,
  sanitizedEmailHtmlViews,
} from "../src/lib/email/sanitized-html";

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

  it("uses the same formatted latest HTML when expanded", () => {
    const html =
      "<p><strong>Latest reply</strong></p><div>-----Original Message-----</div><p>Earlier reply</p>";
    const views = sanitizedEmailHtmlViews({ html });

    assert.match(views.latestHtml ?? "", /<strong>Latest reply<\/strong>/);
    assert.match(views.quotedHistoryHtml ?? "", /Earlier reply/);
    assert.equal(
      `${views.latestHtml}${views.quotedHistoryHtml}`,
      views.fullHtml,
    );
  });

  it("separates Gmail and Outlook quote wrappers without reformatting the latest reply", () => {
    for (const history of [
      '<div class="gmail_quote"><blockquote>Gmail history</blockquote></div>',
      '<div id="divRplyFwdMsg">Outlook history</div>',
    ]) {
      const views = sanitizedEmailHtmlViews({
        html: `<p><em>Formatted latest</em></p>${history}`,
      });

      assert.equal(views.latestHtml, "<p><em>Formatted latest</em></p>");
      assert.ok(views.quotedHistoryHtml);
    }
  });

  it("does not mistake an ordinary authored blockquote for conversation history", () => {
    const views = sanitizedEmailHtmlViews({
      html: "<p>Proposal notes</p><blockquote>Customer requirement</blockquote>",
    });

    assert.match(views.latestHtml ?? "", /Customer requirement/);
    assert.equal(views.quotedHistoryHtml, null);
  });

  it("replaces known CID images with authorised previews and removes unknown images", () => {
    const result = sanitizedEmailHtml(
      '<p>Signature</p><img src="cid:known-logo"><img src="cid:unknown"><img src="https://tracker.example/pixel">',
      {
        includeQuotedHistory: true,
        inlineImages: [
          { contentId: "known-logo", previewUrl: "/api/media/asset/preview" },
        ],
      },
    );

    assert.match(result ?? "", /src="\/api\/media\/asset\/preview"/);
    assert.doesNotMatch(result ?? "", /unknown|tracker\.example/);
  });
});
