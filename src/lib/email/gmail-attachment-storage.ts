import "server-only";

import crypto from "node:crypto";
import { z } from "zod";
import {
  attachmentChecksum,
  gmailSharedImageEntityType,
  gmailSharedImageKey,
  gmailSharedImageTag,
  isImageAttachment,
} from "@/lib/email/attachment-deduplication";
import { id30AuthBrokerRequest } from "@/lib/integrations/id30-auth-oauth";
import { prisma } from "@/lib/prisma";
import { getR2Config, headR2Object, putR2Object } from "@/lib/storage/r2";

const attachmentResponseSchema = z.object({
  ok: z.literal(true),
  provider: z.literal("gmail"),
  result: z.object({
    data: z.string().min(1).nullable(),
    size: z.number().int().nonnegative().nullable(),
  }),
});

type GmailAttachmentSource = {
  authConnectionId: string;
  contactId: string | null;
  emailAttachmentId: string;
  emailMessageId: string;
  fileName: string;
  gmailMessageId: string;
  inlineData?: string | null;
  mailboxId: string;
  mimeType: string | null;
  opportunityId: string | null;
  providerAttachmentId: string;
  sizeBytes: number | null;
  uploadedById?: string | null;
};

function safeFileName(value: string) {
  return (
    value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") ||
    "attachment"
  );
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function gmailMessageId(value: unknown) {
  const id = jsonObject(value).gmailMessageId;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

export async function fetchGmailAttachmentBytes({
  authConnectionId,
  gmailMessageId,
  providerAttachmentId,
}: Pick<
  GmailAttachmentSource,
  "authConnectionId" | "gmailMessageId" | "providerAttachmentId"
>) {
  const pathname = `/api/crm/connections/${encodeURIComponent(authConnectionId)}/gmail/attachment`;
  const response = await id30AuthBrokerRequest({
    body: {
      attachmentId: providerAttachmentId,
      messageId: gmailMessageId,
    },
    connectionId: authConnectionId,
    method: "POST",
    pathname,
  });

  if (!response.ok) throw new Error(response.message);

  const parsed = attachmentResponseSchema.safeParse(response.body);
  if (!parsed.success || !parsed.data.result.data) {
    throw new Error("Gmail attachment response was incomplete.");
  }

  return Buffer.from(parsed.data.result.data, "base64url");
}

async function attachmentBytes(source: GmailAttachmentSource) {
  if (source.inlineData) {
    return Buffer.from(source.inlineData, "base64url");
  }

  return fetchGmailAttachmentBytes(source);
}

export async function archiveGmailAttachmentSource(
  source: GmailAttachmentSource,
) {
  const r2Config = await getR2Config();
  if (!r2Config) throw new Error("Cloudflare R2 storage is not configured.");

  const maxBytes = r2Config.maxUploadMb * 1024 * 1024;
  if ((source.sizeBytes ?? 0) > maxBytes) {
    throw new Error("Attachment exceeds the R2 upload limit.");
  }

  try {
    const buffer = await attachmentBytes(source);
    if (buffer.byteLength > maxBytes) {
      throw new Error("Attachment exceeds the R2 upload limit.");
    }

    const checksum = attachmentChecksum(buffer);
    const mimeType = source.mimeType ?? "application/octet-stream";
    const sharedImage = isImageAttachment(mimeType);
    const key = sharedImage
      ? gmailSharedImageKey({
          checksum,
          uploadPrefix: r2Config.uploadPrefix,
        })
      : `${r2Config.uploadPrefix || "crm-assets"}/gmail/${source.mailboxId}/${source.gmailMessageId}/${crypto.randomUUID()}-${safeFileName(source.fileName)}`;
    let file = sharedImage
      ? await prisma.fileAsset.findUnique({ where: { key } })
      : null;
    let objectAvailable = false;

    if (file) {
      try {
        const storedObject = await headR2Object({ key });
        objectAvailable = storedObject.contentLength === buffer.byteLength;
      } catch {
        objectAvailable = false;
      }
    }

    if (!file || !objectAvailable) {
      const upload = await putR2Object({
        body: buffer,
        contentType: mimeType,
        key,
      });

      file = sharedImage
        ? await prisma.fileAsset.upsert({
            where: { key: upload.key },
            update: {
              bucket: upload.bucketName,
              checksum,
              mimeType,
              sizeBytes: buffer.byteLength,
            },
            create: {
              bucket: upload.bucketName,
              checksum,
              entityId: checksum,
              entityType: gmailSharedImageEntityType,
              key: upload.key,
              mimeType,
              originalName: source.fileName,
              sizeBytes: buffer.byteLength,
              tags: ["email-attachment", "gmail", gmailSharedImageTag],
              uploadedById: source.uploadedById ?? null,
            },
          })
        : await prisma.fileAsset.create({
            data: {
              bucket: upload.bucketName,
              checksum,
              entityId:
                source.opportunityId ??
                source.contactId ??
                source.emailMessageId,
              entityType: source.opportunityId
                ? "sales_opportunity"
                : source.contactId
                  ? "contact"
                  : "email_message",
              key: upload.key,
              mimeType,
              originalName: source.fileName,
              sizeBytes: buffer.byteLength,
              tags: ["email-attachment", "gmail"],
              uploadedById: source.uploadedById ?? null,
            },
          });
    }

    await prisma.emailAttachment.update({
      where: { id: source.emailAttachmentId },
      data: {
        archiveStatus: "STORED",
        fileAssetId: file.id,
        lastError: null,
      },
    });

    return file;
  } catch (error) {
    await prisma.emailAttachment.update({
      where: { id: source.emailAttachmentId },
      data: {
        archiveStatus: "FAILED",
        lastError:
          error instanceof Error
            ? error.message.slice(0, 500)
            : "Attachment archive failed.",
      },
    });
    throw error;
  }
}

export async function archiveGmailAttachmentById({
  attachmentId,
  uploadedById,
}: {
  attachmentId: string;
  uploadedById: string;
}) {
  const attachment = await prisma.emailAttachment.findUnique({
    where: { id: attachmentId },
    select: {
      fileAsset: true,
      fileName: true,
      id: true,
      mimeType: true,
      providerAttachmentId: true,
      sizeBytes: true,
      emailMessage: {
        select: {
          contactId: true,
          id: true,
          mailbox: {
            select: { authConnectionId: true, id: true },
          },
          metadata: true,
          opportunityId: true,
          provider: true,
        },
      },
    },
  });

  if (!attachment) throw new Error("Email attachment was not found.");
  if (attachment.fileAsset) return attachment.fileAsset;
  if (attachment.emailMessage.provider !== "gmail") {
    throw new Error("This attachment cannot be saved from its email provider.");
  }

  const providerAttachmentId = attachment.providerAttachmentId;
  const messageId = gmailMessageId(attachment.emailMessage.metadata);
  const mailbox = attachment.emailMessage.mailbox;
  if (!providerAttachmentId || providerAttachmentId.startsWith("inline:")) {
    throw new Error("Gmail no longer exposes this attachment for download.");
  }
  if (!messageId || !mailbox) {
    throw new Error("Gmail attachment details are incomplete.");
  }

  return archiveGmailAttachmentSource({
    authConnectionId: mailbox.authConnectionId,
    contactId: attachment.emailMessage.contactId,
    emailAttachmentId: attachment.id,
    emailMessageId: attachment.emailMessage.id,
    fileName: attachment.fileName,
    gmailMessageId: messageId,
    mailboxId: mailbox.id,
    mimeType: attachment.mimeType,
    opportunityId: attachment.emailMessage.opportunityId,
    providerAttachmentId,
    sizeBytes: attachment.sizeBytes,
    uploadedById,
  });
}

export function gmailMessageIdFromMetadata(value: unknown) {
  return gmailMessageId(value);
}
