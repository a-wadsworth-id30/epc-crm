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
      providerAttachmentId: "gmail-image-1",
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
      providerAttachmentId: "gmail-svg-1",
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
      providerAttachmentId: "gmail-doc-1",
      sizeBytes: 4096,
    },
  ]);

  assert.equal(attachment.name, "proposal.docx");
  assert.equal(attachment.downloadUrl, null);
  assert.equal(attachment.previewUrl, null);
  assert.equal(attachment.sizeBytes, 4096);
});

test("CID images referenced by the body are marked embedded using provider metadata", () => {
  const [attachment] = serializeEmailAttachments(
    [
      {
        archiveStatus: "STORED",
        fileAsset: {
          id: "asset-signature",
          mimeType: "image/png",
          originalName: "signature.png",
          sizeBytes: 2048,
        },
        fileName: "signature.png",
        id: "attachment-signature",
        mimeType: "image/png",
        providerAttachmentId: "gmail-signature-1",
        sizeBytes: 2048,
      },
    ],
    [
      {
        attachmentId: "gmail-signature-1",
        contentId: "<signature-logo>",
        disposition: "inline",
      },
    ],
    '<p>Regards</p><img src="cid:signature-logo">',
  );

  assert.equal(attachment.contentId, "signature-logo");
  assert.equal(attachment.isEmbedded, true);
});

test("a one-to-one CID reference is safely inferred for legacy Gmail metadata", () => {
  const [attachment] = serializeEmailAttachments(
    [
      {
        archiveStatus: "STORED",
        fileAsset: {
          id: "asset-legacy-signature",
          mimeType: "image/png",
          originalName: "logo.png",
          sizeBytes: 512,
        },
        fileName: "logo.png",
        id: "attachment-legacy-signature",
        mimeType: "image/png",
        providerAttachmentId: "gmail-legacy-image",
        sizeBytes: 512,
      },
    ],
    [{ attachmentId: "gmail-legacy-image" }],
    '<img src="cid:legacy-logo">',
  );

  assert.equal(attachment.contentId, "legacy-logo");
  assert.equal(attachment.isEmbedded, true);
});
