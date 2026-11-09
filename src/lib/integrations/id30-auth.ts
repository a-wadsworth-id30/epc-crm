import "server-only";

import { z } from "zod";
import { decryptSecret } from "@/lib/crypto/secrets";
import { id30AuthIdentifierSchema } from "@/lib/integrations/id30-auth-identifiers";
import { prisma } from "@/lib/prisma";

export { id30AuthIdentifierSchema } from "@/lib/integrations/id30-auth-identifiers";

export const id30AuthProvider = "id30-auth";

export const id30AuthConfigSchema = z
  .object({
    baseUrl: z
      .string()
      .trim()
      .url("Enter the iD30 Auth URL.")
      .transform((value) => value.replace(/\/+$/, "")),
    crmClientId: id30AuthIdentifierSchema,
    workspaceId: id30AuthIdentifierSchema,
    connectedAt: z.string().datetime().optional(),
    lastSavedAt: z.string().datetime().optional(),
    previousSecretExpiresAt: z.string().datetime().optional(),
    source: z.enum(["manual", "setup-code", "bootstrap", "env"]).optional(),
    credentials: z
      .object({
        sharedSecret: z.string().trim().min(1).optional(),
        previousSharedSecret: z.string().trim().min(1).optional(),
      })
      .optional(),
  })
  .passthrough();

export type Id30AuthConfig = z.infer<typeof id30AuthConfigSchema>;

export type PublicId30AuthConfig = Omit<Id30AuthConfig, "credentials">;

export type Id30AuthRuntimeConfig = {
  baseUrl: string;
  crmClientId: string;
  source: "database" | "environment";
  sharedSecret: string;
  verificationSecrets: string[];
  workspaceId: string;
};

export function hasStoredId30AuthCredentials(config: unknown) {
  const parsed = id30AuthConfigSchema.safeParse(config ?? {});

  return Boolean(parsed.success && parsed.data.credentials?.sharedSecret);
}

export function publicId30AuthConfig(config: unknown): PublicId30AuthConfig {
  const parsed = id30AuthConfigSchema.safeParse(config ?? {});

  if (!parsed.success) {
    return {
      baseUrl: process.env.ID30_AUTH_BASE_URL || "https://auth.id30.com",
      crmClientId: "",
      workspaceId: "",
    };
  }

  const publicConfig = { ...parsed.data };
  delete publicConfig.credentials;

  return publicConfig;
}

export function getEnvId30AuthRuntimeConfig(): Id30AuthRuntimeConfig | null {
  const baseUrl = process.env.ID30_AUTH_BASE_URL?.trim().replace(/\/+$/, "");
  const crmClientId = process.env.ID30_AUTH_CRM_CLIENT_ID?.trim();
  const workspaceId =
    process.env.ID30_AUTH_WORKSPACE_ID?.trim() || process.env.ID30_AUTH_CRM_CLIENT_ID?.trim();
  const sharedSecret = process.env.ID30_AUTH_SHARED_SECRET?.trim();
  const previousSecret = process.env.ID30_AUTH_PREVIOUS_SHARED_SECRET?.trim();
  const previousExpiresAt = Date.parse(
    process.env.ID30_AUTH_PREVIOUS_SHARED_SECRET_EXPIRES_AT || "",
  );

  if (!baseUrl || !crmClientId || !workspaceId || !sharedSecret || sharedSecret.length < 32) {
    return null;
  }

  const parsed = id30AuthConfigSchema.safeParse({
    baseUrl,
    crmClientId,
    credentials: { sharedSecret },
    workspaceId,
  });

  if (!parsed.success) {
    return null;
  }

  return {
    baseUrl: parsed.data.baseUrl,
    crmClientId: parsed.data.crmClientId,
    sharedSecret,
    verificationSecrets: [
      sharedSecret,
      ...(previousSecret &&
      previousSecret.length >= 32 &&
      Number.isFinite(previousExpiresAt) &&
      previousExpiresAt > Date.now()
        ? [previousSecret]
        : []),
    ],
    source: "environment",
    workspaceId: parsed.data.workspaceId,
  };
}

export async function getSavedId30AuthRuntimeConfig(): Promise<Id30AuthRuntimeConfig | null> {
  const connection = await prisma.integrationConnection.findUnique({
    where: { provider: id30AuthProvider },
    select: {
      config: true,
      status: true,
    },
  });

  if (!connection || connection.status !== "CONNECTED") return null;

  const parsed = id30AuthConfigSchema.safeParse(connection.config ?? {});
  if (!parsed.success) return null;

  const encryptedSecret = parsed.data.credentials?.sharedSecret;
  if (!encryptedSecret) return null;

  let sharedSecret: string;

  try {
    sharedSecret = decryptSecret(encryptedSecret);
  } catch {
    return null;
  }

  const encryptedPreviousSecret =
    parsed.data.credentials?.previousSharedSecret;
  const previousExpiresAt = Date.parse(
    parsed.data.previousSecretExpiresAt ?? "",
  );
  let previousSharedSecret: string | null = null;
  if (
    encryptedPreviousSecret &&
    Number.isFinite(previousExpiresAt) &&
    previousExpiresAt > Date.now()
  ) {
    try {
      previousSharedSecret = decryptSecret(encryptedPreviousSecret);
    } catch {
      previousSharedSecret = null;
    }
  }

  return {
    baseUrl: parsed.data.baseUrl,
    crmClientId: parsed.data.crmClientId,
    sharedSecret,
    verificationSecrets: [
      sharedSecret,
      ...(previousSharedSecret && previousSharedSecret !== sharedSecret
        ? [previousSharedSecret]
        : []),
    ],
    source: "database",
    workspaceId: parsed.data.workspaceId,
  };
}

export async function getId30AuthRuntimeConfig() {
  return (await getSavedId30AuthRuntimeConfig()) ?? getEnvId30AuthRuntimeConfig();
}
