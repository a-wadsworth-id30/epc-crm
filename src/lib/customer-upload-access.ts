import "server-only";

import {
  customerDocumentPortalState,
  customerDocumentPortalTokenHash,
} from "@/lib/customer-document-portals";
import {
  customerUploadRequestState,
  customerUploadTokenHash,
} from "@/lib/customer-upload-requests";
import {
  isDocumentUploadType,
  type DocumentUploadType,
} from "@/lib/document-library";
import { prisma } from "@/lib/prisma";
import {
  isRecordDocumentEntityType,
  type RecordDocumentEntityType,
} from "@/lib/record-document-records";

type UploadRequestForAccess = {
  completedAt: Date | null;
  entityId: string;
  entityType: string;
  expiresAt: Date;
  id: string;
  items: Array<{
    id: string;
    label: string;
    uploadType: string;
  }>;
  revokedAt: Date | null;
  status: string;
};

export type CustomerUploadAccessContext = {
  accessPath: string;
  accessTokenHash: string;
  item: {
    id: string;
    label: string;
    uploadType: DocumentUploadType;
  };
  request: {
    entityId: string;
    entityType: RecordDocumentEntityType;
    id: string;
  };
};

export function customerUploadAccessTokenHashes(token: string) {
  return [
    customerUploadTokenHash(token),
    customerDocumentPortalTokenHash(token),
  ];
}

function assertOpenRequest(
  request: UploadRequestForAccess,
): asserts request is UploadRequestForAccess & {
  entityType: RecordDocumentEntityType;
} {
  const state = customerUploadRequestState({
    completedAt: request.completedAt,
    expiresAt: request.expiresAt,
    revokedAt: request.revokedAt,
    status: request.status,
  });

  if (state !== "open") {
    throw new Error("This upload checklist is no longer open.");
  }

  if (!isRecordDocumentEntityType(request.entityType)) {
    throw new Error("This upload checklist is misconfigured.");
  }
}

function uploadAccessContext({
  accessPath,
  accessTokenHash,
  itemId,
  request,
}: {
  accessPath: string;
  accessTokenHash: string;
  itemId: string;
  request: UploadRequestForAccess;
}): CustomerUploadAccessContext {
  assertOpenRequest(request);

  const item = request.items.find((candidate) => candidate.id === itemId);
  const uploadType = item?.uploadType;

  if (!item || !isDocumentUploadType(uploadType)) {
    throw new Error("Choose a requested document type.");
  }

  return {
    accessPath,
    accessTokenHash,
    item: {
      id: item.id,
      label: item.label,
      uploadType,
    },
    request: {
      entityId: request.entityId,
      entityType: request.entityType,
      id: request.id,
    },
  };
}

export async function findOpenCustomerUploadAccessItem({
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
      completedAt: true,
      entityId: true,
      entityType: true,
      expiresAt: true,
      id: true,
      items: {
        select: {
          id: true,
          label: true,
          uploadType: true,
        },
      },
      revokedAt: true,
      status: true,
    },
  });

  if (request) {
    return uploadAccessContext({
      accessPath: `/upload/${token}`,
      accessTokenHash: uploadTokenHash,
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
          completedAt: true,
          entityId: true,
          entityType: true,
          expiresAt: true,
          id: true,
          items: {
            select: {
              id: true,
              label: true,
              uploadType: true,
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

  return uploadAccessContext({
    accessPath: `/portal/${token}`,
    accessTokenHash: portalTokenHash,
    itemId,
    request: portal.uploadRequest,
  });
}
