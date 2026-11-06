import assert from "node:assert/strict";
import test from "node:test";
import {
  assessGmailLegacyFileCleanup,
  hasExplicitGmailSaveEvidence,
  summarizeGmailLegacyCleanupAssessments,
} from "../src/lib/maintenance/gmail-r2-legacy-cleanup-policy";

const retrievableAttachment = {
  providerAttachmentId: "gmail-attachment-1",
  emailMessage: {
    provider: "gmail",
    metadata: { gmailMessageId: "gmail-message-1" },
    mailbox: {
      authConnectionId: "auth-connection-1",
      status: "CONNECTED",
    },
  },
};

test("legacy Gmail files with retrievable provider copies are eligible", () => {
  assert.deepEqual(
    assessGmailLegacyFileCleanup({
      attachments: [retrievableAttachment],
      protectedReferenceCount: 0,
      tags: ["email-attachment", "gmail"],
      uploadedById: null,
    }),
    { eligible: true, reason: "provider-backed" },
  );
});

test("manual Gmail saves are always protected", () => {
  assert.equal(
    hasExplicitGmailSaveEvidence({
      tags: ["email-attachment", "gmail", "gmail-user-saved"],
      uploadedById: null,
    }),
    true,
  );
  assert.deepEqual(
    assessGmailLegacyFileCleanup({
      attachments: [retrievableAttachment],
      protectedReferenceCount: 0,
      tags: ["email-attachment", "gmail"],
      uploadedById: "user-1",
    }),
    { eligible: false, reason: "explicitly-saved" },
  );
});

test("files with unrelated CRM references are protected", () => {
  assert.deepEqual(
    assessGmailLegacyFileCleanup({
      attachments: [retrievableAttachment],
      protectedReferenceCount: 1,
      tags: ["email-attachment", "gmail"],
      uploadedById: null,
    }),
    { eligible: false, reason: "protected-reference" },
  );
});

test("inline-only and disconnected provider copies are retained", () => {
  for (const attachment of [
    { ...retrievableAttachment, providerAttachmentId: "inline:0:logo.png" },
    {
      ...retrievableAttachment,
      emailMessage: {
        ...retrievableAttachment.emailMessage,
        mailbox: {
          ...retrievableAttachment.emailMessage.mailbox,
          status: "DISCONNECTED",
        },
      },
    },
  ]) {
    assert.deepEqual(
      assessGmailLegacyFileCleanup({
        attachments: [attachment],
        protectedReferenceCount: 0,
        tags: ["email-attachment", "gmail"],
        uploadedById: null,
      }),
      { eligible: false, reason: "provider-unavailable" },
    );
  }
});

test("unreferenced legacy Gmail objects are safe cleanup candidates", () => {
  assert.deepEqual(
    assessGmailLegacyFileCleanup({
      attachments: [],
      protectedReferenceCount: 0,
      tags: ["email-attachment", "gmail"],
      uploadedById: null,
    }),
    { eligible: true, reason: "orphan" },
  );
});

test("cleanup report totals separate candidates from protected storage", () => {
  assert.deepEqual(
    summarizeGmailLegacyCleanupAssessments([
      {
        assessment: { eligible: true, reason: "provider-backed" },
        attachmentLinks: 2,
        sizeBytes: 1_000,
      },
      {
        assessment: { eligible: true, reason: "orphan" },
        attachmentLinks: 0,
        sizeBytes: 250,
      },
      {
        assessment: { eligible: false, reason: "explicitly-saved" },
        attachmentLinks: 1,
        sizeBytes: 2_000,
      },
      {
        assessment: { eligible: false, reason: "protected-reference" },
        attachmentLinks: 1,
        sizeBytes: 3_000,
      },
      {
        assessment: { eligible: false, reason: "provider-unavailable" },
        attachmentLinks: 1,
        sizeBytes: 4_000,
      },
    ]),
    {
      explicitlySavedBytes: 2_000,
      explicitlySavedFiles: 1,
      orphanFiles: 1,
      protectedBytes: 3_000,
      protectedFiles: 1,
      providerBackedFiles: 1,
      providerUnavailableBytes: 4_000,
      providerUnavailableFiles: 1,
      wouldDetachAttachments: 2,
      wouldRemoveBytes: 1_250,
      wouldRemoveFiles: 2,
    },
  );
});
