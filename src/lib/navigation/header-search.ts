import type {
  CrmSearchRecord,
  CrmSearchRecordType,
} from "@/lib/search/records";
import type { ModuleToggleKey, ModuleToggles } from "@/lib/module-toggles";

export type HeaderSearchRole = "ADMIN" | "USER";

export type HeaderSearchEntry = {
  title: string;
  href: string;
  section: string;
  description: string;
  badge?: string;
  keywords?: string[];
  adminOnly?: boolean;
  moduleKey?: ModuleToggleKey;
  requiresCompanies?: boolean;
  priority?: number;
  resultKind?: "page" | "query" | "record";
};

export type HeaderQuerySearchTarget = {
  title: string;
  href: string;
  section: string;
  description: string;
  keywords?: string[];
  adminOnly?: boolean;
  moduleKey?: ModuleToggleKey;
  requiresCompanies?: boolean;
};

export const headerSearchEntries: HeaderSearchEntry[] = [
  {
    title: "Dashboard",
    href: "/",
    section: "Home",
    description: "Overview of sales, contacts, activity and tasks.",
    keywords: ["home", "overview", "start"],
    priority: 100,
  },
  {
    title: "Sales Pipeline",
    href: "/sales",
    section: "CRM",
    description: "Opportunities, pipeline value and sales follow-up activity.",
    keywords: ["pipeline", "deals", "opportunities", "leads"],
    priority: 95,
  },
  {
    title: "Reports",
    href: "/reports",
    section: "Home",
    description:
      "Build saved CRM reports with charts, tables and AI-generated views.",
    keywords: [
      "reports",
      "report builder",
      "charts",
      "tables",
      "analytics",
      "custom report",
    ],
    priority: 94,
  },
  {
    title: "Marketing Overview",
    href: "/marketing",
    section: "Marketing",
    description: "Marketing attribution, calls, revenue and spend overview.",
    keywords: ["marketing", "overview", "attribution", "channels", "roi"],
    priority: 90,
  },
  {
    title: "Attribution Reports",
    href: "/marketing/attribution-reports",
    section: "Marketing",
    description: "Source, medium, campaign and lifecycle attribution reports.",
    keywords: [
      "attribution reports",
      "campaign report",
      "journey",
      "roi",
      "source",
    ],
  },
  {
    title: "Lead Sources",
    href: "/marketing/lead-sources",
    section: "Marketing",
    description: "Review lead source reporting.",
    keywords: ["lead sources", "channels", "source"],
  },
  {
    title: "Ad Platforms",
    href: "/marketing/ad-platforms",
    section: "Marketing",
    description: "Review ad platform reporting.",
    keywords: ["ads", "platforms", "spend", "google", "meta", "linkedin"],
  },
  {
    title: "Conversion Reporting",
    href: "/marketing/conversion-reporting",
    section: "Marketing",
    description: "Review conversion reporting.",
    keywords: ["conversions", "reporting", "upload"],
  },
  {
    title: "Offline Media Report",
    href: "/marketing/offline-media",
    section: "Marketing",
    description:
      "Offline campaign metadata, calls, leads and pipeline contribution.",
    keywords: [
      "offline",
      "radio",
      "print",
      "event",
      "direct mail",
      "qr",
      "manual campaigns",
    ],
  },
  {
    title: "Sales Quality Report",
    href: "/marketing/sales-quality",
    section: "Marketing",
    description:
      "Lead quality, owner follow-up and pipeline hygiene by commercial source.",
    keywords: [
      "sales quality",
      "lead quality",
      "owners",
      "follow up",
      "pipeline hygiene",
    ],
  },
  {
    title: "Executive Report",
    href: "/marketing/executive-report",
    section: "Marketing",
    description: "Client-facing commercial attribution summary.",
    keywords: [
      "executive",
      "client report",
      "commercial attribution",
      "summary",
    ],
  },
  {
    title: "Visitor Log",
    href: "/marketing/visitors",
    section: "Marketing",
    description: "Tracked sessions, sources, visitors and conversions.",
    keywords: ["visitor", "sessions", "tracking", "utm", "source"],
  },
  {
    title: "Tracking Script",
    href: "/settings/attribution/tracking-script",
    section: "Tracking Engine",
    description: "Install and validate the website attribution script.",
    keywords: ["script", "install", "tracking", "attribution", "website"],
    adminOnly: true,
  },
  {
    title: "Domains",
    href: "/settings/attribution/domains",
    section: "Tracking Engine",
    description: "Manage approved domains for attribution tracking.",
    keywords: ["domain", "website", "registry", "allowed hosts"],
    adminOnly: true,
  },
  {
    title: "Session Settings",
    href: "/settings/attribution/session-settings",
    section: "Tracking Engine",
    description: "Configure visitor sessions, retention and identity rules.",
    keywords: ["session", "visitor", "retention", "privacy", "identity"],
    adminOnly: true,
  },
  {
    title: "Form Tracking",
    href: "/settings/attribution/form-tracking",
    section: "Tracking Engine",
    description: "Map website form fields to CRM lead capture.",
    keywords: ["forms", "lead endpoint", "field mapper", "capture"],
    adminOnly: true,
  },
  {
    title: "Attribution Rules",
    href: "/settings/attribution/attribution-rules",
    section: "Tracking Engine",
    description: "Normalise source and campaign attribution decisions.",
    keywords: ["rules", "source", "campaign", "fallback"],
    adminOnly: true,
  },
  {
    title: "Consent Settings",
    href: "/settings/attribution/consent-settings",
    section: "Tracking Engine",
    description: "Configure tracking consent and privacy behaviour.",
    keywords: ["consent", "privacy", "cookies", "storage"],
    adminOnly: true,
  },
  {
    title: "Debug Logs",
    href: "/settings/attribution/debug-logs",
    section: "Tracking Engine",
    description: "Inspect attribution runtime events and diagnostics.",
    keywords: ["debug", "logs", "diagnostics", "events"],
    adminOnly: true,
  },
  {
    title: "Marketing Integrations",
    href: "/settings/integrations",
    section: "Settings",
    description: "Connect ad platforms, imports and conversion uploads.",
    keywords: [
      "google ads",
      "bing ads",
      "microsoft advertising",
      "meta",
      "linkedin ads",
      "analytics",
      "email automation",
      "klaviyo",
      "provider",
      "sync",
    ],
    adminOnly: true,
  },
  {
    title: "Cloudflare R2",
    href: "/settings/integrations/cloudflare-r2",
    section: "Settings",
    description: "Configure CRM media and file storage credentials.",
    keywords: ["cloudflare", "r2", "storage", "files", "media"],
    adminOnly: true,
  },
  {
    title: "Twilio",
    href: "/settings/integrations/twilio",
    section: "Settings",
    description: "Configure voice, SMS and WhatsApp provider credentials.",
    keywords: ["twilio", "voice", "sms", "whatsapp", "phone credentials"],
    adminOnly: true,
  },
  {
    title: "Google Analytics",
    href: "/settings/integrations/google-analytics",
    section: "Settings",
    description: "Configure GA4 property, stream and event matching.",
    keywords: ["google analytics", "ga4", "measurement id", "events"],
    adminOnly: true,
  },
  {
    title: "Google Search Console",
    href: "/settings/integrations/google-search-console",
    section: "Settings",
    description:
      "Configure verified Search Console property and organic search performance access.",
    keywords: [
      "google search console",
      "gsc",
      "seo",
      "organic search",
      "queries",
      "search performance",
    ],
    adminOnly: true,
  },
  {
    title: "Google Ads",
    href: "/settings/integrations/google-ads",
    section: "Settings",
    description:
      "Configure Google Ads account, conversion actions and offline uploads.",
    keywords: ["google ads", "adwords", "gclid", "offline conversions"],
    adminOnly: true,
  },
  {
    title: "Bing Ads",
    href: "/settings/integrations/bing-ads",
    section: "Settings",
    description:
      "Configure Microsoft Advertising account, UET and conversion goal mapping.",
    keywords: [
      "bing ads",
      "microsoft ads",
      "microsoft advertising",
      "msclkid",
      "uet",
    ],
    adminOnly: true,
  },
  {
    title: "Klaviyo",
    href: "/settings/integrations/klaviyo",
    section: "Settings",
    description:
      "Configure Klaviyo account, list and lifecycle marketing attribution settings.",
    keywords: [
      "klaviyo",
      "email",
      "sms",
      "lifecycle",
      "flows",
      "campaigns",
      "lists",
      "forms",
    ],
    adminOnly: true,
  },
  {
    title: "Meta",
    href: "/settings/integrations/meta",
    section: "Settings",
    description:
      "Configure Meta ad account, pixel and Conversions API mapping.",
    keywords: ["meta", "facebook", "instagram", "fbclid", "pixel"],
    adminOnly: true,
  },
  {
    title: "LinkedIn Ads",
    href: "/settings/integrations/linkedin-ads",
    section: "Settings",
    description:
      "Configure LinkedIn Ads account, Insight Tag and offline conversion mapping.",
    keywords: [
      "linkedin ads",
      "linkedin",
      "li_fat_id",
      "insight tag",
      "offline conversions",
    ],
    adminOnly: true,
  },
  {
    title: "Phone System",
    href: "/telephony",
    section: "Communications",
    description: "Overview of phone numbers, agents, teams and routing.",
    keywords: ["telephony", "phone", "calls", "voice"],
    adminOnly: true,
    priority: 85,
  },
  {
    title: "Users & Extensions",
    href: "/telephony/users",
    section: "Communications",
    description: "Manage users, softphone availability and extensions.",
    keywords: ["agents", "users", "extensions", "softphone"],
    adminOnly: true,
  },
  {
    title: "Teams",
    href: "/telephony/queues",
    section: "Communications",
    description: "Configure call teams, members and queue behaviour.",
    keywords: ["queues", "teams", "groups", "members"],
    adminOnly: true,
  },
  {
    title: "Routing & IVR",
    href: "/telephony/routing",
    section: "Communications",
    description: "Edit call routing rules and SmartFlow journeys.",
    keywords: ["routing", "ivr", "flow", "smartflow"],
    adminOnly: true,
  },
  {
    title: "Phone Numbers",
    href: "/telephony/numbers",
    section: "Communications",
    description: "Manage owned phone numbers.",
    keywords: ["numbers", "twilio", "caller id"],
    adminOnly: true,
  },
  {
    title: "Business Hours",
    href: "/telephony/business-hours",
    section: "Communications",
    description: "Configure open hours and after-hours handling.",
    keywords: ["hours", "closed", "after hours", "schedule"],
    adminOnly: true,
  },
  {
    title: "Monitoring",
    href: "/telephony/live",
    section: "Communications",
    description: "Monitor live calls and search the call log.",
    keywords: ["live", "queue", "monitoring", "active calls", "call log"],
    adminOnly: true,
  },
  {
    title: "Recordings",
    href: "/telephony/recordings",
    section: "Communications",
    description: "Review recordings, transcripts and call summaries.",
    keywords: ["recordings", "transcripts", "summaries"],
    adminOnly: true,
  },
  {
    title: "Phone System Settings",
    href: "/telephony/system",
    section: "Communications",
    description: "Review phone system configuration state.",
    keywords: ["system", "voice setup", "configuration"],
    adminOnly: true,
  },
  {
    title: "Desktop Softphone",
    href: "/telephony/extension",
    section: "Communications",
    description: "Install and use the desktop softphone app.",
    keywords: ["desktop", "softphone", "extension", "download", "app"],
    adminOnly: true,
  },
  {
    title: "Call Tracking Overview",
    href: "/telephony/call-tracking/overview",
    section: "Communications",
    description: "Setup overview for dynamic number insertion.",
    keywords: ["call tracking", "dni", "overview", "setup"],
    adminOnly: true,
  },
  {
    title: "Number Pools",
    href: "/telephony/call-tracking/pools",
    section: "Communications",
    description: "Manage tracking number pools for visitor attribution.",
    keywords: ["pools", "tracking numbers", "dni"],
    adminOnly: true,
  },
  {
    title: "DNI Rules",
    href: "/telephony/call-tracking/dni-rules",
    section: "Communications",
    description: "Route visitors to number pools by source or page data.",
    keywords: ["dni", "rules", "dynamic number insertion", "fallback"],
    adminOnly: true,
  },
  {
    title: "Tracking Numbers",
    href: "/telephony/call-tracking/numbers",
    section: "Communications",
    description: "Review active, inactive and released tracking numbers.",
    keywords: ["tracking numbers", "inventory", "twilio"],
    adminOnly: true,
  },
  {
    title: "Call Tracking Diagnostics",
    href: "/telephony/call-tracking/diagnostics",
    section: "Communications",
    description: "Diagnose endpoints, domains and tracking events.",
    keywords: ["diagnostics", "debug", "endpoints", "health"],
    adminOnly: true,
  },
  {
    title: "Call Tracking Validation",
    href: "/telephony/call-tracking/validation",
    section: "Communications",
    description: "Validate the end-to-end tracking flow.",
    keywords: ["validation", "test", "qa", "tracking"],
    adminOnly: true,
  },
  {
    title: "Companies",
    href: "/clients",
    section: "CRM",
    description: "Company records for account-level CRM tracking.",
    keywords: ["clients", "accounts", "organisations", "companies"],
    requiresCompanies: true,
  },
  {
    title: "Contacts",
    href: "/contacts",
    section: "CRM",
    description: "Search and manage contact records.",
    keywords: ["people", "customers", "contacts"],
    priority: 80,
  },
  {
    title: "Notes / Activity",
    href: "/notes",
    section: "CRM",
    description: "Activity timeline for CRM records.",
    keywords: ["notes", "activity", "timeline"],
  },
  {
    title: "Tasks",
    href: "/tasks",
    section: "Home",
    description: "Follow-up and operational task queue.",
    keywords: ["tasks", "follow up", "work queue"],
  },
  {
    title: "Storage",
    href: "/storage",
    section: "Products & Operations",
    description: "File and media storage browser.",
    keywords: ["files", "media", "documents", "storage"],
    adminOnly: true,
  },
  {
    title: "General Settings",
    href: "/settings/general",
    section: "Settings",
    description: "Application-wide CRM defaults.",
    keywords: ["settings", "defaults", "companies module"],
    priority: 70,
    adminOnly: true,
  },
  {
    title: "Company Profile",
    href: "/settings/company",
    section: "Settings",
    description: "Organisation profile and branding settings.",
    keywords: ["company", "organisation", "profile", "branding"],
    adminOnly: true,
  },
  {
    title: "AI Context",
    href: "/settings/ai-context",
    section: "Settings",
    description:
      "Business context, tone and guardrails used by CRM AI workflows.",
    keywords: ["ai context", "sales ai", "tone", "proof points", "objections"],
    adminOnly: true,
  },
  {
    title: "Users & Permissions",
    href: "/settings/users",
    section: "Settings",
    description: "Manage CRM users and access levels.",
    keywords: ["users", "permissions", "roles"],
    adminOnly: true,
  },
  {
    title: "Sales Pipeline Settings",
    href: "/settings/sales-pipeline",
    section: "Settings",
    description: "Configure custom sales stages and reporting buckets.",
    keywords: ["sales pipeline settings", "custom stages", "lifecycle stages"],
    adminOnly: true,
  },
  {
    title: "Settings Integrations",
    href: "/settings/integrations",
    section: "Settings",
    description: "Storage, Twilio and provider connection settings.",
    keywords: ["integrations", "twilio", "r2", "connections", "linkedin ads"],
    adminOnly: true,
  },
  {
    title: "Browser Extension",
    href: "/settings/browser-extension",
    section: "Settings",
    description: "Desktop softphone download and browser-extension guidance.",
    keywords: [
      "browser",
      "extension",
      "chrome",
      "softphone",
      "desktop download",
    ],
  },
  {
    title: "Security",
    href: "/settings/security",
    section: "Settings",
    description: "Authentication, password and session policy notes.",
    keywords: ["security", "password", "sessions"],
    adminOnly: true,
  },
  {
    title: "System / Developer Settings",
    href: "/settings/system",
    section: "Settings",
    description: "Developer-facing CRM implementation settings.",
    keywords: ["system", "developer", "debug"],
    adminOnly: true,
  },
  {
    title: "My Account",
    href: "/profile",
    section: "Account",
    description: "Edit your profile, account details and password.",
    keywords: ["account", "profile", "password", "settings"],
  },
];

export const headerQuerySearchTargets: HeaderQuerySearchTarget[] = [
  {
    title: "Sales Pipeline",
    href: "/sales",
    section: "CRM",
    description:
      "Search opportunities by deal, customer, owner, source, stage or next step.",
    keywords: ["pipeline", "deals", "opportunities", "leads"],
  },
  {
    title: "Visitor Log",
    href: "/marketing/visitors",
    section: "Marketing",
    description:
      "Search visitor IDs, domains, locations, sources and referrers.",
    keywords: ["visitor", "sessions", "tracking", "utm", "source", "location"],
  },
  {
    title: "Lead Sources",
    href: "/marketing/lead-sources",
    section: "Marketing",
    description: "Search captured lead, campaign and landing-page evidence.",
    keywords: ["lead sources", "campaigns", "landing page", "source"],
  },
  {
    title: "Attribution Reports",
    href: "/marketing/attribution-reports",
    section: "Marketing",
    description: "Search source, medium and campaign attribution rows.",
    keywords: ["attribution", "campaign", "journey", "source"],
  },
];

export function canShowHeaderSearchEntry({
  companiesEnabled,
  currentUserRole,
  entry,
  moduleToggles,
}: {
  companiesEnabled: boolean;
  currentUserRole: HeaderSearchRole;
  entry: Pick<
    HeaderSearchEntry,
    "adminOnly" | "href" | "moduleKey" | "requiresCompanies" | "section"
  >;
  moduleToggles: ModuleToggles;
}) {
  const moduleKey = moduleKeyForHeaderSearchEntry(entry);

  return (
    (!entry.adminOnly || currentUserRole === "ADMIN") &&
    (!moduleKey || moduleToggles[moduleKey]) &&
    (!entry.requiresCompanies || companiesEnabled)
  );
}

function moduleKeyForHeaderSearchEntry(
  entry: Pick<HeaderSearchEntry, "href" | "moduleKey" | "section">,
): ModuleToggleKey | null {
  if (entry.moduleKey) {
    return entry.moduleKey;
  }

  if (
    entry.href.startsWith("/marketing") ||
    entry.href.startsWith("/settings/attribution") ||
    entry.section === "Marketing" ||
    entry.section === "Tracking Engine" ||
    marketingIntegrationSettingsPaths.some((path) => entry.href.startsWith(path))
  ) {
    return "marketing";
  }

  if (
    entry.href.startsWith("/telephony") ||
    entry.href === "/settings/browser-extension" ||
    entry.href === "/settings/integrations/twilio" ||
    entry.section === "Communications"
  ) {
    return "telephony";
  }

  if (entry.href.startsWith("/products")) {
    return "products";
  }

  if (entry.href.startsWith("/discovery")) {
    return "discovery";
  }

  if (
    entry.href === "/settings/ai-context" ||
    entry.href === "/settings/integrations/openai"
  ) {
    return "ai";
  }

  return null;
}

const marketingIntegrationSettingsPaths = [
  "/settings/integrations/google-analytics",
  "/settings/integrations/google-search-console",
  "/settings/integrations/google-ads",
  "/settings/integrations/bing-ads",
  "/settings/integrations/klaviyo",
  "/settings/integrations/meta",
  "/settings/integrations/linkedin-ads",
];

export function normalizeHeaderSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function recordToHeaderSearchEntry(
  record: CrmSearchRecord,
): HeaderSearchEntry {
  const description =
    [record.subtitle, record.description].filter(Boolean).join(" / ") ||
    "CRM record";

  return {
    badge: recordTypeLabel(record.type),
    description,
    href: record.href,
    priority: 140 + record.score,
    resultKind: "record",
    section: recordTypeLabel(record.type),
    title: record.title,
  };
}

export function scoreHeaderSearchEntry(
  entry: HeaderSearchEntry,
  query: string,
  words: string[],
) {
  const title = normalizeHeaderSearchText(entry.title);
  const section = normalizeHeaderSearchText(entry.section);
  const description = normalizeHeaderSearchText(entry.description);
  const keywords = normalizeHeaderSearchText(entry.keywords?.join(" ") ?? "");
  const href = normalizeHeaderSearchText(entry.href);
  const haystack = `${title} ${section} ${description} ${keywords} ${href}`;

  if (!words.every((word) => haystack.includes(word))) {
    return 0;
  }

  let score = entry.priority ?? 0;

  if (title === query) score += 200;
  if (title.startsWith(query)) score += 150;
  if (title.includes(query)) score += 100;
  if (section.includes(query)) score += 60;
  if (keywords.includes(query)) score += 50;
  if (description.includes(query)) score += 25;
  if (href.includes(query)) score += 10;

  score += words.length * 5;

  return score;
}

function recordTypeLabel(type: CrmSearchRecordType) {
  switch (type) {
    case "company":
      return "Company";
    case "contact":
      return "Contact";
    case "sale":
      return "Sale";
    case "user":
      return "User";
  }
}
