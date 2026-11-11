"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAdmin, requireUser } from "@/lib/auth";
import {
  companyAffiliationLinkDecision,
  companyAffiliationUnlinkDecision,
} from "@/lib/companies/contact-relationships";
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
import { companyHierarchyDecision } from "@/lib/companies/hierarchy";
import { mergedCompanyProfile } from "@/lib/companies/merge";
import {
  LEGACY_COMPANY_OWNER_VALUE,
  validateCompanyOwnerAssignment,
} from "@/lib/companies/owner-assignment";
import { normalizeContactCustomFieldOptions } from "@/lib/contacts/custom-fields";
import { systemContactTypeAssignment } from "@/lib/contacts/contact-type-assignment";
import {
  companyIdAccessWhere,
  companyWhereWithAccess,
  contactIdAccessWhere,
} from "@/lib/crm-resource-access";
import { normalizedContactPhone } from "@/lib/phone-normalization";
import { prisma } from "@/lib/prisma";
import { isLeadSourceValue } from "@/lib/sales/lead-sources";

export type CompanyActionState = {
  ok: boolean;
  message: string;
};

export type CompanyMergeActionState = CompanyActionState & {
  primaryCompanyId?: string;
};

const companyContactLinkSchema = z.object({
  companyId: z.string().trim().min(1),
  contactId: z.string().trim().min(1),
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

const companyContactPrimarySchema = z.object({
  companyId: z.string().trim().min(1),
  contactId: z.string().trim().min(1),
});

const companyParentSchema = z.object({
  companyId: z.string().trim().min(1),
  parentCompanyId: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null),
});

const companyMergeSchema = z.object({
  duplicateCompanyId: z.string().trim().min(1, "Choose a company to merge."),
  primaryCompanyId: z.string().trim().min(1, "Company ID is missing."),
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
  ownerUserId: z
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
    ownerUserId: value("ownerUserId"),
    postcode: value("postcode"),
    status: value("status"),
  });
}

class CompanyActionError extends Error {}

async function resolveCompanyOwner(
  tx: Prisma.TransactionClient,
  ownerUserId: string | null,
  user: Awaited<ReturnType<typeof requireUser>>,
) {
  if (!ownerUserId) return null;
  if (ownerUserId === LEGACY_COMPANY_OWNER_VALUE) {
    throw new CompanyActionError(
      "Choose a valid CRM user for the company owner.",
    );
  }

  const owner = await tx.user.findFirst({
    where: { id: ownerUserId, status: "ACTIVE" },
    select: { id: true, name: true },
  });
  const decision = validateCompanyOwnerAssignment({
    activeOwnerIds: new Set(owner ? [owner.id] : []),
    currentUser: user,
    ownerUserId,
  });
  if (!decision.ok) throw new CompanyActionError(decision.message);

  return owner;
}

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
  if (!companyType)
    throw new CompanyActionError("Choose an active company type.");
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

function parseCompanyCreateContacts(
  formData: FormData,
):
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

export async function updateCompanyParentAction(
  _: CompanyActionState,
  formData: FormData,
): Promise<CompanyActionState> {
  const user = await requireUser();
  const parsed = companyParentSchema.safeParse({
    companyId: formData.get("companyId"),
    parentCompanyId: formData.get("parentCompanyId"),
  });

  if (!parsed.success) {
    return { ok: false, message: "Choose a valid parent Company." };
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const company = await tx.company.findFirst({
          where: companyIdAccessWhere(parsed.data.companyId, user),
          select: { id: true, parentCompanyId: true },
        });
        if (!company) throw new CompanyActionError("Company not found.");

        if (parsed.data.parentCompanyId) {
          const parent = await tx.company.findFirst({
            where: companyWhereWithAccess(user, {
              id: parsed.data.parentCompanyId,
            }),
            select: { id: true },
          });
          if (!parent) {
            throw new CompanyActionError("Parent Company not found.");
          }
        }

        const ancestorIds: string[] = [];
        const visited = new Set<string>();
        let ancestorId = parsed.data.parentCompanyId;

        while (ancestorId) {
          if (visited.has(ancestorId)) {
            throw new CompanyActionError(
              "The existing Company hierarchy contains a circular link.",
            );
          }
          visited.add(ancestorId);
          ancestorIds.push(ancestorId);

          const ancestor = await tx.company.findUnique({
            where: { id: ancestorId },
            select: { parentCompanyId: true },
          });
          ancestorId = ancestor?.parentCompanyId ?? null;
        }

        const decision = companyHierarchyDecision({
          ancestorIds,
          companyId: company.id,
          parentCompanyId: parsed.data.parentCompanyId,
        });
        if (!decision.ok) throw new CompanyActionError(decision.message);

        if (company.parentCompanyId === parsed.data.parentCompanyId) {
          return {
            changed: false,
            previousParentCompanyId: company.parentCompanyId,
          };
        }

        await tx.company.update({
          where: { id: company.id },
          data: { parentCompanyId: parsed.data.parentCompanyId },
        });
        await tx.auditLog.create({
          data: {
            action: "company.parent_updated",
            actorId: user.id,
            entity: "Company",
            entityId: company.id,
            metadata: {
              parentCompanyId: parsed.data.parentCompanyId,
              previousParentCompanyId: company.parentCompanyId,
            },
          },
        });

        return {
          changed: true,
          previousParentCompanyId: company.parentCompanyId,
        };
      },
      { isolationLevel: "Serializable" },
    );

    revalidateCompanyPaths();
    revalidatePath(`/clients/${parsed.data.companyId}`);
    if (result.previousParentCompanyId) {
      revalidatePath(`/clients/${result.previousParentCompanyId}`);
    }
    if (parsed.data.parentCompanyId) {
      revalidatePath(`/clients/${parsed.data.parentCompanyId}`);
    }

    return {
      ok: true,
      message: result.changed
        ? parsed.data.parentCompanyId
          ? "Parent Company updated."
          : "Parent Company removed."
        : "Company hierarchy is already up to date.",
    };
  } catch (error) {
    if (error instanceof CompanyActionError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

export async function linkContactToCompanyAction(
  _: CompanyActionState,
  formData: FormData,
): Promise<CompanyActionState> {
  const user = await requireUser();
  const parsed = companyContactLinkSchema.safeParse({
    companyId: formData.get("companyId"),
    contactId: formData.get("contactId"),
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
      select: {
        companyAffiliations: { select: { companyId: true } },
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
  const decision = companyAffiliationLinkDecision({
    currentPrimaryCompanyId: contact.companyId,
    existingCompanyIds: contact.companyAffiliations.map(
      (affiliation) => affiliation.companyId,
    ),
    targetCompanyId: company.id,
  });
  if (!decision.ok) {
    return { ok: false, message: decision.message };
  }
  if (decision.action === "unchanged") {
    return {
      ok: true,
      message: "This person is already linked to the company.",
    };
  }

  await prisma.$transaction(async (tx) => {
    if (decision.action === "linked_primary") {
      await tx.contact.update({
        where: { id: contact.id },
        data: {
          companyContactResponsibilities: [],
          companyId: company.id,
          companyName: company.name,
        },
      });
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
        action:
          decision.action === "linked_primary"
            ? "company_contact.linked"
            : "company_contact.affiliation_linked",
        actorId: user.id,
        entity: "Contact",
        entityId: contact.id,
        metadata: {
          companyId: company.id,
          primaryCompanyId: contact.companyId,
        },
      },
    });
  });
  revalidateCompanyRelationshipPaths(contact.id, [
    contact.companyId,
    company.id,
  ]);
  return {
    ok: true,
    message:
      decision.action === "linked_primary"
        ? "Person linked and set as their primary Company."
        : "Additional Company relationship added.",
  };
}

export async function makeCompanyContactPrimaryAction(
  _: CompanyActionState,
  formData: FormData,
): Promise<CompanyActionState> {
  const user = await requireUser();
  const parsed = companyContactPrimarySchema.safeParse({
    companyId: formData.get("companyId"),
    contactId: formData.get("contactId"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Choose a linked Company relationship." };
  }

  const [company, contact] = await Promise.all([
    prisma.company.findFirst({
      where: companyIdAccessWhere(parsed.data.companyId, user),
      select: { id: true, name: true },
    }),
    prisma.contact.findFirst({
      where: contactIdAccessWhere(parsed.data.contactId, user),
      select: {
        companyId: true,
        id: true,
        companyAffiliations: {
          where: { companyId: parsed.data.companyId },
          select: { id: true, responsibilities: true },
          take: 1,
        },
      },
    }),
  ]);
  const affiliation = contact?.companyAffiliations[0];
  if (!company || !contact || !affiliation) {
    return {
      ok: false,
      message: "The Company relationship is no longer available.",
    };
  }
  if (contact.companyId === company.id) {
    return { ok: true, message: "This is already the primary Company." };
  }

  const previousCompanyId = contact.companyId;
  await prisma.$transaction(async (tx) => {
    await tx.companyContactAffiliation.updateMany({
      where: { contactId: contact.id, isPrimary: true },
      data: { isPrimary: false },
    });
    await tx.companyContactAffiliation.update({
      where: { id: affiliation.id },
      data: { isPrimary: true },
    });
    await tx.contact.update({
      where: { id: contact.id },
      data: {
        companyContactResponsibilities: affiliation.responsibilities,
        companyId: company.id,
        companyName: company.name,
      },
    });
    await tx.auditLog.create({
      data: {
        action: "company_contact.primary_changed",
        actorId: user.id,
        entity: "Contact",
        entityId: contact.id,
        metadata: { companyId: company.id, previousCompanyId },
      },
    });
  });

  revalidateCompanyRelationshipPaths(contact.id, [
    previousCompanyId,
    company.id,
  ]);
  return { ok: true, message: "Primary Company updated." };
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
      select: {
        companyAffiliations: {
          select: { companyId: true, id: true, isPrimary: true },
        },
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
  const affiliation = contact.companyAffiliations.find(
    (candidate) => candidate.companyId === company.id,
  );
  if (!affiliation) {
    return {
      ok: false,
      message: "This person is no longer linked to the company.",
    };
  }

  const decision = companyAffiliationUnlinkDecision({
    affiliationIsPrimary: affiliation.isPrimary,
    additionalAffiliationCount: contact.companyAffiliations.length - 1,
  });
  if (!decision.ok) return { ok: false, message: decision.message };

  await prisma.$transaction(async (tx) => {
    if (affiliation.isPrimary) {
      await tx.contact.update({
        where: { id: contact.id },
        data: {
          companyContactResponsibilities: [],
          companyId: null,
          companyName: null,
        },
      });
      await tx.companyContactAffiliation.deleteMany({
        where: { id: affiliation.id },
      });
    } else {
      await tx.companyContactAffiliation.delete({
        where: { id: affiliation.id },
      });
    }
    await tx.auditLog.create({
      data: {
        action:
          decision.action === "unlinked_primary"
            ? "company_contact.unlinked"
            : "company_contact.affiliation_unlinked",
        actorId: user.id,
        entity: "Contact",
        entityId: contact.id,
        metadata: { companyId: company.id },
      },
    });
  });
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
        companyAffiliations: {
          where: { companyId: parsed.data.companyId },
          select: { id: true, isPrimary: true, responsibilities: true },
          take: 1,
        },
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
  const affiliation = contact.companyAffiliations[0];
  if (!affiliation) {
    return {
      ok: false,
      message: "This person is no longer linked to the company.",
    };
  }

  const responsibilities = normalizeCompanyContactResponsibilities(
    parsed.data.responsibilities,
  );
  const before = normalizeCompanyContactResponsibilities(
    affiliation.responsibilities,
  );

  await prisma.$transaction(async (tx) => {
    await tx.companyContactAffiliation.update({
      where: { id: affiliation.id },
      data: { responsibilities },
    });
    if (affiliation.isPrimary) {
      await tx.contact.update({
        where: { id: contact.id },
        data: { companyContactResponsibilities: responsibilities },
      });
    }
    await tx.auditLog.create({
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
    });
  });

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
      const owner = await resolveCompanyOwner(
        tx,
        parsed.data.ownerUserId,
        user,
      );

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
          owner: owner?.name ?? null,
          ownerUserId: owner?.id ?? null,
          postcode: parsed.data.postcode,
          status: parsed.data.status,
        },
        select: { id: true, name: true },
      });
      if (owner) {
        await tx.auditLog.create({
          data: {
            action: "company.owner_updated",
            actorId: user.id,
            entity: "Company",
            entityId: company.id,
            metadata: {
              ownerUserId: owner.id,
              previousOwnerUserId: null,
            },
          },
        });
      }
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
    select: {
      companyTypeId: true,
      id: true,
      owner: true,
      ownerUserId: true,
      ownerUser: { select: { id: true, name: true } },
    },
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
      const preserveLegacyOwner =
        parsed.data.ownerUserId === LEGACY_COMPANY_OWNER_VALUE &&
        !company.ownerUserId;
      if (
        parsed.data.ownerUserId === LEGACY_COMPANY_OWNER_VALUE &&
        !preserveLegacyOwner
      ) {
        throw new CompanyActionError(
          "Choose a valid CRM user for the company owner.",
        );
      }
      const owner =
        parsed.data.ownerUserId === company.ownerUserId
          ? company.ownerUser
          : preserveLegacyOwner
            ? null
            : await resolveCompanyOwner(tx, parsed.data.ownerUserId, user);
      const nextOwnerUserId = preserveLegacyOwner ? null : (owner?.id ?? null);
      const nextOwnerName = preserveLegacyOwner
        ? company.owner
        : (owner?.name ?? null);

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
          owner: nextOwnerName,
          ownerUserId: nextOwnerUserId,
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
      if (company.ownerUserId !== nextOwnerUserId) {
        await tx.auditLog.create({
          data: {
            action: "company.owner_updated",
            actorId: user.id,
            entity: "Company",
            entityId: company.id,
            metadata: {
              ownerUserId: nextOwnerUserId,
              previousOwnerUserId: company.ownerUserId,
            },
          },
        });
      }
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

export async function mergeCompaniesAction(
  _: CompanyMergeActionState,
  formData: FormData,
): Promise<CompanyMergeActionState> {
  const user = await requireAdmin();
  const parsed = companyMergeSchema.safeParse({
    duplicateCompanyId: formData.get("duplicateCompanyId"),
    primaryCompanyId: formData.get("primaryCompanyId"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Choose companies to merge.",
    };
  }

  const { duplicateCompanyId, primaryCompanyId } = parsed.data;
  if (duplicateCompanyId === primaryCompanyId) {
    return { ok: false, message: "Choose a different company to merge." };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const companies = await tx.company.findMany({
        where: { id: { in: [primaryCompanyId, duplicateCompanyId] } },
        select: {
          addressLine1: true,
          addressLine2: true,
          city: true,
          companyTypeId: true,
          contactAffiliations: {
            select: {
              contactId: true,
              id: true,
              isPrimary: true,
              responsibilities: true,
            },
          },
          country: true,
          county: true,
          domain: true,
          id: true,
          name: true,
          owner: true,
          ownerUserId: true,
          parentCompanyId: true,
          postcode: true,
        },
      });
      const primary = companies.find(
        (company) => company.id === primaryCompanyId,
      );
      const duplicate = companies.find(
        (company) => company.id === duplicateCompanyId,
      );
      if (!primary || !duplicate) {
        throw new CompanyActionError(
          "One of the selected companies could not be found.",
        );
      }

      const profile = mergedCompanyProfile({ primary, duplicate });
      const primaryAffiliations = new Map(
        primary.contactAffiliations.map((affiliation) => [
          affiliation.contactId,
          affiliation,
        ]),
      );

      for (const affiliation of duplicate.contactAffiliations) {
        const existing = primaryAffiliations.get(affiliation.contactId);
        if (existing) {
          const responsibilities = normalizeCompanyContactResponsibilities([
            ...existing.responsibilities,
            ...affiliation.responsibilities,
          ]);
          await tx.companyContactAffiliation.update({
            where: { id: existing.id },
            data: { responsibilities },
          });
          await tx.companyContactAffiliation.delete({
            where: { id: affiliation.id },
          });
        } else {
          await tx.companyContactAffiliation.update({
            where: { id: affiliation.id },
            data: { companyId: primary.id },
          });
        }
      }

      const movedPrimaryContacts = await tx.contact.updateMany({
        where: { companyId: duplicate.id },
        data: { companyId: primary.id, companyName: primary.name },
      });

      const primaryFieldValues = await tx.companyCustomFieldValue.findMany({
        where: { companyId: primary.id },
        select: { fieldId: true },
      });
      const retainedFieldIds = primaryFieldValues.map((value) => value.fieldId);
      if (retainedFieldIds.length) {
        await tx.companyCustomFieldValue.deleteMany({
          where: {
            companyId: duplicate.id,
            fieldId: { in: retainedFieldIds },
          },
        });
      }
      await tx.companyCustomFieldValue.updateMany({
        where: { companyId: duplicate.id },
        data: { companyId: primary.id },
      });

      const [opportunities, notes, tasks, documents] = await Promise.all([
        tx.salesOpportunity.updateMany({
          where: { companyId: duplicate.id },
          data: { companyId: primary.id },
        }),
        tx.note.updateMany({
          where: { companyId: duplicate.id },
          data: { companyId: primary.id },
        }),
        tx.task.updateMany({
          where: { companyId: duplicate.id },
          data: { companyId: primary.id },
        }),
        tx.fileAsset.updateMany({
          where: { entityId: duplicate.id, entityType: "Company" },
          data: { entityId: primary.id },
        }),
        tx.customerUploadRequest.updateMany({
          where: { entityId: duplicate.id, entityType: "Company" },
          data: { entityId: primary.id },
        }),
        tx.customerDocumentShare.updateMany({
          where: { entityId: duplicate.id, entityType: "Company" },
          data: { entityId: primary.id },
        }),
        tx.customerDocumentPortal.updateMany({
          where: { entityId: duplicate.id, entityType: "Company" },
          data: { entityId: primary.id },
        }),
        tx.signatureRequest.updateMany({
          where: { entityId: duplicate.id, entityType: "Company" },
          data: { entityId: primary.id },
        }),
        tx.externalRecordLink.updateMany({
          where: { internalId: duplicate.id, internalType: "company" },
          data: { internalId: primary.id },
        }),
      ]);

      await tx.company.updateMany({
        where: { parentCompanyId: duplicate.id, id: { not: primary.id } },
        data: { parentCompanyId: primary.id },
      });
      await tx.company.update({
        where: { id: primary.id },
        data: profile,
      });
      await tx.company.delete({ where: { id: duplicate.id } });
      await tx.auditLog.create({
        data: {
          action: "company.merged",
          actorId: user.id,
          entity: "Company",
          entityId: primary.id,
          metadata: {
            documents: documents.count,
            duplicateCompanyId: duplicate.id,
            movedPrimaryContacts: movedPrimaryContacts.count,
            notes: notes.count,
            opportunities: opportunities.count,
            tasks: tasks.count,
          },
        },
      });

      return { duplicateName: duplicate.name, primaryName: primary.name };
    });

    revalidateCompanyPaths();
    revalidatePath(`/clients/${primaryCompanyId}`);
    return {
      ok: true,
      message: `${result.duplicateName} merged into ${result.primaryName}.`,
      primaryCompanyId,
    };
  } catch (error) {
    if (error instanceof CompanyActionError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
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
