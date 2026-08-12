export type PhoneTab =
  | "dashboard"
  | "business-numbers"
  | "agents"
  | "call-groups"
  | "routing-ivr"
  | "business-hours"
  | "live-monitoring"
  | "recordings"
  | "settings";

export type PhoneTabIconName =
  | "clock"
  | "phone"
  | "pulse"
  | "queue"
  | "record"
  | "route"
  | "settings"
  | "users";

export type PhoneTabItem = {
  id: PhoneTab;
  label: string;
  icon: PhoneTabIconName;
  href: string;
};

export type TelephonyNavItem = {
  label: string;
  href: string;
};

export const phoneTabs: PhoneTabItem[] = [
  { id: "dashboard", label: "Overview", icon: "pulse", href: "/telephony" },
  { id: "business-numbers", label: "Phone numbers", icon: "phone", href: "/telephony/numbers" },
  { id: "agents", label: "Agents", icon: "users", href: "/telephony/users" },
  { id: "call-groups", label: "Teams", icon: "queue", href: "/telephony/queues" },
  { id: "routing-ivr", label: "Routing & IVR", icon: "route", href: "/telephony/routing" },
  { id: "business-hours", label: "Business hours", icon: "clock", href: "/telephony/business-hours" },
  { id: "live-monitoring", label: "Monitoring", icon: "pulse", href: "/telephony/live" },
  { id: "recordings", label: "Recordings", icon: "record", href: "/telephony/recordings" },
  { id: "settings", label: "Phone settings", icon: "settings", href: "/telephony/system" },
];

export const callTrackingNavItems: TelephonyNavItem[] = [
  { label: "Overview", href: "/telephony/call-tracking/overview" },
  { label: "Number pools", href: "/telephony/call-tracking/pools" },
  { label: "DNI rules", href: "/telephony/call-tracking/dni-rules" },
  { label: "Tracking numbers", href: "/telephony/call-tracking/numbers" },
  { label: "Diagnostics", href: "/telephony/call-tracking/diagnostics" },
  { label: "Validation", href: "/telephony/call-tracking/validation" },
];

export const phoneTabAliases: Record<string, PhoneTab> = {
  overview: "dashboard",
  numbers: "business-numbers",
  queues: "call-groups",
  routing: "routing-ivr",
  hours: "business-hours",
};

export const phoneTabPathById: Record<PhoneTab, string> = Object.fromEntries(
  phoneTabs.map((tab) => [tab.id, tab.href]),
) as Record<PhoneTab, string>;
