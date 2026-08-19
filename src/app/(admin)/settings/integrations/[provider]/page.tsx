import Link from "next/link";
import { notFound } from "next/navigation";
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
import ProviderAuthResetForm from "@/components/crm-boilerplate/ProviderAuthResetForm";
import ProviderConnectionTestForm from "@/components/crm-boilerplate/ProviderConnectionTestForm";
import ProviderSelectorRefreshForm from "@/components/crm-boilerplate/LazyProviderSelectorRefreshForm";
import StatusBadge from "@/components/crm-boilerplate/StatusBadge";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
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
} from "@/lib/integrations/pipedrive";
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
    const config = pipedriveConfigSchema.safeParse(integration?.config ?? {});
    const hasStoredPipedriveConfig = hasStoredPipedriveCredentials(
      integration?.config,
    );
    const pipedriveCredentialSource = hasStoredPipedriveConfig
      ? "database"
      : hasPipedriveEnvironmentConfig()
        ? "environment"
        : "missing";

    return (
      <>
        <PageHeader
          title="Connect Pipedrive"
          description="Connection credentials for importing Pipedrive leads into CRM contacts, companies and opportunities."
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
