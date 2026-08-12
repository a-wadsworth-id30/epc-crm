import { z } from "zod";

export const userRoleTemplates = [
  {
    key: "owner",
    label: "Owner",
    baseRole: "ADMIN",
    description:
      "Business owner with full CRM, settings, user management and security access.",
    accessSummary: "Full admin access",
  },
  {
    key: "admin",
    label: "Admin",
    baseRole: "ADMIN",
    description:
      "Operational admin for setup, integrations, users, reports and configuration.",
    accessSummary: "Full admin access",
  },
  {
    key: "manager",
    label: "Manager",
    baseRole: "USER",
    description:
      "Team lead who works across sales, customers, tasks and reports without system settings.",
    accessSummary: "Standard user access",
  },
  {
    key: "sales-user",
    label: "Sales user",
    baseRole: "USER",
    description:
      "Sales team member focused on leads, contacts, tasks, calls and customer follow-up.",
    accessSummary: "Standard user access",
  },
  {
    key: "marketing-user",
    label: "Marketing user",
    baseRole: "USER",
    description:
      "Marketing team member focused on attribution, visitors, campaign reporting and lead sources.",
    accessSummary: "Standard user access",
  },
  {
    key: "reporting-user",
    label: "Reporting user",
    baseRole: "USER",
    description:
      "Read-focused stakeholder for reports, dashboards and performance review workflows.",
    accessSummary: "Standard user access",
  },
  {
    key: "support-user",
    label: "Support user",
    baseRole: "USER",
    description:
      "Customer support user for contacts, conversations, tasks and service follow-up.",
    accessSummary: "Standard user access",
  },
] as const;

export type UserRoleTemplateKey = (typeof userRoleTemplates)[number]["key"];
export type UserRoleTemplate = (typeof userRoleTemplates)[number];

const templateKeys = userRoleTemplates.map((template) => template.key) as [
  UserRoleTemplateKey,
  ...UserRoleTemplateKey[],
];

export const userRoleTemplateSchema = z.enum(templateKeys);

const roleTemplateAliases = new Map<string, UserRoleTemplateKey>([
  ["businessowner", "owner"],
  ["owner", "owner"],
  ["administrator", "admin"],
  ["admin", "admin"],
  ["manager", "manager"],
  ["salesmanager", "manager"],
  ["sales", "sales-user"],
  ["salesrep", "sales-user"],
  ["salesuser", "sales-user"],
  ["marketing", "marketing-user"],
  ["marketinguser", "marketing-user"],
  ["reporting", "reporting-user"],
  ["readonly", "reporting-user"],
  ["reportinguser", "reporting-user"],
  ["support", "support-user"],
  ["supportuser", "support-user"],
]);

export function normalizeRoleTemplate(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

  if (!normalized) return null;
  return roleTemplateAliases.get(normalized) ?? null;
}

export function getUserRoleTemplate(key: string | null | undefined) {
  const normalized = normalizeRoleTemplate(key);

  return (
    userRoleTemplates.find((template) => template.key === normalized) ?? null
  );
}

export function defaultRoleTemplateForRole(role: "ADMIN" | "USER") {
  return role === "ADMIN" ? "admin" : "sales-user";
}

export function roleTemplateOptionsForSelect() {
  return userRoleTemplates.map((template) => ({
    value: template.key,
    label: `${template.label} (${template.baseRole})`,
  }));
}
