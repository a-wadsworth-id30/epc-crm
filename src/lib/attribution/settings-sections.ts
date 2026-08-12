export const attributionSettingsSections = [
  {
    slug: "tracking-script",
    legacySection: "tracking-script",
    label: "Tracking Script",
    title: "Tracking Script",
    description:
      "Install the website script, verify coverage and control runtime script features.",
  },
  {
    slug: "domains",
    legacySection: "domains",
    label: "Domains",
    title: "Attribution Domains",
    description:
      "Plan and audit the website domains that should run the CRM attribution script.",
  },
  {
    slug: "session-settings",
    legacySection: "session-settings",
    label: "Session Settings",
    title: "Session Settings",
    description:
      "Review visitor/session capture behaviour and the identifiers used by the website script.",
  },
  {
    slug: "form-tracking",
    legacySection: "form-tracking",
    label: "Form Tracking",
    title: "Form Tracking",
    description:
      "Configure form capture and map website fields into CRM contacts, opportunities and attribution records.",
  },
  {
    slug: "attribution-rules",
    legacySection: "attribution-rules",
    label: "Attribution Rules",
    title: "Attribution Rules",
    description:
      "Define how source, campaign and touchpoint data should be interpreted by CRM reporting.",
  },
  {
    slug: "consent-settings",
    legacySection: "consent-settings",
    label: "Consent Settings",
    title: "Consent Settings",
    description:
      "Document consent requirements before enabling attribution capture on client websites.",
  },
  {
    slug: "debug-logs",
    legacySection: "debug-logs",
    label: "Debug Logs",
    title: "Debug Logs",
    description:
      "Use diagnostics and test pages to verify script installation, feature toggles and capture behaviour.",
  },
] as const;

export type AttributionSettingsSectionSlug =
  (typeof attributionSettingsSections)[number]["slug"];

export function attributionSettingsPath(slug: AttributionSettingsSectionSlug) {
  return `/settings/attribution/${slug}`;
}

export function findAttributionSettingsSection(slug: string) {
  return attributionSettingsSections.find((section) => section.slug === slug);
}

export function attributionLegacySectionPath(section: string | undefined) {
  const match = attributionSettingsSections.find(
    (candidate) => candidate.legacySection === section,
  );

  return attributionSettingsPath(match?.slug ?? "tracking-script");
}
