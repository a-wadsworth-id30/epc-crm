import "server-only";

import type { CurrentUser } from "@/lib/auth";
import { userCanAccessCallLogRecord } from "@/lib/crm-resource-access";
import { prisma } from "@/lib/prisma";

export type CallRecordingAccessResult =
  | { ok: true; callLogId: string }
  | { ok: false; error: string; status: 403 | 404 };

export async function authorizeCallRecordingAccess(
  recordingSid: string,
  user: CurrentUser,
): Promise<CallRecordingAccessResult> {
  const callLog = await prisma.callLog.findFirst({
    where: { recordingSid },
    select: {
      id: true,
      userId: true,
      contactId: true,
      opportunity: { select: { ownerId: true } },
      queueEntries: {
        select: { assignedUserId: true },
        take: 25,
      },
    },
  });

  if (!callLog) {
    return {
      ok: false,
      error: "Recording not found.",
      status: 404,
    };
  }

  if (user.role === "ADMIN") {
    return { ok: true, callLogId: callLog.id };
  }

  if (await userCanAccessCallLogRecord(callLog, user)) {
    return { ok: true, callLogId: callLog.id };
  }

  return {
    ok: false,
    error: "You do not have access to this recording.",
    status: 403,
  };
}
