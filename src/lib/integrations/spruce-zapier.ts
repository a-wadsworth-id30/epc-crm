import "server-only";

import { z } from "zod";
import { decryptSecret } from "@/lib/crypto/secrets";
import { prisma } from "@/lib/prisma";

export const spruceProvider = "spruce";
export const spruceZapierName = "Spruce via Zapier";
export const spruceZapierDescription =
  "Inbound Spruce job and document events delivered to the CRM by Zapier.";
export const spruceWebhookReceiverPath = "/api/webhooks/spruce";
export const defaultSpruceLeadSource = "Spruce";

const spruceLeadSourceSchema = z
  .preprocess(
    (value) => (typeof value === "string" ? value : ""),
    z.string().trim().max(80, "Keep the lead source under 80 characters."),
  )
  .transform((value) => value || defaultSpruceLeadSource);

const spruceStoredCredentialsSchema = z.object({
  savedAt: z.string().datetime().optional(),
  webhookSecret: z.string().min(1),
});

export const spruceZapierConfigSchema = z.object({
  defaultLeadSource: spruceLeadSourceSchema,
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
  return Boolean(
    process.env.SPRUCE_WEBHOOK_SECRET?.trim() ||
      process.env.ZAPIER_SPRUCE_WEBHOOK_SECRET?.trim(),
  );
}

export function hasStoredSpruceZapierCredentials(config: unknown) {
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
  let webhookSecret: string | null = null;

  if (config?.credentials?.webhookSecret) {
    try {
      webhookSecret = decryptSecret(config.credentials.webhookSecret);
    } catch (error) {
      console.error("Unable to decrypt Spruce/Zapier webhook secret", error);
    }
  }

  return {
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
