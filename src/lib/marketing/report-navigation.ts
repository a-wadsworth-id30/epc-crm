export type MarketingView =
  | "overview"
  | "lead-sources"
  | "ad-platforms"
  | "conversion-reporting"
  | "attribution-reports"
  | "offline-media"
  | "sales-quality"
  | "executive-report";

export type MarketingSection = MarketingView | "visitors" | "offline-campaigns";

export type MarketingRange = "7d" | "30d" | "90d" | "12m" | "all";

export type AttributionModel =
  | "assisted"
  | "first-touch"
  | "last-touch"
  | "linear"
  | "position-based"
  | "time-decay";

export type LeadChannel =
  | "all"
  | "meta"
  | "linkedin"
  | "google"
  | "bing"
  | "organic"
  | "referral"
  | "direct"
  | "email"
  | "sms";

type SearchParamValue = string | string[] | undefined;

export const marketingRanges: Array<{
  label: string;
  value: MarketingRange;
  days: number | null;
}> = [
  { label: "7 days", value: "7d", days: 7 },
  { label: "30 days", value: "30d", days: 30 },
  { label: "90 days", value: "90d", days: 90 },
  { label: "12 months", value: "12m", days: 365 },
  { label: "All time", value: "all", days: null },
];

export const marketingViews: Array<{
  label: string;
  value: MarketingView;
  description: string;
}> = [
  {
    label: "Overview",
    value: "overview",
    description: "Top-level lead, call, spend and revenue performance.",
  },
  {
    label: "Attribution Reports",
    value: "attribution-reports",
    description:
      "Source, campaign and lifecycle attribution across the selected date range.",
  },
  {
    label: "Lead Sources",
    value: "lead-sources",
    description: "Source-level lead, call and pipeline reporting.",
  },
  {
    label: "Ad Platforms",
    value: "ad-platforms",
    description: "Spend imports, campaign rows and provider sync status.",
  },
  {
    label: "Conversion Reporting",
    value: "conversion-reporting",
    description: "Tracked forms, calls and conversion upload readiness.",
  },
  {
    label: "Offline Media Report",
    value: "offline-media",
    description:
      "Offline campaign metadata, calls, leads and pipeline contribution.",
  },
  {
    label: "Sales Quality Report",
    value: "sales-quality",
    description:
      "Lead quality, owner follow-up and pipeline hygiene by commercial source.",
  },
  {
    label: "Executive Report",
    value: "executive-report",
    description: "Client-facing commercial attribution summary.",
  },
];

export const marketingSections: Array<{
  label: string;
  value: MarketingSection;
  description: string;
}> = [
  ...marketingViews.slice(0, 5),
  {
    label: "Visitor Log",
    value: "visitors",
    description:
      "Audit visitor sessions, journeys, conversions and tracking evidence.",
  },
  {
    label: "Offline Campaigns",
    value: "offline-campaigns",
    description:
      "Manage offline campaign metadata, QR paths and tracking numbers.",
  },
  ...marketingViews.slice(5),
];

export const viewMeta: Record<
  MarketingView,
  { title: string; description: string }
> = {
  overview: {
    title: "Marketing Overview",
    description:
      "Measure marketing performance across leads, calls, attribution and sales value.",
  },
  "lead-sources": {
    title: "Lead Sources",
    description:
      "Compare CRM sources by leads, calls, pipeline value and attributed revenue.",
  },
  "ad-platforms": {
    title: "Ad Platforms",
    description:
      "Review imported ad spend, campaign rows and provider sync health.",
  },
  "conversion-reporting": {
    title: "Conversion Reporting",
    description:
      "Track captured conversions and provider upload readiness across forms and calls.",
  },
  "attribution-reports": {
    title: "Attribution Reports",
    description:
      "Report source, campaign and lifecycle performance across captured journeys.",
  },
  "offline-media": {
    title: "Offline Media Report",
    description:
      "Measure registered offline campaigns, QR/phone response paths and manually tagged activity.",
  },
  "sales-quality": {
    title: "Sales Quality Report",
    description:
      "Review pipeline quality, follow-up completeness and commercial outcome by source and owner.",
  },
  "executive-report": {
    title: "Executive Report",
    description:
      "Client-facing summary of lead quality, pipeline, revenue and attribution confidence.",
  },
};

export const viewActions: Record<
  MarketingView,
  { href: string; label: string }
> = {
  overview: {
    href: "/marketing/visitors",
    label: "Open visitor log",
  },
  "lead-sources": {
    href: "/marketing/sales-quality",
    label: "Review sales quality",
  },
  "ad-platforms": {
    href: "/settings/integrations",
    label: "Manage integrations",
  },
  "conversion-reporting": {
    href: "/settings/integrations",
    label: "Manage integrations",
  },
  "attribution-reports": {
    href: "/marketing/visitors",
    label: "Open visitor log",
  },
  "offline-media": {
    href: "/marketing/lead-sources",
    label: "Compare sources",
  },
  "sales-quality": {
    href: "/sales",
    label: "Open sales pipeline",
  },
  "executive-report": {
    href: "/marketing/attribution-reports",
    label: "View attribution detail",
  },
};

export const attributionModelOptions: Array<{
  description: string;
  label: string;
  value: AttributionModel;
}> = [
  {
    description: "Credit the first captured source in the journey.",
    label: "First-touch",
    value: "first-touch",
  },
  {
    description: "Credit the final captured source before conversion.",
    label: "Last-touch",
    value: "last-touch",
  },
  {
    description: "Show channels that helped between first and last touch.",
    label: "Assisted",
    value: "assisted",
  },
  {
    description: "Split credit equally across all captured journey touches.",
    label: "Linear",
    value: "linear",
  },
  {
    description:
      "Give 40% credit to first touch, 40% to last touch and 20% to middle touches.",
    label: "Position-based",
    value: "position-based",
  },
  {
    description: "Give more credit to later touches before conversion.",
    label: "Time-decay",
    value: "time-decay",
  },
];

export const leadChannelOptions: Array<{ value: LeadChannel; label: string }> =
  [
    { value: "all", label: "All channels" },
    { value: "meta", label: "Meta" },
    { value: "linkedin", label: "LinkedIn" },
    { value: "google", label: "Google" },
    { value: "bing", label: "Bing" },
    { value: "organic", label: "Organic" },
    { value: "referral", label: "Referral" },
    { value: "direct", label: "Direct" },
    { value: "email", label: "Email" },
    { value: "sms", label: "SMS" },
  ];

export const leadStatusOptions = [
  "All",
  "LEAD",
  "QUALIFIED",
  "PROPOSAL",
  "WON",
  "LOST",
] as const;

export type LeadStatus = (typeof leadStatusOptions)[number];

export function marketingViewHref(view: MarketingView, range: MarketingRange) {
  const params = new URLSearchParams();
  const path = view === "overview" ? "/marketing" : `/marketing/${view}`;

  if (range !== "30d") {
    params.set("range", range);
  }

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function marketingSectionHref(
  section: MarketingSection,
  range: MarketingRange,
) {
  if (section === "visitors") {
    const params = new URLSearchParams();

    if (range !== "30d") {
      params.set("range", range);
    }

    const query = params.toString();
    return query ? `/marketing/visitors?${query}` : "/marketing/visitors";
  }

  if (section === "offline-campaigns") {
    return "/marketing/offline-campaigns";
  }

  return marketingViewHref(section, range);
}

export function parseMarketingView(value: SearchParamValue): MarketingView {
  const view = Array.isArray(value) ? value[0] : value;

  if (
    view === "lead-sources" ||
    view === "ad-platforms" ||
    view === "conversion-reporting" ||
    view === "attribution-reports" ||
    view === "offline-media" ||
    view === "sales-quality" ||
    view === "executive-report"
  ) {
    return view;
  }

  return "overview";
}

export function parseMarketingRange(value: SearchParamValue): MarketingRange {
  const range = Array.isArray(value) ? value[0] : value;

  if (range === "7d" || range === "90d" || range === "12m" || range === "all") {
    return range;
  }

  return "30d";
}

export function parseAttributionModel(
  value: SearchParamValue,
): AttributionModel {
  const model = Array.isArray(value) ? value[0] : value;

  if (
    model === "first-touch" ||
    model === "last-touch" ||
    model === "assisted" ||
    model === "linear" ||
    model === "position-based" ||
    model === "time-decay"
  ) {
    return model;
  }

  return "last-touch";
}

export function searchValue(value: SearchParamValue) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export function flagValue(value: SearchParamValue) {
  const flag = Array.isArray(value) ? value[0] : value;
  return flag === "1" || flag === "true";
}

export function marketingRangeWindow(range: MarketingRange) {
  const option =
    marketingRanges.find((item) => item.value === range) ?? marketingRanges[1];
  const endDate = new Date();

  if (option.days === null) {
    return {
      ...option,
      endDate,
      startDate: null,
    };
  }

  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - option.days + 1);
  startDate.setHours(0, 0, 0, 0);

  return {
    ...option,
    endDate,
    startDate,
  };
}

export function attributionModelHref(
  model: AttributionModel,
  range: MarketingRange,
) {
  const params = new URLSearchParams();

  if (range !== "30d") {
    params.set("range", range);
  }

  if (model !== "last-touch") {
    params.set("model", model);
  }

  const query = params.toString();
  return query
    ? `/marketing/attribution-reports?${query}`
    : "/marketing/attribution-reports";
}

export function marketingReportHref(path: string, range: MarketingRange) {
  if (range === "30d") return path;

  return `${path}?range=${range}`;
}

export function executiveReportPackHref(range: MarketingRange) {
  const params = new URLSearchParams({ print: "1" });

  if (range !== "30d") {
    params.set("range", range);
  }

  return `/marketing/executive-report?${params.toString()}`;
}

export function executiveReportDownloadHref(range: MarketingRange) {
  const params = new URLSearchParams();

  if (range !== "30d") {
    params.set("range", range);
  }

  const query = params.toString();
  return query
    ? `/api/marketing/executive-report/client-pack?${query}`
    : "/api/marketing/executive-report/client-pack";
}

export function visitorLogHrefForMarketingRange(range: MarketingRange) {
  const visitorRange =
    range === "7d"
      ? "7"
      : range === "90d"
        ? "90"
        : range === "all"
          ? "all"
          : "30";

  return `/marketing/visitors?range=${visitorRange}`;
}

export function parseLeadChannel(value: SearchParamValue): LeadChannel {
  const channel = searchValue(value);
  return leadChannelOptions.some((option) => option.value === channel)
    ? (channel as LeadChannel)
    : "all";
}

export function parseLeadStatus(value: SearchParamValue): LeadStatus {
  const status = searchValue(value).toUpperCase();
  return leadStatusOptions.includes(status as LeadStatus)
    ? (status as LeadStatus)
    : "All";
}

export function marketingPageHref(
  range: MarketingRange,
  overrides: {
    channel?: LeadChannel;
    q?: string;
    status?: LeadStatus | string;
  } = {},
) {
  const params = new URLSearchParams();
  params.set("view", "lead-sources");
  if (range !== "30d") params.set("range", range);
  if (overrides.channel && overrides.channel !== "all")
    params.set("channel", overrides.channel);
  if (overrides.status && overrides.status !== "All")
    params.set("status", overrides.status);
  if (overrides.q) params.set("q", overrides.q);
  return `/marketing?${params.toString()}`;
}
