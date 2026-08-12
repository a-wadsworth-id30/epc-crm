import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { calculateAttributionConfidence } from "@/lib/marketing/attribution-confidence";
import {
  attributionConfidenceFilterValues,
  attributionConfidenceWhere,
  type AttributionConfidenceFilter,
} from "@/lib/marketing/attribution-confidence-filter";
import { prisma } from "@/lib/prisma";

type SourceCategory =
  | "all"
  | "google-ads"
  | "bing-ads"
  | "meta-ads"
  | "linkedin-ads"
  | "paid-search"
  | "paid-social"
  | "referral"
  | "email"
  | "direct"
  | "has-click-id"
  | "has-location"
  | "no-location"
  | "unmatched-paid"
  | "form-leads"
  | "phone-leads"
  | "unknown";

const sourceValues = new Set<SourceCategory>([
  "all",
  "google-ads",
  "bing-ads",
  "meta-ads",
  "linkedin-ads",
  "paid-search",
  "paid-social",
  "referral",
  "email",
  "direct",
  "has-click-id",
  "has-location",
  "no-location",
  "unmatched-paid",
  "form-leads",
  "phone-leads",
  "unknown",
]);
const rangeValues = new Set(["7", "30", "90", "all"]);
const sortValues = new Set(["last-desc", "last-asc", "first-desc", "source-asc"]);
const exportLimit = 1000;

export async function GET(request: Request) {
  await requireAdmin();

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const source = normalizeSource(url.searchParams.get("source"));
  const confidence = normalizeConfidence(url.searchParams.get("confidence"));
  const range = normalizeRange(url.searchParams.get("range"));
  const sort = normalizeSort(url.searchParams.get("sort"));
  const convertedOnly = url.searchParams.get("converted") === "1";
  const since = range === "all" ? null : daysAgo(Number(range));
  const rows = await prisma.attributionSnapshot.findMany({
    where: visitorWhere({ confidence, convertedOnly, query, since, source }),
    orderBy: visitorOrderBy(sort),
    take: exportLimit,
    select: {
      visitorId: true,
      sessionId: true,
      attributionSource: true,
      attributionMedium: true,
      attributionCampaign: true,
      attributionAdProvider: true,
      attributionClickId: true,
      attributionClickIdType: true,
      firstTouch: true,
      lastTouch: true,
      timeline: true,
      landingPage: true,
      currentPage: true,
      referrer: true,
      ipAddress: true,
      userAgent: true,
      location: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          records: true,
        },
      },
      records: {
        select: {
          source: true,
          contactId: true,
          opportunityId: true,
        },
      },
    },
  });
  const csv = toCsv([
    [
      "Last activity",
      "First seen",
      "Visitor ID",
      "Session ID",
      "Source",
      "Medium",
      "Campaign",
      "Source category",
      "Status",
      "Next action",
      "Attribution confidence",
      "Attribution confidence score",
      "Attribution confidence summary",
      "Ad provider",
      "Click ID type",
      "Click ID",
      "Current page",
      "Landing page",
      "Referrer",
      "Location",
      "Location precision",
      "Country",
      "IP address",
      "Attribution records",
      "User agent",
    ],
    ...rows.map((row) => {
      const location = parseLocation(row.location);
      const sourceCategory = exportSourceCategory(row);
      const status = exportStatus(row);
      const confidence = calculateAttributionConfidence({
        firstTouch: row.firstTouch,
        lastTouch: row.lastTouch,
        timeline: row.timeline,
        landingPage: row.landingPage,
        currentPage: row.currentPage,
        referrer: row.referrer,
        attributionSource: row.attributionSource,
        attributionMedium: row.attributionMedium,
        attributionCampaign: row.attributionCampaign,
        attributionClickId: row.attributionClickId,
        attributionClickIdType: row.attributionClickIdType,
        recordsCount: row._count.records,
        formConversionsCount: row.records.filter((record) => record.source === "FORM").length,
        phoneConversionsCount: row.records.filter((record) => record.source === "PHONE").length,
        manualConversionsCount: row.records.filter((record) => record.source === "MANUAL").length,
        matchedContactId: row.records.find((record) => record.contactId)?.contactId ?? null,
        matchedOpportunityId:
          row.records.find((record) => record.opportunityId)?.opportunityId ?? null,
      });
      return [
        row.updatedAt.toISOString(),
        row.createdAt.toISOString(),
        row.visitorId,
        row.sessionId,
        row.attributionSource ?? "",
        row.attributionMedium ?? "",
        row.attributionCampaign ?? "",
        sourceCategory,
        status,
        exportNextAction(row, location),
        confidence.level,
        `${confidence.percentage}%`,
        confidence.clientSummary,
        row.attributionAdProvider ?? "",
        row.attributionClickIdType ?? "",
        row.attributionClickId ?? "",
        row.currentPage ?? "",
        row.landingPage ?? "",
        row.referrer ?? "",
        locationLabel(location),
        locationPrecisionLabel(location),
        location?.country ?? location?.countryCode ?? "",
        row.ipAddress ?? "",
        row._count.records.toString(),
        row.userAgent ?? "",
      ];
    }),
  ]);

  return new Response(csv, {
    headers: {
      "Content-Disposition": `attachment; filename="visitor-log-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}

function normalizeSource(value: string | null): SourceCategory {
  return value && sourceValues.has(value as SourceCategory) ? (value as SourceCategory) : "all";
}

function normalizeRange(value: string | null) {
  return value && rangeValues.has(value) ? value : "30";
}

function normalizeConfidence(value: string | null): AttributionConfidenceFilter {
  return attributionConfidenceFilterValues.includes(value as AttributionConfidenceFilter)
    ? (value as AttributionConfidenceFilter)
    : "all";
}

function normalizeSort(value: string | null) {
  return value && sortValues.has(value) ? value : "last-desc";
}

function visitorWhere(options: {
  confidence: AttributionConfidenceFilter;
  convertedOnly: boolean;
  query: string;
  since: Date | null;
  source: SourceCategory;
}) {
  const filters: Prisma.AttributionSnapshotWhereInput[] = [];

  if (options.since) {
    filters.push({ updatedAt: { gte: options.since } });
  }

  const source = sourceWhere(options.source);
  if (source) {
    filters.push(source);
  }

  const confidence = attributionConfidenceWhere(options.confidence);
  if (confidence) {
    filters.push(confidence);
  }

  if (options.convertedOnly) {
    filters.push({ records: { some: {} } });
  }

  if (options.query) {
    filters.push(searchWhere(options.query));
  }

  return filters.length ? { AND: filters } : {};
}

function searchWhere(query: string): Prisma.AttributionSnapshotWhereInput {
  const contains = { contains: query, mode: "insensitive" as const };

  return {
    OR: [
      { visitorId: contains },
      { sessionId: contains },
      { landingPage: contains },
      { currentPage: contains },
      { referrer: contains },
      { attributionSource: contains },
      { attributionMedium: contains },
      { attributionCampaign: contains },
      { attributionAdProvider: contains },
      { attributionClickId: contains },
      { attributionClickIdType: contains },
      { ipAddress: contains },
      { records: { some: { trackingPhoneNumber: contains } } },
    ],
  };
}

function sourceWhere(source: SourceCategory): Prisma.AttributionSnapshotWhereInput | null {
  if (source === "all") return null;
  if (source === "google-ads") return { attributionAdProvider: "google-ads" };
  if (source === "bing-ads") return { attributionAdProvider: "bing-ads" };
  if (source === "meta-ads") return { attributionAdProvider: "meta-ads" };
  if (source === "linkedin-ads") return { attributionAdProvider: "linkedin-ads" };
  if (source === "has-click-id") return { attributionClickId: { not: null } };
  if (source === "unmatched-paid") {
    return {
      AND: [
        { attributionClickId: { not: null } },
        { records: { none: {} } },
      ],
    };
  }
  if (source === "has-location") {
    return {
      NOT: [
        { location: { equals: Prisma.DbNull } },
        { location: { equals: Prisma.JsonNull } },
      ],
    };
  }
  if (source === "no-location") {
    return {
      OR: [
        { location: { equals: Prisma.DbNull } },
        { location: { equals: Prisma.JsonNull } },
      ],
    };
  }
  if (source === "form-leads") return { records: { some: { source: "FORM" } } };
  if (source === "phone-leads") return { records: { some: { source: "PHONE" } } };
  if (source === "paid-search") {
    return {
      OR: [
        { attributionAdProvider: { in: ["google-ads", "bing-ads"] } },
        { attributionClickIdType: { in: ["GCLID", "GBRAID", "WBRAID", "MSCLKID"] } },
        {
          AND: [
            {
              OR: [
                { attributionSource: { contains: "google", mode: "insensitive" } },
                { attributionSource: { contains: "bing", mode: "insensitive" } },
                { attributionSource: { contains: "microsoft", mode: "insensitive" } },
              ],
            },
            paidMediumWhere(),
          ],
        },
      ],
    };
  }
  if (source === "paid-social") {
    return {
      OR: [
        { attributionAdProvider: "linkedin-ads" },
        { AND: [{ attributionAdProvider: "meta-ads" }, paidMediumWhere()] },
        {
          AND: [
            {
              OR: [
                { attributionSource: { contains: "meta", mode: "insensitive" } },
                { attributionSource: { contains: "facebook", mode: "insensitive" } },
                { attributionSource: { contains: "instagram", mode: "insensitive" } },
                { attributionSource: { contains: "linkedin", mode: "insensitive" } },
              ],
            },
            paidMediumWhere(),
          ],
        },
      ],
    };
  }
  if (source === "email") {
    return {
      OR: [
        { attributionSource: { contains: "email", mode: "insensitive" } },
        { attributionSource: { contains: "sms", mode: "insensitive" } },
        { attributionMedium: { contains: "email", mode: "insensitive" } },
        { attributionMedium: { contains: "sms", mode: "insensitive" } },
      ],
    };
  }
  if (source === "direct") {
    return {
      OR: [{ attributionSource: "Direct" }, { AND: [{ attributionSource: null }, { referrer: null }] }],
    };
  }
  if (source === "unknown") {
    return {
      OR: [
        { attributionSource: null },
        { attributionSource: { equals: "unknown", mode: "insensitive" } },
        { attributionSource: { equals: "not set", mode: "insensitive" } },
      ],
    };
  }
  return null;
}

function paidMediumWhere(): Prisma.AttributionSnapshotWhereInput {
  return {
    OR: [
      { attributionMedium: { contains: "cpc", mode: "insensitive" } },
      { attributionMedium: { contains: "ppc", mode: "insensitive" } },
      { attributionMedium: { contains: "paid", mode: "insensitive" } },
    ],
  };
}

function visitorOrderBy(sort: string): Prisma.AttributionSnapshotOrderByWithRelationInput[] {
  if (sort === "last-asc") return [{ updatedAt: "asc" }];
  if (sort === "first-desc") return [{ createdAt: "desc" }];
  if (sort === "source-asc") return [{ attributionSource: "asc" }, { updatedAt: "desc" }];
  return [{ updatedAt: "desc" }];
}

function parseLocation(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const countryCode = stringValue(record.countryCode)?.toUpperCase() ?? null;
  const location = {
    city: stringValue(record.city),
    region: stringValue(record.region),
    country: stringValue(record.country) ?? countryName(countryCode),
    countryCode,
  };

  return Object.values(location).some(Boolean) ? location : null;
}

function locationLabel(location: ReturnType<typeof parseLocation>) {
  if (!location) return "";

  const locality = [location.city, location.region].filter(Boolean).join(", ");
  const country = location.country ?? location.countryCode;
  return [locality || null, country].filter(Boolean).join(", ");
}

function locationPrecisionLabel(location: ReturnType<typeof parseLocation>) {
  if (!location) return "No location";
  if (location.city) return "City-level";
  if (location.region) return "Region-level";
  if (location.country || location.countryCode) return "Country-level";
  return "No location";
}

function exportStatus(row: {
  _count: { records: number };
  attributionClickId: string | null;
  location: Prisma.JsonValue;
}) {
  if (row._count.records > 0) return "Converted";
  if (row.attributionClickId) return "Paid click";
  if (!parseLocation(row.location)) return "No location";
  return "Visitor";
}

function exportNextAction(
  row: {
    _count: { records: number };
    attributionClickId: string | null;
  },
  location: ReturnType<typeof parseLocation>,
) {
  if (row._count.records > 0) return "Follow up lead";
  if (row.attributionClickId) return "Review paid click";
  if (!location) return "Check geo capture";
  return "Monitor";
}

function exportSourceCategory(row: {
  attributionAdProvider: string | null;
  attributionMedium: string | null;
  attributionSource: string | null;
  referrer: string | null;
}) {
  const source = (row.attributionSource ?? "").toLowerCase();
  const medium = (row.attributionMedium ?? "").toLowerCase();
  const provider = row.attributionAdProvider;
  const hasPaidMedium = isPaidMedium(medium);

  if (provider === "google-ads" || provider === "bing-ads") return "Paid search";
  if (provider === "linkedin-ads") return "Paid social";
  if (provider === "meta-ads" && hasPaidMedium) return "Paid social";
  if (
    hasPaidMedium &&
    (source.includes("google") ||
      source.includes("bing") ||
      source.includes("microsoft"))
  ) {
    return "Paid search";
  }
  if (
    hasPaidMedium &&
    (source.includes("meta") ||
      source.includes("facebook") ||
      source.includes("instagram") ||
      source.includes("linkedin"))
  ) {
    return "Paid social";
  }
  if (source.includes("email") || medium.includes("email") || source.includes("sms") || medium.includes("sms")) {
    return "Email / SMS";
  }
  if (source === "direct" || (!row.referrer && !source)) return "Direct";
  if (source || row.referrer) return "Referral";
  return "Unknown";
}

function isPaidMedium(medium: string) {
  return (
    medium.includes("cpc") ||
    medium.includes("ppc") ||
    medium.includes("paid")
  );
}

function countryName(countryCode: string | null) {
  if (!countryCode) return null;

  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(countryCode) ?? null;
  } catch {
    return null;
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function toCsv(rows: string[][]) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
