"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { id30AuthBrokerRequest } from "@/lib/integrations/id30-auth-oauth";
import { refreshGmailIntegrationSummary } from "@/lib/integrations/gmail";
import { syncGmailMailbox } from "@/lib/integrations/gmail-sync";
import { prisma } from "@/lib/prisma";

type GmailMailboxActionState = {
  ok: boolean;
  message: string;
  savedAt: number | null;
};

const mailboxIdSchema = z.string().trim().min(1);
const mailboxSettingsSchema = z.object({
  mailboxId: mailboxIdSchema,
  ownerUserId: z.string().trim().optional(),
  purpose: z.enum(["PERSONAL", "SALES", "ACCOUNTS", "SHARED"]),
  sendUserIds: z.array(z.string().trim().min(1)).default([]),
  sendEnabled: z.boolean(),
  syncEnabled: z.boolean(),
});

function actionResult(ok: boolean, message: string): GmailMailboxActionState {
  return { ok, message, savedAt: Date.now() };
}

export async function updateGmailMailboxAction(
  _previous: GmailMailboxActionState,
  formData: FormData,
): Promise<GmailMailboxActionState> {
  await requireAdmin();
  const parsed = mailboxSettingsSchema.safeParse({
    mailboxId: formData.get("mailboxId"),
    ownerUserId: formData.get("ownerUserId") || undefined,
    purpose: formData.get("purpose"),
    sendUserIds: formData.getAll("sendUserIds"),
    sendEnabled: formData.get("sendEnabled") === "on",
    syncEnabled: formData.get("syncEnabled") === "on",
  });

  if (!parsed.success) {
    return actionResult(false, parsed.error.issues[0]?.message ?? "Mailbox settings are invalid.");
  }

  if (parsed.data.ownerUserId) {
    const user = await prisma.user.findUnique({
      where: { id: parsed.data.ownerUserId },
      select: { id: true },
    });
    if (!user) return actionResult(false, "Selected mailbox owner was not found.");
  }

  const permittedUserIds = [...new Set(parsed.data.sendUserIds)];
  if (permittedUserIds.length) {
    const permittedUserCount = await prisma.user.count({
      where: { id: { in: permittedUserIds }, status: "ACTIVE" },
    });
    if (permittedUserCount !== permittedUserIds.length) {
      return actionResult(false, "One or more mailbox users are invalid or inactive.");
    }
  }

  const mailbox = await prisma.emailMailbox.findUnique({
    where: { id: parsed.data.mailboxId },
    select: { id: true },
  });
  if (!mailbox) return actionResult(false, "Gmail mailbox was not found.");

  await prisma.$transaction(async (tx) => {
    await tx.emailMailbox.update({
      where: { id: mailbox.id },
      data: {
        ownerUserId: parsed.data.ownerUserId || null,
        purpose: parsed.data.purpose,
        sendEnabled: parsed.data.sendEnabled,
        syncEnabled: parsed.data.syncEnabled,
      },
    });

    await tx.emailMailboxAccess.deleteMany({
      where: {
        mailboxId: mailbox.id,
        ...(permittedUserIds.length
          ? { userId: { notIn: permittedUserIds } }
          : {}),
      },
    });
    for (const userId of permittedUserIds) {
      await tx.emailMailboxAccess.upsert({
        where: { mailboxId_userId: { mailboxId: mailbox.id, userId } },
        update: { canSend: parsed.data.sendEnabled },
        create: {
          mailboxId: mailbox.id,
          userId,
          canSend: parsed.data.sendEnabled,
        },
      });
    }

    if (parsed.data.ownerUserId) {
      await tx.emailMailboxAccess.upsert({
        where: {
          mailboxId_userId: {
            mailboxId: mailbox.id,
            userId: parsed.data.ownerUserId,
          },
        },
        update: { canManage: false, canSend: parsed.data.sendEnabled },
        create: {
          mailboxId: mailbox.id,
          userId: parsed.data.ownerUserId,
          canSend: parsed.data.sendEnabled,
        },
      });
    }
  });

  await refreshGmailIntegrationSummary();
  revalidatePath("/settings/integrations/gmail");
  return actionResult(true, "Gmail mailbox settings saved.");
}

export async function disconnectGmailMailboxAction(
  _previous: GmailMailboxActionState,
  formData: FormData,
): Promise<GmailMailboxActionState> {
  await requireAdmin();
  const parsed = mailboxIdSchema.safeParse(formData.get("mailboxId"));
  if (!parsed.success) return actionResult(false, "Gmail mailbox was not found.");

  const mailbox = await prisma.emailMailbox.findUnique({
    where: { id: parsed.data },
    select: { authConnectionId: true, emailAddress: true, id: true },
  });
  if (!mailbox) return actionResult(false, "Gmail mailbox was not found.");

  const pathname = `/api/crm/connections/${encodeURIComponent(mailbox.authConnectionId)}`;
  const result = await id30AuthBrokerRequest({
    connectionId: mailbox.authConnectionId,
    method: "DELETE",
    pathname,
  });

  if (!result.ok) {
    return actionResult(false, `Gmail could not be disconnected. ${result.message}`);
  }

  await prisma.emailMailbox.update({
    where: { id: mailbox.id },
    data: {
      sendEnabled: false,
      status: "DISCONNECTED",
      syncEnabled: false,
      lastError: null,
    },
  });

  await refreshGmailIntegrationSummary();
  revalidatePath("/settings/integrations");
  revalidatePath("/settings/integrations/gmail");
  return actionResult(true, `${mailbox.emailAddress} disconnected. Existing CRM email history was retained.`);
}

export async function syncGmailMailboxAction(
  _previous: GmailMailboxActionState,
  formData: FormData,
): Promise<GmailMailboxActionState> {
  await requireAdmin();
  const parsed = mailboxIdSchema.safeParse(formData.get("mailboxId"));
  if (!parsed.success) return actionResult(false, "Gmail mailbox was not found.");

  try {
    const result = await syncGmailMailbox(parsed.data);
    revalidatePath("/inbox");
    revalidatePath("/sales");
    revalidatePath("/settings/integrations/gmail");
    return actionResult(
      true,
      `Read ${result.read} message${result.read === 1 ? "" : "s"}; created ${result.created}, updated ${result.updated}, archived ${result.archivedAttachments} attachment${result.archivedAttachments === 1 ? "" : "s"}${result.hasMore ? ". More history remains for the next sync" : ""}.`,
    );
  } catch (error) {
    return actionResult(
      false,
      error instanceof Error ? error.message : "Gmail mailbox sync failed.",
    );
  }
}
