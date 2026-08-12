import "server-only";

import { prisma } from "@/lib/prisma";
import type { RecordDocumentEntityType } from "@/lib/record-document-records";
import { mediaAssetUrl } from "@/lib/storage/media";

export async function listRecordSignatureRequests({
  entityId,
  entityType,
  take = 30,
}: {
  entityId: string;
  entityType: RecordDocumentEntityType;
  take?: number;
}) {
  const requests = await prisma.signatureRequest.findMany({
    where: { entityId, entityType },
    orderBy: { createdAt: "desc" },
    select: {
      certificateFileAssetId: true,
      completedAt: true,
      createdAt: true,
      declinedAt: true,
      deliveredAt: true,
      errorMessage: true,
      id: true,
      message: true,
      providerStatus: true,
      recipients: {
        orderBy: { routingOrder: "asc" },
        select: {
          email: true,
          name: true,
          status: true,
        },
      },
      sentAt: true,
      signedFileAssetId: true,
      sourceFileAssetId: true,
      status: true,
      subject: true,
      voidedAt: true,
    },
    take,
  });

  return requests.map((request) => ({
    certificateFileAssetId: request.certificateFileAssetId,
    certificateUrl: request.certificateFileAssetId
      ? mediaAssetUrl(request.certificateFileAssetId)
      : null,
    completedAt: request.completedAt?.toISOString() ?? null,
    createdAt: request.createdAt.toISOString(),
    declinedAt: request.declinedAt?.toISOString() ?? null,
    deliveredAt: request.deliveredAt?.toISOString() ?? null,
    errorMessage: request.errorMessage,
    id: request.id,
    message: request.message,
    providerStatus: request.providerStatus,
    recipients: request.recipients.map((recipient) => ({
      email: recipient.email,
      name: recipient.name,
      status: recipient.status,
    })),
    sentAt: request.sentAt?.toISOString() ?? null,
    signedFileAssetId: request.signedFileAssetId,
    signedDocumentUrl: request.signedFileAssetId
      ? mediaAssetUrl(request.signedFileAssetId)
      : null,
    sourceFileAssetId: request.sourceFileAssetId,
    status: request.status,
    subject: request.subject,
    voidedAt: request.voidedAt?.toISOString() ?? null,
  }));
}
