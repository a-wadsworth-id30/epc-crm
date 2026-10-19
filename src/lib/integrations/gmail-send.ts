import "server-only";

import crypto from "node:crypto";
import type { CurrentUser } from "@/lib/auth";
import { id30AuthBrokerRequest } from "@/lib/integrations/id30-auth-oauth";
import { prisma } from "@/lib/prisma";

type SendUser = Pick<CurrentUser, "id" | "role">;

function encodeHeader(value: string) {
  return /^[\x20-\x7E]*$/.test(value)
    ? value.replace(/[\r\n]+/g, " ")
    : `=?UTF-8?B?${Buffer.from(value.replace(/[\r\n]+/g, " ")).toString("base64")}?=`;
}

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function domainForAddress(email: string) {
  return email.split("@")[1]?.replace(/[^a-zA-Z0-9.-]/g, "") || "crm.local";
}

export async function findGmailMailboxForSend({
  mailboxId,
  user,
}: {
  mailboxId?: string | null;
  user: SendUser;
}) {
  const accessWhere =
    user.role === "ADMIN"
      ? {}
      : {
          OR: [
            { ownerUserId: user.id },
            { userAccess: { some: { userId: user.id, canSend: true } } },
          ],
        };
  const mailboxes = await prisma.emailMailbox.findMany({
    where: {
      ...accessWhere,
      ...(mailboxId ? { id: mailboxId } : {}),
      sendEnabled: true,
      status: "CONNECTED",
    },
    select: {
      authConnectionId: true,
      displayName: true,
      emailAddress: true,
      id: true,
      ownerUserId: true,
      purpose: true,
    },
  });

  if (mailboxId && !mailboxes.length) {
    throw new Error("The selected Gmail mailbox is unavailable or you cannot send from it.");
  }

  return (
    mailboxes.sort((left, right) => {
      const score = (mailbox: (typeof mailboxes)[number]) =>
        (mailbox.ownerUserId === user.id ? 0 : 10) +
        (mailbox.purpose === "PERSONAL"
          ? 0
          : mailbox.purpose === "SALES"
            ? 1
            : mailbox.purpose === "SHARED"
              ? 2
              : 3);
      return score(left) - score(right);
    })[0] ?? null
  );
}

export async function sendGmailEmail({
  body,
  mailbox,
  opportunityId,
  subject,
  to,
  toName,
}: {
  body: string;
  mailbox: NonNullable<Awaited<ReturnType<typeof findGmailMailboxForSend>>>;
  opportunityId: string;
  subject: string;
  to: string;
  toName?: string | null;
}) {
  const threadLink = await prisma.emailThreadLink.findFirst({
    where: { mailboxId: mailbox.id, opportunityId },
    orderBy: { updatedAt: "desc" },
    select: { providerThreadId: true },
  });
  const messageId = `<${crypto.randomUUID()}@${domainForAddress(mailbox.emailAddress)}>`;
  const from = mailbox.displayName
    ? `${encodeHeader(mailbox.displayName)} <${mailbox.emailAddress}>`
    : mailbox.emailAddress;
  const recipient = toName
    ? `${encodeHeader(toName)} <${to}>`
    : to;
  const raw = [
    `From: ${from}`,
    `To: ${recipient}`,
    `Subject: ${encodeHeader(subject)}`,
    `Message-ID: ${messageId}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
  ].join("\r\n");
  const pathname = `/api/crm/connections/${encodeURIComponent(mailbox.authConnectionId)}/gmail/send`;
  const response = await id30AuthBrokerRequest({
    body: {
      raw: base64Url(raw),
      threadId: threadLink?.providerThreadId ?? null,
    },
    connectionId: mailbox.authConnectionId,
    method: "POST",
    pathname,
  });
  if (!response.ok) throw new Error(response.message);

  const result = response.body.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("iD30 Auth Gmail send response was incomplete.");
  }
  const resultRecord = result as Record<string, unknown>;
  const providerMessageId =
    typeof resultRecord.id === "string" && resultRecord.id.trim()
      ? resultRecord.id.trim()
      : null;
  const providerThreadId =
    typeof resultRecord.threadId === "string" && resultRecord.threadId.trim()
      ? resultRecord.threadId.trim()
      : null;
  if (!providerMessageId || !providerThreadId) {
    throw new Error("Gmail did not return a message and thread ID.");
  }

  return {
    fromEmail: mailbox.emailAddress,
    internetMessageId: messageId,
    mailboxId: mailbox.id,
    messageId: `gmail:${mailbox.id}:${providerMessageId}`,
    providerMessageId,
    providerThreadId,
  };
}
