"use server";

import {
  CustomerDocumentPortalStatus,
  CustomerDocumentShareStatus,
  CustomerUploadRequestStatus,
  Prisma,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { sendCustomerDocumentPortalEmail } from "@/lib/customer-document-portal-email";
import {
  customerDocumentPortalDefaultExpiryDays,
  customerDocumentPortalExpiryDate,
  customerDocumentPortalMaxExpiryDays,
  customerDocumentPortalTokenHash,
  customerDocumentPortalUrl,
  generateCustomerDocumentPortalToken,
} from "@/lib/customer-document-portals";
import {
  customerDocumentShareTokenHash,
  generateCustomerDocumentShareToken,
} from "@/lib/customer-document-shares";
import {
  customerUploadTokenHash,
  generateCustomerUploadToken,
} from "@/lib/customer-upload-requests";
import {
  documentUploadTypeDefinition,
  isDocumentUploadType,
  type DocumentUploadType,
} from "@/lib/document-library";
import { trustedAppBaseUrl } from "@/lib/http/origin";
import { prisma } from "@/lib/prisma";
import {
  canAccessRecordDocumentEntity,
  isRecordDocumentEntityType,
  recordDocumentPath,
  type RecordDocumentEntityType,
} from "@/lib/record-document-records";
import { cloudflareR2Provider, r2StoredConfigSchema } from "@/lib/storage/r2";

export type CustomerDocumentPortalActionState = {
  expiresAt?: string;
  message: string;
  ok: boolean;
  portalUrl?: string;
  savedAt?: string;
};

const createCustomerDocumentPortalSchema = z.object({
  entityId: z.string().trim().min(1),
  entityType: z
    .unknown()
    .refine(isRecordDocumentEntityType, "Choose a valid CRM record."),
  expiresInDays: z.coerce
    .number()
    .int()
    .min(1)
    .max(customerDocumentPortalMaxExpiryDays)
    .default(customerDocumentPortalDefaultExpiryDays),
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
    .transform((value) => value || "Your secure document portal"),
});

const revokeCustomerDocumentPortalSchema = z.object({
  entityId: z.string().trim().min(1),
  entityType: z
    .unknown()
    .refine(isRecordDocumentEntityType, "Choose a valid CRM record."),
  portalId: z.string().trim().min(1),
});

function selectedDocumentTypes(formData: FormData) {
  const seen = new Set<DocumentUploadType>();
  const selected: DocumentUploadType[] = [];

  formData.getAll("documentTypes").forEach((value) => {
    if (!isDocumentUploadType(value) || seen.has(value)) return;
    seen.add(value);
    selected.push(value);
  });

  return selected;
}

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

function uploadRequestItemData(types: DocumentUploadType[]) {
  return types.map((type) => {
    const definition = documentUploadTypeDefinition(type);

    return {
      description: definition?.description ?? null,
      label: definition?.label ?? type,
      required: true,
      uploadType: type,
    };
  });
}

function uploadRequestDocumentLabels(types: DocumentUploadType[]) {
  return types.map((type) => documentUploadTypeDefinition(type)?.label ?? type);
}

function portalEmailFailureReason(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("not connected")) return "MailerSend is not connected.";
  if (message.includes("sender email")) {
    return "MailerSend sender email is not configured.";
  }

  const statusMatch = message.match(/status (\d+)/i);
  if (statusMatch?.[1]) {
    return `MailerSend send failed with status ${statusMatch[1]}.`;
  }

  return "Customer portal email could not be sent.";
}

async function salesOpportunityContactId(entityType: string, entityId: string) {
  if (entityType !== "SalesOpportunity") return null;

  const opportunity = await prisma.salesOpportunity.findUnique({
    where: { id: entityId },
    select: { contactId: true },
  });

  return opportunity?.contactId ?? null;
}

async function matchingSignatureRequestCount({
  entityId,
  entityType,
  recipientEmail,
}: {
  entityId: string;
  entityType: RecordDocumentEntityType;
  recipientEmail: string | null;
}) {
  if (!recipientEmail) return 0;

  const where: Prisma.SignatureRequestWhereInput = {
    entityId,
    entityType,
    recipients: { some: { email: recipientEmail } },
    status: { in: ["SENT", "DELIVERED", "COMPLETED"] },
  };

  return prisma.signatureRequest.count({ where });
}

export async function createCustomerDocumentPortalAction(
  _: CustomerDocumentPortalActionState,
  formData: FormData,
): Promise<CustomerDocumentPortalActionState> {
  const user = await requireUser();
  const documentTypes = selectedDocumentTypes(formData);
  const fileIds = selectedFileIds(formData);
  const parsed = createCustomerDocumentPortalSchema.safeParse({
    entityId: formData.get("entityId"),
    entityType: formData.get("entityType"),
    expiresInDays: formData.get("expiresInDays"),
    message: formData.get("message"),
    recipientEmail: formData.get("recipientEmail"),
    recipientName: formData.get("recipientName"),
    subject: formData.get("subject"),
  });

  if (fileIds.length > 20) {
    return { ok: false, message: "Share 20 documents or fewer at once." };
  }

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Check the document portal details.",
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

  const signatureRequestCount = await matchingSignatureRequestCount({
    entityId: parsed.data.entityId,
    entityType,
    recipientEmail: parsed.data.recipientEmail,
  });

  if (!documentTypes.length && !fileIds.length && !signatureRequestCount) {
    return {
      ok: false,
      message:
        "Choose required uploads or files to send, or enter the signer email for an existing signature request.",
    };
  }

  if (documentTypes.length || fileIds.length) {
    const r2Integration = await prisma.integrationConnection.findUnique({
      where: { provider: cloudflareR2Provider },
      select: { config: true },
    });
    const r2Config = r2StoredConfigSchema.safeParse(
      r2Integration?.config ?? {},
    );

    if (!r2Config.success || !r2Config.data.credentials) {
      return {
        ok: false,
        message:
          "Cloudflare R2 must be connected before a customer document portal can be created.",
      };
    }
  }

  const files = fileIds.length
    ? await prisma.fileAsset.findMany({
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
      })
    : [];

  if (files.length !== fileIds.length) {
    return {
      ok: false,
      message: "One or more selected documents could not be added.",
    };
  }

  const portalToken = generateCustomerDocumentPortalToken();
  const portalTokenHash = customerDocumentPortalTokenHash(portalToken);
  const expiresAt = customerDocumentPortalExpiryDate({
    days: parsed.data.expiresInDays,
  });
  const portalUrl = customerDocumentPortalUrl({
    baseUrl: trustedAppBaseUrl(),
    token: portalToken,
  });
  const uploadRequestTokenHash = documentTypes.length
    ? customerUploadTokenHash(generateCustomerUploadToken())
    : null;
  const documentShareTokenHash = files.length
    ? customerDocumentShareTokenHash(generateCustomerDocumentShareToken())
    : null;

  const portal = await prisma.$transaction(async (tx) => {
    const uploadRequest = documentTypes.length
      ? await tx.customerUploadRequest.create({
          data: {
            createdByUserId: user.id,
            entityId: parsed.data.entityId,
            entityType,
            expiresAt,
            items: { create: uploadRequestItemData(documentTypes) },
            message: parsed.data.message,
            recipientEmail: parsed.data.recipientEmail,
            recipientName: parsed.data.recipientName,
            tokenHash: uploadRequestTokenHash!,
          },
          select: { id: true },
        })
      : null;
    const documentShare = files.length
      ? await tx.customerDocumentShare.create({
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
            tokenHash: documentShareTokenHash!,
          },
          select: { id: true },
        })
      : null;

    return tx.customerDocumentPortal.create({
      data: {
        createdByUserId: user.id,
        documentShareId: documentShare?.id ?? null,
        entityId: parsed.data.entityId,
        entityType,
        expiresAt,
        message: parsed.data.message,
        recipientEmail: parsed.data.recipientEmail,
        recipientName: parsed.data.recipientName,
        subject: parsed.data.subject,
        tokenHash: portalTokenHash,
        uploadRequestId: uploadRequest?.id ?? null,
      },
      select: {
        documentShareId: true,
        id: true,
        uploadRequestId: true,
      },
    });
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
      const result = await sendCustomerDocumentPortalEmail({
        documentNames: files.map((file) => file.originalName),
        expiresAt,
        message: parsed.data.message,
        portalUrl,
        recipientEmail: parsed.data.recipientEmail,
        recipientName: parsed.data.recipientName,
        requestedDocumentLabels: uploadRequestDocumentLabels(documentTypes),
        signatureRequestCount,
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
        error: portalEmailFailureReason(error),
        sent: false,
      };
    }
  }

  const contactId = await salesOpportunityContactId(
    entityType,
    parsed.data.entityId,
  );
  const metadata: Prisma.InputJsonObject = {
    documentCount: files.length,
    documentShareId: portal.documentShareId,
    email: emailDelivery,
    entityId: parsed.data.entityId,
    entityType,
    expiresAt: expiresAt.toISOString(),
    requestedDocumentTypes: documentTypes,
    signatureRequestCount,
    uploadRequestId: portal.uploadRequestId,
  };

  await prisma.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        action: "customer_document_portal.created",
        actorId: user.id,
        entity: "CustomerDocumentPortal",
        entityId: portal.id,
        metadata,
      },
    });

    if (portal.uploadRequestId) {
      await tx.auditLog.create({
        data: {
          action: "customer_upload_request.created",
          actorId: user.id,
          entity: "CustomerUploadRequest",
          entityId: portal.uploadRequestId,
          metadata: {
            documentTypes,
            entityId: parsed.data.entityId,
            entityType,
            expiresAt: expiresAt.toISOString(),
            itemCount: documentTypes.length,
            source: "customer-document-portal",
          },
        },
      });
    }

    if (portal.documentShareId) {
      await tx.auditLog.create({
        data: {
          action: "customer_document_share.created",
          actorId: user.id,
          entity: "CustomerDocumentShare",
          entityId: portal.documentShareId,
          metadata: {
            documentCount: files.length,
            entityId: parsed.data.entityId,
            entityType,
            expiresAt: expiresAt.toISOString(),
            fileIds,
            source: "customer-document-portal",
          },
        },
      });
    }

    if (entityType === "SalesOpportunity") {
      await tx.salesCommunication.create({
        data: {
          body: parsed.data.message,
          channel: "SYSTEM",
          contactId,
          direction: "OUTBOUND",
          metadata: {
            ...metadata,
            provider: "crm-document-portal",
          },
          opportunityId: parsed.data.entityId,
          subject: parsed.data.subject,
          summary: `Created customer document portal for ${parsed.data.recipientName || parsed.data.recipientEmail || "customer"}.`,
          toAddress: parsed.data.recipientEmail,
          userId: user.id,
        },
      });
    }
  });

  revalidatePath(recordDocumentPath(entityType, parsed.data.entityId));

  return {
    expiresAt: expiresAt.toISOString(),
    message:
      emailDelivery.attempted && emailDelivery.sent
        ? "Customer document portal created and emailed to the recipient."
        : emailDelivery.attempted
          ? "Customer document portal created, but the email could not be sent. Copy it now; it cannot be recovered later."
          : "Customer document portal created. Copy it now; it cannot be recovered later.",
    ok: true,
    portalUrl,
    savedAt: new Date().toISOString(),
  };
}

export async function revokeCustomerDocumentPortalAction(
  _: CustomerDocumentPortalActionState,
  formData: FormData,
): Promise<CustomerDocumentPortalActionState> {
  const user = await requireUser();
  const parsed = revokeCustomerDocumentPortalSchema.safeParse({
    entityId: formData.get("entityId"),
    entityType: formData.get("entityType"),
    portalId: formData.get("portalId"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Check the document portal details.",
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

  const portal = await prisma.customerDocumentPortal.findFirst({
    where: {
      entityId: parsed.data.entityId,
      entityType,
      id: parsed.data.portalId,
    },
    select: {
      documentShareId: true,
      id: true,
      status: true,
      uploadRequestId: true,
    },
  });

  if (!portal) {
    return { ok: false, message: "Customer document portal not found." };
  }

  if (portal.status !== CustomerDocumentPortalStatus.OPEN) {
    return { ok: false, message: "Only open document portals can be revoked." };
  }

  const revokedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.customerDocumentPortal.update({
      where: { id: portal.id },
      data: {
        revokedAt,
        status: CustomerDocumentPortalStatus.REVOKED,
      },
    });

    if (portal.uploadRequestId) {
      await tx.customerUploadRequest.updateMany({
        where: {
          id: portal.uploadRequestId,
          status: CustomerUploadRequestStatus.OPEN,
        },
        data: {
          revokedAt,
          status: CustomerUploadRequestStatus.REVOKED,
        },
      });
    }

    if (portal.documentShareId) {
      await tx.customerDocumentShare.updateMany({
        where: {
          id: portal.documentShareId,
          status: CustomerDocumentShareStatus.OPEN,
        },
        data: {
          revokedAt,
          status: CustomerDocumentShareStatus.REVOKED,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        action: "customer_document_portal.revoked",
        actorId: user.id,
        entity: "CustomerDocumentPortal",
        entityId: portal.id,
        metadata: {
          documentShareId: portal.documentShareId,
          entityId: parsed.data.entityId,
          entityType,
          uploadRequestId: portal.uploadRequestId,
        },
      },
    });
  });

  revalidatePath(recordDocumentPath(entityType, parsed.data.entityId));

  return {
    message: "Customer document portal revoked.",
    ok: true,
    savedAt: revokedAt.toISOString(),
  };
}
