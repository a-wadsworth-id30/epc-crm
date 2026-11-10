import type {
  CompanyCustomFieldDefinition,
  CompanyCustomFieldFormValue,
} from "@/lib/companies/custom-fields";
import { hasContactCustomFieldFormValue } from "@/lib/contacts/profile-completeness";

export type CompanyProfileCompleteness = {
  completed: number;
  isComplete: boolean;
  isConfigured: boolean;
  missing: Array<{ fieldId: string; label: string }>;
  percentage: number;
  total: number;
};

export function companyProfileCompleteness({
  companyTypeId,
  definitions,
  values,
}: {
  companyTypeId: string | null;
  definitions: CompanyCustomFieldDefinition[];
  values: Record<string, CompanyCustomFieldFormValue>;
}): CompanyProfileCompleteness {
  const trackedFields = companyTypeId
    ? definitions.filter(
        (field) =>
          field.isActive &&
          field.companyTypeId === companyTypeId &&
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
