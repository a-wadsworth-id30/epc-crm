"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import {
  id30AuthProvider,
  id30AuthIdentifierSchema,
} from "@/lib/integrations/id30-auth";
import { hasId30AuthEnvironmentConfig } from "@/lib/integrations/system-services";
import {
  saveId30AuthIntegrationConfig,
} from "@/lib/integrations/id30-auth-admin";
import { recordIntegrationSetupHealth } from "@/lib/integrations/health-snapshots";
import { prisma } from "@/lib/prisma";

type Id30AuthActionState = {
  connected: boolean;
  message: string;
  ok: boolean;
  savedAt: number | null;
};

const setupCodeSchema = z.object({
  authBaseUrl: z.string().trim().url().optional(),
  baseUrl: z.string().trim().url().optional(),
  crmClientId: id30AuthIdentifierSchema,
  sharedSecret: z.string().trim().min(32),
  workspaceId: id30AuthIdentifierSchema.optional(),
});

function base64UrlDecode(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
}

function parseSetupCode(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const candidates = [
    trimmed,
    trimmed.startsWith("id30auth_v1.") ? trimmed.slice("id30auth_v1.".length) : null,
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      const decoded = candidate.startsWith("{")
        ? candidate
        : base64UrlDecode(candidate);
      const parsed = setupCodeSchema.safeParse(JSON.parse(decoded));

      if (parsed.success) {
        return parsed.data;
      }
    } catch {
      // Try the next supported format.
    }
  }

  throw new Error("Setup code is not valid. Generate a fresh code in iD30 Auth.");
}

function revalidateIntegrationPages() {
  revalidatePath("/settings/integrations");
  revalidatePath("/settings/integrations/id30-auth");
  revalidatePath("/settings/integrations/google-ads");
  revalidatePath("/settings/integrations/bing-ads");
  revalidatePath("/settings/integrations/meta");
  revalidatePath("/settings/integrations/linkedin-ads");
}

export async function updateId30AuthIntegrationAction(
  _: Id30AuthActionState,
  formData: FormData,
): Promise<Id30AuthActionState> {
  await requireAdmin();

  let setupCode: ReturnType<typeof parseSetupCode> = null;

  try {
    setupCode = parseSetupCode(String(formData.get("setupCode") ?? ""));
  } catch (error) {
    return {
      connected: false,
      message: error instanceof Error ? error.message : "Setup code is invalid.",
      ok: false,
      savedAt: null,
    };
  }

  const sharedSecret =
    setupCode?.sharedSecret ?? String(formData.get("sharedSecret") ?? "").trim();

  try {
    const crmClientId =
      setupCode?.crmClientId ?? String(formData.get("crmClientId") ?? "").trim();
    const workspaceId =
      setupCode?.workspaceId ?? String(formData.get("workspaceId") ?? "").trim();
    const result = await saveId30AuthIntegrationConfig({
      baseUrl:
        setupCode?.baseUrl ??
        setupCode?.authBaseUrl ??
        String(formData.get("baseUrl") ?? ""),
      crmClientId,
      sharedSecret,
      source: setupCode ? "setup-code" : "manual",
      workspaceId,
    });

    return result;
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
}

export async function disconnectId30AuthIntegrationAction(
  _: Id30AuthActionState,
  formData?: FormData,
): Promise<Id30AuthActionState> {
  void formData;
  await requireAdmin();

  await prisma.integrationConnection.updateMany({
    where: { provider: id30AuthProvider },
    data: {
      config: {
        disconnectedAt: new Date().toISOString(),
        source: "manual",
      },
      status: "NOT_CONNECTED",
    },
  });
  const existing = await prisma.integrationConnection.findUnique({
    where: { provider: id30AuthProvider },
    select: { id: true },
  });
  const message = hasId30AuthEnvironmentConfig()
    ? "Database broker details disconnected. Environment broker config is still active."
    : "iD30 Auth disconnected.";

  await recordIntegrationSetupHealth({
    connected: false,
    integrationId: existing?.id,
    message,
    provider: id30AuthProvider,
    source: "disconnect",
  });

  revalidateIntegrationPages();

  return {
    connected: false,
    message,
    ok: true,
    savedAt: Date.now(),
  };
}
