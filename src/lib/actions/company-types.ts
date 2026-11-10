"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import {
  companyTypeArchiveBlockReason,
  companyTypeSlugBase,
} from "@/lib/companies/company-types";
import { optionalFormIdSchema } from "@/lib/forms/optional-id";
import { prisma } from "@/lib/prisma";

export type CompanyTypeActionState = {
  ok: boolean;
  message: string;
  savedAt: number | null;
};

const colourKeys = ["gray", "success", "blue", "purple", "orange"] as const;
const iconKeys = ["building", "briefcase", "wrench", "package", "hard-hat"] as const;

const companyTypeSchema = z.object({
  id: optionalFormIdSchema,
  name: z.string().trim().min(2, "Enter a company type name.").max(80),
  pluralName: z.string().trim().min(2, "Enter the plural label.").max(80),
  description: z.string().trim().max(240).optional().transform((value) => value || null),
  colourKey: z.enum(colourKeys).catch("gray"),
  iconKey: z.enum(iconKeys).catch("building"),
  displayOrder: z.coerce.number().int().min(0).max(9999),
  isDefault: z.boolean(),
});

const toggleSchema = z.object({
  id: z.string().trim().min(1),
  nextActive: z.enum(["true", "false"]).transform((value) => value === "true"),
});

function state(message: string, ok = false): CompanyTypeActionState {
  return { ok, message, savedAt: ok ? Date.now() : null };
}

function revalidateCompanyTypes() {
  revalidatePath("/clients");
  revalidatePath("/settings/company-types");
}

function parseCompanyType(formData: FormData) {
  return companyTypeSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    pluralName: formData.get("pluralName"),
    description: formData.get("description"),
    colourKey: formData.get("colourKey"),
    iconKey: formData.get("iconKey"),
    displayOrder: formData.get("displayOrder"),
    isDefault: formData.get("isDefault") === "on",
  });
}

async function availableSlug(name: string) {
  const base = companyTypeSlugBase(name);
  const matches = await prisma.companyType.findMany({
    where: { OR: [{ slug: base }, { slug: { startsWith: `${base}-` } }] },
    select: { slug: true },
  });
  const used = new Set(matches.map((match) => match.slug));
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function metadata(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export async function createCompanyTypeAction(
  _: CompanyTypeActionState,
  formData: FormData,
): Promise<CompanyTypeActionState> {
  const admin = await requireAdmin();
  const parsed = parseCompanyType(formData);
  if (!parsed.success) return state(parsed.error.issues[0]?.message ?? "Check the company type details.");
  const parsedData = { ...parsed.data };
  delete parsedData.id;
  const { isDefault, ...data } = parsedData;
  const slug = await availableSlug(data.name);
  try {
    const created = await prisma.$transaction(async (tx) => {
      if (isDefault) await tx.companyType.updateMany({ data: { isDefault: false } });
      const companyType = await tx.companyType.create({ data: { ...data, isDefault, slug } });
      await tx.auditLog.create({
        data: {
          action: "company_type.created",
          actorId: admin.id,
          entity: "CompanyType",
          entityId: companyType.id,
          metadata: metadata({ name: companyType.name, slug }),
        },
      });
      return companyType;
    });
    revalidateCompanyTypes();
    return state(`${created.name} was added.`, true);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return state("A company type with that name or identifier already exists.");
    }
    throw error;
  }
}

export async function updateCompanyTypeAction(
  _: CompanyTypeActionState,
  formData: FormData,
): Promise<CompanyTypeActionState> {
  const admin = await requireAdmin();
  const parsed = parseCompanyType(formData);
  if (!parsed.success || !parsed.data.id) {
    return state(parsed.success ? "Choose a company type to update." : parsed.error.issues[0]?.message ?? "Check the company type details.");
  }
  const { id, isDefault, ...data } = parsed.data;
  const existing = await prisma.companyType.findUnique({
    where: { id },
    select: { isActive: true, isDefault: true },
  });
  if (!existing) return state("That company type no longer exists.");
  if (!isDefault && existing.isDefault) return state("Choose another default type before removing this default.");

  await prisma.$transaction(async (tx) => {
    if (isDefault) {
      await tx.companyType.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
    }
    await tx.companyType.update({
      where: { id },
      data: { ...data, isDefault, isActive: isDefault ? true : existing.isActive },
    });
    await tx.auditLog.create({
      data: {
        action: "company_type.updated",
        actorId: admin.id,
        entity: "CompanyType",
        entityId: id,
        metadata: metadata({ isDefault, name: data.name }),
      },
    });
  });
  revalidateCompanyTypes();
  return state(`${data.name} was updated.`, true);
}

export async function toggleCompanyTypeActiveAction(
  _: CompanyTypeActionState,
  formData: FormData,
): Promise<CompanyTypeActionState> {
  const admin = await requireAdmin();
  const parsed = toggleSchema.safeParse({ id: formData.get("id"), nextActive: formData.get("nextActive") });
  if (!parsed.success) return state("Choose a company type to update.");
  const companyType = await prisma.companyType.findUnique({
    where: { id: parsed.data.id },
    select: { _count: { select: { companies: true } }, isDefault: true, name: true },
  });
  if (!companyType) return state("That company type no longer exists.");
  const archiveBlockReason = parsed.data.nextActive
    ? null
    : companyTypeArchiveBlockReason({ companyCount: companyType._count.companies, isDefault: companyType.isDefault, name: companyType.name });
  if (archiveBlockReason) return state(archiveBlockReason);

  await prisma.$transaction([
    prisma.companyType.update({ where: { id: parsed.data.id }, data: { isActive: parsed.data.nextActive } }),
    prisma.auditLog.create({
      data: {
        action: parsed.data.nextActive ? "company_type.reactivated" : "company_type.archived",
        actorId: admin.id,
        entity: "CompanyType",
        entityId: parsed.data.id,
        metadata: metadata({ name: companyType.name }),
      },
    }),
  ]);
  revalidateCompanyTypes();
  return state(`${companyType.name} was ${parsed.data.nextActive ? "reactivated" : "archived"}.`, true);
}
