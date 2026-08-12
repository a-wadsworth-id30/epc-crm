"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { emailMessageWhereWithAccess } from "@/lib/crm-resource-access";
import { prisma } from "@/lib/prisma";

export async function markInboxMessageRead(messageId: string) {
  const user = await requireUser();

  await prisma.emailMessage.updateMany({
    where: emailMessageWhereWithAccess(user, { id: messageId }),
    data: { status: "READ" },
  });

  revalidatePath("/inbox");
}

export async function archiveInboxMessage(messageId: string) {
  const user = await requireUser();

  await prisma.emailMessage.updateMany({
    where: emailMessageWhereWithAccess(user, { id: messageId }),
    data: { status: "ARCHIVED" },
  });

  revalidatePath("/inbox");
}

export async function restoreInboxMessage(messageId: string) {
  const user = await requireUser();

  await prisma.emailMessage.updateMany({
    where: emailMessageWhereWithAccess(user, { id: messageId }),
    data: { status: "READ" },
  });

  revalidatePath("/inbox");
}
