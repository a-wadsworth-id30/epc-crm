import "server-only";

import { z } from "zod";
import { decryptSecret } from "@/lib/crypto/secrets";
import { prisma } from "@/lib/prisma";

export const geoapifyProvider = "geoapify";
export const defaultGeoapifyLanguage = "en";

const countryFilterSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^$|^[A-Z]{2}$/, "Use a 2-letter ISO country code or leave blank.");

const languageSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => value || defaultGeoapifyLanguage)
  .refine((value) => /^[a-z]{2}$/.test(value), "Use a 2-letter language code.")
  .optional()
  .default(defaultGeoapifyLanguage);

export const geoapifyConfigSchema = z.object({
  countryFilter: countryFilterSchema.optional().default(""),
  language: languageSchema,
});

const geoapifyStoredCredentialsSchema = z.object({
  apiKey: z.string().min(1),
  savedAt: z.string().datetime().optional(),
});

export const geoapifyStoredConfigSchema = geoapifyConfigSchema.extend({
  credentials: geoapifyStoredCredentialsSchema.optional(),
});

export type GeoapifyConfig = z.infer<typeof geoapifyConfigSchema>;
export type GeoapifyStoredConfig = z.infer<typeof geoapifyStoredConfigSchema>;

export function hasGeoapifyEnvironmentConfig() {
  return Boolean(process.env.GEOAPIFY_API_KEY?.trim());
}

export function hasStoredGeoapifyCredentials(config: unknown) {
  const parsed = geoapifyStoredConfigSchema.safeParse(config ?? {});
  return Boolean(parsed.success && parsed.data.credentials?.apiKey);
}

export async function isGeoapifyAddressLookupEnabled() {
  const connection = await prisma.integrationConnection.findUnique({
    where: { provider: geoapifyProvider },
    select: { config: true },
  });

  return (
    hasStoredGeoapifyCredentials(connection?.config) ||
    hasGeoapifyEnvironmentConfig()
  );
}

export async function getGeoapifyRuntimeConfig({
  workspaceCountry,
}: {
  workspaceCountry?: string | null;
} = {}) {
  const integration = await prisma.integrationConnection.findUnique({
    where: { provider: geoapifyProvider },
    select: { config: true },
  });
  const parsed = geoapifyStoredConfigSchema.safeParse(integration?.config ?? {});
  const config = parsed.success ? parsed.data : null;
  let apiKey: string | null = null;

  if (config?.credentials?.apiKey) {
    try {
      apiKey = decryptSecret(config.credentials.apiKey);
    } catch (error) {
      console.error("Unable to decrypt Geoapify API key", error);
    }
  }

  return {
    apiKey: apiKey ?? process.env.GEOAPIFY_API_KEY?.trim() ?? null,
    countryFilter:
      config?.countryFilter ||
      process.env.GEOAPIFY_COUNTRY_FILTER?.trim().toUpperCase() ||
      workspaceCountry?.trim().toUpperCase() ||
      null,
    language:
      config?.language ||
      process.env.GEOAPIFY_LANGUAGE?.trim().toLowerCase() ||
      defaultGeoapifyLanguage,
  };
}
