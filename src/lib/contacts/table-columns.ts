export const defaultContactColumnIds = [
  "name",
  "company",
  "category",
  "role",
  "source",
  "email",
  "phone",
  "tags",
] as const;

export const optionalContactColumnIds = ["address"] as const;

export type ContactTableFieldDefinition = {
  contactTypeId: string;
  id: string;
  showInTable: boolean;
};

const customColumnPrefix = "custom:";

export function contactCustomTableColumnId(fieldId: string) {
  return `${customColumnPrefix}${fieldId}`;
}

export function contactTableCustomFields<TField extends ContactTableFieldDefinition>({
  activeContactTypeId,
  fields,
}: {
  activeContactTypeId: string | null;
  fields: TField[];
}) {
  return fields.filter(
    (field) =>
      field.showInTable &&
      (!activeContactTypeId || field.contactTypeId === activeContactTypeId),
  );
}

export function contactTableColumnIds(fields: ContactTableFieldDefinition[]) {
  return [
    ...defaultContactColumnIds,
    ...optionalContactColumnIds,
    ...fields.map((field) => contactCustomTableColumnId(field.id)),
  ];
}

export function defaultVisibleContactColumnIds(
  fields: ContactTableFieldDefinition[],
) {
  return [
    ...defaultContactColumnIds,
    ...fields.map((field) => contactCustomTableColumnId(field.id)),
  ];
}

export function parseVisibleContactColumnIds({
  availableColumnIds,
  defaultColumnIds,
  value,
}: {
  availableColumnIds: string[];
  defaultColumnIds: string[];
  value: string | null;
}) {
  if (!value) return [...defaultColumnIds];

  const available = new Set(availableColumnIds);
  const selected = new Set(
    value
      .split(",")
      .map((columnId) => columnId.trim())
      .filter((columnId) => available.has(columnId)),
  );
  selected.add("name");

  return availableColumnIds.filter((columnId) => selected.has(columnId));
}

export function serializeVisibleContactColumnIds({
  availableColumnIds,
  defaultColumnIds,
  selectedColumnIds,
}: {
  availableColumnIds: string[];
  defaultColumnIds: string[];
  selectedColumnIds: string[];
}) {
  const normalized = parseVisibleContactColumnIds({
    availableColumnIds,
    defaultColumnIds,
    value: selectedColumnIds.join(","),
  });
  const defaults = new Set(defaultColumnIds);
  const isDefault =
    normalized.length === defaultColumnIds.length &&
    normalized.every((columnId) => defaults.has(columnId));

  return isDefault ? null : normalized.join(",");
}

export function contactCustomFieldDisplayValue(
  value: string | string[] | boolean | null | undefined,
) {
  if (value === null || value === undefined || value === "") return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "Not set";
  return value;
}
