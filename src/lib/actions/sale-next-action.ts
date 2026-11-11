"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { salesOpportunityIdAccessWhere } from "@/lib/crm-resource-access";
import { prisma } from "@/lib/prisma";
import { saleNextActionSchema } from "@/lib/sales/next-action";

export type SaleNextActionState = {
  message: string;
  nextAction?: string | null;
  ok: boolean;
};

export async function updateSaleNextActionAction(
  _: SaleNextActionState,
  formData: FormData,
): Promise<SaleNextActionState> {
  const user = await requireUser();
  const parsed = saleNextActionSchema.safeParse({
    nextAction: formData.get("nextAction"),
    saleId: formData.get("saleId"),
  });

  if (!parsed.success) {
    return {
      message:
        parsed.error.issues[0]?.message ?? "Check the Sale's next action.",
      ok: false,
    };
  }

  const sale = await prisma.salesOpportunity.findFirst({
    where: salesOpportunityIdAccessWhere(parsed.data.saleId, user),
    select: {
      companyId: true,
      contactId: true,
      id: true,
      nextStep: true,
      participants: { select: { contactId: true } },
    },
  });

  if (!sale) {
    return { message: "Sale not found.", ok: false };
  }

  if (sale.nextStep === parsed.data.nextAction) {
    return {
      message: "Next action is already up to date.",
      nextAction: sale.nextStep,
      ok: true,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.salesOpportunity.update({
      where: { id: sale.id },
      data: {
        aiGuidanceFingerprint: null,
        nextStep: parsed.data.nextAction,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "sale.next_action_updated",
        actorId: user.id,
        entity: "SalesOpportunity",
        entityId: sale.id,
        metadata: {
          cleared: parsed.data.nextAction === null,
          previousValuePresent: Boolean(sale.nextStep),
        },
      },
    });
  });

  revalidatePath("/sales");
  revalidatePath(`/sales/${sale.id}`);
  const connectedContactIds = new Set([
    sale.contactId,
    ...sale.participants.map((participant) => participant.contactId),
  ]);
  for (const contactId of connectedContactIds) {
    if (contactId) revalidatePath(`/contacts/${contactId}`);
  }
  if (sale.companyId) revalidatePath(`/clients/${sale.companyId}`);

  return {
    message: parsed.data.nextAction
      ? "Next action updated across the connected records."
      : "Next action cleared.",
    nextAction: parsed.data.nextAction,
    ok: true,
  };
}
