import "server-only";

import { randomUUID } from "node:crypto";
import { gmailSyncLeaseExpiresAt } from "@/lib/integrations/gmail-sync-lease-policy";
import { prisma } from "@/lib/prisma";

export class GmailSyncAlreadyRunningError extends Error {
  readonly mailboxId: string;

  constructor(mailboxId: string) {
    super("This Gmail mailbox is already syncing. Try again shortly.");
    this.name = "GmailSyncAlreadyRunningError";
    this.mailboxId = mailboxId;
  }
}

export function isGmailSyncAlreadyRunningError(
  error: unknown,
): error is GmailSyncAlreadyRunningError {
  return error instanceof GmailSyncAlreadyRunningError;
}

export async function withGmailSyncLease<T>(
  mailboxId: string,
  run: () => Promise<T>,
) {
  const leaseId = randomUUID();
  const now = new Date();
  const acquired = await prisma.emailMailbox.updateMany({
    where: {
      id: mailboxId,
      OR: [{ syncLeaseUntil: null }, { syncLeaseUntil: { lte: now } }],
    },
    data: {
      syncLeaseId: leaseId,
      syncLeaseUntil: gmailSyncLeaseExpiresAt(now),
    },
  });

  if (acquired.count !== 1) {
    const mailbox = await prisma.emailMailbox.findUnique({
      where: { id: mailboxId },
      select: { id: true },
    });
    if (!mailbox) throw new Error("Gmail mailbox was not found.");
    throw new GmailSyncAlreadyRunningError(mailboxId);
  }

  try {
    return await run();
  } finally {
    try {
      await prisma.emailMailbox.updateMany({
        where: { id: mailboxId, syncLeaseId: leaseId },
        data: { syncLeaseId: null, syncLeaseUntil: null },
      });
    } catch (error) {
      console.error("Gmail sync lease could not be released.", {
        error: error instanceof Error ? error.message : "Unknown error",
        mailboxId,
      });
    }
  }
}
