import "server-only";

import type { IntegrationConnection } from "@prisma/client";
import {
  getEnvId30AuthRuntimeConfig,
  hasStoredId30AuthCredentials,
  id30AuthConfigSchema,
  id30AuthProvider,
} from "@/lib/integrations/id30-auth";
import type { LatestIntegrationHealthSnapshot } from "@/lib/integrations/health-snapshots";
import {
  docusignProvider,
  docusignStoredConfigSchema,
  hasStoredDocuSignCredentials,
} from "@/lib/integrations/docusign";
import {
  geoapifyProvider,
  geoapifyStoredConfigSchema,
  hasGeoapifyEnvironmentConfig,
  hasStoredGeoapifyCredentials,
} from "@/lib/integrations/geoapify";
import {
  hasStoredMailerSendCredentials,
  mailerSendInboundReplyAddress,
  mailerSendProvider,
  mailerSendStoredConfigSchema,
} from "@/lib/integrations/mailersend";
import {
  defaultOpenAIModel,
  hasStoredOpenAICredentials,
  openaiProvider,
  openaiStoredConfigSchema,
} from "@/lib/integrations/openai";
import {
  defaultPipedriveApiBaseUrl,
  hasPipedriveEnvironmentConfig,
  hasStoredPipedriveCredentials,
  pipedriveProvider,
  pipedriveStoredConfigSchema,
} from "@/lib/integrations/pipedrive";
import {
  hasSpruceZapierEnvironmentConfig,
  hasStoredSpruceZapierCredentials,
  spruceProvider,
  spruceWebhookReceiverPath,
  spruceZapierStoredConfigSchema,
} from "@/lib/integrations/spruce-zapier";
import {
  hasStoredTwilioCredentials,
  twilioProvider,
  twilioStoredConfigSchema,
} from "@/lib/integrations/twilio";
import {
  cloudflareR2Provider,
  hasStoredR2Credentials,
  r2StoredConfigSchema,
} from "@/lib/storage/r2";

type SystemIntegrationConnection = Pick<
  IntegrationConnection,
  | "config"
  | "createdAt"
  | "description"
  | "id"
  | "name"
  | "provider"
  | "status"
  | "updatedAt"
>;

export type SystemIntegrationCredentialSource =
  | "database"
  | "environment"
  | "missing"
  | "placeholder";

export type SystemIntegrationCapabilityStatus = "missing" | "ready" | "warning";

export type SystemIntegrationCapability = {
  detail: string;
  label: string;
  optional?: boolean;
  status: SystemIntegrationCapabilityStatus;
};

export type SystemIntegrationReadiness =
  | "connected"
  | "error"
  | "missing"
  | "partial"
  | "placeholder";

type SystemIntegrationCapabilityInput = {
  config: unknown;
  credentialSource: SystemIntegrationCredentialSource;
  hasEnvironmentConfig: boolean;
  hasStoredCredentials: boolean;
};

export type SystemIntegrationDefinition = {
  categoryLabel: string;
  capabilities?: (
    input: SystemIntegrationCapabilityInput,
  ) => SystemIntegrationCapability[];
  description: string;
  hasEnvironmentConfig?: () => boolean;
  hasStoredCredentials?: (config: unknown) => boolean;
  iconSrc: string;
  internal?: boolean;
  name: string;
  provider: string;
  realIntegration: boolean;
  setupHref: string;
  showWhenMissing?: boolean;
  visibleInOverview?: boolean;
};

export type SystemIntegrationRow = SystemIntegrationConnection & {
  categoryLabel: string;
  credentialSource: SystemIntegrationCredentialSource;
  hasEnvironmentConfig: boolean;
  hasStoredCredentials: boolean;
  iconSrc: string;
  internal: boolean;
  realIntegration: boolean;
  readinessStatus: SystemIntegrationReadiness;
  capabilities: SystemIntegrationCapability[];
  latestHealthSnapshot: LatestIntegrationHealthSnapshot | null;
  setupHref: string;
};

export function hasOpenAIEnvironmentConfig() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function hasId30AuthEnvironmentConfig() {
  return Boolean(getEnvId30AuthRuntimeConfig());
}

export const systemIntegrationDefinitions: SystemIntegrationDefinition[] = [
  {
    categoryLabel: "Storage",
    capabilities: cloudflareR2Capabilities,
    description:
      "Object storage for CRM files, uploads, quote packs and call recordings.",
    hasStoredCredentials: hasStoredR2Credentials,
    iconSrc: "/images/integration/cloudflare-r2.svg",
    name: "Cloudflare R2",
    provider: cloudflareR2Provider,
    realIntegration: true,
    setupHref: "/settings/integrations/cloudflare-r2",
    showWhenMissing: true,
  },
  {
    categoryLabel: "Communications",
    capabilities: twilioCapabilities,
    description:
      "Voice, SMS and WhatsApp communications for CRM conversations.",
    hasStoredCredentials: hasStoredTwilioCredentials,
    iconSrc: "/images/integration/twilio.svg",
    name: "Twilio",
    provider: twilioProvider,
    realIntegration: true,
    setupHref: "/settings/integrations/twilio",
    showWhenMissing: true,
  },
  {
    categoryLabel: "Communications",
    capabilities: mailerSendCapabilities,
    description:
      "Transactional email, domain authentication and inbound email routing.",
    hasStoredCredentials: hasStoredMailerSendCredentials,
    iconSrc: "/images/integration/mailersend.svg",
    name: "MailerSend",
    provider: mailerSendProvider,
    realIntegration: true,
    setupHref: "/settings/integrations/mailersend",
    showWhenMissing: true,
  },
  {
    categoryLabel: "AI",
    capabilities: openAICapabilities,
    description:
      "AI models for CRM Sidekick, call summaries and assisted workflows.",
    hasEnvironmentConfig: hasOpenAIEnvironmentConfig,
    hasStoredCredentials: hasStoredOpenAICredentials,
    iconSrc: "/images/integration/openai.svg",
    name: "OpenAI",
    provider: openaiProvider,
    realIntegration: true,
    setupHref: "/settings/integrations/openai",
    showWhenMissing: true,
  },
  {
    categoryLabel: "CRM data",
    capabilities: geoapifyCapabilities,
    description: "Address autocomplete for contact and company address fields.",
    hasEnvironmentConfig: hasGeoapifyEnvironmentConfig,
    hasStoredCredentials: hasStoredGeoapifyCredentials,
    iconSrc: "/images/integration/geoapify.svg",
    name: "Geoapify",
    provider: geoapifyProvider,
    realIntegration: true,
    setupHref: "/settings/integrations/geoapify",
    showWhenMissing: true,
  },
  {
    categoryLabel: "CRM data",
    capabilities: pipedriveCapabilities,
    description: "Lead inbox import and CRM data synchronisation.",
    hasEnvironmentConfig: hasPipedriveEnvironmentConfig,
    hasStoredCredentials: hasStoredPipedriveCredentials,
    iconSrc: "/images/integration/pipedrive.svg",
    name: "Pipedrive",
    provider: pipedriveProvider,
    realIntegration: true,
    setupHref: "/settings/integrations/pipedrive",
    showWhenMissing: true,
  },
  {
    categoryLabel: "CRM automation",
    capabilities: spruceZapierCapabilities,
    description: "Inbound Spruce job and document events delivered by Zapier.",
    hasEnvironmentConfig: hasSpruceZapierEnvironmentConfig,
    hasStoredCredentials: hasStoredSpruceZapierCredentials,
    iconSrc: "/images/integration/spruce-zapier.svg",
    name: "Spruce via Zapier",
    provider: spruceProvider,
    realIntegration: true,
    setupHref: "/settings/integrations/spruce",
    showWhenMissing: true,
  },
  {
    categoryLabel: "Documents",
    capabilities: docusignCapabilities,
    description: "Electronic signature envelopes for CRM documents.",
    hasStoredCredentials: hasStoredDocuSignCredentials,
    iconSrc: "/images/integration/docusign.svg",
    name: "DocuSign",
    provider: docusignProvider,
    realIntegration: true,
    setupHref: "/settings/integrations/docusign",
    showWhenMissing: true,
  },
  {
    categoryLabel: "Internal",
    capabilities: id30AuthCapabilities,
    description: "Central OAuth broker for marketing provider connections.",
    hasEnvironmentConfig: hasId30AuthEnvironmentConfig,
    hasStoredCredentials: hasStoredId30AuthCredentials,
    iconSrc: "/images/integration/id30-auth.svg",
    internal: true,
    name: "iD30 Auth",
    provider: id30AuthProvider,
    realIntegration: true,
    setupHref: "/settings/integrations/id30-auth",
    showWhenMissing: true,
  },
  {
    categoryLabel: "Planned",
    description: "Connect SMTP, Microsoft 365 or Gmail later.",
    iconSrc: "/images/integration/google-drive.svg",
    name: "Email provider",
    provider: "email-provider",
    realIntegration: false,
    setupHref: "/settings/integrations/email-provider",
  },
  {
    categoryLabel: "Planned",
    description: "Synchronise meetings and reminders later.",
    iconSrc: "/images/integration/calendar.svg",
    name: "Calendar",
    provider: "calendar",
    realIntegration: false,
    setupHref: "/settings/integrations/calendar",
  },
  {
    categoryLabel: "Planned",
    description: "Connect Stripe or alternative payment providers later.",
    iconSrc: "/images/payment-gateway/mastercard.png",
    name: "Payments",
    provider: "payments",
    realIntegration: false,
    setupHref: "/settings/integrations/payments",
  },
  {
    categoryLabel: "Planned",
    description: "Connect Shopify, WooCommerce or custom stores later.",
    iconSrc: "/images/brand/brand-05.svg",
    name: "Ecommerce",
    provider: "ecommerce",
    realIntegration: false,
    setupHref: "/settings/integrations/ecommerce",
  },
  {
    categoryLabel: "Planned",
    description: "Expose CRM events to external systems later.",
    iconSrc: "/images/integration/github.svg",
    name: "Webhooks / API",
    provider: "webhooks-api",
    realIntegration: false,
    setupHref: "/settings/integrations/webhooks-api",
  },
];

const hiddenSystemIntegrationProviders = new Set(["accounting"]);

function capability({
  detail,
  label,
  optional = false,
  status,
}: SystemIntegrationCapability): SystemIntegrationCapability {
  return {
    detail,
    label,
    optional,
    status,
  };
}

function hostLabel(value?: string | null) {
  if (!value) return "";

  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}

function sourceLabel(source: SystemIntegrationCredentialSource) {
  if (source === "database") return "database";
  if (source === "environment") return "environment";

  return "configuration";
}

function cloudflareR2Capabilities({
  config,
  hasStoredCredentials,
}: SystemIntegrationCapabilityInput) {
  const parsed = r2StoredConfigSchema.safeParse(config ?? {});
  const storedConfig = parsed.success ? parsed.data : null;
  const storageReady = Boolean(
    storedConfig?.accountId && storedConfig.bucketName && hasStoredCredentials,
  );

  return [
    capability({
      detail: storageReady
        ? `${storedConfig?.bucketName} bucket is ready for CRM file storage.`
        : "Add the account ID, bucket name and access keys.",
      label: "Storage API",
      status: storageReady ? "ready" : "missing",
    }),
    capability({
      detail: storedConfig?.publicBaseUrl
        ? `${hostLabel(storedConfig.publicBaseUrl)} is configured for public delivery.`
        : "Optional public base URL is not set.",
      label: "Public delivery",
      optional: true,
      status: storedConfig?.publicBaseUrl ? "ready" : "warning",
    }),
  ];
}

function twilioCapabilities({
  config,
  hasStoredCredentials,
}: SystemIntegrationCapabilityInput) {
  const parsed = twilioStoredConfigSchema.safeParse(config ?? {});
  const storedConfig = parsed.success ? parsed.data : null;
  const enabledCapabilities = storedConfig?.capabilities ?? [
    "voice",
    "sms",
    "whatsapp",
  ];
  const accountReady = Boolean(
    storedConfig?.accountSid && hasStoredCredentials,
  );
  const voiceEnabled = enabledCapabilities.includes("voice");
  const messagingEnabled =
    enabledCapabilities.includes("sms") ||
    enabledCapabilities.includes("whatsapp");
  const voiceReady = Boolean(
    accountReady && storedConfig?.twimlAppSid && storedConfig.voiceCallerId,
  );
  const messagingReady = Boolean(
    accountReady &&
    (storedConfig?.messagingServiceSid ||
      storedConfig?.smsFromNumber ||
      storedConfig?.whatsappFromNumber),
  );

  return [
    capability({
      detail: accountReady
        ? "Account SID and Auth Token are saved."
        : "Save Account SID and Auth Token.",
      label: "Account API",
      status: accountReady ? "ready" : "missing",
    }),
    capability({
      detail: voiceEnabled
        ? voiceReady
          ? "Voice app and caller ID are configured."
          : "Add TwiML App SID and voice caller ID."
        : "Voice capability is disabled.",
      label: "Voice",
      optional: !voiceEnabled,
      status: voiceEnabled ? (voiceReady ? "ready" : "missing") : "warning",
    }),
    capability({
      detail: messagingEnabled
        ? messagingReady
          ? "Messaging sender is configured."
          : "Add a messaging service or sender number."
        : "SMS and WhatsApp capabilities are disabled.",
      label: "Messaging",
      optional: !messagingEnabled,
      status: messagingEnabled
        ? messagingReady
          ? "ready"
          : "missing"
        : "warning",
    }),
    capability({
      detail: storedConfig?.webhookBaseUrl
        ? `${hostLabel(storedConfig.webhookBaseUrl)} is configured for callbacks.`
        : "Optional webhook base URL is not set.",
      label: "Webhooks",
      optional: true,
      status: storedConfig?.webhookBaseUrl ? "ready" : "warning",
    }),
  ];
}

function mailerSendCapabilities({ config }: SystemIntegrationCapabilityInput) {
  const parsed = mailerSendStoredConfigSchema.safeParse(config ?? {});
  const storedConfig = parsed.success ? parsed.data : null;
  const outboundReady = Boolean(
    storedConfig?.credentials?.apiToken && storedConfig.fromEmail,
  );
  const inboundReady = Boolean(
    storedConfig?.credentials?.inboundSecret &&
    mailerSendInboundReplyAddress(storedConfig),
  );
  const dnsReady = Boolean(
    storedConfig?.spfVerified &&
    storedConfig.dkimVerified &&
    storedConfig.returnPathVerified,
  );

  return [
    capability({
      detail: outboundReady
        ? `${storedConfig?.fromEmail} is ready for transactional email.`
        : "Save an API token and verified sender email.",
      label: "Outbound email",
      status: outboundReady ? "ready" : "missing",
    }),
    capability({
      detail: inboundReady
        ? `${mailerSendInboundReplyAddress(storedConfig)} is ready for inbound replies.`
        : "Save an inbound secret, inbound domain and catch recipient.",
      label: "Inbound routing",
      status: inboundReady ? "ready" : "missing",
    }),
    capability({
      detail: dnsReady
        ? "SPF, DKIM and return-path checks are verified."
        : "Refresh domain validation after DNS setup.",
      label: "Domain DNS",
      optional: true,
      status: dnsReady ? "ready" : "warning",
    }),
  ];
}

function openAICapabilities({
  config,
  credentialSource,
}: SystemIntegrationCapabilityInput) {
  const parsed = openaiStoredConfigSchema.safeParse(config ?? {});
  const storedConfig = parsed.success ? parsed.data : null;
  const runtimeReady =
    credentialSource === "database" || credentialSource === "environment";
  const sidekickModel =
    storedConfig?.sidekickModel ||
    process.env.OPENAI_MODEL ||
    defaultOpenAIModel;
  const callAnalysisModel =
    storedConfig?.callAnalysisModel ||
    process.env.OPENAI_MODEL ||
    defaultOpenAIModel;

  return [
    capability({
      detail: runtimeReady
        ? `API key loaded from ${sourceLabel(credentialSource)}.`
        : "Save an API key or set OPENAI_API_KEY.",
      label: "API key",
      status: runtimeReady ? "ready" : "missing",
    }),
    capability({
      detail: runtimeReady
        ? `Sidekick ${sidekickModel}; call analysis ${callAnalysisModel}.`
        : "Model routing is waiting for API credentials.",
      label: "Model routing",
      status: runtimeReady ? "ready" : "missing",
    }),
  ];
}

function geoapifyCapabilities({
  config,
  credentialSource,
}: SystemIntegrationCapabilityInput) {
  const parsed = geoapifyStoredConfigSchema.safeParse(config ?? {});
  const storedConfig = parsed.success ? parsed.data : null;
  const runtimeReady =
    credentialSource === "database" || credentialSource === "environment";

  return [
    capability({
      detail: runtimeReady
        ? `API key loaded from ${sourceLabel(credentialSource)}.`
        : "Save a Geoapify API key.",
      label: "Address lookup API",
      status: runtimeReady ? "ready" : "missing",
    }),
    capability({
      detail: storedConfig?.countryFilter
        ? `Suggestions are filtered to ${storedConfig.countryFilter}.`
        : "Lookup falls back to the workspace country.",
      label: "Search scope",
      optional: true,
      status: storedConfig?.countryFilter ? "ready" : "warning",
    }),
  ];
}

function pipedriveCapabilities({
  config,
  credentialSource,
}: SystemIntegrationCapabilityInput) {
  const parsed = pipedriveStoredConfigSchema.safeParse(config ?? {});
  const storedConfig = parsed.success ? parsed.data : null;
  const runtimeReady =
    credentialSource === "database" || credentialSource === "environment";
  const apiBaseUrl = storedConfig?.apiBaseUrl ?? defaultPipedriveApiBaseUrl;

  return [
    capability({
      detail: runtimeReady
        ? `API token loaded from ${sourceLabel(credentialSource)}.`
        : "Save a Pipedrive API token.",
      label: "Lead API",
      status: runtimeReady ? "ready" : "missing",
    }),
    capability({
      detail: `${hostLabel(apiBaseUrl)} is configured for API requests.`,
      label: "API base URL",
      status: "ready",
    }),
    capability({
      detail: "Lead import jobs will be enabled in the sync phase.",
      label: "Lead import",
      optional: true,
      status: "warning",
    }),
  ];
}

function spruceZapierCapabilities({
  config,
  credentialSource,
}: SystemIntegrationCapabilityInput) {
  const parsed = spruceZapierStoredConfigSchema.safeParse(config ?? {});
  const storedConfig = parsed.success ? parsed.data : null;
  const runtimeReady =
    credentialSource === "database" || credentialSource === "environment";

  return [
    capability({
      detail: runtimeReady
        ? `Receiver secret loaded from ${sourceLabel(credentialSource)}.`
        : "Save a webhook secret before connecting Zapier.",
      label: "Inbound receiver",
      status: runtimeReady ? "ready" : "missing",
    }),
    capability({
      detail: `${spruceWebhookReceiverPath} accepts authenticated Zapier webhook POSTs.`,
      label: "Receiver URL",
      status: "ready",
    }),
    capability({
      detail:
        "Spruce events are captured first; CRM sale mapping is enabled only after payload approval.",
      label: "CRM mapping",
      optional: true,
      status: "warning",
    }),
    capability({
      detail: "The CRM does not send data back to Spruce or Zapier.",
      label: "Write-back",
      optional: true,
      status: "ready",
    }),
    capability({
      detail: `Default lead source will be ${storedConfig?.defaultLeadSource ?? "Spruce"}.`,
      label: "Lead source",
      optional: true,
      status: "ready",
    }),
  ];
}

function docusignCapabilities({
  config,
  hasStoredCredentials,
}: SystemIntegrationCapabilityInput) {
  const parsed = docusignStoredConfigSchema.safeParse(config ?? {});
  const storedConfig = parsed.success ? parsed.data : null;
  const accountReady = Boolean(storedConfig?.accountId && hasStoredCredentials);
  const webhookReady = Boolean(storedConfig?.webhookBaseUrl);

  return [
    capability({
      detail: accountReady
        ? `${storedConfig?.environment === "production" ? "Production" : "Demo"} account ${storedConfig?.accountId} is ready.`
        : "Save the account ID, JWT credentials and Connect HMAC secret.",
      label: "Signing API",
      status: accountReady ? "ready" : "missing",
    }),
    capability({
      detail: webhookReady
        ? `${hostLabel(storedConfig?.webhookBaseUrl)} is configured for Connect callbacks.`
        : "Add a public CRM base URL for DocuSign Connect callbacks.",
      label: "Connect webhook",
      status: webhookReady ? "ready" : "missing",
    }),
  ];
}

function id30AuthCapabilities({
  config,
  credentialSource,
}: SystemIntegrationCapabilityInput) {
  const parsed = id30AuthConfigSchema.safeParse(config ?? {});
  const savedConfig = parsed.success ? parsed.data : null;
  const envConfig = getEnvId30AuthRuntimeConfig();
  const runtimeConfig =
    credentialSource === "environment"
      ? envConfig
      : credentialSource === "database" && savedConfig
        ? savedConfig
        : null;
  const clientReady = Boolean(
    runtimeConfig?.crmClientId && runtimeConfig.workspaceId,
  );
  const brokerReady = Boolean(runtimeConfig?.baseUrl);
  const secretReady =
    credentialSource === "database" || credentialSource === "environment";

  return [
    capability({
      detail: brokerReady
        ? `${hostLabel(runtimeConfig?.baseUrl)} is configured.`
        : "Add the iD30 Auth base URL.",
      label: "Broker URL",
      status: brokerReady ? "ready" : "missing",
    }),
    capability({
      detail: clientReady
        ? "CRM client and workspace IDs are configured."
        : "Add the CRM client ID and workspace ID.",
      label: "CRM identity",
      status: clientReady ? "ready" : "missing",
    }),
    capability({
      detail: secretReady
        ? `Shared secret is loaded from ${sourceLabel(credentialSource)}.`
        : "Save or configure a 32+ character shared secret.",
      label: "Shared secret",
      status: secretReady ? "ready" : "missing",
    }),
  ];
}

function integrationReadiness({
  baseStatus,
  capabilities,
  credentialSource,
  realIntegration,
}: {
  baseStatus: SystemIntegrationConnection["status"];
  capabilities: SystemIntegrationCapability[];
  credentialSource: SystemIntegrationCredentialSource;
  realIntegration: boolean;
}): SystemIntegrationReadiness {
  if (baseStatus === "ERROR") return "error";
  if (!realIntegration || credentialSource === "placeholder")
    return "placeholder";

  const requiredCapabilities = capabilities.filter(
    (capabilityItem) => !capabilityItem.optional,
  );

  if (requiredCapabilities.length === 0) {
    return credentialSource === "database" || credentialSource === "environment"
      ? "connected"
      : "missing";
  }

  const readyCount = requiredCapabilities.filter(
    (capabilityItem) => capabilityItem.status === "ready",
  ).length;

  if (readyCount === requiredCapabilities.length) return "connected";
  if (
    readyCount > 0 ||
    credentialSource === "database" ||
    credentialSource === "environment"
  ) {
    return "partial";
  }

  return "missing";
}

export function systemIntegrationDefinition(provider: string) {
  return systemIntegrationDefinitions.find(
    (definition) => definition.provider === provider,
  );
}

export function systemIntegrationDefinitionMap() {
  return new Map(
    systemIntegrationDefinitions.map((definition) => [
      definition.provider,
      definition,
    ]),
  );
}

export function isHiddenSystemIntegration(provider: string) {
  return hiddenSystemIntegrationProviders.has(provider);
}

function fallbackConnection(
  definition: SystemIntegrationDefinition,
): SystemIntegrationConnection {
  return {
    config: null,
    createdAt: new Date(0),
    description: definition.description,
    id: definition.provider,
    name: definition.name,
    provider: definition.provider,
    status: "NOT_CONNECTED",
    updatedAt: new Date(0),
  };
}

export function systemIntegrationRows({
  connections,
  latestHealthSnapshots,
  marketingProviderKeys,
}: {
  connections: SystemIntegrationConnection[];
  latestHealthSnapshots?: ReadonlyMap<string, LatestIntegrationHealthSnapshot>;
  marketingProviderKeys: Iterable<string>;
}) {
  const marketingProviderSet = new Set(marketingProviderKeys);
  const definitionMap = systemIntegrationDefinitionMap();
  const connectionMap = new Map(
    connections.map((connection) => [connection.provider, connection]),
  );
  const providers = new Set<string>();

  for (const definition of systemIntegrationDefinitions) {
    if (definition.visibleInOverview === false) continue;
    if (definition.showWhenMissing || connectionMap.has(definition.provider)) {
      providers.add(definition.provider);
    }
  }

  for (const connection of connections) {
    if (marketingProviderSet.has(connection.provider)) continue;
    if (isHiddenSystemIntegration(connection.provider)) continue;
    providers.add(connection.provider);
  }

  return [...providers].flatMap<SystemIntegrationRow>((provider) => {
    const definition = definitionMap.get(provider);
    const connection = connectionMap.get(provider);

    if (!definition && !connection) return [];

    const baseConnection = connection ?? fallbackConnection(definition!);
    const hasStoredCredentials = Boolean(
      definition?.hasStoredCredentials?.(baseConnection.config),
    );
    const hasEnvironmentConfig = Boolean(definition?.hasEnvironmentConfig?.());
    const credentialSource: SystemIntegrationCredentialSource =
      hasStoredCredentials
        ? "database"
        : hasEnvironmentConfig
          ? "environment"
          : definition?.realIntegration === false
            ? "placeholder"
            : "missing";
    const capabilities =
      definition?.capabilities?.({
        config: baseConnection.config,
        credentialSource,
        hasEnvironmentConfig,
        hasStoredCredentials,
      }) ?? [];
    const readinessStatus = integrationReadiness({
      baseStatus: baseConnection.status,
      capabilities,
      credentialSource,
      realIntegration: definition?.realIntegration ?? false,
    });
    const effectiveStatus =
      baseConnection.status === "ERROR"
        ? "ERROR"
        : readinessStatus === "connected" || readinessStatus === "partial"
          ? "CONNECTED"
          : baseConnection.status;

    return [
      {
        ...baseConnection,
        categoryLabel: definition?.categoryLabel ?? "Custom",
        credentialSource,
        description:
          baseConnection.description || definition?.description || "",
        hasEnvironmentConfig,
        hasStoredCredentials,
        iconSrc: definition?.iconSrc ?? "/images/integration/github.svg",
        internal: Boolean(definition?.internal),
        name: baseConnection.name || definition?.name || provider,
        realIntegration: definition?.realIntegration ?? false,
        readinessStatus,
        capabilities,
        latestHealthSnapshot: latestHealthSnapshots?.get(provider) ?? null,
        setupHref:
          definition?.setupHref ?? `/settings/integrations/${provider}`,
        status: effectiveStatus,
      },
    ];
  });
}
