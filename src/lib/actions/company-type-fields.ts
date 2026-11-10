"use server";

import { revalidatePath } from "next/cache";
import { ContactCustomFieldType, ContactFieldRequirementMode, Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import {
  contactCustomFieldKey,
  contactCustomFieldNeedsOptions,
  parseContactCustomFieldOptions,
} from "@/lib/contacts/custom-fields";
import { optionalFormIdSchema } from "@/lib/forms/optional-id";
import { prisma } from "@/lib/prisma";
import { userRoleTemplateSchema } from "@/lib/users/role-templates";

export type CompanyTypeFieldActionState = { ok: boolean; message: string; savedAt: number | null };

const fieldSchema = z.object({
  id: optionalFormIdSchema,
  companyTypeId: z.string().trim().min(1, "Choose a company type."),
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

function state(message: string, ok = false): CompanyTypeFieldActionState {
  return { ok, message, savedAt: ok ? Date.now() : null };
}

function revalidateFields() {
  revalidatePath("/clients");
  revalidatePath("/settings/company-types");
}

function parseField(formData: FormData) {
  return fieldSchema.safeParse({
    id: formData.get("fieldId"),
    companyTypeId: formData.get("companyTypeId"),
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

function fieldData(data: z.infer<typeof fieldSchema>, options: string[]) {
  return {
    displayOrder: data.displayOrder,
    externalEditable: data.externalEditable,
    viewRoleTemplates: data.viewRoleTemplates,
    editRoleTemplates: data.editRoleTemplates.filter((role) => data.viewRoleTemplates.length === 0 || data.viewRoleTemplates.includes(role)),
    fieldType: data.fieldType,
    helpText: data.helpText,
    isSearchable: data.isSearchable,
    label: data.label,
    options: options.length ? (options as Prisma.InputJsonValue) : Prisma.JsonNull,
    placeholder: data.placeholder,
    requirementMode: data.requirementMode,
    showInTable: data.showInTable,
  };
}

async function availableKey(companyTypeId: string, label: string) {
  const base = contactCustomFieldKey(label);
  const existing = await prisma.companyTypeField.findMany({
    where: { companyTypeId, OR: [{ key: base }, { key: { startsWith: `${base}_` } }] },
    select: { key: true },
  });
  const used = new Set(existing.map((field) => field.key));
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

export async function createCompanyTypeFieldAction(
  _: CompanyTypeFieldActionState,
  formData: FormData,
): Promise<CompanyTypeFieldActionState> {
  const admin = await requireAdmin();
  const parsed = parseField(formData);
  if (!parsed.success) return state(parsed.error.issues[0]?.message ?? "Check the field details.");
  const options = parseContactCustomFieldOptions(parsed.data.optionsText);
  if (contactCustomFieldNeedsOptions(parsed.data.fieldType) && options.length < 2) return state("Add at least two options for a select field.");
  const companyType = await prisma.companyType.findUnique({ where: { id: parsed.data.companyTypeId }, select: { id: true, name: true } });
  if (!companyType) return state("That company type no longer exists.");
  const key = await availableKey(companyType.id, parsed.data.label);
  const data = fieldData(parsed.data, options);
  const created = await prisma.$transaction(async (tx) => {
    const field = await tx.companyTypeField.create({ data: { ...data, companyTypeId: companyType.id, key } });
    await tx.auditLog.create({
      data: {
        action: "company_type_field.created",
        actorId: admin.id,
        entity: "CompanyTypeField",
        entityId: field.id,
        metadata: { companyTypeId: companyType.id, fieldType: field.fieldType, key },
      },
    });
    return field;
  });
  revalidateFields();
  return state(`${created.label} was added to ${companyType.name}.`, true);
}

export async function updateCompanyTypeFieldAction(
  _: CompanyTypeFieldActionState,
  formData: FormData,
): Promise<CompanyTypeFieldActionState> {
  const admin = await requireAdmin();
  const parsed = parseField(formData);
  if (!parsed.success || !parsed.data.id) return state(parsed.success ? "Choose a field to update." : parsed.error.issues[0]?.message ?? "Check the field details.");
  const existing = await prisma.companyTypeField.findUnique({
    where: { id: parsed.data.id },
    select: { _count: { select: { values: true } }, companyTypeId: true, fieldType: true, key: true },
  });
  if (!existing) return state("That field no longer exists.");
  const options = parseContactCustomFieldOptions(parsed.data.optionsText);
  if (contactCustomFieldNeedsOptions(parsed.data.fieldType) && options.length < 2) return state("Add at least two options for a select field.");
  if (existing._count.values > 0 && existing.fieldType !== parsed.data.fieldType) {
    return state("The field type cannot be changed after values have been saved. Archive it and add a replacement field instead.");
  }
  const data = fieldData(parsed.data, options);
  await prisma.$transaction([
    prisma.companyTypeField.update({ where: { id: parsed.data.id }, data }),
    prisma.auditLog.create({
      data: {
        action: "company_type_field.updated",
        actorId: admin.id,
        entity: "CompanyTypeField",
        entityId: parsed.data.id,
        metadata: { companyTypeId: existing.companyTypeId, fieldType: data.fieldType, key: existing.key },
      },
    }),
  ]);
  revalidateFields();
  return state(`${data.label} was updated.`, true);
}

export async function toggleCompanyTypeFieldAction(
  _: CompanyTypeFieldActionState,
  formData: FormData,
): Promise<CompanyTypeFieldActionState> {
  const admin = await requireAdmin();
  const parsed = toggleSchema.safeParse({ id: formData.get("fieldId"), nextActive: formData.get("nextActive") });
  if (!parsed.success) return state("Choose a field to update.");
  const field = await prisma.companyTypeField.findUnique({ where: { id: parsed.data.id }, select: { label: true } });
  if (!field) return state("That field no longer exists.");
  await prisma.$transaction([
    prisma.companyTypeField.update({ where: { id: parsed.data.id }, data: { isActive: parsed.data.nextActive } }),
    prisma.auditLog.create({
      data: {
        action: parsed.data.nextActive ? "company_type_field.reactivated" : "company_type_field.archived",
        actorId: admin.id,
        entity: "CompanyTypeField",
        entityId: parsed.data.id,
      },
    }),
  ]);
  revalidateFields();
  return state(`${field.label} was ${parsed.data.nextActive ? "reactivated" : "archived"}.`, true);
}
