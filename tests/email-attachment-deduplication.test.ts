import assert from "node:assert/strict";
import test from "node:test";
import {
  attachmentChecksum,
  gmailSharedImageKey,
  isImageAttachment,
} from "../src/lib/email/attachment-deduplication";

test("identical attachment bytes produce the same checksum and shared key", () => {
  const first = attachmentChecksum(Buffer.from("same image bytes"));
  const second = attachmentChecksum(Buffer.from("same image bytes"));

  assert.equal(first, second);
  assert.equal(
    gmailSharedImageKey({ checksum: first, uploadPrefix: "/crm-assets/" }),
    `crm-assets/gmail/shared-images/${first}`,
  );
});

test("different attachment bytes do not share a key", () => {
  const first = attachmentChecksum(Buffer.from("first image"));
  const second = attachmentChecksum(Buffer.from("second image"));

  assert.notEqual(first, second);
  assert.notEqual(
    gmailSharedImageKey({ checksum: first }),
    gmailSharedImageKey({ checksum: second }),
  );
});

test("only declared image attachments use shared image storage", () => {
  assert.equal(isImageAttachment("image/png"), true);
  assert.equal(isImageAttachment(" IMAGE/JPEG "), true);
  assert.equal(isImageAttachment("application/pdf"), false);
  assert.equal(isImageAttachment(null), false);
});
