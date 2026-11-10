"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import {
  contactImportMaxFileBytes,
  contactImportMaxRows,
  parseContactImportCsv,
  type ContactImportCandidate,
  type ContactImportIssue,
  type ContactImportType,
} from "@/lib/contacts/import";
import {
  normalizeContactCustomFieldOptions,
  parseContactCustomFieldSubmission,
  type ContactCustomFieldDefinition,
} from "@/lib/contacts/custom-fields";
import { normalizedContactPhone } from "@/lib/phone-normalization";
import { prisma } from "@/lib/prisma";
import { isLeadSourceValue } from "@/lib/sales/lead-sources";

export type ContactImportPreviewRow = {
  email: string | null;
  firstName: string;
  lastName: string;
  message: string;
  personType: string;
  rowNumber: number;
  status: "CREATE" | "ERROR" | "SKIP";
};

export type ContactImportState = {
  createdCount?: number;
  errors?: number;
  importPayload?: string;
  message: string;
  ok: boolean;
  readyCount?: number;
  rows?: ContactImportPreviewRow[];
  skipped?: number;
  totalRows?: number;
};

const nullableText = z.string().trim().max(10_000).nullable();
const contactImportPayloadSchema = z.array(
  z.object({
    addressLine1: nullableText,
    addressLine2: nullableText,
    city: nullableText,
    companyName: nullableText,
    contactTypeId: z.string().trim().min(1),
    contactTypeName: z.string().trim().min(1).max(120),
    contactTypeSlug: z.string().trim().min(1).max(80),
    country: nullableText,
    county: nullableText,
    customValues: z.record(z.string(), z.array(z.string().max(10_000)).max(50)),
    email: z.string().trim().email().nullable(),
    firstName: z.string().trim().min(1).max(120),
    lastName: z.string().trim().max(120),
    leadSource: z.string().trim().min(1).max(80),
    phone: z.string().trim().max(120).nullable(),
    postcode: nullableText,
    role: nullableText,
    rowNumber: z.number().int().positive(),
  }),
);

async function activeImportTypes(): Promise<ContactImportType[]> {
  const types = await prisma.contactType.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: {
      fields: {
        where: { isActive: true },
        orderBy: [{ displayOrder: "asc" }, { label: "asc" }],
        select: {
          contactTypeId: true,
          displayOrder: true,
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
        },
      },
      id: true,
      name: true,
      slug: true,
      systemKey: true,
    },
  });

  return types.map((type) => ({
    ...type,
    fields: type.fields.map((field) => ({
      ...field,
      options: normalizeContactCustomFieldOptions(field.options),
    })),
  }));
}

function customFormData(
  fields: ContactCustomFieldDefinition[],
  values: Record<string, string[]>,
) {
  const formData = new FormData();
  for (const field of fields) {
    for (const value of values[field.key] ?? []) {
      formData.append(`customField:${field.id}`, value);
    }
  }
  return formData;
}

function issueRow(issue: ContactImportIssue): ContactImportPreviewRow {
  return {
    email: issue.email,
    firstName: issue.firstName,
    lastName: issue.lastName,
    message: issue.reason,
    personType: issue.personType,
    rowNumber: issue.rowNumber,
    status: "ERROR",
  };
}

function identities(candidate: Pick<ContactImportCandidate, "email" | "phone">) {
  const phone = normalizedContactPhone(candidate.phone);
  return [
    ...(candidate.email ? [`email:${candidate.email.toLowerCase()}`] : []),
    ...(phone ? [`phone:${phone}`] : []),
  ];
}

function stateMessage(ready: number, skipped: number, errors: number) {
  return ready
    ? `${ready} person${ready === 1 ? "" : "s"} ready to import. ${skipped} skipped, ${errors} with errors.`
    : `No people are ready to import. ${skipped} skipped, ${errors} with errors.`;
}

export async function previewContactImportAction(
  _: ContactImportState,
  formData: FormData,
): Promise<ContactImportState> {
  await requireAdmin();
  const file = formData.get("contactCsv");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Upload a CSV file to preview." };
  }
  if (file.size > contactImportMaxFileBytes) {
    return { ok: false, message: "CSV file is too large. The limit is 2 MB." };
  }

  const types = await activeImportTypes();
  const parsed = parseContactImportCsv(await file.text(), types);
  const emails = parsed.candidates.flatMap((candidate) =>
    candidate.email ? [candidate.email] : [],
  );
  const phones = parsed.candidates.flatMap((candidate) => {
    const phone = normalizedContactPhone(candidate.phone);
    return phone ? [phone] : [];
  });
  const existing =
    emails.length || phones.length
      ? await prisma.contact.findMany({
          where: {
            OR: [
              ...(emails.length
                ? [{ email: { in: emails, mode: "insensitive" as const } }]
                : []),
              ...(phones.length ? [{ phoneNormalized: { in: phones } }] : []),
            ],
          },
          select: { email: true, phoneNormalized: true },
        })
      : [];
  const existingIdentities = new Set(
    existing.flatMap((contact) => [
      ...(contact.email ? [`email:${contact.email.toLowerCase()}`] : []),
      ...(contact.phoneNormalized ? [`phone:${contact.phoneNormalized}`] : []),
    ]),
  );
  const candidateRows = parsed.candidates.map((candidate) => {
    const exists = identities(candidate).some((value) =>
      existingIdentities.has(value),
    );
    return {
      email: candidate.email,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      message: exists ? "A matching person already exists." : "Ready to import.",
      personType: candidate.contactTypeName,
      rowNumber: candidate.rowNumber,
      status: exists ? ("SKIP" as const) : ("CREATE" as const),
    };
  });
  const rows = [...candidateRows, ...parsed.issues.map(issueRow)].sort(
    (left, right) => left.rowNumber - right.rowNumber,
  );
  const readyCandidates = parsed.candidates.filter(
    (candidate) =>
      !identities(candidate).some((value) => existingIdentities.has(value)),
  );
  const skipped = rows.filter((row) => row.status === "SKIP").length;
  const errors = rows.filter((row) => row.status === "ERROR").length;

  return {
    errors,
    importPayload: readyCandidates.length
      ? JSON.stringify(readyCandidates)
      : undefined,
    message: stateMessage(readyCandidates.length, skipped, errors),
    ok: true,
    readyCount: readyCandidates.length,
    rows,
    skipped,
    totalRows: parsed.totalRows,
  };
}

export async function importContactsAction(
  _: ContactImportState,
  formData: FormData,
): Promise<ContactImportState> {
  const admin = await requireAdmin();
  let payload: unknown;

  try {
    payload = JSON.parse(String(formData.get("importPayload") ?? ""));
  } catch {
    return { ok: false, message: "Preview the CSV again before importing." };
  }

  const parsed = contactImportPayloadSchema.safeParse(payload);
  if (!parsed.success || !parsed.data.length) {
    return { ok: false, message: "No valid people were selected for import." };
  }
  if (parsed.data.length > contactImportMaxRows) {
    return { ok: false, message: `Import ${contactImportMaxRows} people or fewer at once.` };
  }

  const types = await activeImportTypes();
  const typeById = new Map(types.map((type) => [type.id, type]));
  const validated: Array<{
    candidate: (typeof parsed.data)[number];
    customValues: ReturnType<typeof parseContactCustomFieldSubmission> & { ok: true };
    type: ContactImportType;
  }> = [];

  for (const candidate of parsed.data) {
    const type = typeById.get(candidate.contactTypeId);
    if (!type || type.slug !== candidate.contactTypeSlug) {
      return { ok: false, message: `Row ${candidate.rowNumber}: person type changed. Preview the CSV again.` };
    }
    if (!isLeadSourceValue(candidate.leadSource)) {
      return { ok: false, message: `Row ${candidate.rowNumber}: lead source is no longer valid.` };
    }
    if (!candidate.email && !candidate.phone) {
      return { ok: false, message: `Row ${candidate.rowNumber}: add an email address or phone number.` };
    }
    const knownKeys = new Set(type.fields.map((field) => field.key));
    if (Object.keys(candidate.customValues).some((key) => !knownKeys.has(key))) {
      return { ok: false, message: `Row ${candidate.rowNumber}: custom fields changed. Preview the CSV again.` };
    }
    const customValues = parseContactCustomFieldSubmission(
      type.fields,
      customFormData(type.fields, candidate.customValues),
    );
    if (!customValues.ok) {
      return { ok: false, message: `Row ${candidate.rowNumber}: ${customValues.message}` };
    }
    validated.push({ candidate, customValues, type });
  }

  const emails = validated.flatMap(({ candidate }) =>
    candidate.email ? [candidate.email.toLowerCase()] : [],
  );
  const phones = validated.flatMap(({ candidate }) => {
    const phone = normalizedContactPhone(candidate.phone);
    return phone ? [phone] : [];
  });
  const existing = await prisma.contact.findMany({
    where: {
      OR: [
        ...(emails.length
          ? [{ email: { in: emails, mode: "insensitive" as const } }]
          : []),
        ...(phones.length ? [{ phoneNormalized: { in: phones } }] : []),
      ],
    },
    select: { email: true, phoneNormalized: true },
  });
  const existingIdentities = new Set(
    existing.flatMap((contact) => [
      ...(contact.email ? [`email:${contact.email.toLowerCase()}`] : []),
      ...(contact.phoneNormalized ? [`phone:${contact.phoneNormalized}`] : []),
    ]),
  );
  const rowsToCreate = validated.filter(
    ({ candidate }) =>
      !identities(candidate).some((value) => existingIdentities.has(value)),
  );

  if (!rowsToCreate.length) {
    return { ok: false, message: "No people were created. Matching records already exist." };
  }

  await prisma.$transaction(async (tx) => {
    for (const { candidate, customValues, type } of rowsToCreate) {
      const contact = await tx.contact.create({
        data: {
          addressLine1: candidate.addressLine1,
          addressLine2: candidate.addressLine2,
          category: type.systemKey ?? "CONSUMER",
          city: candidate.city,
          companyName: candidate.companyName,
          contactTypeId: type.id,
          country: candidate.country,
          county: candidate.county,
          createdByUserId: admin.id,
          email: candidate.email?.toLowerCase() ?? null,
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          leadSource: candidate.leadSource,
          phone: candidate.phone,
          phoneNormalized: normalizedContactPhone(candidate.phone),
          postcode: candidate.postcode,
          role: candidate.role,
        },
        select: { id: true },
      });
      const populatedValues = customValues.values.filter(
        (value) =>
          value.booleanValue !== null ||
          value.dateValue !== null ||
          value.numberValue !== null ||
          value.textValue !== null ||
          (Array.isArray(value.jsonValue) && value.jsonValue.length > 0),
      );
      if (populatedValues.length) {
        await tx.contactCustomFieldValue.createMany({
          data: populatedValues.map((value) => ({
            booleanValue: value.booleanValue,
            contactId: contact.id,
            dateValue: value.dateValue,
            fieldId: value.fieldId,
            jsonValue: value.jsonValue,
            numberValue: value.numberValue,
            textValue: value.textValue,
          })),
        });
      }
    }

    await tx.auditLog.create({
      data: {
        action: "contacts.imported",
        actorId: admin.id,
        entity: "Contact",
        metadata: {
          createdCount: rowsToCreate.length,
          skippedCount: validated.length - rowsToCreate.length,
          typeCounts: Object.fromEntries(
            types.map((type) => [
              type.id,
              rowsToCreate.filter((row) => row.type.id === type.id).length,
            ]),
          ),
        },
      },
    });
  });

  revalidatePath("/contacts");
  return {
    createdCount: rowsToCreate.length,
    message: `${rowsToCreate.length} person${rowsToCreate.length === 1 ? "" : "s"} imported. ${validated.length - rowsToCreate.length} skipped because a matching person now exists.`,
    ok: true,
    skipped: validated.length - rowsToCreate.length,
  };
}
