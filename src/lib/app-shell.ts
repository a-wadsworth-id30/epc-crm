import "server-only";

import { unstable_cache } from "next/cache";
import {
  parseCompanyProfile,
  type CompanyProfile,
} from "@/lib/company-profile";
import { parseModuleToggles, type ModuleToggles } from "@/lib/module-toggles";
import {
  crmSettingsCacheRevalidateSeconds,
  crmSettingsCacheTag,
  getCrmSettings,
} from "@/lib/settings";

type AppShellSettings = {
  companiesEnabled: boolean;
  companyProfile: CompanyProfile;
  moduleToggles: ModuleToggles;
};

async function loadAppShellSettings(): Promise<AppShellSettings> {
  const settings = await getCrmSettings();

  return {
    companiesEnabled: settings.companiesEnabled,
    companyProfile: parseCompanyProfile(settings.companyProfile),
    moduleToggles: parseModuleToggles(
      settings.moduleToggles,
      settings.companiesEnabled,
    ),
  };
}

export const getAppShellSettings = unstable_cache(
  loadAppShellSettings,
  ["app-shell-settings"],
  {
    revalidate: crmSettingsCacheRevalidateSeconds(),
    tags: [crmSettingsCacheTag],
  },
);
