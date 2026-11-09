import "server-only";

import { Prisma } from "@prisma/client";
import type { GmailPushPayload } from "@/lib/integrations/gmail-push-contract";
import { prisma } from "@/lib/prisma";

export type GmailPushReceiptResult =
  | { status: "accepted"; mailboxId: string }
  | { status: "duplicate"; mailboxId: string }
  | { status: "ignored"; mailboxId: string };

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function recordGmailPushReceipt(
  payload: GmailPushPayload,
): Promise<GmailPushReceiptResult> {
  const mailbox = await prisma.emailMailbox.findUnique({
    where: { authConnectionId: payload.connectionId },
    select: {
      id: true,
      status: true,
      syncEnabled: true,
    },
  });

  if (!mailbox) {
    throw new Error("Gmail push event does not match a CRM mailbox.");
  }

  const ignored = mailbox.status !== "CONNECTED" || !mailbox.syncEnabled;
  const receivedAt = new Date();

  try {
    await prisma.$transaction([
      prisma.gmailPushReceipt.create({
        data: {
          historyId: payload.historyId,
          mailboxId: mailbox.id,
          messageId: payload.messageId,
          processedAt: ignored ? receivedAt : null,
          publishedAt: payload.publishTime
            ? new Date(payload.publishTime)
            : null,
          status: ignored ? "IGNORED" : "PENDING",
        },
      }),
      prisma.auditLog.create({
        data: {
          action: ignored ? "gmail.push.ignored" : "gmail.push.received",
          entity: "EmailMailbox",
          entityId: mailbox.id,
          metadata: {
            historyId: payload.historyId,
            messageId: payload.messageId,
          },
        },
      }),
    ]);
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;

    const existing = await prisma.gmailPushReceipt.findUnique({
      where: { messageId: payload.messageId },
      select: { mailboxId: true },
    });
    if (!existing) throw error;

    return { status: "duplicate", mailboxId: existing.mailboxId };
  }

  return {
    status: ignored ? "ignored" : "accepted",
    mailboxId: mailbox.id,
  };
}
