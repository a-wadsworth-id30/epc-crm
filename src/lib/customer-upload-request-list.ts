import "server-only";

import { prisma } from "@/lib/prisma";
import type { RecordDocumentEntityType } from "@/lib/record-document-records";

export async function listRecordCustomerUploadRequests({
  entityId,
  entityType,
  take = 6,
}: {
  entityId: string;
  entityType: RecordDocumentEntityType;
  take?: number;
}) {
  const requests = await prisma.customerUploadRequest.findMany({
    where: { entityId, entityType },
    orderBy: { createdAt: "desc" },
    select: {
      completedAt: true,
      createdAt: true,
      expiresAt: true,
      id: true,
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          fulfilledAt: true,
          label: true,
        },
      },
      recipientEmail: true,
      recipientName: true,
      revokedAt: true,
      status: true,
    },
    take,
  });

  return requests.map((request) => ({
    completedAt: request.completedAt?.toISOString() ?? null,
    completedItemCount: request.items.filter((item) => item.fulfilledAt).length,
    createdAt: request.createdAt.toISOString(),
    expiresAt: request.expiresAt.toISOString(),
    id: request.id,
    itemCount: request.items.length,
    itemLabels: request.items.map((item) => item.label),
    recipientEmail: request.recipientEmail,
    recipientName: request.recipientName,
    revokedAt: request.revokedAt?.toISOString() ?? null,
    status: request.status,
  }));
}
