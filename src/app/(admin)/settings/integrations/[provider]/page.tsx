import Link from "next/link";
import { notFound } from "next/navigation";
import { BackgroundJobRunStatus, type Prisma } from "@prisma/client";
import type { ReactNode } from "react";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import {
  BingAdsIntegrationForm,
  CloudflareR2SettingsForm,
  DocuSignSettingsForm,
  GeoapifySettingsForm,
  GoogleAdsIntegrationForm,
  GoogleAnalyticsIntegrationForm,
  GoogleSearchConsoleIntegrationForm,
  Id30AuthSettingsForm,
  KlaviyoIntegrationForm,
  LinkedInAdsIntegrationForm,
  MailerSendSettingsForm,
  MetaIntegrationForm,
  OpenAISettingsForm,
  PipedriveSettingsForm,
  TwilioSettingsForm,
} from "@/components/crm-boilerplate/LazyIntegrationForms";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import PipedriveLeadPullForm from "@/components/crm-boilerplate/PipedriveLeadPullForm";
import PipedriveWebhookReceiverTestForm from "@/components/crm-boilerplate/PipedriveWebhookReceiverTestForm";
import ProviderAuthResetForm from "@/components/crm-boilerplate/ProviderAuthResetForm";
import ProviderConnectionTestForm from "@/components/crm-boilerplate/ProviderConnectionTestForm";
import ProviderSelectorRefreshForm from "@/components/crm-boilerplate/LazyProviderSelectorRefreshForm";
import StatusBadge from "@/components/crm-boilerplate/StatusBadge";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Download,
  Eye,
  XCircle,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { hasCredentialEncryptionKey } from "@/lib/crypto/secrets";
import {
  hasStoredTwilioCredentials,
  twilioConfigSchema,
} from "@/lib/integrations/twilio";
import {
  hasStoredMailerSendCredentials,
  mailerSendConfigSchema,
} from "@/lib/integrations/mailersend";
import {
  hasStoredId30AuthCredentials,
  id30AuthConfigSchema,
  id30AuthProvider,
  publicId30AuthConfig,
} from "@/lib/integrations/id30-auth";
import {
  hasId30AuthEnvironmentConfig,
  hasOpenAIEnvironmentConfig,
  systemIntegrationDefinition,
} from "@/lib/integrations/system-services";
import { appBaseUrlFromHeaders } from "@/lib/http/origin";
import {
  bingAdsConfigSchema,
  findMarketingIntegrationProvider,
  getMarketingIntegrationCredentialState,
  getMarketingIntegrationProviderState,
  googleAdsConfigSchema,
  googleAnalyticsConfigSchema,
  googleSearchConsoleConfigSchema,
  klaviyoConfigSchema,
  linkedInAdsConfigSchema,
  marketingIntegrationProviderDefinitions,
  marketingProviderSelectorOptionsFromConfig,
  metaConfigSchema,
  type MarketingIntegrationProviderDefinition,
  type MarketingIntegrationProviderSlug,
} from "@/lib/marketing/integrations";
import {
  combinedMarketingProviderSelectorOptions,
  numericMarketingProviderSelectorOptions,
} from "@/lib/marketing/selector-option-lists";
import {
  fetchMarketingAuthBrokerProviderDiagnostics,
  findMarketingOAuthProvider,
  type MarketingAuthBrokerProviderDiagnosticsResult,
} from "@/lib/marketing/oauth";
import { prisma } from "@/lib/prisma";
import {
  hasStoredOpenAICredentials,
  openaiConfigSchema,
} from "@/lib/integrations/openai";
import {
  hasPipedriveEnvironmentConfig,
  hasStoredPipedriveCredentials,
  pipedriveConfigSchema,
  pipedriveProvider,
  pipedriveStoredConfigSchema,
} from "@/lib/integrations/pipedrive";
import {
  readPipedriveValidationSummary,
  type PipedriveValidationSummary,
} from "@/lib/integrations/pipedrive-validation";
import {
  docusignConfigSchema,
  docusignProvider,
  hasStoredDocuSignCredentials,
} from "@/lib/integrations/docusign";
import {
  geoapifyConfigSchema,
  geoapifyProvider,
  hasGeoapifyEnvironmentConfig,
  hasStoredGeoapifyCredentials,
} from "@/lib/integrations/geoapify";
import { hasStoredR2Credentials, r2ConfigSchema } from "@/lib/storage/r2";
import { dryRunMarketingProviderConversionUploadsAction } from "@/lib/actions/marketing-lifecycle";
import {
  importPipedriveLeadByUrlAction,
  importSelectedPipedriveLeadsAction,
  previewPipedriveLeadsAction,
  pullPipedriveContactsAction,
} from "@/lib/actions/integrations";
import { backgroundJobStaleCutoff } from "@/lib/maintenance/background-jobs";

type ProviderSyncLog = {
  id: string;
  provider: string;
  status: string;
  syncType: string;
  recordsRead: number;
  recordsWritten: number;
  startedAt: Date;
  message: string | null;
};

type PipedrivePreviewLog = {
  message: string | null;
  metadata: Prisma.JsonValue | null;
  recordsRead: number;
  startedAt: Date;
  status: string;
};

type PipedriveImportLog = PipedrivePreviewLog & {
  recordsWritten: number;
  syncType: string;
};

type PipedrivePreviewRow = {
  companyName: string | null;
  contactEmail: string | null;
  contactName: string | null;
  contactPhone: string | null;
  currency: string | null;
  expectedCloseDate: string | null;
  externalLeadId: string | null;
  linkedOpportunityId: string | null;
  matchedCompanyId: string | null;
  matchedCompanyName: string | null;
  matchedContactId: string | null;
  matchedContactName: string | null;
  status: "would_create" | "linked_existing" | "skipped";
  title: string | null;
  valueCents: number | null;
  warningCount: number;
  warnings: string[];
};

type PipedriveImportRow = {
  companyId: string | null;
  contactId: string | null;
  createdCompany: boolean;
  createdContact: boolean;
  createdOpportunity: boolean;
  externalLeadId: string | null;
  opportunityId: string | null;
  status: "created" | "linked_existing" | "skipped";
  title: string | null;
  warningCount: number;
  warnings: string[];
};

type PipedriveContactImportRow = {
  companyId: string | null;
  contactId: string | null;
  createdCompany: boolean;
  createdContact: boolean;
  externalPersonId: string | null;
  name: string | null;
  status: "created" | "linked_existing" | "skipped";
  warningCount: number;
  warnings: string[];
};

type PipedriveCredentialSource = "database" | "environment" | "missing";

type PageSearchParams = {
  authSetup?: string | string[];
  message?: string | string[];
  oauth?: string | string[];
  ref?: string | string[];
};

const oauthInstallProviderSlugs = new Set<MarketingIntegrationProviderSlug>([
  "bing-ads",
  "google-ads",
  "google-analytics",
  "google-search-console",
  "klaviyo",
  "linkedin-ads",
  "meta",
]);

const conversionDryRunProviderSlugs = new Set<MarketingIntegrationProviderSlug>(
  ["bing-ads", "google-ads", "linkedin-ads", "meta"],
);

function searchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function booleanEnv(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();

  return Boolean(normalized && ["1", "true", "yes", "on"].includes(normalized));
}

export default async function IntegrationSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ provider: string }>;
  searchParams?: Promise<PageSearchParams>;
}) {
  const { provider } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const marketingProvider = findMarketingIntegrationProvider(provider);

  if (marketingProvider) {
    await requireAdmin();
    const [connection, id30AuthConnection, recentSyncLogs] = await Promise.all([
      prisma.integrationConnection.findUnique({
        where: { provider: marketingProvider.provider },
        select: {
          status: true,
          config: true,
          updatedAt: true,
        },
      }),
      prisma.integrationConnection.findUnique({
        where: { provider: id30AuthProvider },
        select: {
          config: true,
          status: true,
        },
      }),
      prisma.marketingIntegrationSyncLog.findMany({
        where: { provider: marketingProvider.provider },
        orderBy: { startedAt: "desc" },
        take: 8,
        select: {
          id: true,
          provider: true,
          status: true,
          syncType: true,
          recordsRead: true,
          recordsWritten: true,
          startedAt: true,
          message: true,
        },
      }),
    ]);
    const hasSavedAuthBroker =
      (id30AuthConnection?.status === "CONNECTED" &&
        hasStoredId30AuthCredentials(id30AuthConnection.config)) ||
      hasId30AuthEnvironmentConfig();
    const authBrokerProvider = findMarketingOAuthProvider(
      marketingProvider.slug,
    );
    const authBrokerDiagnostics =
      hasSavedAuthBroker && authBrokerProvider?.authBroker
        ? await fetchMarketingAuthBrokerProviderDiagnostics({
            provider: marketingProvider.slug,
          })
        : null;

    return (
      <MarketingIntegrationSettings
        authBrokerDiagnostics={authBrokerDiagnostics}
        canEdit
        connection={connection}
        hasSavedAuthBroker={hasSavedAuthBroker}
        oauthStatus={searchParamValue(resolvedSearchParams.oauth)}
        oauthRef={searchParamValue(resolvedSearchParams.ref)}
        provider={marketingProvider}
        recentSyncLogs={recentSyncLogs}
      />
    );
  }

  await requireAdmin();
  const integration = await prisma.integrationConnection.findUnique({
    where: { provider },
  });

  const supportsFirstRunSetup = Boolean(
    systemIntegrationDefinition(provider)?.realIntegration,
  );

  if (!integration && !supportsFirstRunSetup) notFound();

  if (provider === id30AuthProvider) {
    const config = id30AuthConfigSchema.safeParse(integration?.config ?? {});
    const crmBaseUrl = await appBaseUrlFromHeaders();
    const setupStatusParam = searchParamValue(resolvedSearchParams.authSetup);
    const setupStatus =
      setupStatusParam === "connected" || setupStatusParam === "failed"
        ? setupStatusParam
        : undefined;
    const setupMessage = searchParamValue(resolvedSearchParams.message);
    const hasStoredAuthCredentials = hasStoredId30AuthCredentials(
      integration?.config,
    );
    const authCredentialSource = hasStoredAuthCredentials
      ? "database"
      : hasId30AuthEnvironmentConfig()
        ? "environment"
        : "missing";

    return (
      <>
        <PageHeader
          title="iD30 Auth provisioning"
          description="Internal iD30 broker setup for marketing provider logins. Clients should not need access to Auth."
        />
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <Id30AuthSettingsForm
            appBaseUrl={crmBaseUrl}
            bootstrapUrl="/api/integrations/id30-auth/bootstrap/start"
            callbackUrl={`${crmBaseUrl}/api/integrations/oauth/complete`}
            config={
              config.success
                ? publicId30AuthConfig(integration?.config)
                : undefined
            }
            credentialSource={authCredentialSource}
            hasStoredCredentials={hasStoredAuthCredentials}
            hasEncryptionKey={hasCredentialEncryptionKey()}
            canEdit
            setupMessage={setupMessage}
            setupStatus={setupStatus}
          />
        </div>
      </>
    );
  }

  if (provider === "openai") {
    const config = openaiConfigSchema.parse(integration?.config ?? {});
    const hasStoredOpenAIConfig = hasStoredOpenAICredentials(
      integration?.config,
    );
    const openAICredentialSource = hasStoredOpenAIConfig
      ? "database"
      : hasOpenAIEnvironmentConfig()
        ? "environment"
        : "missing";

    return (
      <>
        <PageHeader
          title="Connect OpenAI"
          description="Connection credentials for Sidekick, call summaries and AI-assisted CRM workflows."
        />
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <OpenAISettingsForm
            config={config}
            credentialSource={openAICredentialSource}
            hasStoredCredentials={hasStoredOpenAIConfig}
            hasEncryptionKey={hasCredentialEncryptionKey()}
            canEdit
          />
        </div>
      </>
    );
  }

  if (provider === "cloudflare-r2") {
    const config = r2ConfigSchema.safeParse(integration?.config ?? {});

    return (
      <>
        <PageHeader
          title="Connect Cloudflare R2"
          description="Connection credentials for the CRM storage platform."
        />
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <CloudflareR2SettingsForm
            config={config.success ? config.data : {}}
            hasStoredCredentials={hasStoredR2Credentials(integration?.config)}
            hasEncryptionKey={hasCredentialEncryptionKey()}
            canEdit
            mode="connection"
          />
        </div>
      </>
    );
  }

  if (provider === geoapifyProvider) {
    const config = geoapifyConfigSchema.safeParse(integration?.config ?? {});
    const hasStoredGeoapifyConfig = hasStoredGeoapifyCredentials(
      integration?.config,
    );
    const geoapifyCredentialSource = hasStoredGeoapifyConfig
      ? "database"
      : hasGeoapifyEnvironmentConfig()
        ? "environment"
        : "missing";

    return (
      <>
        <PageHeader
          title="Connect Geoapify"
          description="Connection credentials for address autocomplete on CRM contact and company records."
        />
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <GeoapifySettingsForm
            config={config.success ? config.data : {}}
            credentialSource={geoapifyCredentialSource}
            hasStoredCredentials={hasStoredGeoapifyConfig}
            hasEncryptionKey={hasCredentialEncryptionKey()}
            canEdit
          />
        </div>
      </>
    );
  }

  if (provider === pipedriveProvider) {
    const [
      recentPipedriveSyncLogs,
      latestPipedrivePreviewLog,
      latestPipedriveImportLog,
      latestPipedriveContactImportLog,
      activePipedrivePullRun,
      activePipedriveContactPullRun,
      pipedriveValidationSummary,
    ] = await Promise.all([
      prisma.marketingIntegrationSyncLog.findMany({
        orderBy: { startedAt: "desc" },
        select: {
          id: true,
          message: true,
          provider: true,
          recordsRead: true,
          recordsWritten: true,
          startedAt: true,
          status: true,
          syncType: true,
        },
        take: 8,
        where: { provider: pipedriveProvider },
      }),
      prisma.marketingIntegrationSyncLog.findFirst({
        orderBy: { startedAt: "desc" },
        select: {
          message: true,
          metadata: true,
          recordsRead: true,
          startedAt: true,
          status: true,
        },
        where: {
          provider: pipedriveProvider,
          syncType: "lead-import-preview",
        },
      }),
      prisma.marketingIntegrationSyncLog.findFirst({
        orderBy: { startedAt: "desc" },
        select: {
          message: true,
          metadata: true,
          recordsRead: true,
          recordsWritten: true,
          startedAt: true,
          status: true,
          syncType: true,
        },
        where: {
          provider: pipedriveProvider,
          syncType: {
            in: ["lead-import", "lead-import-direct", "lead-import-selected"],
          },
        },
      }),
      prisma.marketingIntegrationSyncLog.findFirst({
        orderBy: { startedAt: "desc" },
        select: {
          message: true,
          metadata: true,
          recordsRead: true,
          recordsWritten: true,
          startedAt: true,
          status: true,
          syncType: true,
        },
        where: {
          provider: pipedriveProvider,
          syncType: { in: ["contact-import", "contact-import-webhook"] },
        },
      }),
      prisma.backgroundJobRun.findFirst({
        orderBy: [{ startedAt: "asc" }, { createdAt: "asc" }],
        select: {
          startedAt: true,
          trigger: true,
        },
        where: {
          jobName: "pipedrive.lead_import",
          startedAt: { gte: backgroundJobStaleCutoff() },
          status: BackgroundJobRunStatus.RUNNING,
        },
      }),
      prisma.backgroundJobRun.findFirst({
        orderBy: [{ startedAt: "asc" }, { createdAt: "asc" }],
        select: {
          startedAt: true,
          trigger: true,
        },
        where: {
          jobName: "pipedrive.contact_import",
          startedAt: { gte: backgroundJobStaleCutoff() },
          status: BackgroundJobRunStatus.RUNNING,
        },
      }),
      readPipedriveValidationSummary({
        includeWebhookRegistration: true,
        limit: 5,
      }),
    ]);
    const pipedrivePreviewRows = pipedrivePreviewRowsFromMetadata(
      latestPipedrivePreviewLog?.metadata,
    );
    const pipedriveImportRows = pipedriveImportRowsFromMetadata(
      latestPipedriveImportLog?.metadata,
    );
    const pipedriveContactImportRows = pipedriveContactImportRowsFromMetadata(
      latestPipedriveContactImportLog?.metadata,
    );
    const config = pipedriveConfigSchema.safeParse(integration?.config ?? {});
    const storedConfig = pipedriveStoredConfigSchema.safeParse(
      integration?.config ?? {},
    );
    const hasStoredPipedriveConfig = hasStoredPipedriveCredentials(
      integration?.config,
    );
    const pipedriveCredentialSource = hasStoredPipedriveConfig
      ? "database"
      : hasPipedriveEnvironmentConfig()
        ? "environment"
        : "missing";
    const pipedriveScheduleEnabled = booleanEnv(
      process.env.PIPEDRIVE_LEAD_IMPORT_CRON_ENABLED,
    );
    const pipedriveScheduleDryRun = booleanEnv(
      process.env.PIPEDRIVE_LEAD_IMPORT_CRON_DRY_RUN,
    );
    const pipedriveScheduleSecretConfigured = Boolean(
      process.env.PIPEDRIVE_LEAD_IMPORT_SECRET?.trim() ||
      process.env.CRON_SECRET?.trim(),
    );
    const pipedriveContactScheduleEnabled = booleanEnv(
      process.env.PIPEDRIVE_CONTACT_IMPORT_CRON_ENABLED,
    );
    const pipedriveContactScheduleDryRun = booleanEnv(
      process.env.PIPEDRIVE_CONTACT_IMPORT_CRON_DRY_RUN,
    );
    const pipedriveContactScheduleSecretConfigured = Boolean(
      process.env.PIPEDRIVE_CONTACT_IMPORT_SECRET?.trim() ||
      process.env.PIPEDRIVE_LEAD_IMPORT_SECRET?.trim() ||
      process.env.CRON_SECRET?.trim(),
    );
    const pipedriveWebhookSecretConfigured = Boolean(
      process.env.PIPEDRIVE_WEBHOOK_SECRET?.trim() ||
      process.env.PIPEDRIVE_LEAD_IMPORT_SECRET?.trim() ||
      process.env.CRON_SECRET?.trim(),
    );
    const pipedrivePullState = storedConfig.success
      ? {
          lastContactSyncAt: storedConfig.data.lastContactSyncAt ?? null,
          lastFullDealSyncAt: storedConfig.data.lastFullDealSyncAt ?? null,
          lastFullDealSyncNextCursor:
            typeof storedConfig.data.lastFullDealSyncNextCursor === "string"
              ? storedConfig.data.lastFullDealSyncNextCursor
              : null,
          lastFullLeadSyncAt: storedConfig.data.lastFullLeadSyncAt ?? null,
          lastFullLeadSyncNextStart:
            typeof storedConfig.data.lastFullLeadSyncNextStart === "number"
              ? storedConfig.data.lastFullLeadSyncNextStart
              : null,
          lastFullPersonSyncAt: storedConfig.data.lastFullPersonSyncAt ?? null,
          lastFullPersonSyncNextCursor:
            storedConfig.data.lastFullPersonSyncNextCursor ?? null,
          lastLeadSyncAt: storedConfig.data.lastLeadSyncAt ?? null,
        }
      : {
          lastContactSyncAt: null,
          lastFullDealSyncAt: null,
          lastFullDealSyncNextCursor: null,
          lastFullLeadSyncAt: null,
          lastFullLeadSyncNextStart: null,
          lastFullPersonSyncAt: null,
          lastFullPersonSyncNextCursor: null,
          lastLeadSyncAt: null,
        };

    return (
      <>
        <PageHeader
          title="Connect Pipedrive"
          description="Connection credentials for pull-only Pipedrive lead, deal, person and organisation imports."
        />
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <PipedriveSettingsForm
            config={config.success ? config.data : {}}
            credentialSource={pipedriveCredentialSource}
            hasStoredCredentials={hasStoredPipedriveConfig}
            hasEncryptionKey={hasCredentialEncryptionKey()}
            canEdit
          />
        </div>
        <PipedriveValidationSummaryPanel summary={pipedriveValidationSummary} />
        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
                  Lead and deal import
                </h2>
                <LazyHelpTooltip content="Preview reads Pipedrive and CRM links without changing lead records. Pull imports bounded lead and deal batches into CRM only, resumes capped runs, uses full-pull timestamps after completion, and never writes back to Pipedrive." />
              </div>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Preview the latest Pipedrive leads, then pull new or updated
                leads and deals into CRM contacts, companies and opportunities
                when ready.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <form action={previewPipedriveLeadsAction}>
                <button
                  type="submit"
                  disabled={pipedriveCredentialSource === "missing"}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                >
                  <Eye className="h-4 w-4" aria-hidden="true" />
                  Preview latest leads
                </button>
              </form>
              <PipedriveLeadPullForm
                disabled={pipedriveCredentialSource === "missing"}
              />
              <StatusBadge>
                {recentPipedriveSyncLogs.length
                  ? recentPipedriveSyncLogs[0].status
                  : "Planned"}
              </StatusBadge>
            </div>
          </div>
          <PipedrivePreviewTable
            canImport={pipedriveCredentialSource !== "missing"}
            log={latestPipedrivePreviewLog}
            rows={pipedrivePreviewRows}
          />
          <PipedriveDirectLeadImportForm
            canImport={pipedriveCredentialSource !== "missing"}
          />
          <PipedriveImportDetailTable
            log={latestPipedriveImportLog}
            rows={pipedriveImportRows}
          />
          <PipedrivePullStateSummary
            activeRun={activePipedrivePullRun}
            credentialSource={pipedriveCredentialSource}
            continuationDetail={
              pipedrivePullState.lastFullLeadSyncNextStart !== null
                ? `Continuation start ${pipedrivePullState.lastFullLeadSyncNextStart}`
                : pipedrivePullState.lastFullDealSyncNextCursor
                  ? "Deal continuation cursor saved"
                  : "No saved continuation"
            }
            lastFullSyncAt={pipedrivePullState.lastFullLeadSyncAt}
            lastSyncAt={pipedrivePullState.lastLeadSyncAt}
            scheduleDryRun={pipedriveScheduleDryRun}
            scheduleEnabled={pipedriveScheduleEnabled}
            scheduleSecretConfigured={pipedriveScheduleSecretConfigured}
            title="Lead pull state"
          />
        </section>

        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
                  Contact import
                </h2>
                <LazyHelpTooltip content="Pulls Pipedrive persons into CRM contacts and linked companies without creating sales opportunities or writing back to Pipedrive." />
              </div>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Pull Pipedrive persons into CRM contacts independently from the
                lead inbox.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <form action={pullPipedriveContactsAction}>
                <button
                  type="submit"
                  disabled={pipedriveCredentialSource === "missing"}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Pull Pipedrive contacts
                </button>
              </form>
              <StatusBadge>
                {latestPipedriveContactImportLog?.status ?? "Planned"}
              </StatusBadge>
            </div>
          </div>
          <PipedriveContactImportDetailTable
            log={latestPipedriveContactImportLog}
            rows={pipedriveContactImportRows}
          />
          <PipedrivePullStateSummary
            activeRun={activePipedriveContactPullRun}
            credentialSource={pipedriveCredentialSource}
            continuationDetail={
              pipedrivePullState.lastFullPersonSyncNextCursor
                ? "Continuation cursor saved"
                : "No saved continuation"
            }
            lastFullSyncAt={pipedrivePullState.lastFullPersonSyncAt}
            lastSyncAt={pipedrivePullState.lastContactSyncAt}
            scheduleDryRun={pipedriveContactScheduleDryRun}
            scheduleEnabled={pipedriveContactScheduleEnabled}
            scheduleSecretConfigured={pipedriveContactScheduleSecretConfigured}
            title="Contact pull state"
          />
        </section>

        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
                Webhook receiver
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Endpoint:{" "}
                <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700 dark:bg-white/10 dark:text-gray-300">
                  /api/webhooks/pipedrive
                </code>
              </p>
            </div>
            <PipedriveWebhookReceiverTestForm
              disabled={!pipedriveWebhookSecretConfigured}
            />
          </div>
          <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <PipedrivePullStateItem
              label="Webhook secret"
              value={
                pipedriveWebhookSecretConfigured ? "Configured" : "Missing"
              }
              detail={
                pipedriveWebhookSecretConfigured
                  ? "Basic auth or bearer supported"
                  : "Set webhook secret before registration"
              }
            />
            <PipedrivePullStateItem
              label="Write-back"
              value="Disabled"
              detail="CRM receiver is pull-only"
            />
            <PipedrivePullStateItem
              label="Lead events"
              value="Supported"
              detail="Create/change imports matching lead"
            />
            <PipedrivePullStateItem
              label="Deal events"
              value="Supported"
              detail="Create/change imports matching deal"
            />
            <PipedrivePullStateItem
              label="Person events"
              value="Supported"
              detail="Create/change imports matching contact"
            />
          </dl>
        </section>

        <PipedriveWebhookActivityPanel
          activity={pipedriveValidationSummary.webhookActivity}
        />

        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <h2 className="mb-4 text-base font-semibold text-gray-800 dark:text-white/90">
            Sync history
          </h2>
          <SyncHistoryTable logs={recentPipedriveSyncLogs} />
        </section>
      </>
    );
  }

  if (provider === docusignProvider) {
    const config = docusignConfigSchema.safeParse(integration?.config ?? {});
    const hasStoredDocuSignConfig = hasStoredDocuSignCredentials(
      integration?.config,
    );

    return (
      <>
        <PageHeader
          title="Connect DocuSign"
          description="Connection credentials for sending CRM documents for electronic signature."
        />
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <DocuSignSettingsForm
            config={config.success ? config.data : {}}
            hasStoredCredentials={hasStoredDocuSignConfig}
            hasEncryptionKey={hasCredentialEncryptionKey()}
            canEdit
          />
        </div>
      </>
    );
  }

  if (provider === "twilio") {
    const config = twilioConfigSchema.safeParse(integration?.config ?? {});

    return (
      <>
        <PageHeader
          title="Connect Twilio"
          description="Connection credentials for voice, SMS and WhatsApp services."
        />
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <TwilioSettingsForm
            config={config.success ? config.data : {}}
            hasStoredCredentials={hasStoredTwilioCredentials(
              integration?.config,
            )}
            hasEncryptionKey={hasCredentialEncryptionKey()}
            canEdit
            mode="connection"
          />
        </div>
      </>
    );
  }

  if (provider === "mailersend") {
    const config = mailerSendConfigSchema.safeParse(integration?.config ?? {});

    return (
      <>
        <PageHeader
          title="Connect MailerSend"
          description="Connection settings for transactional email, domain authentication and inbound email routing."
        />
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <MailerSendSettingsForm
            config={config.success ? config.data : {}}
            hasStoredCredentials={hasStoredMailerSendCredentials(
              integration?.config,
            )}
            hasEncryptionKey={hasCredentialEncryptionKey()}
            canEdit
          />
        </div>
      </>
    );
  }

  if (!integration) notFound();

  return (
    <>
      <PageHeader
        title={`${integration.name} Settings`}
        description="Connection settings for this provider are not available yet."
      />
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              API key
            </label>
            <input
              disabled
              placeholder="Add encrypted credential storage before use"
              className="h-11 w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              Webhook URL
            </label>
            <input
              disabled
              placeholder="https://example.com/webhook"
              className="h-11 w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900"
            />
          </div>
        </div>
      </div>
    </>
  );
}

function MarketingIntegrationSettings({
  authBrokerDiagnostics,
  canEdit,
  connection,
  hasSavedAuthBroker,
  oauthRef,
  oauthStatus,
  provider,
  recentSyncLogs,
}: {
  authBrokerDiagnostics: MarketingAuthBrokerProviderDiagnosticsResult | null;
  canEdit: boolean;
  connection: {
    status: "CONNECTED" | "NOT_CONNECTED" | "ERROR";
    config: unknown;
    updatedAt: Date;
  } | null;
  hasSavedAuthBroker: boolean;
  oauthRef?: string;
  oauthStatus?: string;
  provider: MarketingIntegrationProviderDefinition;
  recentSyncLogs: ProviderSyncLog[];
}) {
  const providerState = getMarketingIntegrationProviderState(
    provider,
    connection,
  );
  const credentialState = getMarketingIntegrationCredentialState(
    provider.slug,
    connection?.config ?? {},
    { authBrokerConfigured: hasSavedAuthBroker },
  );
  const authBrokerStatus = marketingAuthBrokerStatus(connection?.config);
  const oauthMessage = oauthStatus
    ? marketingOAuthMessage(
        oauthStatus,
        provider,
        oauthRef ?? authBrokerStatus.errorRef ?? undefined,
      )
    : null;
  const isSearchConsole = provider.slug === "google-search-console";
  const isKlaviyo = provider.slug === "klaviyo";
  const isGoogleAnalytics = provider.slug === "google-analytics";
  const readinessCardLabel = isSearchConsole
    ? "Search data"
    : isGoogleAnalytics
      ? "Analytics data"
      : isKlaviyo
        ? "Lifecycle data"
        : "Upload readiness";
  const uploadReadinessDetail = isSearchConsole
    ? credentialState.providerAccessConnected && providerState.connected
      ? "Search Console access and verified property mapping are saved; provider data import can pull organic performance rows."
      : credentialState.providerAccessConnected
        ? "Provider access is connected; choose and save the verified search property next."
        : "Connect Google Search Console before organic performance data can be imported."
    : isGoogleAnalytics
      ? providerState.connected &&
        (!credentialState.uploadEnabled ||
          credentialState.providerAccessConnected)
        ? "GA4 property and event mapping are saved; Data API reporting import is ready when enabled."
        : providerState.connected
          ? "GA4 mapping is saved; connect Google Analytics before Data API reporting import can run."
          : "Save GA4 property and event mapping before analytics reporting can be imported."
      : isKlaviyo
        ? credentialState.providerAccessConnected && providerState.connected
          ? "Klaviyo access and lifecycle settings are saved; provider data import can pull lifecycle reporting rows."
          : credentialState.providerAccessConnected
            ? "Klaviyo access is connected; refresh options and save account/list settings next."
            : credentialState.oauthConfigured
              ? "Connect Klaviyo through iD30 Auth before lifecycle marketing data can be imported."
              : "iD30 Auth setup is required before Klaviyo can be connected."
        : credentialState.uploadReady
          ? credentialState.uploadCredentialMode === "auth-broker"
            ? "Uploads are enabled and provider credentials are managed by iD30 Auth."
            : "Uploads are enabled and fallback credentials are ready."
          : credentialState.uploadEnabled &&
              credentialState.providerAccessConnected
            ? "Provider access is connected; finish account and conversion mapping before uploads run."
            : credentialState.uploadEnabled
              ? "Uploads are enabled for this provider."
              : "Enable uploads after credentials and mappings are ready.";
  const connectionStatus = providerState.connected
    ? "Connected"
    : credentialState.providerAccessConnected
      ? "Access Connected"
      : providerState.status;
  const connectionDetail = providerState.connected
    ? connection?.updatedAt
      ? `Updated ${connection.updatedAt.toLocaleDateString("en-GB")}`
      : "Account mapping is saved."
    : authBrokerStatus.needsAttention
      ? authBrokerStatus.errorRef
        ? `iD30 Auth needs attention. Reference ${authBrokerStatus.errorRef}.`
        : "iD30 Auth needs attention before this provider can connect."
      : credentialState.providerAccessConnected
        ? isKlaviyo
          ? "Klaviyo access is connected. Refresh options, then save account mapping."
          : isGoogleAnalytics
            ? "Google Analytics Data API access is connected."
            : "Provider login is connected. Refresh options, then save account mapping."
        : connection?.updatedAt
          ? `Updated ${connection.updatedAt.toLocaleDateString("en-GB")}`
          : "No saved account mapping.";
  const setupStatusReady = isGoogleAnalytics
    ? providerState.connected &&
      (!credentialState.uploadEnabled ||
        credentialState.providerAccessConnected)
    : isSearchConsole || isKlaviyo
      ? credentialState.providerAccessConnected && providerState.connected
      : credentialState.uploadReady;

  return (
    <>
      <PageHeader
        title={`${provider.name} Integration`}
        description={provider.description}
        actions={
          <Link
            href="/settings/integrations"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium whitespace-nowrap text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
          >
            Integrations overview
          </Link>
        }
      />

      <ProviderNav activeProvider={provider.slug} />

      {oauthMessage ? (
        <div
          className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
            oauthMessage.ok
              ? "border-success-200 bg-success-50 text-success-700 dark:border-success-900/40 dark:bg-success-900/20 dark:text-success-300"
              : "border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-900/40 dark:bg-warning-900/20 dark:text-warning-300"
          }`}
        >
          {oauthMessage.message}
        </div>
      ) : null}

      {authBrokerStatus.needsAttention ? (
        <div className="mt-4 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700 dark:border-warning-900/40 dark:bg-warning-900/20 dark:text-warning-300">
          iD30 Auth reported a provider connection issue
          {authBrokerStatus.lastCallbackAt
            ? ` on ${new Date(authBrokerStatus.lastCallbackAt).toLocaleString("en-GB")}`
            : ""}
          . Check the Auth audit log before retrying
          {authBrokerStatus.errorRef ? (
            <>
              {" "}
              with reference{" "}
              <code className="font-mono rounded bg-white/70 px-1.5 py-0.5 text-xs text-warning-800 dark:bg-white/10 dark:text-warning-200">
                {authBrokerStatus.errorRef}
              </code>
            </>
          ) : null}
          .
        </div>
      ) : null}

      <MarketingSetupWizard
        canEdit={canEdit}
        config={connection?.config ?? {}}
        credentialState={credentialState}
        provider={provider}
        providerState={providerState}
      />

      <MarketingIntegrationProcessLog
        authBrokerDiagnostics={authBrokerDiagnostics}
        authBrokerStatus={authBrokerStatus}
        connection={connection}
        credentialState={credentialState}
        hasSavedAuthBroker={hasSavedAuthBroker}
        provider={provider}
        providerState={providerState}
        recentSyncLogs={recentSyncLogs}
      />

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryCard
          label="Connection"
          value={connectionStatus}
          detail={connectionDetail}
        />
        <SummaryCard
          label={readinessCardLabel}
          value={
            isSearchConsole
              ? credentialState.providerAccessConnected &&
                providerState.connected
                ? "Ready"
                : "Action needed"
              : isKlaviyo
                ? credentialState.providerAccessConnected &&
                  providerState.connected
                  ? "Ready"
                  : "Action needed"
                : credentialState.uploadReady
                  ? "Ready"
                  : "Action needed"
          }
          detail={uploadReadinessDetail}
        />
        <SummaryCard
          label="Sync jobs"
          value={recentSyncLogs.length.toString()}
          detail={
            recentSyncLogs[0]
              ? `Latest ${recentSyncLogs[0].status.toLowerCase()}`
              : "No provider jobs yet"
          }
        />
      </div>

      <MarketingIntegrationHealthPanel
        authBrokerStatus={authBrokerStatus}
        canEdit={canEdit}
        connection={connection}
        credentialState={credentialState}
        provider={provider}
        providerState={providerState}
        recentSyncLogs={recentSyncLogs}
      />

      <section
        id="provider-status"
        className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
                Setup status
              </h2>
              <LazyHelpTooltip content="Shows whether provider access, required credentials and account or property mappings are ready." />
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Non-secret setup status for {provider.name} provider access and
              mapping readiness.
            </p>
          </div>
          <StatusBadge>{setupStatusReady ? "Ready" : "Needed"}</StatusBadge>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {credentialState.items.map((item) => (
            <CredentialStatusItem key={item.label} item={item} />
          ))}
        </div>
      </section>

      <section
        id="provider-setup"
        className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
                {provider.setupTitle}
              </h2>
              <LazyHelpTooltip content="Stores the account mapping and provider settings this CRM needs before it can sync marketing data." />
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {provider.setupDescription}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {provider.slug === "bing-ads" ||
            provider.slug === "google-ads" ||
            provider.slug === "google-analytics" ||
            provider.slug === "google-search-console" ||
            provider.slug === "klaviyo" ||
            provider.slug === "linkedin-ads" ||
            provider.slug === "meta" ? (
              <ProviderSelectorRefreshForm
                canEdit={canEdit && credentialState.providerAccessConnected}
                provider={
                  provider.slug as
                    | "bing-ads"
                    | "google-ads"
                    | "google-analytics"
                    | "google-search-console"
                    | "klaviyo"
                    | "linkedin-ads"
                    | "meta"
                }
              />
            ) : null}
            <StatusBadge>
              {providerState.connected
                ? providerState.status
                : credentialState.providerAccessConnected
                  ? "Mapping Needed"
                  : providerState.status}
            </StatusBadge>
          </div>
        </div>
        <ProviderSetupForm
          provider={provider.slug}
          config={connection?.config ?? {}}
          canEdit={canEdit}
        />
      </section>

      <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
                Sync history
              </h2>
              <LazyHelpTooltip
                content={`Shows recent import and conversion-upload jobs for ${provider.name}, including status, record counts and messages.`}
              />
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Recent import and conversion-upload jobs for {provider.name}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <ProviderDryRunButton providerSlug={provider.slug} />
            <StatusBadge>
              {recentSyncLogs.length ? recentSyncLogs[0].status : "Planned"}
            </StatusBadge>
          </div>
        </div>
        <SyncHistoryTable logs={recentSyncLogs} />
      </section>
    </>
  );
}

function ProviderDryRunButton({
  providerSlug,
}: {
  providerSlug: MarketingIntegrationProviderSlug;
}) {
  if (!conversionDryRunProviderSlugs.has(providerSlug)) return null;

  return (
    <form action={dryRunMarketingProviderConversionUploadsAction}>
      <input type="hidden" name="providerSlug" value={providerSlug} />
      <button
        type="submit"
        className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.05]"
      >
        Run dry-run
      </button>
    </form>
  );
}

type HealthItemStatus = "Error" | "Needed" | "Planned" | "Ready";

type MarketingIntegrationHealthItem = {
  detail: string;
  label: string;
  status: HealthItemStatus;
};

function MarketingIntegrationHealthPanel({
  authBrokerStatus,
  canEdit,
  connection,
  credentialState,
  provider,
  providerState,
  recentSyncLogs,
}: {
  authBrokerStatus: ReturnType<typeof marketingAuthBrokerStatus>;
  canEdit: boolean;
  connection: {
    config: unknown;
    status: "CONNECTED" | "NOT_CONNECTED" | "ERROR";
    updatedAt: Date;
  } | null;
  credentialState: ReturnType<typeof getMarketingIntegrationCredentialState>;
  provider: MarketingIntegrationProviderDefinition;
  providerState: ReturnType<typeof getMarketingIntegrationProviderState>;
  recentSyncLogs: ProviderSyncLog[];
}) {
  const items = marketingIntegrationHealthItems({
    authBrokerStatus,
    connection,
    credentialState,
    provider,
    providerState,
    recentSyncLogs,
  });

  return (
    <section
      id="connection-health"
      className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Integration health
            </h2>
            <LazyHelpTooltip content="Summarises provider access, option cache, saved mapping and upload/import readiness without exposing credentials." />
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400">
            Operational checks for {provider.name}. Use Test connection for a
            read-only CRM/Auth status check before troubleshooting refreshes or
            uploads.
          </p>
        </div>
        <ProviderConnectionTestForm
          canEdit={canEdit}
          provider={provider.slug}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {items.map((item) => (
          <MarketingIntegrationHealthItemCard key={item.label} item={item} />
        ))}
      </div>
    </section>
  );
}

function MarketingIntegrationHealthItemCard({
  item,
}: {
  item: MarketingIntegrationHealthItem;
}) {
  return (
    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
          {item.label}
        </p>
        <StatusBadge>{item.status}</StatusBadge>
      </div>
      <p className="mt-2 text-sm leading-5 text-gray-500 dark:text-gray-400">
        {item.detail}
      </p>
    </div>
  );
}

type MarketingIntegrationProcessLogStatus =
  | "error"
  | "needed"
  | "planned"
  | "ready"
  | "warning";

type MarketingIntegrationProcessLogItem = {
  createdAt?: string | null;
  detail: string;
  label: string;
  source: "Auth" | "CRM";
  stage: string;
  status: MarketingIntegrationProcessLogStatus;
};

function MarketingIntegrationProcessLog({
  authBrokerDiagnostics,
  authBrokerStatus,
  connection,
  credentialState,
  hasSavedAuthBroker,
  provider,
  providerState,
  recentSyncLogs,
}: {
  authBrokerDiagnostics: MarketingAuthBrokerProviderDiagnosticsResult | null;
  authBrokerStatus: ReturnType<typeof marketingAuthBrokerStatus>;
  connection: {
    config: unknown;
    status: "CONNECTED" | "NOT_CONNECTED" | "ERROR";
    updatedAt: Date;
  } | null;
  credentialState: ReturnType<typeof getMarketingIntegrationCredentialState>;
  hasSavedAuthBroker: boolean;
  provider: MarketingIntegrationProviderDefinition;
  providerState: ReturnType<typeof getMarketingIntegrationProviderState>;
  recentSyncLogs: ProviderSyncLog[];
}) {
  const items = marketingIntegrationProcessLogItems({
    authBrokerDiagnostics,
    authBrokerStatus,
    connection,
    credentialState,
    hasSavedAuthBroker,
    provider,
    providerState,
    recentSyncLogs,
  });
  const latestAuthAudit =
    authBrokerDiagnostics?.ok && authBrokerDiagnostics.audits.length
      ? authBrokerDiagnostics.audits[0]
      : null;

  return (
    <section
      id="connection-process-log"
      className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Connection process log
            </h2>
            <LazyHelpTooltip content="Shows each key CRM/Auth setup step so operators can see where provider connection, callbacks, selector loading or local mapping failed." />
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400">
            Step-by-step status for {provider.name} setup, Auth broker handoff
            and CRM mapping.
          </p>
        </div>
        <StatusBadge>{processLogStatusBadge(items)}</StatusBadge>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {items.map((item) => (
            <div
              key={`${item.source}-${item.stage}-${item.label}`}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start"
            >
              <ProcessLogStatusIcon status={item.status} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                    {item.label}
                  </p>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-white/10 dark:text-gray-300">
                    {item.source}
                  </span>
                  {item.createdAt ? (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formattedDateTime(item.createdAt)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm leading-5 text-gray-600 dark:text-gray-300">
                  {item.detail}
                </p>
              </div>
              <div className="sm:ml-auto">
                <StatusBadge>{processLogStatusBadge([item])}</StatusBadge>
              </div>
            </div>
          ))}
        </div>
      </div>

      {latestAuthAudit ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          Latest Auth audit:{" "}
          <code className="font-mono rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700 dark:bg-white/10 dark:text-gray-200">
            {latestAuthAudit.id}
          </code>{" "}
          {latestAuthAudit.action} - {latestAuthAudit.message}
        </p>
      ) : null}
    </section>
  );
}

function ProcessLogStatusIcon({
  status,
}: {
  status: MarketingIntegrationProcessLogStatus;
}) {
  const className =
    "mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full";

  if (status === "ready") {
    return (
      <span
        className={`${className} bg-success-50 text-success-600 dark:bg-success-900/20 dark:text-success-300`}
      >
        <CheckCircle2 className="size-5" aria-hidden />
      </span>
    );
  }

  if (status === "error") {
    return (
      <span
        className={`${className} bg-error-50 text-error-600 dark:bg-error-900/20 dark:text-error-300`}
      >
        <XCircle className="size-5" aria-hidden />
      </span>
    );
  }

  if (status === "warning") {
    return (
      <span
        className={`${className} bg-warning-50 text-warning-600 dark:bg-warning-900/20 dark:text-warning-300`}
      >
        <AlertTriangle className="size-5" aria-hidden />
      </span>
    );
  }

  if (status === "needed") {
    return (
      <span
        className={`${className} bg-warning-50 text-warning-600 dark:bg-warning-900/20 dark:text-warning-300`}
      >
        <AlertCircle className="size-5" aria-hidden />
      </span>
    );
  }

  return (
    <span
      className={`${className} bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-300`}
    >
      <CircleDashed className="size-5" aria-hidden />
    </span>
  );
}

function processLogStatusBadge(items: MarketingIntegrationProcessLogItem[]) {
  if (items.some((item) => item.status === "error")) return "Error";
  if (items.some((item) => item.status === "needed")) return "Needed";
  if (items.some((item) => item.status === "warning")) return "WARNING";
  if (items.some((item) => item.status === "planned")) return "Planned";

  return "Ready";
}

function processLogStatusFromHealth(
  status: HealthItemStatus,
): MarketingIntegrationProcessLogStatus {
  if (status === "Error") return "error";
  if (status === "Needed") return "needed";
  if (status === "Planned") return "planned";

  return "ready";
}

function marketingIntegrationProcessLogItems({
  authBrokerDiagnostics,
  authBrokerStatus,
  connection,
  credentialState,
  hasSavedAuthBroker,
  provider,
  providerState,
  recentSyncLogs,
}: {
  authBrokerDiagnostics: MarketingAuthBrokerProviderDiagnosticsResult | null;
  authBrokerStatus: ReturnType<typeof marketingAuthBrokerStatus>;
  connection: {
    config: unknown;
    status: "CONNECTED" | "NOT_CONNECTED" | "ERROR";
    updatedAt: Date;
  } | null;
  credentialState: ReturnType<typeof getMarketingIntegrationCredentialState>;
  hasSavedAuthBroker: boolean;
  provider: MarketingIntegrationProviderDefinition;
  providerState: ReturnType<typeof getMarketingIntegrationProviderState>;
  recentSyncLogs: ProviderSyncLog[];
}) {
  const authBrokerProvider = findMarketingOAuthProvider(provider.slug);
  const isAuthManagedProvider = Boolean(authBrokerProvider?.authBroker);
  const items: MarketingIntegrationProcessLogItem[] = [];

  if (isAuthManagedProvider) {
    if (!hasSavedAuthBroker) {
      items.push({
        detail:
          "Save iD30 Auth broker setup before this CRM can start provider OAuth through auth.id30.com.",
        label: "CRM broker setup",
        source: "CRM",
        stage: "crm-broker",
        status: "needed",
      });
    } else if (!authBrokerDiagnostics) {
      items.push({
        detail:
          "CRM has broker setup saved. Open Test connection or reload to fetch Auth diagnostics.",
        label: "Auth diagnostics",
        source: "CRM",
        stage: "auth-diagnostics",
        status: "planned",
      });
    } else if (!authBrokerDiagnostics.ok) {
      items.push({
        detail: authBrokerDiagnostics.message,
        label: "Auth diagnostics",
        source: "CRM",
        stage: "auth-diagnostics",
        status: authBrokerDiagnostics.status === 503 ? "needed" : "error",
      });
    } else {
      for (const check of authBrokerDiagnostics.checks) {
        items.push({
          createdAt: check.createdAt,
          detail: check.detail,
          label: check.label,
          source: "Auth",
          stage: check.stage,
          status: check.status,
        });
      }
    }
  }

  const localHealthItems = marketingIntegrationHealthItems({
    authBrokerStatus,
    connection,
    credentialState,
    provider,
    providerState,
    recentSyncLogs,
  });
  const hiddenLocalLabels =
    isAuthManagedProvider && authBrokerDiagnostics?.ok
      ? new Set(["Access mode"])
      : new Set<string>();

  for (const item of localHealthItems) {
    if (hiddenLocalLabels.has(item.label)) continue;

    items.push({
      detail: item.detail,
      label:
        isAuthManagedProvider && item.label !== "Last sync job"
          ? `CRM ${item.label.toLowerCase()}`
          : item.label,
      source: "CRM",
      stage: `crm-${item.label.toLowerCase().replaceAll(" ", "-")}`,
      status: processLogStatusFromHealth(item.status),
    });
  }

  return items;
}

function MarketingSetupWizard({
  canEdit,
  config,
  credentialState,
  provider,
  providerState,
}: {
  canEdit: boolean;
  config: unknown;
  credentialState: ReturnType<typeof getMarketingIntegrationCredentialState>;
  provider: MarketingIntegrationProviderDefinition;
  providerState: ReturnType<typeof getMarketingIntegrationProviderState>;
}) {
  const oauthHref = oauthInstallProviderSlugs.has(provider.slug)
    ? `/api/marketing/oauth/${provider.slug}/start`
    : null;
  const isSearchConsole = provider.slug === "google-search-console";
  const isKlaviyo = provider.slug === "klaviyo";
  const isGoogleAnalytics = provider.slug === "google-analytics";
  const canStartOAuth = Boolean(oauthHref && credentialState.oauthConfigured);
  const needsInternalAuthProvisioning = Boolean(
    oauthHref &&
    !credentialState.oauthConfigured &&
    !credentialState.providerAccessConnected,
  );
  const selectorSummary = marketingProviderSelectorSummary(
    provider.slug,
    config,
  );
  const accountMappingState = marketingProviderAccountMappingState(
    provider.slug,
    config,
    providerState,
  );
  const selectorsReady = isKlaviyo
    ? selectorSummary.total > 0
    : isGoogleAnalytics
      ? !credentialState.providerAccessConnected || selectorSummary.total > 0
      : !oauthHref || selectorSummary.total > 0;
  const platformReady = !oauthHref ? true : credentialState.oauthConfigured;
  const setupComplete = isKlaviyo
    ? credentialState.providerAccessConnected && accountMappingState.ready
    : isGoogleAnalytics
      ? providerState.connected &&
        (!credentialState.uploadEnabled ||
          credentialState.providerAccessConnected)
      : platformReady &&
        credentialState.providerAccessConnected &&
        (isSearchConsole
          ? providerState.connected
          : accountMappingState.ready) &&
        credentialState.conversionMapped;
  const setupCopy = marketingProviderSetupCopy(provider);
  const nextAction = marketingWizardNextAction({
    accountMappingState,
    canStartOAuth,
    canEdit,
    credentialState,
    oauthHref,
    platformReady,
    provider,
    providerState,
    selectorsReady,
  });
  const steps = isKlaviyo
    ? [
        {
          title: "Platform ready",
          detail: platformReady
            ? setupCopy.platformReady
            : setupCopy.platformMissing,
          ready: platformReady,
          action: null,
        },
        {
          title: "Client login",
          detail: credentialState.providerAccessConnected
            ? credentialState.uploadCredentialMode === "auth-broker"
              ? setupCopy.clientLoginConnected
              : "Klaviyo private API key fallback is saved."
            : setupCopy.clientLoginNeeded,
          ready: credentialState.providerAccessConnected,
          action:
            credentialState.uploadCredentialMode === "direct" ? (
              <WizardAnchor href="#provider-setup">Edit fallback</WizardAnchor>
            ) : (
              marketingProviderLoginAction({
                canEdit,
                canStartOAuth,
                credentialState,
                oauthHref,
                provider,
              })
            ),
        },
        {
          title: "Load options",
          detail: selectorsReady
            ? `${selectorSummary.label} loaded.`
            : "Refresh accounts, lists, campaigns, flows, forms and segments.",
          ready: selectorsReady,
          action: (
            <ProviderSelectorRefreshForm
              canEdit={canEdit && credentialState.providerAccessConnected}
              provider="klaviyo"
            />
          ),
        },
        {
          title: "Account/list mapping",
          detail: accountMappingState.ready
            ? "Klaviyo account settings are saved."
            : accountMappingState.detail,
          ready: accountMappingState.ready,
          action: <WizardAnchor href="#provider-setup">Configure</WizardAnchor>,
        },
        {
          title: "Import settings",
          detail: credentialState.uploadEnabled
            ? "At least one lifecycle import is enabled."
            : "Enable campaign, flow or profile event imports when ready.",
          ready: credentialState.uploadEnabled,
          action: (
            <WizardAnchor href="#provider-setup">Edit imports</WizardAnchor>
          ),
        },
      ]
    : isGoogleAnalytics
      ? [
          {
            title: "Platform ready",
            detail: platformReady
              ? setupCopy.platformReady
              : setupCopy.platformMissing,
            ready: platformReady,
            action: null,
          },
          {
            title: "Client login",
            detail: credentialState.providerAccessConnected
              ? setupCopy.clientLoginConnected
              : setupCopy.clientLoginNeeded,
            ready: credentialState.providerAccessConnected,
            action: marketingProviderLoginAction({
              canEdit,
              canStartOAuth,
              credentialState,
              oauthHref,
              provider,
            }),
          },
          {
            title: "Load options",
            detail: selectorsReady
              ? `${selectorSummary.label} loaded.`
              : "Refresh GA4 accounts, properties, web streams and events after client login.",
            ready: selectorsReady,
            action: (
              <ProviderSelectorRefreshForm
                canEdit={canEdit && credentialState.providerAccessConnected}
                provider="google-analytics"
              />
            ),
          },
          {
            title: "Property mapping",
            detail: providerState.connected
              ? "GA4 measurement and property IDs are saved."
              : "Choose or add the GA4 Measurement ID and property ID.",
            ready: providerState.connected,
            action: (
              <WizardAnchor href="#provider-setup">Configure</WizardAnchor>
            ),
          },
          {
            title: "Event mapping",
            detail: credentialState.conversionMapped
              ? "Lead, call and matched event names are saved."
              : "Save the GA4 lead, call and matched event names.",
            ready: credentialState.conversionMapped,
            action: (
              <WizardAnchor href="#provider-setup">Map events</WizardAnchor>
            ),
          },
          {
            title: "Import settings",
            detail: credentialState.uploadEnabled
              ? "GA4 Data API reporting import is enabled."
              : "GA4 reporting import is disabled.",
            ready:
              !credentialState.uploadEnabled ||
              credentialState.providerAccessConnected,
            action: (
              <WizardAnchor href="#provider-setup">Edit import</WizardAnchor>
            ),
          },
        ]
      : oauthHref
        ? isSearchConsole
          ? [
              {
                title: "OAuth app",
                detail: platformReady
                  ? setupCopy.platformReady
                  : setupCopy.platformMissing,
                ready: platformReady,
                action: null,
              },
              {
                title: "Client login",
                detail: credentialState.providerAccessConnected
                  ? setupCopy.clientLoginConnected
                  : setupCopy.clientLoginNeeded,
                ready: credentialState.providerAccessConnected,
                action: marketingProviderLoginAction({
                  canEdit,
                  canStartOAuth,
                  credentialState,
                  oauthHref,
                  provider,
                }),
              },
              {
                title: "Load sites",
                detail: selectorsReady
                  ? `${selectorSummary.label} loaded.`
                  : "Refresh verified Search Console sites after client login.",
                ready: selectorsReady,
                action: (
                  <ProviderSelectorRefreshForm
                    canEdit={canEdit && credentialState.providerAccessConnected}
                    provider="google-search-console"
                  />
                ),
              },
              {
                title: "Select property",
                detail: providerState.connected
                  ? "Search property mapping is saved."
                  : "Choose the verified Search Console property and save.",
                ready: providerState.connected,
                action: (
                  <WizardAnchor href="#provider-setup">Select</WizardAnchor>
                ),
              },
            ]
          : [
              {
                title: "Platform ready",
                detail: platformReady
                  ? setupCopy.platformReady
                  : setupCopy.platformMissing,
                ready: platformReady,
                action: null,
              },
              {
                title: "Client login",
                detail: credentialState.providerAccessConnected
                  ? setupCopy.clientLoginConnected
                  : setupCopy.clientLoginNeeded,
                ready: credentialState.providerAccessConnected,
                action: marketingProviderLoginAction({
                  canEdit,
                  canStartOAuth,
                  credentialState,
                  oauthHref,
                  provider,
                }),
              },
              {
                title: "Load options",
                detail: selectorsReady
                  ? `${selectorSummary.label} loaded.`
                  : "Refresh after provider login.",
                ready: selectorsReady,
                action: (
                  <ProviderSelectorRefreshForm
                    canEdit={canEdit && credentialState.providerAccessConnected}
                    provider={
                      provider.slug as
                        | "bing-ads"
                        | "google-ads"
                        | "google-analytics"
                        | "linkedin-ads"
                        | "meta"
                    }
                  />
                ),
              },
              {
                title: "Select account",
                detail: accountMappingState.detail,
                ready: accountMappingState.ready,
                action: (
                  <WizardAnchor href="#provider-setup">Select</WizardAnchor>
                ),
              },
              {
                title: "Conversion mapping",
                detail: credentialState.conversionMapped
                  ? "Conversion mapping is ready."
                  : "Map the lead/call conversion fields.",
                ready: credentialState.conversionMapped,
                action: <WizardAnchor href="#provider-setup">Map</WizardAnchor>,
              },
            ]
        : [
            {
              title: "Property details",
              detail: providerState.connected
                ? "GA4 property mapping is saved."
                : "Add the GA4 Web stream Measurement ID and property ID.",
              ready: providerState.connected,
              action: (
                <WizardAnchor href="#provider-setup">Configure</WizardAnchor>
              ),
            },
            {
              title: "Event mapping",
              detail: credentialState.conversionMapped
                ? "Lead and call events are saved."
                : "Save the event names used by attribution.",
              ready: credentialState.conversionMapped,
              action: (
                <WizardAnchor href="#provider-setup">Map events</WizardAnchor>
              ),
            },
          ];
  const stepGridClassName = isKlaviyo
    ? "grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-5"
    : oauthHref
      ? isSearchConsole
        ? "grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4"
        : "grid gap-3 p-5 lg:grid-cols-5"
      : "grid gap-3 p-5 md:grid-cols-2";

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-brand-100 bg-brand-50 shadow-theme-xs dark:border-brand-900/30 dark:bg-brand-900/10">
      <div className="border-b border-brand-100 p-5 dark:border-brand-900/30">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge>{setupComplete ? "Ready" : "Needed"}</StatusBadge>
              <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-brand-100 ring-inset dark:bg-white/10 dark:text-brand-200 dark:ring-brand-900/30">
                Client setup wizard
              </span>
            </div>
            <h2 className="mt-3 text-lg font-semibold text-gray-900 dark:text-white/90">
              {setupComplete
                ? `${provider.name} is ready`
                : `Set up ${provider.name}`}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-300">
              {isKlaviyo
                ? setupCopy.wizardIntro
                : oauthHref
                  ? setupCopy.wizardIntro
                  : "Save the direct GA4 measurement, property and event mapping used to compare CRM attribution with website analytics."}
            </p>
          </div>
          <div className="rounded-xl bg-white p-4 ring-1 ring-brand-100 ring-inset lg:min-w-80 dark:bg-white/[0.04] dark:ring-brand-900/30">
            <p className="text-xs font-medium text-brand-700 uppercase dark:text-brand-200">
              Next action
            </p>
            <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white/90">
              {nextAction.title}
            </p>
            <p className="mt-1 text-sm leading-5 text-gray-600 dark:text-gray-300">
              {nextAction.detail}
            </p>
            {nextAction.action ? (
              <div className="mt-3">{nextAction.action}</div>
            ) : null}
          </div>
        </div>
        {needsInternalAuthProvisioning ? (
          <p className="mt-4 max-w-2xl rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-sm leading-6 text-warning-700 dark:border-warning-900/40 dark:bg-warning-900/20 dark:text-warning-300">
            {setupCopy.internalAuthNotice}
          </p>
        ) : null}
      </div>

      <div className={stepGridClassName}>
        {steps.map((step, index) => (
          <WizardStep
            key={step.title}
            action={step.action}
            detail={step.detail}
            index={index}
            ready={step.ready}
            title={step.title}
          />
        ))}
      </div>
    </section>
  );
}

function WizardStep({
  action,
  detail,
  index,
  ready,
  title,
}: {
  action: ReactNode;
  detail: string;
  index: number;
  ready: boolean;
  title: string;
}) {
  return (
    <div className="flex min-h-40 flex-col rounded-xl bg-white p-4 ring-1 ring-brand-100 ring-inset dark:bg-white/[0.04] dark:ring-brand-900/30">
      <div className="flex items-center justify-between gap-3">
        <span
          className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
            ready
              ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
              : "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
          }`}
        >
          {index + 1}
        </span>
        <StatusBadge>{ready ? "Ready" : "Needed"}</StatusBadge>
      </div>
      <h3 className="mt-3 text-sm font-semibold text-gray-900 dark:text-white/90">
        {title}
      </h3>
      <p className="mt-2 flex-1 text-sm leading-5 text-gray-600 dark:text-gray-300">
        {detail}
      </p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

function WizardAnchor({
  children,
  href,
}: {
  children: ReactNode;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-brand-200 bg-white px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50 dark:border-brand-900/40 dark:bg-white/[0.03] dark:text-brand-200 dark:hover:bg-white/[0.06]"
    >
      {children}
    </Link>
  );
}

function marketingProviderLoginAction({
  canEdit,
  canStartOAuth,
  credentialState,
  oauthHref,
  provider,
}: {
  canEdit: boolean;
  canStartOAuth: boolean;
  credentialState: ReturnType<typeof getMarketingIntegrationCredentialState>;
  oauthHref: string | null;
  provider: MarketingIntegrationProviderDefinition;
}) {
  if (!canEdit || !canStartOAuth || !oauthHref) return null;

  const connectAction = (
    <WizardAnchor href={oauthHref}>
      {credentialState.providerAccessConnected ? "Reconnect" : "Connect"}
    </WizardAnchor>
  );
  const authProvider = findMarketingOAuthProvider(provider.slug);

  if (
    !authProvider?.authBroker ||
    !credentialState.providerAccessConnected ||
    credentialState.uploadCredentialMode !== "auth-broker"
  ) {
    return connectAction;
  }

  return (
    <div className="grid gap-2">
      {connectAction}
      <ProviderAuthResetForm
        canEdit={canEdit}
        provider={provider.slug}
        providerName={provider.name}
      />
    </div>
  );
}

function marketingProviderSetupCopy(
  provider: MarketingIntegrationProviderDefinition,
) {
  if (provider.slug === "google-analytics") {
    return {
      clientLoginConnected: "Google Analytics Data API access is connected.",
      clientLoginNeeded:
        "Click Connect Google Analytics, sign in and approve readonly Analytics access.",
      connectDetail:
        "The client signs in with Google and approves readonly Analytics access through iD30 Auth.",
      connectTitle: "Connect Google Analytics",
      internalAuthNotice:
        "iD30 Auth needs Google Analytics provider setup before client login can start.",
      missingDetail:
        "Ask iD30 to provision Google Analytics in Auth, then retry the connection.",
      missingTitle: "iD30 Auth setup required",
      platformMissing:
        "iD30 Auth needs Google Analytics provider credentials before client login can start.",
      platformReady: "iD30 Auth is ready for Google Analytics login.",
      selectorsNeeded:
        "Refresh GA4 accounts, properties, web streams and events after client login.",
      wizardIntro:
        "Connect Google Analytics through iD30 Auth, refresh options, then save the GA4 property and event mapping.",
    };
  }

  if (provider.slug === "google-search-console") {
    return {
      clientLoginConnected: "Google Search Console access is connected.",
      clientLoginNeeded:
        "Click Connect; the client signs in to Google and approves readonly Search Console access through iD30 Auth.",
      connectDetail:
        "The client signs in with Google and approves readonly Search Console access through iD30 Auth.",
      connectTitle: "Connect Google Search Console",
      internalAuthNotice:
        "iD30 Auth needs Google Search Console provider setup before client login can start.",
      missingDetail:
        "Ask iD30 to provision Google Search Console in Auth, then retry the connection.",
      missingTitle: "iD30 Auth setup required",
      platformMissing:
        "iD30 Auth needs Google Search Console provider credentials before client login can start.",
      platformReady: "iD30 Auth is ready for Google Search Console login.",
      selectorsNeeded:
        "Load the verified Search Console URL-prefix and domain properties.",
      wizardIntro:
        "The client signs in with Google, CRM loads verified Search Console properties, then an admin saves the property used for SEO attribution reporting.",
    };
  }

  if (provider.slug === "klaviyo") {
    return {
      clientLoginConnected: "Klaviyo access is connected through iD30 Auth.",
      clientLoginNeeded:
        "Click Connect Klaviyo; the client signs in and approves lifecycle marketing access through iD30 Auth.",
      connectDetail:
        "The client signs in with Klaviyo and approves access. No private API key is entered in CRM.",
      connectTitle: "Connect Klaviyo",
      internalAuthNotice:
        "iD30 Auth needs Klaviyo provider setup before client login can start.",
      missingDetail:
        "Ask iD30 to provision Klaviyo in Auth, then retry the connection.",
      missingTitle: "iD30 Auth setup required",
      platformMissing:
        "iD30 Auth needs Klaviyo provider credentials before client login can start.",
      platformReady: "iD30 Auth is ready for Klaviyo login.",
      selectorsNeeded:
        "Load accounts, lists, campaigns, flows, forms and segments from Klaviyo.",
      wizardIntro:
        "The client signs in with Klaviyo, CRM loads account and lifecycle options, then an admin saves the account and optional default list used for attribution reporting.",
    };
  }

  if (provider.slug === "meta") {
    return {
      clientLoginConnected: "Meta access is connected through iD30 Auth.",
      clientLoginNeeded:
        "Click Connect Meta; the client signs in to Meta and approves access.",
      connectDetail:
        "Click Connect Meta, sign in to Meta and approve access. No Meta app secrets are entered in CRM.",
      connectTitle: "Connect Meta",
      internalAuthNotice:
        "Meta cannot be connected yet because iD30 Auth is not provisioned for this CRM. iD30 needs to add the Meta app credentials in Auth; clients do not enter those secrets here.",
      missingDetail:
        "iD30 needs to add the Meta app credentials in Auth before the client can connect Meta.",
      missingTitle: "iD30 Auth setup required",
      platformMissing:
        "iD30 needs to add the Meta app credentials in Auth before client login can start.",
      platformReady: "iD30 Auth is ready for Meta client login.",
      selectorsNeeded:
        "Refresh the Meta ad account and pixel options after client login.",
      wizardIntro:
        "Once iD30 Auth is provisioned, the client only needs to click Connect Meta, sign in and approve access. CRM then loads account and pixel choices for mapping.",
    };
  }

  return {
    clientLoginConnected: "Provider access is connected.",
    clientLoginNeeded: "Client signs in and approves access.",
    connectDetail: `They only need to sign in to ${provider.name} and approve access.`,
    connectTitle: "Send the client to provider login",
    internalAuthNotice:
      "iD30 Auth needs to be provisioned for this CRM before clients can connect provider accounts. This is an iD30 setup step, not a client Auth dashboard task.",
    missingDetail: `${provider.name} needs iD30 to provision the central Auth broker before client login can start.`,
    missingTitle: "iD30 setup required",
    platformMissing:
      "iD30 needs to provision Auth before client login can start.",
    platformReady: "iD30 Auth broker access is ready.",
    selectorsNeeded:
      "Load the accessible accounts, tags, pixels and conversions from the provider.",
    wizardIntro:
      "The client signs in, CRM loads their available account options, then an admin saves the account and conversion mapping.",
  };
}

function marketingWizardNextAction({
  accountMappingState,
  canStartOAuth,
  canEdit,
  credentialState,
  oauthHref,
  platformReady,
  provider,
  providerState,
  selectorsReady,
}: {
  accountMappingState: MarketingAccountMappingState;
  canStartOAuth: boolean;
  canEdit: boolean;
  credentialState: ReturnType<typeof getMarketingIntegrationCredentialState>;
  oauthHref: string | null;
  platformReady: boolean;
  provider: MarketingIntegrationProviderDefinition;
  providerState: ReturnType<typeof getMarketingIntegrationProviderState>;
  selectorsReady: boolean;
}) {
  const setupCopy = marketingProviderSetupCopy(provider);

  if (provider.slug === "google-analytics") {
    if (!platformReady) {
      return {
        title: setupCopy.missingTitle,
        detail: setupCopy.missingDetail,
        action: null,
      };
    }

    if (!credentialState.providerAccessConnected) {
      return {
        title: setupCopy.connectTitle,
        detail: setupCopy.connectDetail,
        action: marketingProviderLoginAction({
          canEdit,
          canStartOAuth,
          credentialState,
          oauthHref,
          provider,
        }),
      };
    }

    if (!selectorsReady) {
      return {
        title: "Refresh GA4 options",
        detail: setupCopy.selectorsNeeded,
        action: (
          <ProviderSelectorRefreshForm
            canEdit={canEdit && credentialState.providerAccessConnected}
            provider="google-analytics"
          />
        ),
      };
    }

    if (!providerState.connected) {
      return {
        title: "Add GA4 property details",
        detail:
          "Choose or add the GA4 Web stream Measurement ID, property ID and event names.",
        action: (
          <WizardAnchor href="#provider-setup">
            Open property setup
          </WizardAnchor>
        ),
      };
    }

    if (!credentialState.uploadEnabled) {
      return {
        title: "GA4 mapping saved",
        detail:
          "Enable GA4 event reporting import if this CRM should pull Data API event counts.",
        action: (
          <WizardAnchor href="#provider-setup">
            Edit import settings
          </WizardAnchor>
        ),
      };
    }

    return {
      title: "GA4 reporting setup saved",
      detail:
        "GA4 mapping and Data API access are ready; provider data import can pull event reporting rows.",
      action: <WizardAnchor href="#provider-status">View status</WizardAnchor>,
    };
  }

  if (provider.slug === "klaviyo") {
    if (!platformReady && !credentialState.providerAccessConnected) {
      return {
        title: setupCopy.missingTitle,
        detail: setupCopy.missingDetail,
        action: null,
      };
    }

    if (!credentialState.providerAccessConnected) {
      return {
        title: setupCopy.connectTitle,
        detail: setupCopy.connectDetail,
        action: marketingProviderLoginAction({
          canEdit,
          canStartOAuth,
          credentialState,
          oauthHref,
          provider,
        }),
      };
    }

    if (!selectorsReady) {
      return {
        title: "Refresh Klaviyo options",
        detail:
          "Load available accounts, lists, campaigns, flows, forms and segments from Klaviyo.",
        action: (
          <ProviderSelectorRefreshForm
            canEdit={canEdit && credentialState.providerAccessConnected}
            provider="klaviyo"
          />
        ),
      };
    }

    if (!providerState.connected) {
      return {
        title: "Save account settings",
        detail:
          "Choose the Klaviyo account and optional default list, then save the setup.",
        action: (
          <WizardAnchor href="#provider-setup">Open Klaviyo setup</WizardAnchor>
        ),
      };
    }

    return {
      title: "Lifecycle setup saved",
      detail:
        "Klaviyo API access and account settings are saved; lifecycle import can run through iD30 Auth.",
      action: <WizardAnchor href="#provider-status">View status</WizardAnchor>,
    };
  }

  if (!platformReady) {
    return {
      title: setupCopy.missingTitle,
      detail: setupCopy.missingDetail,
      action: null,
    };
  }

  if (oauthHref && !credentialState.providerAccessConnected) {
    return {
      title: setupCopy.connectTitle,
      detail: setupCopy.connectDetail,
      action: marketingProviderLoginAction({
        canEdit,
        canStartOAuth,
        credentialState,
        oauthHref,
        provider,
      }),
    };
  }

  if (oauthHref && !selectorsReady) {
    return {
      title:
        provider.slug === "google-search-console"
          ? "Refresh site options"
          : "Refresh account options",
      detail: setupCopy.selectorsNeeded,
      action: null,
    };
  }

  if (!oauthHref && !providerState.connected) {
    return {
      title: "Add property details",
      detail: "Add the GA4 Web stream Measurement ID and property ID.",
      action: (
        <WizardAnchor href="#provider-setup">Open property setup</WizardAnchor>
      ),
    };
  }

  if (provider.slug === "google-search-console" && !providerState.connected) {
    return {
      title: "Select and save the property",
      detail:
        "Choose the verified Search Console property from the dropdown options and save the setup.",
      action: (
        <WizardAnchor href="#provider-setup">Open property setup</WizardAnchor>
      ),
    };
  }

  if (provider.slug === "google-search-console") {
    return {
      title: "Search setup saved",
      detail:
        "Search Console access and property mapping are saved; organic performance import needs the reporting ingestion job.",
      action: <WizardAnchor href="#provider-status">View status</WizardAnchor>,
    };
  }

  if (oauthHref && !accountMappingState.ready) {
    return {
      title: accountMappingState.selected
        ? "Complete account details"
        : "Select and save the account",
      detail: accountMappingState.detail,
      action: (
        <WizardAnchor href="#provider-setup">Open account setup</WizardAnchor>
      ),
    };
  }

  if (!credentialState.conversionMapped) {
    return {
      title: "Map conversions",
      detail:
        "Choose lead and call conversion mappings so reporting and uploads can work.",
      action: (
        <WizardAnchor href="#provider-setup">
          Open conversion mapping
        </WizardAnchor>
      ),
    };
  }

  return {
    title: "Ready for reporting",
    detail: `${provider.name} is connected and mapped for attribution reporting.`,
    action: <WizardAnchor href="#provider-status">View status</WizardAnchor>,
  };
}

function configObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function configString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function configIdentifier(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);

  return configString(value);
}

type MarketingAccountMappingState = {
  detail: string;
  ready: boolean;
  selected: boolean;
};

function marketingProviderAccountMappingState(
  provider: MarketingIntegrationProviderSlug,
  config: unknown,
  providerState: ReturnType<typeof getMarketingIntegrationProviderState>,
): MarketingAccountMappingState {
  const values = configObject(config);

  if (provider === "google-analytics") {
    return {
      detail: providerState.connected
        ? "GA4 measurement and property IDs are saved."
        : "Add the GA4 measurement and property IDs.",
      ready: providerState.connected,
      selected: providerState.connected,
    };
  }

  if (provider === "google-search-console") {
    const siteUrl = configIdentifier(values.siteUrl);

    return {
      detail: siteUrl
        ? "Search Console property mapping is saved."
        : "Choose the verified Search Console property and save.",
      ready: Boolean(siteUrl),
      selected: Boolean(siteUrl),
    };
  }

  if (provider === "klaviyo") {
    const accountId = configIdentifier(values.accountId);

    return {
      detail: accountId
        ? "Klaviyo account mapping is saved."
        : "Choose the Klaviyo account and save.",
      ready: Boolean(accountId),
      selected: Boolean(accountId),
    };
  }

  if (provider === "bing-ads") {
    const accountId = configIdentifier(values.accountId);
    const customerId = configIdentifier(values.customerId);

    if (accountId && customerId) {
      return {
        detail: "Bing Ads account and customer IDs are saved.",
        ready: true,
        selected: true,
      };
    }

    if (accountId) {
      return {
        detail:
          "Bing Ads account is saved, but the Microsoft customer ID is still needed before imports or uploads can run.",
        ready: false,
        selected: true,
      };
    }

    if (customerId) {
      return {
        detail:
          "Microsoft customer ID is saved; choose the Bing Ads account and save.",
        ready: false,
        selected: false,
      };
    }

    return {
      detail: "Choose the Bing Ads account and save.",
      ready: false,
      selected: false,
    };
  }

  if (provider === "google-ads") {
    const customerId = configIdentifier(values.customerId);

    return {
      detail: customerId
        ? "Google Ads account mapping is saved."
        : "Choose the Google Ads account and save.",
      ready: Boolean(customerId),
      selected: Boolean(customerId),
    };
  }

  if (provider === "linkedin-ads") {
    const accountId = configIdentifier(values.adAccountId);

    return {
      detail: accountId
        ? "LinkedIn Ads account mapping is saved."
        : "Choose the LinkedIn Ads account and save.",
      ready: Boolean(accountId),
      selected: Boolean(accountId),
    };
  }

  if (provider === "meta") {
    const accountId = configIdentifier(values.adAccountId);

    return {
      detail: accountId
        ? "Meta ad account mapping is saved."
        : "Choose the Meta ad account and save.",
      ready: Boolean(accountId),
      selected: Boolean(accountId),
    };
  }

  return {
    detail: providerState.connected
      ? "Saved mapping is valid."
      : "Choose and save the account, property or event mapping.",
    ready: providerState.connected,
    selected: providerState.connected,
  };
}

function marketingAuthBrokerStatus(config: unknown) {
  const authBroker = configObject(configObject(config).authBroker);
  const status = configString(authBroker.status);
  const errorRef = configString(authBroker.errorRef);
  const lastError = configString(authBroker.lastError);
  const lastCallbackAt = configString(authBroker.lastCallbackAt);
  const lastSelectorSyncAt = configString(authBroker.lastSelectorSyncAt);
  const lastStatusAt = configString(authBroker.lastStatusAt);

  return {
    errorRef,
    lastError,
    lastCallbackAt,
    lastSelectorSyncAt,
    lastStatusAt,
    needsAttention:
      status === "failed" ||
      status === "reconnect_required" ||
      Boolean(errorRef || lastError),
    status,
  };
}

function marketingOAuthMessage(
  status: string,
  provider: MarketingIntegrationProviderDefinition,
  authRef?: string,
) {
  const setupCopy = marketingProviderSetupCopy(provider);
  const providerName = provider.name;

  if (status === "connected") {
    return {
      ok: true,
      message: `${providerName} OAuth connected. Save the provider setup if any account or conversion mapping still needs updating.`,
    };
  }

  if (status === "connected-selectors-refreshed") {
    return {
      ok: true,
      message: `${providerName} OAuth connected and account options refreshed. Choose the account and conversion mapping, then save setup.`,
    };
  }

  if (status === "connected-selectors-needed") {
    return {
      ok: true,
      message: `${providerName} OAuth connected. Refresh options, then save setup.`,
    };
  }

  if (status === "missing-env") {
    return {
      ok: false,
      message: setupCopy.internalAuthNotice,
    };
  }

  if (status === "invalid-state") {
    return {
      ok: false,
      message:
        "OAuth validation failed. Start the connection again from this page.",
    };
  }

  if (status === "denied") {
    return {
      ok: false,
      message: `${providerName} OAuth was cancelled or denied.`,
    };
  }

  return {
    ok: false,
    message: authRef
      ? `${providerName} OAuth could not be completed in iD30 Auth. Ask iD30 to check Auth audit reference ${authRef}, then retry the connection.`
      : `${providerName} OAuth could not be completed in iD30 Auth. Ask iD30 to check the Auth audit log, then retry the connection.`,
  };
}

function marketingProviderSelectorFallback(config: unknown) {
  const selectorOptions = marketingProviderSelectorOptionsFromConfig(config);

  return selectorOptions ? { selectorOptions } : undefined;
}

function selectorSummaryParts(entries: Array<[number, string]>): {
  label: string;
  total: number;
} {
  const parts = entries
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${count} ${label}${count === 1 ? "" : "s"}`);
  const total = entries.reduce((sum, [count]) => sum + count, 0);

  if (!parts.length) {
    return { label: "No account or conversion options", total };
  }

  if (parts.length === 1) {
    return { label: parts[0], total };
  }

  return {
    label: `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`,
    total,
  };
}

function marketingProviderSelectorSummary(
  provider: MarketingIntegrationProviderSlug,
  config: unknown,
): { label: string; total: number } {
  const selectorOptions = marketingProviderSelectorOptionsFromConfig(config);
  if (!selectorOptions) {
    return { label: "No account or conversion options", total: 0 };
  }

  const count = (key: keyof typeof selectorOptions) => {
    const value = selectorOptions[key];

    return Array.isArray(value) ? value.length : 0;
  };

  if (provider === "bing-ads") {
    const conversionGoalCount = numericMarketingProviderSelectorOptions(
      combinedMarketingProviderSelectorOptions(selectorOptions, [
        "conversionGoals",
        "conversionActions",
      ]),
    ).length;

    return selectorSummaryParts([
      [count("accounts"), "account"],
      [count("managerAccounts"), "customer"],
      [count("uetTags"), "UET tag"],
      [conversionGoalCount, "conversion goal"],
    ]);
  }

  if (provider === "google-ads") {
    return selectorSummaryParts([
      [count("accounts"), "account"],
      [count("managerAccounts"), "manager account"],
      [count("conversionActions"), "conversion action"],
    ]);
  }

  if (provider === "google-analytics") {
    return selectorSummaryParts([
      [count("accounts"), "account"],
      [count("properties"), "property"],
      [count("streams"), "web stream"],
      [count("events"), "event"],
    ]);
  }

  if (provider === "google-search-console") {
    return selectorSummaryParts([[count("sites"), "site"]]);
  }

  if (provider === "klaviyo") {
    return selectorSummaryParts([
      [count("accounts"), "account"],
      [count("lists"), "list"],
      [count("campaigns"), "campaign"],
      [count("flows"), "flow"],
      [count("forms"), "form"],
      [count("segments"), "segment"],
    ]);
  }

  if (provider === "meta") {
    return selectorSummaryParts([
      [count("accounts"), "ad account"],
      [count("pixels"), "pixel"],
    ]);
  }

  if (provider === "linkedin-ads") {
    const conversionRuleCount = combinedMarketingProviderSelectorOptions(
      selectorOptions,
      ["conversionRules", "conversionActions"],
    ).length;

    return selectorSummaryParts([
      [count("accounts"), "ad account"],
      [count("insightTags"), "Insight Tag"],
      [conversionRuleCount, "conversion rule"],
    ]);
  }

  const total = Object.values(selectorOptions).reduce<number>(
    (totalCount, value) => {
      return Array.isArray(value) ? totalCount + value.length : totalCount;
    },
    0,
  );

  return {
    label: `${total} account or conversion option${total === 1 ? "" : "s"}`,
    total,
  };
}

function formattedDateTime(value: Date | string | null | undefined) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString("en-GB");
}

function marketingIntegrationHealthItems({
  authBrokerStatus,
  connection,
  credentialState,
  provider,
  providerState,
  recentSyncLogs,
}: {
  authBrokerStatus: ReturnType<typeof marketingAuthBrokerStatus>;
  connection: {
    config: unknown;
    status: "CONNECTED" | "NOT_CONNECTED" | "ERROR";
    updatedAt: Date;
  } | null;
  credentialState: ReturnType<typeof getMarketingIntegrationCredentialState>;
  provider: MarketingIntegrationProviderDefinition;
  providerState: ReturnType<typeof getMarketingIntegrationProviderState>;
  recentSyncLogs: ProviderSyncLog[];
}): MarketingIntegrationHealthItem[] {
  const selectorSummary = marketingProviderSelectorSummary(
    provider.slug,
    connection?.config ?? {},
  );
  const accountMappingState = marketingProviderAccountMappingState(
    provider.slug,
    connection?.config ?? {},
    providerState,
  );
  const authRefreshAt = formattedDateTime(authBrokerStatus.lastSelectorSyncAt);
  const lastSavedAt = formattedDateTime(connection?.updatedAt);
  const lastJob = recentSyncLogs[0];
  const lastJobStatus = !lastJob
    ? "Planned"
    : lastJob.status === "ERROR" || lastJob.status === "FAILED"
      ? "Error"
      : lastJob.status === "RUNNING"
        ? "Planned"
        : "Ready";
  const mappingLabel =
    provider.slug === "google-search-console"
      ? "Property mapping"
      : provider.slug === "google-analytics"
        ? "GA4 mapping"
        : provider.slug === "klaviyo"
          ? "Account/list mapping"
          : "Account mapping";
  const setupReady =
    provider.slug === "google-analytics"
      ? providerState.connected &&
        (!credentialState.uploadEnabled ||
          credentialState.providerAccessConnected)
      : provider.slug === "google-search-console" || provider.slug === "klaviyo"
        ? credentialState.providerAccessConnected && providerState.connected
        : credentialState.conversionMapped;
  const setupLabel =
    provider.slug === "google-search-console"
      ? "Search reporting"
      : provider.slug === "google-analytics"
        ? "Analytics reporting"
        : provider.slug === "klaviyo"
          ? "Lifecycle reporting"
          : "Conversion mapping";
  const setupDetail =
    provider.slug === "google-search-console"
      ? setupReady
        ? "Search Console access and property mapping are saved; provider data import can pull performance rows."
        : "Connect Search Console access and save the verified property."
      : provider.slug === "google-analytics"
        ? setupReady
          ? "GA4 mapping and required Analytics access are saved."
          : credentialState.uploadEnabled
            ? "Connect Google Analytics Data API access before reporting import can run."
            : "Save GA4 property and event mapping before analytics reporting import can run."
        : provider.slug === "klaviyo"
          ? setupReady
            ? "Klaviyo access and account mapping are saved; provider data import can pull lifecycle rows."
            : "Connect Klaviyo access and save the account mapping."
          : credentialState.conversionMapped
            ? credentialState.uploadEnabled
              ? credentialState.uploadReady
                ? "Conversion uploads are enabled and ready."
                : "Conversion mapping is saved; finish upload credentials before sending."
              : "Conversion mapping is saved; uploads can be enabled later."
            : "Map lead and call conversions before upload readiness is complete.";

  return [
    {
      label: "Access mode",
      status: authBrokerStatus.needsAttention
        ? "Error"
        : credentialState.providerAccessConnected
          ? "Ready"
          : "Needed",
      detail: authBrokerStatus.needsAttention
        ? authBrokerStatus.lastError ||
          (authBrokerStatus.errorRef
            ? `iD30 Auth issue reference ${authBrokerStatus.errorRef}.`
            : "iD30 Auth needs attention.")
        : credentialState.providerAccessConnected
          ? credentialState.uploadCredentialMode === "auth-broker"
            ? "Managed by iD30 Auth."
            : provider.slug === "klaviyo"
              ? "Klaviyo API key is saved."
              : provider.slug === "google-analytics"
                ? "Google Analytics OAuth refresh token is saved."
                : "Direct CRM fallback credentials are saved."
          : "Provider login or API access is still needed.",
    },
    {
      label: "Option cache",
      status:
        selectorSummary.total > 0
          ? "Ready"
          : provider.slug === "google-analytics" &&
              !credentialState.providerAccessConnected
            ? "Planned"
            : "Needed",
      detail:
        provider.slug === "google-analytics" &&
        !credentialState.providerAccessConnected
          ? "Connect Google Analytics to load GA4 account, property and stream options."
          : selectorSummary.total > 0
            ? `${selectorSummary.label} loaded.${
                authRefreshAt
                  ? ` Last Auth refresh ${authRefreshAt}.`
                  : lastSavedAt
                    ? ` Last saved ${lastSavedAt}.`
                    : ""
              }`
            : "Refresh options after provider access is connected.",
    },
    {
      label: mappingLabel,
      status: accountMappingState.ready ? "Ready" : "Needed",
      detail: accountMappingState.detail,
    },
    {
      label: setupLabel,
      status: setupReady ? "Ready" : "Needed",
      detail: setupDetail,
    },
    {
      label: "Last sync job",
      status: lastJobStatus,
      detail: lastJob
        ? `${lastJob.syncType} ${lastJob.status.toLowerCase()} on ${lastJob.startedAt.toLocaleString("en-GB")}.${lastJob.message ? ` ${lastJob.message}` : ""}`
        : "No provider sync or dry-run jobs have run yet.",
    },
  ];
}

function CredentialStatusItem({
  item,
}: {
  item: ReturnType<
    typeof getMarketingIntegrationCredentialState
  >["items"][number];
}) {
  return (
    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
          {item.label}
        </p>
        <StatusBadge>{item.ready ? "Ready" : "Needed"}</StatusBadge>
      </div>
      <p className="mt-2 text-sm leading-5 text-gray-500 dark:text-gray-400">
        {item.detail}
      </p>
    </div>
  );
}

function ProviderNav({
  activeProvider,
}: {
  activeProvider: MarketingIntegrationProviderSlug;
}) {
  return (
    <nav className="flex gap-2 overflow-x-auto border-b border-gray-200 pb-3 dark:border-gray-800">
      {marketingIntegrationProviderDefinitions.map((provider) => {
        const active = provider.slug === activeProvider;

        return (
          <Link
            key={provider.slug}
            href={`/settings/integrations/${provider.slug}`}
            className={`inline-flex h-10 shrink-0 items-center justify-center rounded-lg px-4 text-sm font-medium ${
              active
                ? "bg-brand-500 text-white"
                : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
            }`}
          >
            {provider.name}
          </Link>
        );
      })}
    </nav>
  );
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-2 text-xl font-semibold text-gray-800 dark:text-white/90">
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
        {detail}
      </p>
    </div>
  );
}

function ProviderSetupForm({
  provider,
  config,
  canEdit,
}: {
  provider: MarketingIntegrationProviderSlug;
  config: unknown;
  canEdit: boolean;
}) {
  if (provider === "bing-ads") {
    const parsedConfig = bingAdsConfigSchema.safeParse(config ?? {});
    const fallbackConfig = marketingProviderSelectorFallback(config);

    return (
      <BingAdsIntegrationForm
        config={parsedConfig.success ? parsedConfig.data : fallbackConfig}
        canEdit={canEdit}
      />
    );
  }

  if (provider === "google-ads") {
    const parsedConfig = googleAdsConfigSchema.safeParse(config ?? {});
    const fallbackConfig = marketingProviderSelectorFallback(config);

    return (
      <GoogleAdsIntegrationForm
        config={parsedConfig.success ? parsedConfig.data : fallbackConfig}
        canEdit={canEdit}
      />
    );
  }

  if (provider === "google-analytics") {
    const parsedConfig = googleAnalyticsConfigSchema.safeParse(config ?? {});
    const fallbackConfig = marketingProviderSelectorFallback(config);

    return (
      <GoogleAnalyticsIntegrationForm
        config={parsedConfig.success ? parsedConfig.data : fallbackConfig}
        canEdit={canEdit}
      />
    );
  }

  if (provider === "google-search-console") {
    const parsedConfig = googleSearchConsoleConfigSchema.safeParse(
      config ?? {},
    );
    const fallbackConfig = marketingProviderSelectorFallback(config);

    return (
      <GoogleSearchConsoleIntegrationForm
        config={parsedConfig.success ? parsedConfig.data : fallbackConfig}
        canEdit={canEdit}
      />
    );
  }

  if (provider === "klaviyo") {
    const parsedConfig = klaviyoConfigSchema.safeParse(config ?? {});
    const fallbackConfig = marketingProviderSelectorFallback(config);

    return (
      <KlaviyoIntegrationForm
        config={parsedConfig.success ? parsedConfig.data : fallbackConfig}
        canEdit={canEdit}
      />
    );
  }

  if (provider === "linkedin-ads") {
    const parsedConfig = linkedInAdsConfigSchema.safeParse(config ?? {});
    const fallbackConfig = marketingProviderSelectorFallback(config);

    return (
      <LinkedInAdsIntegrationForm
        config={parsedConfig.success ? parsedConfig.data : fallbackConfig}
        canEdit={canEdit}
      />
    );
  }

  const parsedConfig = metaConfigSchema.safeParse(config ?? {});
  const fallbackConfig = marketingProviderSelectorFallback(config);

  return (
    <MetaIntegrationForm
      config={parsedConfig.success ? parsedConfig.data : fallbackConfig}
      canEdit={canEdit}
    />
  );
}

function PipedriveValidationSummaryPanel({
  summary,
}: {
  summary: PipedriveValidationSummary;
}) {
  const contactLinkCount = pipedriveExternalLinkCount({
    externalType: "person",
    internalType: "contact",
    summary,
  });
  const companyLinkCount = pipedriveExternalLinkCount({
    externalType: "organization",
    internalType: "company",
    summary,
  });
  const opportunityLinkCount =
    pipedriveExternalLinkCount({
      externalType: "lead",
      internalType: "salesOpportunity",
      summary,
    }) +
    pipedriveExternalLinkCount({
      externalType: "deal",
      internalType: "salesOpportunity",
      summary,
    });
  const latestSyncLog = summary.syncLogs[0] ?? null;
  const latestBackgroundJob = summary.backgroundJobs[0] ?? null;

  return (
    <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Operational validation
            </h2>
            <LazyHelpTooltip content="Shows sanitized CRM-side Pipedrive readiness, linked-record totals, recent jobs and read-only webhook registration status." />
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Last checked {formattedDateTime(summary.generatedAt) ?? "unknown"}.
          </p>
        </div>
        <StatusBadge>{summary.status}</StatusBadge>
      </div>
      <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <PipedrivePullStateItem
          label="Mode"
          value={summary.pullOnly ? "Pull-only" : "Review"}
          detail="Provider write-back requires approval"
        />
        <PipedrivePullStateItem
          label="Contacts linked"
          value={formatPipedriveValidationCount(contactLinkCount)}
          detail="Pipedrive person to CRM contact"
        />
        <PipedrivePullStateItem
          label="Companies linked"
          value={formatPipedriveValidationCount(companyLinkCount)}
          detail="Pipedrive organisation to CRM company"
        />
        <PipedrivePullStateItem
          label="Opportunities linked"
          value={formatPipedriveValidationCount(opportunityLinkCount)}
          detail="Pipedrive lead/deal to CRM opportunity"
        />
        <PipedrivePullStateItem
          label="Lead full pull"
          value={
            formattedDateTime(summary.leadReadiness.lastFullLeadSyncAt) ??
            "Not completed"
          }
          detail={pipedriveLeadCursorDetail(summary)}
        />
        <PipedrivePullStateItem
          label="Deal full pull"
          value={
            formattedDateTime(summary.leadReadiness.lastFullDealSyncAt) ??
            "Not completed"
          }
          detail={pipedriveDealCursorDetail(summary)}
        />
        <PipedrivePullStateItem
          label="Contact full pull"
          value={
            formattedDateTime(summary.contactReadiness.lastFullPersonSyncAt) ??
            "Not completed"
          }
          detail={pipedriveContactCursorDetail(summary)}
        />
        <PipedrivePullStateItem
          label="Webhooks"
          value={pipedriveWebhookRegistrationValue(summary.webhookRegistration)}
          detail={pipedriveWebhookRegistrationDetail(
            summary.webhookRegistration,
          )}
        />
        <PipedrivePullStateItem
          label="Latest job"
          value={
            latestBackgroundJob
              ? latestBackgroundJob.status
              : (latestSyncLog?.status ?? "No history")
          }
          detail={pipedriveLatestActivityDetail({
            latestBackgroundJob,
            latestSyncLog,
          })}
        />
      </dl>
    </section>
  );
}

function PipedriveWebhookActivityPanel({
  activity,
}: {
  activity: PipedriveValidationSummary["webhookActivity"];
}) {
  const latestProviderEvent =
    activity.recent.find(isPipedriveProviderWebhookEvent) ?? null;

  return (
    <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Webhook activity
            </h2>
            <LazyHelpTooltip content="Shows sanitized CRM-side logs created when Pipedrive webhook events reach the receiver." />
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {latestProviderEvent
              ? `Latest Pipedrive delivery ${pipedriveWebhookEventLabel(
                  latestProviderEvent,
                )} at ${
                  formattedDateTime(latestProviderEvent.startedAt) ?? "unknown"
                }.`
              : activity.selfTestCount
                ? "Receiver self-test has reached CRM, but no real Pipedrive lead/deal/person webhook delivery has arrived yet."
                : "No Pipedrive webhook delivery has reached CRM yet."}
          </p>
        </div>
        <StatusBadge>{pipedriveWebhookDeliveryStatus(activity)}</StatusBadge>
      </div>
      <dl className="mb-5 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <PipedrivePullStateItem
          label="Provider deliveries"
          value={formatPipedriveValidationCount(activity.providerEventCount)}
          detail={
            activity.lastProviderReceivedAt
              ? `Latest ${formattedDateTime(activity.lastProviderReceivedAt) ?? "unknown"}`
              : "Awaiting real Pipedrive event"
          }
        />
        <PipedrivePullStateItem
          label="Receiver tests"
          value={formatPipedriveValidationCount(activity.selfTestCount)}
          detail="CRM-side self-test logs"
        />
        <PipedrivePullStateItem
          label="Warnings"
          value={formatPipedriveValidationCount(activity.warningCount)}
          detail="Ignored or partial webhook logs"
        />
        <PipedrivePullStateItem
          label="Errors"
          value={formatPipedriveValidationCount(activity.errorCount)}
          detail="Recent failed webhook events"
        />
      </dl>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100 text-sm dark:divide-gray-800">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase dark:bg-white/[0.03] dark:text-gray-400">
            <tr>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Records</th>
              <th className="px-4 py-3">Received</th>
              <th className="px-4 py-3">Message</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {activity.recent.length ? (
              activity.recent.map((event, index) => (
                <tr key={`${event.syncType}-${event.startedAt}-${index}`}>
                  <td className="px-4 py-4 align-top">
                    <div className="font-medium text-gray-800 dark:text-white/90">
                      {pipedriveWebhookEventLabel(event)}
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {event.reason ?? event.syncType}
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <StatusBadge>{event.status}</StatusBadge>
                  </td>
                  <td className="px-4 py-4 align-top text-gray-600 dark:text-gray-300">
                    {event.recordsWritten}/{event.recordsRead}
                  </td>
                  <td className="px-4 py-4 align-top text-gray-500 dark:text-gray-400">
                    {formattedDateTime(event.startedAt) ?? "Unknown"}
                  </td>
                  <td className="px-4 py-4 align-top text-gray-600 dark:text-gray-300">
                    {event.message ?? "No message"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-sm text-gray-500"
                >
                  No Pipedrive webhook events have reached CRM yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PipedriveDirectLeadImportForm({ canImport }: { canImport: boolean }) {
  return (
    <form
      action={importPipedriveLeadByUrlAction}
      className="mb-6 grid gap-3 border-t border-gray-100 pt-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end dark:border-gray-800"
    >
      <div>
        <label
          htmlFor="pipedrive-direct-lead-input"
          className="text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Pipedrive lead URL or UUID
        </label>
        <input
          id="pipedrive-direct-lead-input"
          name="pipedriveLeadInput"
          type="text"
          disabled={!canImport}
          placeholder="https://epcimprovements.pipedrive.com/leads/inbox/..."
          className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800 dark:disabled:bg-white/[0.03]"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Imports that one Lead Inbox record into CRM only.
        </p>
      </div>
      <button
        type="submit"
        disabled={!canImport}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.05]"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Import lead
      </button>
    </form>
  );
}

function PipedrivePreviewTable({
  canImport,
  log,
  rows,
}: {
  canImport: boolean;
  log: PipedrivePreviewLog | null;
  rows: PipedrivePreviewRow[];
}) {
  const actionableRows = rows.filter(canImportPipedrivePreviewRow);

  return (
    <div className="mb-6 border-t border-gray-100 pt-5 dark:border-gray-800">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
            Latest preview
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {log
              ? `${log.recordsRead} Pipedrive lead${log.recordsRead === 1 ? "" : "s"} checked on ${log.startedAt.toLocaleString("en-GB")}.`
              : "No Pipedrive lead preview has run yet."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {log ? <StatusBadge>{log.status}</StatusBadge> : null}
          {rows.length ? (
            <button
              type="submit"
              form="pipedrive-selected-import-form"
              disabled={!canImport || actionableRows.length === 0}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.05]"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Import selected
            </button>
          ) : null}
        </div>
      </div>
      {rows.length ? (
        <form
          id="pipedrive-selected-import-form"
          action={importSelectedPipedriveLeadsAction}
        >
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm dark:divide-gray-800">
              <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase dark:bg-white/[0.03] dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3">Select</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Lead</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">CRM match</th>
                  <th className="px-4 py-3">Value</th>
                  <th className="px-4 py-3">Close</th>
                  <th className="px-4 py-3">Warnings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.map((row, index) => {
                  const rowCanImport =
                    canImport && canImportPipedrivePreviewRow(row);
                  const hasCrmMatch = Boolean(
                    row.matchedContactId || row.matchedCompanyId,
                  );

                  return (
                    <tr key={`${row.externalLeadId ?? "lead"}-${index}`}>
                      <td className="px-4 py-4 align-top">
                        <input
                          type="checkbox"
                          name="externalLeadId"
                          value={row.externalLeadId ?? ""}
                          disabled={!rowCanImport}
                          aria-label={`Select ${row.title ?? row.externalLeadId ?? "Pipedrive lead"}`}
                          className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900"
                        />
                      </td>
                      <td className="px-4 py-4 align-top">
                        <StatusBadge>
                          {pipedrivePreviewStatusLabel(row.status)}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="font-medium text-gray-800 dark:text-white/90">
                          {row.title ?? "Untitled lead"}
                        </div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {row.externalLeadId ?? "No Pipedrive ID"}
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top text-gray-600 dark:text-gray-300">
                        <div>{row.contactName ?? "No contact"}</div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {[row.contactEmail, row.contactPhone]
                            .filter(Boolean)
                            .join(" / ") || "No contact details"}
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top text-gray-600 dark:text-gray-300">
                        {row.companyName ?? "No company"}
                      </td>
                      <td className="px-4 py-4 align-top text-gray-600 dark:text-gray-300">
                        {hasCrmMatch ? (
                          <div className="flex flex-col gap-1">
                            <PipedriveCrmMatchLink
                              href={
                                row.matchedContactId
                                  ? `/contacts/${row.matchedContactId}`
                                  : null
                              }
                              label="Contact"
                              name={row.matchedContactName}
                              recordId={row.matchedContactId}
                            />
                            <PipedriveCrmMatchLink
                              href={
                                row.matchedCompanyId
                                  ? `/clients/${row.matchedCompanyId}`
                                  : null
                              }
                              label="Company"
                              name={row.matchedCompanyName}
                              recordId={row.matchedCompanyId}
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            No existing match
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 align-top text-gray-600 dark:text-gray-300">
                        {formatPipedrivePreviewMoney(
                          row.valueCents,
                          row.currency,
                        )}
                      </td>
                      <td className="px-4 py-4 align-top text-gray-600 dark:text-gray-300">
                        {formatPipedrivePreviewDate(row.expectedCloseDate)}
                      </td>
                      <td className="px-4 py-4 align-top text-gray-600 dark:text-gray-300">
                        {row.warningCount ? (
                          <div>
                            <div>
                              {row.warningCount} warning
                              {row.warningCount === 1 ? "" : "s"}
                            </div>
                            {row.warnings.length ? (
                              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                {row.warnings.join(" / ")}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          "None"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </form>
      ) : (
        <div className="py-6 text-sm text-gray-500 dark:text-gray-400">
          {log?.message ?? "Preview results will appear here after a dry-run."}
        </div>
      )}
    </div>
  );
}

function PipedriveImportDetailTable({
  log,
  rows,
}: {
  log: PipedriveImportLog | null;
  rows: PipedriveImportRow[];
}) {
  return (
    <div className="mb-6 border-t border-gray-100 pt-5 dark:border-gray-800">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
            Latest import details
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {log
              ? `${formatPipedriveImportJobLabel(log.syncType)} checked ${log.recordsRead} lead${log.recordsRead === 1 ? "" : "s"} and wrote ${log.recordsWritten} on ${log.startedAt.toLocaleString("en-GB")}.`
              : "No Pipedrive import has run yet."}
          </p>
        </div>
        {log ? <StatusBadge>{log.status}</StatusBadge> : null}
      </div>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 text-sm dark:divide-gray-800">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase dark:bg-white/[0.03] dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Outcome</th>
                <th className="px-4 py-3">Lead</th>
                <th className="px-4 py-3">CRM records</th>
                <th className="px-4 py-3">Warnings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((row, index) => (
                <tr key={`${row.externalLeadId ?? "import"}-${index}`}>
                  <td className="px-4 py-4 align-top">
                    <StatusBadge>
                      {pipedriveImportStatusLabel(row.status)}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="font-medium text-gray-800 dark:text-white/90">
                      {row.title ?? "Untitled lead"}
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {row.externalLeadId ?? "No Pipedrive ID"}
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top text-gray-600 dark:text-gray-300">
                    <div className="flex flex-col gap-1">
                      <PipedriveCrmRecordLink
                        href={
                          row.opportunityId
                            ? `/sales/${row.opportunityId}`
                            : null
                        }
                        label={
                          row.createdOpportunity
                            ? "Opportunity created"
                            : "Opportunity"
                        }
                        recordId={row.opportunityId}
                      />
                      <PipedriveCrmRecordLink
                        href={
                          row.contactId ? `/contacts/${row.contactId}` : null
                        }
                        label={
                          row.createdContact ? "Contact created" : "Contact"
                        }
                        recordId={row.contactId}
                      />
                      <PipedriveCrmRecordLink
                        href={
                          row.companyId ? `/clients/${row.companyId}` : null
                        }
                        label={
                          row.createdCompany ? "Company created" : "Company"
                        }
                        recordId={row.companyId}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top text-gray-600 dark:text-gray-300">
                    {row.warningCount ? (
                      <div>
                        <div>
                          {row.warningCount} warning
                          {row.warningCount === 1 ? "" : "s"}
                        </div>
                        {row.warnings.length ? (
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {row.warnings.join(" / ")}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      "None"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-6 text-sm text-gray-500 dark:text-gray-400">
          {log?.message ??
            "Import details will appear after a Pipedrive import runs."}
        </div>
      )}
    </div>
  );
}

function PipedriveContactImportDetailTable({
  log,
  rows,
}: {
  log: PipedriveImportLog | null;
  rows: PipedriveContactImportRow[];
}) {
  return (
    <div className="mb-6 border-t border-gray-100 pt-5 dark:border-gray-800">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
            Latest contact import details
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {log
              ? `${formatPipedriveImportJobLabel(log.syncType)} checked ${log.recordsRead} person${log.recordsRead === 1 ? "" : "s"} and wrote ${log.recordsWritten} on ${log.startedAt.toLocaleString("en-GB")}.`
              : "No Pipedrive contact import has run yet."}
          </p>
        </div>
        {log ? <StatusBadge>{log.status}</StatusBadge> : null}
      </div>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 text-sm dark:divide-gray-800">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase dark:bg-white/[0.03] dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Outcome</th>
                <th className="px-4 py-3">Person</th>
                <th className="px-4 py-3">CRM records</th>
                <th className="px-4 py-3">Warnings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((row, index) => (
                <tr key={`${row.externalPersonId ?? "person"}-${index}`}>
                  <td className="px-4 py-4 align-top">
                    <StatusBadge>
                      {pipedriveImportStatusLabel(row.status)}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="font-medium text-gray-800 dark:text-white/90">
                      {row.name ?? "Unnamed person"}
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {row.externalPersonId ?? "No Pipedrive ID"}
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top text-gray-600 dark:text-gray-300">
                    <div className="flex flex-col gap-1">
                      <PipedriveCrmRecordLink
                        href={
                          row.contactId ? `/contacts/${row.contactId}` : null
                        }
                        label={
                          row.createdContact ? "Contact created" : "Contact"
                        }
                        recordId={row.contactId}
                      />
                      <PipedriveCrmRecordLink
                        href={
                          row.companyId ? `/clients/${row.companyId}` : null
                        }
                        label={
                          row.createdCompany ? "Company created" : "Company"
                        }
                        recordId={row.companyId}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top text-gray-600 dark:text-gray-300">
                    {row.warningCount ? (
                      <div>
                        <div>
                          {row.warningCount} warning
                          {row.warningCount === 1 ? "" : "s"}
                        </div>
                        {row.warnings.length ? (
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {row.warnings.join(" / ")}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      "None"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-6 text-sm text-gray-500 dark:text-gray-400">
          {log?.message ??
            "Contact import details will appear after a Pipedrive contact import runs."}
        </div>
      )}
    </div>
  );
}

function PipedrivePullStateSummary({
  activeRun,
  credentialSource,
  continuationDetail,
  lastFullSyncAt,
  lastSyncAt,
  scheduleDryRun,
  scheduleEnabled,
  scheduleSecretConfigured,
  title,
}: {
  activeRun: { startedAt: Date; trigger: string } | null;
  credentialSource: PipedriveCredentialSource;
  continuationDetail: string;
  lastFullSyncAt: string | null;
  lastSyncAt: string | null;
  scheduleDryRun: boolean;
  scheduleEnabled: boolean;
  scheduleSecretConfigured: boolean;
  title: string;
}) {
  const scheduleBadge = pipedriveScheduleBadge({
    credentialSource,
    scheduleDryRun,
    scheduleEnabled,
    scheduleSecretConfigured,
  });
  const scheduleValue = scheduleEnabled
    ? scheduleDryRun
      ? "Enabled, dry-run"
      : "Enabled"
    : "Disabled";
  const scheduleDetail = scheduleEnabled
    ? scheduleSecretConfigured
      ? "Secret configured"
      : "Missing secret"
    : "Waiting for Netlify env flag";
  const credentialValue =
    credentialSource === "database"
      ? "Stored token"
      : credentialSource === "environment"
        ? "Environment token"
        : "Missing token";
  const activeRunAt = formattedDateTime(activeRun?.startedAt);

  return (
    <div className="mb-6 border-t border-gray-100 pt-5 dark:border-gray-800">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
            {title}
          </h3>
        </div>
        <StatusBadge>{scheduleBadge}</StatusBadge>
      </div>
      <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <PipedrivePullStateItem
          label="Schedule"
          value={scheduleValue}
          detail={scheduleDetail}
        />
        <PipedrivePullStateItem
          label="Credentials"
          value={credentialValue}
          detail={
            credentialSource === "missing" ? "Pulls disabled" : "Pull-only"
          }
        />
        <PipedrivePullStateItem
          label="Full cursor"
          value={formattedDateTime(lastFullSyncAt) ?? "Not completed"}
          detail={continuationDetail}
        />
        <PipedrivePullStateItem
          label="Overlap guard"
          value={activeRun ? "Running" : "Ready"}
          detail={
            activeRun
              ? `${activeRun.trigger} since ${activeRunAt ?? "unknown"}`
              : `Last sync ${formattedDateTime(lastSyncAt) ?? "not recorded"}`
          }
        />
      </dl>
    </div>
  );
}

function PipedrivePullStateItem({
  detail,
  label,
  value,
}: {
  detail: string;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
        {label}
      </dt>
      <dd className="mt-1 font-medium text-gray-800 dark:text-white/90">
        {value}
      </dd>
      <dd className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {detail}
      </dd>
    </div>
  );
}

function pipedriveScheduleBadge({
  credentialSource,
  scheduleDryRun,
  scheduleEnabled,
  scheduleSecretConfigured,
}: {
  credentialSource: PipedriveCredentialSource;
  scheduleDryRun: boolean;
  scheduleEnabled: boolean;
  scheduleSecretConfigured: boolean;
}) {
  if (!scheduleEnabled) return "Planned";
  if (credentialSource === "missing" || !scheduleSecretConfigured) {
    return "Needed";
  }
  if (scheduleDryRun) return "WARNING";

  return "Ready";
}

function pipedriveExternalLinkCount({
  externalType,
  internalType,
  summary,
}: {
  externalType: string;
  internalType: string;
  summary: PipedriveValidationSummary;
}) {
  return (
    summary.externalRecordLinks.find(
      (row) =>
        row.externalType === externalType && row.internalType === internalType,
    )?.count ?? 0
  );
}

function formatPipedriveValidationCount(value: number) {
  return new Intl.NumberFormat("en-GB").format(value);
}

function pipedriveLeadCursorDetail(summary: PipedriveValidationSummary) {
  const nextStart = summary.leadReadiness.lastFullLeadSyncNextStart;
  if (typeof nextStart === "number") return `Continuation start ${nextStart}`;

  return summary.leadReadiness.connected
    ? "No saved continuation"
    : "Credential check failed";
}

function pipedriveDealCursorDetail(summary: PipedriveValidationSummary) {
  if (summary.leadReadiness.lastFullDealSyncNextCursor) {
    return "Continuation cursor saved";
  }

  return summary.leadReadiness.connected
    ? "No saved continuation"
    : "Credential check failed";
}

function pipedriveContactCursorDetail(summary: PipedriveValidationSummary) {
  if (summary.contactReadiness.hasContinuationCursor) {
    return "Continuation cursor saved";
  }

  return summary.contactReadiness.connected
    ? "No saved continuation"
    : "Credential check failed";
}

function pipedriveWebhookRegistrationValue(
  webhookRegistration: PipedriveValidationSummary["webhookRegistration"],
) {
  if (!webhookRegistration) return "Not checked";
  if (webhookRegistration.status === "ERROR") return "Check failed";

  const desiredCount = webhookRegistration.desiredCount ?? 6;
  const existingTargetCount = webhookRegistration.existingTargetCount ?? 0;

  return `${existingTargetCount}/${desiredCount} registered`;
}

function pipedriveWebhookRegistrationDetail(
  webhookRegistration: PipedriveValidationSummary["webhookRegistration"],
) {
  if (!webhookRegistration) return "Registration check skipped";
  if (webhookRegistration.missingEvents.length) {
    return `Missing ${webhookRegistration.missingEvents.join(", ")}`;
  }
  if (webhookRegistration.receiverAuthConfigured === false) {
    return "Receiver auth missing";
  }

  return webhookRegistration.pipedriveWritesPerformed
    ? `${webhookRegistration.pipedriveWritesPerformed} provider write checked`
    : "No provider writes performed";
}

function pipedriveLatestActivityDetail({
  latestBackgroundJob,
  latestSyncLog,
}: {
  latestBackgroundJob:
    | PipedriveValidationSummary["backgroundJobs"][number]
    | null;
  latestSyncLog: PipedriveValidationSummary["syncLogs"][number] | null;
}) {
  if (latestBackgroundJob) {
    return `${latestBackgroundJob.jobName} at ${
      formattedDateTime(latestBackgroundJob.startedAt) ?? "unknown"
    }`;
  }
  if (latestSyncLog) {
    return `${latestSyncLog.syncType} at ${
      formattedDateTime(latestSyncLog.startedAt) ?? "unknown"
    }`;
  }

  return "No Pipedrive sync history";
}

function pipedriveWebhookDeliveryStatus(
  activity: PipedriveValidationSummary["webhookActivity"],
) {
  const providerEvents = activity.recent.filter(
    isPipedriveProviderWebhookEvent,
  );

  if (activity.deliveryStatus === "ERROR") return "ERROR";
  if (activity.deliveryStatus === "RECEIVED") {
    return providerEvents.some((event) => event.status === "WARNING")
      ? "WARNING"
      : "SUCCESS";
  }

  return "Planned";
}

function isPipedriveProviderWebhookEvent(
  event: PipedriveValidationSummary["webhookActivity"]["recent"][number],
) {
  return event.syncType !== "webhook-receiver-test";
}

function pipedriveWebhookEventLabel(
  event: PipedriveValidationSummary["webhookActivity"]["recent"][number],
) {
  const action = event.action ? titleCaseWord(event.action) : null;
  const entity = event.entity ? titleCaseWord(event.entity) : null;

  return [action, entity].filter(Boolean).join(" ") || event.syncType;
}

function titleCaseWord(value: string) {
  const normalized = value.trim();
  if (!normalized) return "";

  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

function PipedriveCrmRecordLink({
  href,
  label,
  recordId,
}: {
  href: string | null;
  label: string;
  recordId: string | null;
}) {
  if (!recordId || !href) {
    return (
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {label}: n/a
      </span>
    );
  }

  return (
    <Link
      href={href}
      className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
    >
      {label}: {shortRecordId(recordId)}
    </Link>
  );
}

function PipedriveCrmMatchLink({
  href,
  label,
  name,
  recordId,
}: {
  href: string | null;
  label: string;
  name: string | null;
  recordId: string | null;
}) {
  if (!recordId || !href) {
    return null;
  }

  return (
    <Link
      href={href}
      className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
    >
      {label}: {name ?? shortRecordId(recordId)}
    </Link>
  );
}

function pipedrivePreviewRowsFromMetadata(
  metadata: Prisma.JsonValue | null | undefined,
) {
  const record = jsonRecord(metadata);
  const rows = Array.isArray(record.previews) ? record.previews : [];

  return rows
    .map(parsePipedrivePreviewRow)
    .filter((row): row is PipedrivePreviewRow => Boolean(row))
    .slice(0, 50);
}

function pipedriveImportRowsFromMetadata(
  metadata: Prisma.JsonValue | null | undefined,
) {
  const record = jsonRecord(metadata);
  const rows = Array.isArray(record.imports) ? record.imports : [];

  return rows
    .map(parsePipedriveImportRow)
    .filter((row): row is PipedriveImportRow => Boolean(row))
    .slice(0, 50);
}

function pipedriveContactImportRowsFromMetadata(
  metadata: Prisma.JsonValue | null | undefined,
) {
  const record = jsonRecord(metadata);
  const rows = Array.isArray(record.imports) ? record.imports : [];

  return rows
    .map(parsePipedriveContactImportRow)
    .filter((row): row is PipedriveContactImportRow => Boolean(row))
    .slice(0, 50);
}

function parsePipedrivePreviewRow(value: unknown) {
  const record = jsonRecord(value);
  const status = pipedrivePreviewStatus(record.status);

  if (!status) return null;

  return {
    companyName: nullableString(record.companyName),
    contactEmail: nullableString(record.contactEmail),
    contactName: nullableString(record.contactName),
    contactPhone: nullableString(record.contactPhone),
    currency: nullableString(record.currency),
    expectedCloseDate: nullableString(record.expectedCloseDate),
    externalLeadId: nullableString(record.externalLeadId),
    linkedOpportunityId: nullableString(record.linkedOpportunityId),
    matchedCompanyId: nullableString(record.matchedCompanyId),
    matchedCompanyName: nullableString(record.matchedCompanyName),
    matchedContactId: nullableString(record.matchedContactId),
    matchedContactName: nullableString(record.matchedContactName),
    status,
    title: nullableString(record.title),
    valueCents: nullableNumber(record.valueCents),
    warningCount: Math.max(
      0,
      Math.trunc(nullableNumber(record.warningCount) ?? 0),
    ),
    warnings: Array.isArray(record.warnings)
      ? record.warnings
          .map(nullableString)
          .filter((warning): warning is string => Boolean(warning))
      : [],
  };
}

function parsePipedriveImportRow(value: unknown) {
  const record = jsonRecord(value);
  const status = pipedriveImportStatus(record.status);

  if (!status) return null;

  return {
    companyId: nullableString(record.companyId),
    contactId: nullableString(record.contactId),
    createdCompany: nullableBoolean(record.createdCompany),
    createdContact: nullableBoolean(record.createdContact),
    createdOpportunity: nullableBoolean(record.createdOpportunity),
    externalLeadId: nullableString(record.externalLeadId),
    opportunityId: nullableString(record.opportunityId),
    status,
    title: nullableString(record.title),
    warningCount: Math.max(
      0,
      Math.trunc(nullableNumber(record.warningCount) ?? 0),
    ),
    warnings: Array.isArray(record.warnings)
      ? record.warnings
          .map(nullableString)
          .filter((warning): warning is string => Boolean(warning))
      : [],
  };
}

function parsePipedriveContactImportRow(value: unknown) {
  const record = jsonRecord(value);
  const status = pipedriveImportStatus(record.status);

  if (!status) return null;

  return {
    companyId: nullableString(record.companyId),
    contactId: nullableString(record.contactId),
    createdCompany: nullableBoolean(record.createdCompany),
    createdContact: nullableBoolean(record.createdContact),
    externalPersonId: nullableString(record.externalPersonId),
    name: nullableString(record.name),
    status,
    warningCount: Math.max(
      0,
      Math.trunc(nullableNumber(record.warningCount) ?? 0),
    ),
    warnings: Array.isArray(record.warnings)
      ? record.warnings
          .map(nullableString)
          .filter((warning): warning is string => Boolean(warning))
      : [],
  };
}

function pipedrivePreviewStatus(value: unknown) {
  if (
    value === "would_create" ||
    value === "linked_existing" ||
    value === "skipped"
  ) {
    return value;
  }

  return null;
}

function pipedriveImportStatus(value: unknown) {
  if (
    value === "created" ||
    value === "linked_existing" ||
    value === "skipped"
  ) {
    return value;
  }

  return null;
}

function pipedrivePreviewStatusLabel(status: PipedrivePreviewRow["status"]) {
  if (status === "would_create") return "Would create";
  if (status === "linked_existing") return "Already linked";
  return "Skipped";
}

function pipedriveImportStatusLabel(status: PipedriveImportRow["status"]) {
  if (status === "created") return "Created";
  if (status === "linked_existing") return "Already linked";
  return "Skipped";
}

function formatPipedriveImportJobLabel(syncType: string) {
  if (syncType === "contact-import") return "Contact pull";
  if (syncType === "contact-import-webhook") return "Contact webhook";
  if (syncType === "lead-import-webhook") return "Lead webhook";
  if (syncType === "webhook-receiver-test") return "Receiver test";
  if (syncType === "lead-import-direct") return "Direct lead import";
  if (syncType === "lead-import-selected") return "Selected import";
  if (syncType === "lead-import") return "Full pull";
  return syncType;
}

function canImportPipedrivePreviewRow(row: PipedrivePreviewRow) {
  return Boolean(row.externalLeadId && row.status === "would_create");
}

function formatPipedrivePreviewMoney(
  valueCents: number | null,
  currency: string | null,
) {
  if (valueCents === null) return "n/a";

  const amount = valueCents / 100;
  const code = currency || "GBP";

  try {
    return new Intl.NumberFormat("en-GB", {
      currency: code,
      style: "currency",
    }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}

function formatPipedrivePreviewDate(value: string | null) {
  if (!value) return "n/a";

  const date = new Date(`${value}T00:00:00.000Z`);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-GB");
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableBoolean(value: unknown) {
  return value === true;
}

function shortRecordId(value: string) {
  return value.length > 10 ? `${value.slice(0, 10)}...` : value;
}

function SyncHistoryTable({ logs }: { logs: ProviderSyncLog[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-100 text-sm dark:divide-gray-800">
        <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase dark:bg-white/[0.03] dark:text-gray-400">
          <tr>
            <th className="px-4 py-3">Job</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Records</th>
            <th className="px-4 py-3">Latest</th>
            <th className="px-4 py-3">Message</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {logs.length ? (
            logs.map((log) => (
              <tr key={log.id}>
                <td className="px-4 py-4 font-medium text-gray-800 dark:text-white/90">
                  {log.syncType}
                </td>
                <td className="px-4 py-4">
                  <StatusBadge>{log.status}</StatusBadge>
                </td>
                <td className="px-4 py-4 text-gray-600 dark:text-gray-300">
                  {log.recordsWritten}/{log.recordsRead}
                </td>
                <td className="px-4 py-4 text-gray-500 dark:text-gray-400">
                  {log.startedAt.toLocaleDateString("en-GB")}
                </td>
                <td className="px-4 py-4 text-gray-600 dark:text-gray-300">
                  {log.message ?? "No message"}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={5}
                className="px-4 py-8 text-center text-sm text-gray-500"
              >
                No sync jobs have run for this provider yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
