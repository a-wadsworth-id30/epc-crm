"use server";

import { revalidatePath } from "next/cache";
import {
  ContactCustomFieldType,
  ContactFieldRequirementMode,
  Prisma,
} from "@prisma/client";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import {
  contactCustomFieldKey,
  contactCustomFieldNeedsOptions,
  parseContactCustomFieldOptions,
} from "@/lib/contacts/custom-fields";
import { prisma } from "@/lib/prisma";
import { userRoleTemplateSchema } from "@/lib/users/role-templates";
import { optionalFormIdSchema } from "@/lib/forms/optional-id";

export type ContactTypeFieldActionState = {
  ok: boolean;
  message: string;
  savedAt: number | null;
};

const fieldSchema = z.object({
  id: optionalFormIdSchema,
  contactTypeId: z.string().trim().min(1, "Choose a person type."),
  label: z.string().trim().min(2, "Enter a field label.").max(100),
  helpText: z.string().trim().max(240).optional().transform((value) => value || null),
  placeholder: z.string().trim().max(120).optional().transform((value) => value || null),
  fieldType: z.nativeEnum(ContactCustomFieldType),
  requirementMode: z.nativeEnum(ContactFieldRequirementMode),
  displayOrder: z.coerce.number().int().min(0).max(9999),
  optionsText: z.string().max(3000).optional().default(""),
  showInTable: z.boolean(),
  isSearchable: z.boolean(),
  externalEditable: z.boolean(),
  viewRoleTemplates: z.array(userRoleTemplateSchema),
  editRoleTemplates: z.array(userRoleTemplateSchema),
});

const toggleSchema = z.object({
  id: z.string().trim().min(1),
  nextActive: z.enum(["true", "false"]).transform((value) => value === "true"),
});

function state(message: string, ok = false): ContactTypeFieldActionState {
  return { ok, message, savedAt: ok ? Date.now() : null };
}

function revalidateFields() {
  revalidatePath("/contacts");
  revalidatePath("/settings/contact-types");
}

function parseField(formData: FormData) {
  return fieldSchema.safeParse({
    id: formData.get("fieldId"),
    contactTypeId: formData.get("contactTypeId"),
    label: formData.get("label"),
    helpText: formData.get("helpText"),
    placeholder: formData.get("placeholder"),
    fieldType: formData.get("fieldType"),
    requirementMode: formData.get("requirementMode"),
    displayOrder: formData.get("displayOrder"),
    optionsText: formData.get("optionsText"),
    showInTable: formData.get("showInTable") === "on",
    isSearchable: formData.get("isSearchable") === "on",
    externalEditable: formData.get("externalEditable") === "on",
    viewRoleTemplates: formData.getAll("viewRoleTemplates"),
    editRoleTemplates: formData.getAll("editRoleTemplates"),
  });
}

function jsonOptions(options: string[]) {
  return options.length ? (options as Prisma.InputJsonValue) : Prisma.JsonNull;
}

function fieldData(
  data: z.infer<typeof fieldSchema>,
  options: string[],
) {
  return {
    displayOrder: data.displayOrder,
    externalEditable: data.externalEditable,
    viewRoleTemplates: data.viewRoleTemplates,
    editRoleTemplates: data.editRoleTemplates.filter((role) =>
      data.viewRoleTemplates.length === 0 || data.viewRoleTemplates.includes(role),
    ),
    fieldType: data.fieldType,
    helpText: data.helpText,
    isSearchable: data.isSearchable,
    label: data.label,
    options: jsonOptions(options),
    placeholder: data.placeholder,
    requirementMode: data.requirementMode,
    showInTable: data.showInTable,
  };
}

async function availableKey(contactTypeId: string, label: string) {
  const base = contactCustomFieldKey(label);
  const existing = await prisma.contactTypeField.findMany({
    where: { contactTypeId, OR: [{ key: base }, { key: { startsWith: `${base}_` } }] },
    select: { key: true },
  });
  const used = new Set(existing.map((field) => field.key));
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

export async function createContactTypeFieldAction(
  _: ContactTypeFieldActionState,
  formData: FormData,
): Promise<ContactTypeFieldActionState> {
  const admin = await requireAdmin();
  const parsed = parseField(formData);
  if (!parsed.success) return state(parsed.error.issues[0]?.message ?? "Check the field details.");
  const options = parseContactCustomFieldOptions(parsed.data.optionsText);
  if (contactCustomFieldNeedsOptions(parsed.data.fieldType) && options.length < 2) {
    return state("Add at least two options for a select field.");
  }
  const contactType = await prisma.contactType.findUnique({
    where: { id: parsed.data.contactTypeId },
    select: { id: true, name: true },
  });
  if (!contactType) return state("That person type no longer exists.");
  const key = await availableKey(contactType.id, parsed.data.label);
  const data = fieldData(parsed.data, options);
  const created = await prisma.$transaction(async (tx) => {
    const field = await tx.contactTypeField.create({
      data: { ...data, contactTypeId: contactType.id, key },
    });
    await tx.auditLog.create({
      data: {
        action: "contact_type_field.created",
        actorId: admin.id,
        entity: "ContactTypeField",
        entityId: field.id,
        metadata: { contactTypeId: contactType.id, fieldType: field.fieldType, key },
      },
    });
    return field;
  });
  revalidateFields();
  return state(`${created.label} was added to ${contactType.name}.`, true);
}

export async function updateContactTypeFieldAction(
  _: ContactTypeFieldActionState,
  formData: FormData,
): Promise<ContactTypeFieldActionState> {
  const admin = await requireAdmin();
  const parsed = parseField(formData);
  if (!parsed.success || !parsed.data.id) {
    return state(parsed.success ? "Choose a field to update." : parsed.error.issues[0]?.message ?? "Check the field details.");
  }
  const existing = await prisma.contactTypeField.findUnique({
    where: { id: parsed.data.id },
    select: {
      _count: { select: { values: true } },
      contactTypeId: true,
      fieldType: true,
      id: true,
      key: true,
    },
  });
  if (!existing) return state("That field no longer exists.");
  const options = parseContactCustomFieldOptions(parsed.data.optionsText);
  if (contactCustomFieldNeedsOptions(parsed.data.fieldType) && options.length < 2) {
    return state("Add at least two options for a select field.");
  }
  if (
    existing._count.values > 0 &&
    existing.fieldType !== parsed.data.fieldType
  ) {
    return state(
      "The field type cannot be changed after values have been saved. Archive it and add a replacement field instead.",
    );
  }
  const id = parsed.data.id;
  const data = fieldData(parsed.data, options);
  await prisma.$transaction([
    prisma.contactTypeField.update({
      where: { id },
      data,
    }),
    prisma.auditLog.create({
      data: {
        action: "contact_type_field.updated",
        actorId: admin.id,
        entity: "ContactTypeField",
        entityId: id,
        metadata: { contactTypeId: existing.contactTypeId, fieldType: data.fieldType, key: existing.key },
      },
    }),
  ]);
  revalidateFields();
  return state(`${data.label} was updated.`, true);
}

export async function toggleContactTypeFieldAction(
  _: ContactTypeFieldActionState,
  formData: FormData,
): Promise<ContactTypeFieldActionState> {
  const admin = await requireAdmin();
  const parsed = toggleSchema.safeParse({
    id: formData.get("fieldId"),
    nextActive: formData.get("nextActive"),
  });
  if (!parsed.success) return state("Choose a field to update.");
  const field = await prisma.contactTypeField.findUnique({
    where: { id: parsed.data.id },
    select: { label: true },
  });
  if (!field) return state("That field no longer exists.");
  await prisma.$transaction([
    prisma.contactTypeField.update({
      where: { id: parsed.data.id },
      data: { isActive: parsed.data.nextActive },
    }),
    prisma.auditLog.create({
      data: {
        action: parsed.data.nextActive ? "contact_type_field.reactivated" : "contact_type_field.archived",
        actorId: admin.id,
        entity: "ContactTypeField",
        entityId: parsed.data.id,
      },
    }),
  ]);
  revalidateFields();
  return state(`${field.label} was ${parsed.data.nextActive ? "reactivated" : "archived"}.`, true);
}
