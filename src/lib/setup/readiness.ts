import "server-only";

import { createHash } from "node:crypto";
import {
  getCompanyLogoUrl,
  parseCompanyProfile,
} from "@/lib/company-profile";
import { hasCredentialEncryptionKey } from "@/lib/crypto/secrets";
import {
  geoapifyProvider,
  hasGeoapifyEnvironmentConfig,
  hasStoredGeoapifyCredentials,
} from "@/lib/integrations/geoapify";
import { hasStoredId30AuthCredentials } from "@/lib/integrations/id30-auth";
import { id30AuthProvider } from "@/lib/integrations/id30-auth";
import {
  hasStoredMailerSendCredentials,
  mailerSendProvider,
  mailerSendStoredConfigSchema,
} from "@/lib/integrations/mailersend";
import {
  hasStoredOpenAICredentials,
  openaiProvider,
} from "@/lib/integrations/openai";
import {
  hasId30AuthEnvironmentConfig,
  hasOpenAIEnvironmentConfig,
} from "@/lib/integrations/system-services";
import {
  hasStoredTwilioCredentials,
  twilioProvider,
} from "@/lib/integrations/twilio";
import { marketingIntegrationProviderDefinitions } from "@/lib/marketing/integrations";
import { parseModuleToggles } from "@/lib/module-toggles";
import { prisma } from "@/lib/prisma";
import { getCrmSettings } from "@/lib/settings";
import {
  cloudflareR2Provider,
  hasStoredR2Credentials,
} from "@/lib/storage/r2";

export const dashboardSetupPromptNotificationId = "dashboard-setup-readiness";

export type SetupStatus = "Ready" | "Needed" | "WARNING" | "Planned";

export type SetupIconKey =
  | "company"
  | "customer-acquisition"
  | "operations"
  | "secure-access";

export type SetupItem = {
  title: string;
  detail: string;
  status: SetupStatus;
  href: string;
  action: string;
};

export type SetupGroup = {
  title: string;
  description: string;
  iconKey: SetupIconKey;
  items: SetupItem[];
};

export type SetupReadiness = {
  actionableCount: number;
  activeUserCount: number;
  adminCount: number;
  completionPercent: number;
  fingerprint: string;
  groups: SetupGroup[];
  isComplete: boolean;
  neededCount: number;
  outstandingItems: SetupItem[];
  readyCount: number;
  warningCount: number;
};

export type DashboardSetupPrompt = {
  actionableCount: number;
  completionPercent: number;
  fingerprint: string;
  neededCount: number;
  outstandingItems: SetupItem[];
  readyCount: number;
  warningCount: number;
};

export function setupStatusLabel(status: SetupStatus) {
  return status;
}

export function completionStatus(items: SetupItem[]): SetupStatus {
  const actionableItems = items.filter((item) => item.status !== "Planned");

  if (actionableItems.length === 0) return "Planned";
  if (actionableItems.every((item) => item.status === "Ready")) return "Ready";
  if (actionableItems.some((item) => item.status === "Needed")) return "Needed";
  return "WARNING";
}

function connectedIntegration(
  connection: { status: string; config: unknown } | undefined,
  hasStoredCredentials?: (config: unknown) => boolean,
) {
  if (!connection || connection.status !== "CONNECTED") return false;
  return hasStoredCredentials ? hasStoredCredentials(connection.config) : true;
}

function countReady(items: SetupItem[]) {
  return items.filter((item) => item.status === "Ready").length;
}

function readinessFingerprint(outstandingItems: SetupItem[]) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        outstandingItems.map((item) => ({
          detail: item.detail,
          href: item.href,
          status: item.status,
          title: item.title,
        })),
      ),
    )
    .digest("hex");
}

export async function loadSetupReadiness(): Promise<SetupReadiness> {
  const settings = await getCrmSettings();
  const moduleToggles = parseModuleToggles(
    settings.moduleToggles,
    settings.companiesEnabled,
  );
  const profile = parseCompanyProfile(settings.companyProfile);
  const lightLogo = getCompanyLogoUrl(profile, "light");
  const darkLogo = getCompanyLogoUrl(profile, "dark");

  const [
    connections,
    activeUserCount,
    adminCount,
    twoFactorUserCount,
    activeSetupLinkCount,
    activeAttributionDomainCount,
    scriptSeenDomainCount,
    activeTrackingNumberCount,
    activeBusinessNumberCount,
    activePipelineStageCount,
  ] = await Promise.all([
    prisma.integrationConnection.findMany({
      select: {
        config: true,
        provider: true,
        status: true,
        updatedAt: true,
      },
    }),
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { role: "ADMIN", status: "ACTIVE" } }),
    prisma.user.count({
      where: { status: "ACTIVE", twoFactorEnabled: true },
    }),
    prisma.passwordResetToken.count({
      where: { expiresAt: { gt: new Date() }, usedAt: null },
    }),
    prisma.attributionDomain.count({ where: { isActive: true } }),
    prisma.attributionDomain.count({
      where: { isActive: true, lastScriptSeenAt: { not: null } },
    }),
    prisma.attributionPhoneNumber.count({ where: { isActive: true } }),
    prisma.businessPhoneNumber.count({ where: { status: "ACTIVE" } }),
    prisma.salesPipelineStage.count({ where: { isActive: true } }),
  ]);

  const connectionMap = new Map(
    connections.map((connection) => [connection.provider, connection]),
  );
  const mailerSendConnection = connectionMap.get(mailerSendProvider);
  const mailerSendConfig = mailerSendStoredConfigSchema.safeParse(
    mailerSendConnection?.config ?? {},
  );
  const mailerSendReady =
    connectedIntegration(mailerSendConnection, hasStoredMailerSendCredentials) &&
    Boolean(mailerSendConfig.success && mailerSendConfig.data.fromEmail);
  const twilioReady = connectedIntegration(
    connectionMap.get(twilioProvider),
    hasStoredTwilioCredentials,
  );
  const r2Ready = connectedIntegration(
    connectionMap.get(cloudflareR2Provider),
    hasStoredR2Credentials,
  );
  const geoapifyReady =
    connectedIntegration(
      connectionMap.get(geoapifyProvider),
      hasStoredGeoapifyCredentials,
    ) || hasGeoapifyEnvironmentConfig();
  const openAiReady =
    connectedIntegration(connectionMap.get(openaiProvider), hasStoredOpenAICredentials) ||
    hasOpenAIEnvironmentConfig();
  const id30AuthReady =
    connectedIntegration(
      connectionMap.get(id30AuthProvider),
      hasStoredId30AuthCredentials,
    ) ||
    hasId30AuthEnvironmentConfig();
  const connectedMarketingProviders =
    marketingIntegrationProviderDefinitions.filter((provider) => {
      const connection = connectionMap.get(provider.provider);
      return connection?.status === "CONNECTED";
    });

  const companyIdentityReady = Boolean(
    profile.organizationName &&
      (profile.tradingName ||
        profile.legalName ||
        profile.websiteUrl ||
        profile.mainEmail),
  );
  const brandReady = Boolean(
    lightLogo ||
      darkLogo ||
      profile.brandPrimaryColor ||
      profile.lightBrandPrimaryColor ||
      profile.darkBrandPrimaryColor,
  );
  const workspaceDefaultsReady = Boolean(
    settings.workspaceDefaults &&
      settings.displayDefaults &&
      settings.interfaceDefaults,
  );
  const securityReady = hasCredentialEncryptionKey() && twoFactorUserCount > 0;
  const trackingReady =
    activeAttributionDomainCount > 0 && scriptSeenDomainCount > 0;
  const trackingStatus: SetupStatus =
    activeAttributionDomainCount === 0
      ? "Needed"
      : trackingReady
        ? "Ready"
        : "WARNING";

  const groups: SetupGroup[] = [
    {
      title: "Company Basics",
      description: "Client identity, workspace defaults and visible branding.",
      iconKey: "company",
      items: [
        {
          title: "Company identity",
          detail: companyIdentityReady
            ? "Company identity fields are populated."
            : "Add trading/legal name, website or main contact details.",
          status: companyIdentityReady ? "Ready" : "Needed",
          href: "/settings/company",
          action: "Open company profile",
        },
        {
          title: "Branding",
          detail: brandReady
            ? "Logo or brand colours are configured for the app shell."
            : "Add logo variants or brand colours for a client-owned experience.",
          status: brandReady ? "Ready" : "Needed",
          href: "/settings/company",
          action: "Set branding",
        },
        {
          title: "Workspace defaults",
          detail: workspaceDefaultsReady
            ? "Locale, display and interface defaults have been saved."
            : "Set currency, timezone, date format and default landing page.",
          status: workspaceDefaultsReady ? "Ready" : "Needed",
          href: "/settings/general",
          action: "Review defaults",
        },
      ],
    },
    {
      title: "Secure Access",
      description: "Team access, setup links and account protection.",
      iconKey: "secure-access",
      items: [
        {
          title: "Team users",
          detail:
            activeUserCount > 1
              ? `${activeUserCount} active users are available.`
              : "Add or import the client team so work is not tied to one account.",
          status: activeUserCount > 1 ? "Ready" : "Needed",
          href: "/settings/users",
          action: "Manage users",
        },
        {
          title: "Admin coverage",
          detail:
            adminCount > 1
              ? `${adminCount} active admins are available.`
              : "Keep at least two active admins to avoid lockout risk.",
          status: adminCount > 1 ? "Ready" : "WARNING",
          href: "/settings/users",
          action: "Review admins",
        },
        {
          title: "Invite/setup links",
          detail:
            activeSetupLinkCount > 0
              ? `${activeSetupLinkCount} active password setup links are pending.`
              : "No active setup links are currently waiting for users.",
          status: activeSetupLinkCount > 0 ? "WARNING" : "Ready",
          href: "/settings/users",
          action: "Check invites",
        },
        {
          title: "Two-factor adoption",
          detail:
            twoFactorUserCount > 0
              ? `${twoFactorUserCount} active users have enabled two-factor authentication.`
              : "Encourage admins and sensitive users to enable authenticator 2FA.",
          status: securityReady ? "Ready" : "WARNING",
          href: "/settings/security",
          action: "Open security",
        },
      ],
    },
    {
      title: "Customer Acquisition",
      description: "Email, attribution, marketing connections and AI assistance.",
      iconKey: "customer-acquisition",
      items: [
        {
          title: "Email sending and password reset",
          detail: mailerSendReady
            ? "MailerSend is connected with a sender address."
            : "Connect MailerSend so invites, reset emails and lead replies work.",
          status: mailerSendReady ? "Ready" : "Needed",
          href: "/settings/integrations/mailersend",
          action: "Connect email",
        },
        {
          title: "Tracking script install",
          detail:
            activeAttributionDomainCount === 0
              ? "Add the client website domain before checking the script."
              : scriptSeenDomainCount > 0
                ? `${scriptSeenDomainCount} active domain has reported the script.`
                : "A domain exists, but the script has not reported back yet.",
          status: trackingStatus,
          href: "/settings/attribution/tracking-script",
          action: "Check tracking",
        },
        {
          title: "Marketing OAuth broker",
          detail: id30AuthReady
            ? "iD30 Auth is ready for centralised marketing connections."
            : "Connect iD30 Auth before clients use one-click ad platform OAuth.",
          status: moduleToggles.marketing
            ? id30AuthReady
              ? "Ready"
              : "Needed"
            : "Planned",
          href: "/settings/integrations/id30-auth",
          action: "Open broker",
        },
        {
          title: "Marketing platforms",
          detail:
            connectedMarketingProviders.length > 0
              ? `${connectedMarketingProviders.length} marketing platform connection${
                  connectedMarketingProviders.length === 1 ? "" : "s"
                } configured.`
              : "Connect analytics, ad or email marketing platforms as needed.",
          status:
            !moduleToggles.marketing
              ? "Planned"
              : connectedMarketingProviders.length > 0
                ? "Ready"
                : "WARNING",
          href: "/settings/integrations",
          action: "Review platforms",
        },
        {
          title: "Address lookup",
          detail: geoapifyReady
            ? "Geoapify is connected for CRM address autocomplete."
            : "Connect Geoapify if the client wants address autocomplete on contact and company forms.",
          status: geoapifyReady ? "Ready" : "WARNING",
          href: "/settings/integrations/geoapify",
          action: "Connect lookup",
        },
        {
          title: "AI assistance",
          detail: openAiReady
            ? "OpenAI is available for Sidekick and CRM assistance."
            : "Connect OpenAI only if the client wants AI-assisted workflows.",
          status: !moduleToggles.ai ? "Planned" : openAiReady ? "Ready" : "WARNING",
          href: "/settings/ai-context",
          action: "Review AI",
        },
      ],
    },
    {
      title: "Operations",
      description: "Storage, sales workflow, telephony and deployment health.",
      iconKey: "operations",
      items: [
        {
          title: "File storage",
          detail: r2Ready
            ? "Cloudflare R2 is connected for app media and documents."
            : "Connect R2 before relying on uploads, avatars and storage.",
          status: r2Ready ? "Ready" : "Needed",
          href: "/settings/integrations/cloudflare-r2",
          action: "Connect storage",
        },
        {
          title: "Sales pipeline",
          detail:
            activePipelineStageCount > 0
              ? `${activePipelineStageCount} active pipeline stages are configured.`
              : "Create active pipeline stages before importing live leads.",
          status: activePipelineStageCount > 0 ? "Ready" : "Needed",
          href: "/settings/sales-pipeline",
          action: "Open pipeline",
        },
        {
          title: "Phone system",
          detail:
            !moduleToggles.telephony
              ? "Telephony is disabled for this workspace."
              : twilioReady && activeBusinessNumberCount > 0
                ? `${activeBusinessNumberCount} business number${
                    activeBusinessNumberCount === 1 ? "" : "s"
                  } ready.`
                : twilioReady
                  ? "Twilio is connected, but no active business numbers are loaded."
                  : "Connect Twilio before enabling call routing or tracking numbers.",
          status: !moduleToggles.telephony
            ? "Planned"
            : twilioReady && activeBusinessNumberCount > 0
              ? "Ready"
              : twilioReady
                ? "WARNING"
                : "Needed",
          href: "/telephony/system",
          action: "Open phone system",
        },
        {
          title: "Call tracking numbers",
          detail:
            activeTrackingNumberCount > 0
              ? `${activeTrackingNumberCount} active attribution number${
                  activeTrackingNumberCount === 1 ? "" : "s"
                } configured.`
              : "Add tracking numbers if the client needs DNI or offline attribution.",
          status:
            !moduleToggles.telephony || !moduleToggles.marketing
              ? "Planned"
              : activeTrackingNumberCount > 0
                ? "Ready"
                : "WARNING",
          href: "/telephony/call-tracking/numbers",
          action: "Review numbers",
        },
      ],
    },
  ];

  const allItems = groups.flatMap((group) => group.items);
  const readyCount = countReady(allItems);
  const actionableCount = allItems.filter((item) => item.status !== "Planned").length;
  const neededCount = allItems.filter((item) => item.status === "Needed").length;
  const warningCount = allItems.filter((item) => item.status === "WARNING").length;
  const completionPercent =
    actionableCount > 0 ? Math.round((readyCount / actionableCount) * 100) : 100;
  const outstandingItems = allItems.filter(
    (item) => item.status === "Needed" || item.status === "WARNING",
  );

  return {
    actionableCount,
    activeUserCount,
    adminCount,
    completionPercent,
    fingerprint: readinessFingerprint(outstandingItems),
    groups,
    isComplete: outstandingItems.length === 0,
    neededCount,
    outstandingItems,
    readyCount,
    warningCount,
  };
}

export async function loadDashboardSetupPrompt(
  currentUserId: string,
): Promise<DashboardSetupPrompt | null> {
  const readiness = await loadSetupReadiness();

  if (readiness.isComplete) return null;

  const state = await prisma.notificationState.findUnique({
    where: {
      userId_notificationId: {
        notificationId: dashboardSetupPromptNotificationId,
        userId: currentUserId,
      },
    },
    select: {
      dismissedAt: true,
      fingerprint: true,
    },
  });

  if (state?.dismissedAt && state.fingerprint === readiness.fingerprint) {
    return null;
  }

  return {
    actionableCount: readiness.actionableCount,
    completionPercent: readiness.completionPercent,
    fingerprint: readiness.fingerprint,
    neededCount: readiness.neededCount,
    outstandingItems: readiness.outstandingItems,
    readyCount: readiness.readyCount,
    warningCount: readiness.warningCount,
  };
}
