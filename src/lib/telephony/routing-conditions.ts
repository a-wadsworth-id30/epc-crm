export type RoutingConditionType =
  | "ALWAYS"
  | "KNOWN_CONTACT"
  | "OPEN_SALE"
  | "ATTRIBUTION_PRESENT"
  | "TRACKING_NUMBER_PRESENT"
  | "INBOUND_NUMBER"
  | "SOURCE"
  | "CAMPAIGN";

export type RoutingConditionOperator =
  | "EXISTS"
  | "EQUALS"
  | "CONTAINS"
  | "STARTS_WITH"
  | "ENDS_WITH";

export type RoutingConditionConfig = {
  type: RoutingConditionType;
  operator?: RoutingConditionOperator | null;
  value?: string | null;
};

export type RoutingConditionContext = {
  attribution?: unknown;
  campaign?: string | null;
  contactId?: string | null;
  fromNumber?: string | null;
  opportunityId?: string | null;
  opportunitySource?: string | null;
  source?: string | null;
  toNumber?: string | null;
  trackingPhoneNumber?: string | null;
};

export const routingConditionOptions: Array<{
  description: string;
  label: string;
  requiresValue: boolean;
  type: RoutingConditionType;
  valueLabel?: string;
}> = [
  {
    description: "Always take the Yes path.",
    label: "Always match",
    requiresValue: false,
    type: "ALWAYS",
  },
  {
    description: "Caller number matches any CRM contact.",
    label: "Known CRM contact",
    requiresValue: false,
    type: "KNOWN_CONTACT",
  },
  {
    description: "Caller matches exactly one open lead/opportunity.",
    label: "Contact has open lead",
    requiresValue: false,
    type: "OPEN_SALE",
  },
  {
    description: "The call is linked to attribution or tracking data.",
    label: "Has attribution data",
    requiresValue: false,
    type: "ATTRIBUTION_PRESENT",
  },
  {
    description: "The call came through an attribution tracking number.",
    label: "Tracking number call",
    requiresValue: false,
    type: "TRACKING_NUMBER_PRESENT",
  },
  {
    description: "Route based on the dialled business/tracking number.",
    label: "Inbound number",
    requiresValue: true,
    type: "INBOUND_NUMBER",
    valueLabel: "Number contains",
  },
  {
    description: "Route based on opportunity or attribution source.",
    label: "Lead source",
    requiresValue: true,
    type: "SOURCE",
    valueLabel: "Source contains",
  },
  {
    description: "Route based on attribution campaign.",
    label: "Campaign",
    requiresValue: true,
    type: "CAMPAIGN",
    valueLabel: "Campaign contains",
  },
];

export function routingConditionLabel(type: string | null | undefined) {
  return (
    routingConditionOptions.find((option) => option.type === type)?.label ??
    "Custom condition"
  );
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function deepStringValue(value: unknown, keys: string[]): string | null {
  const queue = [value];
  const seen = new Set<unknown>();

  while (queue.length) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    if (typeof current !== "object") continue;
    const record = current as Record<string, unknown>;

    for (const key of keys) {
      const direct = stringValue(record[key]);
      if (direct) return direct;
    }

    queue.push(...Object.values(record));
  }

  return null;
}

function attributionSource(context: RoutingConditionContext) {
  return (
    context.source ??
    context.opportunitySource ??
    deepStringValue(context.attribution, [
      "source",
      "attributionSource",
      "utm_source",
      "utmSource",
      "leadSource",
    ])
  );
}

function attributionCampaign(context: RoutingConditionContext) {
  return (
    context.campaign ??
    deepStringValue(context.attribution, [
      "campaign",
      "attributionCampaign",
      "utm_campaign",
      "utmCampaign",
    ])
  );
}

function compareText(
  candidate: string | null | undefined,
  operator: RoutingConditionOperator | null | undefined,
  expected: string | null | undefined,
) {
  const value = String(candidate ?? "")
    .trim()
    .toLowerCase();
  const match = String(expected ?? "")
    .trim()
    .toLowerCase();

  if (operator === "EXISTS") return Boolean(value);
  if (!match) return false;
  if (operator === "EQUALS") return value === match;
  if (operator === "STARTS_WITH") return value.startsWith(match);
  if (operator === "ENDS_WITH") return value.endsWith(match);
  return value.includes(match);
}

export function evaluateRoutingCondition(
  config: RoutingConditionConfig | null | undefined,
  context: RoutingConditionContext,
) {
  const type = config?.type ?? "ALWAYS";
  const operator = config?.operator ?? "CONTAINS";
  const value = config?.value ?? "";

  if (type === "ALWAYS") return true;
  if (type === "KNOWN_CONTACT") return Boolean(context.contactId);
  if (type === "OPEN_SALE") return Boolean(context.opportunityId);
  if (type === "ATTRIBUTION_PRESENT") {
    return Boolean(context.attribution || attributionSource(context));
  }
  if (type === "TRACKING_NUMBER_PRESENT") {
    return Boolean(context.trackingPhoneNumber);
  }
  if (type === "INBOUND_NUMBER") {
    return compareText(
      context.toNumber ?? context.trackingPhoneNumber,
      operator,
      value,
    );
  }
  if (type === "SOURCE") {
    return compareText(attributionSource(context), operator, value);
  }
  if (type === "CAMPAIGN") {
    return compareText(attributionCampaign(context), operator, value);
  }

  return false;
}

export function conditionConfigFromNodeData(
  data: Record<string, unknown> | null | undefined,
): RoutingConditionConfig | null {
  const record = objectValue(data);
  const type = stringValue(record.conditionType);
  const operator = stringValue(record.conditionOperator);
  const value = stringValue(record.conditionValue);

  if (
    type !== "ALWAYS" &&
    type !== "KNOWN_CONTACT" &&
    type !== "OPEN_SALE" &&
    type !== "ATTRIBUTION_PRESENT" &&
    type !== "TRACKING_NUMBER_PRESENT" &&
    type !== "INBOUND_NUMBER" &&
    type !== "SOURCE" &&
    type !== "CAMPAIGN"
  ) {
    return null;
  }

  return {
    type,
    operator:
      operator === "EXISTS" ||
      operator === "EQUALS" ||
      operator === "CONTAINS" ||
      operator === "STARTS_WITH" ||
      operator === "ENDS_WITH"
        ? operator
        : "CONTAINS",
    value,
  };
}
