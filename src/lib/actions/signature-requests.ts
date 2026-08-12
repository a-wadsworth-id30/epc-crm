"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { isDocuSignSignableMimeType } from "@/lib/docusign/signable-documents";
import { syncRecordDocuSignSignatureRequests } from "@/lib/docusign/webhook";
import {
  createDocuSignEnvelope,
  docuSignDocumentExtension,
  getDocuSignRuntimeConfig,
} from "@/lib/integrations/docusign";
import { buildDocuSignEnvelopeDefinition } from "@/lib/integrations/docusign-utils";
import { trustedAppBaseUrl } from "@/lib/http/origin";
import { prisma } from "@/lib/prisma";
import {
  canAccessRecordDocumentEntity,
  recordDocumentPath,
} from "@/lib/record-document-records";
import { getR2ObjectBytes } from "@/lib/storage/r2";

export type SignatureRequestActionState = {
  checked?: number;
  completed?: number;
  failed?: number;
  ok: boolean;
  message: string;
  savedAt?: number | null;
  updated?: number;
};

const createSignatureRequestSchema = z.object({
  entityId: z.string().trim().min(1),
  entityType: z.enum(["Contact", "Company", "SalesOpportunity"]),
  fileId: z.string().trim().min(1),
  message: z
    .string()
    .trim()
    .max(1000, "Message must be 1000 characters or fewer.")
    .optional()
    .transform((value) => value || null),
  signerEmail: z
    .string()
    .trim()
    .email("Enter the signer email address.")
    .max(254)
    .transform((value) => value.toLowerCase()),
  signerName: z
    .string()
    .trim()
    .min(2, "Enter the signer name.")
    .max(120, "Signer name must be 120 characters or fewer."),
  subject: z
    .string()
    .trim()
    .min(3, "Enter an email subject.")
    .max(140, "Subject must be 140 characters or fewer."),
});

const refreshSignatureRequestsSchema = z.object({
  entityId: z.string().trim().min(1),
  entityType: z.enum(["Contact", "Company", "SalesOpportunity"]),
});

function docuSignWebhookUrl(webhookBaseUrl: string) {
  const baseUrl = webhookBaseUrl.trim() || trustedAppBaseUrl();

  return `${baseUrl.replace(/\/+$/, "")}/api/webhooks/docusign`;
}

function safeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("DocuSign is not connected")) {
    return "DocuSign is not connected.";
  }

  if (message.includes("consent is required")) {
    return "DocuSign consent is required before sending documents.";
  }

  if (message.includes("Cloudflare R2")) {
    return message;
  }

  if (message.includes("DocuSign request failed")) {
    return "DocuSign rejected the signature request.";
  }

  return message || "Signature request could not be sent.";
}

function sentAtFromDocuSign(value?: string | null) {
  const parsed = value ? new Date(value) : null;

  return parsed && Number.isFinite(parsed.getTime()) ? parsed : new Date();
}

async function salesOpportunityContactId(entityType: string, entityId: string) {
  if (entityType !== "SalesOpportunity") return null;

  const opportunity = await prisma.salesOpportunity.findUnique({
    where: { id: entityId },
    select: { contactId: true },
  });

  return opportunity?.contactId ?? null;
}

export async function createSignatureRequestAction(
  _: SignatureRequestActionState,
  formData: FormData,
): Promise<SignatureRequestActionState> {
  const user = await requireUser();
  const parsed = createSignatureRequestSchema.safeParse({
    entityId: formData.get("entityId"),
    entityType: formData.get("entityType"),
    fileId: formData.get("fileId"),
    message: formData.get("message"),
    signerEmail: formData.get("signerEmail"),
    signerName: formData.get("signerName"),
    subject: formData.get("subject"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Check the signature request.",
      savedAt: null,
    };
  }

  const record = await canAccessRecordDocumentEntity({
    entityId: parsed.data.entityId,
    entityType: parsed.data.entityType,
    user,
  });

  if (!record) {
    return { ok: false, message: "Record not found.", savedAt: null };
  }

  const file = await prisma.fileAsset.findFirst({
    where: {
      entityId: parsed.data.entityId,
      entityType: parsed.data.entityType,
      id: parsed.data.fileId,
    },
    select: {
      id: true,
      key: true,
      mimeType: true,
      originalName: true,
    },
  });

  if (!file) {
    return { ok: false, message: "Document not found.", savedAt: null };
  }

  if (!isDocuSignSignableMimeType(file.mimeType)) {
    return {
      ok: false,
      message: "DocuSign can send PDF or Word documents only.",
      savedAt: null,
    };
  }

  const existingOpenRequest = await prisma.signatureRequest.findFirst({
    where: {
      sourceFileAssetId: file.id,
      status: { in: ["DRAFT", "SENT", "DELIVERED"] },
    },
    select: { id: true },
  });

  if (existingOpenRequest) {
    return {
      ok: false,
      message: "This document already has an open signature request.",
      savedAt: null,
    };
  }

  let createdSignatureRequestId: string | null = null;

  try {
    const [config, documentBody, contactId] = await Promise.all([
      getDocuSignRuntimeConfig(),
      getR2ObjectBytes({ key: file.key }),
      salesOpportunityContactId(parsed.data.entityType, parsed.data.entityId),
    ]);
    const signatureRequest = await prisma.signatureRequest.create({
      data: {
        createdByUserId: user.id,
        entityId: parsed.data.entityId,
        entityType: parsed.data.entityType,
        message: parsed.data.message,
        sourceFileAssetId: file.id,
        status: "DRAFT",
        subject: parsed.data.subject,
        recipients: {
          create: {
            email: parsed.data.signerEmail,
            name: parsed.data.signerName,
            providerRecipientId: "1",
            roleName: "Customer",
            routingOrder: 1,
            status: "CREATED",
          },
        },
      },
      select: { id: true },
    });
    createdSignatureRequestId = signatureRequest.id;
    const envelopeDefinition = buildDocuSignEnvelopeDefinition({
      crmSignatureRequestId: signatureRequest.id,
      documentBase64: documentBody.toString("base64"),
      documentExtension: docuSignDocumentExtension(
        file.originalName,
        file.mimeType,
      ),
      documentName: file.originalName,
      emailBlurb: parsed.data.message || config.defaultEmailMessage,
      emailSubject: parsed.data.subject || config.defaultEmailSubject,
      includeHmac: Boolean(config.connectHmacSecret),
      recipients: [
        {
          email: parsed.data.signerEmail,
          name: parsed.data.signerName,
          recipientId: "1",
          routingOrder: 1,
        },
      ],
      webhookUrl: docuSignWebhookUrl(config.webhookBaseUrl),
    });
    const envelope = await createDocuSignEnvelope({
      config,
      envelopeDefinition,
    });

    if (!envelope.envelopeId) {
      throw new Error("DocuSign did not return an envelope ID.");
    }

    const sentAt = sentAtFromDocuSign(envelope.statusDateTime);
    const metadata: Prisma.InputJsonObject = {
      envelopeId: envelope.envelopeId,
      provider: "docusign",
      signerEmail: parsed.data.signerEmail,
      sourceFileAssetId: file.id,
    };

    await prisma.$transaction(async (tx) => {
      await tx.signatureRequest.update({
        where: { id: signatureRequest.id },
        data: {
          providerEnvelopeId: envelope.envelopeId,
          providerStatus: envelope.status ?? "sent",
          sentAt,
          status: "SENT",
        },
      });
      await tx.signatureRecipient.updateMany({
        where: { requestId: signatureRequest.id },
        data: {
          providerRecipientId: "1",
          status: "SENT",
        },
      });
      await tx.signatureEvent.create({
        data: {
          eventType: "envelope-sent",
          metadata,
          occurredAt: sentAt,
          provider: "docusign",
          providerStatus: envelope.status ?? "sent",
          requestId: signatureRequest.id,
        },
      });
      await tx.auditLog.create({
        data: {
          action: "signature_request.sent",
          actorId: user.id,
          entity: "SignatureRequest",
          entityId: signatureRequest.id,
          metadata,
        },
      });

      if (parsed.data.entityType === "SalesOpportunity") {
        await tx.salesCommunication.create({
          data: {
            body: parsed.data.message,
            channel: "SYSTEM",
            contactId,
            direction: "OUTBOUND",
            externalId: envelope.envelopeId,
            fromAddress: user.email,
            metadata: {
              ...metadata,
              signatureRequestId: signatureRequest.id,
            },
            opportunityId: parsed.data.entityId,
            subject: parsed.data.subject,
            summary: `DocuSign request sent to ${parsed.data.signerName}.`,
            toAddress: parsed.data.signerEmail,
            userId: user.id,
          },
        });
      }
    });

    revalidatePath(
      recordDocumentPath(parsed.data.entityType, parsed.data.entityId),
    );

    return {
      ok: true,
      message: "DocuSign signature request sent.",
      savedAt: Date.now(),
    };
  } catch (error) {
    if (createdSignatureRequestId) {
      await prisma.signatureRequest
        .update({
          where: { id: createdSignatureRequestId },
          data: {
            errorMessage: safeErrorMessage(error),
            status: "ERROR",
          },
        })
        .catch(() => null);
    }

    return {
      ok: false,
      message: safeErrorMessage(error),
      savedAt: null,
    };
  }
}

export async function refreshRecordSignatureRequestsAction(
  _: SignatureRequestActionState,
  formData: FormData,
): Promise<SignatureRequestActionState> {
  const user = await requireUser();
  const parsed = refreshSignatureRequestsSchema.safeParse({
    entityId: formData.get("entityId"),
    entityType: formData.get("entityType"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Check the signature request.",
      savedAt: null,
    };
  }

  const record = await canAccessRecordDocumentEntity({
    entityId: parsed.data.entityId,
    entityType: parsed.data.entityType,
    user,
  });

  if (!record) {
    return { ok: false, message: "Record not found.", savedAt: null };
  }

  try {
    const result = await syncRecordDocuSignSignatureRequests({
      entityId: parsed.data.entityId,
      entityType: parsed.data.entityType,
    });

    if (!result.checked) {
      return {
        checked: result.checked,
        completed: result.completed,
        failed: result.failed,
        ok: true,
        message: "No open DocuSign requests need refreshing.",
        savedAt: Date.now(),
        updated: result.updated,
      };
    }

    if (result.failed) {
      return {
        checked: result.checked,
        completed: result.completed,
        failed: result.failed,
        ok: false,
        message: `${result.failed} DocuSign request${
          result.failed === 1 ? "" : "s"
        } could not be refreshed.`,
        savedAt: null,
        updated: result.updated,
      };
    }

    if (!result.updated) {
      return {
        checked: result.checked,
        completed: result.completed,
        failed: result.failed,
        ok: true,
        message: "DocuSign status is already up to date.",
        savedAt: Date.now(),
        updated: result.updated,
      };
    }

    revalidatePath(
      recordDocumentPath(parsed.data.entityType, parsed.data.entityId),
    );
    revalidatePath("/storage");

    return {
      checked: result.checked,
      completed: result.completed,
      failed: result.failed,
      ok: true,
      message: `${result.updated} DocuSign request${
        result.updated === 1 ? "" : "s"
      } refreshed${
        result.completed ? `, ${result.completed} completed` : ""
      }.`,
      savedAt: Date.now(),
      updated: result.updated,
    };
  } catch (error) {
    return {
      ok: false,
      message: safeErrorMessage(error),
      savedAt: null,
    };
  }
}
