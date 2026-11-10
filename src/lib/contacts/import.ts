import type { ContactCategoryValue } from "@/lib/contacts/categories";
import {
  parseContactCustomFieldSubmission,
  type ContactCustomFieldDefinition,
} from "@/lib/contacts/custom-fields";
import { parseCsv } from "@/lib/csv";
import { leadSourceValueFromText } from "@/lib/sales/lead-sources";
import { normalizedContactPhone } from "@/lib/phone-normalization";

export const contactImportMaxRows = 500;
export const contactImportMaxFileBytes = 2 * 1024 * 1024;

export type ContactImportType = {
  fields: ContactCustomFieldDefinition[];
  id: string;
  name: string;
  slug: string;
  systemKey: ContactCategoryValue | null;
};

export type ContactImportCandidate = {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  companyName: string | null;
  contactTypeId: string;
  contactTypeName: string;
  contactTypeSlug: string;
  country: string | null;
  county: string | null;
  customValues: Record<string, string[]>;
  email: string | null;
  firstName: string;
  lastName: string;
  leadSource: string;
  phone: string | null;
  postcode: string | null;
  role: string | null;
  rowNumber: number;
};

export type ContactImportIssue = {
  email: string | null;
  firstName: string;
  lastName: string;
  personType: string;
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

function customFieldFormData(
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

export function contactImportTemplateCsv(types: ContactImportType[]) {
  const customKeys = Array.from(
    new Set(types.flatMap((type) => type.fields.map((field) => field.key))),
  );
  const defaultType = types[0];
  const headers = [
    "personType",
    "firstName",
    "lastName",
    "email",
    "phone",
    "leadSource",
    "companyName",
    "role",
    "addressLine1",
    "addressLine2",
    "city",
    "county",
    "postcode",
    "country",
    ...customKeys.map((key) => `custom:${key}`),
  ];
  const example = [
    defaultType?.slug ?? "consumer",
    "Jane",
    "Smith",
    "jane.smith@example.com",
    "07123456789",
    "Referral",
    "Example Ltd",
    "Installer",
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

export function parseContactImportCsv(
  content: string,
  types: ContactImportType[],
) {
  const rows = parseCsv(content);
  const [headerRow, ...dataRows] = rows;
  const candidates: ContactImportCandidate[] = [];
  const issues: ContactImportIssue[] = [];

  if (!headerRow?.length) {
    return {
      candidates,
      issues: [{ email: null, firstName: "", lastName: "", personType: "", reason: "CSV needs a header row.", rowNumber: 1 }],
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
  const personTypeIndex = fieldIndex(headers, ["persontype", "type", "group"]);
  const firstNameIndex = fieldIndex(headers, ["firstname", "first"]);
  const lastNameIndex = fieldIndex(headers, ["lastname", "surname", "last"]);
  const emailIndex = fieldIndex(headers, ["email", "emailaddress"]);
  const phoneIndex = fieldIndex(headers, ["phone", "telephone", "mobile"]);
  const leadSourceIndex = fieldIndex(headers, ["leadsource", "source"]);

  if (personTypeIndex < 0 || firstNameIndex < 0 || leadSourceIndex < 0) {
    issues.push({
      email: null,
      firstName: "",
      lastName: "",
      personType: "",
      reason: "CSV needs personType, firstName and leadSource columns.",
      rowNumber: 1,
    });
  }
  if (unknownCustom) {
    issues.push({
      email: null,
      firstName: "",
      lastName: "",
      personType: "",
      reason: `Unknown custom field key: ${unknownCustom.key}.`,
      rowNumber: 1,
    });
  }

  const meaningfulRows = dataRows
    .map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(({ row }) => row.some((value) => value.trim()));

  if (meaningfulRows.length > contactImportMaxRows) {
    issues.push({
      email: null,
      firstName: "",
      lastName: "",
      personType: "",
      reason: `CSV contains ${meaningfulRows.length} rows. The limit is ${contactImportMaxRows}.`,
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

  for (const { row, rowNumber } of meaningfulRows.slice(0, contactImportMaxRows)) {
    const personTypeText = cell(row, personTypeIndex);
    const type = typeByIdentity.get(personTypeText.toLowerCase());
    const firstName = cell(row, firstNameIndex);
    const lastName = cell(row, lastNameIndex);
    const email = cell(row, emailIndex).toLowerCase() || null;
    const phone = cell(row, phoneIndex) || null;
    const leadSource = leadSourceValueFromText(cell(row, leadSourceIndex));
    const issueBase = {
      email,
      firstName,
      lastName,
      personType: personTypeText,
      rowNumber,
    };

    if (!type) {
      issues.push({ ...issueBase, reason: "Choose an active person type slug." });
      continue;
    }
    if (!firstName || (!lastName && type.systemKey !== "COMPANY")) {
      issues.push({ ...issueBase, reason: "First name and last name are required." });
      continue;
    }
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      issues.push({ ...issueBase, reason: "Enter a valid email address." });
      continue;
    }
    if (!email && !phone) {
      issues.push({ ...issueBase, reason: "Add an email address or phone number." });
      continue;
    }
    if (!leadSource) {
      issues.push({ ...issueBase, reason: "Use a supported lead source." });
      continue;
    }

    const normalizedPhone = normalizedContactPhone(phone);
    const identities = [
      ...(email ? [`email:${email}`] : []),
      ...(normalizedPhone ? [`phone:${normalizedPhone}`] : []),
    ];
    if (identities.some((identity) => seenIdentities.has(identity))) {
      issues.push({ ...issueBase, reason: "Duplicate person in this CSV." });
      continue;
    }

    const customValues = Object.fromEntries(
      customHeaders.map(({ index, key }) => {
        const rawValue = cell(row, index);
        const field = type.fields.find((candidate) => candidate.key === key);
        const values =
          field?.fieldType === "MULTI_SELECT"
            ? rawValue.split(/[|;]/)
            : [rawValue];

        return [
          key,
          values.map((value) => value.trim()).filter(Boolean),
        ];
      }),
    );
    const parsedCustom = parseContactCustomFieldSubmission(
      type.fields,
      customFieldFormData(type.fields, customValues),
    );
    if (!parsedCustom.ok) {
      issues.push({ ...issueBase, reason: parsedCustom.message });
      continue;
    }
    identities.forEach((identity) => seenIdentities.add(identity));

    const value = (name: string) => cell(row, fieldIndex(headers, [name])) || null;
    candidates.push({
      addressLine1: value("addressline1"),
      addressLine2: value("addressline2"),
      city: value("city"),
      companyName: value("companyname"),
      contactTypeId: type.id,
      contactTypeName: type.name,
      contactTypeSlug: type.slug,
      country: value("country"),
      county: value("county"),
      customValues,
      email,
      firstName,
      lastName,
      leadSource,
      phone,
      postcode: value("postcode"),
      role: value("role"),
      rowNumber,
    });
  }

  return { candidates, issues, totalRows: meaningfulRows.length };
}
