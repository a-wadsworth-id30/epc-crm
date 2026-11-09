import "server-only";

import type { EmailMailboxStatus } from "@prisma/client";
import { z } from "zod";
import {
  gmailMailboxErrorFromAuth,
  gmailMailboxStatusFromAuth,
} from "@/lib/integrations/gmail-connection-status";
import { id30AuthBrokerRequest } from "@/lib/integrations/id30-auth-oauth";
import { prisma } from "@/lib/prisma";

const authConnectionResponseSchema = z.object({
  connection: z.object({
    authStatus: z.enum([
      "CONNECTED",
      "NEEDS_REAUTH",
      "DISCONNECTED",
      "FAILED",
    ]),
    id: z.string().min(1),
    lastError: z.string().nullable(),
    provider: z.literal("gmail"),
    reconnectRequired: z.boolean(),
  }),
  ok: z.literal(true),
});

type ReconciliationMailbox = {
  authConnectionId: string;
  id: string;
  lastError: string | null;
  status: EmailMailboxStatus;
};

function safeCheckError(value: string) {
  return value.replace(/[\r\n\t]+/g, " ").trim().slice(0, 500);
}

async function recordCheckFailure(
  mailboxId: string,
  checkedAt: Date,
  message: string,
) {
  await prisma.emailMailbox.update({
    where: { id: mailboxId },
    data: {
      authStatusCheckedAt: checkedAt,
      authStatusLastError: safeCheckError(message),
    },
  });
}

export async function reconcileGmailMailboxConnection(
  mailbox: ReconciliationMailbox,
) {
  const checkedAt = new Date();
  const pathname = `/api/crm/connections/${encodeURIComponent(mailbox.authConnectionId)}`;
  const response = await id30AuthBrokerRequest({
    connectionId: mailbox.authConnectionId,
    method: "GET",
    pathname,
  });

  if (!response.ok && response.status !== 404) {
    await recordCheckFailure(mailbox.id, checkedAt, response.message);
    return { changed: false, ok: false, status: mailbox.status } as const;
  }

  const parsed = response.ok
    ? authConnectionResponseSchema.safeParse(response.body)
    : null;
  if (
    response.ok &&
    (!parsed ||
      !parsed.success ||
      parsed.data.connection.id !== mailbox.authConnectionId)
  ) {
    await recordCheckFailure(
      mailbox.id,
      checkedAt,
      "iD30 Auth returned an incomplete Gmail connection status.",
    );
    return { changed: false, ok: false, status: mailbox.status } as const;
  }

  const authConnection = parsed?.success ? parsed.data.connection : null;
  const nextStatus = authConnection
    ? gmailMailboxStatusFromAuth(
        authConnection.authStatus,
        authConnection.reconnectRequired,
      )
    : "DISCONNECTED";
  const authError = authConnection
    ? gmailMailboxErrorFromAuth(authConnection)
    : null;
  const nextError =
    nextStatus === "CONNECTED" && mailbox.status === "CONNECTED"
      ? mailbox.lastError
      : authError;
  const changed = mailbox.status !== nextStatus || mailbox.lastError !== nextError;

  await prisma.$transaction(async (tx) => {
    await tx.emailMailbox.update({
      where: { id: mailbox.id },
      data: {
        authStatusCheckedAt: checkedAt,
        authStatusLastError: null,
        lastError: nextError,
        status: nextStatus,
      },
    });
    if (mailbox.status !== nextStatus) {
      await tx.auditLog.create({
        data: {
          action: "gmail.mailbox.auth_status_reconciled",
          entity: "EmailMailbox",
          entityId: mailbox.id,
          metadata: {
            currentStatus: nextStatus,
            previousStatus: mailbox.status,
          },
        },
      });
    }
  });

  return { changed, ok: true, status: nextStatus } as const;
}
