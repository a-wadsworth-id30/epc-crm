"use client";

import dynamic from "next/dynamic";
import type {
  AttributionFeatureSettings,
  AttributionInstallPanelSection,
} from "@/components/crm-boilerplate/AttributionInstallPanel";
import type { AttributionConsentDomain } from "@/components/crm-boilerplate/AttributionConsentSettingsPanel";
import type { AttributionDiagnosticsOverview } from "@/components/crm-boilerplate/AttributionDiagnosticsPanel";
import type { AttributionRulesOverview } from "@/components/crm-boilerplate/AttributionRulesPanel";
import type {
  AttributionSessionSettings,
  AttributionSessionSettingsOverview,
} from "@/components/crm-boilerplate/AttributionSessionSettingsPanel";

type PoolNumber = {
  id: string;
  phoneNumber: string;
  label: string | null;
  isActive: boolean;
  priority: number;
  metadata: unknown;
  createdAt: string;
  assignments: number;
  records: number;
};

type AttributionDomainOption = {
  id: string;
  domain: string;
  label: string | null;
  environment: string;
  isActive: boolean;
};

type AttributionInstallPanelProps = {
  baseUrl: string;
  trackingNumbers: number;
  activeAssignments: number;
  recentRecords: number;
  featureSettings: AttributionFeatureSettings;
  numberPool: PoolNumber[];
  domains?: AttributionDomainOption[];
  domainRegistryUnavailable?: boolean;
  sections?: AttributionInstallPanelSection[];
};

type AttributionDomainRow = {
  id: string;
  domain: string;
  label: string | null;
  environment: string;
  isActive: boolean;
  lastConfigRequestAt: string | null;
  lastScriptSeenAt: string | null;
  lastInstallCheckAt: string | null;
  lastInstallStatus: string | null;
  lastInstallUrl: string | null;
  trackingEnabled: boolean | null;
  consentRequired: boolean | null;
  formTrackingEnabled: boolean | null;
  phoneTrackingEnabled: boolean | null;
  visibleNumberReplacementEnabled: boolean | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  installChecks: Array<{
    id: string;
    checkedUrl: string;
    status: string;
    httpStatus: number | null;
    issues: unknown;
    createdAt: string;
  }>;
};

type AttributionDomainsPanelProps = {
  domains: AttributionDomainRow[];
  registryUnavailable?: boolean;
};

type AttributionSessionSettingsPanelProps = {
  overview: AttributionSessionSettingsOverview;
  settings: AttributionSessionSettings;
};

type AttributionRulesPanelProps = {
  overview: AttributionRulesOverview;
};

type AttributionConsentSettingsPanelProps = {
  consentRequirements: unknown;
  domains: AttributionConsentDomain[];
  featureSettings: AttributionFeatureSettings;
  registryUnavailable: boolean;
  sessionSettings: AttributionSessionSettings;
};

type AttributionDiagnosticsPanelProps = {
  featureSettings: AttributionFeatureSettings;
  overview: AttributionDiagnosticsOverview;
  sessionSettings: AttributionSessionSettings;
};

const DynamicAttributionInstallPanel =
  dynamic<AttributionInstallPanelProps>(() =>
    import("@/components/crm-boilerplate/AttributionInstallPanel"),
  );
const DynamicAttributionDomainsPanel =
  dynamic<AttributionDomainsPanelProps>(() =>
    import("@/components/crm-boilerplate/AttributionDomainsPanel"),
  );
const DynamicAttributionSessionSettingsPanel =
  dynamic<AttributionSessionSettingsPanelProps>(() =>
    import("@/components/crm-boilerplate/AttributionSessionSettingsPanel"),
  );
const DynamicAttributionRulesPanel =
  dynamic<AttributionRulesPanelProps>(() =>
    import("@/components/crm-boilerplate/AttributionRulesPanel"),
  );
const DynamicAttributionConsentSettingsPanel =
  dynamic<AttributionConsentSettingsPanelProps>(() =>
    import("@/components/crm-boilerplate/AttributionConsentSettingsPanel"),
  );
const DynamicAttributionDiagnosticsPanel =
  dynamic<AttributionDiagnosticsPanelProps>(() =>
    import("@/components/crm-boilerplate/AttributionDiagnosticsPanel"),
  );
const DynamicAttributionLeadEndpointMapper = dynamic<{ baseUrl: string }>(() =>
  import("@/components/crm-boilerplate/AttributionLeadEndpointMapper"),
);

export function AttributionInstallPanel(props: AttributionInstallPanelProps) {
  return <DynamicAttributionInstallPanel {...props} />;
}

export function AttributionDomainsPanel(props: AttributionDomainsPanelProps) {
  return <DynamicAttributionDomainsPanel {...props} />;
}

export function AttributionSessionSettingsPanel(
  props: AttributionSessionSettingsPanelProps,
) {
  return <DynamicAttributionSessionSettingsPanel {...props} />;
}

export function AttributionRulesPanel(props: AttributionRulesPanelProps) {
  return <DynamicAttributionRulesPanel {...props} />;
}

export function AttributionConsentSettingsPanel(
  props: AttributionConsentSettingsPanelProps,
) {
  return <DynamicAttributionConsentSettingsPanel {...props} />;
}

export function AttributionDiagnosticsPanel(
  props: AttributionDiagnosticsPanelProps,
) {
  return <DynamicAttributionDiagnosticsPanel {...props} />;
}

export function AttributionLeadEndpointMapper(props: { baseUrl: string }) {
  return <DynamicAttributionLeadEndpointMapper {...props} />;
}
