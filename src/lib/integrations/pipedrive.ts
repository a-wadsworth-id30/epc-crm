import "server-only";

import { z } from "zod";
import { decryptSecret } from "@/lib/crypto/secrets";
import { prisma } from "@/lib/prisma";

export const pipedriveProvider = "pipedrive";
export const defaultPipedriveApiBaseUrl = "https://api.pipedrive.com/v1";
export const defaultPipedriveLeadSource = "Pipedrive";

const pipedriveApiBaseUrlSchema = z
  .preprocess(
    (value) => (typeof value === "string" ? value : ""),
    z.string().trim(),
  )
  .transform((value) => value || defaultPipedriveApiBaseUrl)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:";
    } catch {
      return false;
    }
  }, "Enter a valid HTTPS Pipedrive API base URL.")
  .transform((value) => value.replace(/\/+$/, ""));

const pipedriveLeadSourceSchema = z
  .preprocess(
    (value) => (typeof value === "string" ? value : ""),
    z.string().trim().max(80, "Keep the lead source under 80 characters."),
  )
  .transform((value) => value || defaultPipedriveLeadSource);

export const pipedriveConfigSchema = z.object({
  apiBaseUrl: pipedriveApiBaseUrlSchema,
  defaultLeadSource: pipedriveLeadSourceSchema,
});

const pipedriveStoredCredentialsSchema = z.object({
  apiToken: z.string().min(1),
  savedAt: z.string().datetime().optional(),
});

export const pipedriveStoredConfigSchema = pipedriveConfigSchema.extend({
  credentials: pipedriveStoredCredentialsSchema.optional(),
  lastLeadSyncAt: z.string().datetime().optional(),
});

export type PipedriveConfig = z.infer<typeof pipedriveConfigSchema>;
export type PipedriveStoredConfig = z.infer<
  typeof pipedriveStoredConfigSchema
>;

export function hasPipedriveEnvironmentConfig() {
  return Boolean(process.env.PIPEDRIVE_API_TOKEN?.trim());
}

export function hasStoredPipedriveCredentials(config: unknown) {
  const parsed = pipedriveStoredConfigSchema.safeParse(config ?? {});
  return Boolean(parsed.success && parsed.data.credentials?.apiToken);
}

export async function getPipedriveRuntimeConfig() {
  const integration = await prisma.integrationConnection.findUnique({
    where: { provider: pipedriveProvider },
    select: { config: true },
  });
  const parsed = pipedriveStoredConfigSchema.safeParse(
    integration?.config ?? {},
  );
  const config = parsed.success ? parsed.data : null;
  const envBaseUrl = process.env.PIPEDRIVE_API_BASE_URL?.trim();
  const parsedEnvBaseUrl = envBaseUrl
    ? pipedriveApiBaseUrlSchema.safeParse(envBaseUrl)
    : null;
  let apiToken: string | null = null;

  if (config?.credentials?.apiToken) {
    try {
      apiToken = decryptSecret(config.credentials.apiToken);
    } catch (error) {
      console.error("Unable to decrypt Pipedrive API token", error);
    }
  }

  return {
    apiBaseUrl:
      config?.apiBaseUrl ||
      (parsedEnvBaseUrl?.success
        ? parsedEnvBaseUrl.data
        : defaultPipedriveApiBaseUrl),
    apiToken: apiToken ?? process.env.PIPEDRIVE_API_TOKEN?.trim() ?? null,
    defaultLeadSource:
      config?.defaultLeadSource || defaultPipedriveLeadSource,
    lastLeadSyncAt: config?.lastLeadSyncAt ?? null,
  };
}
