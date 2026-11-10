import { ContactCustomFieldType, Prisma } from "@prisma/client";

export type CompanyFilterFieldDefinition = {
  fieldType: ContactCustomFieldType;
  id: string;
  options: string[];
};

export type CompanyCustomFieldFilterValue =
  | string
  | string[]
  | { from?: string; to?: string };

export type CompanyCustomFieldFilterValues = Record<
  string,
  CompanyCustomFieldFilterValue
>;

const parameterPrefix = "companyField.";
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const structuredFieldTypes = new Set<ContactCustomFieldType>([
  ContactCustomFieldType.SINGLE_SELECT,
  ContactCustomFieldType.MULTI_SELECT,
  ContactCustomFieldType.BOOLEAN,
  ContactCustomFieldType.DATE,
]);

export function isStructuredCompanyFilterField(
  field: CompanyFilterFieldDefinition,
) {
  return structuredFieldTypes.has(field.fieldType);
}

function parameterName(fieldId: string, suffix?: "from" | "to") {
  return `${parameterPrefix}${fieldId}${suffix ? `.${suffix}` : ""}`;
}

function validDate(value: string | null) {
  return value && datePattern.test(value) ? value : undefined;
}

export function parseCompanyCustomFieldFilters(
  params: URLSearchParams,
  fields: CompanyFilterFieldDefinition[],
) {
  const values: CompanyCustomFieldFilterValues = {};

  for (const field of fields.filter(isStructuredCompanyFilterField)) {
    if (field.fieldType === ContactCustomFieldType.DATE) {
      const from = validDate(params.get(parameterName(field.id, "from")));
      const to = validDate(params.get(parameterName(field.id, "to")));
      if (from || to) values[field.id] = { from, to };
      continue;
    }
    if (field.fieldType === ContactCustomFieldType.BOOLEAN) {
      const value = params.get(parameterName(field.id));
      if (value === "true" || value === "false") values[field.id] = value;
      continue;
    }
    const selected = params
      .getAll(parameterName(field.id))
      .filter((value) => field.options.includes(value));
    if (!selected.length) continue;
    values[field.id] =
      field.fieldType === ContactCustomFieldType.MULTI_SELECT
        ? Array.from(new Set(selected))
        : selected[0];
  }

  return values;
}

export function writeCompanyCustomFieldFilterParams(
  params: URLSearchParams,
  values: CompanyCustomFieldFilterValues,
) {
  Array.from(params.keys())
    .filter((key) => key.startsWith(parameterPrefix))
    .forEach((key) => params.delete(key));

  for (const [fieldId, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      value.filter(Boolean).forEach((item) =>
        params.append(parameterName(fieldId), item),
      );
    } else if (typeof value === "object") {
      if (value.from) params.set(parameterName(fieldId, "from"), value.from);
      if (value.to) params.set(parameterName(fieldId, "to"), value.to);
    } else if (value && value !== "all") {
      params.set(parameterName(fieldId), value);
    }
  }
}

export function companyCustomFieldFiltersWhere(
  values: CompanyCustomFieldFilterValues,
  fields: CompanyFilterFieldDefinition[],
): Prisma.CompanyWhereInput | undefined {
  const fieldById = new Map(fields.map((field) => [field.id, field]));
  const conditions: Prisma.CompanyWhereInput[] = [];

  for (const [fieldId, value] of Object.entries(values)) {
    const field = fieldById.get(fieldId);
    if (!field || !isStructuredCompanyFilterField(field)) continue;

    let valueWhere: Prisma.CompanyCustomFieldValueWhereInput | null = null;
    if (
      field.fieldType === ContactCustomFieldType.SINGLE_SELECT &&
      typeof value === "string" &&
      field.options.includes(value)
    ) {
      valueWhere = { textValue: value };
    } else if (
      field.fieldType === ContactCustomFieldType.MULTI_SELECT &&
      Array.isArray(value) &&
      value.length
    ) {
      valueWhere = {
        OR: value
          .filter((item) => field.options.includes(item))
          .map((item) => ({ jsonValue: { array_contains: [item] } })),
      };
    } else if (
      field.fieldType === ContactCustomFieldType.BOOLEAN &&
      (value === "true" || value === "false")
    ) {
      valueWhere = { booleanValue: value === "true" };
    } else if (
      field.fieldType === ContactCustomFieldType.DATE &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      const from = validDate(value.from ?? null);
      const to = validDate(value.to ?? null);
      if (from || to) {
        valueWhere = {
          dateValue: {
            ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
            ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
          },
        };
      }
    }

    if (!valueWhere) continue;
    if ("OR" in valueWhere && !valueWhere.OR?.length) continue;
    conditions.push({
      customFieldValues: { some: { fieldId, ...valueWhere } },
    });
  }

  return conditions.length ? { AND: conditions } : undefined;
}
