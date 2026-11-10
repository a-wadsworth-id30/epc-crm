"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import {
  companyImportIdentity,
  companyImportMaxFileBytes,
  companyImportMaxRows,
  companyImportStatuses,
  normalizeCompanyImportDomain,
  parseCompanyImportCsv,
  type CompanyImportCandidate,
  type CompanyImportIssue,
  type CompanyImportType,
} from "@/lib/companies/import";
import {
  parseCompanyCustomFieldSubmission,
  type CompanyCustomFieldDefinition,
} from "@/lib/companies/custom-fields";
import { normalizeContactCustomFieldOptions } from "@/lib/contacts/custom-fields";
import { prisma } from "@/lib/prisma";

export type CompanyImportPreviewRow = {
  companyType: string;
  domain: string | null;
  message: string;
  name: string;
  rowNumber: number;
  status: "CREATE" | "ERROR" | "SKIP";
};

export type CompanyImportState = {
  createdCount?: number;
  errors?: number;
  importPayload?: string;
  message: string;
  ok: boolean;
  readyCount?: number;
  rows?: CompanyImportPreviewRow[];
  skipped?: number;
  totalRows?: number;
};

const nullableText = z.string().trim().max(10_000).nullable();
const companyImportPayloadSchema = z.array(
  z.object({
    addressLine1: nullableText,
    addressLine2: nullableText,
    city: nullableText,
    companyTypeId: z.string().trim().min(1),
    companyTypeName: z.string().trim().min(1).max(120),
    companyTypeSlug: z.string().trim().min(1).max(80),
    country: nullableText,
    county: nullableText,
    customValues: z.record(z.string(), z.array(z.string().max(10_000)).max(50)),
    domain: z.string().trim().max(255).nullable(),
    name: z.string().trim().min(1).max(255),
    owner: nullableText,
    postcode: nullableText,
    rowNumber: z.number().int().positive(),
    status: z.enum(companyImportStatuses),
  }),
);

async function activeImportTypes(): Promise<CompanyImportType[]> {
  const types = await prisma.companyType.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: {
      fields: {
        where: { isActive: true },
        orderBy: [{ displayOrder: "asc" }, { label: "asc" }],
        select: {
          companyTypeId: true,
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
  fields: CompanyCustomFieldDefinition[],
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

function issueRow(issue: CompanyImportIssue): CompanyImportPreviewRow {
  return {
    companyType: issue.companyType,
    domain: issue.domain,
    message: issue.reason,
    name: issue.name,
    rowNumber: issue.rowNumber,
    status: "ERROR",
  };
}

function existingCompanyIdentities(
  companies: Array<{ domain: string | null; name: string }>,
) {
  return new Set(
    companies.flatMap((company) => {
      const domain = normalizeCompanyImportDomain(company.domain);
      return [
        `name:${company.name.trim().toLowerCase().replace(/\s+/g, " ")}`,
        ...(domain ? [`domain:${domain}`] : []),
      ];
    }),
  );
}

async function matchingCompanies(candidates: CompanyImportCandidate[]) {
  const domains = candidates.flatMap((candidate) =>
    candidate.domain ? [candidate.domain] : [],
  );
  const names = candidates
    .filter((candidate) => !candidate.domain)
    .map((candidate) => candidate.name);
  if (!domains.length && !names.length) return [];
  return prisma.company.findMany({
    where: {
      OR: [
        ...(domains.length
          ? [{ domain: { in: domains, mode: "insensitive" as const } }]
          : []),
        ...(names.length
          ? [{ name: { in: names, mode: "insensitive" as const } }]
          : []),
      ],
    },
    select: { domain: true, name: true },
  });
}

function stateMessage(ready: number, skipped: number, errors: number) {
  return ready
    ? `${ready} compan${ready === 1 ? "y" : "ies"} ready to import. ${skipped} skipped, ${errors} with errors.`
    : `No companies are ready to import. ${skipped} skipped, ${errors} with errors.`;
}

export async function previewCompanyImportAction(
  _: CompanyImportState,
  formData: FormData,
): Promise<CompanyImportState> {
  await requireAdmin();
  const file = formData.get("companyCsv");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Upload a CSV file to preview." };
  }
  if (file.size > companyImportMaxFileBytes) {
    return { ok: false, message: "CSV file is too large. The limit is 2 MB." };
  }

  const types = await activeImportTypes();
  const parsed = parseCompanyImportCsv(await file.text(), types);
  const existingIdentities = existingCompanyIdentities(
    await matchingCompanies(parsed.candidates),
  );
  const candidateRows = parsed.candidates.map((candidate) => {
    const exists = existingIdentities.has(companyImportIdentity(candidate));
    return {
      companyType: candidate.companyTypeName,
      domain: candidate.domain,
      message: exists ? "A matching company already exists." : "Ready to import.",
      name: candidate.name,
      rowNumber: candidate.rowNumber,
      status: exists ? ("SKIP" as const) : ("CREATE" as const),
    };
  });
  const rows = [...candidateRows, ...parsed.issues.map(issueRow)].sort(
    (left, right) => left.rowNumber - right.rowNumber,
  );
  const readyCandidates = parsed.candidates.filter(
    (candidate) => !existingIdentities.has(companyImportIdentity(candidate)),
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

export async function importCompaniesAction(
  _: CompanyImportState,
  formData: FormData,
): Promise<CompanyImportState> {
  const admin = await requireAdmin();
  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("importPayload") ?? ""));
  } catch {
    return { ok: false, message: "Preview the CSV again before importing." };
  }
  const parsed = companyImportPayloadSchema.safeParse(payload);
  if (!parsed.success || !parsed.data.length) {
    return { ok: false, message: "No valid companies were selected for import." };
  }
  if (parsed.data.length > companyImportMaxRows) {
    return { ok: false, message: `Import ${companyImportMaxRows} companies or fewer at once.` };
  }
  const submittedIdentities = parsed.data.map(companyImportIdentity);
  if (new Set(submittedIdentities).size !== submittedIdentities.length) {
    return { ok: false, message: "The confirmed import contains duplicate companies. Preview the CSV again." };
  }

  const types = await activeImportTypes();
  const typeById = new Map(types.map((type) => [type.id, type]));
  const validated: Array<{
    candidate: (typeof parsed.data)[number];
    customValues: ReturnType<typeof parseCompanyCustomFieldSubmission> & { ok: true };
    type: CompanyImportType;
  }> = [];
  for (const candidate of parsed.data) {
    const type = typeById.get(candidate.companyTypeId);
    if (!type || type.slug !== candidate.companyTypeSlug) {
      return { ok: false, message: `Row ${candidate.rowNumber}: company type changed. Preview the CSV again.` };
    }
    const knownKeys = new Set(type.fields.map((field) => field.key));
    if (Object.keys(candidate.customValues).some((key) => !knownKeys.has(key))) {
      return { ok: false, message: `Row ${candidate.rowNumber}: custom fields changed. Preview the CSV again.` };
    }
    const customValues = parseCompanyCustomFieldSubmission(
      type.fields,
      customFormData(type.fields, candidate.customValues),
    );
    if (!customValues.ok) {
      return { ok: false, message: `Row ${candidate.rowNumber}: ${customValues.message}` };
    }
    validated.push({ candidate, customValues, type });
  }

  const existingIdentities = existingCompanyIdentities(
    await matchingCompanies(validated.map(({ candidate }) => candidate)),
  );
  const rowsToCreate = validated.filter(
    ({ candidate }) => !existingIdentities.has(companyImportIdentity(candidate)),
  );
  if (!rowsToCreate.length) {
    return { ok: false, message: "No companies were created. Matching records already exist." };
  }

  await prisma.$transaction(async (tx) => {
    for (const { candidate, customValues } of rowsToCreate) {
      const company = await tx.company.create({
        data: {
          addressLine1: candidate.addressLine1,
          addressLine2: candidate.addressLine2,
          city: candidate.city,
          companyTypeId: candidate.companyTypeId,
          country: candidate.country,
          county: candidate.county,
          createdByUserId: admin.id,
          domain: normalizeCompanyImportDomain(candidate.domain),
          name: candidate.name,
          owner: candidate.owner,
          postcode: candidate.postcode,
          status: candidate.status,
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
        await tx.companyCustomFieldValue.createMany({
          data: populatedValues.map((value) => ({
            booleanValue: value.booleanValue,
            companyId: company.id,
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
        action: "companies.imported",
        actorId: admin.id,
        entity: "Company",
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

  revalidatePath("/clients");
  return {
    createdCount: rowsToCreate.length,
    message: `${rowsToCreate.length} compan${rowsToCreate.length === 1 ? "y" : "ies"} imported. ${validated.length - rowsToCreate.length} skipped because a matching company now exists.`,
    ok: true,
    skipped: validated.length - rowsToCreate.length,
  };
}
