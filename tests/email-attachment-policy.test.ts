import assert from "node:assert/strict";
import test from "node:test";
import { shouldRetainGmailAttachmentDuringSync } from "../src/lib/email/attachment-policy";

test("Gmail-backed attachments remain provider-hosted during sync", () => {
  assert.equal(
    shouldRetainGmailAttachmentDuringSync({
      attachmentId: "gmail-attachment-1",
      inlineData: null,
    }),
    false,
  );
});

test("non-retrievable inline MIME data is retained during sync", () => {
  assert.equal(
    shouldRetainGmailAttachmentDuringSync({
      attachmentId: null,
      inlineData: "encoded-data",
    }),
    true,
  );
});
