import "server-only";

import type { Prisma } from "@prisma/client";
import { gmailSyncFailureMetadata } from "@/lib/integrations/gmail-sync-retry-policy";
import { prisma } from "@/lib/prisma";
import { revalidateHeaderNotifications } from "@/lib/notifications";

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function safeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Gmail sync failed.";
  return message.replace(/\s+/g, " ").trim().slice(0, 500) || "Gmail sync failed.";
}

export async function recordGmailSyncFailure(
  mailboxId: string,
  error: unknown,
  now = new Date(),
) {
  try {
    const mailbox = await prisma.emailMailbox.findUnique({
      where: { id: mailboxId },
      select: { metadata: true },
    });
    if (!mailbox) return;

    await prisma.emailMailbox.update({
      where: { id: mailboxId },
      data: {
        lastError: safeErrorMessage(error),
        metadata: jsonValue(gmailSyncFailureMetadata(mailbox.metadata, now)),
      },
    });
    revalidateHeaderNotifications();
  } catch (recordingError) {
    console.error("Gmail sync retry state could not be recorded.", recordingError);
  }
}
