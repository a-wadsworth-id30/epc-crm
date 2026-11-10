import {
  parseCompanyCustomFieldSubmission,
  type CompanyCustomFieldDefinition,
} from "@/lib/companies/custom-fields";
import { parseCsv } from "@/lib/csv";

export const companyImportMaxRows = 500;
export const companyImportMaxFileBytes = 2 * 1024 * 1024;
export const companyImportStatuses = ["Prospect", "Active", "Inactive"] as const;

export type CompanyImportType = {
  fields: CompanyCustomFieldDefinition[];
  id: string;
  name: string;
  slug: string;
};

export type CompanyImportCandidate = {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  companyTypeId: string;
  companyTypeName: string;
  companyTypeSlug: string;
  country: string | null;
  county: string | null;
  customValues: Record<string, string[]>;
  domain: string | null;
  name: string;
  owner: string | null;
  postcode: string | null;
  rowNumber: number;
  status: (typeof companyImportStatuses)[number];
};

export type CompanyImportIssue = {
  companyType: string;
  domain: string | null;
  name: string;
  reason: string;
  rowNumber: number;
};

function normalizedHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizedKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function fieldIndex(headers: Map<string, number>, names: string[]) {
  for (const name of names) {
    const index = headers.get(name);
    if (index !== undefined) return index;
  }
  return -1;
}

function cell(row: string[], index: number) {
  return index < 0 ? "" : (row[index]?.trim() ?? "");
}

export function normalizeCompanyImportDomain(value: string | null) {
  if (!value) return null;
  const withoutProtocol = value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "");
  return withoutProtocol.split("/")[0]?.trim().toLowerCase() || null;
}

export function companyImportIdentity({
  domain,
  name,
}: Pick<CompanyImportCandidate, "domain" | "name">) {
  const normalizedDomain = normalizeCompanyImportDomain(domain);
  if (normalizedDomain) return `domain:${normalizedDomain}`;
  return `name:${name.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

function customFieldFormData(
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

export function companyImportTemplateCsv(types: CompanyImportType[]) {
  const customKeys = Array.from(
    new Set(types.flatMap((type) => type.fields.map((field) => field.key))),
  );
  const defaultType = types[0];
  const headers = [
    "companyType",
    "name",
    "domain",
    "status",
    "owner",
    "addressLine1",
    "addressLine2",
    "city",
    "county",
    "postcode",
    "country",
    ...customKeys.map((key) => `custom:${key}`),
  ];
  const example = [
    defaultType?.slug ?? "customer",
    "Example Ltd",
    "example.com",
    "Prospect",
    "",
    "1 Example Street",
    "",
    "Huddersfield",
    "West Yorkshire",
    "HD1 1AA",
    "United Kingdom",
    ...customKeys.map(() => ""),
  ];
  return `${headers.join(",")}\n${example.join(",")}\n`;
}

export function parseCompanyImportCsv(
  content: string,
  types: CompanyImportType[],
) {
  const rows = parseCsv(content);
  const [headerRow, ...dataRows] = rows;
  const candidates: CompanyImportCandidate[] = [];
  const issues: CompanyImportIssue[] = [];

  if (!headerRow?.length) {
    return {
      candidates,
      issues: [{ companyType: "", domain: null, name: "", reason: "CSV needs a header row.", rowNumber: 1 }],
      totalRows: 0,
    };
  }

  const headers = new Map(
    headerRow.map((header, index) => [normalizedHeader(header), index] as const),
  );
  const customHeaders = headerRow.flatMap((header, index) => {
    const match = header.trim().match(/^custom:(.+)$/i);
    const key = match?.[1] ? normalizedKey(match[1]) : "";
    return key ? [{ index, key }] : [];
  });
  const knownCustomKeys = new Set(
    types.flatMap((type) => type.fields.map((field) => field.key)),
  );
  const unknownCustom = customHeaders.find(
    (header) => !knownCustomKeys.has(header.key),
  );
  const companyTypeIndex = fieldIndex(headers, ["companytype", "type", "group"]);
  const nameIndex = fieldIndex(headers, ["name", "companyname"]);
  const domainIndex = fieldIndex(headers, ["domain", "website"]);
  const statusIndex = fieldIndex(headers, ["status", "lifecyclestatus"]);

  if (companyTypeIndex < 0 || nameIndex < 0) {
    issues.push({
      companyType: "",
      domain: null,
      name: "",
      reason: "CSV needs companyType and name columns.",
      rowNumber: 1,
    });
  }
  if (unknownCustom) {
    issues.push({
      companyType: "",
      domain: null,
      name: "",
      reason: `Unknown custom field key: ${unknownCustom.key}.`,
      rowNumber: 1,
    });
  }

  const meaningfulRows = dataRows
    .map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(({ row }) => row.some((value) => value.trim()));
  if (meaningfulRows.length > companyImportMaxRows) {
    issues.push({
      companyType: "",
      domain: null,
      name: "",
      reason: `CSV contains ${meaningfulRows.length} rows. The limit is ${companyImportMaxRows}.`,
      rowNumber: 1,
    });
  }
  if (issues.length) return { candidates, issues, totalRows: meaningfulRows.length };

  const typeByIdentity = new Map(
    types.flatMap((type) => [
      [type.slug.toLowerCase(), type] as const,
      [type.name.toLowerCase(), type] as const,
    ]),
  );
  const seenIdentities = new Set<string>();

  for (const { row, rowNumber } of meaningfulRows.slice(0, companyImportMaxRows)) {
    const companyTypeText = cell(row, companyTypeIndex);
    const type = typeByIdentity.get(companyTypeText.toLowerCase());
    const name = cell(row, nameIndex);
    const domain = normalizeCompanyImportDomain(cell(row, domainIndex) || null);
    const statusText = cell(row, statusIndex) || "Prospect";
    const issueBase = { companyType: companyTypeText, domain, name, rowNumber };

    if (!type) {
      issues.push({ ...issueBase, reason: "Choose an active company type slug." });
      continue;
    }
    if (!name) {
      issues.push({ ...issueBase, reason: "Company name is required." });
      continue;
    }
    const status = companyImportStatuses.find(
      (value) => value.toLowerCase() === statusText.toLowerCase(),
    );
    if (!status) {
      issues.push({ ...issueBase, reason: "Status must be Prospect, Active or Inactive." });
      continue;
    }

    const invalidCustomHeader = customHeaders.find(
      ({ index, key }) => cell(row, index) && !type.fields.some((field) => field.key === key),
    );
    if (invalidCustomHeader) {
      issues.push({
        ...issueBase,
        reason: `Custom field ${invalidCustomHeader.key} is not available for ${type.name}.`,
      });
      continue;
    }
    const customValues = Object.fromEntries(
      customHeaders
        .filter(({ key }) => type.fields.some((field) => field.key === key))
        .map(({ index, key }) => {
          const rawValue = cell(row, index);
          const field = type.fields.find((candidate) => candidate.key === key);
          const values = field?.fieldType === "MULTI_SELECT"
            ? rawValue.split(/[|;]/)
            : [rawValue];
          return [key, values.map((value) => value.trim()).filter(Boolean)];
        }),
    );
    const parsedCustom = parseCompanyCustomFieldSubmission(
      type.fields,
      customFieldFormData(type.fields, customValues),
    );
    if (!parsedCustom.ok) {
      issues.push({ ...issueBase, reason: parsedCustom.message });
      continue;
    }

    const candidate: CompanyImportCandidate = {
      addressLine1: cell(row, fieldIndex(headers, ["addressline1"])) || null,
      addressLine2: cell(row, fieldIndex(headers, ["addressline2"])) || null,
      city: cell(row, fieldIndex(headers, ["city"])) || null,
      companyTypeId: type.id,
      companyTypeName: type.name,
      companyTypeSlug: type.slug,
      country: cell(row, fieldIndex(headers, ["country"])) || null,
      county: cell(row, fieldIndex(headers, ["county"])) || null,
      customValues,
      domain,
      name,
      owner: cell(row, fieldIndex(headers, ["owner"])) || null,
      postcode: cell(row, fieldIndex(headers, ["postcode"])) || null,
      rowNumber,
      status,
    };
    const identity = companyImportIdentity(candidate);
    if (seenIdentities.has(identity)) {
      issues.push({ ...issueBase, reason: "Duplicate company in this CSV." });
      continue;
    }
    seenIdentities.add(identity);
    candidates.push(candidate);
  }

  return { candidates, issues, totalRows: meaningfulRows.length };
}
