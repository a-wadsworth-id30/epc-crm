import type {
  PipedriveLead,
  PipedriveLeadField,
} from "@/lib/integrations/pipedrive";

export type PipedriveSaleContextField = {
  key: string;
  label: string;
  type: string | null;
  value: string;
};

export type PipedriveSaleContextItem = {
  label: string;
  value: string;
};

export type PipedriveSaleContext = {
  customFields: PipedriveSaleContextField[];
  leadTitle: string | null;
  summary: PipedriveSaleContextItem[];
};

const standardLeadKeys = new Set([
  "active",
  "add_time",
  "archive_time",
  "channel",
  "channel_id",
  "cc_email",
  "creator_id",
  "expected_close_date",
  "id",
  "is_archived",
  "label_ids",
  "name",
  "next_activity_id",
  "org_id",
  "organization",
  "organization_id",
  "origin",
  "origin_id",
  "owner_id",
  "person",
  "person_id",
  "source_name",
  "sort_name",
  "title",
  "update_time",
  "value",
  "visible_to",
  "was_seen",
]);

export function buildPipedriveSaleContext({
  fields,
  lead,
}: {
  fields: PipedriveLeadField[];
  lead: PipedriveLead;
}): PipedriveSaleContext {
  const leadTitle = firstText(lead.title, lead.name);
  const customFields = pipedriveCustomFields(lead, fields);
  const summary = compactItems([
    { label: "Pipedrive title", value: leadTitle },
    { label: "Value", value: formatPipedriveValue(lead.value) },
    {
      label: "Expected close",
      value: formatDateOnly(firstText(lead.expected_close_date)),
    },
    { label: "Owner", value: formatPipedriveValue(lead.owner_id) },
    {
      label: "Source",
      value: firstText(lead.source_name, lead.origin, lead.channel),
    },
    {
      label: "Labels",
      value: formatPipedriveValue(lead.label_ids),
    },
    {
      label: "Created",
      value: formatDateTime(firstText(lead.add_time)),
    },
    {
      label: "Updated",
      value: formatDateTime(firstText(lead.update_time)),
    },
    {
      label: "Archived",
      value:
        typeof lead.is_archived === "boolean"
          ? lead.is_archived
            ? "Yes"
            : "No"
          : null,
    },
  ]);

  return {
    customFields,
    leadTitle,
    summary,
  };
}

function pipedriveCustomFields(
  lead: PipedriveLead,
  fields: PipedriveLeadField[],
) {
  const rows: PipedriveSaleContextField[] = [];
  const usedKeys = new Set<string>();

  for (const field of fields) {
    const key = textValue(field.key);
    if (!key || standardLeadKeys.has(key)) continue;
    if (!Object.prototype.hasOwnProperty.call(lead, key)) continue;

    const value = formatPipedriveValue(lead[key], field);
    if (!value) continue;

    usedKeys.add(key);
    rows.push({
      key,
      label: textValue(field.name) ?? prettifyFieldKey(key),
      type: textValue(field.field_type),
      value,
    });
  }

  for (const [key, rawValue] of Object.entries(lead)) {
    if (rows.length >= 24) break;
    if (usedKeys.has(key) || standardLeadKeys.has(key)) continue;
    if (!looksLikeCustomFieldKey(key)) continue;

    const value = formatPipedriveValue(rawValue);
    if (!value) continue;

    rows.push({
      key,
      label: prettifyFieldKey(key),
      type: null,
      value,
    });
  }

  return rows.slice(0, 24);
}

function formatPipedriveValue(
  value: unknown,
  field?: PipedriveLeadField,
): string | null {
  if (value === null || value === undefined) return null;

  const options = optionLabelMap(field?.options);

  if (Array.isArray(value)) {
    return compactText(
      value
        .map((item) => formatPipedriveValue(item, field))
        .filter(Boolean)
        .join(", "),
    );
  }

  if (typeof value === "boolean") return value ? "Yes" : "No";

  if (typeof value === "number" && Number.isFinite(value)) {
    return options.get(String(value)) ?? String(value);
  }

  if (typeof value === "string") {
    const text = compactText(value);
    if (!text) return null;

    if (text.includes(",")) {
      const mapped = text
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => options.get(item) ?? item);

      return compactText(mapped.join(", "));
    }

    return options.get(text) ?? text;
  }

  if (typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const amount = firstNumber(record.amount, record.value);
  const currency = firstText(record.currency);
  if (amount !== null && currency) {
    return `${currency} ${amount.toLocaleString("en-GB")}`;
  }

  const entityLabel = firstText(
    record.name,
    record.label,
    record.title,
    record.value,
    record.email,
  );
  if (entityLabel) return entityLabel;

  const id = firstText(record.id);
  if (id) return id;

  return compactText(JSON.stringify(value));
}

function optionLabelMap(options: unknown) {
  const map = new Map<string, string>();
  if (!Array.isArray(options)) return map;

  for (const option of options) {
    if (!option || typeof option !== "object") continue;

    const record = option as Record<string, unknown>;
    const id = firstText(record.id);
    const label = firstText(record.label, record.value, record.name);
    if (id && label) map.set(id, label);
  }

  return map;
}

function compactItems(
  items: Array<{ label: string; value: string | null | undefined }>,
) {
  return items
    .map((item) => ({
      label: item.label,
      value: compactText(item.value),
    }))
    .filter((item): item is PipedriveSaleContextItem => Boolean(item.value));
}

function formatDateOnly(value: string | null) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  return formatDateTime(value);
}

function formatDateTime(value: string | null) {
  if (!value) return null;
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function prettifyFieldKey(key: string) {
  if (/^[a-f0-9]{20,}$/i.test(key)) return `Custom field ${key.slice(0, 8)}`;

  return key
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function looksLikeCustomFieldKey(key: string) {
  return /^[a-f0-9]{20,}$/i.test(key);
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string" || !value.trim()) continue;

    const number = Number.parseFloat(value);
    if (Number.isFinite(number)) return number;
  }

  return null;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = textValue(value);
    if (text) return text;
  }

  return null;
}

function compactText(value: unknown) {
  const text = textValue(value);
  if (!text) return null;

  return text.replace(/\s+/g, " ").slice(0, 500);
}

function textValue(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);

  return null;
}
