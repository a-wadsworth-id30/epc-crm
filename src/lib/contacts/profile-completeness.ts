import type {
  ContactCustomFieldDefinition,
  ContactCustomFieldFormValue,
} from "@/lib/contacts/custom-fields";

export type ContactProfileCompleteness = {
  completed: number;
  isComplete: boolean;
  isConfigured: boolean;
  missing: Array<{ fieldId: string; label: string }>;
  percentage: number;
  total: number;
};

export function hasContactCustomFieldFormValue(
  value: ContactCustomFieldFormValue | undefined,
) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "boolean") return true;
  return typeof value === "string" && value.trim().length > 0;
}

export function contactProfileCompleteness({
  contactTypeId,
  definitions,
  values,
}: {
  contactTypeId: string | null;
  definitions: ContactCustomFieldDefinition[];
  values: Record<string, ContactCustomFieldFormValue>;
}): ContactProfileCompleteness {
  const trackedFields = contactTypeId
    ? definitions.filter(
        (field) =>
          field.isActive &&
          field.contactTypeId === contactTypeId &&
          field.requirementMode !== "OPTIONAL",
      )
    : [];
  const missing = trackedFields
    .filter((field) => !hasContactCustomFieldFormValue(values[field.id]))
    .map((field) => ({ fieldId: field.id, label: field.label }));
  const total = trackedFields.length;
  const completed = total - missing.length;

  return {
    completed,
    isComplete: total > 0 && missing.length === 0,
    isConfigured: total > 0,
    missing,
    percentage: total ? Math.round((completed / total) * 100) : 0,
    total,
  };
}
