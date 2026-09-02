import "server-only";

import type { CrmSettings } from "@prisma/client";
import { revalidateTag, unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isPrismaDatabaseUnavailableError } from "@/lib/prisma-errors";
import { crmSettingsCacheRevalidateSeconds } from "@/lib/settings-cache";

export { crmSettingsCacheRevalidateSeconds } from "@/lib/settings-cache";

export const crmSettingsCacheTag = "crm-settings";

function defaultCrmSettings(): CrmSettings {
  const now = new Date();

  return {
    id: "default",
    companiesEnabled: true,
    attributionTrackingEnabled: true,
    attributionFormTrackingEnabled: true,
    attributionInjectHiddenFieldEnabled: true,
    attributionPhoneTrackingEnabled: true,
    attributionReplaceTelLinksEnabled: true,
    attributionReplaceVisibleNumbersEnabled: true,
    attributionSessionTimeoutMinutes: 30,
    attributionTimelineLimit: 100,
    attributionCaptureReferrerEnabled: true,
    attributionRequireConsent: false,
    attributionConsentRequirements: null,
    attributionRetentionDays: 365,
    browserExtension: null,
    aiContext: null,
    companyProfile: null,
    workspaceDefaults: null,
    moduleToggles: null,
    salesDefaults: null,
    taskDefaults: null,
    notificationDefaults: null,
    displayDefaults: null,
    interfaceDefaults: null,
    documentLibrary: null,
    salesKanban: null,
    createdAt: now,
    updatedAt: now,
  };
}

async function loadCrmSettings() {
  try {
    const settings = await prisma.crmSettings.findUnique({
      where: { id: "default" },
    });

    if (settings) {
      return settings;
    }

    return await prisma.crmSettings.create({
      data: { id: "default", companiesEnabled: true },
    });
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      const settings = await prisma.crmSettings.findUnique({
        where: { id: "default" },
      });

      if (settings) {
        return settings;
      }
    }

    if (isPrismaDatabaseUnavailableError(error)) {
      console.warn(
        "CRM settings database is unavailable; using default settings until DATABASE_URL is configured.",
      );
      return defaultCrmSettings();
    }

    if (!isMissingAttributionSettingsColumn(error)) {
      throw error;
    }

    const legacySettings = await prisma.$queryRaw<
      { id: string; companiesEnabled: boolean; createdAt: Date; updatedAt: Date }[]
    >`
      SELECT id, "companiesEnabled", "createdAt", "updatedAt"
      FROM "CrmSettings"
      WHERE id = 'default'
      LIMIT 1
    `;
    const settings = legacySettings[0] ?? {
      id: "default",
      companiesEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return {
      ...defaultCrmSettings(),
      ...settings,
    };
  }
}

export const getCrmSettings = unstable_cache(loadCrmSettings, ["crm-settings"], {
  revalidate: crmSettingsCacheRevalidateSeconds(),
  tags: [crmSettingsCacheTag],
});

export function revalidateCrmSettings() {
  revalidateTag(crmSettingsCacheTag, "max");
}

function isMissingAttributionSettingsColumn(error: unknown) {
  const candidate = error as {
    code?: string;
    meta?: {
      column?: string;
    };
  };

  return (
    candidate.code === "P2022" &&
    typeof candidate.meta?.column === "string" &&
    (candidate.meta.column.startsWith("CrmSettings.attribution") ||
      candidate.meta.column === "CrmSettings.browserExtension" ||
      candidate.meta.column === "CrmSettings.aiContext" ||
      candidate.meta.column === "CrmSettings.companyProfile" ||
      candidate.meta.column === "CrmSettings.workspaceDefaults" ||
      candidate.meta.column === "CrmSettings.moduleToggles" ||
      candidate.meta.column === "CrmSettings.salesDefaults" ||
      candidate.meta.column === "CrmSettings.taskDefaults" ||
      candidate.meta.column === "CrmSettings.notificationDefaults" ||
      candidate.meta.column === "CrmSettings.displayDefaults" ||
      candidate.meta.column === "CrmSettings.interfaceDefaults" ||
      candidate.meta.column === "CrmSettings.documentLibrary" ||
      candidate.meta.column === "CrmSettings.salesKanban")
  );
}

function isPrismaUniqueConstraintError(error: unknown) {
  const candidate = error as { code?: string };

  return candidate.code === "P2002";
}
