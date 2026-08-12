import {
  defaultRoleTemplateForRole,
  getUserRoleTemplate,
  normalizeRoleTemplate,
  type UserRoleTemplateKey,
} from "@/lib/users/role-templates";

export const bulkUserImportMaxRows = 500;
export const bulkUserImportMaxFileBytes = 1024 * 1024;
export const bulkUserImportTemplateCsv =
  "email,firstName,lastName,roleTemplate,mobile,landline\njane.smith@example.com,Jane,Smith,sales-user,07123456789,\n";

export type BulkUserImportCandidate = {
  email: string;
  firstName: string;
  landline: string | null;
  lastName: string;
  mobile: string | null;
  name: string;
  role: "ADMIN" | "USER";
  roleTemplate: UserRoleTemplateKey;
  rowNumber: number;
};

export type BulkUserImportIssue = {
  email?: string;
  firstName?: string;
  lastName?: string;
  reason: string;
  role?: string;
  roleTemplate?: string;
  rowNumber: number;
};

type ParsedCsv = {
  candidates: BulkUserImportCandidate[];
  issues: BulkUserImportIssue[];
  totalRows: number;
};

function parseCsv(content: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const nextCharacter = content[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += character;
  }

  if (currentCell || currentRow.length) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeCell(value: string | undefined) {
  return value?.trim() ?? "";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function splitName(value: string) {
  const [firstName = "", ...lastNameParts] = value.trim().split(/\s+/);

  return {
    firstName,
    lastName: lastNameParts.join(" "),
  };
}

function fieldIndex(headers: Map<string, number>, candidates: string[]) {
  for (const candidate of candidates) {
    const index = headers.get(candidate);

    if (typeof index === "number") {
      return index;
    }
  }

  return -1;
}

export function parseBulkUserImportCsv(content: string): ParsedCsv {
  const rows = parseCsv(content.replace(/^\uFEFF/, ""));
  const [headerRow, ...dataRows] = rows;
  const issues: BulkUserImportIssue[] = [];
  const candidates: BulkUserImportCandidate[] = [];
  const seenEmails = new Set<string>();

  if (!headerRow?.length) {
    return {
      candidates,
      issues: [{ reason: "CSV needs a header row.", rowNumber: 1 }],
      totalRows: 0,
    };
  }

  const headers = new Map(
    headerRow.map((header, index) => [normalizeHeader(header), index] as const),
  );
  const emailIndex = fieldIndex(headers, ["email", "emailaddress"]);
  const firstNameIndex = fieldIndex(headers, ["firstname", "first"]);
  const lastNameIndex = fieldIndex(headers, ["lastname", "surname", "last"]);
  const nameIndex = fieldIndex(headers, ["name", "fullname", "full"]);
  const roleIndex = fieldIndex(headers, ["role", "permission", "permissions"]);
  const roleTemplateIndex = fieldIndex(headers, [
    "roletemplate",
    "template",
    "profile",
    "userprofile",
  ]);
  const mobileIndex = fieldIndex(headers, ["mobile", "mobilenumber", "phone"]);
  const landlineIndex = fieldIndex(headers, [
    "landline",
    "landlinenumber",
    "telephone",
  ]);

  if (emailIndex === -1) {
    issues.push({ reason: "CSV needs an email column.", rowNumber: 1 });
  }

  if (
    firstNameIndex === -1 &&
    lastNameIndex === -1 &&
    nameIndex === -1
  ) {
    issues.push({
      reason: "CSV needs firstName/lastName columns or a name column.",
      rowNumber: 1,
    });
  }

  const meaningfulRows = dataRows
    .map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(({ row }) => row.some((cell) => cell.trim().length > 0));

  if (meaningfulRows.length > bulkUserImportMaxRows) {
    issues.push({
      reason: `CSV contains ${meaningfulRows.length} rows. The limit is ${bulkUserImportMaxRows}.`,
      rowNumber: 1,
    });
  }

  if (issues.length) {
    return {
      candidates,
      issues,
      totalRows: meaningfulRows.length,
    };
  }

  meaningfulRows.slice(0, bulkUserImportMaxRows).forEach(({ row, rowNumber }) => {
    const email = normalizeCell(row[emailIndex]).toLowerCase();
    let firstName = normalizeCell(row[firstNameIndex]);
    let lastName = normalizeCell(row[lastNameIndex]);
    const fullName = normalizeCell(row[nameIndex]);
    const rawRole = normalizeCell(row[roleIndex]);
    const rawRoleTemplate = normalizeCell(row[roleTemplateIndex]);
    const explicitRole = rawRole ? rawRole.toUpperCase() : "";
    const normalizedRoleTemplate =
      normalizeRoleTemplate(rawRoleTemplate) ??
      (explicitRole && !["ADMIN", "USER"].includes(explicitRole)
        ? normalizeRoleTemplate(explicitRole)
        : null);
    const template = normalizedRoleTemplate
      ? getUserRoleTemplate(normalizedRoleTemplate)
      : null;
    const role = template?.baseRole ?? (explicitRole || "USER");
    const roleTemplate =
      template?.key ?? defaultRoleTemplateForRole(role as "ADMIN" | "USER");
    const mobile = normalizeCell(row[mobileIndex]) || null;
    const landline = normalizeCell(row[landlineIndex]) || null;

    if ((!firstName || !lastName) && fullName) {
      const split = splitName(fullName);
      firstName ||= split.firstName;
      lastName ||= split.lastName;
    }

    const rowIssue: BulkUserImportIssue = {
      email,
      firstName,
      lastName,
      role,
      roleTemplate: rawRoleTemplate || normalizedRoleTemplate || roleTemplate,
      reason: "",
      rowNumber,
    };

    if (!email || !isValidEmail(email)) {
      issues.push({ ...rowIssue, reason: "Enter a valid email address." });
      return;
    }

    if (seenEmails.has(email)) {
      issues.push({
        ...rowIssue,
        reason: "Duplicate email in this CSV.",
      });
      return;
    }

    if (!firstName || !lastName) {
      issues.push({
        ...rowIssue,
        reason: "First name and last name are required.",
      });
      seenEmails.add(email);
      return;
    }

    if (role !== "ADMIN" && role !== "USER") {
      issues.push({
        ...rowIssue,
        reason:
          "Role must be USER/ADMIN or use a supported roleTemplate such as sales-user.",
      });
      seenEmails.add(email);
      return;
    }

    if (rawRoleTemplate && !template) {
      issues.push({
        ...rowIssue,
        reason: "Role template is not recognised.",
      });
      seenEmails.add(email);
      return;
    }

    seenEmails.add(email);
    candidates.push({
      email,
      firstName,
      landline,
      lastName,
      mobile,
      name: `${firstName} ${lastName}`.trim(),
      role,
      roleTemplate,
      rowNumber,
    });
  });

  return {
    candidates,
    issues,
    totalRows: meaningfulRows.length,
  };
}
