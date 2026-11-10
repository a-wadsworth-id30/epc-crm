"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import {
  contactDocumentRequirementDefaultLabel,
  parseContactDocumentUploadType,
} from "@/lib/contacts/document-requirements";
import { prisma } from "@/lib/prisma";
import { optionalFormIdSchema } from "@/lib/forms/optional-id";

export type ContactDocumentRequirementActionState = {
  message: string;
  ok: boolean;
  savedAt: number | null;
};

const requirementSchema = z.object({
  contactTypeId: z.string().trim().min(1, "Choose a person type."),
  description: z.string().trim().max(500).optional().transform((value) => value || null),
  displayOrder: z.coerce.number().int().min(0).max(9999),
  id: optionalFormIdSchema,
  isRequired: z.boolean(),
  label: z.string().trim().max(120).optional(),
  uploadType: z.string().trim().min(1, "Choose a document type."),
});

const toggleSchema = z.object({
  id: z.string().trim().min(1),
  nextActive: z.enum(["true", "false"]).transform((value) => value === "true"),
});

function state(
  message: string,
  ok = false,
): ContactDocumentRequirementActionState {
  return { message, ok, savedAt: ok ? Date.now() : null };
}

function parseRequirement(formData: FormData) {
  return requirementSchema.safeParse({
    contactTypeId: formData.get("contactTypeId"),
    description: formData.get("description"),
    displayOrder: formData.get("displayOrder"),
    id: formData.get("requirementId"),
    isRequired: formData.get("isRequired") === "on",
    label: formData.get("label"),
    uploadType: formData.get("uploadType"),
  });
}

function revalidateRequirements() {
  revalidatePath("/contacts");
  revalidatePath("/settings/contact-types");
}

export async function createContactDocumentRequirementAction(
  _: ContactDocumentRequirementActionState,
  formData: FormData,
): Promise<ContactDocumentRequirementActionState> {
  const admin = await requireAdmin();
  const parsed = parseRequirement(formData);
  if (!parsed.success) {
    return state(parsed.error.issues[0]?.message ?? "Check the requirement details.");
  }
  const uploadType = parseContactDocumentUploadType(parsed.data.uploadType);
  if (!uploadType) return state("Choose a supported document type.");
  const contactType = await prisma.contactType.findUnique({
    where: { id: parsed.data.contactTypeId },
    select: { id: true, name: true },
  });
  if (!contactType) return state("That person type no longer exists.");
  const label = parsed.data.label || contactDocumentRequirementDefaultLabel(uploadType);

  try {
    await prisma.$transaction(async (tx) => {
      const requirement = await tx.contactTypeDocumentRequirement.create({
        data: {
          contactTypeId: contactType.id,
          description: parsed.data.description,
          displayOrder: parsed.data.displayOrder,
          isRequired: parsed.data.isRequired,
          label,
          uploadType,
        },
      });
      await tx.auditLog.create({
        data: {
          action: "contact_document_requirement.created",
          actorId: admin.id,
          entity: "ContactTypeDocumentRequirement",
          entityId: requirement.id,
          metadata: { contactTypeId: contactType.id, isRequired: requirement.isRequired, uploadType },
        },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return state(`${contactType.name} already has that document requirement.`);
    }
    throw error;
  }

  revalidateRequirements();
  return state(`${label} was added to ${contactType.name}.`, true);
}

export async function updateContactDocumentRequirementAction(
  _: ContactDocumentRequirementActionState,
  formData: FormData,
): Promise<ContactDocumentRequirementActionState> {
  const admin = await requireAdmin();
  const parsed = parseRequirement(formData);
  if (!parsed.success || !parsed.data.id) {
    return state(parsed.success ? "Choose a requirement to update." : parsed.error.issues[0]?.message ?? "Check the requirement details.");
  }
  const existing = await prisma.contactTypeDocumentRequirement.findUnique({
    where: { id: parsed.data.id },
    select: { contactTypeId: true, id: true, uploadType: true },
  });
  if (!existing) return state("That document requirement no longer exists.");
  const uploadType = parseContactDocumentUploadType(existing.uploadType);
  if (!uploadType) return state("This requirement uses an unsupported document type.");
  const label = parsed.data.label || contactDocumentRequirementDefaultLabel(uploadType);

  await prisma.$transaction([
    prisma.contactTypeDocumentRequirement.update({
      where: { id: existing.id },
      data: {
        description: parsed.data.description,
        displayOrder: parsed.data.displayOrder,
        isRequired: parsed.data.isRequired,
        label,
      },
    }),
    prisma.auditLog.create({
      data: {
        action: "contact_document_requirement.updated",
        actorId: admin.id,
        entity: "ContactTypeDocumentRequirement",
        entityId: existing.id,
        metadata: { contactTypeId: existing.contactTypeId, isRequired: parsed.data.isRequired, uploadType },
      },
    }),
  ]);
  revalidateRequirements();
  return state(`${label} was updated.`, true);
}

export async function toggleContactDocumentRequirementAction(
  _: ContactDocumentRequirementActionState,
  formData: FormData,
): Promise<ContactDocumentRequirementActionState> {
  const admin = await requireAdmin();
  const parsed = toggleSchema.safeParse({
    id: formData.get("requirementId"),
    nextActive: formData.get("nextActive"),
  });
  if (!parsed.success) return state("Choose a document requirement to update.");
  const existing = await prisma.contactTypeDocumentRequirement.findUnique({
    where: { id: parsed.data.id },
    select: { contactTypeId: true, label: true, uploadType: true },
  });
  if (!existing) return state("That document requirement no longer exists.");

  await prisma.$transaction([
    prisma.contactTypeDocumentRequirement.update({
      where: { id: parsed.data.id },
      data: { isActive: parsed.data.nextActive },
    }),
    prisma.auditLog.create({
      data: {
        action: parsed.data.nextActive
          ? "contact_document_requirement.reactivated"
          : "contact_document_requirement.archived",
        actorId: admin.id,
        entity: "ContactTypeDocumentRequirement",
        entityId: parsed.data.id,
        metadata: { contactTypeId: existing.contactTypeId, uploadType: existing.uploadType },
      },
    }),
  ]);
  revalidateRequirements();
  return state(
    `${existing.label} was ${parsed.data.nextActive ? "reactivated" : "archived"}.`,
    true,
  );
}
