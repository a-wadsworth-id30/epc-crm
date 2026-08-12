import "server-only";

import { FileAssetVisibility, type FileAsset } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import {
  userCanAccessCallLogRecord,
  userCanAccessCompanyRecord,
  userCanAccessContactRecord,
  userCanAccessOpportunityRecord,
} from "@/lib/crm-resource-access";
import { prisma } from "@/lib/prisma";

type AuthorizableFileAsset = Pick<
  FileAsset,
  "entityId" | "entityType" | "uploadedById" | "visibility"
>;

export type FileAssetAccessResult =
  | { ok: true }
  | { ok: false; message: string; status: 401 | 403 };

async function userCanAccessCallLogMedia(callLogId: string, user: CurrentUser) {
  const callLog = await prisma.callLog.findUnique({
    where: { id: callLogId },
    select: {
      userId: true,
      opportunity: { select: { ownerId: true } },
      contactId: true,
      queueEntries: {
        select: { assignedUserId: true },
        take: 25,
      },
    },
  });

  if (!callLog) return false;
  return userCanAccessCallLogRecord(callLog, user);
}

export async function authorizeFileAssetAccess(
  fileAsset: AuthorizableFileAsset,
  user: CurrentUser | null,
): Promise<FileAssetAccessResult> {
  if (fileAsset.visibility === FileAssetVisibility.PUBLIC) {
    return { ok: true };
  }

  if (!user) {
    return {
      ok: false,
      message: "Not authenticated.",
      status: 401,
    };
  }

  if (user.role === "ADMIN" || fileAsset.uploadedById === user.id) {
    return { ok: true };
  }

  const { entityId, entityType } = fileAsset;

  if (!entityId || !entityType) {
    return {
      ok: false,
      message: "You do not have access to this file.",
      status: 403,
    };
  }

  if (entityType === "User" && entityId === user.id) {
    return { ok: true };
  }

  let hasEntityAccess = false;

  if (entityType === "SalesOpportunity") {
    hasEntityAccess = await userCanAccessOpportunityRecord(entityId, user);
  } else if (entityType === "Contact") {
    hasEntityAccess = await userCanAccessContactRecord(entityId, user);
  } else if (entityType === "Company") {
    hasEntityAccess = await userCanAccessCompanyRecord(entityId, user);
  } else if (entityType === "CallLog") {
    hasEntityAccess = await userCanAccessCallLogMedia(entityId, user);
  }

  if (hasEntityAccess) {
    return { ok: true };
  }

  return {
    ok: false,
    message: "You do not have access to this file.",
    status: 403,
  };
}
