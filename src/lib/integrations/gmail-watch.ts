import "server-only";

import { z } from "zod";
import { id30AuthBrokerRequest } from "@/lib/integrations/id30-auth-oauth";
import { gmailWatchRetryDelayMs } from "@/lib/integrations/gmail-watch-policy";
import { prisma } from "@/lib/prisma";

const watchResponseSchema = z.object({
  ok: z.literal(true),
  provider: z.literal("gmail"),
  result: z.object({
    expiresAt: z.string().datetime(),
    historyId: z.string().regex(/^\d+$/).max(40),
  }),
});

export type GmailWatchMailbox = {
  authConnectionId: string;
  gmailWatchFailureCount: number;
  id: string;
};

function safeWatchError(value: string) {
  return value.trim().slice(0, 500) || "Gmail push watch renewal failed.";
}

async function recordWatchFailure(
  mailbox: GmailWatchMailbox,
  message: string,
  now: Date,
) {
  const failureCount = mailbox.gmailWatchFailureCount + 1;
  const retryAt = new Date(now.getTime() + gmailWatchRetryDelayMs(failureCount));
  const safeMessage = safeWatchError(message);

  await prisma.$transaction([
    prisma.emailMailbox.update({
      where: { id: mailbox.id },
      data: {
        gmailWatchFailureCount: failureCount,
        gmailWatchLastError: safeMessage,
        gmailWatchRetryAt: retryAt,
      },
    }),
    prisma.auditLog.create({
      data: {
        action: "gmail.watch.renewal_failed",
        entity: "EmailMailbox",
        entityId: mailbox.id,
        metadata: { failureCount, retryAt },
      },
    }),
  ]);

  return { failureCount, message: safeMessage, retryAt };
}

export async function renewGmailMailboxWatch(
  mailbox: GmailWatchMailbox,
  now = new Date(),
) {
  const pathname = `/api/crm/connections/${encodeURIComponent(mailbox.authConnectionId)}/gmail/watch`;
  let response: Awaited<ReturnType<typeof id30AuthBrokerRequest>>;

  try {
    response = await id30AuthBrokerRequest({
      body: {},
      connectionId: mailbox.authConnectionId,
      method: "POST",
      pathname,
    });
  } catch {
    const failure = await recordWatchFailure(
      mailbox,
      "Gmail push watch renewal could not reach iD30 Auth.",
      now,
    );
    return { ok: false as const, ...failure };
  }

  if (!response.ok) {
    const failure = await recordWatchFailure(mailbox, response.message, now);
    return { ok: false as const, ...failure };
  }

  const parsed = watchResponseSchema.safeParse(response.body);
  const expiresAt = parsed.success
    ? new Date(parsed.data.result.expiresAt)
    : null;
  if (!parsed.success || !expiresAt || expiresAt.getTime() <= now.getTime()) {
    const failure = await recordWatchFailure(
      mailbox,
      "iD30 Auth returned an incomplete Gmail watch response.",
      now,
    );
    return { ok: false as const, ...failure };
  }

  await prisma.$transaction([
    prisma.emailMailbox.update({
      where: { id: mailbox.id },
      data: {
        gmailWatchExpiresAt: expiresAt,
        gmailWatchFailureCount: 0,
        gmailWatchLastError: null,
        gmailWatchRenewedAt: now,
        gmailWatchRetryAt: null,
      },
    }),
    prisma.auditLog.create({
      data: {
        action: "gmail.watch.renewed",
        entity: "EmailMailbox",
        entityId: mailbox.id,
        metadata: { expiresAt },
      },
    }),
  ]);

  return { expiresAt, ok: true as const };
}
