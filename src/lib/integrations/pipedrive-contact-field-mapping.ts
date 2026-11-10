import { ContactFieldRequirementMode } from "@prisma/client";
import {
  parseContactCustomFieldSubmission,
  type ContactCustomFieldDefinition,
  type ContactCustomFieldWrite,
} from "@/lib/contacts/custom-fields";

export type PipedriveContactFieldMapping = {
  contactFieldId: string;
  sourceFieldKey: string;
};

function primitiveValues(value: unknown): unknown[] {
  if (value === null || value === undefined || value === "") return [];
  if (Array.isArray(value)) return value.flatMap(primitiveValues);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("value" in record) return primitiveValues(record.value);
    if ("label" in record) return primitiveValues(record.label);
    return [];
  }
  return [value];
}

function submittedValues(
  value: unknown,
  definition: ContactCustomFieldDefinition,
) {
  const values = primitiveValues(value);
  if (!values.length) return [];

  if (definition.fieldType === "BOOLEAN") {
    const normalized = String(values[0]).trim().toLowerCase();
    if (["1", "true", "yes", "y"].includes(normalized)) return ["true"];
    if (["0", "false", "no", "n"].includes(normalized)) return ["false"];
    return [String(values[0])];
  }
  if (definition.fieldType === "DATE") {
    return [String(values[0]).trim().slice(0, 10)];
  }
  return values.map((entry) => String(entry).trim()).filter(Boolean);
}

function hasValue(value: ContactCustomFieldWrite) {
  return Boolean(
    value.textValue !== null ||
      value.numberValue !== null ||
      value.booleanValue !== null ||
      value.dateValue !== null ||
      (Array.isArray(value.jsonValue) && value.jsonValue.length),
  );
}

export function mappedPipedriveContactFieldWrites({
  definitions,
  mappings,
  person,
}: {
  definitions: ContactCustomFieldDefinition[];
  mappings: PipedriveContactFieldMapping[];
  person: Record<string, unknown>;
}) {
  const definitionById = new Map(
    definitions.map((definition) => [definition.id, definition]),
  );
  const values: ContactCustomFieldWrite[] = [];
  const warnings: string[] = [];

  for (const mapping of mappings) {
    const definition = definitionById.get(mapping.contactFieldId);
    if (!definition) {
      warnings.push(
        `Mapped CRM field ${mapping.contactFieldId} is unavailable and was skipped.`,
      );
      continue;
    }
    const submitted = submittedValues(
      person[mapping.sourceFieldKey],
      definition,
    );
    if (!submitted.length) continue;

    const formData = new FormData();
    submitted.forEach((entry) =>
      formData.append(`customField:${definition.id}`, entry),
    );
    const parsed = parseContactCustomFieldSubmission(
      [
        {
          ...definition,
          requirementMode: ContactFieldRequirementMode.OPTIONAL,
        },
      ],
      formData,
    );
    if (!parsed.ok) {
      warnings.push(
        `${definition.label} could not be imported from Pipedrive: ${parsed.message}`,
      );
      continue;
    }
    const value = parsed.values[0];
    if (value && hasValue(value)) values.push(value);
  }

  return { values, warnings };
}
