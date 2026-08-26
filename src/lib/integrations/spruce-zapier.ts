import "server-only";

import { z } from "zod";
import { decryptSecret } from "@/lib/crypto/secrets";
import { prisma } from "@/lib/prisma";

export const spruceProvider = "spruce";
export const spruceZapierName = "Spruce";
export const spruceZapierDescription =
  "Inbound Spruce job events and manual CRM sale sends via direct API.";
export const spruceWebhookReceiverPath = "/api/webhooks/spruce";
export const spruceApiBaseUrl = "https://api.spruce.eco";
export const defaultSpruceLeadSource = "Spruce";

const spruceLeadSourceSchema = z
  .preprocess(
    (value) => (typeof value === "string" ? value : ""),
    z.string().trim().max(80, "Keep the lead source under 80 characters."),
  )
  .transform((value) => value || defaultSpruceLeadSource);

const spruceStoredCredentialsSchema = z.object({
  apiKey: z.string().min(1).optional(),
  savedAt: z.string().datetime().optional(),
  webhookSecret: z.string().min(1).optional(),
});

export const spruceZapierConfigSchema = z.object({
  defaultLeadSource: spruceLeadSourceSchema,
});

export const spruceZapierSettingsFormSchema =
  spruceZapierConfigSchema.extend({
    apiKey: z
      .preprocess(
        (value) => (typeof value === "string" ? value.trim() : ""),
        z.string().max(500, "Keep the Spruce API key under 500 characters."),
      )
      .optional(),
  });

export const spruceZapierStoredConfigSchema =
  spruceZapierConfigSchema.extend({
    credentials: spruceStoredCredentialsSchema.optional(),
  });

export type SpruceZapierConfig = z.infer<typeof spruceZapierConfigSchema>;
export type SpruceZapierStoredConfig = z.infer<
  typeof spruceZapierStoredConfigSchema
>;

export function hasSpruceZapierEnvironmentConfig() {
  return (
    hasSpruceZapierInboundEnvironmentConfig() ||
    hasSpruceDirectApiEnvironmentConfig()
  );
}

export function hasSpruceZapierInboundEnvironmentConfig() {
  return Boolean(
    process.env.SPRUCE_WEBHOOK_SECRET?.trim() ||
      process.env.ZAPIER_SPRUCE_WEBHOOK_SECRET?.trim(),
  );
}

export function hasSpruceDirectApiEnvironmentConfig() {
  return Boolean(process.env.SPRUCE_API_KEY?.trim());
}

export function hasStoredSpruceZapierCredentials(config: unknown) {
  return (
    hasStoredSpruceDirectApiCredentials(config) ||
    hasStoredSpruceZapierInboundCredentials(config)
  );
}

export function hasStoredSpruceDirectApiCredentials(config: unknown) {
  const parsed = spruceZapierStoredConfigSchema.safeParse(config ?? {});

  return Boolean(parsed.success && parsed.data.credentials?.apiKey);
}

export function hasStoredSpruceZapierInboundCredentials(config: unknown) {
  const parsed = spruceZapierStoredConfigSchema.safeParse(config ?? {});

  return Boolean(parsed.success && parsed.data.credentials?.webhookSecret);
}

export async function getSpruceZapierRuntimeConfig() {
  const integration = await prisma.integrationConnection.findUnique({
    where: { provider: spruceProvider },
    select: { config: true },
  });
  const parsed = spruceZapierStoredConfigSchema.safeParse(
    integration?.config ?? {},
  );
  const config = parsed.success ? parsed.data : null;
  let apiKey: string | null = null;
  let webhookSecret: string | null = null;

  if (config?.credentials?.apiKey) {
    try {
      apiKey = decryptSecret(config.credentials.apiKey);
    } catch (error) {
      console.error("Unable to decrypt Spruce API key", error);
    }
  }

  if (config?.credentials?.webhookSecret) {
    try {
      webhookSecret = decryptSecret(config.credentials.webhookSecret);
    } catch (error) {
      console.error("Unable to decrypt Spruce/Zapier webhook secret", error);
    }
  }

  return {
    apiBaseUrl: spruceApiBaseUrl,
    apiKey: apiKey ?? process.env.SPRUCE_API_KEY?.trim() ?? null,
    defaultLeadSource:
      config?.defaultLeadSource ||
      process.env.SPRUCE_DEFAULT_LEAD_SOURCE?.trim() ||
      defaultSpruceLeadSource,
    webhookSecret:
      webhookSecret ??
      process.env.SPRUCE_WEBHOOK_SECRET?.trim() ??
      process.env.ZAPIER_SPRUCE_WEBHOOK_SECRET?.trim() ??
      null,
  };
}

export async function ensureSpruceZapierIntegrationConnection() {
  return prisma.integrationConnection.upsert({
    where: { provider: spruceProvider },
    update: {
      description: spruceZapierDescription,
      name: spruceZapierName,
    },
    create: {
      description: spruceZapierDescription,
      name: spruceZapierName,
      provider: spruceProvider,
      status: "NOT_CONNECTED",
    },
  });
}
