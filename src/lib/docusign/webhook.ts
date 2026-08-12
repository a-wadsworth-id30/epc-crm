import "server-only";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
  downloadDocuSignEnvelopeDocument,
  getDocuSignEnvelope,
  getDocuSignEnvelopeRecipients,
  getDocuSignRuntimeConfig,
  type DocuSignRuntimeConfig,
} from "@/lib/integrations/docusign";
import {
  mapDocuSignEnvelopeStatus,
  mapDocuSignRecipientStatus,
  verifyDocuSignHmacSignature,
} from "@/lib/integrations/docusign-utils";
import { prisma } from "@/lib/prisma";
import {
  isRecordDocumentEntityType,
  recordDocumentPath,
} from "@/lib/record-document-records";
import { storeSignatureRequestPdf } from "@/lib/signature-request-storage";

type JsonRecord = Record<string, unknown>;

export class InvalidDocuSignSignatureError extends Error {}
export class InvalidDocuSignWebhookError extends Error {}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function parseDate(value: unknown) {
  const parsed = asString(value) ? new Date(asString(value)) : null;

  return parsed && Number.isFinite(parsed.getTime()) ? parsed : null;
}

function statusFromEvent(eventType: string) {
  return eventType.toLowerCase().replace(/^envelope-/, "");
}

function textCustomFields(value: unknown) {
  const customFields = asRecord(value);
  const textFields = asArray(customFields.textCustomFields);

  return textFields.map(asRecord);
}

function customFieldValue({
  data,
  envelopeSummary,
  name,
  payload,
}: {
  data: JsonRecord;
  envelopeSummary: JsonRecord;
  name: string;
  payload: JsonRecord;
}) {
  const fields = [
    ...textCustomFields(envelopeSummary.customFields),
    ...textCustomFields(data.customFields),
    ...textCustomFields(payload.customFields),
  ];
  const field = fields.find(
    (candidate) =>
      asString(candidate.name).toLowerCase() === name.toLowerCase(),
  );

  return asString(field?.value);
}

function recipientRows({
  data,
  envelopeSummary,
  payload,
}: {
  data: JsonRecord;
  envelopeSummary: JsonRecord;
  payload: JsonRecord;
}) {
  const recipientRoots = [
    asRecord(envelopeSummary.recipients),
    asRecord(data.recipients),
    asRecord(payload.recipients),
  ];

  return recipientRoots.flatMap((root) => [
    ...asArray(root.signers).map(asRecord),
    ...asArray(root.carbonCopies).map(asRecord),
  ]);
}

function signerRows(value: unknown) {
  return asArray(asRecord(value).signers).map(asRecord);
}

function safeFileStem(fileName: string) {
  const stem = fileName.replace(/\.[^.]+$/, "").trim();

  return stem || "signed-document";
}

function safeProviderStatus(status: string, eventType: string) {
  return status || statusFromEvent(eventType) || null;
}

function allSignersCompleted(recipients: JsonRecord) {
  const signers = signerRows(recipients);

  return (
    signers.length > 0 &&
    signers.every(
      (row) =>
        mapDocuSignRecipientStatus(
          asString(row.status) || asString(row.recipientStatus),
        ) === "COMPLETED",
    )
  );
}

function completionTimestampData({
  occurredAt,
  status,
}: {
  occurredAt: Date;
  status: NonNullable<ReturnType<typeof mapDocuSignEnvelopeStatus>>;
}) {
  if (status === "COMPLETED") return { completedAt: occurredAt };
  if (status === "DELIVERED") return { deliveredAt: occurredAt };
  if (status === "DECLINED") return { declinedAt: occurredAt };
  if (status === "VOIDED") return { voidedAt: occurredAt };

  return {};
}

function envelopeOccurredAt({
  envelope,
  status,
}: {
  envelope: JsonRecord;
  status: NonNullable<ReturnType<typeof mapDocuSignEnvelopeStatus>> | null;
}) {
  if (status === "COMPLETED") {
    return (
      parseDate(envelope.completedDateTime) ??
      parseDate(envelope.statusDateTime) ??
      new Date()
    );
  }

  if (status === "DELIVERED") {
    return (
      parseDate(envelope.deliveredDateTime) ??
      parseDate(envelope.statusDateTime) ??
      new Date()
    );
  }

  if (status === "DECLINED") {
    return (
      parseDate(envelope.declinedDateTime) ??
      parseDate(envelope.statusDateTime) ??
      new Date()
    );
  }

  if (status === "VOIDED") {
    return (
      parseDate(envelope.voidedDateTime) ??
      parseDate(envelope.statusDateTime) ??
      new Date()
    );
  }

  return (
    parseDate(envelope.statusDateTime) ??
    parseDate(envelope.sentDateTime) ??
    new Date()
  );
}

function recipientTimestampData({
  occurredAt,
  row,
  status,
}: {
  occurredAt: Date;
  row: JsonRecord;
  status: NonNullable<ReturnType<typeof mapDocuSignRecipientStatus>>;
}) {
  if (status === "COMPLETED") {
    return {
      signedAt:
        parseDate(row.signedDateTime) ??
        parseDate(row.completedDateTime) ??
        occurredAt,
    };
  }

  if (status === "DELIVERED") {
    return {
      deliveredAt: parseDate(row.deliveredDateTime) ?? occurredAt,
    };
  }

  if (status === "DECLINED") {
    return {
      declinedAt: parseDate(row.declinedDateTime) ?? occurredAt,
    };
  }

  return {};
}

function syncErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("DocuSign is not connected")) {
    return "DocuSign is not connected.";
  }

  if (message.includes("consent is required")) {
    return "DocuSign consent is required before refreshing signature status.";
  }

  if (message.includes("DocuSign request failed")) {
    return "DocuSign status could not be refreshed.";
  }

  return message || "DocuSign status could not be refreshed.";
}

type DocuSignSignatureRequestRecord = {
  certificateFileAssetId: string | null;
  createdByUserId: string | null;
  entityId: string;
  entityType: string;
  errorMessage: string | null;
  id: string;
  providerEnvelopeId: string | null;
  providerStatus: string | null;
  signedFileAssetId: string | null;
  sourceFileAsset: { originalName: string };
  status: string;
};

async function storeCompletedEnvelopeDocuments({
  envelopeId,
  request,
}: {
  envelopeId: string;
  request: {
    certificateFileAssetId: string | null;
    createdByUserId: string | null;
    entityId: string;
    entityType: string;
    signedFileAssetId: string | null;
    sourceFileAsset: { originalName: string };
  };
}) {
  if (!isRecordDocumentEntityType(request.entityType)) {
    return {
      certificateFileAssetId: null,
      error: "Signature request entity type is not supported.",
      signedFileAssetId: null,
    };
  }

  const config = await getDocuSignRuntimeConfig();
  const stem = safeFileStem(request.sourceFileAsset.originalName);
  let signedFileAssetId: string | null = null;
  let certificateFileAssetId: string | null = null;
  const failures: string[] = [];

  if (!request.signedFileAssetId) {
    try {
      const signed = await downloadDocuSignEnvelopeDocument({
        config,
        documentId: "combined",
        envelopeId,
      });
      const signedAsset = await storeSignatureRequestPdf({
        body: signed.body,
        contentType: signed.contentType,
        createdByUserId: request.createdByUserId,
        entityId: request.entityId,
        entityType: request.entityType,
        originalName: `${stem} - signed.pdf`,
        tags: ["docusign", "signed"],
      });

      signedFileAssetId = signedAsset.id;
    } catch (error) {
      failures.push(
        error instanceof Error
          ? error.message
          : "Signed document could not be stored.",
      );
    }
  }

  if (!request.certificateFileAssetId) {
    try {
      const certificate = await downloadDocuSignEnvelopeDocument({
        config,
        documentId: "certificate",
        envelopeId,
      });
      const certificateAsset = await storeSignatureRequestPdf({
        body: certificate.body,
        contentType: certificate.contentType,
        createdByUserId: request.createdByUserId,
        entityId: request.entityId,
        entityType: request.entityType,
        originalName: `${stem} - certificate.pdf`,
        tags: ["certificate", "docusign"],
      });

      certificateFileAssetId = certificateAsset.id;
    } catch (error) {
      failures.push(
        error instanceof Error
          ? error.message
          : "Completion certificate could not be stored.",
      );
    }
  }

  return {
    certificateFileAssetId,
    error: failures[0] ?? null,
    signedFileAssetId,
  };
}

async function syncDocuSignSignatureRequestWithConfig({
  config,
  requestId,
  syncSource = "manual_refresh",
}: {
  config: DocuSignRuntimeConfig;
  requestId: string;
  syncSource?: "manual_refresh" | "record_load";
}) {
  const request = await prisma.signatureRequest.findFirst({
    where: {
      id: requestId,
      provider: "docusign",
      providerEnvelopeId: { not: null },
    },
    select: {
      certificateFileAssetId: true,
      createdByUserId: true,
      entityId: true,
      entityType: true,
      errorMessage: true,
      id: true,
      providerEnvelopeId: true,
      providerStatus: true,
      signedFileAssetId: true,
      sourceFileAsset: { select: { originalName: true } },
      status: true,
    },
  });

  if (!request?.providerEnvelopeId) {
    return {
      changed: false,
      ok: false,
      reason: "missing-envelope",
      requestId,
      status: null,
    };
  }

  const [envelope, recipients] = await Promise.all([
    getDocuSignEnvelope({
      config,
      envelopeId: request.providerEnvelopeId,
    }),
    getDocuSignEnvelopeRecipients({
      config,
      envelopeId: request.providerEnvelopeId,
    }),
  ]);
  const envelopeRecord = asRecord(envelope);
  const recipientRecord = asRecord(recipients);
  const providerStatus = safeProviderStatus(
    asString(envelopeRecord.status),
    "docusign.status_sync",
  );
  const docuSignMappedStatus = mapDocuSignEnvelopeStatus(providerStatus);
  const mappedStatus =
    docuSignMappedStatus === "SENT" || docuSignMappedStatus === "DELIVERED"
      ? allSignersCompleted(recipientRecord)
        ? "COMPLETED"
        : docuSignMappedStatus
      : docuSignMappedStatus;
  const occurredAt = envelopeOccurredAt({
    envelope: envelopeRecord,
    status: mappedStatus,
  });
  const recipientUpdates = recipientRows({
    data: {
      ...envelopeRecord,
      recipients: recipientRecord,
    },
    envelopeSummary: {},
    payload: {},
  })
    .map((row) => ({
      email: asString(row.email).toLowerCase(),
      providerRecipientId: asString(row.recipientId),
      row,
      status: mapDocuSignRecipientStatus(
        asString(row.status) || asString(row.recipientStatus),
      ),
    }))
    .filter((row) => row.status && (row.email || row.providerRecipientId));
  const completedDocuments =
    mappedStatus === "COMPLETED"
      ? await storeCompletedEnvelopeDocuments({
          envelopeId: request.providerEnvelopeId,
          request: request satisfies DocuSignSignatureRequestRecord,
        })
      : {
          certificateFileAssetId: null,
          error: null,
          signedFileAssetId: null,
        };
  const changed =
    Boolean(completedDocuments.signedFileAssetId) ||
    Boolean(completedDocuments.certificateFileAssetId) ||
    completedDocuments.error !== request.errorMessage ||
    providerStatus !== request.providerStatus ||
    Boolean(mappedStatus && mappedStatus !== request.status);

  if (!changed) {
    return {
      changed: false,
      ok: true,
      reason: null,
      requestId: request.id,
      status: mappedStatus ?? request.status,
    };
  }

  const metadata: Prisma.InputJsonObject = {
    crmSignatureRequestId: request.id,
    envelopeId: request.providerEnvelopeId,
    hasCertificateFile: Boolean(
      completedDocuments.certificateFileAssetId ??
        request.certificateFileAssetId,
    ),
    hasSignedFile: Boolean(
      completedDocuments.signedFileAssetId ?? request.signedFileAssetId,
    ),
    provider: "docusign",
    remoteEnvelopeStatus: providerStatus,
    recipientUpdateCount: recipientUpdates.length,
    storageError: completedDocuments.error,
    syncSource,
  };

  await prisma.$transaction(async (tx) => {
    await tx.signatureEvent.create({
      data: {
        eventType: "docusign.status_sync",
        metadata,
        occurredAt,
        provider: "docusign",
        providerStatus,
        requestId: request.id,
      },
    });

    const requestData: Prisma.SignatureRequestUpdateInput = {
      errorMessage: completedDocuments.error,
      lastEventAt: occurredAt,
      providerStatus,
      ...(completedDocuments.signedFileAssetId
        ? {
            signedFileAsset: {
              connect: { id: completedDocuments.signedFileAssetId },
            },
          }
        : {}),
      ...(completedDocuments.certificateFileAssetId
        ? {
            certificateFileAsset: {
              connect: { id: completedDocuments.certificateFileAssetId },
            },
          }
        : {}),
      ...(mappedStatus
        ? {
            status: mappedStatus,
            ...completionTimestampData({
              occurredAt,
              status: mappedStatus,
            }),
          }
        : {}),
    };

    await tx.signatureRequest.update({
      where: { id: request.id },
      data: requestData,
    });

    for (const update of recipientUpdates) {
      const where: Prisma.SignatureRecipientWhereInput[] = [];

      if (update.providerRecipientId) {
        where.push({ providerRecipientId: update.providerRecipientId });
      }

      if (update.email) {
        where.push({ email: { equals: update.email, mode: "insensitive" } });
      }

      await tx.signatureRecipient.updateMany({
        where: {
          requestId: request.id,
          OR: where,
        },
        data: {
          providerRecipientId: update.providerRecipientId || undefined,
          status: update.status ?? undefined,
          ...recipientTimestampData({
            occurredAt,
            row: update.row,
            status: update.status!,
          }),
        },
      });
    }

    await tx.auditLog.create({
      data: {
        action: mappedStatus
          ? `signature_request.${mappedStatus.toLowerCase()}`
          : "signature_request.status_sync",
        actorId: null,
        entity: "SignatureRequest",
        entityId: request.id,
        metadata,
      },
    });
  });

  return {
    changed: true,
    ok: true,
    reason: null,
    requestId: request.id,
    status: mappedStatus ?? request.status,
  };
}

export async function syncDocuSignSignatureRequestStatus({
  requestId,
}: {
  requestId: string;
}) {
  const config = await getDocuSignRuntimeConfig();

  return syncDocuSignSignatureRequestWithConfig({ config, requestId });
}

export async function syncRecordDocuSignSignatureRequests({
  entityId,
  entityType,
  maxRequests = 10,
  syncSource = "manual_refresh",
}: {
  entityId: string;
  entityType: string;
  maxRequests?: number;
  syncSource?: "manual_refresh" | "record_load";
}) {
  const requests = await prisma.signatureRequest.findMany({
    where: {
      entityId,
      entityType,
      provider: "docusign",
      providerEnvelopeId: { not: null },
      OR: [
        { status: { in: ["DRAFT", "SENT", "DELIVERED"] } },
        {
          status: "COMPLETED",
          OR: [
            { certificateFileAssetId: null },
            { errorMessage: { not: null } },
            { signedFileAssetId: null },
          ],
        },
      ],
    },
    orderBy: { updatedAt: "asc" },
    select: { id: true },
    take: Math.max(1, Math.min(maxRequests, 25)),
  });

  if (!requests.length) {
    return {
      checked: 0,
      completed: 0,
      failed: 0,
      results: [],
      updated: 0,
    };
  }

  const config = await getDocuSignRuntimeConfig();
  const results = [];

  for (const request of requests) {
    try {
      results.push(
        await syncDocuSignSignatureRequestWithConfig({
          config,
          requestId: request.id,
          syncSource,
        }),
      );
    } catch (error) {
      results.push({
        changed: false,
        error: syncErrorMessage(error),
        ok: false,
        reason: "refresh-failed",
        requestId: request.id,
        status: null,
      });
    }
  }

  return {
    checked: requests.length,
    completed: results.filter((result) => result.status === "COMPLETED")
      .length,
    failed: results.filter((result) => !result.ok).length,
    results,
    updated: results.filter((result) => result.changed).length,
  };
}

export async function handleDocuSignWebhook({
  body,
  signature,
}: {
  body: string;
  signature: string | null;
}) {
  const config = await getDocuSignRuntimeConfig();

  if (
    !verifyDocuSignHmacSignature({
      body,
      secret: config.connectHmacSecret,
      signature,
    })
  ) {
    throw new InvalidDocuSignSignatureError("Invalid DocuSign signature.");
  }

  let payload: JsonRecord;

  try {
    payload = JSON.parse(body) as JsonRecord;
  } catch {
    throw new InvalidDocuSignWebhookError("Invalid JSON.");
  }

  const data = asRecord(payload.data);
  const envelopeSummary = asRecord(
    data.envelopeSummary ?? payload.envelopeSummary,
  );
  const eventType =
    asString(payload.event) ||
    asString(payload.eventType) ||
    asString(payload.type) ||
    "docusign.event";
  const envelopeId =
    asString(data.envelopeId) ||
    asString(data.envelopeID) ||
    asString(envelopeSummary.envelopeId);

  if (!envelopeId) {
    throw new InvalidDocuSignWebhookError("DocuSign envelope ID is missing.");
  }

  const crmSignatureRequestId = customFieldValue({
    data,
    envelopeSummary,
    name: "crmSignatureRequestId",
    payload,
  });
  const request = await prisma.signatureRequest.findFirst({
    where: {
      provider: "docusign",
      OR: [
        { providerEnvelopeId: envelopeId },
        ...(crmSignatureRequestId
          ? [
              {
                id: crmSignatureRequestId,
                OR: [
                  { providerEnvelopeId: envelopeId },
                  { providerEnvelopeId: null },
                ],
              },
            ]
          : []),
      ],
    },
    select: {
      certificateFileAssetId: true,
      createdByUserId: true,
      entityId: true,
      entityType: true,
      id: true,
      signedFileAssetId: true,
      sourceFileAsset: { select: { originalName: true } },
    },
  });

  if (!request) {
    return { ignored: true, ok: true, reason: "unknown-envelope" };
  }

  const providerStatus = safeProviderStatus(
    asString(envelopeSummary.status) || asString(data.status),
    eventType,
  );
  const mappedStatus = mapDocuSignEnvelopeStatus(providerStatus);
  const occurredAt =
    parseDate(payload.eventDateTime) ??
    parseDate(data.eventDateTime) ??
    parseDate(envelopeSummary.statusDateTime) ??
    new Date();
  const recipientUpdates = recipientRows({
    data,
    envelopeSummary,
    payload,
  })
    .map((row) => ({
      email: asString(row.email).toLowerCase(),
      providerRecipientId: asString(row.recipientId),
      row,
      status: mapDocuSignRecipientStatus(
        asString(row.status) || asString(row.recipientStatus),
      ),
    }))
    .filter((row) => row.status && (row.email || row.providerRecipientId));
  const completedDocuments =
    mappedStatus === "COMPLETED"
      ? await storeCompletedEnvelopeDocuments({ envelopeId, request })
      : {
          certificateFileAssetId: null,
          error: null,
          signedFileAssetId: null,
        };
  const metadata: Prisma.InputJsonObject = {
    crmSignatureRequestId: request.id,
    envelopeId,
    hasCertificateFile: Boolean(
      completedDocuments.certificateFileAssetId ??
      request.certificateFileAssetId,
    ),
    hasSignedFile: Boolean(
      completedDocuments.signedFileAssetId ?? request.signedFileAssetId,
    ),
    provider: "docusign",
    recipientUpdateCount: recipientUpdates.length,
    storageError: completedDocuments.error,
  };

  await prisma.$transaction(async (tx) => {
    await tx.signatureEvent.create({
      data: {
        eventType,
        metadata,
        occurredAt,
        provider: "docusign",
        providerStatus,
        requestId: request.id,
      },
    });

    const requestData: Prisma.SignatureRequestUpdateInput = {
      errorMessage: completedDocuments.error,
      lastEventAt: occurredAt,
      providerEnvelopeId: envelopeId,
      providerStatus,
      ...(completedDocuments.signedFileAssetId
        ? {
            signedFileAsset: {
              connect: { id: completedDocuments.signedFileAssetId },
            },
          }
        : {}),
      ...(completedDocuments.certificateFileAssetId
        ? {
            certificateFileAsset: {
              connect: { id: completedDocuments.certificateFileAssetId },
            },
          }
        : {}),
      ...(mappedStatus
        ? {
            status: mappedStatus,
            ...completionTimestampData({
              occurredAt,
              status: mappedStatus,
            }),
          }
        : {}),
    };

    await tx.signatureRequest.update({
      where: { id: request.id },
      data: requestData,
    });

    for (const update of recipientUpdates) {
      const where: Prisma.SignatureRecipientWhereInput[] = [];

      if (update.providerRecipientId) {
        where.push({ providerRecipientId: update.providerRecipientId });
      }

      if (update.email) {
        where.push({ email: { equals: update.email, mode: "insensitive" } });
      }

      await tx.signatureRecipient.updateMany({
        where: {
          requestId: request.id,
          OR: where,
        },
        data: {
          providerRecipientId: update.providerRecipientId || undefined,
          status: update.status ?? undefined,
          ...recipientTimestampData({
            occurredAt,
            row: update.row,
            status: update.status!,
          }),
        },
      });
    }

    await tx.auditLog.create({
      data: {
        action: mappedStatus
          ? `signature_request.${mappedStatus.toLowerCase()}`
          : "signature_request.event",
        actorId: null,
        entity: "SignatureRequest",
        entityId: request.id,
        metadata,
      },
    });
  });

  if (isRecordDocumentEntityType(request.entityType)) {
    revalidatePath(recordDocumentPath(request.entityType, request.entityId));
  }
  revalidatePath("/storage");

  return { ignored: false, ok: true, signatureRequestId: request.id };
}
