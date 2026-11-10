"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import {
  companyDocumentRequirementDefaultLabel,
  parseCompanyDocumentUploadType,
} from "@/lib/companies/document-requirements";
import { optionalFormIdSchema } from "@/lib/forms/optional-id";
import { prisma } from "@/lib/prisma";

export type CompanyDocumentRequirementActionState = {
  message: string;
  ok: boolean;
  savedAt: number | null;
};

const requirementSchema = z.object({
  companyTypeId: z.string().trim().min(1, "Choose a company type."),
  description: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => value || null),
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
): CompanyDocumentRequirementActionState {
  return { message, ok, savedAt: ok ? Date.now() : null };
}

function parseRequirement(formData: FormData) {
  return requirementSchema.safeParse({
    companyTypeId: formData.get("companyTypeId"),
    description: formData.get("description"),
    displayOrder: formData.get("displayOrder"),
    id: formData.get("requirementId"),
    isRequired: formData.get("isRequired") === "on",
    label: formData.get("label"),
    uploadType: formData.get("uploadType"),
  });
}

function revalidateRequirements() {
  revalidatePath("/clients");
  revalidatePath("/settings/company-types");
}

export async function createCompanyDocumentRequirementAction(
  _: CompanyDocumentRequirementActionState,
  formData: FormData,
): Promise<CompanyDocumentRequirementActionState> {
  const admin = await requireAdmin();
  const parsed = parseRequirement(formData);
  if (!parsed.success) {
    return state(
      parsed.error.issues[0]?.message ?? "Check the requirement details.",
    );
  }
  const uploadType = parseCompanyDocumentUploadType(parsed.data.uploadType);
  if (!uploadType) return state("Choose a supported document type.");
  const companyType = await prisma.companyType.findUnique({
    where: { id: parsed.data.companyTypeId },
    select: { id: true, name: true },
  });
  if (!companyType) return state("That company type no longer exists.");
  const label =
    parsed.data.label || companyDocumentRequirementDefaultLabel(uploadType);

  try {
    await prisma.$transaction(async (tx) => {
      const requirement = await tx.companyTypeDocumentRequirement.create({
        data: {
          companyTypeId: companyType.id,
          description: parsed.data.description,
          displayOrder: parsed.data.displayOrder,
          isRequired: parsed.data.isRequired,
          label,
          uploadType,
        },
      });
      await tx.auditLog.create({
        data: {
          action: "company_document_requirement.created",
          actorId: admin.id,
          entity: "CompanyTypeDocumentRequirement",
          entityId: requirement.id,
          metadata: {
            companyTypeId: companyType.id,
            isRequired: requirement.isRequired,
            uploadType,
          },
        },
      });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return state(`${companyType.name} already has that document requirement.`);
    }
    throw error;
  }

  revalidateRequirements();
  return state(`${label} was added to ${companyType.name}.`, true);
}

export async function updateCompanyDocumentRequirementAction(
  _: CompanyDocumentRequirementActionState,
  formData: FormData,
): Promise<CompanyDocumentRequirementActionState> {
  const admin = await requireAdmin();
  const parsed = parseRequirement(formData);
  if (!parsed.success || !parsed.data.id) {
    return state(
      parsed.success
        ? "Choose a requirement to update."
        : parsed.error.issues[0]?.message ?? "Check the requirement details.",
    );
  }
  const existing = await prisma.companyTypeDocumentRequirement.findUnique({
    where: { id: parsed.data.id },
    select: { companyTypeId: true, id: true, uploadType: true },
  });
  if (!existing) return state("That document requirement no longer exists.");
  const uploadType = parseCompanyDocumentUploadType(existing.uploadType);
  if (!uploadType) {
    return state("This requirement uses an unsupported document type.");
  }
  const label =
    parsed.data.label || companyDocumentRequirementDefaultLabel(uploadType);

  await prisma.$transaction([
    prisma.companyTypeDocumentRequirement.update({
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
        action: "company_document_requirement.updated",
        actorId: admin.id,
        entity: "CompanyTypeDocumentRequirement",
        entityId: existing.id,
        metadata: {
          companyTypeId: existing.companyTypeId,
          isRequired: parsed.data.isRequired,
          uploadType,
        },
      },
    }),
  ]);
  revalidateRequirements();
  return state(`${label} was updated.`, true);
}

export async function toggleCompanyDocumentRequirementAction(
  _: CompanyDocumentRequirementActionState,
  formData: FormData,
): Promise<CompanyDocumentRequirementActionState> {
  const admin = await requireAdmin();
  const parsed = toggleSchema.safeParse({
    id: formData.get("requirementId"),
    nextActive: formData.get("nextActive"),
  });
  if (!parsed.success) return state("Choose a document requirement to update.");
  const existing = await prisma.companyTypeDocumentRequirement.findUnique({
    where: { id: parsed.data.id },
    select: { companyTypeId: true, label: true, uploadType: true },
  });
  if (!existing) return state("That document requirement no longer exists.");

  await prisma.$transaction([
    prisma.companyTypeDocumentRequirement.update({
      where: { id: parsed.data.id },
      data: { isActive: parsed.data.nextActive },
    }),
    prisma.auditLog.create({
      data: {
        action: parsed.data.nextActive
          ? "company_document_requirement.reactivated"
          : "company_document_requirement.archived",
        actorId: admin.id,
        entity: "CompanyTypeDocumentRequirement",
        entityId: parsed.data.id,
        metadata: {
          companyTypeId: existing.companyTypeId,
          uploadType: existing.uploadType,
        },
      },
    }),
  ]);
  revalidateRequirements();
  return state(
    `${existing.label} was ${parsed.data.nextActive ? "reactivated" : "archived"}.`,
    true,
  );
}
