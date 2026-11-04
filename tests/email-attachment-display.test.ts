import assert from "node:assert/strict";
import test from "node:test";
import { serializeEmailAttachments } from "../src/lib/email/attachment-display";

test("stored raster email images receive secure preview and download URLs", () => {
  const [attachment] = serializeEmailAttachments([
    {
      archiveStatus: "STORED",
      fileAsset: {
        id: "asset/image 1",
        mimeType: "image/png",
        originalName: "signature.png",
        sizeBytes: 2048,
      },
      fileName: "original.png",
      id: "attachment-1",
      mimeType: "image/png",
      sizeBytes: 1024,
    },
  ]);

  assert.equal(attachment.isImage, true);
  assert.equal(attachment.canPreview, true);
  assert.equal(attachment.name, "signature.png");
  assert.equal(attachment.previewUrl, "/api/media/asset%2Fimage%201/preview");
  assert.equal(
    attachment.downloadUrl,
    "/api/media/asset%2Fimage%201?download=1",
  );
});

test("SVG email attachments are downloadable but never embedded inline", () => {
  const [attachment] = serializeEmailAttachments([
    {
      archiveStatus: "STORED",
      fileAsset: {
        id: "asset-svg",
        mimeType: "image/svg+xml",
        originalName: "logo.svg",
        sizeBytes: 512,
      },
      fileName: "logo.svg",
      id: "attachment-svg",
      mimeType: "image/svg+xml",
      sizeBytes: 512,
    },
  ]);

  assert.equal(attachment.isImage, false);
  assert.equal(attachment.canPreview, false);
  assert.equal(attachment.previewUrl, null);
  assert.ok(attachment.downloadUrl);
});

test("unarchived email attachments retain metadata without file URLs", () => {
  const [attachment] = serializeEmailAttachments([
    {
      archiveStatus: "REFERENCE",
      fileAsset: null,
      fileName: "proposal.docx",
      id: "attachment-doc",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sizeBytes: 4096,
    },
  ]);

  assert.equal(attachment.name, "proposal.docx");
  assert.equal(attachment.downloadUrl, null);
  assert.equal(attachment.previewUrl, null);
  assert.equal(attachment.sizeBytes, 4096);
});
