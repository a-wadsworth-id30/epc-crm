export const salesKanbanCardFieldValues = [
  "customerName",
  "dealValue",
  "salesperson",
  "leadSource",
  "productsQuoted",
  "nextScheduledActivity",
  "estimatedCloseDate",
  "servicePlanStatus",
  "outstandingTasks",
] as const;

export type SalesKanbanCardField =
  (typeof salesKanbanCardFieldValues)[number];

export const salesKanbanCardFieldDefinitions = [
  {
    value: "customerName",
    label: "Customer name",
    description: "Shows the linked contact and organisation.",
  },
  {
    value: "dealValue",
    label: "Deal value",
    description: "Shows value and probability.",
  },
  {
    value: "salesperson",
    label: "Salesperson",
    description: "Shows the current owner.",
  },
  {
    value: "leadSource",
    label: "Lead source",
    description: "Shows the source journey and attribution quality.",
  },
  {
    value: "productsQuoted",
    label: "Products being quoted",
    description: "Shows selected opportunity products.",
  },
  {
    value: "nextScheduledActivity",
    label: "Next scheduled activity",
    description: "Shows the next open linked task, then the next step fallback.",
  },
  {
    value: "estimatedCloseDate",
    label: "Estimated close date",
    description: "Shows the expected close date.",
  },
  {
    value: "servicePlanStatus",
    label: "Service plan status",
    description: "Shows service-plan status captured in lead scope metadata.",
  },
  {
    value: "outstandingTasks",
    label: "Outstanding tasks",
    description: "Shows open linked contact or organisation tasks.",
  },
] as const satisfies ReadonlyArray<{
  value: SalesKanbanCardField;
  label: string;
  description: string;
}>;

export type SalesKanbanSettings = {
  cardFields: SalesKanbanCardField[];
};

export const defaultSalesKanbanCardFields =
  salesKanbanCardFieldDefinitions.map((field) => field.value);

const salesKanbanCardFieldSet = new Set<string>(defaultSalesKanbanCardFields);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function isSalesKanbanCardField(
  value: unknown,
): value is SalesKanbanCardField {
  return typeof value === "string" && salesKanbanCardFieldSet.has(value);
}

function uniqueCardFields(values: unknown[]) {
  const fields: SalesKanbanCardField[] = [];
  const seen = new Set<SalesKanbanCardField>();

  values.forEach((value) => {
    if (!isSalesKanbanCardField(value) || seen.has(value)) return;
    seen.add(value);
    fields.push(value);
  });

  return fields;
}

export function parseSalesKanbanSettings(value: unknown): SalesKanbanSettings {
  const data = isRecord(value) ? value : {};
  const cardFields = Array.isArray(data.cardFields)
    ? uniqueCardFields(data.cardFields)
    : defaultSalesKanbanCardFields;

  return {
    cardFields: cardFields.length ? cardFields : defaultSalesKanbanCardFields,
  };
}

export function salesKanbanSettingsToJson(settings: SalesKanbanSettings) {
  return {
    cardFields: uniqueCardFields(settings.cardFields),
  };
}
