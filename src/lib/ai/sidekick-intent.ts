export type SidekickToolName =
  | "crm_run_report"
  | "crm_list_leads"
  | "crm_get_lead_metrics"
  | "crm_get_usage_stats"
  | "crm_get_sales_summary"
  | "crm_get_lead_source_stats"
  | "crm_get_call_summary"
  | "crm_find_stale_leads"
  | "crm_find_follow_up_gaps"
  | "crm_get_customer_timeline"
  | "crm_search_records";

export type SidekickPageContext = {
  pathname?: string;
  title?: string;
};

const toolHints: Array<{
  name: SidekickToolName;
  label: string;
  keywords: string[];
}> = [
  {
    name: "crm_run_report",
    label: "Report runner",
    keywords: [
      "report",
      "reports",
      "chart",
      "graph",
      "table",
      "visualise",
      "visualize",
      "compare",
      "breakdown",
      "form",
      "forms",
      "form fields",
      "submitted fields",
      "submissions",
      "contacts",
      "clients",
      "customers",
      "companies",
      "users",
      "accounts",
      "admins",
      "two factor",
      "2fa",
      "setup links",
      "invites",
      "storage",
      "files",
      "uploads",
      "assets",
      "ad platform",
      "search console",
      "search terms",
      "cost per lead",
      "tasks",
      "overdue",
      "due today",
      "blocked",
      "completed",
      "unassigned",
      "emails",
      "sms",
      "whatsapp",
      "communications",
      "inbound",
      "outbound",
      "replies",
      "discovery",
      "answers",
      "questions",
      "budget",
      "timeframe",
      "platform",
      "lifecycle",
      "contacted rate",
      "response time",
      "lost reason",
      "time to close",
      "stage transition",
      "queue",
      "wait time",
      "recording",
      "transcript",
      "setup",
      "readiness",
      "handover",
      "launch",
    ],
  },
  {
    name: "crm_list_leads",
    label: "Lead list",
    keywords: [
      "lead",
      "leads",
      "enquiry",
      "enquiries",
      "opportunity",
      "opportunities",
      "came in",
      "come in",
      "new",
      "created",
      "received",
      "submitted",
    ],
  },
  {
    name: "crm_get_lead_metrics",
    label: "Lead metrics",
    keywords: [
      "lead",
      "leads",
      "average",
      "avg",
      "count",
      "number",
      "total",
      "weekly",
      "monthly",
      "daily",
      "per week",
      "per month",
      "per day",
      "generate",
      "generated",
      "generation",
    ],
  },
  {
    name: "crm_get_usage_stats",
    label: "Usage stats",
    keywords: [
      "usage",
      "activity",
      "overview",
      "stats",
      "dashboard",
      "performance",
    ],
  },
  {
    name: "crm_get_sales_summary",
    label: "Sales summary",
    keywords: [
      "sales",
      "pipeline",
      "opportunities",
      "deal",
      "deals",
      "stage",
      "revenue",
    ],
  },
  {
    name: "crm_get_lead_source_stats",
    label: "Lead source stats",
    keywords: [
      "source",
      "attribution",
      "google",
      "meta",
      "facebook",
      "bing",
      "campaign",
      "referrer",
    ],
  },
  {
    name: "crm_get_call_summary",
    label: "Call summary",
    keywords: [
      "call",
      "calls",
      "missed",
      "answered",
      "phone",
      "recording",
      "transcript",
      "queue",
      "wait time",
    ],
  },
  {
    name: "crm_find_stale_leads",
    label: "Stale leads",
    keywords: ["stale", "old", "no activity", "inactive", "ignored"],
  },
  {
    name: "crm_find_follow_up_gaps",
    label: "Follow-up gaps",
    keywords: ["follow", "task", "next step", "gap", "gaps", "chase"],
  },
  {
    name: "crm_get_customer_timeline",
    label: "Customer timeline",
    keywords: [
      "summarise",
      "summarize",
      "timeline",
      "journey",
      "customer",
      "conversation",
    ],
  },
  {
    name: "crm_search_records",
    label: "Record search",
    keywords: ["find", "search", "show", "list", "contact", "company", "lead"],
  },
];

const writeActionPattern =
  /\b(create|add|update|delete|remove|merge|send|text|sms|email|assign|reassign|change|edit|close|mark|set|move)\b/i;

function hasComparisonIntent(lower: string) {
  return /\b(compare|compared|comparison|versus|vs\.?|against|difference|trend)\b/.test(
    lower,
  );
}

export function sidekickPathParts(pathname: string | null | undefined) {
  return (pathname ?? "")
    .split(/[?#]/)[0]
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function sidekickEntityIdFromPath(
  pageContext: SidekickPageContext | undefined,
  segment: "sales" | "contacts",
) {
  const parts = sidekickPathParts(pageContext?.pathname);
  const index = parts.indexOf(segment);
  const value = index >= 0 ? parts[index + 1] : null;

  if (!value) return null;

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function shouldUseCurrentPageContext(message: string) {
  const hasThisTimeRange = /\bthis\s+(day|week|month|quarter|year)\b/i.test(
    message,
  );

  return (
    /\b(this|current)\s+(lead|opportunity|customer|contact|record)\b/i.test(
      message,
    ) ||
    /\b(current|page|record|opportunity|customer|here|shown|screen)\b/i.test(
      message,
    ) ||
    (/\bthis\b/i.test(message) && !hasThisTimeRange)
  );
}

export function isExplicitReportIntent(message: string) {
  const lower = message.toLowerCase();
  const hasMetricSubject =
    /\b(leads?|opportunities|deals?|pipeline|revenue|contacts?|clients?|customers?|companies?|users?|accounts?|admins?|administrators?|2fa|two[- ]?factor|mfa|setup links?|invites?|storage|files?|uploads?|assets?|media|documents?|calls?|phone|telephony|queues?|wait time|recordings?|transcripts?|tasks?|emails?|sms|communications?|products?|services?|campaigns?|touchpoints?|visitors?|sessions?|landing pages?|pages?|referrers?|search console|search terms?|queries?|cost per lead|cpl|forms?|form fields?|submitted fields?|submissions?|discovery|questions?|answers?|budgets?|timeframes?|timescales?|platforms?|requirements?|lifecycle|contacted rate|contact rate|response time|first response|lost reasons?|time[- ]?to[- ]?close|stage changes?|stage transitions?|setup|readiness|handover|go[- ]?live|launch|checklist)\b/.test(
      lower,
    );
  const hasGroupingSubject =
    /\b(agents?|owners?|reps?|users?|assignees?|contacts?|clients?|customers?|companies?|queues?|sources?|campaigns?|mediums?|stages?|services?|products?|product types?|categories?|channels?|directions?|statuses?|status|touchpoints?|landing pages?|referrers?|forms?|form fields?|submitted fields?|submissions?|questions?|answers?|fields?|budgets?|timeframes?|timescales?|platforms?|lost reasons?|transitions?|setup groups?|checklists?|items?|days?|weeks?|months?)\b/.test(
      lower,
    );
  const asksForRankedPerformance =
    /\b(which|what|who)\b/.test(lower) &&
    /\b(agents?|owners?|reps?|sources?|campaigns?|mediums?|channels?|services?|products?|product types?|categories?|landing pages?|referrers?|questions?|answers?|budgets?|timeframes?|timescales?|platforms?|requirements?)\b/.test(lower) &&
    /\b(best|worst|most|least|top|bottom|quality|converting|conversion|performance|generat(?:e|ed|ing))\b/.test(
      lower,
    );
  const asksForMarketingAttribution =
    /\b(marketing|attribution|campaigns?|utm|touchpoints?|visitors?|sessions?|landing pages?|pages?|referrers?|mediums?|sources?|paid|organic|google ads|bing ads|microsoft ads|linkedin ads|meta ads|facebook ads|ad platforms?|platforms?|search console|search terms?|queries?|cost|spend|cpl|cost per lead)\b/.test(
      lower,
    ) &&
    /\b(which|what|show|best|worst|most|least|top|bottom|quality|converting|conversion|performance|generat(?:e|ed|ing)|leads?|enquiries?|queries?|terms?|platforms?|cost|spend|cpl|focus|how many)\b/.test(
      lower,
    );
  const asksForFormSubmissions =
    /\b(forms?|form fields?|submitted fields?|submissions?|submitted forms?|website enquiries?|enquiry forms?)\b/.test(
      lower,
    ) &&
    /\b(which|what|show|list|most|least|top|bottom|common|missing|generate|generates|generated|leads?|fields?|email|phone|contact details?)\b/.test(
      lower,
    );
  const asksForTaskReport =
    /\b(tasks?|follow[- ]?ups?)\b/.test(lower) &&
    /\b(which|what|show|list|how many|count|number|total|report|chart|breakdown|by|overdue|due today|due soon|upcoming|completed|done|blocked|unassigned|assignee|assignees?|creator|status|statuses?)\b/.test(
      lower,
    );
  const asksForCommunicationReport =
    /\b(emails?|mail|sms|texts?|text messages?|whatsapp|communications?|messages?|replies?|responses?|inbound|outbound)\b/.test(
      lower,
    ) &&
    /\b(which|what|show|list|how many|count|number|total|most|least|top|bottom|sent|send|received|inbound|outbound|replies?|responses?|users?|owners?|channels?|directions?|contacts?)\b/.test(
      lower,
    );
  const asksForContactsClients =
    /\b(contacts?|clients?|customers?|companies?)\b/.test(lower) &&
    /\b(which|what|show|list|most|least|top|bottom|open opportunities?|open leads?|activity|recent|inactive|contacted|paid ads?|submitted forms?|form submissions?|no open leads?|without open)\b/.test(
      lower,
    );
  const asksForUsersSecurity =
    /\b(users?|accounts?|admins?|administrators?|team members?|2fa|two[- ]?factor|mfa|setup links?|invites?|invitations?|logged in|login|role|roles|security)\b/.test(
      lower,
    ) &&
    /\b(which|what|show|list|active|inactive|pending|enabled|missing|without|not enabled|not logged|recent|role|roles|admins?|2fa|two[- ]?factor|mfa|invites?|setup links?)\b/.test(
      lower,
    );
  const asksForStorageAssets =
    /\b(storage|files?|uploads?|assets?|media|documents?)\b/.test(lower) &&
    /\b(which|what|show|list|how much|using|usage|space|size|largest|most space|recent|uploaded|owner|without owner|linked record|unlinked|no owner)\b/.test(
      lower,
    );
  const asksForDiscoveryAnswers =
    /\b(discovery|qualification|questions?|answers?|budget|budgets|timeframes?|timescales?|timeline|deadline|platforms?|requirements?|decision makers?|example sites?|competitors?|brand guidelines?)\b/.test(
      lower,
    ) &&
    /\b(which|what|show|list|most|least|top|bottom|common|selected|chosen|preferred|prefer|answers?|questions?|leads?|opportunities?|customers?)\b/.test(
      lower,
    );
  const asksForSalesLifecycle =
    /\b(sales quality|lifecycle|contacted rate|contact rate|first response|response time|time[- ]?to[- ]?close|close time|lost reasons?|stage changes?|stage movement|stage transitions?|transitions?)\b/.test(
      lower,
    ) &&
    /\b(which|what|show|list|compare|breakdown|most|least|top|bottom|average|avg|rate|time|leads?|opportunities?|deals?|owners?|sources?|stages?)\b/.test(
      lower,
    );
  const asksForTelephony =
    /\b(calls?|phone|telephony|queue|queues?|queued|wait time|recordings?|transcripts?|voicemail|missed calls?|answered calls?)\b/.test(
      lower,
    ) &&
    /\b(which|what|show|list|compare|breakdown|most|least|top|bottom|average|avg|rate|time|ready|missing|needs?|status|agents?|assignees?)\b/.test(
      lower,
    );
  const asksForSetupReadiness =
    /\b(setup|readiness|handover|go[- ]?live|launch|client setup|system readiness|deployment readiness|outstanding|not ready|needs attention|checklist)\b/.test(
      lower,
    ) &&
    /\b(which|what|show|list|report|chart|breakdown|status|ready|needed|warning|outstanding|complete|completion|handover|launch|client|system|deployment)\b/.test(
      lower,
    );
  const asksForTimePerformance =
    hasMetricSubject &&
    /\b(what|which|when)\b/.test(lower) &&
    /\b(day|weekday|week day|hour|time|when)\b/.test(lower) &&
    /\b(best|worst|most|least|top|bottom|strongest|weakest|peak|busiest|quietest|get|gets|getting|generate|generating)\b/.test(
      lower,
    );

  return (
    /\b(report|reports|chart|graph|table|dashboard|breakdown|compare|comparison|visualise|visualize|metric|metrics|kpi|trend|rank|ranking|top|bottom)\b/.test(
      lower,
    ) ||
    (hasMetricSubject && hasComparisonIntent(lower)) ||
    asksForMarketingAttribution ||
    asksForFormSubmissions ||
    asksForTaskReport ||
    asksForCommunicationReport ||
    asksForContactsClients ||
    asksForUsersSecurity ||
    asksForStorageAssets ||
    asksForDiscoveryAnswers ||
    asksForSalesLifecycle ||
    asksForTelephony ||
    asksForSetupReadiness ||
    (hasMetricSubject &&
      hasGroupingSubject &&
      /\b(by|per|for each|split|group|grouped|break down|breakdown|asked for|asking for|interested in|request(?:ed|s)?|require(?:d|s)?)\b/.test(
        lower,
      )) ||
    asksForRankedPerformance ||
    asksForTimePerformance
  );
}

export function isCrmQuestionIntent(message: string) {
  const lower = message.toLowerCase();
  return (
    /\b(crm|sales?|leads?|opportunities|deals?|pipeline|revenue|contacts?|clients?|companies|customers?|users?|accounts?|admins?|2fa|two[- ]?factor|mfa|setup links?|invites?|storage|files?|uploads?|assets?|media|documents?|products?|services?|calls?|phone|telephony|queues?|wait time|recordings?|transcripts?|tasks?|follow[- ]?ups?|sources?|attribution|campaigns?|forms?|form fields?|submitted fields?|submissions?|emails?|sms|communications?|timeline|stale|activity|usage|dashboard|reports?|discovery|questions?|answers?|budgets?|timeframes?|timescales?|platforms?|requirements?|lifecycle|contacted rate|contact rate|response time|first response|lost reasons?|time[- ]?to[- ]?close|stage changes?|stage transitions?|setup|readiness|handover|go[- ]?live|launch|checklist)\b/.test(
      lower,
    ) ||
    /\b(find|search|show|list|summari[sz]e)\b/.test(lower)
  );
}

export function isLeadMetricIntent(message: string) {
  const lower = message.toLowerCase();
  const hasLeadEntity =
    /\b(leads?|enquiries|enquiry|opportunities|opportunity|deals?)\b/.test(
      lower,
    );
  const asksForMetric =
    /\b(average|avg|mean|how many|count|number|total|rate|volume|generate|generated|generation|weekly|monthly|daily)\b/.test(
      lower,
    ) || /\b(per|a)\s+(day|week|month)\b/.test(lower);
  const asksForFormSubmissions =
    /\b(forms?|form fields?|submitted fields?|submissions?|submitted forms?|website enquiries?|enquiry forms?)\b/.test(
      lower,
    ) &&
    /\b(which|what|show|list|most|least|top|bottom|common|missing|generate|generates|generated|leads?|fields?|email|phone|contact details?)\b/.test(
      lower,
    );
  const asksForMarketingAttribution =
    /\b(marketing|attribution|campaigns?|utm|touchpoints?|visitors?|sessions?|landing pages?|pages?|referrers?|mediums?|sources?|paid|organic|google ads|bing ads|microsoft ads|linkedin ads|meta ads|facebook ads|ad platforms?|platforms?|search console|search terms?|queries?|cost|spend|cpl|cost per lead)\b/.test(
      lower,
    ) &&
    /\b(which|what|show|best|worst|most|least|top|bottom|quality|converting|conversion|performance|generat(?:e|ed|ing)|leads?|enquiries?|queries?|terms?|platforms?|cost|spend|cpl|focus|how many)\b/.test(
      lower,
    );
  const asksForVisualOrBreakdown =
    asksForFormSubmissions ||
    asksForMarketingAttribution ||
    /\b(report|reports|chart|graph|table|dashboard|breakdown|compare|comparison|visualise|visualize|trend|rank|ranking|top|bottom)\b/.test(
      lower,
    ) ||
    hasComparisonIntent(lower) ||
    (/\b(by|for each|split|group|grouped|break down|breakdown)\b/.test(
      lower,
    ) &&
      /\b(agents?|owners?|reps?|users?|assignees?|contacts?|clients?|customers?|companies?|queues?|sources?|campaigns?|stages?|services?|products?|product types?|categories?|channels?|directions?|statuses?|status|touchpoints?|landing pages?|referrers?|forms?|form fields?|submitted fields?|submissions?|questions?|answers?|budgets?|timeframes?|timescales?|platforms?|lost reasons?|transitions?|setup groups?|checklists?|items?)\b/.test(
        lower,
      ));

  return hasLeadEntity && asksForMetric && !asksForVisualOrBreakdown;
}

export function isLeadListIntent(message: string) {
  const lower = message.toLowerCase();
  const hasLeadEntity =
    /\b(leads?|enquiries|enquiry|opportunities|opportunity|deals?)\b/.test(
      lower,
    );
  const asksForRecords =
    /\b(what|which|show|list|find|who|how many|count|number|give me|any|new|latest|recent|came in|come in|received|submitted|created|assigned|open|active|won|lost)\b/.test(
      lower,
    );

  return (
    hasLeadEntity &&
    asksForRecords &&
    !isLeadMetricIntent(message) &&
    !isExplicitReportIntent(message)
  );
}

export function isWriteActionRequest(message: string) {
  const lower = message.toLowerCase();
  const createsReadOnlyReport =
    isExplicitReportIntent(message) &&
    /\b(create|generate|build|make)\b/.test(lower) &&
    /\b(report|chart|graph|table|dashboard|breakdown)\b/.test(lower);

  if (createsReadOnlyReport) return false;
  return writeActionPattern.test(message);
}

export function isDiscoveryPackWritePlanRequest(message: string) {
  const lower = message.toLowerCase();

  return (
    /\b(create|generate|build|make|research|implement)\b/.test(lower) &&
    /\b(discovery|question pack|questions|qualification pack)\b/.test(lower)
  );
}

export function selectSidekickTools(message: string, maxToolCalls = 3) {
  const lower = message.toLowerCase();
  const leadListRequested = isLeadListIntent(message);
  const leadMetricRequested = isLeadMetricIntent(message);
  const scores = toolHints
    .map((tool) => ({
      ...tool,
      score:
        tool.name === "crm_run_report" &&
        (!isExplicitReportIntent(message) || leadMetricRequested)
          ? 0
          : tool.name === "crm_get_lead_metrics" && !leadMetricRequested
            ? 0
          : tool.name === "crm_list_leads" && !leadListRequested
            ? 0
          : tool.name === "crm_search_records" &&
              (leadMetricRequested || leadListRequested)
            ? 0
          : tool.keywords.reduce(
              (total, keyword) => total + (lower.includes(keyword) ? 1 : 0),
              0,
            ),
    }))
    .filter((tool) => tool.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((tool) => tool.name);

  if (
    isExplicitReportIntent(message) &&
    !leadMetricRequested
  ) {
    const reportIndex = scores.indexOf("crm_run_report");
    if (reportIndex >= 0) scores.splice(reportIndex, 1);
    scores.unshift("crm_run_report");
  }

  if (leadMetricRequested && !scores.includes("crm_get_lead_metrics")) {
    scores.unshift("crm_get_lead_metrics");
  }

  if (leadListRequested && !scores.includes("crm_list_leads")) {
    scores.unshift("crm_list_leads");
  }

  if (!scores.length) {
    return isCrmQuestionIntent(message)
      ? ["crm_search_records", "crm_get_usage_stats"]
      : [];
  }

  if (
    !scores.includes("crm_search_records") &&
    /\b(find|search|show|list)\b/i.test(message)
  ) {
    scores.push("crm_search_records");
  }

  return Array.from(new Set(scores)).slice(0, maxToolCalls);
}
