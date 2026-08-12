"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { applySidekickDiscoveryPackPlan } from "@/lib/ai/sidekick-discovery-plans";
import { prisma } from "@/lib/prisma";

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function applySidekickWritePlanAction(formData: FormData) {
  const user = await requireAdmin();
  const planId = formString(formData, "planId");

  if (!planId) return;

  await applySidekickDiscoveryPackPlan({ planId, user });
  revalidatePath("/settings/sidekick");
  revalidatePath("/discovery");
}

export async function rejectSidekickWritePlanAction(formData: FormData) {
  const user = await requireAdmin();
  const planId = formString(formData, "planId");

  if (!planId) return;

  const writePlan = await prisma.sidekickWritePlan.findUnique({
    where: { id: planId },
    select: { id: true, status: true, type: true },
  });

  if (!writePlan) {
    throw new Error("Sidekick write plan not found.");
  }

  if (writePlan.status !== "DRAFT" && writePlan.status !== "APPROVED") {
    throw new Error("This write plan has already been handled.");
  }

  await prisma.sidekickWritePlan.update({
    where: { id: planId },
    data: {
      approvedByUserId: user.id,
      rejectedAt: new Date(),
      status: "REJECTED",
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "sidekick.discovery_plan.rejected",
      actorId: user.id,
      entity: "SidekickWritePlan",
      entityId: writePlan.id,
      metadata: {
        status: "REJECTED",
        type: writePlan.type,
      },
    },
  });

  revalidatePath("/settings/sidekick");
}
