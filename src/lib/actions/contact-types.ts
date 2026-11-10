"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import {
  contactTypeArchiveBlockReason,
  contactTypeSlugBase,
} from "@/lib/contacts/contact-types";
import { prisma } from "@/lib/prisma";
import { optionalFormIdSchema } from "@/lib/forms/optional-id";

export type ContactTypeActionState = {
  ok: boolean;
  message: string;
  savedAt: number | null;
};

const colourKeys = ["gray", "success", "blue", "purple", "orange"] as const;
const iconKeys = ["user", "briefcase", "wrench", "building"] as const;

const contactTypeSchema = z.object({
  id: optionalFormIdSchema,
  name: z.string().trim().min(2, "Enter a person type name.").max(80),
  pluralName: z.string().trim().min(2, "Enter the plural label.").max(80),
  description: z
    .string()
    .trim()
    .max(240, "Keep the description below 240 characters.")
    .optional()
    .transform((value) => value || null),
  colourKey: z.enum(colourKeys).catch("gray"),
  iconKey: z.enum(iconKeys).catch("user"),
  displayOrder: z.coerce.number().int().min(0).max(9999),
  isDefault: z.boolean(),
});

const toggleSchema = z.object({
  id: z.string().trim().min(1),
  nextActive: z.enum(["true", "false"]).transform((value) => value === "true"),
});

function state(message: string, ok = false): ContactTypeActionState {
  return { ok, message, savedAt: ok ? Date.now() : null };
}

function revalidateContactTypes() {
  revalidatePath("/contacts");
  revalidatePath("/settings/contact-types");
}

function parseContactType(formData: FormData) {
  return contactTypeSchema.safeParse({
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
  const base = contactTypeSlugBase(name);
  const matches = await prisma.contactType.findMany({
    where: { OR: [{ slug: base }, { slug: { startsWith: `${base}-` } }] },
    select: { slug: true },
  });
  const used = new Set(matches.map((match) => match.slug));
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function auditMetadata(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export async function createContactTypeAction(
  _: ContactTypeActionState,
  formData: FormData,
): Promise<ContactTypeActionState> {
  const admin = await requireAdmin();
  const parsed = parseContactType(formData);
  if (!parsed.success) {
    return state(parsed.error.issues[0]?.message ?? "Check the person type details.");
  }

  const dataWithoutId = { ...parsed.data };
  delete dataWithoutId.id;
  const { isDefault, ...data } = dataWithoutId;
  const slug = await availableSlug(data.name);

  try {
    const created = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.contactType.updateMany({ data: { isDefault: false } });
      }
      const contactType = await tx.contactType.create({
        data: { ...data, isDefault, slug },
      });
      await tx.auditLog.create({
        data: {
          action: "contact_type.created",
          actorId: admin.id,
          entity: "ContactType",
          entityId: contactType.id,
          metadata: auditMetadata({ name: contactType.name, slug }),
        },
      });
      return contactType;
    });
    revalidateContactTypes();
    return state(`${created.name} was added.`, true);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return state("A person type with that name or identifier already exists.");
    }
    throw error;
  }
}

export async function updateContactTypeAction(
  _: ContactTypeActionState,
  formData: FormData,
): Promise<ContactTypeActionState> {
  const admin = await requireAdmin();
  const parsed = parseContactType(formData);
  if (!parsed.success || !parsed.data.id) {
    return state(
      parsed.success
        ? "Choose a person type to update."
        : parsed.error.issues[0]?.message ?? "Check the person type details.",
    );
  }

  const { id, isDefault, ...data } = parsed.data;
  const existing = await prisma.contactType.findUnique({
    where: { id },
    select: { isActive: true, isDefault: true, name: true },
  });
  if (!existing) return state("That person type no longer exists.");
  if (!isDefault && existing.isDefault) {
    return state("Choose another default type before removing this default.");
  }

  await prisma.$transaction(async (tx) => {
    if (isDefault) {
      await tx.contactType.updateMany({
        where: { id: { not: id } },
        data: { isDefault: false },
      });
    }
    await tx.contactType.update({
      where: { id },
      data: { ...data, isDefault, isActive: isDefault ? true : existing.isActive },
    });
    await tx.auditLog.create({
      data: {
        action: "contact_type.updated",
        actorId: admin.id,
        entity: "ContactType",
        entityId: id,
        metadata: auditMetadata({ isDefault, name: data.name }),
      },
    });
  });
  revalidateContactTypes();
  return state(`${data.name} was updated.`, true);
}

export async function toggleContactTypeActiveAction(
  _: ContactTypeActionState,
  formData: FormData,
): Promise<ContactTypeActionState> {
  const admin = await requireAdmin();
  const parsed = toggleSchema.safeParse({
    id: formData.get("id"),
    nextActive: formData.get("nextActive"),
  });
  if (!parsed.success) return state("Choose a person type to update.");

  const contactType = await prisma.contactType.findUnique({
    where: { id: parsed.data.id },
    select: {
      _count: { select: { contacts: true } },
      isActive: true,
      isDefault: true,
      name: true,
    },
  });
  if (!contactType) return state("That person type no longer exists.");
  const archiveBlockReason = parsed.data.nextActive
    ? null
    : contactTypeArchiveBlockReason({
        contactCount: contactType._count.contacts,
        isDefault: contactType.isDefault,
        name: contactType.name,
      });
  if (archiveBlockReason) {
    return state(archiveBlockReason);
  }

  await prisma.$transaction([
    prisma.contactType.update({
      where: { id: parsed.data.id },
      data: { isActive: parsed.data.nextActive },
    }),
    prisma.auditLog.create({
      data: {
        action: parsed.data.nextActive
          ? "contact_type.reactivated"
          : "contact_type.archived",
        actorId: admin.id,
        entity: "ContactType",
        entityId: parsed.data.id,
        metadata: auditMetadata({ name: contactType.name }),
      },
    }),
  ]);
  revalidateContactTypes();
  return state(
    `${contactType.name} was ${parsed.data.nextActive ? "reactivated" : "archived"}.`,
    true,
  );
}
