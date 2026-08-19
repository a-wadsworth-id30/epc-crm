import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSaleNoteMentionEmailContent,
  saleNoteMentionRecipientName,
} from "../src/lib/sales/note-mention-email-content";

describe("sale note mention email content", () => {
  it("builds a direct CRM review email for mentioned members", () => {
    const content = buildSaleNoteMentionEmailContent({
      mentionedByName: "Adam Wadsworth",
      noteBody: "Please review the quote before we reply.",
      recipientName: "Dave Moffat",
      saleTitle: "Website rebuild",
      saleUrl: "https://crm.id30.com/sales/sale-123",
    });

    assert.equal(content.subject, "You were mentioned on Website rebuild");
    assert.match(content.text, /^Hi Dave Moffat,/);
    assert.match(content.text, /Adam Wadsworth mentioned you/);
    assert.match(content.text, /https:\/\/crm\.id30\.com\/sales\/sale-123/);
    assert.match(content.html, /Open the lead in CRM/);
  });

  it("escapes note text in html output", () => {
    const content = buildSaleNoteMentionEmailContent({
      mentionedByName: "A <script>",
      noteBody: "Check <b>urgent</b> & confirm.",
      recipientName: null,
      saleTitle: "Deal <One>",
      saleUrl: "https://crm.id30.com/sales/sale-123?x=<bad>",
    });

    assert.match(content.text, /^Hi,/);
    assert.match(content.html, /A &lt;script&gt;/);
    assert.match(content.html, /Check &lt;b&gt;urgent&lt;\/b&gt; &amp; confirm\./);
    assert.match(content.html, /Deal &lt;One&gt;/);
    assert.match(content.html, /x=&lt;bad&gt;/);
  });

  it("prefers first and last name for recipient display", () => {
    assert.equal(
      saleNoteMentionRecipientName({
        firstName: "Dave",
        lastName: "Moffat",
        name: "D. Moffat",
      }),
      "Dave Moffat",
    );
  });
});
