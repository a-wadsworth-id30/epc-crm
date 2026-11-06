import {
  gmailCleanupPendingTag,
  gmailUserSavedTag,
} from "@/lib/email/attachment-deduplication";

export type GmailLegacyCleanupAttachment = {
  providerAttachmentId: string | null;
  emailMessage: {
    provider: string;
    metadata: unknown;
    mailbox: {
      authConnectionId: string;
      status: string;
    } | null;
  };
};

export type GmailLegacyCleanupFile = {
  tags: string[];
  uploadedById: string | null;
  protectedReferenceCount: number;
  attachments: GmailLegacyCleanupAttachment[];
};

export type GmailLegacyCleanupAssessment =
  | { eligible: true; reason: "orphan" | "provider-backed" }
  | {
      eligible: false;
      reason:
        | "explicitly-saved"
        | "protected-reference"
        | "provider-unavailable";
    };

export type GmailLegacyCleanupSummaryItem = {
  assessment: GmailLegacyCleanupAssessment;
  attachmentLinks: number;
  sizeBytes: number;
};

export function summarizeGmailLegacyCleanupAssessments(
  items: GmailLegacyCleanupSummaryItem[],
) {
  const summary = {
    explicitlySavedBytes: 0,
    explicitlySavedFiles: 0,
    orphanFiles: 0,
    protectedBytes: 0,
    protectedFiles: 0,
    providerBackedFiles: 0,
    providerUnavailableBytes: 0,
    providerUnavailableFiles: 0,
    wouldDetachAttachments: 0,
    wouldRemoveBytes: 0,
    wouldRemoveFiles: 0,
  };

  for (const item of items) {
    if (item.assessment.eligible) {
      summary.wouldRemoveFiles += 1;
      summary.wouldRemoveBytes += item.sizeBytes;
      summary.wouldDetachAttachments += item.attachmentLinks;
      if (item.assessment.reason === "orphan") summary.orphanFiles += 1;
      if (item.assessment.reason === "provider-backed") {
        summary.providerBackedFiles += 1;
      }
      continue;
    }

    if (item.assessment.reason === "explicitly-saved") {
      summary.explicitlySavedFiles += 1;
      summary.explicitlySavedBytes += item.sizeBytes;
    } else if (item.assessment.reason === "protected-reference") {
      summary.protectedFiles += 1;
      summary.protectedBytes += item.sizeBytes;
    } else {
      summary.providerUnavailableFiles += 1;
      summary.providerUnavailableBytes += item.sizeBytes;
    }
  }

  return summary;
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function gmailMessageIdFromCleanupMetadata(value: unknown) {
  const messageId = jsonObject(value).gmailMessageId;

  return typeof messageId === "string" && messageId.trim()
    ? messageId.trim()
    : null;
}

export function hasExplicitGmailSaveEvidence(
  file: Pick<GmailLegacyCleanupFile, "tags" | "uploadedById">,
) {
  return Boolean(file.uploadedById) || file.tags.includes(gmailUserSavedTag);
}

export function assessGmailLegacyFileCleanup(
  file: GmailLegacyCleanupFile,
): GmailLegacyCleanupAssessment {
  if (hasExplicitGmailSaveEvidence(file)) {
    return { eligible: false, reason: "explicitly-saved" };
  }

  if (file.protectedReferenceCount > 0) {
    return { eligible: false, reason: "protected-reference" };
  }

  if (file.attachments.length === 0) {
    return { eligible: true, reason: "orphan" };
  }

  const everyAttachmentIsRetrievable = file.attachments.every((attachment) => {
    const providerAttachmentId = attachment.providerAttachmentId;
    const mailbox = attachment.emailMessage.mailbox;

    return (
      attachment.emailMessage.provider === "gmail" &&
      Boolean(providerAttachmentId) &&
      !providerAttachmentId?.startsWith("inline:") &&
      Boolean(
        gmailMessageIdFromCleanupMetadata(attachment.emailMessage.metadata),
      ) &&
      mailbox?.status === "CONNECTED" &&
      Boolean(mailbox.authConnectionId)
    );
  });

  return everyAttachmentIsRetrievable
    ? { eligible: true, reason: "provider-backed" }
    : { eligible: false, reason: "provider-unavailable" };
}

export function withGmailCleanupPendingTag(tags: string[]) {
  return Array.from(new Set([...tags, gmailCleanupPendingTag]));
}
