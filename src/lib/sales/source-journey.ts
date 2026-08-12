import {
  sourceJourneyKindFromText,
  type SourceJourneyItem,
} from "@/components/crm-boilerplate/SalesSourceJourney";

export function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sourceLabelFromAttribution(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const attribution = value as Record<string, unknown>;
  const metadata =
    attribution.metadata && typeof attribution.metadata === "object"
      ? (attribution.metadata as Record<string, unknown>)
      : {};
  const sourceMetadata =
    attribution.sourceMetadata && typeof attribution.sourceMetadata === "object"
      ? (attribution.sourceMetadata as Record<string, unknown>)
      : {};
  const firstTouch =
    attribution.firstTouch && typeof attribution.firstTouch === "object"
      ? (attribution.firstTouch as Record<string, unknown>)
      : {};
  const firstParams =
    firstTouch.params && typeof firstTouch.params === "object"
      ? (firstTouch.params as Record<string, unknown>)
      : {};

  const source =
    sourceMetadata.source ||
    metadata.source ||
    attribution.source ||
    firstParams.utm_source ||
    firstTouch.source;

  return typeof source === "string" && source.trim() ? source.trim() : null;
}

function leadSourceDetail(touch: unknown) {
  const data = jsonObject(touch);
  const params = jsonObject(data.params);
  const medium = stringValue(params.utm_medium) || stringValue(data.medium);
  const campaign =
    stringValue(params.utm_campaign) ||
    stringValue(data.campaign) ||
    stringValue(data.campaignName);

  return [medium, campaign].filter(Boolean).join(" / ") || undefined;
}

function leadSourceLabelFromTouch(touch: unknown) {
  const data = jsonObject(touch);
  const params = jsonObject(data.params);

  return (
    stringValue(params.utm_source) ||
    stringValue(params.source) ||
    stringValue(data.source) ||
    stringValue(data.referrerHost) ||
    stringValue(data.referrer) ||
    stringValue(data.landingPage) ||
    stringValue(data.url)
  );
}

function timelineItems(value: unknown) {
  const data = jsonObject(value);
  const candidates = [
    value,
    data.events,
    data.items,
    data.touches,
    data.touchpoints,
    data.timeline,
  ];
  const items: unknown[] = [];

  candidates.forEach((candidate) => {
    if (Array.isArray(candidate)) {
      items.push(...candidate);
    }
  });

  return items.filter((item) => Object.keys(jsonObject(item)).length > 0);
}

function leadSourceTouchpoints(value: unknown) {
  const attribution = jsonObject(value);
  const touchpoints: unknown[] = [];

  if (Object.keys(jsonObject(attribution.firstTouch)).length > 0) {
    touchpoints.push(attribution.firstTouch);
  }

  timelineItems(attribution.timeline).forEach((touchpoint) =>
    touchpoints.push(touchpoint),
  );

  if (Object.keys(jsonObject(attribution.lastTouch)).length > 0) {
    touchpoints.push(attribution.lastTouch);
  }

  return touchpoints.map((touchpoint) => ({
    label: leadSourceLabelFromTouch(touchpoint),
    detail: leadSourceDetail(touchpoint),
  }));
}

function cleanLeadSourceLabel(label: string | null | undefined) {
  const value = label?.trim();
  if (!value) return null;

  const normalised = value.toLowerCase();
  const mediumOnlyPattern =
    /^(cpc|ppc|paid|paid search|organic|organic search|social|display|email|sms|phone|call)\s*\//;
  const contactMethods = new Set([
    "call",
    "phone",
    "phone call",
    "inbound phone",
    "outbound phone",
    "email",
    "sms",
    "whatsapp",
  ]);

  if (contactMethods.has(normalised)) return null;
  if (mediumOnlyPattern.test(normalised)) return null;
  if (normalised === "google" || normalised === "google ads")
    return "Google Ads";
  if (normalised === "bing" || normalised === "microsoft ads")
    return "Bing Ads";
  if (
    normalised === "facebook" ||
    normalised === "instagram" ||
    normalised === "meta" ||
    normalised === "meta ads"
  ) {
    return "Meta";
  }

  return value;
}

export function buildSourceJourney(opportunity: {
  source: string | null;
  attribution: unknown;
}) {
  const items: SourceJourneyItem[] = [];
  const seen = new Set<string>();
  const addItem = (label: string | null, detail?: string) => {
    const cleanLabel = cleanLeadSourceLabel(label);
    if (!cleanLabel) return;

    const key = `${sourceJourneyKindFromText(cleanLabel)}:${cleanLabel.toLowerCase()}`;
    if (seen.has(key)) return;

    seen.add(key);
    items.push({
      id: `${items.length}-${key}`,
      label: cleanLabel,
      detail,
      kind: sourceJourneyKindFromText(cleanLabel),
    });
  };

  addItem(
    opportunity.source || sourceLabelFromAttribution(opportunity.attribution),
  );
  leadSourceTouchpoints(opportunity.attribution).forEach((touchpoint) => {
    addItem(touchpoint.label, touchpoint.detail);
  });

  return items.slice(0, 6);
}
