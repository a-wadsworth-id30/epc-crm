import { notFound } from "next/navigation";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import {
  AttributionConsentSettingsPanel,
  AttributionDiagnosticsPanel,
  AttributionDomainsPanel,
  AttributionInstallPanel,
  AttributionLeadEndpointMapper,
  AttributionRulesPanel,
  AttributionSessionSettingsPanel,
} from "@/components/crm-boilerplate/AttributionSettingsPanelLoader";
import type {
  AttributionFeatureSettings,
  AttributionInstallPanelSection,
} from "@/components/crm-boilerplate/AttributionInstallPanel";
import type {
  AttributionDiagnosticsOverview,
} from "@/components/crm-boilerplate/AttributionDiagnosticsPanel";
import type {
  AttributionRulesOverview,
} from "@/components/crm-boilerplate/AttributionRulesPanel";
import type {
  AttributionSessionSettings,
  AttributionSessionSettingsOverview,
} from "@/components/crm-boilerplate/AttributionSessionSettingsPanel";
import TrackingEngineTabs from "@/components/crm-boilerplate/TrackingEngineTabs";
import { requireAdmin } from "@/lib/auth";
import {
  attributionSettingsSections,
  findAttributionSettingsSection,
  type AttributionSettingsSectionSlug,
} from "@/lib/attribution/settings-sections";
import { prisma } from "@/lib/prisma";
import { getCrmSettings } from "@/lib/settings";
import { isMissingAttributionDebugEventTable } from "@/lib/attribution/debug-events";

function appBaseUrl() {
  return (
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://crm.id30.com"
  ).replace(/\/$/, "");
}

export function generateStaticParams() {
  return attributionSettingsSections.map((section) => ({
    section: section.slug,
  }));
}

export default async function AttributionSettingsSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ debugPage?: string }>;
}) {
  const { section: sectionSlug } = await params;
  const query = await searchParams;
  const section = findAttributionSettingsSection(sectionSlug);

  if (!section) notFound();

  await requireAdmin();

  const baseUrl = appBaseUrl();
  const featureSettings = await loadFeatureSettings();

  return (
    <>
      <PageHeader title={section.title} description={section.description} />
      <TrackingEngineTabs activeSection={section.slug} />
      <div className="mt-6">
        <AttributionSectionContent
          section={section.slug}
          baseUrl={baseUrl}
          debugPage={normalisePage(query.debugPage)}
          featureSettings={featureSettings}
        />
      </div>
    </>
  );
}

async function loadFeatureSettings(): Promise<AttributionFeatureSettings> {
  const settings = await getCrmSettings();

  return {
    attributionTrackingEnabled: settings.attributionTrackingEnabled,
    attributionFormTrackingEnabled: settings.attributionFormTrackingEnabled,
    attributionInjectHiddenFieldEnabled: settings.attributionInjectHiddenFieldEnabled,
    attributionPhoneTrackingEnabled: settings.attributionPhoneTrackingEnabled,
    attributionReplaceTelLinksEnabled: settings.attributionReplaceTelLinksEnabled,
    attributionReplaceVisibleNumbersEnabled:
      settings.attributionReplaceVisibleNumbersEnabled,
    attributionRequireConsent: settings.attributionRequireConsent,
  };
}

async function loadSessionSettings(): Promise<AttributionSessionSettings> {
  const settings = await getCrmSettings();

  return {
    attributionSessionTimeoutMinutes: settings.attributionSessionTimeoutMinutes,
    attributionTimelineLimit: settings.attributionTimelineLimit,
    attributionRetentionDays: settings.attributionRetentionDays,
    attributionCaptureReferrerEnabled: settings.attributionCaptureReferrerEnabled,
  };
}

async function loadSessionSettingsOverview(): Promise<AttributionSessionSettingsOverview> {
  const now = new Date();
  const soon = new Date(now.getTime() + 15 * 60 * 1000);

  const [
    snapshotCount,
    uniqueVisitors,
    uniqueSessions,
    recentSnapshots,
    activeAssignments,
    expiringAssignments,
    activeNumbers,
    totalNumbers,
    recentAssignments,
  ] = await Promise.all([
    prisma.attributionSnapshot.count(),
    prisma.attributionSnapshot.findMany({
      distinct: ["visitorId"],
      select: { visitorId: true },
      take: 10000,
    }),
    prisma.attributionSnapshot.findMany({
      distinct: ["sessionId"],
      select: { sessionId: true },
      take: 10000,
    }),
    prisma.attributionSnapshot.findMany({
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: {
        id: true,
        visitorId: true,
        sessionId: true,
        landingPage: true,
        currentPage: true,
        referrer: true,
        updatedAt: true,
      },
    }),
    prisma.attributionNumberAssignment.count({
      where: { expiresAt: { gt: now } },
    }),
    prisma.attributionNumberAssignment.count({
      where: { expiresAt: { gt: now, lte: soon } },
    }),
    prisma.attributionPhoneNumber.count({ where: { isActive: true } }),
    prisma.attributionPhoneNumber.count(),
    prisma.attributionNumberAssignment.findMany({
      where: { expiresAt: { gt: now } },
      orderBy: { lastSeenAt: "desc" },
      take: 6,
      select: {
        assignedAt: true,
        expiresAt: true,
        id: true,
        lastSeenAt: true,
        sessionId: true,
        visitorId: true,
        phoneNumber: {
          select: {
            phoneNumber: true,
            label: true,
            isActive: true,
          },
        },
      },
    }),
  ]);

  return {
    snapshotCount,
    visitorCount: uniqueVisitors.length,
    sessionCount: uniqueSessions.length,
    activeAssignments,
    expiringAssignments,
    activeNumbers,
    totalNumbers,
    recentSnapshots: recentSnapshots.map((snapshot) => ({
      id: snapshot.id,
      visitorId: snapshot.visitorId,
      sessionId: snapshot.sessionId,
      landingPage: snapshot.landingPage,
      currentPage: snapshot.currentPage,
      referrer: snapshot.referrer,
      updatedAt: snapshot.updatedAt.toISOString(),
    })),
    recentAssignments: recentAssignments.map((assignment) => ({
      id: assignment.id,
      visitorId: assignment.visitorId,
      sessionId: assignment.sessionId,
      phoneNumber: assignment.phoneNumber.phoneNumber,
      phoneLabel: assignment.phoneNumber.label,
      phoneActive: assignment.phoneNumber.isActive,
      assignedAt: assignment.assignedAt.toISOString(),
      lastSeenAt: assignment.lastSeenAt.toISOString(),
      expiresAt: assignment.expiresAt.toISOString(),
    })),
  };
}

async function loadAttributionRulesOverview(): Promise<AttributionRulesOverview> {
  const [
    formRecords,
    phoneRecords,
    snapshotsWithReferrer,
    records,
    recentRecords,
    savedRules,
  ] =
    await Promise.all([
      prisma.attributionRecord.count({ where: { source: "FORM" } }),
      prisma.attributionRecord.count({ where: { source: "PHONE" } }),
      prisma.attributionSnapshot.count({ where: { referrer: { not: null } } }),
      prisma.attributionRecord.findMany({
        select: {
          lastTouch: true,
          timeline: true,
        },
        take: 10000,
      }),
      prisma.attributionRecord.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          lastTouch: true,
          timeline: true,
          landingPage: true,
          currentPage: true,
          referrer: true,
          metadata: true,
          createdAt: true,
        },
      }),
      loadSavedAttributionRules(),
    ]);

  return {
    formRecords,
    phoneRecords,
    recordsWithUtmSource: records.filter((record) =>
      Boolean(touchParam(record.lastTouch, "utm_source")),
    ).length,
    recordsWithTimeline: records.filter((record) => timelineLength(record.timeline) > 0)
      .length,
    snapshotsWithReferrer,
    savedRules: savedRules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      ruleType: rule.ruleType,
      matchField: rule.matchField,
      matchOperator: rule.matchOperator,
      matchValue: rule.matchValue,
      outputSource: rule.outputSource,
      outputChannel: rule.outputChannel,
      outputCampaign: rule.outputCampaign,
      priority: rule.priority,
      isActive: rule.isActive,
      notes: rule.notes,
      previewMatches: records.filter((record) =>
        attributionRuleMatches(rule, record),
      ).length,
      updatedAt: rule.updatedAt.toISOString(),
    })),
    recentRules: recentRecords.map((record) => {
      const submittedSource = submittedSourceFromMetadata(record.metadata);
      const utmSource = touchParam(record.lastTouch, "utm_source");

      return {
        id: record.id,
        submittedSource,
        utmSource,
        resolvedSource: submittedSource || utmSource || "Website",
        campaign: touchParam(record.lastTouch, "utm_campaign"),
        medium: touchParam(record.lastTouch, "utm_medium"),
        landingPage: record.landingPage,
        currentPage: record.currentPage,
        referrer: record.referrer,
        touchpoints: timelineLength(record.timeline),
        createdAt: record.createdAt.toISOString(),
      };
    }),
  };
}

function attributionRuleMatches(
  rule: {
    matchField: string;
    matchOperator: string;
    matchValue: string;
  },
  record: {
    lastTouch: unknown;
    timeline: unknown;
  },
) {
  const value = attributionRuleFieldValue(rule.matchField, record);
  if (!value) return false;

  const source = value.toLowerCase();
  const match = rule.matchValue.toLowerCase();

  if (rule.matchOperator === "equals") return source === match;
  if (rule.matchOperator === "starts-with") return source.startsWith(match);
  return source.includes(match);
}

function attributionRuleFieldValue(
  field: string,
  record: {
    lastTouch: unknown;
    timeline: unknown;
  },
) {
  if (field.startsWith("utm_")) {
    return touchParam(record.lastTouch, field);
  }

  if (field === "landingPage" || field === "currentPage" || field === "referrer") {
    const touch = record.lastTouch;
    if (!touch || typeof touch !== "object" || Array.isArray(touch)) return null;
    const value = (touch as Record<string, unknown>)[field];
    return typeof value === "string" ? value : null;
  }

  return null;
}

async function loadSavedAttributionRules() {
  try {
    return await prisma.attributionRule.findMany({
      orderBy: [{ isActive: "desc" }, { priority: "desc" }, { createdAt: "asc" }],
      take: 50,
    });
  } catch (error) {
    if (!isMissingAttributionRuleTable(error)) {
      throw error;
    }

    return [];
  }
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

async function loadAttributionDiagnosticsOverview(
  baseUrl: string,
  debugPage: number,
): Promise<AttributionDiagnosticsOverview> {
  const now = new Date();
  const debugPageSize = 50;
  const domainRegistry = await loadAttributionDomains();
  const debugEventTotal = await loadDebugEventCount();
  const debugEventTotalPages = Math.max(1, Math.ceil(debugEventTotal / debugPageSize));
  const effectiveDebugPage = Math.min(debugPage, debugEventTotalPages);
  const [
    snapshots,
    records,
    activeAssignments,
    trackingNumbers,
    recentDebugEvents,
    recentRecords,
    recentAssignments,
  ] = await Promise.all([
    prisma.attributionSnapshot.count(),
    prisma.attributionRecord.count(),
    prisma.attributionNumberAssignment.count({ where: { expiresAt: { gt: now } } }),
    prisma.attributionPhoneNumber.count({ where: { isActive: true } }),
    loadRecentDebugEvents(effectiveDebugPage, debugPageSize),
    prisma.attributionRecord.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        source: true,
        visitorId: true,
        sessionId: true,
        trackingPhoneNumber: true,
        currentPage: true,
        landingPage: true,
        createdAt: true,
      },
    }),
    prisma.attributionNumberAssignment.findMany({
      where: { expiresAt: { gt: now } },
      orderBy: { lastSeenAt: "desc" },
      take: 5,
      select: {
        expiresAt: true,
        id: true,
        lastSeenAt: true,
        metadata: true,
        sessionId: true,
        visitorId: true,
        phoneNumber: {
          select: {
            phoneNumber: true,
            label: true,
          },
        },
      },
    }),
  ]);

  const debugEvents = recentDebugEvents.map((event) => ({
    id: `debug-${event.id}`,
    type: event.level === "error" ? "Error" : event.level === "warning" ? "Warning" : "Debug",
    source: event.eventType,
    visitorId: event.visitorId,
    sessionId: event.sessionId,
    hostname: event.hostname,
    origin: event.origin,
    path: event.path,
    ipAddress: event.ipAddress,
    level: event.level,
    detail:
      event.message ||
      event.hostname ||
      event.path ||
      "Attribution debug event captured.",
    domainDecision: configDecisionFromMetadata(event.metadata),
    createdAt: event.createdAt.toISOString(),
  }));
  const recordEvents = recentRecords.map((record) => ({
    id: `record-${record.id}`,
    type: "Record",
    source: record.source,
    visitorId: record.visitorId,
    sessionId: record.sessionId,
    hostname: null,
    origin: null,
    path: record.currentPage ?? record.landingPage,
    ipAddress: null,
    level: "info",
    detail:
      record.trackingPhoneNumber ||
      record.currentPage ||
      record.landingPage ||
      "Attribution record captured.",
    domainDecision: null,
    createdAt: record.createdAt.toISOString(),
  }));
  const assignmentEvents = recentAssignments.map((assignment) => {
    const dniRule = dniRuleFromAssignmentMetadata(assignment.metadata);
    const dniDetail = [
      dniRule.ruleName ? `DNI ${dniRule.ruleName}` : null,
      dniRule.poolLabel ? `Pool ${dniRule.poolLabel}` : null,
      dniRule.fallbackReason ? `Fallback ${dniRule.fallbackReason}` : null,
    ]
      .filter(Boolean)
      .join(" / ");

    return {
      id: `assignment-${assignment.id}`,
      type: "Number lease",
      source: assignment.phoneNumber.label || assignment.phoneNumber.phoneNumber,
      visitorId: assignment.visitorId,
      sessionId: assignment.sessionId,
      hostname: null,
      origin: null,
      path: null,
      ipAddress: null,
      level: "info",
      detail: `${dniDetail ? `${dniDetail}. ` : ""}Expires ${assignment.expiresAt.toISOString()}`,
      domainDecision: null,
      createdAt: assignment.lastSeenAt.toISOString(),
    };
  });

  return {
    apiBase: baseUrl,
    activeDomains: domainRegistry.domains.filter((domain) => domain.isActive).length,
    totalDomains: domainRegistry.domains.length,
    registryUnavailable: domainRegistry.registryUnavailable,
    snapshots,
    records,
    activeAssignments,
    trackingNumbers,
    debugEventsPage: effectiveDebugPage,
    debugEventsPageSize: debugPageSize,
    debugEventsTotal: debugEventTotal,
    domains: domainRegistry.domains.map((domain) => ({
      id: domain.id,
      domain: domain.domain,
      label: domain.label,
      environment: domain.environment,
      isActive: domain.isActive,
    })),
    recentEvents: [...debugEvents, ...recordEvents, ...assignmentEvents]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 50),
  };
}

async function loadRecentDebugEvents(page: number, pageSize: number) {
  try {
    return await prisma.attributionDebugEvent.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        eventType: true,
        level: true,
        message: true,
        hostname: true,
        origin: true,
        path: true,
        visitorId: true,
        sessionId: true,
        ipAddress: true,
        metadata: true,
        createdAt: true,
      },
    });
  } catch (error) {
    if (!isMissingAttributionDebugEventTable(error)) {
      throw error;
    }

    return [];
  }
}

async function loadDebugEventCount() {
  try {
    return await prisma.attributionDebugEvent.count();
  } catch (error) {
    if (!isMissingAttributionDebugEventTable(error)) {
      throw error;
    }

    return 0;
  }
}

function configDecisionFromMetadata(metadata: unknown) {
  const record = jsonObject(metadata);
  if (!record || !("enabled" in record || "registered" in record || "reason" in record)) {
    return null;
  }

  return {
    enabled: booleanFromJson(record.enabled),
    registered: booleanFromJson(record.registered),
    reason: stringFromJson(record.reason),
  };
}

async function loadAttributionDomains() {
  try {
    const domains = await prisma.attributionDomain.findMany({
      orderBy: [
        { isActive: "desc" },
        { environment: "asc" },
        { domain: "asc" },
      ],
      select: {
        consentRequired: true,
        createdAt: true,
        domain: true,
        environment: true,
        formTrackingEnabled: true,
        id: true,
        isActive: true,
        label: true,
        lastConfigRequestAt: true,
        lastInstallCheckAt: true,
        lastInstallStatus: true,
        lastInstallUrl: true,
        lastScriptSeenAt: true,
        notes: true,
        phoneTrackingEnabled: true,
        trackingEnabled: true,
        updatedAt: true,
        visibleNumberReplacementEnabled: true,
        installChecks: {
          orderBy: { createdAt: "desc" },
          take: 3,
          select: {
            checkedUrl: true,
            createdAt: true,
            httpStatus: true,
            id: true,
            issues: true,
            status: true,
          },
        },
      },
    });

    return { domains, registryUnavailable: false };
  } catch (error) {
    if (!isMissingAttributionDomainTable(error)) {
      throw error;
    }

    return { domains: [], registryUnavailable: true };
  }
}

async function loadInstallPanelData() {
  const [
    trackingNumbers,
    activeAssignments,
    recentRecords,
    numberPool,
    domainRegistry,
  ] = await Promise.all([
    prisma.attributionPhoneNumber.count({ where: { isActive: true } }),
    prisma.attributionNumberAssignment.count({
      where: { expiresAt: { gt: new Date() } },
    }),
    prisma.attributionRecord.count(),
    prisma.attributionPhoneNumber.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      take: 50,
      select: {
        createdAt: true,
        id: true,
        isActive: true,
        label: true,
        metadata: true,
        phoneNumber: true,
        priority: true,
        _count: {
          select: {
            assignments: true,
            records: true,
          },
        },
      },
    }),
    loadAttributionDomains(),
  ]);

  return {
    trackingNumbers,
    activeAssignments,
    recentRecords,
    numberPool: numberPool.map((number) => ({
      id: number.id,
      phoneNumber: number.phoneNumber,
      label: number.label,
      isActive: number.isActive,
      priority: number.priority,
      metadata: number.metadata,
      createdAt: number.createdAt.toISOString(),
      assignments: number._count.assignments,
      records: number._count.records,
    })),
    domains: domainRegistry.domains.map((domain) => ({
      id: domain.id,
      domain: domain.domain,
      label: domain.label,
      environment: domain.environment,
      isActive: domain.isActive,
      lastConfigRequestAt: domain.lastConfigRequestAt?.toISOString() ?? null,
      lastScriptSeenAt: domain.lastScriptSeenAt?.toISOString() ?? null,
      lastInstallCheckAt: domain.lastInstallCheckAt?.toISOString() ?? null,
      lastInstallStatus: domain.lastInstallStatus,
      lastInstallUrl: domain.lastInstallUrl,
    })),
    domainRegistryUnavailable: domainRegistry.registryUnavailable,
  };
}

async function InstallPanelSection({
  baseUrl,
  featureSettings,
  sections,
}: {
  baseUrl: string;
  featureSettings: AttributionFeatureSettings;
  sections: AttributionInstallPanelSection[];
}) {
  const panelData = await loadInstallPanelData();

  return (
    <AttributionInstallPanel
      baseUrl={baseUrl}
      featureSettings={featureSettings}
      sections={sections}
      {...panelData}
    />
  );
}

async function AttributionSectionContent({
  section,
  baseUrl,
  debugPage,
  featureSettings,
}: {
  section: AttributionSettingsSectionSlug;
  baseUrl: string;
  debugPage: number;
  featureSettings: AttributionFeatureSettings;
}) {
  if (section === "tracking-script") {
    return (
      <InstallPanelSection
        baseUrl={baseUrl}
        featureSettings={featureSettings}
        sections={[
          "metrics",
          "script",
          "feature-controls",
          "installation-check",
          "number-pool",
        ]}
      />
    );
  }

  if (section === "form-tracking") {
    return (
      <div className="space-y-6">
        <InstallPanelSection
          baseUrl={baseUrl}
          featureSettings={featureSettings}
          sections={["feature-controls", "form-intro"]}
        />
        <AttributionLeadEndpointMapper baseUrl={baseUrl} />
      </div>
    );
  }

  if (section === "domains") {
    const domainRegistry = await loadAttributionDomains();

    return (
      <AttributionDomainsPanel
        domains={domainRegistry.domains.map((domain) => ({
          id: domain.id,
          domain: domain.domain,
          label: domain.label,
          environment: domain.environment,
          isActive: domain.isActive,
          lastConfigRequestAt: domain.lastConfigRequestAt?.toISOString() ?? null,
          lastScriptSeenAt: domain.lastScriptSeenAt?.toISOString() ?? null,
          lastInstallCheckAt: domain.lastInstallCheckAt?.toISOString() ?? null,
          lastInstallStatus: domain.lastInstallStatus,
          lastInstallUrl: domain.lastInstallUrl,
          trackingEnabled: domain.trackingEnabled,
          consentRequired: domain.consentRequired,
          formTrackingEnabled: domain.formTrackingEnabled,
          phoneTrackingEnabled: domain.phoneTrackingEnabled,
          visibleNumberReplacementEnabled:
            domain.visibleNumberReplacementEnabled,
          notes: domain.notes,
          createdAt: domain.createdAt.toISOString(),
          updatedAt: domain.updatedAt.toISOString(),
          installChecks: domain.installChecks.map((check) => ({
            id: check.id,
            checkedUrl: check.checkedUrl,
            status: check.status,
            httpStatus: check.httpStatus,
            issues: check.issues,
            createdAt: check.createdAt.toISOString(),
          })),
        }))}
        registryUnavailable={domainRegistry.registryUnavailable}
      />
    );
  }

  if (section === "session-settings") {
    const [sessionSettings, overview] = await Promise.all([
      loadSessionSettings(),
      loadSessionSettingsOverview(),
    ]);

    return (
      <AttributionSessionSettingsPanel
        overview={overview}
        settings={sessionSettings}
      />
    );
  }

  if (section === "attribution-rules") {
    const overview = await loadAttributionRulesOverview();

    return <AttributionRulesPanel overview={overview} />;
  }

  if (section === "consent-settings") {
    const [sessionSettings, domainRegistry, crmSettings] = await Promise.all([
      loadSessionSettings(),
      loadAttributionDomains(),
      getCrmSettings(),
    ]);

    return (
      <AttributionConsentSettingsPanel
        consentRequirements={crmSettings.attributionConsentRequirements}
        domains={domainRegistry.domains.map((domain) => ({
          id: domain.id,
          domain: domain.domain,
          label: domain.label,
          environment: domain.environment,
          isActive: domain.isActive,
        }))}
        featureSettings={featureSettings}
        registryUnavailable={domainRegistry.registryUnavailable}
        sessionSettings={sessionSettings}
      />
    );
  }

  const [sessionSettings, overview] = await Promise.all([
    loadSessionSettings(),
    loadAttributionDiagnosticsOverview(baseUrl, debugPage),
  ]);

  return (
    <AttributionDiagnosticsPanel
      featureSettings={featureSettings}
      overview={overview}
      sessionSettings={sessionSettings}
    />
  );
}

function isMissingAttributionDomainTable(error: unknown) {
  const candidate = error as {
    code?: string;
    meta?: {
      modelName?: string;
      table?: string;
    };
  };

  return (
    (candidate.code === "P2021" &&
      (candidate.meta?.modelName === "AttributionDomain" ||
        candidate.meta?.table?.includes("AttributionDomain"))) ||
    (candidate.code === "P2022" && candidate.meta?.modelName === "AttributionDomain")
  );
}

function normalisePage(value: string | undefined) {
  const page = Number(value ?? "1");
  return Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function touchParam(touch: unknown, key: string) {
  const params = jsonObject(jsonObject(touch)?.params);
  const value = params?.[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function timelineLength(timeline: unknown) {
  return Array.isArray(timeline) ? timeline.length : 0;
}

function submittedSourceFromMetadata(metadata: unknown) {
  const rawPayload = jsonObject(jsonObject(metadata)?.rawPayload);
  const value = rawPayload?.source;

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function dniRuleFromAssignmentMetadata(metadata: unknown) {
  const dniRule = jsonObject(jsonObject(metadata)?.dniRule);

  return {
    ruleName: stringFromJson(dniRule?.ruleName),
    poolLabel: stringFromJson(dniRule?.poolLabel),
    fallbackReason: stringFromJson(dniRule?.fallbackReason),
  };
}

function stringFromJson(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanFromJson(value: unknown) {
  return typeof value === "boolean" ? value : null;
}
