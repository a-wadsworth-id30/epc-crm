"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAdmin, requireUser } from "@/lib/auth";
import { companyContactLinkDecision } from "@/lib/companies/contact-relationships";
import {
  companyContactResponsibilityValues,
  normalizeCompanyContactResponsibilities,
} from "@/lib/companies/contact-responsibilities";
import {
  parseCompanyCustomFieldSubmission,
  replaceCompanyCustomFieldValues,
  type CompanyCustomFieldDefinition,
} from "@/lib/companies/custom-fields";
import { editableCompanyFields } from "@/lib/companies/field-access";
import { normalizeContactCustomFieldOptions } from "@/lib/contacts/custom-fields";
import { systemContactTypeAssignment } from "@/lib/contacts/contact-type-assignment";
import {
  companyIdAccessWhere,
  contactIdAccessWhere,
} from "@/lib/crm-resource-access";
import { normalizedContactPhone } from "@/lib/phone-normalization";
import { prisma } from "@/lib/prisma";
import { isLeadSourceValue } from "@/lib/sales/lead-sources";

export type CompanyActionState = {
  ok: boolean;
  message: string;
};

const companyContactLinkSchema = z.object({
  companyId: z.string().trim().min(1),
  contactId: z.string().trim().min(1),
  expectedCurrentCompanyId: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null),
  allowMove: z
    .enum(["true", "false"])
    .transform((value) => value === "true"),
});

const companyContactUnlinkSchema = z.object({
  companyId: z.string().trim().min(1),
  contactId: z.string().trim().min(1),
});

const companyContactResponsibilitiesSchema = z.object({
  companyId: z.string().trim().min(1),
  contactId: z.string().trim().min(1),
  responsibilities: z.array(z.enum(companyContactResponsibilityValues)),
});

const companySchema = z.object({
  id: z.string().trim().optional(),
  companyTypeId: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null),
  name: z.string().trim().min(1, "Company name is required."),
  domain: z
    .string()
    .trim()
    .optional()
    .transform((value) => normalizeDomain(value)),
  status: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || "Prospect"),
  owner: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null),
  addressLine1: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null),
  addressLine2: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null),
  city: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null),
  county: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null),
  postcode: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null),
  country: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null),
});

const companyCreateContactLimit = 10;

const companyCreateContactSchema = z.object({
  email: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null))
    .pipe(z.string().email("Enter a valid contact email.").nullable()),
  firstName: z.string().trim().min(1, "Contact first name is required."),
  lastName: z.string().trim().min(1, "Contact last name is required."),
  leadSource: z
    .string()
    .trim()
    .min(1, "Choose where the contact heard about us.")
    .refine(isLeadSourceValue, "Choose where the contact heard about us."),
  phone: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
  role: z.string().trim().min(1, "Contact role or job title is required."),
});

type CompanyCreateContact = z.infer<typeof companyCreateContactSchema>;

function normalizeDomain(value?: string) {
  if (!value) return null;

  const withoutProtocol = value
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "");
  const domain = withoutProtocol.split("/")[0]?.trim().toLowerCase();

  return domain || null;
}

function parseCompany(formData: FormData) {
  const value = (key: string) => {
    const entry = formData.get(key);
    return typeof entry === "string" ? entry : undefined;
  };

  return companySchema.safeParse({
    addressLine1: value("addressLine1"),
    addressLine2: value("addressLine2"),
    city: value("city"),
    companyTypeId: value("companyTypeId"),
    county: value("county"),
    country: value("country"),
    domain: value("domain"),
    id: value("id"),
    name: value("name"),
    owner: value("owner"),
    postcode: value("postcode"),
    status: value("status"),
  });
}

class CompanyActionError extends Error {}

async function resolveSubmittedCompanyType(
  tx: Prisma.TransactionClient,
  requestedCompanyTypeId: string | null,
  user: Awaited<ReturnType<typeof requireUser>>,
  currentCompanyTypeId?: string | null,
) {
  const companyType = await tx.companyType.findFirst({
    where: requestedCompanyTypeId
      ? {
          id: requestedCompanyTypeId,
          OR: [
            { isActive: true },
            ...(requestedCompanyTypeId === currentCompanyTypeId
              ? [{ id: currentCompanyTypeId ?? "" }]
              : []),
          ],
        }
      : { isActive: true, isDefault: true },
    select: {
      id: true,
      fields: {
        where: { isActive: true },
        orderBy: [{ displayOrder: "asc" }, { label: "asc" }],
        select: {
          companyTypeId: true,
          displayOrder: true,
          editRoleTemplates: true,
          externalEditable: true,
          fieldType: true,
          helpText: true,
          id: true,
          isActive: true,
          isSearchable: true,
          key: true,
          label: true,
          options: true,
          placeholder: true,
          requirementMode: true,
          showInTable: true,
          viewRoleTemplates: true,
        },
      },
    },
  });
  if (!companyType) throw new CompanyActionError("Choose an active company type.");
  const customFields: CompanyCustomFieldDefinition[] = editableCompanyFields(
    companyType.fields,
    user,
  ).map((field) => ({
    ...field,
    options: normalizeContactCustomFieldOptions(field.options),
  }));
  return { companyTypeId: companyType.id, customFields };
}

function stringArray(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((entry) => (typeof entry === "string" ? entry : ""));
}

function parseCompanyCreateContacts(formData: FormData):
  | { ok: true; contacts: CompanyCreateContact[] }
  | { ok: false; message: string } {
  const firstNames = stringArray(formData, "contactFirstName");
  const lastNames = stringArray(formData, "contactLastName");
  const emails = stringArray(formData, "contactEmail");
  const phones = stringArray(formData, "contactPhone");
  const roles = stringArray(formData, "contactRole");
  const leadSources = stringArray(formData, "contactLeadSource");
  const rowCount = Math.max(
    firstNames.length,
    lastNames.length,
    emails.length,
    phones.length,
    roles.length,
    leadSources.length,
  );

  if (rowCount > companyCreateContactLimit) {
    return {
      ok: false,
      message: `Add up to ${companyCreateContactLimit} contacts when creating a company.`,
    };
  }

  const contacts: CompanyCreateContact[] = [];

  for (let index = 0; index < rowCount; index += 1) {
    const draft = {
      email: emails[index] ?? "",
      firstName: firstNames[index] ?? "",
      lastName: lastNames[index] ?? "",
      leadSource: leadSources[index] ?? "",
      phone: phones[index] ?? "",
      role: roles[index] ?? "",
    };
    const hasContactDetails = Object.values(draft).some((value) =>
      value.trim(),
    );

    if (!hasContactDetails) {
      continue;
    }

    const parsed = companyCreateContactSchema.safeParse(draft);
    if (!parsed.success) {
      return {
        ok: false,
        message: `Contact ${index + 1}: ${
          parsed.error.issues[0]?.message ?? "Check the contact details."
        }`,
      };
    }

    contacts.push(parsed.data);
  }

  return { ok: true, contacts };
}

function revalidateCompanyPaths() {
  revalidatePath("/clients");
  revalidatePath("/contacts");
  revalidatePath("/sales");
}

function revalidateCompanyRelationshipPaths(
  contactId: string,
  companyIds: Array<string | null>,
) {
  revalidateCompanyPaths();
  revalidatePath(`/contacts/${contactId}`);
  for (const companyId of new Set(
    companyIds.filter((value): value is string => Boolean(value)),
  )) {
    revalidatePath(`/clients/${companyId}`);
  }
}

export async function linkContactToCompanyAction(
  _: CompanyActionState,
  formData: FormData,
): Promise<CompanyActionState> {
  const user = await requireUser();
  const parsed = companyContactLinkSchema.safeParse({
    allowMove: formData.get("allowMove"),
    companyId: formData.get("companyId"),
    contactId: formData.get("contactId"),
    expectedCurrentCompanyId: formData.get("expectedCurrentCompanyId"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Choose a person to link." };
  }

  const [company, contact] = await Promise.all([
    prisma.company.findFirst({
      where: companyIdAccessWhere(parsed.data.companyId, user),
      select: { id: true, name: true },
    }),
    prisma.contact.findFirst({
      where: contactIdAccessWhere(parsed.data.contactId, user),
      select: { companyId: true, id: true },
    }),
  ]);
  if (!company || !contact) {
    return {
      ok: false,
      message: "The company or person is no longer available.",
    };
  }
  const decision = companyContactLinkDecision({
    allowMove: parsed.data.allowMove,
    currentCompanyId: contact.companyId,
    expectedCurrentCompanyId: parsed.data.expectedCurrentCompanyId,
    targetCompanyId: company.id,
  });
  if (!decision.ok) {
    return { ok: false, message: decision.message };
  }
  if (decision.action === "unchanged") {
    return { ok: true, message: "This person is already linked to the company." };
  }

  const previousCompanyId = contact.companyId;
  await prisma.$transaction([
    prisma.contact.update({
      where: { id: contact.id },
      data: {
        companyContactResponsibilities:
          decision.action === "moved" ? [] : undefined,
        companyId: company.id,
        companyName: company.name,
      },
    }),
    prisma.auditLog.create({
      data: {
        action: `company_contact.${decision.action}`,
        actorId: user.id,
        entity: "Contact",
        entityId: contact.id,
        metadata: { companyId: company.id, previousCompanyId },
      },
    }),
  ]);
  revalidateCompanyRelationshipPaths(contact.id, [
    previousCompanyId,
    company.id,
  ]);
  return {
    ok: true,
    message: previousCompanyId
      ? "Person moved to this company."
      : "Person linked to this company.",
  };
}

export async function unlinkContactFromCompanyAction(
  _: CompanyActionState,
  formData: FormData,
): Promise<CompanyActionState> {
  const user = await requireUser();
  const parsed = companyContactUnlinkSchema.safeParse({
    companyId: formData.get("companyId"),
    contactId: formData.get("contactId"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Choose a linked person." };
  }

  const [company, contact] = await Promise.all([
    prisma.company.findFirst({
      where: companyIdAccessWhere(parsed.data.companyId, user),
      select: { id: true },
    }),
    prisma.contact.findFirst({
      where: contactIdAccessWhere(parsed.data.contactId, user),
      select: { companyId: true, id: true },
    }),
  ]);
  if (!company || !contact) {
    return {
      ok: false,
      message: "The company or person is no longer available.",
    };
  }
  if (contact.companyId !== company.id) {
    return {
      ok: false,
      message: "This person is no longer linked to the company.",
    };
  }

  await prisma.$transaction([
    prisma.contact.update({
      where: { id: contact.id },
      data: {
        companyContactResponsibilities: [],
        companyId: null,
        companyName: null,
      },
    }),
    prisma.auditLog.create({
      data: {
        action: "company_contact.unlinked",
        actorId: user.id,
        entity: "Contact",
        entityId: contact.id,
        metadata: { companyId: company.id },
      },
    }),
  ]);
  revalidateCompanyRelationshipPaths(contact.id, [company.id]);
  return { ok: true, message: "Person unlinked. Their CRM record was kept." };
}

export async function updateCompanyContactResponsibilitiesAction(
  _: CompanyActionState,
  formData: FormData,
): Promise<CompanyActionState> {
  const user = await requireUser();
  const parsed = companyContactResponsibilitiesSchema.safeParse({
    companyId: formData.get("companyId"),
    contactId: formData.get("contactId"),
    responsibilities: formData.getAll("responsibilities"),
  });

  if (!parsed.success) {
    return { ok: false, message: "Check the selected Company roles." };
  }

  const [company, contact] = await Promise.all([
    prisma.company.findFirst({
      where: companyIdAccessWhere(parsed.data.companyId, user),
      select: { id: true },
    }),
    prisma.contact.findFirst({
      where: contactIdAccessWhere(parsed.data.contactId, user),
      select: {
        companyContactResponsibilities: true,
        companyId: true,
        id: true,
      },
    }),
  ]);

  if (!company || !contact) {
    return {
      ok: false,
      message: "The company or person is no longer available.",
    };
  }
  if (contact.companyId !== company.id) {
    return {
      ok: false,
      message: "This person is no longer linked to the company.",
    };
  }

  const responsibilities = normalizeCompanyContactResponsibilities(
    parsed.data.responsibilities,
  );
  const before = normalizeCompanyContactResponsibilities(
    contact.companyContactResponsibilities,
  );

  await prisma.$transaction([
    prisma.contact.update({
      where: { id: contact.id },
      data: { companyContactResponsibilities: responsibilities },
    }),
    prisma.auditLog.create({
      data: {
        action: "company_contact.responsibilities_updated",
        actorId: user.id,
        entity: "Contact",
        entityId: contact.id,
        metadata: {
          companyId: company.id,
          previousResponsibilities: before,
          responsibilities,
        },
      },
    }),
  ]);

  revalidateCompanyRelationshipPaths(contact.id, [company.id]);
  return { ok: true, message: "Company contact roles updated." };
}

export async function createCompanyAction(
  _: CompanyActionState,
  formData: FormData,
): Promise<CompanyActionState> {
  const user = await requireUser();

  const parsed = parseCompany(formData);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the company details.",
    };
  }

  const parsedContacts = parseCompanyCreateContacts(formData);
  if (!parsedContacts.ok) {
    return { ok: false, message: parsedContacts.message };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const companyType = await resolveSubmittedCompanyType(
        tx,
        parsed.data.companyTypeId,
        user,
      );
      const customFields = parseCompanyCustomFieldSubmission(
        companyType.customFields,
        formData,
      );
      if (!customFields.ok) throw new CompanyActionError(customFields.message);

      const company = await tx.company.create({
        data: {
          addressLine1: parsed.data.addressLine1,
          addressLine2: parsed.data.addressLine2,
          city: parsed.data.city,
          companyTypeId: companyType.companyTypeId,
          county: parsed.data.county,
          country: parsed.data.country,
          createdByUserId: user.id,
          domain: parsed.data.domain,
          name: parsed.data.name,
          owner: parsed.data.owner,
          postcode: parsed.data.postcode,
          status: parsed.data.status,
        },
        select: { id: true, name: true },
      });
      await replaceCompanyCustomFieldValues(
        tx,
        company.id,
        customFields.values,
      );

      if (!parsedContacts.contacts.length) return;
      const createdContacts = await Promise.all(
        parsedContacts.contacts.map((contact) =>
          tx.contact.create({
            data: {
              ...systemContactTypeAssignment(),
              companyId: company.id,
              companyName: company.name,
              createdByUserId: user.id,
              email: contact.email,
              firstName: contact.firstName,
              lastName: contact.lastName,
              leadSource: contact.leadSource,
              phone: contact.phone,
              phoneNormalized: normalizedContactPhone(contact.phone),
              role: contact.role,
            },
            select: { id: true },
          }),
        ),
      );
      await tx.auditLog.createMany({
        data: createdContacts.map((contact) => ({
          action: "company_contact.linked",
          actorId: user.id,
          entity: "Contact",
          entityId: contact.id,
          metadata: { companyId: company.id },
        })),
      });
    });
  } catch (error) {
    if (error instanceof CompanyActionError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }

  revalidateCompanyPaths();
  return {
    ok: true,
    message: parsedContacts.contacts.length
      ? `Company created with ${parsedContacts.contacts.length} contact${
          parsedContacts.contacts.length === 1 ? "" : "s"
        }.`
      : "Company created.",
  };
}

export async function updateCompanyAction(
  _: CompanyActionState,
  formData: FormData,
): Promise<CompanyActionState> {
  const user = await requireUser();

  const parsed = parseCompany(formData);
  if (!parsed.success || !parsed.data.id) {
    return {
      ok: false,
      message: parsed.success
        ? "Company ID is missing."
        : parsed.error.issues[0]?.message,
    };
  }

  const company = await prisma.company.findFirst({
    where: companyIdAccessWhere(parsed.data.id, user),
    select: { companyTypeId: true, id: true },
  });

  if (!company) {
    return { ok: false, message: "Company not found." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const companyType = await resolveSubmittedCompanyType(
        tx,
        parsed.data.companyTypeId,
        user,
        company.companyTypeId,
      );
      const customFields = parseCompanyCustomFieldSubmission(
        companyType.customFields,
        formData,
      );
      if (!customFields.ok) throw new CompanyActionError(customFields.message);

      await tx.company.update({
        where: { id: company.id },
        data: {
          addressLine1: parsed.data.addressLine1,
          addressLine2: parsed.data.addressLine2,
          city: parsed.data.city,
          companyTypeId: companyType.companyTypeId,
          county: parsed.data.county,
          country: parsed.data.country,
          domain: parsed.data.domain,
          name: parsed.data.name,
          owner: parsed.data.owner,
          postcode: parsed.data.postcode,
          status: parsed.data.status,
        },
      });
      await tx.contact.updateMany({
        where: { companyId: company.id },
        data: { companyName: parsed.data.name },
      });
      await replaceCompanyCustomFieldValues(
        tx,
        company.id,
        customFields.values,
      );
    });
  } catch (error) {
    if (error instanceof CompanyActionError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }

  revalidateCompanyPaths();
  return { ok: true, message: "Company updated." };
}

export async function deleteCompanyAction(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const company = await prisma.company.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!company) {
    return;
  }

  await prisma.$transaction([
    prisma.contact.updateMany({
      where: { companyId: company.id },
      data: { companyName: null },
    }),
    prisma.company.delete({ where: { id: company.id } }),
  ]);

  revalidateCompanyPaths();
}
