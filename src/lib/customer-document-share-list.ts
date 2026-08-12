import "server-only";

import { prisma } from "@/lib/prisma";
import type { RecordDocumentEntityType } from "@/lib/record-document-records";

export async function listRecordCustomerDocumentShares({
  entityId,
  entityType,
  take = 6,
}: {
  entityId: string;
  entityType: RecordDocumentEntityType;
  take?: number;
}) {
  const shares = await prisma.customerDocumentShare.findMany({
    where: { entityId, entityType },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      expiresAt: true,
      files: {
        orderBy: { createdAt: "asc" },
        select: {
          displayName: true,
          downloadCount: true,
          firstDownloadedAt: true,
          lastDownloadedAt: true,
          fileAsset: {
            select: {
              originalName: true,
            },
          },
        },
      },
      id: true,
      recipientEmail: true,
      recipientName: true,
      revokedAt: true,
      status: true,
      subject: true,
    },
    take,
  });

  return shares.map((share) => {
    const downloadCount = share.files.reduce(
      (total, file) => total + file.downloadCount,
      0,
    );
    const firstDownloadedAt = share.files.reduce<Date | null>(
      (earliest, file) => {
        if (!file.firstDownloadedAt) return earliest;
        if (
          !earliest ||
          file.firstDownloadedAt.getTime() < earliest.getTime()
        ) {
          return file.firstDownloadedAt;
        }

        return earliest;
      },
      null,
    );
    const lastDownloadedAt = share.files.reduce<Date | null>((latest, file) => {
      if (!file.lastDownloadedAt) return latest;
      if (!latest || file.lastDownloadedAt.getTime() > latest.getTime()) {
        return file.lastDownloadedAt;
      }

      return latest;
    }, null);

    return {
      createdAt: share.createdAt.toISOString(),
      downloadCount,
      expiresAt: share.expiresAt.toISOString(),
      fileCount: share.files.length,
      fileNames: share.files.map(
        (file) => file.displayName ?? file.fileAsset.originalName,
      ),
      firstDownloadedAt: firstDownloadedAt?.toISOString() ?? null,
      id: share.id,
      lastDownloadedAt: lastDownloadedAt?.toISOString() ?? null,
      recipientEmail: share.recipientEmail,
      recipientName: share.recipientName,
      revokedAt: share.revokedAt?.toISOString() ?? null,
      status: share.status,
      subject: share.subject,
    };
  });
}
