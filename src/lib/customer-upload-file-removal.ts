import "server-only";

import { CustomerUploadRequestStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
  customerDocumentPortalState,
  customerDocumentPortalTokenHash,
} from "@/lib/customer-document-portals";
import { customerUploadTokenHash } from "@/lib/customer-upload-requests";
import { prisma } from "@/lib/prisma";
import {
  isRecordDocumentEntityType,
  recordDocumentPath,
  type RecordDocumentEntityType,
} from "@/lib/record-document-records";

type RemovableUploadRequest = {
  entityId: string;
  entityType: string;
  expiresAt: Date;
  id: string;
  items: Array<{
    id: string;
    required: boolean;
  }>;
  revokedAt: Date | null;
  status: CustomerUploadRequestStatus;
};

type CustomerUploadFileRemovalContext = {
  accessPath: string;
  itemId: string;
  request: RemovableUploadRequest & {
    entityType: RecordDocumentEntityType;
  };
};

function assertRequestAllowsFileRemoval(
  request: RemovableUploadRequest,
): asserts request is RemovableUploadRequest & {
  entityType: RecordDocumentEntityType;
} {
  if (request.status === CustomerUploadRequestStatus.REVOKED || request.revokedAt) {
    throw new Error("This upload checklist is no longer open.");
  }

  if (request.expiresAt.getTime() <= Date.now()) {
    throw new Error("This upload checklist has expired.");
  }

  if (!isRecordDocumentEntityType(request.entityType)) {
    throw new Error("This upload checklist is misconfigured.");
  }
}

function removalContext({
  accessPath,
  itemId,
  request,
}: {
  accessPath: string;
  itemId: string;
  request: RemovableUploadRequest;
}): CustomerUploadFileRemovalContext {
  assertRequestAllowsFileRemoval(request);

  const item = request.items.find((candidate) => candidate.id === itemId);

  if (!item) {
    throw new Error("Choose a file from this upload checklist.");
  }

  return {
    accessPath,
    itemId,
    request,
  };
}

async function findCustomerUploadFileRemovalContext({
  itemId,
  token,
}: {
  itemId: string;
  token: string;
}) {
  const uploadTokenHash = customerUploadTokenHash(token);
  const request = await prisma.customerUploadRequest.findUnique({
    where: { tokenHash: uploadTokenHash },
    select: {
      entityId: true,
      entityType: true,
      expiresAt: true,
      id: true,
      items: {
        select: {
          id: true,
          required: true,
        },
      },
      revokedAt: true,
      status: true,
    },
  });

  if (request) {
    return removalContext({
      accessPath: `/upload/${token}`,
      itemId,
      request,
    });
  }

  const portalTokenHash = customerDocumentPortalTokenHash(token);
  const portal = await prisma.customerDocumentPortal.findUnique({
    where: { tokenHash: portalTokenHash },
    select: {
      expiresAt: true,
      revokedAt: true,
      status: true,
      uploadRequest: {
        select: {
          entityId: true,
          entityType: true,
          expiresAt: true,
          id: true,
          items: {
            select: {
              id: true,
              required: true,
            },
          },
          revokedAt: true,
          status: true,
        },
      },
    },
  });

  if (!portal) {
    throw new Error("This upload link is not available.");
  }

  const portalState = customerDocumentPortalState({
    expiresAt: portal.expiresAt,
    revokedAt: portal.revokedAt,
    status: portal.status,
  });

  if (portalState !== "open") {
    throw new Error("This customer portal is no longer open.");
  }

  if (!portal.uploadRequest) {
    throw new Error("This customer portal is not requesting uploads.");
  }

  return removalContext({
    accessPath: `/portal/${token}`,
    itemId,
    request: portal.uploadRequest,
  });
}

async function uploadedFileHasOtherRecordUses({
  fileAssetId,
  removedLinkId,
}: {
  fileAssetId: string;
  removedLinkId: string;
}) {
  const [
    uploadLinkCount,
    documentShareCount,
    signatureRequestCount,
  ] = await Promise.all([
    prisma.customerUploadRequestFile.count({
      where: {
        fileAssetId,
        id: { not: removedLinkId },
      },
    }),
    prisma.customerDocumentShareFile.count({ where: { fileAssetId } }),
    prisma.signatureRequest.count({
      where: {
        OR: [
          { certificateFileAssetId: fileAssetId },
          { signedFileAssetId: fileAssetId },
          { sourceFileAssetId: fileAssetId },
        ],
      },
    }),
  ]);

  return uploadLinkCount + documentShareCount + signatureRequestCount > 0;
}

async function writeAuditLog({
  entityId,
  metadata,
}: {
  entityId: string;
  metadata: Prisma.InputJsonValue;
}) {
  await prisma.auditLog.create({
    data: {
      action: "customer_upload_request.file_removed",
      actorId: null,
      entity: "CustomerUploadRequest",
      entityId,
      metadata,
    },
  });
}

export async function removeCustomerUploadedFile({
  fileAssetId,
  itemId,
  token,
}: {
  fileAssetId: string;
  itemId: string;
  token: string;
}) {
  const context = await findCustomerUploadFileRemovalContext({ itemId, token });
  const link = await prisma.customerUploadRequestFile.findFirst({
    where: {
      fileAssetId,
      itemId: context.itemId,
    },
    select: {
      id: true,
    },
  });

  if (!link) {
    throw new Error("Choose a file from this upload checklist.");
  }

  const keepRecordAssociation = await uploadedFileHasOtherRecordUses({
    fileAssetId,
    removedLinkId: link.id,
  });
  const result = await prisma.$transaction(async (tx) => {
    await tx.customerUploadRequestFile.delete({
      where: { id: link.id },
    });

    const remainingFilesForItem = await tx.customerUploadRequestFile.count({
      where: { itemId: context.itemId },
    });

    if (!remainingFilesForItem) {
      await tx.customerUploadRequestItem.update({
        where: { id: context.itemId },
        data: { fulfilledAt: null },
      });
    }

    const remainingRequired = await tx.customerUploadRequestItem.count({
      where: {
        fulfilledAt: null,
        requestId: context.request.id,
        required: true,
      },
    });
    const needsReplacement = remainingRequired > 0;
    const reopenedRequest =
      needsReplacement &&
      context.request.status === CustomerUploadRequestStatus.COMPLETED;

    if (reopenedRequest) {
      await tx.customerUploadRequest.update({
        where: { id: context.request.id },
        data: {
          completedAt: null,
          status: CustomerUploadRequestStatus.OPEN,
        },
      });
    }

    if (!keepRecordAssociation) {
      await tx.fileAsset.update({
        where: { id: fileAssetId },
        data: {
          documentFolder: null,
          documentUploadType: null,
          entityId: null,
          entityType: null,
        },
      });
    }

    return {
      detachedFromRecord: !keepRecordAssociation,
      needsReplacement,
      remainingFilesForItem,
      reopenedRequest,
    };
  });

  await writeAuditLog({
    entityId: context.request.id,
    metadata: {
      detachedFromRecord: result.detachedFromRecord,
      entityId: context.request.entityId,
      entityType: context.request.entityType,
      fileAssetId,
      itemId: context.itemId,
      needsReplacement: result.needsReplacement,
      remainingFilesForItem: result.remainingFilesForItem,
      reopenedRequest: result.reopenedRequest,
    },
  });

  revalidatePath(context.accessPath);
  revalidatePath(
    recordDocumentPath(context.request.entityType, context.request.entityId),
  );
  revalidatePath("/storage");

  return result;
}
