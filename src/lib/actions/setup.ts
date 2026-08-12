"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  dashboardSetupPromptNotificationId,
  loadSetupReadiness,
} from "@/lib/setup/readiness";

export async function dismissDashboardSetupPromptAction() {
  const user = await requireAdmin();
  const readiness = await loadSetupReadiness();

  if (!readiness.isComplete) {
    const now = new Date();

    await prisma.notificationState.upsert({
      where: {
        userId_notificationId: {
          notificationId: dashboardSetupPromptNotificationId,
          userId: user.id,
        },
      },
      update: {
        dismissedAt: now,
        fingerprint: readiness.fingerprint,
        seenAt: now,
      },
      create: {
        dismissedAt: now,
        fingerprint: readiness.fingerprint,
        notificationId: dashboardSetupPromptNotificationId,
        seenAt: now,
        userId: user.id,
      },
    });
  }

  revalidatePath("/");
}
