export const defaultCompanyColumnIds = [
  "name",
  "type",
  "domain",
  "status",
  "owner",
  "city",
  "contacts",
  "activity",
] as const;

export type CompanyTableFieldDefinition = {
  companyTypeId: string;
  id: string;
  showInTable: boolean;
};

const customColumnPrefix = "custom:";

export function companyCustomTableColumnId(fieldId: string) {
  return `${customColumnPrefix}${fieldId}`;
}

export function companyTableCustomFields<TField extends CompanyTableFieldDefinition>({
  activeCompanyTypeId,
  fields,
}: {
  activeCompanyTypeId: string | null;
  fields: TField[];
}) {
  if (!activeCompanyTypeId) return [];
  return fields.filter(
    (field) =>
      field.showInTable && field.companyTypeId === activeCompanyTypeId,
  );
}

export function companyTableColumnIds(fields: CompanyTableFieldDefinition[]) {
  return [
    ...defaultCompanyColumnIds,
    ...fields.map((field) => companyCustomTableColumnId(field.id)),
  ];
}

export function parseVisibleCompanyColumnIds({
  availableColumnIds,
  value,
}: {
  availableColumnIds: string[];
  value: string | null;
}) {
  if (!value) return [...availableColumnIds];
  const available = new Set(availableColumnIds);
  const selected = new Set(
    value.split(",").map((id) => id.trim()).filter((id) => available.has(id)),
  );
  selected.add("name");
  return availableColumnIds.filter((id) => selected.has(id));
}

export function companyCustomFieldDisplayValue(
  value: string | string[] | boolean | null | undefined,
) {
  if (value === null || value === undefined || value === "") return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "Not set";
  return value;
}
