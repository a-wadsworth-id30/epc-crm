import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeFilePreviewContentType } from "../src/lib/storage/preview";

describe("file preview security", () => {
  it("allows safe raster images and documents", () => {
    assert.equal(
      safeFilePreviewContentType({ mimeType: "image/png", name: "photo.png" }),
      "image/png",
    );
    assert.equal(
      safeFilePreviewContentType({
        mimeType: "application/pdf",
        name: "licence.pdf",
      }),
      "application/pdf",
    );
  });

  it("forces supported text formats to render as plain text", () => {
    assert.equal(
      safeFilePreviewContentType({ mimeType: "text/markdown", name: "readme.md" }),
      "text/plain; charset=utf-8",
    );
    assert.equal(
      safeFilePreviewContentType({ mimeType: "text/csv", name: "contacts.csv" }),
      "text/plain; charset=utf-8",
    );
  });

  it("blocks active same-origin HTML and SVG previews", () => {
    assert.equal(
      safeFilePreviewContentType({ mimeType: "text/html", name: "page.html" }),
      null,
    );
    assert.equal(
      safeFilePreviewContentType({ mimeType: "image/svg+xml", name: "logo.svg" }),
      null,
    );
  });

  it("does not trust an active MIME type hidden behind a safe-looking name", () => {
    assert.equal(
      safeFilePreviewContentType({ mimeType: "text/html", name: "notes.txt" }),
      null,
    );
  });
});
