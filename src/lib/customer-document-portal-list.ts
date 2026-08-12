import "server-only";

import { prisma } from "@/lib/prisma";
import type { RecordDocumentEntityType } from "@/lib/record-document-records";

export async function listRecordCustomerDocumentPortals({
  entityId,
  entityType,
  take = 6,
}: {
  entityId: string;
  entityType: RecordDocumentEntityType;
  take?: number;
}) {
  const portals = await prisma.customerDocumentPortal.findMany({
    where: { entityId, entityType },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      documentShare: {
        select: {
          files: {
            select: {
              downloadCount: true,
              fileAsset: { select: { originalName: true } },
              lastDownloadedAt: true,
            },
          },
        },
      },
      expiresAt: true,
      id: true,
      recipientEmail: true,
      recipientName: true,
      revokedAt: true,
      status: true,
      subject: true,
      uploadRequest: {
        select: {
          completedAt: true,
          items: {
            select: {
              fulfilledAt: true,
              label: true,
            },
          },
        },
      },
    },
    take,
  });

  return portals.map((portal) => {
    const shareFiles = portal.documentShare?.files ?? [];
    const uploadItems = portal.uploadRequest?.items ?? [];
    const lastDownloadedAt = shareFiles.reduce<Date | null>((latest, file) => {
      if (!file.lastDownloadedAt) return latest;
      if (!latest || file.lastDownloadedAt.getTime() > latest.getTime()) {
        return file.lastDownloadedAt;
      }

      return latest;
    }, null);

    return {
      completedUploadItemCount: uploadItems.filter((item) => item.fulfilledAt)
        .length,
      createdAt: portal.createdAt.toISOString(),
      downloadCount: shareFiles.reduce(
        (total, file) => total + file.downloadCount,
        0,
      ),
      expiresAt: portal.expiresAt.toISOString(),
      id: portal.id,
      lastDownloadedAt: lastDownloadedAt?.toISOString() ?? null,
      recipientEmail: portal.recipientEmail,
      recipientName: portal.recipientName,
      requestedDocumentLabels: uploadItems.map((item) => item.label),
      revokedAt: portal.revokedAt?.toISOString() ?? null,
      sentDocumentNames: shareFiles.map((file) => file.fileAsset.originalName),
      shareFileCount: shareFiles.length,
      status: portal.status,
      subject: portal.subject,
      uploadCompletedAt:
        portal.uploadRequest?.completedAt?.toISOString() ?? null,
      uploadItemCount: uploadItems.length,
    };
  });
}
