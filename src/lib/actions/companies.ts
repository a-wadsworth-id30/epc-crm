"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireUser } from "@/lib/auth";
import { companyIdAccessWhere } from "@/lib/crm-resource-access";
import { normalizedContactPhone } from "@/lib/phone-normalization";
import { prisma } from "@/lib/prisma";
import { isLeadSourceValue } from "@/lib/sales/lead-sources";

export type CompanyActionState = {
  ok: boolean;
  message: string;
};

const companySchema = z.object({
  id: z.string().trim().optional(),
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

  await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        addressLine1: parsed.data.addressLine1,
        addressLine2: parsed.data.addressLine2,
        city: parsed.data.city,
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

    if (!parsedContacts.contacts.length) {
      return;
    }

    await tx.contact.createMany({
      data: parsedContacts.contacts.map((contact) => ({
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
      })),
    });
  });

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
    select: { id: true },
  });

  if (!company) {
    return { ok: false, message: "Company not found." };
  }

  await prisma.$transaction([
    prisma.company.update({
      where: { id: company.id },
      data: {
        addressLine1: parsed.data.addressLine1,
        addressLine2: parsed.data.addressLine2,
        city: parsed.data.city,
        county: parsed.data.county,
        country: parsed.data.country,
        domain: parsed.data.domain,
        name: parsed.data.name,
        owner: parsed.data.owner,
        postcode: parsed.data.postcode,
        status: parsed.data.status,
      },
    }),
    prisma.contact.updateMany({
      where: { companyId: company.id },
      data: { companyName: parsed.data.name },
    }),
  ]);

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
