"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireUser, type CurrentUser } from "@/lib/auth";
import {
  mergeContactEmailMethods,
  mergeContactPhoneMethods,
  parseContactEmailMethodsFormValue,
  parseContactPhoneMethodsFormValue,
  type ContactEmailMethod,
  type ContactPhoneMethod,
} from "@/lib/contact-methods";
import {
  companyIdAccessWhere,
  companyWhereWithAccess,
  contactIdAccessWhere,
} from "@/lib/crm-resource-access";
import { pipedriveProvider } from "@/lib/integrations/pipedrive";
import { importPipedrivePersonIds } from "@/lib/integrations/pipedrive-import";
import { normalizedContactPhone } from "@/lib/phone-normalization";
import { prisma } from "@/lib/prisma";
import { isLeadSourceValue } from "@/lib/sales/lead-sources";
import { getCrmSettings } from "@/lib/settings";

export type ContactActionState = {
  contactId?: string;
  ok: boolean;
  message: string;
};

export type ContactMergeActionState = ContactActionState & {
  primaryContactId?: string;
};

const contactSchema = z.object({
  id: z.string().optional(),
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  email: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null))
    .pipe(z.string().email().nullable()),
  phone: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
  leadSource: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null))
    .refine(
      (value) => value === null || isLeadSourceValue(value),
      "Choose where the contact heard about us.",
    ),
  role: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
  addressLine1: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
  addressLine2: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
  city: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
  county: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
  postcode: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
  country: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
  companyId: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
  companyName: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
});

const contactTagNamesSchema = z.array(z.string().trim().min(1).max(40)).max(20);

const mergeContactsSchema = z.object({
  primaryContactId: z.string().trim().min(1, "Primary contact is missing."),
  duplicateContactId: z.string().trim().min(1, "Choose a contact to merge."),
});

class ContactActionError extends Error {}

function formString(formData: FormData, key: string) {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry : undefined;
}

function parseContact(formData: FormData) {
  return contactSchema.safeParse({
    id: formString(formData, "id"),
    firstName: formString(formData, "firstName"),
    lastName: formString(formData, "lastName"),
    email: formString(formData, "email"),
    phone: formString(formData, "phone"),
    leadSource: formString(formData, "leadSource"),
    role: formString(formData, "role"),
    addressLine1: formString(formData, "addressLine1"),
    addressLine2: formString(formData, "addressLine2"),
    city: formString(formData, "city"),
    county: formString(formData, "county"),
    postcode: formString(formData, "postcode"),
    country: formString(formData, "country"),
    companyId: formString(formData, "companyId"),
    companyName: formString(formData, "companyName"),
  });
}

function slugifyContactTag(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function optionalMergeValue<T>(primary: T | null, duplicate: T | null) {
  return primary ?? duplicate ?? null;
}

function optionalMergeJsonValue(
  primary: Prisma.JsonValue | null,
  duplicate: Prisma.JsonValue | null,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  const value = primary ?? duplicate;
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

function parseContactTags(formData: FormData) {
  const raw = formData.get("tagNames");

  if (!raw || typeof raw !== "string") {
    return { ok: true as const, tagNames: [] };
  }

  let decoded: unknown;

  try {
    decoded = JSON.parse(raw);
  } catch {
    return { ok: false as const, message: "Check the contact tags." };
  }

  const parsed = contactTagNamesSchema.safeParse(decoded);

  if (!parsed.success) {
    return { ok: false as const, message: "Use up to 20 tags, 40 characters each." };
  }

  const seen = new Set<string>();
  const tagNames: string[] = [];

  for (const name of parsed.data) {
    const cleanName = name.replace(/\s+/g, " ").trim();
    const slug = slugifyContactTag(cleanName);

    if (!cleanName || !slug || seen.has(slug)) {
      continue;
    }

    seen.add(slug);
    tagNames.push(cleanName);
  }

  return { ok: true as const, tagNames };
}

async function resolveCompanyData(
  companyId: string | null,
  companyName: string | null,
  companiesEnabled: boolean,
  user: CurrentUser,
  tx: Prisma.TransactionClient,
) {
  if (!companiesEnabled) {
    return { companyId: null, companyName };
  }

  if (companyId) {
    const company = await tx.company.findFirst({
      where: companyIdAccessWhere(companyId, user),
      select: { id: true, name: true },
    });

    if (company) {
      return { companyId: company.id, companyName: company.name };
    }

    throw new ContactActionError("Selected company could not be found.");
  }

  if (companyName) {
    const existingCompany = await tx.company.findFirst({
      where: companyWhereWithAccess(user, {
        name: { equals: companyName, mode: "insensitive" },
      }),
      select: { id: true, name: true },
    });

    if (existingCompany) {
      return { companyId: existingCompany.id, companyName: existingCompany.name };
    }

    const company = await tx.company.create({
      data: {
        createdByUserId: user.id,
        name: companyName,
        status: "Prospect",
      },
      select: { id: true, name: true },
    });

    return { companyId: company.id, companyName: company.name };
  }

  return { companyId: null, companyName: null };
}

async function replaceContactTags(
  tx: Prisma.TransactionClient,
  contactId: string,
  tagNames: string[],
) {
  const tags = [];

  for (const name of tagNames) {
    const slug = slugifyContactTag(name);

    if (!slug) {
      continue;
    }

    const tag = await tx.contactTag.upsert({
      where: { slug },
      create: { name, slug },
      update: {},
      select: { id: true },
    });

    tags.push(tag);
  }

  await tx.contactTagAssignment.deleteMany({
    where: { contactId },
  });

  if (!tags.length) {
    return;
  }

  await tx.contactTagAssignment.createMany({
    data: tags.map((tag) => ({
      contactId,
      tagId: tag.id,
    })),
    skipDuplicates: true,
  });
}

async function replaceAdditionalContactMethods(
  tx: Prisma.TransactionClient,
  contactId: string,
  emails: ContactEmailMethod[],
  phones: ContactPhoneMethod[],
) {
  await Promise.all([
    tx.contactEmailAddress.deleteMany({ where: { contactId } }),
    tx.contactPhoneNumber.deleteMany({ where: { contactId } }),
  ]);

  await Promise.all([
    emails.length
      ? tx.contactEmailAddress.createMany({
          data: emails.map((method) => ({
            contactId,
            email: method.email,
            label: method.label,
          })),
          skipDuplicates: true,
        })
      : Promise.resolve(),
    phones.length
      ? tx.contactPhoneNumber.createMany({
          data: phones.map((method) => ({
            contactId,
            label: method.label,
            phone: method.phone,
            phoneNormalized: method.phoneNormalized,
          })),
          skipDuplicates: true,
        })
      : Promise.resolve(),
  ]);
}

export async function createContactAction(
  _: ContactActionState,
  formData: FormData,
): Promise<ContactActionState> {
  const user = await requireUser();

  const parsed = parseContact(formData);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the contact details." };
  }
  if (!parsed.data.leadSource) {
    return { ok: false, message: "Choose where the contact heard about us." };
  }

  const parsedAdditionalEmails = parseContactEmailMethodsFormValue(
    formString(formData, "additionalEmails"),
    parsed.data.email,
  );
  if (!parsedAdditionalEmails.ok) {
    return { ok: false, message: parsedAdditionalEmails.message };
  }

  const parsedAdditionalPhones = parseContactPhoneMethodsFormValue(
    formString(formData, "additionalPhones"),
    parsed.data.phone,
  );
  if (!parsedAdditionalPhones.ok) {
    return { ok: false, message: parsedAdditionalPhones.message };
  }

  const parsedTags = parseContactTags(formData);
  if (!parsedTags.ok) {
    return { ok: false, message: parsedTags.message };
  }

  const settings = await getCrmSettings();
  let createdContactId: string | null = null;
  let linkedCompanyId: string | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      const companyData = await resolveCompanyData(
        parsed.data.companyId,
        parsed.data.companyName,
        settings.companiesEnabled,
        user,
        tx,
      );
      linkedCompanyId = companyData.companyId;

      const contact = await tx.contact.create({
        data: {
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          email: parsed.data.email,
          phone: parsed.data.phone,
          phoneNormalized: normalizedContactPhone(parsed.data.phone),
          leadSource: parsed.data.leadSource,
          role: parsed.data.role,
          addressLine1: parsed.data.addressLine1,
          addressLine2: parsed.data.addressLine2,
          city: parsed.data.city,
          county: parsed.data.county,
          postcode: parsed.data.postcode,
          country: parsed.data.country,
          companyId: companyData.companyId,
          companyName: companyData.companyName,
          createdByUserId: user.id,
        },
        select: { id: true },
      });
      createdContactId = contact.id;

      await replaceContactTags(tx, contact.id, parsedTags.tagNames);
      await replaceAdditionalContactMethods(
        tx,
        contact.id,
        parsedAdditionalEmails.items,
        parsedAdditionalPhones.items,
      );
    });
  } catch (error) {
    if (error instanceof ContactActionError) {
      return { ok: false, message: error.message };
    }

    throw error;
  }

  revalidatePath("/contacts");
  revalidatePath("/clients");
  if (linkedCompanyId) {
    revalidatePath(`/clients/${linkedCompanyId}`);
  }
  return {
    contactId: createdContactId ?? undefined,
    ok: true,
    message: "Contact created.",
  };
}

export async function updateContactAction(
  _: ContactActionState,
  formData: FormData,
): Promise<ContactActionState> {
  const user = await requireUser();

  const parsed = parseContact(formData);
  if (!parsed.success || !parsed.data.id) {
    return { ok: false, message: parsed.success ? "Contact ID is missing." : parsed.error.issues[0]?.message };
  }

  const contactId = parsed.data.id;
  const contact = await prisma.contact.findFirst({
    where: contactIdAccessWhere(contactId, user),
    select: { companyId: true, id: true },
  });

  if (!contact) {
    return { ok: false, message: "Contact not found." };
  }

  const parsedAdditionalEmails = parseContactEmailMethodsFormValue(
    formString(formData, "additionalEmails"),
    parsed.data.email,
  );
  if (!parsedAdditionalEmails.ok) {
    return { ok: false, message: parsedAdditionalEmails.message };
  }

  const parsedAdditionalPhones = parseContactPhoneMethodsFormValue(
    formString(formData, "additionalPhones"),
    parsed.data.phone,
  );
  if (!parsedAdditionalPhones.ok) {
    return { ok: false, message: parsedAdditionalPhones.message };
  }

  const parsedTags = parseContactTags(formData);
  if (!parsedTags.ok) {
    return { ok: false, message: parsedTags.message };
  }

  const settings = await getCrmSettings();
  let linkedCompanyId: string | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      const companyData = await resolveCompanyData(
        parsed.data.companyId,
        parsed.data.companyName,
        settings.companiesEnabled,
        user,
        tx,
      );
      linkedCompanyId = companyData.companyId;

      await tx.contact.update({
        where: { id: contactId },
        data: {
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          email: parsed.data.email,
          phone: parsed.data.phone,
          phoneNormalized: normalizedContactPhone(parsed.data.phone),
          leadSource: parsed.data.leadSource,
          role: parsed.data.role,
          addressLine1: parsed.data.addressLine1,
          addressLine2: parsed.data.addressLine2,
          city: parsed.data.city,
          county: parsed.data.county,
          postcode: parsed.data.postcode,
          country: parsed.data.country,
          companyId: companyData.companyId,
          companyName: companyData.companyName,
        },
      });

      await replaceContactTags(tx, contactId, parsedTags.tagNames);
      await replaceAdditionalContactMethods(
        tx,
        contactId,
        parsedAdditionalEmails.items,
        parsedAdditionalPhones.items,
      );
    });
  } catch (error) {
    if (error instanceof ContactActionError) {
      return { ok: false, message: error.message };
    }

    throw error;
  }

  revalidatePath("/contacts");
  revalidatePath("/clients");
  revalidatePath(`/contacts/${contactId}`);
  if (contact.companyId) {
    revalidatePath(`/clients/${contact.companyId}`);
  }
  if (linkedCompanyId) {
    revalidatePath(`/clients/${linkedCompanyId}`);
  }
  return { ok: true, message: "Contact updated." };
}

export async function syncPipedriveContactDetailsAction(
  _: ContactActionState,
  formData: FormData,
): Promise<ContactActionState> {
  const user = await requireUser();

  if (user.role !== "ADMIN") {
    return {
      ok: false,
      message: "Only admins can pull Pipedrive contact details.",
    };
  }

  const contactId = String(formData.get("contactId") ?? "").trim();

  if (!contactId) {
    return { ok: false, message: "Contact is required." };
  }

  const contact = await prisma.contact.findFirst({
    where: contactIdAccessWhere(contactId, user),
    select: { id: true },
  });

  if (!contact) {
    return { ok: false, message: "Contact not found." };
  }

  const personLink = await prisma.externalRecordLink.findFirst({
    where: {
      externalType: "person",
      internalId: contact.id,
      internalType: "contact",
      provider: pipedriveProvider,
    },
    select: { externalId: true },
  });

  if (!personLink) {
    return {
      ok: false,
      message: "This contact is not linked to a Pipedrive person.",
    };
  }

  const result = await importPipedrivePersonIds({
    personIds: [personLink.externalId],
  });

  revalidatePath("/contacts");
  revalidatePath("/clients");
  revalidatePath(`/contacts/${contact.id}`);

  if (result.status === "not_configured") {
    return { ok: false, message: "Pipedrive is not configured." };
  }

  const personResult = result.results[0];
  const warning = personResult?.warnings.length
    ? ` ${personResult.warnings.join(" ")}`
    : "";

  if (!personResult || personResult.status === "skipped") {
    return {
      ok: false,
      message: `Pipedrive contact details could not be pulled.${warning}`,
    };
  }

  return {
    contactId: contact.id,
    ok: true,
    message: `Pulled Pipedrive contact details.${warning}`,
  };
}

export async function deleteContactAction(formData: FormData) {
  const user = await requireUser();

  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const redirectTo = String(formData.get("redirectTo") ?? "");

  const contact = await prisma.contact.findFirst({
    where: contactIdAccessWhere(id, user),
    select: { companyId: true, id: true },
  });

  if (!contact) {
    return;
  }

  await prisma.contact.delete({ where: { id: contact.id } });
  revalidatePath("/contacts");
  revalidatePath("/clients");
  if (contact.companyId) {
    revalidatePath(`/clients/${contact.companyId}`);
  }
  if (redirectTo === "/contacts") {
    redirect("/contacts");
  }
}

export async function mergeContactsAction(
  _: ContactMergeActionState,
  formData: FormData,
): Promise<ContactMergeActionState> {
  const user = await requireUser();
  const parsed = mergeContactsSchema.safeParse({
    primaryContactId: formData.get("primaryContactId"),
    duplicateContactId: formData.get("duplicateContactId"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Choose contacts to merge.",
    };
  }

  const { duplicateContactId, primaryContactId } = parsed.data;
  if (primaryContactId === duplicateContactId) {
    return { ok: false, message: "Choose a different contact to merge." };
  }

  const [primaryContact, duplicateContact] = await Promise.all([
    prisma.contact.findFirst({
      where: contactIdAccessWhere(primaryContactId, user),
      select: {
        additionalEmails: {
          orderBy: { createdAt: "asc" },
          select: { email: true, id: true, label: true },
        },
        additionalPhones: {
          orderBy: { createdAt: "asc" },
          select: { id: true, label: true, phone: true, phoneNormalized: true },
        },
        addressLine1: true,
        addressLine2: true,
        attribution: true,
        city: true,
        companyId: true,
        companyName: true,
        country: true,
        county: true,
        email: true,
        firstName: true,
        id: true,
        lastName: true,
        leadSource: true,
        phone: true,
        phoneNormalized: true,
        postcode: true,
        role: true,
      },
    }),
    prisma.contact.findFirst({
      where: contactIdAccessWhere(duplicateContactId, user),
      select: {
        additionalEmails: {
          orderBy: { createdAt: "asc" },
          select: { email: true, id: true, label: true },
        },
        additionalPhones: {
          orderBy: { createdAt: "asc" },
          select: { id: true, label: true, phone: true, phoneNormalized: true },
        },
        addressLine1: true,
        addressLine2: true,
        attribution: true,
        city: true,
        companyId: true,
        companyName: true,
        country: true,
        county: true,
        email: true,
        firstName: true,
        id: true,
        lastName: true,
        leadSource: true,
        phone: true,
        phoneNormalized: true,
        postcode: true,
        role: true,
      },
    }),
  ]);

  if (!primaryContact || !duplicateContact) {
    return { ok: false, message: "One of the selected contacts could not be found." };
  }

  const mergedEmail = optionalMergeValue(primaryContact.email, duplicateContact.email);
  const mergedPhone = optionalMergeValue(primaryContact.phone, duplicateContact.phone);
  const mergedAdditionalEmails = mergeContactEmailMethods({
    duplicateEmail: duplicateContact.email,
    duplicateMethods: duplicateContact.additionalEmails,
    mergedPrimaryEmail: mergedEmail,
    primaryMethods: primaryContact.additionalEmails,
  });
  const mergedAdditionalPhones = mergeContactPhoneMethods({
    duplicateMethods: duplicateContact.additionalPhones,
    duplicatePhone: duplicateContact.phone,
    mergedPrimaryPhone: mergedPhone,
    primaryMethods: primaryContact.additionalPhones,
  });

  await prisma.$transaction(async (tx) => {
    const duplicateTags = await tx.contactTagAssignment.findMany({
      where: { contactId: duplicateContactId },
      select: { tagId: true },
    });

    if (duplicateTags.length) {
      await tx.contactTagAssignment.createMany({
        data: duplicateTags.map((tag) => ({
          contactId: primaryContactId,
          tagId: tag.tagId,
        })),
        skipDuplicates: true,
      });
    }

    await Promise.all([
      tx.salesOpportunity.updateMany({
        where: { contactId: duplicateContactId },
        data: { contactId: primaryContactId },
      }),
      tx.salesCommunication.updateMany({
        where: { contactId: duplicateContactId },
        data: { contactId: primaryContactId },
      }),
      tx.emailMessage.updateMany({
        where: { contactId: duplicateContactId },
        data: { contactId: primaryContactId },
      }),
      tx.callLog.updateMany({
        where: { contactId: duplicateContactId },
        data: { contactId: primaryContactId },
      }),
      tx.callQueueEntry.updateMany({
        where: { contactId: duplicateContactId },
        data: { contactId: primaryContactId },
      }),
      tx.attributionRecord.updateMany({
        where: { contactId: duplicateContactId },
        data: { contactId: primaryContactId },
      }),
      tx.note.updateMany({
        where: { contactId: duplicateContactId },
        data: { contactId: primaryContactId },
      }),
      tx.task.updateMany({
        where: { contactId: duplicateContactId },
        data: { contactId: primaryContactId },
      }),
      tx.fileAsset.updateMany({
        where: { entityId: duplicateContactId, entityType: "Contact" },
        data: { entityId: primaryContactId },
      }),
    ]);

    await tx.contact.update({
      where: { id: primaryContactId },
      data: {
        addressLine1: optionalMergeValue(
          primaryContact.addressLine1,
          duplicateContact.addressLine1,
        ),
        addressLine2: optionalMergeValue(
          primaryContact.addressLine2,
          duplicateContact.addressLine2,
        ),
        aiGuidance: Prisma.JsonNull,
        aiGuidanceFingerprint: null,
        aiGuidanceGeneratedAt: null,
        attribution: optionalMergeJsonValue(
          primaryContact.attribution,
          duplicateContact.attribution,
        ),
        city: optionalMergeValue(primaryContact.city, duplicateContact.city),
        companyId: optionalMergeValue(primaryContact.companyId, duplicateContact.companyId),
        companyName: optionalMergeValue(
          primaryContact.companyName,
          duplicateContact.companyName,
        ),
        country: optionalMergeValue(primaryContact.country, duplicateContact.country),
        county: optionalMergeValue(primaryContact.county, duplicateContact.county),
        email: mergedEmail,
        leadSource: optionalMergeValue(
          primaryContact.leadSource,
          duplicateContact.leadSource,
        ),
        phone: mergedPhone,
        phoneNormalized: optionalMergeValue(
          primaryContact.phoneNormalized,
          duplicateContact.phoneNormalized,
        ),
        postcode: optionalMergeValue(primaryContact.postcode, duplicateContact.postcode),
        role: optionalMergeValue(primaryContact.role, duplicateContact.role),
      },
    });

    await replaceAdditionalContactMethods(
      tx,
      primaryContactId,
      mergedAdditionalEmails,
      mergedAdditionalPhones,
    );

    await tx.contact.delete({ where: { id: duplicateContactId } });
  });

  revalidatePath("/contacts");
  revalidatePath("/clients");
  revalidatePath(`/contacts/${primaryContactId}`);
  [primaryContact.companyId, duplicateContact.companyId]
    .filter((companyId): companyId is string => Boolean(companyId))
    .forEach((companyId) => revalidatePath(`/clients/${companyId}`));
  return {
    ok: true,
    message: `${duplicateContact.firstName} ${duplicateContact.lastName} merged into ${primaryContact.firstName} ${primaryContact.lastName}.`,
    primaryContactId,
  };
}
