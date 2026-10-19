import "server-only";

import type { EmailMailboxStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import type { Id30AuthBrokerCompletionPayload } from "@/lib/integrations/id30-auth-oauth";
import { prisma } from "@/lib/prisma";

export const gmailProvider = "gmail";

export function hasConnectedGmailMailboxConfig(config: unknown) {
  return Boolean(
    config &&
      typeof config === "object" &&
      "mailboxCount" in config &&
      Number((config as { mailboxCount?: unknown }).mailboxCount) > 0,
  );
}

export async function refreshGmailIntegrationSummary() {
  const [mailboxCount, sendingMailboxCount, syncingMailboxCount] =
    await Promise.all([
      prisma.emailMailbox.count({ where: { status: "CONNECTED" } }),
      prisma.emailMailbox.count({
        where: { status: "CONNECTED", sendEnabled: true },
      }),
      prisma.emailMailbox.count({
        where: { status: "CONNECTED", syncEnabled: true },
      }),
    ]);

  return prisma.integrationConnection.upsert({
    where: { provider: gmailProvider },
    update: {
      config: { mailboxCount, sendingMailboxCount, syncingMailboxCount },
      status: mailboxCount > 0 ? "CONNECTED" : "NOT_CONNECTED",
    },
    create: {
      provider: gmailProvider,
      name: "Gmail",
      description: "Multi-mailbox Gmail sending and conversation synchronisation.",
      config: { mailboxCount, sendingMailboxCount, syncingMailboxCount },
      status: mailboxCount > 0 ? "CONNECTED" : "NOT_CONNECTED",
    },
  });
}

function normalizedEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

function mailboxStatus(
  status: Id30AuthBrokerCompletionPayload["status"],
): EmailMailboxStatus {
  if (status === "connected") return "CONNECTED";
  if (status === "reconnect_required") return "NEEDS_REAUTH";
  return "ERROR";
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function saveGmailAuthBrokerCompletion(
  payload: Id30AuthBrokerCompletionPayload,
) {
  if (payload.provider !== gmailProvider) {
    throw new Error("Gmail callback provider does not match.");
  }

  const connectionId = payload.connectionId;
  const emailAddress = normalizedEmail(payload.providerAccountId);

  if (payload.status === "connected" && (!connectionId || !emailAddress)) {
    throw new Error("Connected Gmail callbacks require a mailbox and connection ID.");
  }

  if (!connectionId || !emailAddress) {
    if (connectionId) {
      await prisma.emailMailbox.updateMany({
        where: { authConnectionId: connectionId },
        data: {
          status: mailboxStatus(payload.status),
          lastError: payload.errorRef ?? "Gmail reconnect is required.",
        },
      });
    }
    return null;
  }

  const matchingUser = await prisma.user.findFirst({
    where: { email: { equals: emailAddress, mode: "insensitive" } },
    select: { id: true },
  });
  const metadata = jsonValue({
    authConnectedAt: payload.connectedAt ?? new Date().toISOString(),
    crmClientId: payload.crmClientId,
    selectorOptions: payload.selectorOptions ?? {},
    workspaceId: payload.workspaceId,
  });

  const existing = await prisma.emailMailbox.findUnique({
    where: {
      provider_emailAddress: {
        provider: gmailProvider,
        emailAddress,
      },
    },
    select: { ownerUserId: true, purpose: true },
  });

  const mailbox = await prisma.emailMailbox.upsert({
    where: {
      provider_emailAddress: {
        provider: gmailProvider,
        emailAddress,
      },
    },
    update: {
      authConnectionId: connectionId,
      displayName: payload.providerAccountName ?? emailAddress,
      lastError: null,
      metadata,
      ownerUserId: existing?.ownerUserId ?? matchingUser?.id ?? null,
      purpose:
        existing?.purpose ?? (matchingUser ? "PERSONAL" : "SHARED"),
      status: mailboxStatus(payload.status),
    },
    create: {
      authConnectionId: connectionId,
      displayName: payload.providerAccountName ?? emailAddress,
      emailAddress,
      metadata,
      ownerUserId: matchingUser?.id ?? null,
      provider: gmailProvider,
      purpose: matchingUser ? "PERSONAL" : "SHARED",
      status: mailboxStatus(payload.status),
    },
  });

  if (matchingUser) {
    await prisma.emailMailboxAccess.upsert({
      where: {
        mailboxId_userId: {
          mailboxId: mailbox.id,
          userId: matchingUser.id,
        },
      },
      update: { canSend: true },
      create: {
        mailboxId: mailbox.id,
        userId: matchingUser.id,
        canSend: true,
      },
    });
  }

  await refreshGmailIntegrationSummary();

  revalidatePath("/settings/integrations");
  revalidatePath("/settings/integrations/gmail");
  return mailbox;
}

export function gmailMailboxStatusLabel(status: EmailMailboxStatus) {
  if (status === "CONNECTED") return "Connected";
  if (status === "NEEDS_REAUTH") return "Reconnect required";
  if (status === "DISCONNECTED") return "Disconnected";
  return "Error";
}
