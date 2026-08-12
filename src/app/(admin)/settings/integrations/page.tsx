import Image from "next/image";
import Link from "next/link";
import IntegrationCard from "@/components/crm-boilerplate/LazyIntegrationCard";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import SectionHeader from "@/components/crm-boilerplate/SectionHeader";
import StatusBadge from "@/components/crm-boilerplate/StatusBadge";
import { requireAdmin } from "@/lib/auth";
import { hasCredentialEncryptionKey } from "@/lib/crypto/secrets";
import { twilioConfigSchema } from "@/lib/integrations/twilio";
import { openaiConfigSchema } from "@/lib/integrations/openai";
import {
  docusignConfigSchema,
  docusignProvider,
} from "@/lib/integrations/docusign";
import {
  geoapifyConfigSchema,
  geoapifyProvider,
} from "@/lib/integrations/geoapify";
import {
  id30AuthConfigSchema,
  id30AuthProvider,
  publicId30AuthConfig,
} from "@/lib/integrations/id30-auth";
import { latestIntegrationHealthSnapshotsByProvider } from "@/lib/integrations/health-snapshots";
import {
  systemIntegrationDefinitions,
  systemIntegrationRows,
} from "@/lib/integrations/system-services";
import { appBaseUrlFromHeaders } from "@/lib/http/origin";
import { mailerSendConfigSchema } from "@/lib/integrations/mailersend";
import {
  getMarketingIntegrationCredentialState,
  getMarketingIntegrationProviderState,
  marketingIntegrationProviderDefinitions,
  marketingIntegrationProviderGroups,
} from "@/lib/marketing/integrations";
import { prisma } from "@/lib/prisma";
import { r2ConfigSchema } from "@/lib/storage/r2";

const marketingIconBySlug: Record<string, string> = {
  "bing-ads": "/images/integration/bing-ads.svg",
  "google-ads": "/images/integration/google-ads.svg",
  "google-analytics": "/images/integration/google-analytics.svg",
  "google-search-console": "/images/integration/google-search-console.svg",
  klaviyo: "/images/integration/klaviyo.svg",
  "linkedin-ads": "/images/integration/linkedin-ads.svg",
  meta: "/images/integration/meta.svg",
};

const oauthInstallProviderSlugs = new Set([
  "bing-ads",
  "google-ads",
  "google-analytics",
  "google-search-console",
  "klaviyo",
  "linkedin-ads",
  "meta",
]);

export default async function IntegrationsPage() {
  const marketingProviderKeys = marketingIntegrationProviderDefinitions.map(
    (provider) => provider.provider,
  );
  const systemProviderKeys = systemIntegrationDefinitions.map(
    (provider) => provider.provider,
  );
  const marketingProviderKeySet = new Set<string>(marketingProviderKeys);
  await requireAdmin();
  const [integrations, marketingConnections, latestSystemHealthSnapshots] =
    await Promise.all([
      prisma.integrationConnection.findMany({ orderBy: { name: "asc" } }),
      prisma.integrationConnection.findMany({
        where: { provider: { in: marketingProviderKeys } },
        select: {
          provider: true,
          status: true,
          config: true,
        },
      }),
      latestIntegrationHealthSnapshotsByProvider(systemProviderKeys),
    ]);
  const systemIntegrations = systemIntegrationRows({
    connections: integrations,
    latestHealthSnapshots: latestSystemHealthSnapshots,
    marketingProviderKeys: marketingProviderKeySet,
  });
  const authBrokerIntegration = systemIntegrations.find(
    (integration) => integration.provider === id30AuthProvider,
  );
  const hasAuthBrokerConfigured =
    authBrokerIntegration?.credentialSource === "database" ||
    authBrokerIntegration?.credentialSource === "environment";
  const marketingConnectionMap = new Map(
    marketingConnections.map((connection) => [connection.provider, connection]),
  );
  const marketingProviders = marketingIntegrationProviderDefinitions.map(
    (provider) => {
      const connection = marketingConnectionMap.get(provider.provider);

      return {
        credentialState: getMarketingIntegrationCredentialState(
          provider.slug,
          connection?.config ?? {},
          { authBrokerConfigured: hasAuthBrokerConfigured },
        ),
        provider: getMarketingIntegrationProviderState(provider, connection),
      };
    },
  );
  const groupedMarketingProviders = marketingIntegrationProviderGroups
    .map((group) => ({
      ...group,
      providers: marketingProviders.filter(
        ({ provider }) => provider.group === group.key,
      ),
    }))
    .filter((group) => group.providers.length > 0);
  const crmBaseUrl = await appBaseUrlFromHeaders();
  const authCallbackUrl = `${crmBaseUrl}/api/integrations/oauth/complete`;

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Connected services for storage, communications, marketing platforms and CRM automation."
      />
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <SectionHeader
          title="System services"
          description="Storage, telephony and automation providers used by the CRM."
          help="Shows each configured integration, its connection status and whether stored credentials are available for operational features."
        />
        <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
          {systemIntegrations.map((integration) => {
            const r2Config = r2ConfigSchema.safeParse(integration.config ?? {});
            const twilioConfig = twilioConfigSchema.safeParse(
              integration.config ?? {},
            );
            const mailerSendConfig = mailerSendConfigSchema.safeParse(
              integration.config ?? {},
            );
            const id30AuthConfig = id30AuthConfigSchema.safeParse(
              integration.config ?? {},
            );
            const openaiConfig = openaiConfigSchema.safeParse(
              integration.config ?? {},
            );
            const geoapifyConfig = geoapifyConfigSchema.safeParse(
              integration.config ?? {},
            );
            const docusignConfig = docusignConfigSchema.safeParse(
              integration.config ?? {},
            );
            const isR2 = integration.provider === "cloudflare-r2";
            const isDocuSign = integration.provider === docusignProvider;
            const isGeoapify = integration.provider === geoapifyProvider;
            const isId30Auth = integration.provider === id30AuthProvider;
            const isMailerSend = integration.provider === "mailersend";
            const isTwilio = integration.provider === "twilio";
            const isOpenAI = integration.provider === "openai";

            return (
              <IntegrationCard
                key={integration.id}
                name={integration.name}
                provider={integration.provider}
                description={integration.description}
                status={integration.status}
                appBaseUrl={crmBaseUrl}
                callbackUrl={authCallbackUrl}
                categoryLabel={integration.categoryLabel}
                capabilities={integration.capabilities}
                credentialSource={integration.credentialSource}
                iconSrc={integration.iconSrc}
                internal={integration.internal}
                latestHealthSnapshot={integration.latestHealthSnapshot}
                readinessStatus={integration.readinessStatus}
                setupHref={integration.setupHref}
                config={
                  isR2 && r2Config.success
                    ? r2Config.data
                    : isId30Auth && id30AuthConfig.success
                      ? publicId30AuthConfig(integration.config)
                      : isMailerSend && mailerSendConfig.success
                        ? mailerSendConfig.data
                        : isTwilio && twilioConfig.success
                          ? twilioConfig.data
                          : isOpenAI && openaiConfig.success
                            ? openaiConfig.data
                            : isDocuSign && docusignConfig.success
                              ? docusignConfig.data
                              : isGeoapify && geoapifyConfig.success
                                ? geoapifyConfig.data
                                : undefined
                }
                hasStoredCredentials={integration.hasStoredCredentials}
                hasEncryptionKey={hasCredentialEncryptionKey()}
                canEdit
              />
            );
          })}
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <SectionHeader
          title="Marketing platforms"
          description="Analytics, advertising and lifecycle automation connections that feed attribution, spend and conversion reporting."
          help="Marketing provider credentials live in Settings so all third-party connections can be managed in one place."
        />
        <div className="space-y-7 p-5">
          {groupedMarketingProviders.map((group) => (
            <div key={group.key} className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
                      {group.title}
                    </h3>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-white/10 dark:text-gray-300">
                      {group.providers.length}{" "}
                      {group.providers.length === 1 ? "platform" : "platforms"}
                    </span>
                  </div>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
                    {group.description}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {group.providers.map(({ credentialState, provider }) => (
                  <MarketingProviderCard
                    key={provider.slug}
                    credentialState={credentialState}
                    provider={provider}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function MarketingProviderCard({
  credentialState,
  provider,
}: {
  credentialState: ReturnType<typeof getMarketingIntegrationCredentialState>;
  provider: ReturnType<typeof getMarketingIntegrationProviderState>;
}) {
  const displayStatus = provider.connected
    ? "Connected"
    : credentialState.providerAccessConnected
      ? "Access Connected"
      : "Not Connected";
  const hasOAuthInstall = oauthInstallProviderSlugs.has(provider.slug);
  const readinessLabel = credentialState.uploadReady
    ? "Ready to upload conversions."
    : provider.slug === "google-search-console" &&
        credentialState.providerAccessConnected
      ? provider.connected
        ? "Search Console access and property mapping are saved; performance import needs ingestion."
        : "Provider access is connected. Save the verified search property next."
      : provider.slug === "google-search-console"
        ? "Connect Google and choose the verified Search Console property."
        : provider.slug === "klaviyo" && credentialState.providerAccessConnected
          ? provider.connected
            ? "Klaviyo access and account settings are saved; lifecycle import can run through iD30 Auth."
            : "Klaviyo access is connected. Save account and list settings next."
          : provider.slug === "klaviyo"
            ? credentialState.oauthConfigured
              ? "Connect Klaviyo through iD30 Auth, then refresh lifecycle marketing options."
              : "iD30 setup is required before the client can connect Klaviyo."
            : credentialState.providerAccessConnected
              ? "Provider access is connected. Save account and conversion mappings next."
              : hasOAuthInstall && !credentialState.oauthConfigured
                ? "iD30 setup is required before the client can connect this provider."
                : provider.next;
  const canStartOAuth = hasOAuthInstall && credentialState.oauthConfigured;
  const primaryHref =
    hasOAuthInstall &&
    !credentialState.oauthConfigured &&
    !credentialState.providerAccessConnected
      ? "/settings/integrations/id30-auth"
      : canStartOAuth &&
          !provider.connected &&
          !credentialState.providerAccessConnected
        ? `/api/marketing/oauth/${provider.slug}/start`
        : `/settings/integrations/${provider.slug}`;
  const primaryLabel = provider.connected
    ? "Manage"
    : hasOAuthInstall
      ? credentialState.providerAccessConnected
        ? "Map account"
        : canStartOAuth
          ? "Connect"
          : "Setup required"
      : "Configure";

  return (
    <article className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
      <div className="flex flex-1 flex-col p-5 pb-9">
        <div className="mb-5 inline-flex h-10 w-10 items-center justify-center">
          <Image
            className="h-10 w-10 object-contain"
            src={marketingIconBySlug[provider.slug]}
            alt=""
            width={40}
            height={40}
          />
        </div>

        <div className="mb-3 flex items-start justify-between gap-4">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            {provider.name}
          </h3>
          <StatusBadge>{displayStatus}</StatusBadge>
        </div>

        <p className="max-w-xs text-sm text-gray-500 dark:text-gray-400">
          {provider.description}
        </p>

        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          {credentialState.items.slice(0, 3).map((item) => (
            <div
              key={item.label}
              className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.04]"
            >
              <p className="truncate text-xs font-medium text-gray-600 dark:text-gray-300">
                {item.label}
              </p>
              <p className="mt-1 text-xs font-semibold text-gray-800 dark:text-white/90">
                {item.ready ? "Ready" : "Needed"}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-5 text-sm leading-6 text-gray-500 dark:text-gray-400">
          {readinessLabel}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-gray-200 p-5 dark:border-gray-800">
        <Link
          href={primaryHref}
          className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-600"
        >
          {primaryLabel}
        </Link>
        <Link
          href={`/settings/integrations/${provider.slug}`}
          aria-label={`Open ${provider.name} settings`}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-700 shadow-theme-xs transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
        >
          <CogIcon />
        </Link>
      </div>
    </article>
  );
}

function CogIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5.64615 4.59906C5.05459 4.25752 4.29808 4.46015 3.95654 5.05171L2.69321 7.23986C2.35175 7.83128 2.5544 8.58754 3.14582 8.92899C3.97016 9.40493 3.97017 10.5948 3.14583 11.0707C2.55441 11.4122 2.35178 12.1684 2.69323 12.7598L3.95657 14.948C4.2981 15.5395 5.05461 15.7422 5.64617 15.4006C6.4706 14.9247 7.50129 15.5196 7.50129 16.4715C7.50129 17.1545 8.05496 17.7082 8.73794 17.7082H11.2649C11.9478 17.7082 12.5013 17.1545 12.5013 16.4717C12.5013 15.5201 13.5315 14.9251 14.3556 15.401C14.9469 15.7423 15.7029 15.5397 16.0443 14.9485L17.3079 12.7598C17.6494 12.1684 17.4467 11.4121 16.8553 11.0707C16.031 10.5948 16.031 9.40494 16.8554 8.92902C17.4468 8.58757 17.6494 7.83133 17.3079 7.23992L16.0443 5.05123C15.7029 4.45996 14.9469 4.25737 14.3556 4.59874C13.5315 5.07456 12.5013 4.47961 12.5013 3.52798C12.5013 2.84515 11.9477 2.2915 11.2649 2.2915L8.73795 2.2915C8.05496 2.2915 7.50129 2.84518 7.50129 3.52816C7.50129 4.48015 6.47059 5.07505 5.64615 4.59906Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M12.5714 9.99977C12.5714 11.4196 11.4204 12.5706 10.0005 12.5706C8.58069 12.5706 7.42969 11.4196 7.42969 9.99977C7.42969 8.57994 8.58069 7.42894 10.0005 7.42894C11.4204 7.42894 12.5714 8.57994 12.5714 9.99977Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}
