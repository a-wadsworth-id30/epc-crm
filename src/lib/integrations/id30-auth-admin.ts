import "server-only";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import {
  encryptSecret,
  hasCredentialEncryptionKey,
} from "@/lib/crypto/secrets";
import {
  id30AuthConfigSchema,
  id30AuthProvider,
} from "@/lib/integrations/id30-auth";
import { recordIntegrationSetupHealth } from "@/lib/integrations/health-snapshots";
import { prisma } from "@/lib/prisma";

type Id30AuthSetupSource = "manual" | "setup-code" | "bootstrap";

export type Id30AuthSaveResult = {
  connected: boolean;
  message: string;
  ok: boolean;
  savedAt: number | null;
};

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function marketingConfigJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function normaliseAuthBaseUrl(value: string) {
  const url = new URL(value.trim());

  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("iD30 Auth URL must use HTTPS.");
  }

  return url.origin + url.pathname.replace(/\/+$/, "");
}

function existingEncryptedSecret(config: unknown) {
  const parsed = id30AuthConfigSchema.safeParse(config ?? {});

  return parsed.success ? stringValue(parsed.data.credentials?.sharedSecret) : null;
}

export function revalidateId30AuthIntegrationPages() {
  revalidatePath("/settings/integrations");
  revalidatePath("/settings/integrations/id30-auth");
  revalidatePath("/settings/integrations/google-ads");
  revalidatePath("/settings/integrations/bing-ads");
  revalidatePath("/settings/integrations/meta");
  revalidatePath("/settings/integrations/linkedin-ads");
}

export async function saveId30AuthIntegrationConfig({
  baseUrl,
  crmClientId,
  sharedSecret,
  source,
  workspaceId,
}: {
  baseUrl: string;
  crmClientId: string;
  sharedSecret?: string | null;
  source: Id30AuthSetupSource;
  workspaceId?: string | null;
}): Promise<Id30AuthSaveResult> {
  const existing = await prisma.integrationConnection.findUnique({
    where: { provider: id30AuthProvider },
    select: { config: true },
  });
  const existingSecret = existingEncryptedSecret(existing?.config);

  if ((sharedSecret || !existingSecret) && !hasCredentialEncryptionKey()) {
    return {
      connected: false,
      message: "Set CREDENTIAL_ENCRYPTION_KEY before saving iD30 Auth details.",
      ok: false,
      savedAt: null,
    };
  }

  if (!sharedSecret && !existingSecret) {
    return {
      connected: false,
      message: "Add the shared secret or complete the iD30 Auth bootstrap.",
      ok: false,
      savedAt: null,
    };
  }

  let parsedConfig: Record<string, unknown>;

  try {
    const parsed = id30AuthConfigSchema.safeParse({
      baseUrl: normaliseAuthBaseUrl(baseUrl),
      crmClientId,
      workspaceId: workspaceId || crmClientId,
      connectedAt:
        stringValue(jsonObject(existing?.config).connectedAt) ?? new Date().toISOString(),
      lastSavedAt: new Date().toISOString(),
      source,
      credentials: {
        sharedSecret: sharedSecret
          ? encryptSecret(sharedSecret)
          : existingSecret,
      },
    });

    if (!parsed.success) {
      return {
        connected: false,
        message:
          parsed.error.issues[0]?.message ?? "iD30 Auth setup details are invalid.",
        ok: false,
        savedAt: null,
      };
    }

    parsedConfig = parsed.data;
  } catch (error) {
    return {
      connected: false,
      message:
        error instanceof Error
          ? error.message
          : "iD30 Auth setup details are invalid.",
      ok: false,
      savedAt: null,
    };
  }

  const savedConnection = await prisma.integrationConnection.upsert({
    where: { provider: id30AuthProvider },
    update: {
      description:
        "Central OAuth broker for marketing provider connections.",
      name: "iD30 Auth",
      status: "CONNECTED",
      config: marketingConfigJson(parsedConfig),
    },
    create: {
      provider: id30AuthProvider,
      description:
        "Central OAuth broker for marketing provider connections.",
      name: "iD30 Auth",
      status: "CONNECTED",
      config: marketingConfigJson(parsedConfig),
    },
  });
  await recordIntegrationSetupHealth({
    connected: true,
    integrationId: savedConnection.id,
    message: "iD30 Auth broker settings saved.",
    metadata: {
      baseUrl: stringValue(parsedConfig.baseUrl) ?? "",
      source: stringValue(parsedConfig.source) ?? source,
    },
    provider: id30AuthProvider,
  });

  revalidateId30AuthIntegrationPages();

  return {
    connected: true,
    message: "iD30 Auth connected. Marketing provider logins can now use Auth.",
    ok: true,
    savedAt: Date.now(),
  };
}
