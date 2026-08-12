import { requireUser } from "@/lib/auth";
import SettingsNavLinks from "@/components/crm-boilerplate/SettingsNavLinks";
import type { ModuleToggleKey } from "@/lib/module-toggles";
import { parseModuleToggles } from "@/lib/module-toggles";
import { getCrmSettings } from "@/lib/settings";

const items: {
  label: string;
  href: string;
  adminOnly?: boolean;
  moduleKey?: ModuleToggleKey;
}[] = [
  { label: "Setup", href: "/settings/setup", adminOnly: true },
  { label: "General", href: "/settings/general", adminOnly: true },
  { label: "Company Profile", href: "/settings/company", adminOnly: true },
  {
    label: "AI Context",
    href: "/settings/ai-context",
    adminOnly: true,
    moduleKey: "ai",
  },
  {
    label: "Sidekick",
    href: "/settings/sidekick",
    adminOnly: true,
    moduleKey: "ai",
  },
  { label: "Users & Permissions", href: "/settings/users", adminOnly: true },
  {
    label: "Sales Pipeline",
    href: "/settings/sales-pipeline",
    adminOnly: true,
  },
  {
    label: "Sales Automation",
    href: "/settings/sales-automation",
    adminOnly: true,
  },
  { label: "Integrations", href: "/settings/integrations", adminOnly: true },
  {
    label: "Desktop Softphone",
    href: "/settings/browser-extension",
    moduleKey: "telephony",
  },
  { label: "Security", href: "/settings/security", adminOnly: true },
  { label: "System / Developer", href: "/settings/system", adminOnly: true },
];

export default async function SettingsNav() {
  const [user, settings] = await Promise.all([requireUser(), getCrmSettings()]);
  const moduleToggles = parseModuleToggles(
    settings.moduleToggles,
    settings.companiesEnabled,
  );

  return (
    <SettingsNavLinks
      items={items.filter(
        (item) =>
          (!item.adminOnly || user.role === "ADMIN") &&
          (!item.moduleKey || moduleToggles[item.moduleKey]),
      )}
    />
  );
}
