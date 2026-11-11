"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { companyAffiliationLinkDecision } from "@/lib/companies/contact-relationships";
import {
  companyIdAccessWhere,
  contactIdAccessWhere,
  salesOpportunityIdAccessWhere,
} from "@/lib/crm-resource-access";
import { prisma } from "@/lib/prisma";
import { saleRelationshipRepairKinds } from "@/lib/sales/relationship-integrity";

export type SaleRelationshipRepairState = {
  message: string;
  ok: boolean;
};

const repairSchema = z.object({
  repair: z.enum(saleRelationshipRepairKinds),
  saleId: z.string().trim().min(1),
});

function revalidateRelationshipPaths({
  companyIds,
  contactId,
  saleId,
}: {
  companyIds: Array<string | null>;
  contactId: string | null;
  saleId: string;
}) {
  revalidatePath(`/sales/${saleId}`);
  if (contactId) revalidatePath(`/contacts/${contactId}`);
  for (const companyId of new Set(companyIds.filter(Boolean))) {
    revalidatePath(`/clients/${companyId}`);
  }
}

export async function repairSaleRelationshipAction(
  _: SaleRelationshipRepairState,
  formData: FormData,
): Promise<SaleRelationshipRepairState> {
  const user = await requireUser();
  const parsed = repairSchema.safeParse({
    repair: formData.get("repair"),
    saleId: formData.get("saleId"),
  });
  if (!parsed.success) {
    return { message: "Choose a valid relationship repair.", ok: false };
  }

  const sale = await prisma.salesOpportunity.findFirst({
    where: salesOpportunityIdAccessWhere(parsed.data.saleId, user),
    select: {
      companyId: true,
      contactId: true,
      contact: {
        select: {
          companyAffiliations: { select: { companyId: true } },
          companyId: true,
          id: true,
        },
      },
      id: true,
    },
  });
  if (!sale) {
    return { message: "This Sale is no longer available.", ok: false };
  }
  if (!sale.contactId || !sale.contact) {
    return {
      message: "Add a primary Person before repairing relationships.",
      ok: false,
    };
  }

  if (parsed.data.repair === "SYNC_PRIMARY_PARTICIPANT") {
    await prisma.$transaction(async (tx) => {
      await tx.salesOpportunityParticipant.updateMany({
        where: {
          contactId: { not: sale.contactId! },
          opportunityId: sale.id,
          role: "PRIMARY_CUSTOMER",
        },
        data: { role: "JOINT_APPLICANT" },
      });
      await tx.salesOpportunityParticipant.upsert({
        where: {
          opportunityId_contactId: {
            contactId: sale.contactId!,
            opportunityId: sale.id,
          },
        },
        create: {
          contactId: sale.contactId!,
          opportunityId: sale.id,
          role: "PRIMARY_CUSTOMER",
        },
        update: { role: "PRIMARY_CUSTOMER" },
      });
      await tx.auditLog.create({
        data: {
          action: "sale.relationship_repaired",
          actorId: user.id,
          entity: "SalesOpportunity",
          entityId: sale.id,
          metadata: {
            contactId: sale.contactId,
            repair: parsed.data.repair,
          },
        },
      });
    });
    revalidateRelationshipPaths({
      companyIds: [sale.companyId],
      contactId: sale.contactId,
      saleId: sale.id,
    });
    return { message: "Primary customer participant synchronised.", ok: true };
  }

  if (parsed.data.repair === "USE_PRIMARY_PERSON_COMPANY") {
    const targetCompanyId = sale.contact.companyId;
    if (!targetCompanyId) {
      return {
        message: "The primary Person no longer has a primary Company.",
        ok: false,
      };
    }
    const company = await prisma.company.findFirst({
      where: companyIdAccessWhere(targetCompanyId, user),
      select: { id: true },
    });
    if (!company) {
      return {
        message: "The target Company is not available to you.",
        ok: false,
      };
    }
    const updatedCount = await prisma.$transaction(async (tx) => {
      const updated = await tx.salesOpportunity.updateMany({
        where: { companyId: sale.companyId, id: sale.id },
        data: { companyId: company.id },
      });
      if (!updated.count) return 0;
      await tx.auditLog.create({
        data: {
          action: "sale.relationship_repaired",
          actorId: user.id,
          entity: "SalesOpportunity",
          entityId: sale.id,
          metadata: {
            companyId: company.id,
            previousCompanyId: sale.companyId,
            repair: parsed.data.repair,
          },
        },
      });
      return updated.count;
    });
    if (!updatedCount) {
      return {
        message: "The Sale relationship changed. Refresh and review it again.",
        ok: false,
      };
    }
    revalidateRelationshipPaths({
      companyIds: [sale.companyId, company.id],
      contactId: sale.contactId,
      saleId: sale.id,
    });
    return {
      message: "Sale linked to the Person's primary Company.",
      ok: true,
    };
  }

  if (!sale.companyId) {
    return { message: "The Sale no longer has a Company to link.", ok: false };
  }
  const [company, contact] = await Promise.all([
    prisma.company.findFirst({
      where: companyIdAccessWhere(sale.companyId, user),
      select: { id: true, name: true },
    }),
    prisma.contact.findFirst({
      where: contactIdAccessWhere(sale.contactId, user),
      select: {
        companyAffiliations: { select: { companyId: true } },
        companyId: true,
        id: true,
      },
    }),
  ]);
  if (!company || !contact) {
    return {
      message: "The Person or Company is no longer available to you.",
      ok: false,
    };
  }
  const decision = companyAffiliationLinkDecision({
    currentPrimaryCompanyId: contact.companyId,
    existingCompanyIds: contact.companyAffiliations.map(
      (affiliation) => affiliation.companyId,
    ),
    targetCompanyId: company.id,
  });
  if (!decision.ok) return { message: decision.message, ok: false };
  if (decision.action === "unchanged") {
    return {
      message: "The Person is already linked to this Company.",
      ok: true,
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (decision.action === "linked_primary") {
        const updated = await tx.contact.updateMany({
          where: { companyId: contact.companyId, id: contact.id },
          data: {
            companyContactResponsibilities: [],
            companyId: company.id,
            companyName: company.name,
          },
        });
        if (!updated.count) throw new Error("stale-contact-relationship");
      } else {
        await tx.companyContactAffiliation.upsert({
          where: {
            companyId_contactId: {
              companyId: company.id,
              contactId: contact.id,
            },
          },
          create: {
            companyId: company.id,
            contactId: contact.id,
            isPrimary: false,
          },
          update: {},
        });
      }
      await tx.auditLog.create({
        data: {
          action: "sale.relationship_repaired",
          actorId: user.id,
          entity: "SalesOpportunity",
          entityId: sale.id,
          metadata: {
            companyId: company.id,
            contactId: contact.id,
            relationship: decision.action,
            repair: parsed.data.repair,
          },
        },
      });
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "stale-contact-relationship"
    ) {
      return {
        message:
          "The Person relationship changed. Refresh and review it again.",
        ok: false,
      };
    }
    throw error;
  }
  revalidateRelationshipPaths({
    companyIds: [company.id, contact.companyId],
    contactId: contact.id,
    saleId: sale.id,
  });
  return {
    message:
      decision.action === "linked_primary"
        ? "Person linked to the Sale Company as their primary Company."
        : "Sale Company added to the Person's affiliations.",
    ok: true,
  };
}
