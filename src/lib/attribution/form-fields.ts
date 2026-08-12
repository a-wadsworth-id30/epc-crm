const MAX_CAPTURED_FORM_FIELDS = 80;
const MAX_FORM_FIELD_VALUE_LENGTH = 1500;
const MAX_CONVERSATION_BODY_LENGTH = 12000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SENSITIVE_FIELD_PATTERN =
  /(pass(word|code)?|secret|token|api[-_\s]?key|authorization|auth|card|cc[-_\s]?num|cvc|cvv|iban|sort[-_\s]?code|account[-_\s]?number|routing[-_\s]?number)/i;
const RESERVED_PAYLOAD_FIELDS = new Set([
  "firstName",
  "lastName",
  "name",
  "email",
  "phone",
  "companyName",
  "message",
  "source",
  "title",
  "fields",
  "formFields",
  "form",
  "attribution",
  "crm_attribution",
]);

export type SubmittedFormField = {
  name: string | null;
  label: string;
  value: string;
  type: string | null;
};

type LeadFormPayload = Record<string, unknown> & {
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  message?: string;
};

function jsonObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringField(value: unknown, maxLength = 160) {
  return typeof value === "string" && value.trim()
    ? value.replace(/\s+/g, " ").trim().slice(0, maxLength)
    : null;
}

function humanizeFieldName(value: string | null) {
  if (!value) return "Field";

  return value
    .replace(/\[\]$/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (character) => character.toUpperCase())
    .slice(0, 160);
}

function fieldValueText(value: unknown) {
  if (typeof value === "string") {
    return value.replace(/\s+/g, " ").trim().slice(0, MAX_FORM_FIELD_VALUE_LENGTH);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).slice(0, MAX_FORM_FIELD_VALUE_LENGTH);
  }

  if (Array.isArray(value)) {
    const text = value
      .filter(
        (item) =>
          typeof item === "string" ||
          typeof item === "number" ||
          typeof item === "boolean",
      )
      .map((item) => String(item).replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join(", ");

    return text.slice(0, MAX_FORM_FIELD_VALUE_LENGTH);
  }

  return "";
}

function normaliseEmailValue(value: unknown) {
  if (typeof value !== "string") return null;

  const email = value.replace(/\s+/g, " ").trim();

  return EMAIL_PATTERN.test(email) ? email : null;
}

function normaliseToken(value: string | null) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSensitiveField(name: string | null, label: string | null) {
  return SENSITIVE_FIELD_PATTERN.test(name ?? "") || SENSITIVE_FIELD_PATTERN.test(label ?? "");
}

function fieldLooksLike(field: SubmittedFormField, pattern: RegExp) {
  return pattern.test(normaliseToken(field.name)) || pattern.test(normaliseToken(field.label));
}

function fieldIdentity(field: SubmittedFormField) {
  const email = normaliseEmailValue(field.value);

  if (
    email &&
    (field.type === "email" || fieldLooksLike(field, /\be-?mail\b/) || field.value === email)
  ) {
    return `email:${email.toLowerCase()}`;
  }

  if (fieldLooksLike(field, /\b(phone|telephone|tel|mobile)\b/)) {
    const digits = field.value.replace(/\D+/g, "");

    if (digits.length >= 6) return `phone:${digits}`;
  }

  if (fieldLooksLike(field, /\b(message|enquiry|inquiry|comment|detail)s?\b/)) {
    return `message:${field.value.toLowerCase()}`;
  }

  if (fieldLooksLike(field, /\b(first name|last name|full name|name|company|business|organisation|organization)\b/)) {
    return `${normaliseToken(field.label)}:${field.value.toLowerCase()}`;
  }

  return `${field.name ?? ""}|${field.label}|${field.value}`;
}

function normaliseSubmittedField(
  name: string | null,
  label: string | null,
  value: unknown,
  type?: string | null,
): SubmittedFormField | null {
  const normalisedName = stringField(name, 120);
  const normalisedLabel = stringField(label, 160) ?? humanizeFieldName(normalisedName);
  const normalisedType = stringField(type ?? null, 60);
  const textValue = fieldValueText(value);

  if (!textValue || isSensitiveField(normalisedName, normalisedLabel)) {
    return null;
  }

  return {
    name: normalisedName,
    label: normalisedLabel,
    type: normalisedType,
    value: textValue,
  };
}

function normaliseExplicitFormFields(value: unknown) {
  const fields: SubmittedFormField[] = [];

  if (Array.isArray(value)) {
    for (const item of value) {
      if (fields.length >= MAX_CAPTURED_FORM_FIELDS) break;

      const record = jsonObject(item);
      if (!record) continue;

      const field = normaliseSubmittedField(
        stringField(record.name, 120) ?? stringField(record.key, 120),
        stringField(record.label, 160),
        record.value ?? record.values,
        stringField(record.type, 60),
      );

      if (field) fields.push(field);
    }
  } else {
    const record = jsonObject(value);

    if (record) {
      for (const [key, entryValue] of Object.entries(record)) {
        if (fields.length >= MAX_CAPTURED_FORM_FIELDS) break;

        const field = normaliseSubmittedField(key, humanizeFieldName(key), entryValue);
        if (field) fields.push(field);
      }
    }
  }

  return fields;
}

function normaliseMappedLeadFields(payload: LeadFormPayload) {
  const fields: SubmittedFormField[] = [];
  const fullName = stringField(payload.name, 240);
  const firstName = stringField(payload.firstName, 120);
  const lastName = stringField(payload.lastName, 120);

  if (fullName) {
    const field = normaliseSubmittedField("name", "Name", fullName);
    if (field) fields.push(field);
  } else {
    const combinedName = [firstName, lastName].filter(Boolean).join(" ");

    if (combinedName) {
      const field = normaliseSubmittedField("name", "Name", combinedName);
      if (field) fields.push(field);
    }
  }

  const mappedFields: Array<[string, string, unknown, string | null]> = [
    ["email", "Email", payload.email, "email"],
    ["phone", "Phone", payload.phone, "tel"],
    ["companyName", "Company", payload.companyName, null],
    ["message", "Message", payload.message, null],
  ];

  for (const [name, label, value, type] of mappedFields) {
    const field = normaliseSubmittedField(name, label, value, type);
    if (field) fields.push(field);
  }

  return fields;
}

function normalisePayloadExtraFields(payload: Record<string, unknown>) {
  const fields: SubmittedFormField[] = [];

  for (const [key, value] of Object.entries(payload)) {
    if (fields.length >= MAX_CAPTURED_FORM_FIELDS) break;
    if (RESERVED_PAYLOAD_FIELDS.has(key)) continue;

    const field = normaliseSubmittedField(key, humanizeFieldName(key), value);
    if (field) fields.push(field);
  }

  return fields;
}

export function normaliseFormFields(payload: LeadFormPayload) {
  const fields = [
    ...normaliseExplicitFormFields(payload.fields),
    ...normaliseExplicitFormFields(payload.formFields),
    ...normaliseMappedLeadFields(payload),
    ...normalisePayloadExtraFields(payload),
  ];
  const seen = new Set<string>();

  return fields
    .filter((field) => {
      const key = fieldIdentity(field);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_CAPTURED_FORM_FIELDS);
}

export function normaliseLeadEmail(email: unknown, fields: SubmittedFormField[]) {
  const directEmail = normaliseEmailValue(email);

  if (directEmail) return directEmail;

  for (const field of fields) {
    const fieldEmail = normaliseEmailValue(field.value);

    if (
      fieldEmail &&
      (field.type === "email" || fieldLooksLike(field, /\be-?mail\b/))
    ) {
      return fieldEmail;
    }
  }

  return null;
}

export function formFieldsBody(message: string | undefined, fields: SubmittedFormField[]) {
  if (!fields.length) {
    return message ?? null;
  }

  const cleanMessage = message?.trim();
  const messageAlreadyListed =
    cleanMessage &&
    fields.some((field) => {
      const name = `${field.name ?? ""} ${field.label}`.toLowerCase();
      return (
        field.value.toLowerCase() === cleanMessage.toLowerCase() &&
        /(message|enquiry|inquiry|comment|detail)/i.test(name)
      );
    });
  const fieldLines = fields.map((field) => `${field.label}: ${field.value}`);
  const sections = [
    cleanMessage && !messageAlreadyListed ? cleanMessage : null,
    ["Submitted form fields:", ...fieldLines].join("\n"),
  ].filter(Boolean);

  return sections.join("\n\n").slice(0, MAX_CONVERSATION_BODY_LENGTH);
}

export function submittedFormFieldCount(value: unknown) {
  return Array.isArray(value) ? value.filter((field) => Boolean(jsonObject(field))).length : 0;
}

export function shouldReplaceSubmittedFormFields(input: {
  existingFields: unknown;
  candidateFields: SubmittedFormField[];
  existingBody?: string | null;
  candidateBody?: string | null;
}) {
  const existingCount = submittedFormFieldCount(input.existingFields);
  const candidateCount = input.candidateFields.length;

  if (candidateCount > existingCount) {
    return true;
  }

  const existingBodyLength = input.existingBody?.length ?? 0;
  const candidateBodyLength = input.candidateBody?.length ?? 0;

  return candidateCount === existingCount && candidateBodyLength > existingBodyLength + 20;
}

function messageSummary(message: string | undefined) {
  const trimmed = (message || "Website enquiry submitted.").replace(/\s+/g, " ").trim();
  return trimmed.length > 160 ? `${trimmed.slice(0, 157)}...` : trimmed;
}

export function formConversationSummary(
  message: string | undefined,
  fields: SubmittedFormField[],
) {
  if (message?.trim()) {
    return messageSummary(message);
  }

  if (fields.length) {
    return `Website enquiry submitted with ${fields.length} captured field${
      fields.length === 1 ? "" : "s"
    }.`;
  }

  return messageSummary(message);
}
