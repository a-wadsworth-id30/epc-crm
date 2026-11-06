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
