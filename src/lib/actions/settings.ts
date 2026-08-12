"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { FileAssetVisibility, type Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import {
  crmAIToneOptions,
  type CrmAIToneOption,
} from "@/lib/ai/crm-context";
import {
  extractChromeWebStoreId,
  isChromeWebStoreInstallUrl,
} from "@/lib/browser-extension/settings";
import {
  companyProfileSchema,
  parseCompanyProfile,
  type CompanyProfile,
} from "@/lib/company-profile";
import {
  displayDefaultsSchema,
  type DisplayDefaults,
} from "@/lib/display-defaults";
import {
  documentLibrarySettingsSchema,
  normaliseDocumentFolders,
  type DocumentLibrarySettings,
} from "@/lib/document-library";
import {
  interfaceDefaultsSchema,
  type InterfaceDefaults,
} from "@/lib/interface-defaults";
import {
  notificationCategories,
  notificationDefaultsSchema,
  type NotificationDefaults,
} from "@/lib/notification-defaults";
import { revalidateHeaderNotifications } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import {
  salesDefaultsSchema,
  type SalesDefaults,
} from "@/lib/sales/defaults";
import { revalidateCrmSettings } from "@/lib/settings";
import { mediaAssetUrl, uploadMediaFile } from "@/lib/storage/media";
import {
  taskDefaultsSchema,
  type TaskDefaults,
} from "@/lib/tasks/defaults";
import {
  parseWorkspaceDefaults,
  workspaceDefaultsSchema,
  type WorkspaceDefaults,
} from "@/lib/workspace-defaults";
import {
  moduleTogglesToStored,
  type ModuleToggles,
} from "@/lib/module-toggles";

type SettingsActionState = {
  ok: boolean;
  message: string;
  companiesEnabled: boolean | null;
  moduleToggles: ModuleToggles | null;
  displayDefaults: DisplayDefaults | null;
  interfaceDefaults: InterfaceDefaults | null;
  documentLibrary: DocumentLibrarySettings | null;
  notificationDefaults: NotificationDefaults | null;
  salesDefaults: SalesDefaults | null;
  taskDefaults: TaskDefaults | null;
  workspaceDefaults: WorkspaceDefaults | null;
};

export type AttributionFeatureSettingsState = {
  ok: boolean;
  message: string;
  savedAt: number | null;
};

export type AttributionSessionSettingsState = AttributionFeatureSettingsState;
export type AttributionConsentSettingsState = AttributionFeatureSettingsState;
export type BrowserExtensionSettingsState = AttributionFeatureSettingsState;
export type CrmAIContextSettingsState = AttributionFeatureSettingsState;
export type CompanyProfileSettingsState = AttributionFeatureSettingsState & {
  profile: CompanyProfile | null;
};

const attributionSessionSettingsSchema = z.object({
  attributionSessionTimeoutMinutes: z.coerce
    .number()
    .int()
    .min(5, "Session assignment window must be at least 5 minutes.")
    .max(1440, "Session assignment window cannot exceed 24 hours."),
  attributionTimelineLimit: z.coerce
    .number()
    .int()
    .min(1, "Timeline limit must keep at least 1 touchpoint.")
    .max(250, "Timeline limit cannot exceed 250 touchpoints."),
  attributionRetentionDays: z.coerce
    .number()
    .int()
    .min(30, "Retention must be at least 30 days.")
    .max(3650, "Retention cannot exceed 10 years."),
  attributionCaptureReferrerEnabled: z.boolean(),
});

const attributionConsentRequirementsSchema = z.object({
  legalBasisConfirmed: z.boolean(),
  privacyPolicyUpdated: z.boolean(),
  consentBannerConnected: z.boolean(),
  domainRegistryReviewed: z.boolean(),
  consentPromptEnabled: z.boolean(),
  consentPromptTitle: z.string().trim().max(80).optional().transform((value) => value || null),
  consentPromptMessage: z.string().trim().max(240).optional().transform((value) => value || null),
  consentPromptAcceptLabel: z.string().trim().max(40).optional().transform((value) => value || null),
  consentPromptDeclineLabel: z.string().trim().max(40).optional().transform((value) => value || null),
  consentPromptPlacement: z.enum([
    "bottom-left",
    "bottom-center",
    "bottom-right",
    "top-left",
    "top-center",
    "top-right",
  ]),
  consentPromptTheme: z.enum(["light", "dark", "auto", "custom"]),
  consentPromptMaxWidth: optionalInteger(320, 720),
  consentPromptBorderRadius: optionalInteger(0, 32),
  consentPromptBackgroundColor: optionalHexColor(),
  consentPromptTextColor: optionalHexColor(),
  consentPromptMutedTextColor: optionalHexColor(),
  consentPromptBorderColor: optionalHexColor(),
  consentPromptButtonBackgroundColor: optionalHexColor(),
  consentPromptButtonTextColor: optionalHexColor(),
  consentPromptLinkColor: optionalHexColor(),
  consentPromptPrivacyUrl: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((value) => value || null)
    .refine(
      (value) => !value || value.startsWith("/") || /^https?:\/\//i.test(value),
      "Enter a full https:// URL or a site-relative privacy path.",
    ),
  reviewedBy: z.string().trim().max(120).optional().transform((value) => value || null),
  reviewedAt: z.string().trim().max(40).optional().transform((value) => value || null),
  notes: z.string().trim().max(1000).optional().transform((value) => value || null),
});

function optionalHexColor() {
  return z
    .string()
    .trim()
    .max(7)
    .optional()
    .transform((value) => value || null)
    .refine(
      (value) => !value || /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value),
      "Enter a valid hex colour, for example #111827.",
    );
}

function optionalInteger(min: number, max: number) {
  return z.preprocess(
    (value) => {
      const trimmed = String(value ?? "").trim();
      return trimmed ? trimmed : undefined;
    },
    z.coerce
      .number()
      .int()
      .min(min, `Enter a value of ${min} or higher.`)
      .max(max, `Enter a value of ${max} or lower.`)
      .optional()
      .transform((value) => value ?? null),
  );
}

function safeJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function generalSettingsError(message: string): SettingsActionState {
  return {
    ok: false,
    message,
    companiesEnabled: null,
    displayDefaults: null,
    documentLibrary: null,
    interfaceDefaults: null,
    moduleToggles: null,
    notificationDefaults: null,
    salesDefaults: null,
    taskDefaults: null,
    workspaceDefaults: null,
  };
}

async function uploadCompanyLogoFile({
  file,
  folder,
  uploadedById,
}: {
  file: File;
  folder: string;
  uploadedById: string;
}) {
  return uploadMediaFile({
    file,
    folder,
    entityType: "CrmSettings",
    entityId: "default",
    uploadedById,
    visibility: FileAssetVisibility.PUBLIC,
    maxUploadMb: 2,
    requireImage: true,
  });
}

export async function updateGeneralSettingsAction(
  _: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  await requireAdmin();

  const companiesEnabled = formData.get("companiesEnabled") === "on";
  const moduleToggles: ModuleToggles = {
    ai: formData.get("moduleAi") === "on",
    companies: companiesEnabled,
    discovery: formData.get("moduleDiscovery") === "on",
    marketing: formData.get("moduleMarketing") === "on",
    products: formData.get("moduleProducts") === "on",
    telephony: formData.get("moduleTelephony") === "on",
  };
  const storedModuleToggles = moduleTogglesToStored(moduleToggles);
  const parsedWorkspaceDefaults = workspaceDefaultsSchema.safeParse({
    country: formData.get("defaultCountry"),
    currency: formData.get("defaultCurrency"),
    locale: formData.get("defaultLocale"),
    timezone: formData.get("defaultTimezone"),
  });
  const parsedDisplayDefaults = displayDefaultsSchema.safeParse({
    currencyDisplay: formData.get("displayCurrencyStyle"),
    dateFormat: formData.get("displayDateFormat"),
    numberLocale: formData.get("displayNumberLocale"),
    timeFormat: formData.get("displayTimeFormat"),
    weekStartDay: formData.get("displayWeekStartDay"),
  });
  const parsedInterfaceDefaults = interfaceDefaultsSchema.safeParse({
    defaultLandingPage: formData.get("interfaceDefaultLandingPage"),
    defaultTablePageSize: formData.get("interfaceDefaultTablePageSize"),
  });
  const folderNames = formData.getAll("documentFolderName");
  const folderSlugs = formData.getAll("documentFolderSlug");
  const parsedDocumentLibrary = documentLibrarySettingsSchema.safeParse({
    folders: normaliseDocumentFolders(
      folderNames.map((name, index) => ({
        name: String(name ?? ""),
        slug: String(folderSlugs[index] ?? ""),
      })),
    ),
  });
  const parsedSalesDefaults = salesDefaultsSchema.safeParse({
    defaultOwnerMode: formData.get("salesDefaultOwnerMode"),
    defaultOwnerId: formData.get("salesDefaultOwnerId"),
    defaultSalesPipelineStageId: formData.get("salesDefaultPipelineStageId"),
    staleLeadDays: formData.get("salesStaleLeadDays"),
  });
  const parsedTaskDefaults = taskDefaultsSchema.safeParse({
    defaultAssigneeMode: formData.get("taskDefaultAssigneeMode"),
    defaultAssigneeId: formData.get("taskDefaultAssigneeId"),
    defaultDueDays: formData.get("taskDefaultDueDays"),
  });
  const parsedNotificationDefaults = notificationDefaultsSchema.safeParse({
    categories: Object.fromEntries(
      notificationCategories.map((category) => [
        category,
        formData.get(`notificationCategory${category}`) === "on",
      ]),
    ),
    showInfoNotifications: formData.get("notificationShowInfo") === "on",
  });

  if (!parsedWorkspaceDefaults.success) {
    return generalSettingsError(
      parsedWorkspaceDefaults.error.issues[0]?.message ??
        "Check the workspace defaults.",
    );
  }

  if (!parsedSalesDefaults.success) {
    return generalSettingsError(
      parsedSalesDefaults.error.issues[0]?.message ??
        "Check the sales defaults.",
    );
  }

  if (!parsedDisplayDefaults.success) {
    return generalSettingsError(
      parsedDisplayDefaults.error.issues[0]?.message ??
        "Check the display defaults.",
    );
  }

  if (!parsedInterfaceDefaults.success) {
    return generalSettingsError(
      parsedInterfaceDefaults.error.issues[0]?.message ??
        "Check the interface defaults.",
    );
  }

  if (!parsedDocumentLibrary.success) {
    return generalSettingsError(
      parsedDocumentLibrary.error.issues[0]?.message ??
        "Keep at least one document folder with a valid name.",
    );
  }

  if (!parsedTaskDefaults.success) {
    return generalSettingsError(
      parsedTaskDefaults.error.issues[0]?.message ??
        "Check the task defaults.",
    );
  }

  if (!parsedNotificationDefaults.success) {
    return generalSettingsError(
      parsedNotificationDefaults.error.issues[0]?.message ??
        "Check the notification defaults.",
    );
  }

  const workspaceDefaults = parseWorkspaceDefaults(parsedWorkspaceDefaults.data);
  const displayDefaults = parsedDisplayDefaults.data;
  const interfaceDefaults = parsedInterfaceDefaults.data;
  const documentLibrary = parsedDocumentLibrary.data;
  const salesDefaults = parsedSalesDefaults.data;
  const taskDefaults = parsedTaskDefaults.data;
  const notificationDefaults = parsedNotificationDefaults.data;

  if (
    salesDefaults.defaultOwnerMode === "specific-user" &&
    !salesDefaults.defaultOwnerId
  ) {
    return generalSettingsError(
      "Choose a specific default owner or change the owner mode.",
    );
  }

  if (
    taskDefaults.defaultAssigneeMode === "specific-user" &&
    !taskDefaults.defaultAssigneeId
  ) {
    return generalSettingsError(
      "Choose a specific default task assignee or change the assignee mode.",
    );
  }

  const [defaultOwner, defaultPipelineStage, defaultTaskAssignee] =
    await Promise.all([
      salesDefaults.defaultOwnerId
        ? prisma.user.findFirst({
            where: { id: salesDefaults.defaultOwnerId, status: "ACTIVE" },
            select: { id: true },
          })
        : Promise.resolve(null),
      salesDefaults.defaultSalesPipelineStageId
        ? prisma.salesPipelineStage.findFirst({
            where: {
              id: salesDefaults.defaultSalesPipelineStageId,
              isActive: true,
              isClosed: false,
            },
            select: { id: true },
          })
        : Promise.resolve(null),
      taskDefaults.defaultAssigneeId
        ? prisma.user.findFirst({
            where: { id: taskDefaults.defaultAssigneeId, status: "ACTIVE" },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

  if (salesDefaults.defaultOwnerId && !defaultOwner) {
    return generalSettingsError("Choose an active default sales owner.");
  }

  if (salesDefaults.defaultSalesPipelineStageId && !defaultPipelineStage) {
    return generalSettingsError("Choose an active open default pipeline stage.");
  }

  if (taskDefaults.defaultAssigneeId && !defaultTaskAssignee) {
    return generalSettingsError("Choose an active default task assignee.");
  }

  await prisma.crmSettings.upsert({
    where: { id: "default" },
    update: {
      companiesEnabled,
      displayDefaults: safeJson(displayDefaults),
      documentLibrary: safeJson(documentLibrary),
      interfaceDefaults: safeJson(interfaceDefaults),
      moduleToggles: safeJson(storedModuleToggles),
      notificationDefaults: safeJson(notificationDefaults),
      salesDefaults: safeJson(salesDefaults),
      taskDefaults: safeJson(taskDefaults),
      workspaceDefaults: safeJson(workspaceDefaults),
    },
    create: {
      id: "default",
      companiesEnabled,
      displayDefaults: safeJson(displayDefaults),
      documentLibrary: safeJson(documentLibrary),
      interfaceDefaults: safeJson(interfaceDefaults),
      moduleToggles: safeJson(storedModuleToggles),
      notificationDefaults: safeJson(notificationDefaults),
      salesDefaults: safeJson(salesDefaults),
      taskDefaults: safeJson(taskDefaults),
      workspaceDefaults: safeJson(workspaceDefaults),
    },
  });

  revalidateCrmSettings();
  revalidateHeaderNotifications();
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: "Settings saved.",
    companiesEnabled,
    displayDefaults,
    documentLibrary,
    interfaceDefaults,
    moduleToggles,
    notificationDefaults,
    salesDefaults,
    taskDefaults,
    workspaceDefaults,
  };
}

export async function updateCompanyProfileAction(
  _: CompanyProfileSettingsState,
  formData: FormData,
): Promise<CompanyProfileSettingsState> {
  const user = await requireAdmin();
  const existingSettings = await prisma.crmSettings.findUnique({
    where: { id: "default" },
    select: { companyProfile: true },
  });
  const currentProfile = parseCompanyProfile(existingSettings?.companyProfile);
  const parsed = companyProfileSchema.safeParse({
    ...currentProfile,
    organizationName: formData.get("organizationName"),
    tradingName: formData.get("tradingName"),
    legalName: formData.get("legalName"),
    websiteUrl: formData.get("websiteUrl"),
    mainEmail: formData.get("mainEmail"),
    mainPhone: formData.get("mainPhone"),
    companyRegistrationNumber: formData.get("companyRegistrationNumber"),
    vatNumber: formData.get("vatNumber"),
    registeredAddressLine1: formData.get("registeredAddressLine1"),
    registeredAddressLine2: formData.get("registeredAddressLine2"),
    registeredCity: formData.get("registeredCity"),
    registeredCounty: formData.get("registeredCounty"),
    registeredPostcode: formData.get("registeredPostcode"),
    registeredCountry: formData.get("registeredCountry"),
    reportTitle: formData.get("reportTitle"),
    reportIntroText: formData.get("reportIntroText"),
    documentFooterText: formData.get("documentFooterText"),
    preparedByName: formData.get("preparedByName"),
    termsUrl: formData.get("termsUrl"),
    privacyUrl: formData.get("privacyUrl"),
    brandPrimaryColor: formData.get("brandPrimaryColor"),
    lightBrandPrimaryColor: formData.get("lightBrandPrimaryColor"),
    darkBrandPrimaryColor: formData.get("darkBrandPrimaryColor"),
    brandAccentColor: formData.get("brandAccentColor"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Check the organisation profile.",
      savedAt: null,
      profile: null,
    };
  }

  const logoFile = formData.get("companyLogo");
  const lightLogoFile = formData.get("lightModeLogo");
  const darkLogoFile = formData.get("darkModeLogo");
  const removeLogo = formData.get("removeLogo") === "on";
  const removeLightLogo = formData.get("removeLightLogo") === "on";
  const removeDarkLogo = formData.get("removeDarkLogo") === "on";
  let nextProfile: CompanyProfile = {
    ...currentProfile,
    ...parsed.data,
  };

  if (removeLogo) {
    nextProfile = {
      ...nextProfile,
      logoFileAssetId: null,
      logoOriginalName: null,
      logoUrl: null,
    };
  }

  if (removeLightLogo) {
    nextProfile = {
      ...nextProfile,
      lightLogoFileAssetId: null,
      lightLogoOriginalName: null,
      lightLogoUrl: null,
    };
  }

  if (removeDarkLogo) {
    nextProfile = {
      ...nextProfile,
      darkLogoFileAssetId: null,
      darkLogoOriginalName: null,
      darkLogoUrl: null,
    };
  }

  if (logoFile instanceof File && logoFile.size > 0) {
    try {
      const fileAsset = await uploadCompanyLogoFile({
        file: logoFile,
        folder: "company/logo/default",
        uploadedById: user.id,
      });

      nextProfile = {
        ...nextProfile,
        logoFileAssetId: fileAsset.id,
        logoOriginalName: fileAsset.originalName,
        logoUrl: mediaAssetUrl(fileAsset.id),
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error ? error.message : "Company logo upload failed.",
        savedAt: null,
        profile: null,
      };
    }
  }

  if (lightLogoFile instanceof File && lightLogoFile.size > 0) {
    try {
      const fileAsset = await uploadCompanyLogoFile({
        file: lightLogoFile,
        folder: "company/logo/light",
        uploadedById: user.id,
      });

      nextProfile = {
        ...nextProfile,
        lightLogoFileAssetId: fileAsset.id,
        lightLogoOriginalName: fileAsset.originalName,
        lightLogoUrl: mediaAssetUrl(fileAsset.id),
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Light mode logo upload failed.",
        savedAt: null,
        profile: null,
      };
    }
  }

  if (darkLogoFile instanceof File && darkLogoFile.size > 0) {
    try {
      const fileAsset = await uploadCompanyLogoFile({
        file: darkLogoFile,
        folder: "company/logo/dark",
        uploadedById: user.id,
      });

      nextProfile = {
        ...nextProfile,
        darkLogoFileAssetId: fileAsset.id,
        darkLogoOriginalName: fileAsset.originalName,
        darkLogoUrl: mediaAssetUrl(fileAsset.id),
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Dark mode logo upload failed.",
        savedAt: null,
        profile: null,
      };
    }
  }

  nextProfile = {
    ...nextProfile,
    updatedAt: new Date().toISOString(),
  };

  await prisma.crmSettings.upsert({
    where: { id: "default" },
    update: { companyProfile: safeJson(nextProfile) },
    create: {
      id: "default",
      companiesEnabled: true,
      companyProfile: safeJson(nextProfile),
    },
  });

  revalidateCrmSettings();
  revalidatePath("/", "layout");
  revalidatePath("/settings/company");

  return {
    ok: true,
    message: "Company branding saved.",
    savedAt: Date.now(),
    profile: nextProfile,
  };
}

export async function updateAttributionFeatureSettingsAction(
  _: AttributionFeatureSettingsState,
  formData: FormData,
): Promise<AttributionFeatureSettingsState> {
  await requireAdmin();

  const settings = {
    attributionTrackingEnabled: formData.get("attributionTrackingEnabled") === "on",
    attributionRequireConsent: formData.get("attributionRequireConsent") === "on",
    attributionFormTrackingEnabled: formData.get("attributionFormTrackingEnabled") === "on",
    attributionInjectHiddenFieldEnabled:
      formData.get("attributionInjectHiddenFieldEnabled") === "on",
    attributionPhoneTrackingEnabled: formData.get("attributionPhoneTrackingEnabled") === "on",
    attributionReplaceTelLinksEnabled:
      formData.get("attributionReplaceTelLinksEnabled") === "on",
    attributionReplaceVisibleNumbersEnabled:
      formData.get("attributionReplaceVisibleNumbersEnabled") === "on",
  };

  await prisma.crmSettings.upsert({
    where: { id: "default" },
    update: settings,
    create: { id: "default", companiesEnabled: true, ...settings },
  });

  revalidateCrmSettings();
  revalidatePath("/settings/attribution");
  return { ok: true, message: "Attribution feature settings saved.", savedAt: Date.now() };
}

export async function updateAttributionSessionSettingsAction(
  _: AttributionSessionSettingsState,
  formData: FormData,
): Promise<AttributionSessionSettingsState> {
  await requireAdmin();

  const parsed = attributionSessionSettingsSchema.safeParse({
    attributionSessionTimeoutMinutes: formData.get("attributionSessionTimeoutMinutes"),
    attributionTimelineLimit: formData.get("attributionTimelineLimit"),
    attributionRetentionDays: formData.get("attributionRetentionDays"),
    attributionCaptureReferrerEnabled:
      formData.get("attributionCaptureReferrerEnabled") === "on",
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the session settings.",
      savedAt: null,
    };
  }

  await prisma.crmSettings.upsert({
    where: { id: "default" },
    update: parsed.data,
    create: { id: "default", companiesEnabled: true, ...parsed.data },
  });

  revalidateCrmSettings();
  revalidatePath("/settings/attribution/session-settings");
  revalidatePath("/settings/attribution/tracking-script");
  return { ok: true, message: "Attribution session settings saved.", savedAt: Date.now() };
}

export async function updateAttributionConsentSettingsAction(
  _: AttributionConsentSettingsState,
  formData: FormData,
): Promise<AttributionConsentSettingsState> {
  await requireAdmin();

  const parsedRequirements = attributionConsentRequirementsSchema.safeParse({
    legalBasisConfirmed: formData.get("legalBasisConfirmed") === "on",
    privacyPolicyUpdated: formData.get("privacyPolicyUpdated") === "on",
    consentBannerConnected: formData.get("consentBannerConnected") === "on",
    domainRegistryReviewed: formData.get("domainRegistryReviewed") === "on",
    consentPromptEnabled: formData.get("consentPromptEnabled") === "on",
    consentPromptTitle: formData.get("consentPromptTitle"),
    consentPromptMessage: formData.get("consentPromptMessage"),
    consentPromptAcceptLabel: formData.get("consentPromptAcceptLabel"),
    consentPromptDeclineLabel: formData.get("consentPromptDeclineLabel"),
    consentPromptPlacement: formData.get("consentPromptPlacement"),
    consentPromptTheme: formData.get("consentPromptTheme"),
    consentPromptMaxWidth: formData.get("consentPromptMaxWidth"),
    consentPromptBorderRadius: formData.get("consentPromptBorderRadius"),
    consentPromptBackgroundColor: formData.get("consentPromptBackgroundColor"),
    consentPromptTextColor: formData.get("consentPromptTextColor"),
    consentPromptMutedTextColor: formData.get("consentPromptMutedTextColor"),
    consentPromptBorderColor: formData.get("consentPromptBorderColor"),
    consentPromptButtonBackgroundColor: formData.get("consentPromptButtonBackgroundColor"),
    consentPromptButtonTextColor: formData.get("consentPromptButtonTextColor"),
    consentPromptLinkColor: formData.get("consentPromptLinkColor"),
    consentPromptPrivacyUrl: formData.get("consentPromptPrivacyUrl"),
    reviewedBy: formData.get("reviewedBy"),
    reviewedAt: formData.get("reviewedAt"),
    notes: formData.get("notes"),
  });

  if (!parsedRequirements.success) {
    return {
      ok: false,
      message:
        parsedRequirements.error.issues[0]?.message ??
        "Check the consent rollout requirements.",
      savedAt: null,
    };
  }

  const settings = {
    attributionRequireConsent: formData.get("attributionRequireConsent") === "on",
    attributionConsentRequirements: safeJson({
      ...parsedRequirements.data,
      updatedAt: new Date().toISOString(),
    }),
  };

  await prisma.crmSettings.upsert({
    where: { id: "default" },
    update: settings,
    create: { id: "default", companiesEnabled: true, ...settings },
  });

  revalidateCrmSettings();
  revalidatePath("/settings/attribution/consent-settings");
  revalidatePath("/settings/attribution/tracking-script");
  return { ok: true, message: "Consent settings saved.", savedAt: Date.now() };
}

export async function updateBrowserExtensionSettingsAction(
  _: BrowserExtensionSettingsState,
  formData: FormData,
): Promise<BrowserExtensionSettingsState> {
  await requireAdmin();

  const rawUrl = String(formData.get("chromeWebStoreUrl") ?? "").trim();
  const chromeWebStoreUrl = rawUrl.length ? rawUrl : null;

  if (chromeWebStoreUrl && !isChromeWebStoreInstallUrl(chromeWebStoreUrl)) {
    return {
      ok: false,
      message:
        "Enter a Chrome Web Store extension URL, or leave the field empty while the extension is awaiting approval.",
      savedAt: null,
    };
  }

  await prisma.crmSettings.upsert({
    where: { id: "default" },
    update: {
      browserExtension: {
        chromeWebStoreUrl,
        chromeWebStoreId: chromeWebStoreUrl
          ? extractChromeWebStoreId(chromeWebStoreUrl)
          : null,
        updatedAt: new Date().toISOString(),
      },
    },
    create: {
      id: "default",
      companiesEnabled: true,
      browserExtension: {
        chromeWebStoreUrl,
        chromeWebStoreId: chromeWebStoreUrl
          ? extractChromeWebStoreId(chromeWebStoreUrl)
          : null,
        updatedAt: new Date().toISOString(),
      },
    },
  });

  revalidateCrmSettings();
  revalidatePath("/settings/browser-extension");
  revalidatePath("/telephony/extension");
  return {
    ok: true,
    message: chromeWebStoreUrl
      ? "Chrome Web Store install URL saved."
      : "Chrome Web Store URL cleared. Manual install remains active.",
    savedAt: Date.now(),
  };
}

export async function updateCrmAIContextAction(
  _: CrmAIContextSettingsState,
  formData: FormData,
): Promise<CrmAIContextSettingsState> {
  await requireAdmin();

  const tone = String(formData.get("tone") ?? "consultative");

  if (!crmAIToneOptions.includes(tone as CrmAIToneOption)) {
    return {
      ok: false,
      message: "Choose a valid tone option.",
      savedAt: null,
    };
  }

  const aiContext = {
    profile: field(formData, "profile"),
    productsServices: field(formData, "productsServices"),
    idealCustomers: field(formData, "idealCustomers"),
    valueProposition: field(formData, "valueProposition"),
    proofPoints: field(formData, "proofPoints"),
    competitors: field(formData, "competitors"),
    objections: field(formData, "objections"),
    doSay: field(formData, "doSay"),
    dontSay: field(formData, "dontSay"),
    complianceNotes: field(formData, "complianceNotes"),
    tone: tone as CrmAIToneOption,
    customTone: field(formData, "customTone"),
    updatedAt: new Date().toISOString(),
  };

  await prisma.crmSettings.upsert({
    where: { id: "default" },
    update: { aiContext: safeJson(aiContext) },
    create: {
      id: "default",
      companiesEnabled: true,
      aiContext: safeJson(aiContext),
    },
  });

  revalidateCrmSettings();
  revalidatePath("/settings/ai-context");
  revalidatePath("/sales", "layout");

  return {
    ok: true,
    message: "AI context saved.",
    savedAt: Date.now(),
  };
}

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}
