"use server";

import { Prisma, type SalesParticipantRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, type CurrentUser } from "@/lib/auth";
import {
  contactIdAccessWhere,
  salesOpportunityIdAccessWhere,
} from "@/lib/crm-resource-access";
import { prisma } from "@/lib/prisma";
import {
  saleParticipantRoleChangeDecision,
  salesParticipantRoles,
} from "@/lib/sales/participants";

export type SaleParticipantActionState = {
  message: string;
  ok: boolean;
};

const participantSchema = z.object({
  contactId: z.string().trim().min(1, "Choose a person."),
  role: z.enum(salesParticipantRoles),
  saleId: z.string().trim().min(1, "Sale is required."),
});

const participantUpdateSchema = z.object({
  participantId: z.string().trim().min(1, "Participant is required."),
  role: z.enum(salesParticipantRoles),
  saleId: z.string().trim().min(1, "Sale is required."),
});

const participantRemoveSchema = z.object({
  participantId: z.string().trim().min(1, "Participant is required."),
  saleId: z.string().trim().min(1, "Sale is required."),
});

function revalidateParticipantPaths(saleId: string, contactIds: string[]) {
  revalidatePath(`/sales/${saleId}`);
  for (const contactId of new Set(contactIds.filter(Boolean))) {
    revalidatePath(`/contacts/${contactId}`);
  }
}

async function accessibleSale(saleId: string, user: CurrentUser) {
  return prisma.salesOpportunity.findFirst({
    where: salesOpportunityIdAccessWhere(saleId, user),
    select: { contactId: true, id: true },
  });
}

async function assignParticipantRole({
  contactId,
  role,
  saleId,
  user,
}: {
  contactId: string;
  role: SalesParticipantRole;
  saleId: string;
  user: CurrentUser;
}) {
  const [sale, contact] = await Promise.all([
    accessibleSale(saleId, user),
    prisma.contact.findFirst({
      where: contactIdAccessWhere(contactId, user),
      select: { id: true },
    }),
  ]);

  if (!sale || !contact) {
    return {
      contactIds: [] as string[],
      state: {
        message: "The sale or person is no longer available.",
        ok: false,
      },
    };
  }

  const roleDecision = saleParticipantRoleChangeDecision({
    isCurrentPrimary: sale.contactId === contactId,
    nextRole: role,
  });
  if (!roleDecision.ok) {
    return {
      contactIds: [contactId],
      state: {
        message: roleDecision.message,
        ok: false,
      },
    };
  }

  const affectedContactIds = await prisma.$transaction(async (tx) => {
    const previousPrimary =
      role === "PRIMARY_CUSTOMER"
        ? await tx.salesOpportunityParticipant.findFirst({
            where: { opportunityId: saleId, role: "PRIMARY_CUSTOMER" },
            select: { contactId: true },
          })
        : null;

    if (role === "PRIMARY_CUSTOMER") {
      await tx.salesOpportunityParticipant.updateMany({
        where: {
          opportunityId: saleId,
          role: "PRIMARY_CUSTOMER",
          contactId: { not: contactId },
        },
        data: { role: "JOINT_APPLICANT" },
      });
    }

    await tx.salesOpportunityParticipant.upsert({
      where: {
        opportunityId_contactId: { opportunityId: saleId, contactId },
      },
      create: { contactId, opportunityId: saleId, role },
      update: { role },
    });

    if (role === "PRIMARY_CUSTOMER" && sale.contactId !== contactId) {
      await tx.salesOpportunity.update({
        where: { id: saleId },
        data: { contactId },
      });
    }

    await tx.auditLog.create({
      data: {
        action: "sale.participant_role_updated",
        actorId: user.id,
        entity: "SalesOpportunity",
        entityId: saleId,
        metadata: {
          contactId,
          previousPrimaryContactId: previousPrimary?.contactId ?? null,
          role,
        },
      },
    });

    return [contactId, sale.contactId, previousPrimary?.contactId].filter(
      (value): value is string => Boolean(value),
    );
  });

  return {
    contactIds: affectedContactIds,
    state: {
      message:
        role === "PRIMARY_CUSTOMER"
          ? "Primary customer updated."
          : "Sale participant saved.",
      ok: true,
    },
  };
}

export async function addSaleParticipantAction(
  _: SaleParticipantActionState,
  formData: FormData,
): Promise<SaleParticipantActionState> {
  const user = await requireUser();
  const parsed = participantSchema.safeParse({
    contactId: formData.get("contactId"),
    role: formData.get("role"),
    saleId: formData.get("saleId"),
  });
  if (!parsed.success) {
    return {
      message: parsed.error.issues[0]?.message ?? "Check the participant.",
      ok: false,
    };
  }

  try {
    const result = await assignParticipantRole({ ...parsed.data, user });
    if (result.state.ok) {
      revalidateParticipantPaths(parsed.data.saleId, result.contactIds);
    }
    return result.state;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        message: "Another primary customer was saved first. Refresh and try again.",
        ok: false,
      };
    }
    throw error;
  }
}

export async function updateSaleParticipantRoleAction(
  _: SaleParticipantActionState,
  formData: FormData,
): Promise<SaleParticipantActionState> {
  const user = await requireUser();
  const parsed = participantUpdateSchema.safeParse({
    participantId: formData.get("participantId"),
    role: formData.get("role"),
    saleId: formData.get("saleId"),
  });
  if (!parsed.success) {
    return {
      message: parsed.error.issues[0]?.message ?? "Check the participant role.",
      ok: false,
    };
  }

  const participant = await prisma.salesOpportunityParticipant.findFirst({
    where: {
      id: parsed.data.participantId,
      opportunity: salesOpportunityIdAccessWhere(parsed.data.saleId, user),
      opportunityId: parsed.data.saleId,
    },
    select: { contactId: true },
  });
  if (!participant) {
    return { message: "This Sale participant is no longer available.", ok: false };
  }

  try {
    const result = await assignParticipantRole({
      contactId: participant.contactId,
      role: parsed.data.role,
      saleId: parsed.data.saleId,
      user,
    });
    if (result.state.ok) {
      revalidateParticipantPaths(parsed.data.saleId, result.contactIds);
    }
    return result.state;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        message: "Another primary customer was saved first. Refresh and try again.",
        ok: false,
      };
    }
    throw error;
  }
}

export async function removeSaleParticipantAction(
  _: SaleParticipantActionState,
  formData: FormData,
): Promise<SaleParticipantActionState> {
  const user = await requireUser();
  const parsed = participantRemoveSchema.safeParse({
    participantId: formData.get("participantId"),
    saleId: formData.get("saleId"),
  });
  if (!parsed.success) {
    return {
      message: parsed.error.issues[0]?.message ?? "Check the participant.",
      ok: false,
    };
  }

  const participant = await prisma.salesOpportunityParticipant.findFirst({
    where: {
      id: parsed.data.participantId,
      opportunity: salesOpportunityIdAccessWhere(parsed.data.saleId, user),
      opportunityId: parsed.data.saleId,
    },
    select: { contactId: true, role: true },
  });
  if (!participant) {
    return { message: "This Sale participant is no longer available.", ok: false };
  }
  if (participant.role === "PRIMARY_CUSTOMER") {
    return {
      message: "Choose another primary customer before removing this person.",
      ok: false,
    };
  }

  await prisma.$transaction([
    prisma.salesOpportunityParticipant.delete({
      where: { id: parsed.data.participantId },
    }),
    prisma.auditLog.create({
      data: {
        action: "sale.participant_removed",
        actorId: user.id,
        entity: "SalesOpportunity",
        entityId: parsed.data.saleId,
        metadata: {
          contactId: participant.contactId,
          role: participant.role,
        },
      },
    }),
  ]);

  revalidateParticipantPaths(parsed.data.saleId, [participant.contactId]);
  return { message: "Person removed from this Sale.", ok: true };
}
