import "server-only";

import { z } from "zod";
import { decryptSecret } from "@/lib/crypto/secrets";
import { prisma } from "@/lib/prisma";

export const openaiProvider = "openai";
export const defaultOpenAIModel = "gpt-4.1-mini";

const modelNameSchema = z
  .string()
  .trim()
  .transform((value) => value || defaultOpenAIModel)
  .optional()
  .default(defaultOpenAIModel);

export const openaiConfigSchema = z.object({
  defaultModel: modelNameSchema,
  sidekickModel: modelNameSchema,
  callAnalysisModel: modelNameSchema,
});

const openaiStoredCredentialsSchema = z.object({
  apiKey: z.string().min(1),
  savedAt: z.string().datetime().optional(),
});

export const openaiStoredConfigSchema = openaiConfigSchema.extend({
  credentials: openaiStoredCredentialsSchema.optional(),
});

export type OpenAIConfig = z.infer<typeof openaiConfigSchema>;
export type OpenAIStoredConfig = z.infer<typeof openaiStoredConfigSchema>;

export function hasStoredOpenAICredentials(config: unknown) {
  const parsed = openaiStoredConfigSchema.safeParse(config ?? {});
  return Boolean(parsed.success && parsed.data.credentials?.apiKey);
}

export async function getOpenAIRuntimeConfig({
  modelField = "defaultModel",
  envModelKey = "OPENAI_MODEL",
}: {
  modelField?: "callAnalysisModel" | "defaultModel" | "sidekickModel";
  envModelKey?: string;
} = {}) {
  const integration = await prisma.integrationConnection.findUnique({
    where: { provider: openaiProvider },
    select: { config: true },
  });
  const parsed = openaiStoredConfigSchema.safeParse(integration?.config ?? {});
  const config = parsed.success ? parsed.data : null;
  let apiKey: string | null = null;

  if (config?.credentials?.apiKey) {
    try {
      apiKey = decryptSecret(config.credentials.apiKey);
    } catch (error) {
      console.error("Unable to decrypt OpenAI API key", error);
    }
  }

  return {
    apiKey: apiKey ?? process.env.OPENAI_API_KEY?.trim() ?? null,
    model:
      config?.[modelField] ??
      process.env[envModelKey] ??
      process.env.OPENAI_MODEL ??
      defaultOpenAIModel,
  };
}
