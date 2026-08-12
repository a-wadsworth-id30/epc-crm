"use server";

import { CustomerDocumentShareStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { sendCustomerDocumentShareEmail } from "@/lib/customer-document-share-email";
import {
  customerDocumentShareDefaultExpiryDays,
  customerDocumentShareExpiryDate,
  customerDocumentShareUrl,
  customerDocumentShareTokenHash,
  generateCustomerDocumentShareToken,
} from "@/lib/customer-document-shares";
import { trustedAppBaseUrl } from "@/lib/http/origin";
import { prisma } from "@/lib/prisma";
import {
  canAccessRecordDocumentEntity,
  isRecordDocumentEntityType,
  recordDocumentPath,
  type RecordDocumentEntityType,
} from "@/lib/record-document-records";
import { cloudflareR2Provider, r2StoredConfigSchema } from "@/lib/storage/r2";

export type CustomerDocumentShareActionState = {
  ok: boolean;
  message: string;
  expiresAt?: string;
  savedAt?: string;
  shareUrl?: string;
};

const createCustomerDocumentShareSchema = z.object({
  entityId: z.string().trim().min(1),
  entityType: z
    .unknown()
    .refine(isRecordDocumentEntityType, "Choose a valid CRM record."),
  expiresInDays: z.coerce
    .number()
    .int()
    .min(1)
    .max(60)
    .default(customerDocumentShareDefaultExpiryDays),
  message: z
    .string()
    .trim()
    .max(1000, "Message must be 1000 characters or fewer.")
    .optional()
    .transform((value) => value || null),
  recipientEmail: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null)
    .pipe(z.string().email().nullable()),
  recipientName: z
    .string()
    .trim()
    .max(120, "Recipient name must be 120 characters or fewer.")
    .optional()
    .transform((value) => value || null),
  subject: z
    .string()
    .trim()
    .max(140, "Subject must be 140 characters or fewer.")
    .optional()
    .transform((value) => value || "Documents shared with you"),
});

const revokeCustomerDocumentShareSchema = z.object({
  entityId: z.string().trim().min(1),
  entityType: z
    .unknown()
    .refine(isRecordDocumentEntityType, "Choose a valid CRM record."),
  shareId: z.string().trim().min(1),
});

function selectedFileIds(formData: FormData) {
  const ids: string[] = [];
  const seen = new Set<string>();

  formData.getAll("fileIds").forEach((value) => {
    if (typeof value !== "string") return;
    const id = value.trim();

    if (!id || seen.has(id)) return;

    seen.add(id);
    ids.push(id);
  });

  return ids;
}

function shareEmailFailureReason(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("not connected")) return "MailerSend is not connected.";
  if (message.includes("sender email")) {
    return "MailerSend sender email is not configured.";
  }

  const statusMatch = message.match(/status (\d+)/i);
  if (statusMatch?.[1]) {
    return `MailerSend send failed with status ${statusMatch[1]}.`;
  }

  return "Document share email could not be sent.";
}

async function writeAuditLog({
  action,
  actorId,
  entityId,
  metadata,
}: {
  action: string;
  actorId?: string | null;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  await prisma.auditLog.create({
    data: {
      action,
      actorId: actorId ?? null,
      entity: "CustomerDocumentShare",
      entityId: entityId ?? null,
      metadata,
    },
  });
}

async function salesOpportunityContactId(entityType: string, entityId: string) {
  if (entityType !== "SalesOpportunity") return null;

  const opportunity = await prisma.salesOpportunity.findUnique({
    where: { id: entityId },
    select: { contactId: true },
  });

  return opportunity?.contactId ?? null;
}

export async function createCustomerDocumentShareAction(
  _: CustomerDocumentShareActionState,
  formData: FormData,
): Promise<CustomerDocumentShareActionState> {
  const user = await requireUser();
  const fileIds = selectedFileIds(formData);
  const parsed = createCustomerDocumentShareSchema.safeParse({
    entityId: formData.get("entityId"),
    entityType: formData.get("entityType"),
    expiresInDays: formData.get("expiresInDays"),
    message: formData.get("message"),
    recipientEmail: formData.get("recipientEmail"),
    recipientName: formData.get("recipientName"),
    subject: formData.get("subject"),
  });

  if (!fileIds.length) {
    return { ok: false, message: "Select at least one document to share." };
  }

  if (fileIds.length > 20) {
    return { ok: false, message: "Share 20 documents or fewer at once." };
  }

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Check the document share details.",
    };
  }

  const entityType = parsed.data.entityType as RecordDocumentEntityType;
  const record = await canAccessRecordDocumentEntity({
    entityId: parsed.data.entityId,
    entityType,
    user,
  });

  if (!record) {
    return { ok: false, message: "Record not found." };
  }

  const r2Integration = await prisma.integrationConnection.findUnique({
    where: { provider: cloudflareR2Provider },
    select: { config: true },
  });
  const r2Config = r2StoredConfigSchema.safeParse(r2Integration?.config ?? {});

  if (!r2Config.success || !r2Config.data.credentials) {
    return {
      ok: false,
      message: "Cloudflare R2 must be connected before documents can be sent.",
    };
  }

  const files = await prisma.fileAsset.findMany({
    where: {
      entityId: parsed.data.entityId,
      entityType,
      id: { in: fileIds },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      originalName: true,
    },
  });

  if (files.length !== fileIds.length) {
    return {
      ok: false,
      message: "One or more selected documents could not be shared.",
    };
  }

  const token = generateCustomerDocumentShareToken();
  const tokenHash = customerDocumentShareTokenHash(token);
  const expiresAt = customerDocumentShareExpiryDate({
    days: parsed.data.expiresInDays,
  });
  const shareUrl = customerDocumentShareUrl({
    baseUrl: trustedAppBaseUrl(),
    token,
  });
  const contactId = await salesOpportunityContactId(
    entityType,
    parsed.data.entityId,
  );
  const share = await prisma.customerDocumentShare.create({
    data: {
      createdByUserId: user.id,
      entityId: parsed.data.entityId,
      entityType,
      expiresAt,
      files: {
        create: files.map((file) => ({
          displayName: file.originalName,
          fileAssetId: file.id,
        })),
      },
      message: parsed.data.message,
      recipientEmail: parsed.data.recipientEmail,
      recipientName: parsed.data.recipientName,
      subject: parsed.data.subject,
      tokenHash,
    },
    select: { id: true },
  });
  let emailDelivery:
    | {
        attempted: true;
        error?: string;
        messageId?: string | null;
        sent: boolean;
        statusCode?: number;
      }
    | { attempted: false } = { attempted: false };

  if (parsed.data.recipientEmail) {
    try {
      const result = await sendCustomerDocumentShareEmail({
        documentNames: files.map((file) => file.originalName),
        expiresAt,
        message: parsed.data.message,
        recipientEmail: parsed.data.recipientEmail,
        recipientName: parsed.data.recipientName,
        shareUrl,
        subject: parsed.data.subject,
      });

      emailDelivery = {
        attempted: true,
        messageId: result.messageId,
        sent: true,
        statusCode: result.statusCode,
      };
    } catch (error) {
      emailDelivery = {
        attempted: true,
        error: shareEmailFailureReason(error),
        sent: false,
      };
    }
  }

  const metadata: Prisma.InputJsonObject = {
    documentCount: files.length,
    entityId: parsed.data.entityId,
    entityType,
    email: emailDelivery,
    expiresAt: expiresAt.toISOString(),
    fileIds,
  };

  await prisma.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        action: "customer_document_share.created",
        actorId: user.id,
        entity: "CustomerDocumentShare",
        entityId: share.id,
        metadata,
      },
    });

    if (entityType === "SalesOpportunity") {
      await tx.salesCommunication.create({
        data: {
          body: parsed.data.message,
          channel: "SYSTEM",
          contactId,
          direction: "OUTBOUND",
          metadata: {
            documentCount: files.length,
            documentShareId: share.id,
            email: emailDelivery,
            provider: "crm-document-share",
          },
          opportunityId: parsed.data.entityId,
          subject: parsed.data.subject,
          summary: `Shared ${files.length} document${files.length === 1 ? "" : "s"} with ${parsed.data.recipientName || parsed.data.recipientEmail || "customer"}.`,
          toAddress: parsed.data.recipientEmail,
          userId: user.id,
        },
      });
    }
  });

  revalidatePath(recordDocumentPath(entityType, parsed.data.entityId));

  return {
    ok: true,
    expiresAt: expiresAt.toISOString(),
    message:
      emailDelivery.attempted && emailDelivery.sent
        ? "Document share link created and emailed to the recipient."
        : emailDelivery.attempted
          ? "Document share link created, but the email could not be sent. Copy it now; it cannot be recovered later."
          : "Document share link created. Copy it now; it cannot be recovered later.",
    savedAt: new Date().toISOString(),
    shareUrl,
  };
}

export async function revokeCustomerDocumentShareAction(
  _: CustomerDocumentShareActionState,
  formData: FormData,
): Promise<CustomerDocumentShareActionState> {
  const user = await requireUser();
  const parsed = revokeCustomerDocumentShareSchema.safeParse({
    entityId: formData.get("entityId"),
    entityType: formData.get("entityType"),
    shareId: formData.get("shareId"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Check the document share details.",
    };
  }

  const entityType = parsed.data.entityType as RecordDocumentEntityType;
  const record = await canAccessRecordDocumentEntity({
    entityId: parsed.data.entityId,
    entityType,
    user,
  });

  if (!record) {
    return { ok: false, message: "Record not found." };
  }

  const share = await prisma.customerDocumentShare.findFirst({
    where: {
      entityId: parsed.data.entityId,
      entityType,
      id: parsed.data.shareId,
    },
    select: { id: true, status: true },
  });

  if (!share) {
    return { ok: false, message: "Document share not found." };
  }

  if (share.status !== CustomerDocumentShareStatus.OPEN) {
    return { ok: false, message: "Only open document shares can be revoked." };
  }

  await prisma.customerDocumentShare.update({
    where: { id: share.id },
    data: {
      revokedAt: new Date(),
      status: CustomerDocumentShareStatus.REVOKED,
    },
  });

  await writeAuditLog({
    action: "customer_document_share.revoked",
    actorId: user.id,
    entityId: share.id,
    metadata: {
      entityId: parsed.data.entityId,
      entityType,
    },
  });

  revalidatePath(recordDocumentPath(entityType, parsed.data.entityId));

  return {
    ok: true,
    message: "Document share link revoked.",
    savedAt: new Date().toISOString(),
  };
}
