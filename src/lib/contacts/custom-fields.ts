import {
  ContactCustomFieldType,
  ContactFieldRequirementMode,
  Prisma,
} from "@prisma/client";

export type ContactCustomFieldDefinition = {
  contactTypeId: string;
  displayOrder: number;
  externalEditable: boolean;
  fieldType: ContactCustomFieldType;
  helpText: string | null;
  id: string;
  isActive: boolean;
  isSearchable: boolean;
  key: string;
  label: string;
  options: string[];
  placeholder: string | null;
  requirementMode: ContactFieldRequirementMode;
  showInTable: boolean;
};

export type ContactCustomFieldFormValue = string | string[] | boolean | null;

export type ContactCustomFieldStoredValue = {
  booleanValue: boolean | null;
  dateValue: Date | string | null;
  fieldId: string;
  jsonValue: Prisma.JsonValue | null;
  numberValue: Prisma.Decimal | number | string | null;
  textValue: string | null;
};

export type ContactCustomFieldWrite = {
  booleanValue: boolean | null;
  dateValue: Date | null;
  fieldId: string;
  jsonValue: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  numberValue: Prisma.Decimal | null;
  textValue: string | null;
};

export type ContactCustomFieldSubmissionResult =
  | { ok: true; values: ContactCustomFieldWrite[] }
  | { message: string; ok: false };

export const contactCustomFieldTypes = Object.values(ContactCustomFieldType);
export const contactFieldRequirementModes = Object.values(
  ContactFieldRequirementMode,
);

export const contactCustomFieldTypeLabels: Record<
  ContactCustomFieldType,
  string
> = {
  SHORT_TEXT: "Short text",
  LONG_TEXT: "Long text",
  NUMBER: "Number",
  DATE: "Date",
  BOOLEAN: "Yes / No",
  SINGLE_SELECT: "Single select",
  MULTI_SELECT: "Multi select",
  EMAIL: "Email",
  PHONE: "Telephone",
  URL: "Website URL",
  ADDRESS: "Address",
};

export const contactFieldRequirementLabels: Record<
  ContactFieldRequirementMode,
  string
> = {
  OPTIONAL: "Optional",
  COMPLETENESS: "Required for completeness",
  REQUIRED: "Required to save",
};

export function contactCustomFieldKey(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 64) || "custom_field"
  );
}

export function parseContactCustomFieldOptions(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\n,]/)
        .map((option) => option.trim())
        .filter(Boolean),
    ),
  ).slice(0, 50);
}

export function contactCustomFieldNeedsOptions(type: ContactCustomFieldType) {
  return type === "SINGLE_SELECT" || type === "MULTI_SELECT";
}

export function normalizeContactCustomFieldOptions(value: Prisma.JsonValue | null) {
  return Array.isArray(value)
    ? value.filter((option): option is string => typeof option === "string")
    : [];
}

export function serializeContactCustomFieldValue(
  value: ContactCustomFieldStoredValue,
): ContactCustomFieldFormValue {
  if (value.booleanValue !== null) return value.booleanValue;
  if (value.dateValue) {
    const date =
      value.dateValue instanceof Date
        ? value.dateValue
        : new Date(value.dateValue);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  if (value.numberValue !== null) return value.numberValue.toString();
  if (Array.isArray(value.jsonValue)) {
    return value.jsonValue.filter(
      (entry): entry is string => typeof entry === "string",
    );
  }
  return value.textValue;
}

function submittedStrings(formData: FormData, fieldId: string) {
  return formData
    .getAll(`customField:${fieldId}`)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

function emptyWrite(fieldId: string): ContactCustomFieldWrite {
  return {
    booleanValue: null,
    dateValue: null,
    fieldId,
    jsonValue: Prisma.JsonNull,
    numberValue: null,
    textValue: null,
  };
}

function invalid(label: string, detail: string): ContactCustomFieldSubmissionResult {
  return { ok: false, message: `${label}: ${detail}` };
}

export function parseContactCustomFieldSubmission(
  definitions: ContactCustomFieldDefinition[],
  formData: FormData,
): ContactCustomFieldSubmissionResult {
  const values: ContactCustomFieldWrite[] = [];

  for (const definition of definitions) {
    const submitted = submittedStrings(formData, definition.id);
    const isEmpty = submitted.length === 0;

    if (isEmpty) {
      if (definition.requirementMode === "REQUIRED") {
        return invalid(definition.label, "this field is required.");
      }
      values.push(emptyWrite(definition.id));
      continue;
    }

    const write = emptyWrite(definition.id);
    const first = submitted[0] ?? "";

    switch (definition.fieldType) {
      case "MULTI_SELECT": {
        const selected = Array.from(new Set(submitted));
        if (selected.some((option) => !definition.options.includes(option))) {
          return invalid(definition.label, "choose one or more valid options.");
        }
        write.jsonValue = selected;
        break;
      }
      case "SINGLE_SELECT":
        if (!definition.options.includes(first)) {
          return invalid(definition.label, "choose a valid option.");
        }
        write.textValue = first;
        break;
      case "NUMBER": {
        try {
          write.numberValue = new Prisma.Decimal(first);
        } catch {
          return invalid(definition.label, "enter a valid number.");
        }
        break;
      }
      case "DATE": {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(first)) {
          return invalid(definition.label, "enter a valid date.");
        }
        const date = new Date(`${first}T00:00:00.000Z`);
        if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== first) {
          return invalid(definition.label, "enter a valid date.");
        }
        write.dateValue = date;
        break;
      }
      case "BOOLEAN":
        if (first !== "true" && first !== "false") {
          return invalid(definition.label, "choose Yes or No.");
        }
        write.booleanValue = first === "true";
        break;
      case "EMAIL":
        if (!/^\S+@\S+\.\S+$/.test(first) || first.length > 320) {
          return invalid(definition.label, "enter a valid email address.");
        }
        write.textValue = first;
        break;
      case "URL": {
        try {
          const url = new URL(first);
          if (url.protocol !== "http:" && url.protocol !== "https:") {
            return invalid(definition.label, "enter an http or https URL.");
          }
        } catch {
          return invalid(definition.label, "enter a valid URL.");
        }
        write.textValue = first;
        break;
      }
      case "SHORT_TEXT":
      case "PHONE":
        if (first.length > 500) {
          return invalid(definition.label, "use 500 characters or fewer.");
        }
        write.textValue = first;
        break;
      case "ADDRESS":
      case "LONG_TEXT":
        if (first.length > 10_000) {
          return invalid(definition.label, "use 10,000 characters or fewer.");
        }
        write.textValue = first;
        break;
    }

    values.push(write);
  }

  return { ok: true, values };
}
