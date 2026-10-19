import type { UserRoleTemplateKey } from "@/lib/users/role-templates";

export const dashboardWidgetSizes = [
  "compact",
  "third",
  "half",
  "wide",
  "full",
] as const;

export type DashboardWidgetSize = (typeof dashboardWidgetSizes)[number];

export const dashboardWidgets = [
  {
    id: "overview-metrics",
    label: "Overview metrics",
    sizes: ["half", "wide", "full"],
  },
  {
    id: "marketing-snapshot",
    label: "Marketing snapshot",
    sizes: ["half", "wide", "full"],
  },
  { id: "todays-work", label: "Today's work", sizes: ["half", "wide", "full"] },
  {
    id: "pipeline-snapshot",
    label: "Pipeline snapshot",
    sizes: ["third", "half", "wide"],
  },
  { id: "live-calls", label: "Live calls", sizes: ["third", "half"] },
  {
    id: "ai-next-steps",
    label: "AI suggested next steps",
    sizes: ["third", "half"],
  },
  {
    id: "recent-activity",
    label: "Recent activity",
    sizes: ["half", "wide", "full"],
  },
] as const;

export type DashboardWidgetId = (typeof dashboardWidgets)[number]["id"];

export type DashboardLayoutItem = {
  id: DashboardWidgetId;
  size: DashboardWidgetSize;
  visible: boolean;
};

const allWidgetIds = dashboardWidgets.map((widget) => widget.id);
const restrictedWidgets: Partial<
  Record<DashboardWidgetId, UserRoleTemplateKey[]>
> = {
  "marketing-snapshot": [
    "owner",
    "admin",
    "manager",
    "marketing-user",
    "reporting-user",
  ],
  "live-calls": ["owner", "admin", "manager", "sales-user", "support-user"],
};

const hiddenByDefault: Record<UserRoleTemplateKey, DashboardWidgetId[]> = {
  owner: [],
  admin: [],
  manager: [],
  "sales-user": ["marketing-snapshot"],
  "marketing-user": [
    "todays-work",
    "pipeline-snapshot",
    "live-calls",
    "ai-next-steps",
  ],
  "reporting-user": ["live-calls", "ai-next-steps"],
  "support-user": ["marketing-snapshot", "pipeline-snapshot"],
};

const defaultSizes: Record<DashboardWidgetId, DashboardWidgetSize> = {
  "overview-metrics": "full",
  "marketing-snapshot": "full",
  "todays-work": "wide",
  "pipeline-snapshot": "third",
  "live-calls": "third",
  "ai-next-steps": "third",
  "recent-activity": "full",
};

export function dashboardWidgetDefinition(id: DashboardWidgetId) {
  return dashboardWidgets.find((widget) => widget.id === id)!;
}

export function allowedDashboardWidgetIds(roleTemplate: UserRoleTemplateKey) {
  return allWidgetIds.filter((id) => {
    const allowedRoles = restrictedWidgets[id];
    return !allowedRoles || allowedRoles.includes(roleTemplate);
  });
}

export function defaultDashboardLayout(roleTemplate: UserRoleTemplateKey) {
  const hidden = new Set(hiddenByDefault[roleTemplate]);
  return allowedDashboardWidgetIds(roleTemplate).map((id) => ({
    id,
    size: defaultSizes[id],
    visible: !hidden.has(id),
  }));
}

function isWidgetSize(value: unknown): value is DashboardWidgetSize {
  return dashboardWidgetSizes.includes(value as DashboardWidgetSize);
}

export function normalizeDashboardLayout(
  value: unknown,
  roleTemplate: UserRoleTemplateKey,
  fallback = defaultDashboardLayout(roleTemplate),
) {
  const allowed = new Set(allowedDashboardWidgetIds(roleTemplate));
  const fallbackById = new Map(fallback.map((item) => [item.id, item]));
  const input = Array.isArray(value) ? value : [];
  const seen = new Set<DashboardWidgetId>();
  const normalized: DashboardLayoutItem[] = [];

  for (const candidate of input) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
      continue;
    const row = candidate as Record<string, unknown>;
    const id = row.id as DashboardWidgetId;
    if (!allowed.has(id) || seen.has(id)) continue;
    const definition = dashboardWidgetDefinition(id);
    const requestedSize = isWidgetSize(row.size)
      ? row.size
      : fallbackById.get(id)?.size;
    const size = definition.sizes.includes(requestedSize as never)
      ? (requestedSize as DashboardWidgetSize)
      : (definition.sizes[0] as DashboardWidgetSize);
    normalized.push({ id, size, visible: row.visible !== false });
    seen.add(id);
  }

  for (const item of fallback) {
    if (allowed.has(item.id) && !seen.has(item.id)) normalized.push(item);
  }

  return normalized;
}

export function dashboardLayoutClassName(size: DashboardWidgetSize) {
  if (size === "compact") return "md:col-span-1 xl:col-span-2";
  if (size === "third") return "md:col-span-1 xl:col-span-4";
  if (size === "half") return "md:col-span-1 xl:col-span-6";
  if (size === "wide") return "md:col-span-2 xl:col-span-8";
  return "md:col-span-2 xl:col-span-12";
}
