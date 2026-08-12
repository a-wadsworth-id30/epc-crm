import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { normalizeCallableNumber } from "@/lib/integrations/twilio-server";
import { prisma } from "@/lib/prisma";

export const attributionQueryParams = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "msclkid",
  "ttclid",
  "li_fat_id",
] as const;

export const attributionAssignmentTtlMs = 30 * 60 * 1000;
const fallbackAssignmentWindowMinutes = 30;

const jsonRecord = z.record(z.string(), z.unknown());

export const attributionTouchSchema = z
  .object({
    capturedAt: z.string().optional(),
    url: z.string().optional(),
    landingPage: z.string().optional(),
    referrer: z.string().optional(),
    params: jsonRecord.optional(),
  })
  .passthrough();

export const attributionPayloadSchema = z
  .object({
    visitorId: z.string().trim().min(1).max(128).optional(),
    sessionId: z.string().trim().min(1).max(128).optional(),
    firstTouch: attributionTouchSchema.nullish(),
    lastTouch: attributionTouchSchema.nullish(),
    timeline: z.array(attributionTouchSchema).max(250).optional(),
    landingPage: z.string().trim().max(2048).optional(),
    currentPage: z.string().trim().max(2048).optional(),
    referrer: z.string().trim().max(2048).optional(),
  })
  .passthrough();

export type AttributionPayload = z.infer<typeof attributionPayloadSchema>;

export type AttributionSnapshotData = {
  visitorId: string | null;
  sessionId: string | null;
  firstTouch: Prisma.InputJsonValue | null;
  lastTouch: Prisma.InputJsonValue | null;
  timeline: Prisma.InputJsonValue | null;
  landingPage: string | null;
  currentPage: string | null;
  referrer: string | null;
};

type DniRuleResolution = {
  ruleId: string | null;
  ruleName: string | null;
  poolLabel: string | null;
  fallbackNumber: string | null;
  matched: boolean;
  fallbackReason: string | null;
};

function jsonOrNull(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) {
    return null;
  }

  return value as Prisma.InputJsonValue;
}

function nullableJson(value: Prisma.InputJsonValue | null) {
  return value ?? Prisma.JsonNull;
}

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function locationObject(value: unknown): Prisma.InputJsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const location = {
    city: stringField(record.city),
    region: stringField(record.region),
    country: stringField(record.country),
    countryCode: stringField(record.countryCode)?.toUpperCase() ?? null,
    timezone: stringField(record.timezone),
    source: stringField(record.source),
  } satisfies Record<string, string | null>;

  return Object.values(location).some(Boolean)
    ? (location as Prisma.InputJsonObject)
    : null;
}

function mergeLocation(
  existing: unknown,
  incoming: Prisma.InputJsonValue | null | undefined,
) {
  if (incoming === undefined) {
    return undefined;
  }

  const existingLocation = locationObject(existing);
  const incomingLocation = locationObject(incoming);

  if (!incomingLocation) {
    return existingLocation ?? null;
  }

  if (!existingLocation) {
    return incomingLocation;
  }

  const merged = {
    city: stringField(incomingLocation.city) ?? stringField(existingLocation.city),
    region: stringField(incomingLocation.region) ?? stringField(existingLocation.region),
    country: stringField(incomingLocation.country) ?? stringField(existingLocation.country),
    countryCode:
      stringField(incomingLocation.countryCode)?.toUpperCase() ??
      stringField(existingLocation.countryCode)?.toUpperCase() ??
      null,
    timezone:
      stringField(incomingLocation.timezone) ?? stringField(existingLocation.timezone),
    source:
      stringField(incomingLocation.source) && stringField(existingLocation.source)
        ? stringField(incomingLocation.source) === stringField(existingLocation.source)
          ? stringField(incomingLocation.source)
          : "combined"
        : stringField(incomingLocation.source) ?? stringField(existingLocation.source),
  } satisfies Record<string, string | null>;

  return Object.values(merged).some(Boolean)
    ? (merged as Prisma.InputJsonObject)
    : null;
}

export function parseAttributionPayload(value: unknown): AttributionSnapshotData {
  const parsed = attributionPayloadSchema.safeParse(value ?? {});

  if (!parsed.success) {
    return {
      visitorId: null,
      sessionId: null,
      firstTouch: null,
      lastTouch: null,
      timeline: null,
      landingPage: null,
      currentPage: null,
      referrer: null,
    };
  }

  const data = parsed.data;

  return {
    visitorId: data.visitorId ?? null,
    sessionId: data.sessionId ?? null,
    firstTouch: jsonOrNull(data.firstTouch),
    lastTouch: jsonOrNull(data.lastTouch),
    timeline: jsonOrNull(data.timeline ?? []),
    landingPage: data.landingPage ?? data.firstTouch?.landingPage ?? null,
    currentPage: data.currentPage ?? data.lastTouch?.url ?? null,
    referrer: data.referrer ?? data.lastTouch?.referrer ?? null,
  };
}

export function attributionRecordMetadata(data: AttributionSnapshotData) {
  return {
    visitorId: data.visitorId,
    sessionId: data.sessionId,
    firstTouch: data.firstTouch,
    lastTouch: data.lastTouch,
    timeline: data.timeline,
    landingPage: data.landingPage,
    currentPage: data.currentPage,
    referrer: data.referrer,
  } satisfies Prisma.InputJsonObject;
}

function touchParamValue(
  attribution: AttributionSnapshotData,
  key: string,
): string | null {
  const lastTouch = attribution.lastTouch;

  if (!lastTouch || typeof lastTouch !== "object" || Array.isArray(lastTouch)) {
    return null;
  }

  const params = (lastTouch as { params?: unknown }).params;
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return null;
  }

  const value = (params as Record<string, unknown>)[key];
  return typeof value === "string" && value ? value : null;
}

function touchParams(value: Prisma.InputJsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const params = (value as { params?: unknown }).params;
  if (!params || typeof params !== "object" || Array.isArray(params)) return {};
  return params as Record<string, unknown>;
}

function paramsString(params: Record<string, unknown>, key: string) {
  const value = params[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function referrerHost(value: string | null) {
  if (!value) return null;

  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function attributionClickId(params: Record<string, unknown>) {
  const clickIds = [
    ["gclid", "GCLID"],
    ["gbraid", "GBRAID"],
    ["wbraid", "WBRAID"],
    ["msclkid", "MSCLKID"],
    ["fbclid", "FBCLID"],
    ["ttclid", "TTCLID"],
    ["li_fat_id", "LinkedIn click ID"],
  ] as const;

  for (const [key, type] of clickIds) {
    const value = paramsString(params, key);
    if (value) {
      return { type, value };
    }
  }

  return { type: null, value: null };
}

function attributionAdProvider(params: Record<string, unknown>) {
  const source = paramsString(params, "utm_source")?.toLowerCase() ?? "";
  const medium = paramsString(params, "utm_medium")?.toLowerCase() ?? "";

  if (paramsString(params, "gclid") || paramsString(params, "gbraid") || paramsString(params, "wbraid")) {
    return "google-ads";
  }

  if (paramsString(params, "msclkid")) return "bing-ads";
  if (paramsString(params, "li_fat_id")) return "linkedin-ads";
  if (source.includes("google") && /(cpc|ppc|paid|search)/.test(medium)) return "google-ads";
  if ((source.includes("bing") || source.includes("microsoft")) && /(cpc|ppc|paid|search)/.test(medium)) return "bing-ads";
  if (
    (paramsString(params, "fbclid") ||
      source.includes("facebook") ||
      source.includes("instagram") ||
      source.includes("meta")) &&
    /(paid|cpc|ppc)/.test(medium)
  ) {
    return "meta-ads";
  }
  if (source.includes("linkedin") && /(paid|cpc|ppc)/.test(medium)) return "linkedin-ads";

  return null;
}

function attributionSnapshotSourceFields(attribution: AttributionSnapshotData) {
  const params = {
    ...touchParams(attribution.firstTouch),
    ...touchParams(attribution.lastTouch),
  };
  const click = attributionClickId(params);
  const source =
    paramsString(params, "utm_source") ||
    referrerHost(attribution.referrer) ||
    "Direct";

  return {
    attributionSource: source,
    attributionMedium: paramsString(params, "utm_medium"),
    attributionCampaign: paramsString(params, "utm_campaign"),
    attributionAdProvider: attributionAdProvider(params),
    attributionClickId: click.value,
    attributionClickIdType: click.type,
  };
}

type AttributionTouchpointClient = Pick<
  Prisma.TransactionClient,
  "attributionTouchpoint"
>;

type NormalizedTouchpointRole = "FIRST" | "ASSISTED" | "LAST" | "FIRST_LAST";

function touchObject(value: Prisma.InputJsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function touchArray(value: Prisma.InputJsonValue | null) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function touchSignature(touch: Record<string, unknown>) {
  const params = touch.params && typeof touch.params === "object" ? touch.params : null;

  return JSON.stringify({
    capturedAt: stringField(touch.capturedAt),
    landingPage: stringField(touch.landingPage),
    params,
    referrer: stringField(touch.referrer),
    url: stringField(touch.url),
  });
}

function capturedAtDate(value: unknown) {
  const text = stringField(value);
  if (!text) return null;

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function touchpointMetadata(touch: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(touch)) as Prisma.InputJsonObject;
}

function normalizedTouchpointRow({
  attributionRecordId,
  attributionSnapshotId,
  position,
  role,
  sessionId,
  touch,
  visitorId,
}: {
  attributionRecordId?: string | null;
  attributionSnapshotId?: string | null;
  position: number;
  role: NormalizedTouchpointRole;
  sessionId: string | null;
  touch: Record<string, unknown>;
  visitorId: string | null;
}): Prisma.AttributionTouchpointCreateManyInput {
  const params =
    touch.params && typeof touch.params === "object" && !Array.isArray(touch.params)
      ? (touch.params as Record<string, unknown>)
      : {};
  const referrer = stringField(touch.referrer);

  return {
    id: randomUUID(),
    attributionRecordId: attributionRecordId ?? null,
    attributionSnapshotId: attributionSnapshotId ?? null,
    visitorId,
    sessionId,
    role,
    position,
    source: paramsString(params, "utm_source") || referrerHost(referrer),
    medium: paramsString(params, "utm_medium"),
    campaign: paramsString(params, "utm_campaign"),
    content: paramsString(params, "utm_content"),
    term: paramsString(params, "utm_term"),
    url: stringField(touch.url),
    landingPage: stringField(touch.landingPage),
    referrer,
    capturedAt: capturedAtDate(touch.capturedAt),
    metadata: touchpointMetadata(touch),
  };
}

function normalizedTouchpointRows(
  attribution: AttributionSnapshotData,
  context: {
    attributionRecordId?: string | null;
    attributionSnapshotId?: string | null;
    sessionId: string | null;
    visitorId: string | null;
  },
) {
  const firstTouch = touchObject(attribution.firstTouch);
  const lastTouch = touchObject(attribution.lastTouch);
  const timeline = touchArray(attribution.timeline);
  const rows: Prisma.AttributionTouchpointCreateManyInput[] = [];
  let position = 0;

  if (
    firstTouch &&
    lastTouch &&
    timeline.length === 0 &&
    touchSignature(firstTouch) === touchSignature(lastTouch)
  ) {
    rows.push(
      normalizedTouchpointRow({
        ...context,
        position: position++,
        role: "FIRST_LAST",
        touch: firstTouch,
      }),
    );

    return rows;
  }

  if (firstTouch) {
    rows.push(
      normalizedTouchpointRow({
        ...context,
        position: position++,
        role: "FIRST",
        touch: firstTouch,
      }),
    );
  }

  for (const touch of timeline) {
    rows.push(
      normalizedTouchpointRow({
        ...context,
        position: position++,
        role: "ASSISTED",
        touch,
      }),
    );
  }

  if (lastTouch) {
    rows.push(
      normalizedTouchpointRow({
        ...context,
        position: position++,
        role: "LAST",
        touch: lastTouch,
      }),
    );
  }

  return rows;
}

async function syncAttributionTouchpoints(
  client: AttributionTouchpointClient,
  attribution: AttributionSnapshotData,
  context: {
    attributionRecordId?: string | null;
    attributionSnapshotId?: string | null;
    sessionId: string | null;
    visitorId: string | null;
  },
) {
  if (context.attributionRecordId) {
    await client.attributionTouchpoint.deleteMany({
      where: { attributionRecordId: context.attributionRecordId },
    });
  } else if (context.attributionSnapshotId) {
    await client.attributionTouchpoint.deleteMany({
      where: {
        attributionRecordId: null,
        attributionSnapshotId: context.attributionSnapshotId,
      },
    });
  } else {
    return;
  }

  const rows = normalizedTouchpointRows(attribution, context);
  if (!rows.length) return;

  await client.attributionTouchpoint.createMany({ data: rows });
}

function fieldValueForRule(
  field: string,
  submittedSource: string | null,
  attribution: AttributionSnapshotData,
) {
  if (field === "submittedSource") return submittedSource;
  if (field === "referrer") return attribution.referrer;
  if (field === "landingPage") return attribution.landingPage;
  if (field === "currentPage") return attribution.currentPage;
  if (field.startsWith("utm_")) return touchParamValue(attribution, field);
  return null;
}

function ruleMatches(operator: string, sourceValue: string, matchValue: string) {
  const source = sourceValue.toLowerCase();
  const match = matchValue.toLowerCase();

  if (operator === "equals") return source === match;
  if (operator === "starts-with") return source.startsWith(match);
  if (operator === "ends-with") return source.endsWith(match);
  return source.includes(match);
}

function isMissingDniRuleTable(error: unknown) {
  const candidate = error as {
    code?: string;
    meta?: {
      modelName?: string;
      table?: string;
    };
  };

  return (
    (candidate.code === "P2021" &&
      (candidate.meta?.modelName === "AttributionDniRule" ||
        candidate.meta?.table?.includes("AttributionDniRule"))) ||
    (candidate.code === "P2022" && candidate.meta?.modelName === "AttributionDniRule")
  );
}

async function resolveDniRule(attribution: AttributionSnapshotData): Promise<DniRuleResolution> {
  try {
    const rules = await prisma.attributionDniRule.findMany({
      where: { isActive: true },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 100,
    });
    const defaultRule = rules.find((rule) => rule.isDefault) ?? null;

    for (const rule of rules) {
      if (rule.isDefault) continue;

      const sourceValue = fieldValueForRule(rule.matchField, null, attribution);
      if (!sourceValue || !rule.matchValue) continue;

      if (ruleMatches(rule.matchOperator, sourceValue, rule.matchValue)) {
        return {
          ruleId: rule.id,
          ruleName: rule.name,
          poolLabel: rule.poolLabel,
          fallbackNumber: rule.fallbackNumber,
          matched: true,
          fallbackReason: null,
        };
      }
    }

    if (defaultRule) {
      return {
        ruleId: defaultRule.id,
        ruleName: defaultRule.name,
        poolLabel: defaultRule.poolLabel,
        fallbackNumber: defaultRule.fallbackNumber,
        matched: true,
        fallbackReason: "default-rule",
      };
    }
  } catch (error) {
    if (!isMissingDniRuleTable(error)) {
      throw error;
    }
  }

  return {
    ruleId: null,
    ruleName: null,
    poolLabel: null,
    fallbackNumber: null,
    matched: false,
    fallbackReason: "no-rule",
  };
}

export async function resolveAttributionSource(options: {
  submittedSource?: string | null;
  attribution: AttributionSnapshotData;
}) {
  const submittedSource = options.submittedSource || null;
  const utmSource = touchParamValue(options.attribution, "utm_source");
  const fallbackSource = submittedSource || utmSource || "Website";

  try {
    const rules = await prisma.attributionRule.findMany({
      where: {
        isActive: true,
        ruleType: "source-override",
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 100,
    });

    for (const rule of rules) {
      const sourceValue = fieldValueForRule(
        rule.matchField,
        submittedSource,
        options.attribution,
      );

      if (
        sourceValue &&
        ruleMatches(rule.matchOperator, sourceValue, rule.matchValue) &&
        rule.outputSource
      ) {
        return {
          source: rule.outputSource,
          ruleId: rule.id,
          ruleName: rule.name,
          fallbackSource,
        };
      }
    }
  } catch (error) {
    if (!isMissingAttributionRuleTable(error)) {
      throw error;
    }
  }

  return {
    source: fallbackSource,
    ruleId: null,
    ruleName: null,
    fallbackSource,
  };
}

function isMissingAttributionRuleTable(error: unknown) {
  const candidate = error as {
    code?: string;
    meta?: {
      modelName?: string;
      table?: string;
    };
  };

  return (
    (candidate.code === "P2021" &&
      (candidate.meta?.modelName === "AttributionRule" ||
        candidate.meta?.table?.includes("AttributionRule"))) ||
    (candidate.code === "P2022" && candidate.meta?.modelName === "AttributionRule")
  );
}

export async function upsertAttributionSnapshot(options: {
  attribution: AttributionSnapshotData;
  userAgent?: string | null;
  ipAddress?: string | null;
  location?: Prisma.InputJsonValue | null;
}) {
  const { attribution, userAgent, ipAddress, location } = options;

  if (!attribution.visitorId || !attribution.sessionId) {
    return null;
  }

  const visitorId = attribution.visitorId;
  const sessionId = attribution.sessionId;
  const existingSnapshot =
    location !== undefined
      ? await prisma.attributionSnapshot.findUnique({
          where: {
            visitorId_sessionId: {
              visitorId,
              sessionId,
            },
          },
          select: { location: true },
        })
      : null;
  const mergedLocation = mergeLocation(existingSnapshot?.location, location);
  const sourceFields = attributionSnapshotSourceFields(attribution);

  return prisma.$transaction(async (tx) => {
    const snapshot = await tx.attributionSnapshot.upsert({
      where: {
        visitorId_sessionId: {
          visitorId,
          sessionId,
        },
      },
      update: {
        firstTouch: attribution.firstTouch ?? undefined,
        lastTouch: attribution.lastTouch ?? undefined,
        timeline: attribution.timeline ?? undefined,
        landingPage: attribution.landingPage,
        currentPage: attribution.currentPage,
        referrer: attribution.referrer,
        ...sourceFields,
        userAgent,
        ipAddress,
        ...(mergedLocation !== undefined ? { location: nullableJson(mergedLocation) } : {}),
      },
      create: {
        visitorId,
        sessionId,
        firstTouch: nullableJson(attribution.firstTouch),
        lastTouch: nullableJson(attribution.lastTouch),
        timeline: nullableJson(attribution.timeline),
        landingPage: attribution.landingPage,
        currentPage: attribution.currentPage,
        referrer: attribution.referrer,
        ...sourceFields,
        userAgent,
        ipAddress,
        location: nullableJson(mergedLocation ?? null),
      },
    });

    await syncAttributionTouchpoints(tx, attribution, {
      attributionSnapshotId: snapshot.id,
      sessionId: snapshot.sessionId,
      visitorId: snapshot.visitorId,
    });

    return snapshot;
  });
}

export async function createAttributionRecord(options: {
  source: "FORM" | "PHONE" | "MANUAL";
  attribution: AttributionSnapshotData;
  attributionSnapshotId?: string | null;
  trackingPhoneNumberId?: string | null;
  trackingPhoneNumber?: string | null;
  contactId?: string | null;
  opportunityId?: string | null;
  callLogId?: string | null;
  callQueueEntryId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}) {
  const { attribution } = options;

  return prisma.$transaction(async (tx) => {
    const record = await tx.attributionRecord.create({
      data: {
        source: options.source,
        attributionSnapshotId: options.attributionSnapshotId ?? null,
        trackingPhoneNumberId: options.trackingPhoneNumberId ?? null,
        trackingPhoneNumber: options.trackingPhoneNumber ?? null,
        visitorId: attribution.visitorId,
        sessionId: attribution.sessionId,
        contactId: options.contactId ?? null,
        opportunityId: options.opportunityId ?? null,
        callLogId: options.callLogId ?? null,
        callQueueEntryId: options.callQueueEntryId ?? null,
        firstTouch: nullableJson(attribution.firstTouch),
        lastTouch: nullableJson(attribution.lastTouch),
        timeline: nullableJson(attribution.timeline),
        landingPage: attribution.landingPage,
        currentPage: attribution.currentPage,
        referrer: attribution.referrer,
        metadata: options.metadata ?? Prisma.JsonNull,
      },
    });

    await syncAttributionTouchpoints(tx, attribution, {
      attributionRecordId: record.id,
      sessionId: record.sessionId,
      visitorId: record.visitorId,
    });

    return record;
  });
}

export async function assignTrackingPhoneNumber(options: {
  attribution: AttributionSnapshotData;
  displayOnly?: boolean;
  userAgent?: string | null;
  ipAddress?: string | null;
  location?: Prisma.InputJsonValue | null;
}) {
  const { attribution } = options;
  const now = new Date();
  const settings = await prisma.crmSettings.findUnique({
    where: { id: "default" },
    select: { attributionSessionTimeoutMinutes: true },
  });
  const assignmentWindowMinutes =
    settings?.attributionSessionTimeoutMinutes ?? fallbackAssignmentWindowMinutes;
  const expiresAt = new Date(now.getTime() + assignmentWindowMinutes * 60 * 1000);
  const snapshot = await upsertAttributionSnapshot(options);
  const dniRule = await resolveDniRule(attribution);
  const assignmentMetadata = {
    ...attributionRecordMetadata(attribution),
    dniRule,
    requestLocation: options.location ?? null,
  } satisfies Prisma.InputJsonObject;

  const existing =
    !options.displayOnly && attribution.visitorId && attribution.sessionId
      ? await prisma.attributionNumberAssignment.findFirst({
          where: {
            visitorId: attribution.visitorId,
            sessionId: attribution.sessionId,
            expiresAt: { gt: now },
            phoneNumber: { isActive: true },
          },
          include: { phoneNumber: true },
          orderBy: { assignedAt: "desc" },
        })
      : null;

  if (existing) {
    const assignment = await prisma.attributionNumberAssignment.update({
      where: { id: existing.id },
      data: {
        expiresAt,
        lastSeenAt: now,
        attributionSnapshotId: snapshot?.id ?? existing.attributionSnapshotId,
        metadata: assignmentMetadata,
      },
    });

    return {
      phoneNumber: existing.phoneNumber.phoneNumber,
      assignmentId: assignment.id,
      snapshotId: snapshot?.id ?? existing.attributionSnapshotId,
      dniRule,
    };
  }

  const availableNumbers = await prisma.attributionPhoneNumber.findMany({
    where: {
      isActive: true,
      ...(dniRule.poolLabel ? { label: dniRule.poolLabel } : {}),
    },
    orderBy: [
      { priority: "desc" },
      { createdAt: "asc" },
    ],
    take: 25,
    include: {
      _count: {
        select: {
          assignments: {
            where: { expiresAt: { gt: now } },
          },
        },
      },
    },
  });
  const availableNumber =
    availableNumbers.sort((a, b) => {
      const assignmentDelta = a._count.assignments - b._count.assignments;
      return assignmentDelta || b.priority - a.priority || a.createdAt.getTime() - b.createdAt.getTime();
    })[0] ?? null;

  if (!availableNumber) {
    return {
      phoneNumber: dniRule.fallbackNumber,
      assignmentId: null,
      snapshotId: snapshot?.id ?? null,
      dniRule: {
        ...dniRule,
        fallbackReason: dniRule.poolLabel ? "pool-unavailable" : dniRule.fallbackReason,
      },
    };
  }

  if (options.displayOnly || !attribution.visitorId || !attribution.sessionId) {
    return {
      phoneNumber: availableNumber.phoneNumber,
      assignmentId: null,
      snapshotId: snapshot?.id ?? null,
      dniRule,
    };
  }

  const assignment = await prisma.attributionNumberAssignment.create({
    data: {
      phoneNumberId: availableNumber.id,
      attributionSnapshotId: snapshot?.id ?? null,
      visitorId: attribution.visitorId,
      sessionId: attribution.sessionId,
      expiresAt,
      metadata: assignmentMetadata,
    },
  });

  return {
    phoneNumber: availableNumber.phoneNumber,
    assignmentId: assignment.id,
    snapshotId: snapshot?.id ?? null,
    dniRule,
  };
}

export async function findPhoneAttribution(phoneNumber: string) {
  const normalized = normalizeCallableNumber(phoneNumber);

  if (!normalized) {
    return null;
  }

  const trackingNumber = await prisma.attributionPhoneNumber.findUnique({
    where: { phoneNumber: normalized },
  });

  if (!trackingNumber || !trackingNumber.isActive) {
    return null;
  }

  const assignment = await prisma.attributionNumberAssignment.findFirst({
    where: {
      phoneNumberId: trackingNumber.id,
      expiresAt: { gt: new Date() },
    },
    include: { attributionSnapshot: true },
    orderBy: { lastSeenAt: "desc" },
  });

  if (!assignment) {
    return {
      trackingNumber,
      assignment: null,
      attribution: parseAttributionPayload({}),
      snapshotId: null,
    };
  }

  const snapshot = assignment.attributionSnapshot;
  const attribution = parseAttributionPayload({
    visitorId: assignment.visitorId,
    sessionId: assignment.sessionId,
    firstTouch: snapshot?.firstTouch,
    lastTouch: snapshot?.lastTouch,
    timeline: snapshot?.timeline,
    landingPage: snapshot?.landingPage ?? undefined,
    currentPage: snapshot?.currentPage ?? undefined,
    referrer: snapshot?.referrer ?? undefined,
  });

  return {
    trackingNumber,
    assignment,
    attribution,
    snapshotId: snapshot?.id ?? null,
  };
}
