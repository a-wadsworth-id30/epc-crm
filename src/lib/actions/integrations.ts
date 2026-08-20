"use server";

import { IntegrationHealthSnapshotStatus, type Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import twilio from "twilio";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import {
  decryptSecret,
  encryptSecret,
  hasCredentialEncryptionKey,
} from "@/lib/crypto/secrets";
import {
  hasStoredTwilioCredentials,
  twilioConfigSchema,
  twilioProvider,
  twilioStoredConfigSchema,
  type TwilioConfig,
} from "@/lib/integrations/twilio";
import {
  hasStoredOpenAICredentials,
  openaiConfigSchema,
  openaiProvider,
  openaiStoredConfigSchema,
} from "@/lib/integrations/openai";
import {
  defaultPipedriveApiBaseUrl,
  defaultPipedriveLeadSource,
  getPipedriveReadOnlyClient,
  hasPipedriveEnvironmentConfig,
  hasStoredPipedriveCredentials,
  pipedriveConfigSchema,
  pipedriveProvider,
  pipedriveStoredConfigSchema,
} from "@/lib/integrations/pipedrive";
import {
  importPipedriveLeadIds,
  importPipedriveLeadPages,
  pipedriveImportablePreviewLeadIdsFromMetadata,
  pipedriveLeadImportMetadataRows,
  pipedriveLeadPreviewMetadataRows,
  previewPipedriveLeadPage,
} from "@/lib/integrations/pipedrive-import";
import {
  geoapifyConfigSchema,
  geoapifyProvider,
  geoapifyStoredConfigSchema,
  hasStoredGeoapifyCredentials,
} from "@/lib/integrations/geoapify";
import {
  docusignConfigSchema,
  docusignProvider,
  docusignStoredConfigSchema,
  hasStoredDocuSignCredentials,
} from "@/lib/integrations/docusign";
import {
  recordIntegrationHealthSnapshot,
  recordIntegrationSetupHealth,
} from "@/lib/integrations/health-snapshots";
import {
  hasStoredMailerSendCredentials,
  mailerSendProvider,
  mailerSendSettingsFormSchema,
  mailerSendStoredConfigSchema,
  refreshMailerSendDomainValidationConfig,
  type MailerSendStoredConfig,
} from "@/lib/integrations/mailersend";
import { normalizeCallableNumber } from "@/lib/integrations/twilio-server";
import { prisma } from "@/lib/prisma";
import {
  cloudflareR2Provider,
  hasStoredR2Credentials,
  r2StoredConfigSchema,
  r2ConfigSchema,
  r2ConnectionErrorMessage,
  verifyR2Connection,
} from "@/lib/storage/r2";
import { revalidateStorageSupportData } from "@/lib/storage/support-data";

type IntegrationActionState = {
  ok: boolean;
  message: string;
  savedAt: number | null;
  connected: boolean;
};

type TwilioImportState = IntegrationActionState & {
  imported?: {
    addresses: number;
    bundles: number;
    messagingServices: number;
    phoneNumbers: number;
  };
};

const twilioNumberTypes = ["local", "national", "mobile", "tollFree"] as const;
const twilioNumberSearchTypes = ["any", ...twilioNumberTypes] as const;

type TwilioNumberType = (typeof twilioNumberTypes)[number];
type TwilioNumberSearchType = (typeof twilioNumberSearchTypes)[number];

export type TwilioAvailableNumberOption = {
  phoneNumber: string;
  friendlyName: string | null;
  locality: string | null;
  region: string | null;
  country: string | null;
  numberType: TwilioNumberType;
  addressRequirements: string | null;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
};

export type TwilioNumberSearchState = {
  ok: boolean;
  message: string;
  numbers: TwilioAvailableNumberOption[];
};

export type TwilioComplianceBundleState = IntegrationActionState & {
  bundleSid: string | null;
  status: string | null;
};

export async function updateOpenAIIntegrationAction(
  _: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  await requireAdmin();

  const parsed = openaiConfigSchema.safeParse({
    defaultModel: formData.get("defaultModel"),
    sidekickModel: formData.get("sidekickModel"),
    callAnalysisModel: formData.get("callAnalysisModel"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Enter valid OpenAI settings.",
      savedAt: null,
      connected: false,
    };
  }

  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const existing = await prisma.integrationConnection.findUnique({
    where: { provider: openaiProvider },
  });
  const existingConfig = openaiStoredConfigSchema.safeParse(
    existing?.config ?? {},
  );
  const existingCredentials = existingConfig.success
    ? existingConfig.data.credentials
    : undefined;
  let credentials = existingCredentials;

  if (apiKey) {
    if (!hasCredentialEncryptionKey()) {
      return {
        ok: false,
        message:
          "Set CREDENTIAL_ENCRYPTION_KEY before saving OpenAI credentials.",
        savedAt: null,
        connected: false,
      };
    }

    credentials = {
      apiKey: encryptSecret(apiKey),
      savedAt: new Date().toISOString(),
    };
  }

  const config = {
    ...parsed.data,
    ...(credentials ? { credentials } : {}),
  };
  const isConnected = hasStoredOpenAICredentials(config);

  const savedConnection = await prisma.integrationConnection.upsert({
    where: { provider: openaiProvider },
    update: {
      name: "OpenAI",
      description:
        "AI models for CRM Sidekick, call summaries and assisted workflows.",
      status: isConnected ? "CONNECTED" : "NOT_CONNECTED",
      config,
    },
    create: {
      provider: openaiProvider,
      name: "OpenAI",
      description:
        "AI models for CRM Sidekick, call summaries and assisted workflows.",
      status: isConnected ? "CONNECTED" : "NOT_CONNECTED",
      config,
    },
  });
  await recordIntegrationSetupHealth({
    connected: isConnected,
    integrationId: savedConnection.id,
    message: isConnected
      ? "OpenAI settings saved with API credentials."
      : "OpenAI settings saved without API credentials.",
    metadata: {
      callAnalysisModel: config.callAnalysisModel,
      defaultModel: config.defaultModel,
      sidekickModel: config.sidekickModel,
    },
    provider: openaiProvider,
  });

  revalidatePath("/settings/integrations");
  revalidatePath("/settings/integrations/openai");

  return {
    ok: true,
    message: isConnected
      ? "OpenAI settings saved."
      : "OpenAI settings saved. Add an API key to connect.",
    savedAt: Date.now(),
    connected: isConnected,
  };
}

export async function updateGeoapifyIntegrationAction(
  _: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  await requireAdmin();

  const parsed = geoapifyConfigSchema.safeParse({
    countryFilter: String(formData.get("countryFilter") ?? ""),
    language: String(formData.get("language") ?? ""),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Enter valid Geoapify settings.",
      savedAt: null,
      connected: false,
    };
  }

  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const existing = await prisma.integrationConnection.findUnique({
    where: { provider: geoapifyProvider },
  });
  const existingConfig = geoapifyStoredConfigSchema.safeParse(
    existing?.config ?? {},
  );
  const existingCredentials = existingConfig.success
    ? existingConfig.data.credentials
    : undefined;
  let credentials = existingCredentials;

  if (apiKey) {
    if (!hasCredentialEncryptionKey()) {
      return {
        ok: false,
        message:
          "Set CREDENTIAL_ENCRYPTION_KEY before saving Geoapify credentials.",
        savedAt: null,
        connected: false,
      };
    }

    credentials = {
      apiKey: encryptSecret(apiKey),
      savedAt: new Date().toISOString(),
    };
  }

  const config = {
    ...parsed.data,
    ...(credentials ? { credentials } : {}),
  };
  const isConnected = hasStoredGeoapifyCredentials(config);

  const savedConnection = await prisma.integrationConnection.upsert({
    where: { provider: geoapifyProvider },
    update: {
      name: "Geoapify",
      description: "Address autocomplete for CRM contact and company records.",
      status: isConnected ? "CONNECTED" : "NOT_CONNECTED",
      config,
    },
    create: {
      provider: geoapifyProvider,
      name: "Geoapify",
      description: "Address autocomplete for CRM contact and company records.",
      status: isConnected ? "CONNECTED" : "NOT_CONNECTED",
      config,
    },
  });
  await recordIntegrationSetupHealth({
    connected: isConnected,
    integrationId: savedConnection.id,
    message: isConnected
      ? "Geoapify settings saved with address lookup credentials."
      : "Geoapify settings saved without address lookup credentials.",
    metadata: {
      countryFilter: config.countryFilter || null,
      language: config.language,
    },
    provider: geoapifyProvider,
  });

  revalidatePath("/settings/integrations");
  revalidatePath("/settings/integrations/geoapify");
  revalidatePath("/contacts");
  revalidatePath("/clients");

  return {
    ok: true,
    message: isConnected
      ? "Geoapify settings saved."
      : "Geoapify settings saved. Add an API key to enable address lookup.",
    savedAt: Date.now(),
    connected: isConnected,
  };
}

export async function updatePipedriveIntegrationAction(
  _: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  await requireAdmin();

  const parsed = pipedriveConfigSchema.safeParse({
    apiBaseUrl: formData.get("apiBaseUrl"),
    defaultLeadSource: formData.get("defaultLeadSource"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Enter valid Pipedrive settings.",
      savedAt: null,
      connected: false,
    };
  }

  const apiToken = String(formData.get("apiToken") ?? "").trim();
  const existing = await prisma.integrationConnection.findUnique({
    where: { provider: pipedriveProvider },
  });
  const existingConfig = pipedriveStoredConfigSchema.safeParse(
    existing?.config ?? {},
  );
  const existingCredentials = existingConfig.success
    ? existingConfig.data.credentials
    : undefined;
  const existingSyncState = existingConfig.success
    ? {
        ...(existingConfig.data.lastFullLeadSyncAt
          ? { lastFullLeadSyncAt: existingConfig.data.lastFullLeadSyncAt }
          : {}),
        ...(typeof existingConfig.data.lastFullLeadSyncNextStart === "number"
          ? {
              lastFullLeadSyncNextStart:
                existingConfig.data.lastFullLeadSyncNextStart,
            }
          : {}),
        ...(existingConfig.data.lastLeadSyncAt
          ? { lastLeadSyncAt: existingConfig.data.lastLeadSyncAt }
          : {}),
      }
    : {};
  let credentials = existingCredentials;

  if (apiToken) {
    if (!hasCredentialEncryptionKey()) {
      return {
        ok: false,
        message:
          "Set CREDENTIAL_ENCRYPTION_KEY before saving Pipedrive credentials.",
        savedAt: null,
        connected: false,
      };
    }

    credentials = {
      apiToken: encryptSecret(apiToken),
      savedAt: new Date().toISOString(),
    };
  }

  const config = {
    ...existingSyncState,
    ...parsed.data,
    ...(credentials ? { credentials } : {}),
  };
  const isConnected = hasStoredPipedriveCredentials(config);

  const savedConnection = await prisma.integrationConnection.upsert({
    where: { provider: pipedriveProvider },
    update: {
      name: "Pipedrive",
      description: "Lead inbox import and CRM data synchronisation.",
      status: isConnected ? "CONNECTED" : "NOT_CONNECTED",
      config,
    },
    create: {
      provider: pipedriveProvider,
      name: "Pipedrive",
      description: "Lead inbox import and CRM data synchronisation.",
      status: isConnected ? "CONNECTED" : "NOT_CONNECTED",
      config,
    },
  });
  await recordIntegrationSetupHealth({
    connected: isConnected,
    integrationId: savedConnection.id,
    message: isConnected
      ? "Pipedrive settings saved with lead API credentials."
      : "Pipedrive settings saved without lead API credentials.",
    metadata: {
      apiBaseUrl: config.apiBaseUrl,
      defaultLeadSource: config.defaultLeadSource,
      fullLeadSyncContinuationPreserved:
        "lastFullLeadSyncNextStart" in config,
      fullLeadSyncStatePreserved: "lastFullLeadSyncAt" in config,
      leadSyncStatePreserved: "lastLeadSyncAt" in config,
    },
    provider: pipedriveProvider,
  });

  revalidatePath("/settings/integrations");
  revalidatePath("/settings/integrations/pipedrive");

  return {
    ok: true,
    message: isConnected
      ? "Pipedrive settings saved."
      : "Pipedrive settings saved. Add an API token to connect.",
    savedAt: Date.now(),
    connected: isConnected,
  };
}

export async function pullPipedriveLeadsAction() {
  const user = await requireAdmin();
  const startedAt = new Date();
  const connection = await ensurePipedriveIntegrationConnection();

  const client = await getPipedriveReadOnlyClient();

  if (!client) {
    await prisma.marketingIntegrationSyncLog.create({
      data: {
        finishedAt: new Date(),
        integrationId: connection.id,
        message:
          "Pipedrive API credentials are missing, so lead import could not run.",
        metadata: {
          actorId: user.id,
          pullOnly: true,
          reason: "missing-credentials",
        },
        provider: pipedriveProvider,
        recordsRead: 0,
        recordsWritten: 0,
        startedAt,
        status: "WARNING",
        syncType: "lead-import",
      },
    });
    revalidatePipedriveImportPaths();
    return;
  }

  try {
    const start = client.lastFullLeadSyncNextStart;
    const updatedSince = client.lastFullLeadSyncAt;
    const result = await importPipedriveLeadPages({
      client,
      params: { limit: 50, start, updatedSince },
    });
    const finishedAt = new Date();
    const recordsRead = result.status === "ok" ? result.recordsRead : 0;
    const recordsWritten = result.status === "ok" ? result.created : 0;
    const linkedExisting =
      result.status === "ok" ? result.linkedExisting : 0;
    const skipped = result.skipped;
    const moreAvailable =
      result.status === "ok" ? result.moreAvailable : false;
    const pagesRead = result.status === "ok" ? result.pagesRead : 0;
    const warningCount =
      result.status === "ok"
        ? result.results.reduce(
            (count, leadResult) => count + leadResult.warnings.length,
            0,
          )
        : 1;
    const status =
      warningCount > 0 || skipped > 0 || recordsRead === 0 || moreAvailable
        ? "WARNING"
        : "SUCCESS";
    const importMode =
      start !== null
        ? "Continuation pull"
        : updatedSince
          ? "Incremental pull"
          : "Initial pull";
    const pageSummary =
      pagesRead > 1 ? ` across ${pagesRead} pages` : "";
    const moreAvailableSummary = moreAvailable
      ? " More Pipedrive pages are available, so a continuation was saved and the full-pull cursor was not advanced."
      : "";
    const message =
      recordsRead === 0
        ? `${importMode}: no Pipedrive leads were available to import.`
        : `${importMode}: ${recordsWritten} created, ${linkedExisting} already linked, ${skipped} skipped from ${recordsRead} Pipedrive lead${recordsRead === 1 ? "" : "s"}${pageSummary}.${moreAvailableSummary}`;
    const importRows =
      result.status === "ok"
        ? pipedriveLeadImportMetadataRows(result.results)
        : [];
    const existingConfig = pipedriveStoredConfigSchema.safeParse(
      connection.config ?? {},
    );

    const writes: Prisma.PrismaPromise<unknown>[] = [
      prisma.marketingIntegrationSyncLog.create({
        data: {
          finishedAt,
          integrationId: connection.id,
          message,
          metadata: {
            actorId: user.id,
            created: recordsWritten,
            imports: importRows,
            linkedExisting,
            maxPages: result.status === "ok" ? result.maxPages : null,
            mode:
              start !== null
                ? "continuation"
                : updatedSince
                  ? "incremental"
                  : "initial",
            moreAvailable,
            nextStart: result.status === "ok" ? result.nextStart : null,
            pagesRead,
            pullOnly: true,
            skipped,
            start,
            updatedSince,
            warningCount,
          },
          provider: pipedriveProvider,
          recordsRead,
          recordsWritten,
          startedAt,
          status,
          syncType: "lead-import",
        },
      }),
    ];

    if (existingConfig.success) {
      const nextConfig =
        moreAvailable && result.status === "ok" && result.nextStart !== null
          ? {
              ...existingConfig.data,
              lastFullLeadSyncNextStart: result.nextStart,
              lastLeadSyncAt: finishedAt.toISOString(),
            }
          : {
              ...existingConfig.data,
              lastFullLeadSyncAt: finishedAt.toISOString(),
              lastFullLeadSyncNextStart: null,
              lastLeadSyncAt: finishedAt.toISOString(),
            };

      writes.push(
        prisma.integrationConnection.update({
          where: { provider: pipedriveProvider },
          data: {
            config: nextConfig,
          },
        }),
      );
    }

    await prisma.$transaction(writes);
    revalidatePipedriveImportPaths();
  } catch (error) {
    const finishedAt = new Date();
    const message =
      error instanceof Error
        ? error.message
        : "Pipedrive lead import failed.";

    await prisma.marketingIntegrationSyncLog.create({
      data: {
        finishedAt,
        integrationId: connection.id,
        message,
        metadata: {
          actorId: user.id,
          pullOnly: true,
        },
        provider: pipedriveProvider,
        recordsRead: 0,
        recordsWritten: 0,
        startedAt,
        status: "ERROR",
        syncType: "lead-import",
      },
    });
    revalidatePipedriveImportPaths();
  }
}

export async function previewPipedriveLeadsAction() {
  const user = await requireAdmin();
  const startedAt = new Date();
  const connection = await ensurePipedriveIntegrationConnection();
  const client = await getPipedriveReadOnlyClient();

  if (!client) {
    await prisma.marketingIntegrationSyncLog.create({
      data: {
        finishedAt: new Date(),
        integrationId: connection.id,
        message:
          "Pipedrive API credentials are missing, so lead import preview could not run.",
        metadata: {
          actorId: user.id,
          dryRun: true,
          pullOnly: true,
          reason: "missing-credentials",
        },
        provider: pipedriveProvider,
        recordsRead: 0,
        recordsWritten: 0,
        startedAt,
        status: "WARNING",
        syncType: "lead-import-preview",
      },
    });
    revalidatePipedriveSettingsPaths();
    return;
  }

  try {
    const result = await previewPipedriveLeadPage({
      client,
      params: { limit: 50 },
    });
    const finishedAt = new Date();
    const recordsRead = result.status === "ok" ? result.page.data.length : 0;
    const wouldCreate = result.status === "ok" ? result.wouldCreate : 0;
    const linkedExisting =
      result.status === "ok" ? result.linkedExisting : 0;
    const skipped = result.skipped;
    const warningCount =
      result.status === "ok"
        ? result.previews.reduce(
            (count, preview) => count + preview.warnings.length,
            0,
          )
        : 1;
    const status =
      warningCount > 0 || skipped > 0 || recordsRead === 0
        ? "WARNING"
        : "SUCCESS";
    const message =
      recordsRead === 0
        ? "Dry-run: no Pipedrive leads were available to preview. No contacts, companies or opportunities were changed."
        : `Dry-run: ${wouldCreate} would be created, ${linkedExisting} already linked, ${skipped} skipped from ${recordsRead} Pipedrive lead${recordsRead === 1 ? "" : "s"}. No contacts, companies or opportunities were changed.`;
    const previewRows =
      result.status === "ok"
        ? pipedriveLeadPreviewMetadataRows(result.previews)
        : [];

    await prisma.marketingIntegrationSyncLog.create({
      data: {
        finishedAt,
        integrationId: connection.id,
        message,
        metadata: {
          actorId: user.id,
          dryRun: true,
          linkedExisting,
          previews: previewRows,
          pullOnly: true,
          skipped,
          warningCount,
          wouldCreate,
        },
        provider: pipedriveProvider,
        recordsRead,
        recordsWritten: 0,
        startedAt,
        status,
        syncType: "lead-import-preview",
      },
    });
    revalidatePipedriveSettingsPaths();
  } catch (error) {
    const finishedAt = new Date();
    const message =
      error instanceof Error
        ? error.message
        : "Pipedrive lead import preview failed.";

    await prisma.marketingIntegrationSyncLog.create({
      data: {
        finishedAt,
        integrationId: connection.id,
        message,
        metadata: {
          actorId: user.id,
          dryRun: true,
          pullOnly: true,
        },
        provider: pipedriveProvider,
        recordsRead: 0,
        recordsWritten: 0,
        startedAt,
        status: "ERROR",
        syncType: "lead-import-preview",
      },
    });
    revalidatePipedriveSettingsPaths();
  }
}

export async function importSelectedPipedriveLeadsAction(formData: FormData) {
  const user = await requireAdmin();
  const startedAt = new Date();
  const selectedLeadIds = selectedPipedriveLeadIds(formData);
  const connection = await ensurePipedriveIntegrationConnection();

  if (!selectedLeadIds.length) {
    await prisma.marketingIntegrationSyncLog.create({
      data: {
        finishedAt: new Date(),
        integrationId: connection.id,
        message:
          "No Pipedrive leads were selected, so selected import did not run.",
        metadata: {
          actorId: user.id,
          pullOnly: true,
          reason: "no-selected-leads",
        },
        provider: pipedriveProvider,
        recordsRead: 0,
        recordsWritten: 0,
        startedAt,
        status: "WARNING",
        syncType: "lead-import-selected",
      },
    });
    revalidatePipedriveSettingsPaths();
    return;
  }

  const latestPreviewLog = await prisma.marketingIntegrationSyncLog.findFirst({
    orderBy: { startedAt: "desc" },
    select: {
      metadata: true,
      startedAt: true,
    },
    where: {
      provider: pipedriveProvider,
      syncType: "lead-import-preview",
    },
  });
  const importablePreviewLeadIds =
    pipedriveImportablePreviewLeadIdsFromMetadata(
      latestPreviewLog?.metadata,
    );
  const importablePreviewLeadIdSet = new Set(importablePreviewLeadIds);
  const approvedLeadIds = selectedLeadIds.filter((leadId) =>
    importablePreviewLeadIdSet.has(leadId),
  );
  const rejectedLeadIds = selectedLeadIds.filter(
    (leadId) => !importablePreviewLeadIdSet.has(leadId),
  );

  if (!approvedLeadIds.length) {
    const reason = latestPreviewLog
      ? "no-importable-preview-selection"
      : "missing-preview";

    await prisma.marketingIntegrationSyncLog.create({
      data: {
        finishedAt: new Date(),
        integrationId: connection.id,
        message: latestPreviewLog
          ? "Selected import did not run because none of the submitted Pipedrive leads were marked would-create in the latest preview."
          : "Run a Pipedrive preview before importing selected leads.",
        metadata: {
          actorId: user.id,
          importablePreviewLeadCount: importablePreviewLeadIds.length,
          previewStartedAt: latestPreviewLog?.startedAt.toISOString() ?? null,
          pullOnly: true,
          reason,
          rejectedLeadIds,
          selectedLeadIds,
        },
        provider: pipedriveProvider,
        recordsRead: 0,
        recordsWritten: 0,
        startedAt,
        status: "WARNING",
        syncType: "lead-import-selected",
      },
    });
    revalidatePipedriveSettingsPaths();
    return;
  }

  const client = await getPipedriveReadOnlyClient();

  if (!client) {
    await prisma.marketingIntegrationSyncLog.create({
      data: {
        finishedAt: new Date(),
        integrationId: connection.id,
        message:
          "Pipedrive API credentials are missing, so selected lead import could not run.",
        metadata: {
          actorId: user.id,
          pullOnly: true,
          reason: "missing-credentials",
          rejectedLeadIds,
          selectedLeadIds: approvedLeadIds,
          submittedLeadIds: selectedLeadIds,
        },
        provider: pipedriveProvider,
        recordsRead: 0,
        recordsWritten: 0,
        startedAt,
        status: "WARNING",
        syncType: "lead-import-selected",
      },
    });
    revalidatePipedriveImportPaths();
    return;
  }

  try {
    const result = await importPipedriveLeadIds({
      client,
      leadIds: approvedLeadIds,
    });
    const finishedAt = new Date();
    const recordsRead = result.status === "ok" ? result.requested : 0;
    const recordsWritten = result.status === "ok" ? result.created : 0;
    const linkedExisting =
      result.status === "ok" ? result.linkedExisting : 0;
    const skipped = result.skipped;
    const warningCount =
      result.status === "ok"
        ? result.results.reduce(
            (count, leadResult) => count + leadResult.warnings.length,
            0,
          )
        : 1;
    const status =
      warningCount > 0 || skipped > 0 || recordsRead === 0
        ? "WARNING"
        : "SUCCESS";
    const message =
      recordsRead === 0
        ? "Selected import found no Pipedrive leads to import."
        : `Selected import: ${recordsWritten} created, ${linkedExisting} already linked, ${skipped} skipped from ${recordsRead} selected Pipedrive lead${recordsRead === 1 ? "" : "s"}.`;
    const importRows =
      result.status === "ok"
        ? pipedriveLeadImportMetadataRows(result.results)
        : [];
    const existingConfig = pipedriveStoredConfigSchema.safeParse(
      connection.config ?? {},
    );
    const writes: Prisma.PrismaPromise<unknown>[] = [
      prisma.marketingIntegrationSyncLog.create({
        data: {
          finishedAt,
          integrationId: connection.id,
          message,
          metadata: {
            actorId: user.id,
            created: recordsWritten,
            imports: importRows,
            linkedExisting,
            previewStartedAt: latestPreviewLog?.startedAt.toISOString() ?? null,
            pullOnly: true,
            rejectedLeadIds,
            selectedLeadIds: approvedLeadIds,
            skipped,
            submittedLeadIds: selectedLeadIds,
            warningCount,
          },
          provider: pipedriveProvider,
          recordsRead,
          recordsWritten,
          startedAt,
          status,
          syncType: "lead-import-selected",
        },
      }),
    ];

    if (existingConfig.success) {
      writes.push(
        prisma.integrationConnection.update({
          where: { provider: pipedriveProvider },
          data: {
            config: {
              ...existingConfig.data,
              lastLeadSyncAt: finishedAt.toISOString(),
            },
          },
        }),
      );
    }

    await prisma.$transaction(writes);
    revalidatePipedriveImportPaths();
  } catch (error) {
    const finishedAt = new Date();
    const message =
      error instanceof Error
        ? error.message
        : "Pipedrive selected lead import failed.";

    await prisma.marketingIntegrationSyncLog.create({
      data: {
        finishedAt,
        integrationId: connection.id,
        message,
        metadata: {
          actorId: user.id,
          pullOnly: true,
          rejectedLeadIds,
          selectedLeadIds: approvedLeadIds,
          submittedLeadIds: selectedLeadIds,
        },
        provider: pipedriveProvider,
        recordsRead: 0,
        recordsWritten: 0,
        startedAt,
        status: "ERROR",
        syncType: "lead-import-selected",
      },
    });
    revalidatePipedriveImportPaths();
  }
}

async function ensurePipedriveIntegrationConnection() {
  return prisma.integrationConnection.upsert({
    where: { provider: pipedriveProvider },
    update: {},
    create: {
      config: {
        apiBaseUrl: defaultPipedriveApiBaseUrl,
        defaultLeadSource: defaultPipedriveLeadSource,
      },
      description: "Lead inbox import and CRM data synchronisation.",
      name: "Pipedrive",
      provider: pipedriveProvider,
      status: hasPipedriveEnvironmentConfig() ? "CONNECTED" : "NOT_CONNECTED",
    },
    select: { config: true, id: true },
  });
}

function selectedPipedriveLeadIds(formData: FormData) {
  const leadIds = new Set<string>();

  for (const value of formData.getAll("externalLeadId")) {
    if (typeof value !== "string") continue;

    const leadId = value.trim();
    if (leadId) leadIds.add(leadId);
    if (leadIds.size >= 50) break;
  }

  return [...leadIds];
}

function revalidatePipedriveSettingsPaths() {
  revalidatePath("/settings/integrations");
  revalidatePath("/settings/integrations/pipedrive");
}

function revalidatePipedriveImportPaths() {
  revalidatePipedriveSettingsPaths();
  revalidatePath("/sales");
  revalidatePath("/contacts");
  revalidatePath("/clients");
}

export async function updateDocuSignIntegrationAction(
  _: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  await requireAdmin();

  const parsed = docusignConfigSchema.safeParse({
    accountId: formData.get("accountId"),
    baseUri: formData.get("baseUri"),
    defaultEmailMessage: formData.get("defaultEmailMessage"),
    defaultEmailSubject: formData.get("defaultEmailSubject"),
    environment: formData.get("environment"),
    webhookBaseUrl: formData.get("webhookBaseUrl"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Enter valid DocuSign settings.",
      savedAt: null,
      connected: false,
    };
  }

  const integrationKey = String(formData.get("integrationKey") ?? "").trim();
  const impersonatedUserId = String(
    formData.get("impersonatedUserId") ?? "",
  ).trim();
  const privateKey = String(formData.get("privateKey") ?? "").trim();
  const connectHmacSecret = String(
    formData.get("connectHmacSecret") ?? "",
  ).trim();
  const existing = await prisma.integrationConnection.findUnique({
    where: { provider: docusignProvider },
  });
  const existingConfig = docusignStoredConfigSchema.safeParse(
    existing?.config ?? {},
  );
  const existingCredentials = existingConfig.success
    ? existingConfig.data.credentials
    : undefined;
  let credentials = existingCredentials;
  const submittedAnyCredential = Boolean(
    integrationKey || impersonatedUserId || privateKey || connectHmacSecret,
  );

  if (submittedAnyCredential) {
    if (
      !integrationKey ||
      !impersonatedUserId ||
      !privateKey ||
      !connectHmacSecret
    ) {
      return {
        ok: false,
        message:
          "Enter the integration key, impersonated user ID, private key and Connect HMAC secret together.",
        savedAt: null,
        connected: false,
      };
    }

    if (!hasCredentialEncryptionKey()) {
      return {
        ok: false,
        message:
          "Set CREDENTIAL_ENCRYPTION_KEY before saving DocuSign credentials.",
        savedAt: null,
        connected: false,
      };
    }

    credentials = {
      connectHmacSecret: encryptSecret(connectHmacSecret),
      impersonatedUserId: encryptSecret(impersonatedUserId),
      integrationKey: encryptSecret(integrationKey),
      privateKey: encryptSecret(privateKey),
      savedAt: new Date().toISOString(),
    };
  }

  const config = {
    ...parsed.data,
    ...(credentials ? { credentials } : {}),
  };
  const isConnected = hasStoredDocuSignCredentials(config);

  const savedConnection = await prisma.integrationConnection.upsert({
    where: { provider: docusignProvider },
    update: {
      name: "DocuSign",
      description: "Electronic signature envelopes for CRM documents.",
      status: isConnected ? "CONNECTED" : "NOT_CONNECTED",
      config,
    },
    create: {
      provider: docusignProvider,
      name: "DocuSign",
      description: "Electronic signature envelopes for CRM documents.",
      status: isConnected ? "CONNECTED" : "NOT_CONNECTED",
      config,
    },
  });
  await recordIntegrationSetupHealth({
    connected: isConnected,
    integrationId: savedConnection.id,
    message: isConnected
      ? "DocuSign settings saved with signing credentials."
      : "DocuSign settings saved without signing credentials.",
    metadata: {
      accountId: config.accountId,
      baseUriConfigured: Boolean(config.baseUri),
      environment: config.environment,
      webhookBaseUrlConfigured: Boolean(config.webhookBaseUrl),
    },
    provider: docusignProvider,
  });

  revalidatePath("/settings/integrations");
  revalidatePath("/settings/integrations/docusign");

  return {
    ok: true,
    message: isConnected
      ? "DocuSign settings saved."
      : "DocuSign settings saved. Add all DocuSign credentials to connect.",
    savedAt: Date.now(),
    connected: isConnected,
  };
}

const twilioNumberSearchSchema = z.object({
  country: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase()),
  numberType: z
    .enum(twilioNumberSearchTypes)
    .optional()
    .catch("any")
    .transform((value) => value ?? "any"),
  areaCode: z
    .string()
    .trim()
    .optional()
    .transform((value) => {
      const parsed = Number(value);
      return value && Number.isFinite(parsed) ? parsed : undefined;
    }),
  contains: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length >= 2 ? value : undefined)),
});

const twilioNumberPurchaseSchema = z.object({
  phoneNumber: z.string().trim().min(5),
  country: z
    .string()
    .trim()
    .length(2)
    .optional()
    .transform((value) => value?.toUpperCase()),
  numberType: z.enum(twilioNumberTypes).optional(),
});

const gbMobileBundleSchema = z.object({
  businessName: z.string().trim().min(2, "Enter the registered business name."),
  businessRegistrationNumber: z
    .string()
    .trim()
    .min(2, "Enter the business registration number."),
  businessWebsite: z.string().trim().url("Enter the business website URL."),
  complianceEmail: z
    .string()
    .trim()
    .email("Enter the compliance contact email."),
  addressLine1: z.string().trim().min(3, "Enter the business address."),
  addressLine2: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  city: z.string().trim().min(2, "Enter the city."),
  region: z.string().trim().min(2, "Enter the county or region."),
  postalCode: z.string().trim().min(3, "Enter the postcode."),
  representativeName: z
    .string()
    .trim()
    .min(2, "Enter the authorised representative name."),
  representativeEmail: z
    .string()
    .trim()
    .email("Enter the authorised representative email."),
  representativePhone: z
    .string()
    .trim()
    .min(5, "Enter the authorised representative phone number."),
});

const businessNumberReleaseSchema = z.object({
  businessNumberId: z.string().trim().min(1),
  confirmationNumber: z.string().trim().min(5),
});

function messagingWebhookUrl(webhookBaseUrl: string) {
  return `${webhookBaseUrl.replace(/\/$/, "")}/api/webhooks/twilio/messaging`;
}

function voiceWebhookUrl(webhookBaseUrl: string) {
  return `${webhookBaseUrl.replace(/\/$/, "")}/api/webhooks/twilio/voice`;
}

function transcriptWebhookUrl(webhookBaseUrl: string) {
  return `${webhookBaseUrl.replace(/\/$/, "")}/api/webhooks/twilio/voice/transcript`;
}

function searchNumberTypes(
  numberType: TwilioNumberSearchType,
): TwilioNumberType[] {
  return numberType === "any" ? [...twilioNumberTypes] : [numberType];
}

function normalizedNonNanpPrefix(areaCode?: number) {
  if (!areaCode) return undefined;
  const prefix = String(areaCode).replace(/^0+/, "");
  return prefix.length >= 2 ? prefix : undefined;
}

function regulatoryBundleNumberTypes(numberType: TwilioNumberType): string[] {
  if (numberType === "tollFree") return ["toll-free"];
  if (numberType === "local") return ["local", "national"];
  return [numberType];
}

function requiresApprovedBundleForPurchase({
  country,
  numberType,
}: {
  country?: string | null;
  numberType?: TwilioNumberType;
}) {
  return country?.toUpperCase() === "GB" && numberType === "mobile";
}

function regulatoryBundleRequiredMessage(country?: string | null) {
  const countryLabel =
    country?.toUpperCase() === "GB"
      ? "UK"
      : (country?.toUpperCase() ?? "this country");

  return `${countryLabel} mobile numbers require an approved Twilio regulatory bundle before they can be bought. Use a local or national number for now, or complete and import the Twilio bundle first.`;
}

function evaluationViolations(results: unknown) {
  if (!Array.isArray(results)) return "";

  return results
    .map((item) => inventoryRecord(item))
    .map((item) => {
      const friendlyName =
        typeof item.friendly_name === "string" ? item.friendly_name : null;
      const description =
        typeof item.description === "string" ? item.description : null;

      return [friendlyName, description].filter(Boolean).join(": ");
    })
    .filter(Boolean)
    .slice(0, 4)
    .join("; ");
}

async function findBundleWithReusableAssignments(
  client: ReturnType<typeof twilio>,
) {
  const candidateSids: string[] = [];
  const preferredStatuses = [
    "twilio-approved",
    "provisionally-approved",
    "pending-review",
    "in-review",
    "draft",
  ] as const;

  for (const status of preferredStatuses) {
    try {
      const bundles = await client.numbers.v2.regulatoryCompliance.bundles.list(
        {
          status,
          limit: 20,
        },
      );

      for (const bundle of bundles) {
        if (!candidateSids.includes(bundle.sid)) {
          candidateSids.push(bundle.sid);
        }
      }
    } catch {
      // Some accounts or API versions may not allow every status filter.
    }
  }

  for (const sid of candidateSids) {
    try {
      const bundle = await client.numbers.v2.regulatoryCompliance
        .bundles(sid)
        .fetch();
      const assignments = await client.numbers.v2.regulatoryCompliance
        .bundles(sid)
        .itemAssignments.list({ limit: 50 });

      if (assignments.length) {
        return { bundle, assignments };
      }
    } catch {
      // Try the next reusable bundle.
    }
  }

  return null;
}

async function listBundlesForRegulation({
  client,
  regulationSid,
}: {
  client: ReturnType<typeof twilio>;
  regulationSid: string;
}) {
  const bundles = await client.numbers.v2.regulatoryCompliance.bundles.list({
    limit: 100,
  });

  return bundles.filter((bundle) => bundle.regulationSid === regulationSid);
}

function inventoryRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function recordString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function hasCapability(value: unknown, capability: "mms" | "sms" | "voice") {
  const record = inventoryRecord(value);

  return Boolean(
    record[capability] ??
    record[capability.toUpperCase()] ??
    record[capability[0].toUpperCase() + capability.slice(1)],
  );
}

function importedPhoneNumberForConfig(
  config: TwilioConfig,
  phoneNumber: string,
) {
  const normalizedPhoneNumber = normalizeCallableNumber(phoneNumber);

  return (config.importedInventory?.phoneNumbers ?? [])
    .map((number) => inventoryRecord(number))
    .find((number) => {
      const importedNumber = recordString(number.phoneNumber);

      return importedNumber
        ? normalizeCallableNumber(importedNumber) === normalizedPhoneNumber
        : false;
    });
}

async function listAvailableCrmNumbers(
  client: ReturnType<typeof twilio>,
  config: TwilioConfig,
  search: z.infer<typeof twilioNumberSearchSchema>,
  limit: number,
) {
  const availablePhoneNumbers = client.availablePhoneNumbers(search.country);
  const numbers: TwilioAvailableNumberOption[] = [];
  const seen = new Set<string>();
  const isNanp = search.country === "US" || search.country === "CA";
  const areaCode = isNanp ? search.areaCode : undefined;
  const contains = search.contains ?? normalizedNonNanpPrefix(search.areaCode);

  for (const numberType of searchNumberTypes(search.numberType)) {
    if (numbers.length >= limit) break;

    if (
      requiresApprovedBundleForPurchase({
        country: search.country,
        numberType,
      }) &&
      !(await approvedBundleSidForNumber({
        client,
        config,
        country: search.country,
        numberType,
      }))
    ) {
      continue;
    }

    const options = {
      areaCode: numberType === "tollFree" ? undefined : areaCode,
      contains,
      smsEnabled: true,
      voiceEnabled: true,
      limit: limit - numbers.length,
    };

    try {
      const listed =
        numberType === "local"
          ? await availablePhoneNumbers.local.list(options)
          : numberType === "national"
            ? await availablePhoneNumbers.national.list(options)
            : numberType === "mobile"
              ? await availablePhoneNumbers.mobile.list(options)
              : await availablePhoneNumbers.tollFree.list(options);

      for (const number of listed) {
        if (seen.has(number.phoneNumber)) continue;
        seen.add(number.phoneNumber);
        numbers.push({
          phoneNumber: number.phoneNumber,
          friendlyName: number.friendlyName ?? null,
          locality: number.locality ?? null,
          region: number.region ?? null,
          country: number.isoCountry ?? search.country,
          numberType,
          addressRequirements:
            "addressRequirements" in number &&
            typeof number.addressRequirements === "string"
              ? number.addressRequirements
              : null,
          capabilities: {
            voice: hasCapability(number.capabilities, "voice"),
            sms: hasCapability(number.capabilities, "sms"),
            mms: hasCapability(number.capabilities, "mms"),
          },
        });
      }
    } catch {
      // Some countries do not expose every Twilio number category.
    }
  }

  return numbers;
}

async function approvedBundleSidForNumber({
  client,
  config,
  country,
  numberType,
}: {
  client: ReturnType<typeof twilio>;
  config: TwilioConfig;
  country?: string | null;
  numberType?: TwilioNumberType;
}) {
  if (!country || !numberType) return null;

  const imported = config.importedInventory?.bundles
    .map((bundle) => inventoryRecord(bundle))
    .find((bundle) => {
      const sid = recordString(bundle.sid);
      const status = recordString(bundle.status);
      const importedType = recordString(bundle.numberType);

      return (
        sid &&
        (!status || status === "twilio-approved") &&
        (!importedType ||
          regulatoryBundleNumberTypes(numberType).includes(importedType))
      );
    });
  const importedSid = imported ? recordString(imported.sid) : null;

  if (importedSid) return importedSid;

  for (const regulatoryNumberType of regulatoryBundleNumberTypes(numberType)) {
    try {
      const bundles = await client.numbers.v2.regulatoryCompliance.bundles.list(
        {
          isoCountry: country,
          numberType: regulatoryNumberType,
          status: "twilio-approved",
          limit: 1,
        },
      );
      const sid = bundles[0]?.sid;
      if (sid) return sid;
    } catch {
      // Keep trying compatible number types.
    }
  }

  return null;
}

async function targetBusinessRegulationForNumberType({
  client,
  country,
  numberType,
}: {
  client: ReturnType<typeof twilio>;
  country: string;
  numberType: TwilioNumberType;
}) {
  const regulatoryNumberType = regulatoryBundleNumberTypes(numberType)[0];

  try {
    const regulations =
      await client.numbers.v2.regulatoryCompliance.regulations.list({
        endUserType: "business",
        isoCountry: country,
        numberType: regulatoryNumberType,
        includeConstraints: true,
        limit: 10,
      });

    return regulations[0] ?? null;
  } catch {
    return null;
  }
}

async function syncGeneratedTwilioComplianceRecords({
  address,
  bundle,
  config,
}: {
  address?: {
    city: string | null;
    country: string | null;
    customerName: string | null;
    label: string;
    postalCode: string | null;
    region: string | null;
    sid: string;
    street: string | null;
    validated?: boolean | null;
    verified?: boolean | null;
  };
  bundle: {
    label: string;
    numberType: string;
    regulationSid: string;
    sid: string;
    status: string;
    validUntil: string | null;
  };
  config: TwilioConfig;
}) {
  const importedInventory = config.importedInventory ?? {
    lastImportedAt: new Date().toISOString(),
    addresses: [],
    bundles: [],
    messagingServices: [],
    phoneNumbers: [],
  };
  const nextConfig = {
    ...config,
    importedInventory: {
      ...importedInventory,
      lastImportedAt: new Date().toISOString(),
      addresses: address
        ? [
            ...(importedInventory.addresses ?? []).filter(
              (item) => inventoryRecord(item).sid !== address.sid,
            ),
            address,
          ]
        : (importedInventory.addresses ?? []),
      bundles: [
        ...(importedInventory.bundles ?? []).filter(
          (item) => inventoryRecord(item).sid !== bundle.sid,
        ),
        bundle,
      ],
    },
  };

  await prisma.integrationConnection.update({
    where: { provider: twilioProvider },
    data: {
      status: hasStoredTwilioCredentials(nextConfig)
        ? "CONNECTED"
        : "NOT_CONNECTED",
      config: nextConfig as Prisma.InputJsonValue,
    },
  });
}

function addressSidForCountry(config: TwilioConfig, country?: string | null) {
  const addresses = config.importedInventory?.addresses ?? [];
  const matchingAddress = addresses
    .map((address) => inventoryRecord(address))
    .find((address) => {
      const sid = recordString(address.sid);
      const addressCountry = recordString(address.country);

      return sid && (!country || !addressCountry || addressCountry === country);
    });
  const fallbackAddress = addresses
    .map((address) => inventoryRecord(address))
    .find((address) => recordString(address.sid));

  return (
    recordString(matchingAddress?.sid) ?? recordString(fallbackAddress?.sid)
  );
}

async function configureMessagingServiceForNumber({
  client,
  config,
  messagingUrl,
  phoneNumber,
  phoneNumberSid,
}: {
  client: ReturnType<typeof twilio>;
  config: TwilioConfig;
  messagingUrl: string;
  phoneNumber: string;
  phoneNumberSid: string;
}) {
  const existingServices = await client.messaging.v1.services.list({
    limit: 50,
  });
  const configuredService = config.messagingServiceSid
    ? existingServices.find(
        (service) => service.sid === config.messagingServiceSid,
      )
    : null;
  const namedService =
    existingServices.find(
      (service) => service.friendlyName === "CRM Outbound",
    ) ?? null;
  const service =
    configuredService ??
    namedService ??
    (await client.messaging.v1.services.create({
      friendlyName: "CRM Outbound",
    }));

  await client.messaging.v1.services(service.sid).update({
    inboundRequestUrl: messagingUrl,
    inboundMethod: "POST",
    statusCallback: messagingUrl,
  });

  const serviceNumbers = await client.messaging.v1
    .services(service.sid)
    .phoneNumbers.list({ limit: 100 });
  const senderAlreadyAttached = serviceNumbers.some(
    (number) =>
      number.sid === phoneNumberSid || number.phoneNumber === phoneNumber,
  );

  if (!senderAlreadyAttached) {
    await client.messaging.v1.services(service.sid).phoneNumbers.create({
      phoneNumberSid,
    });
  }

  const refreshedNumbers = await client.messaging.v1
    .services(service.sid)
    .phoneNumbers.list({ limit: 100 });

  return {
    service,
    numbers: refreshedNumbers,
  };
}

function twilioApiErrorMessage(error: unknown) {
  const candidate = error as {
    status?: number;
    code?: number | string;
    message?: string;
  };

  if (String(candidate?.code) === "21649") {
    return `${regulatoryBundleRequiredMessage("GB")} (21649)`;
  }

  if (candidate?.message) {
    const code = candidate.code ? ` (${candidate.code})` : "";
    return `${candidate.message}${code}`;
  }

  return "Twilio rejected the request.";
}

async function createTwilioApiKey({
  accountSid,
  authToken,
}: {
  accountSid: string;
  authToken: string;
}): Promise<
  { ok: true; sid: string; secret: string } | { ok: false; message: string }
> {
  try {
    const key = await twilio(accountSid, authToken).newKeys.create({
      friendlyName: "iD30 CRM softphone",
    });

    if (!key.sid || !key.secret) {
      return {
        ok: false,
        message: "Twilio created an API key but did not return its secret.",
      };
    }

    return { ok: true, sid: key.sid, secret: key.secret };
  } catch (error) {
    return {
      ok: false,
      message: `Twilio could not create an API key automatically. ${twilioApiErrorMessage(error)}`,
    };
  }
}

async function validateTwilioVoiceAccess({
  accountSid,
  authToken,
  apiKeySid,
  apiKeySecret,
  twimlAppSid,
}: {
  accountSid: string;
  authToken: string;
  apiKeySid: string;
  apiKeySecret: string;
  twimlAppSid: string;
}) {
  try {
    await twilio(accountSid, authToken).applications(twimlAppSid).fetch();
  } catch (error) {
    return {
      ok: false,
      failedCredential: "account" as const,
      message: `Twilio Account SID/Auth Token could not fetch the TwiML App. ${twilioApiErrorMessage(error)}`,
    };
  }

  try {
    await twilio(apiKeySid, apiKeySecret, { accountSid })
      .applications(twimlAppSid)
      .fetch();
  } catch (error) {
    return {
      ok: false,
      failedCredential: "apiKey" as const,
      message: `Twilio API key SID/Client Secret could not authenticate against the TwiML App. Create a fresh Standard or Main API key in the same Twilio account, then paste its SID and Client Secret together. ${twilioApiErrorMessage(error)}`,
    };
  }

  return {
    ok: true,
    failedCredential: null,
    message: "Twilio voice credentials verified.",
  };
}

function twilioBasicAuth(username: string, password: string) {
  return Buffer.from(`${username}:${password}`).toString("base64");
}

async function twilioIntelligenceRequest({
  accountSid,
  authToken,
  body,
  serviceSidOrUniqueName,
}: {
  accountSid: string;
  authToken: string;
  body?: URLSearchParams;
  serviceSidOrUniqueName?: string;
}) {
  const response = await fetch(
    serviceSidOrUniqueName
      ? `https://intelligence.twilio.com/v2/Services/${encodeURIComponent(serviceSidOrUniqueName)}`
      : "https://intelligence.twilio.com/v2/Services",
    {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Basic ${twilioBasicAuth(accountSid, authToken)}`,
        ...(body
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : {}),
      },
      body,
    },
  );
  const payload = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  return { payload, response };
}

async function configureTwilioVoiceIntelligenceService({
  accountSid,
  authToken,
  existingServiceSid,
  webhookBaseUrl,
}: {
  accountSid: string;
  authToken: string;
  existingServiceSid?: string | null;
  webhookBaseUrl: string;
}) {
  const uniqueName = "id30-crm-call-transcripts";
  const friendlyName = "iD30 CRM call transcripts";
  const webhookUrl = transcriptWebhookUrl(webhookBaseUrl);
  const body = new URLSearchParams({
    AutoTranscribe: "false",
    FriendlyName: friendlyName,
    WebhookHttpMethod: "POST",
    WebhookUrl: webhookUrl,
  });
  const serviceSidOrUniqueName = existingServiceSid || uniqueName;

  if (existingServiceSid) {
    const update = await twilioIntelligenceRequest({
      accountSid,
      authToken,
      body,
      serviceSidOrUniqueName,
    });

    if (!update.response.ok) {
      return {
        ok: false as const,
        message:
          typeof update.payload?.message === "string"
            ? update.payload.message
            : "Twilio could not update the Voice Intelligence Service.",
      };
    }

    return {
      created: false,
      ok: true as const,
      sid:
        typeof update.payload?.sid === "string"
          ? update.payload.sid
          : existingServiceSid,
    };
  }

  const existing = await twilioIntelligenceRequest({
    accountSid,
    authToken,
    serviceSidOrUniqueName,
  });

  if (existing.response.ok) {
    const existingSid =
      typeof existing.payload?.sid === "string" ? existing.payload.sid : null;

    if (!existingSid) {
      return {
        ok: false as const,
        message:
          "Twilio found the Voice Intelligence Service but did not return its SID.",
      };
    }

    const update = await twilioIntelligenceRequest({
      accountSid,
      authToken,
      body,
      serviceSidOrUniqueName: existingSid,
    });

    if (!update.response.ok) {
      return {
        ok: false as const,
        message:
          typeof update.payload?.message === "string"
            ? update.payload.message
            : "Twilio could not update the Voice Intelligence Service.",
      };
    }

    return { created: false, ok: true as const, sid: existingSid };
  }

  if (existing.response.status !== 404) {
    return {
      ok: false as const,
      message:
        typeof existing.payload?.message === "string"
          ? existing.payload.message
          : "Twilio could not check for an existing Voice Intelligence Service.",
    };
  }

  body.set("UniqueName", uniqueName);
  body.set("LanguageCode", "en-GB");

  const created = await twilioIntelligenceRequest({
    accountSid,
    authToken,
    body,
  });

  if (!created.response.ok) {
    return {
      ok: false as const,
      message:
        typeof created.payload?.message === "string"
          ? created.payload.message
          : "Twilio could not create the Voice Intelligence Service.",
    };
  }

  const sid =
    typeof created.payload?.sid === "string" ? created.payload.sid : null;

  if (!sid) {
    return {
      ok: false as const,
      message:
        "Twilio created the Voice Intelligence Service but did not return its SID.",
    };
  }

  return { created: true, ok: true as const, sid };
}

export async function updateCloudflareR2IntegrationAction(
  _: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  await requireAdmin();

  const parsed = r2ConfigSchema.safeParse({
    accountId: formData.get("accountId"),
    bucketName: formData.get("bucketName"),
    publicBaseUrl: formData.get("publicBaseUrl"),
    uploadPrefix: formData.get("uploadPrefix"),
    maxUploadMb: formData.get("maxUploadMb"),
    allowedMimeTypes: formData.get("allowedMimeTypes"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ??
        "Enter valid Cloudflare R2 settings.",
      savedAt: null,
      connected: false,
    };
  }

  const accessKeyId = String(formData.get("accessKeyId") ?? "").trim();
  const secretAccessKey = String(formData.get("secretAccessKey") ?? "").trim();
  const existing = await prisma.integrationConnection.findUnique({
    where: { provider: cloudflareR2Provider },
  });
  const existingConfig = r2StoredConfigSchema.safeParse(existing?.config ?? {});
  const existingCredentials = existingConfig.success
    ? existingConfig.data.credentials
    : undefined;

  let credentials = existingCredentials;

  if (accessKeyId || secretAccessKey) {
    if (!accessKeyId || !secretAccessKey) {
      return {
        ok: false,
        message: "Enter both the R2 access key ID and secret access key.",
        savedAt: null,
        connected: false,
      };
    }

    if (!hasCredentialEncryptionKey()) {
      return {
        ok: false,
        message: "Set CREDENTIAL_ENCRYPTION_KEY before saving R2 credentials.",
        savedAt: null,
        connected: false,
      };
    }

    credentials = {
      accessKeyId: encryptSecret(accessKeyId),
      secretAccessKey: encryptSecret(secretAccessKey),
      savedAt: new Date().toISOString(),
    };
  }

  const config = {
    ...parsed.data,
    ...(credentials ? { credentials } : {}),
  };
  const isConnected = hasStoredR2Credentials(config);

  if (isConnected) {
    try {
      await verifyR2Connection(r2StoredConfigSchema.parse(config));
    } catch (error) {
      return {
        ok: false,
        message: r2ConnectionErrorMessage(error),
        savedAt: null,
        connected: false,
      };
    }
  }

  const savedConnection = await prisma.integrationConnection.upsert({
    where: { provider: cloudflareR2Provider },
    update: {
      name: "Cloudflare R2",
      description:
        "Object storage for CRM files, uploads, quote packs and call recordings.",
      status: isConnected ? "CONNECTED" : "NOT_CONNECTED",
      config,
    },
    create: {
      provider: cloudflareR2Provider,
      name: "Cloudflare R2",
      description:
        "Object storage for CRM files, uploads, quote packs and call recordings.",
      status: isConnected ? "CONNECTED" : "NOT_CONNECTED",
      config,
    },
  });
  await recordIntegrationSetupHealth({
    connected: isConnected,
    integrationId: savedConnection.id,
    message: isConnected
      ? "Cloudflare R2 settings saved with storage credentials."
      : "Cloudflare R2 settings saved without storage credentials.",
    metadata: {
      bucketName: config.bucketName,
      maxUploadMb: config.maxUploadMb,
      publicBaseUrlConfigured: Boolean(config.publicBaseUrl),
      uploadPrefix: config.uploadPrefix,
    },
    provider: cloudflareR2Provider,
  });

  revalidatePath("/settings/integrations");
  revalidatePath("/storage");
  revalidateStorageSupportData();

  return {
    ok: true,
    message: isConnected
      ? "Cloudflare R2 settings saved."
      : "Cloudflare R2 settings saved. Add R2 credentials to connect.",
    savedAt: Date.now(),
    connected: isConnected,
  };
}

export async function updateMailerSendIntegrationAction(
  _: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  await requireAdmin();

  const parsed = mailerSendSettingsFormSchema.safeParse({
    domainName: formData.get("domainName"),
    domainId: formData.get("domainId"),
    fromName: formData.get("fromName"),
    fromEmail: formData.get("fromEmail"),
    replyToEmail: formData.get("replyToEmail"),
    inboundDomain: formData.get("inboundDomain"),
    inboundRouteId: formData.get("inboundRouteId"),
    inboundRouteName: formData.get("inboundRouteName"),
    inboundCatchRecipient: formData.get("inboundCatchRecipient"),
    webhookBaseUrl: formData.get("webhookBaseUrl"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Enter valid MailerSend settings.",
      savedAt: null,
      connected: false,
    };
  }

  const apiToken = String(formData.get("apiToken") ?? "").trim();
  const inboundSecret = String(formData.get("inboundSecret") ?? "").trim();
  const existing = await prisma.integrationConnection.findUnique({
    where: { provider: mailerSendProvider },
  });
  const existingConfig = mailerSendStoredConfigSchema.safeParse(
    existing?.config ?? {},
  );
  const existingCredentials = existingConfig.success
    ? existingConfig.data.credentials
    : undefined;
  const existingOperationalConfig = existingConfig.success
    ? pickMailerSendOperationalConfig(existingConfig.data)
    : {};
  let credentials = existingCredentials;

  if (apiToken || inboundSecret) {
    if (!hasCredentialEncryptionKey()) {
      return {
        ok: false,
        message:
          "Set CREDENTIAL_ENCRYPTION_KEY before saving MailerSend credentials.",
        savedAt: null,
        connected: false,
      };
    }

    credentials = {
      ...(existingCredentials ?? {}),
      ...(apiToken ? { apiToken: encryptSecret(apiToken) } : {}),
      ...(inboundSecret ? { inboundSecret: encryptSecret(inboundSecret) } : {}),
      savedAt: new Date().toISOString(),
    };
  }

  const config = {
    ...existingOperationalConfig,
    ...parsed.data,
    ...(credentials ? { credentials } : {}),
  };
  const isConnected = hasStoredMailerSendCredentials(config);

  const savedConnection = await prisma.integrationConnection.upsert({
    where: { provider: mailerSendProvider },
    update: {
      name: "MailerSend",
      description:
        "Transactional email, domain authentication and inbound email routing.",
      status: isConnected ? "CONNECTED" : "NOT_CONNECTED",
      config,
    },
    create: {
      provider: mailerSendProvider,
      name: "MailerSend",
      description:
        "Transactional email, domain authentication and inbound email routing.",
      status: isConnected ? "CONNECTED" : "NOT_CONNECTED",
      config,
    },
  });
  await recordIntegrationSetupHealth({
    connected: isConnected,
    integrationId: savedConnection.id,
    message: isConnected
      ? "MailerSend settings saved with stored credentials."
      : "MailerSend settings saved without stored credentials.",
    metadata: {
      domainName: config.domainName,
      fromEmailConfigured: Boolean(config.fromEmail),
      inboundRoutingConfigured: Boolean(
        config.inboundDomain && config.inboundCatchRecipient,
      ),
    },
    provider: mailerSendProvider,
  });

  revalidatePath("/settings/integrations");
  revalidatePath("/settings/integrations/mailersend");

  return {
    ok: true,
    message: isConnected
      ? "MailerSend settings saved."
      : "MailerSend settings saved. Add an API token or inbound route secret to connect.",
    savedAt: Date.now(),
    connected: isConnected,
  };
}

export async function refreshMailerSendDomainValidationAction(
  previousState: IntegrationActionState,
): Promise<IntegrationActionState> {
  void previousState;
  await requireAdmin();

  const existing = await prisma.integrationConnection.findUnique({
    where: { provider: mailerSendProvider },
  });
  const existingConfig = mailerSendStoredConfigSchema.safeParse(
    existing?.config ?? {},
  );

  if (!existing || !existingConfig.success) {
    await recordIntegrationHealthSnapshot({
      capability: "domain-dns",
      integrationId: existing?.id,
      message: "Save MailerSend settings before refreshing domain validation.",
      provider: mailerSendProvider,
      source: "domain-validation",
      status: IntegrationHealthSnapshotStatus.WARNING,
    });

    return {
      ok: false,
      message: "Save MailerSend settings before refreshing domain validation.",
      savedAt: null,
      connected: false,
    };
  }

  if (!existingConfig.data.credentials?.apiToken) {
    await recordIntegrationHealthSnapshot({
      capability: "domain-dns",
      integrationId: existing.id,
      message:
        "Save a MailerSend API token before refreshing domain validation.",
      metadata: {
        domainName: existingConfig.data.domainName,
      },
      provider: mailerSendProvider,
      source: "domain-validation",
      status: IntegrationHealthSnapshotStatus.WARNING,
    });

    return {
      ok: false,
      message:
        "Save a MailerSend API token before refreshing domain validation.",
      savedAt: null,
      connected: false,
    };
  }

  if (!existingConfig.data.domainId) {
    await recordIntegrationHealthSnapshot({
      capability: "domain-dns",
      integrationId: existing.id,
      message:
        "Add the MailerSend domain ID before refreshing domain validation.",
      metadata: {
        domainName: existingConfig.data.domainName,
      },
      provider: mailerSendProvider,
      source: "domain-validation",
      status: IntegrationHealthSnapshotStatus.WARNING,
    });

    return {
      ok: false,
      message:
        "Add the MailerSend domain ID before refreshing domain validation.",
      savedAt: null,
      connected: hasStoredMailerSendCredentials(existingConfig.data),
    };
  }

  try {
    const { connected } = await refreshMailerSendDomainValidationConfig();
    await recordIntegrationHealthSnapshot({
      capability: "domain-dns",
      integrationId: existing.id,
      message: connected
        ? "MailerSend DNS records and domain validation refreshed."
        : "MailerSend domain validation refreshed with remaining setup gaps.",
      metadata: {
        domainId: existingConfig.data.domainId,
        domainName: existingConfig.data.domainName,
      },
      provider: mailerSendProvider,
      source: "domain-validation",
      status: connected
        ? IntegrationHealthSnapshotStatus.READY
        : IntegrationHealthSnapshotStatus.WARNING,
    });

    revalidatePath("/settings/integrations");
    revalidatePath("/settings/integrations/mailersend");

    return {
      ok: true,
      message: "MailerSend DNS records and domain validation refreshed.",
      savedAt: Date.now(),
      connected,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "MailerSend domain validation refresh failed.";

    await recordIntegrationHealthSnapshot({
      capability: "domain-dns",
      integrationId: existing.id,
      message,
      metadata: {
        domainId: existingConfig.data.domainId,
        domainName: existingConfig.data.domainName,
      },
      provider: mailerSendProvider,
      source: "domain-validation",
      status: IntegrationHealthSnapshotStatus.ERROR,
    });

    return {
      ok: false,
      message,
      savedAt: null,
      connected: hasStoredMailerSendCredentials(existingConfig.data),
    };
  }
}

function pickMailerSendOperationalConfig(config: MailerSendStoredConfig) {
  return Object.fromEntries(
    Object.entries({
      spfVerified: config.spfVerified,
      dkimVerified: config.dkimVerified,
      returnPathVerified: config.returnPathVerified,
      trackingVerified: config.trackingVerified,
      inboundVerified: config.inboundVerified,
      domainStatus: config.domainStatus,
      lastCheckedAt: config.lastCheckedAt,
      spfHost: config.spfHost,
      spfValue: config.spfValue,
      dkimHost: config.dkimHost,
      dkimValue: config.dkimValue,
      returnPathHost: config.returnPathHost,
      returnPathValue: config.returnPathValue,
      trackingHost: config.trackingHost,
      trackingValue: config.trackingValue,
      inboundMxHost: config.inboundMxHost,
      inboundMxValue: config.inboundMxValue,
      inboundMxPriority: config.inboundMxPriority,
    }).filter(([, value]) => value !== undefined),
  );
}

export async function updateTwilioIntegrationAction(
  _: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  await requireAdmin();

  const capabilities = ["voice", "sms", "whatsapp"].filter(
    (capability): capability is TwilioConfig["capabilities"][number] =>
      formData.get(`capability-${capability}`) === "on",
  );

  const parsed = twilioConfigSchema.safeParse({
    accountSid: formData.get("accountSid"),
    apiKeySid: formData.get("apiKeySid"),
    twimlAppSid: formData.get("twimlAppSid"),
    voiceIntelligenceServiceSid: formData.get("voiceIntelligenceServiceSid"),
    messagingServiceSid: formData.get("messagingServiceSid"),
    smsFromNumber: formData.get("smsFromNumber"),
    whatsappFromNumber: formData.get("whatsappFromNumber"),
    voiceCallerId: formData.get("voiceCallerId"),
    webhookBaseUrl: formData.get("webhookBaseUrl"),
    capabilities: capabilities.length ? capabilities : [],
  });

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Enter valid Twilio settings.",
      savedAt: null,
      connected: false,
    };
  }

  const authToken = String(formData.get("authToken") ?? "").trim();
  const apiKeySecret = String(formData.get("apiKeySecret") ?? "").trim();
  const existing = await prisma.integrationConnection.findUnique({
    where: { provider: twilioProvider },
  });
  const existingConfig = twilioStoredConfigSchema.safeParse(
    existing?.config ?? {},
  );
  const existingCredentials = existingConfig.success
    ? existingConfig.data.credentials
    : undefined;
  let credentials = existingCredentials;

  if (authToken || apiKeySecret) {
    if (!hasCredentialEncryptionKey()) {
      return {
        ok: false,
        message:
          "Set CREDENTIAL_ENCRYPTION_KEY before saving Twilio credentials.",
        savedAt: null,
        connected: false,
      };
    }

    if (!authToken && !existingCredentials?.authToken) {
      return {
        ok: false,
        message: "Enter the Twilio Auth Token.",
        savedAt: null,
        connected: false,
      };
    }

    if (apiKeySecret && !parsed.data.apiKeySid) {
      return {
        ok: false,
        message:
          "Enter the Twilio API key SID before saving the Client Secret.",
        savedAt: null,
        connected: false,
      };
    }

    credentials = {
      authToken: authToken
        ? encryptSecret(authToken)
        : (existingCredentials?.authToken ?? ""),
      ...(apiKeySecret
        ? { apiKeySecret: encryptSecret(apiKeySecret) }
        : existingCredentials?.apiKeySecret
          ? { apiKeySecret: existingCredentials.apiKeySecret }
          : {}),
      savedAt: new Date().toISOString(),
    };
  }

  let config = {
    ...parsed.data,
    ...(existingConfig.success && existingConfig.data.importedInventory
      ? { importedInventory: existingConfig.data.importedInventory }
      : {}),
    ...(existingConfig.success && existingConfig.data.recording
      ? { recording: existingConfig.data.recording }
      : {}),
    ...(credentials ? { credentials } : {}),
  };
  let wasApiKeyCreated = false;
  const shouldValidateOrCreateVoiceKey =
    parsed.data.capabilities.includes("voice") &&
    Boolean(
      parsed.data.accountSid &&
      parsed.data.twimlAppSid &&
      credentials?.authToken,
    );

  if (shouldValidateOrCreateVoiceKey && credentials?.authToken) {
    let voiceAuthToken = authToken;
    let voiceApiKeySecret = apiKeySecret;

    try {
      voiceAuthToken ||= decryptSecret(credentials.authToken);
      if (credentials.apiKeySecret) {
        voiceApiKeySecret ||= decryptSecret(credentials.apiKeySecret);
      }
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Unable to decrypt Twilio credentials.",
        savedAt: null,
        connected: false,
      };
    }

    let shouldCreateApiKey = !parsed.data.apiKeySid || !voiceApiKeySecret;

    if (!shouldCreateApiKey) {
      const validation = await validateTwilioVoiceAccess({
        accountSid: parsed.data.accountSid,
        authToken: voiceAuthToken,
        apiKeySid: parsed.data.apiKeySid,
        apiKeySecret: voiceApiKeySecret,
        twimlAppSid: parsed.data.twimlAppSid,
      });

      if (!validation.ok && validation.failedCredential === "account") {
        return {
          ok: false,
          message: validation.message,
          savedAt: null,
          connected: false,
        };
      }

      shouldCreateApiKey = !validation.ok;
    }

    if (shouldCreateApiKey) {
      const createdKey = await createTwilioApiKey({
        accountSid: parsed.data.accountSid,
        authToken: voiceAuthToken,
      });

      if (!createdKey.ok) {
        return {
          ok: false,
          message: createdKey.message,
          savedAt: null,
          connected: false,
        };
      }

      config = {
        ...config,
        apiKeySid: createdKey.sid,
        credentials: {
          ...credentials,
          apiKeySecret: encryptSecret(createdKey.secret),
          savedAt: new Date().toISOString(),
        },
      };
      voiceApiKeySecret = createdKey.secret;
      wasApiKeyCreated = true;
    }

    const validation = await validateTwilioVoiceAccess({
      accountSid: parsed.data.accountSid,
      authToken: voiceAuthToken,
      apiKeySid: config.apiKeySid,
      apiKeySecret: voiceApiKeySecret,
      twimlAppSid: parsed.data.twimlAppSid,
    });

    if (!validation.ok) {
      return {
        ok: false,
        message: validation.message,
        savedAt: null,
        connected: false,
      };
    }
  }
  const isConnected = hasStoredTwilioCredentials(config);

  const voiceCallerId = normalizeCallableNumber(config.voiceCallerId ?? "");
  const importedVoiceNumber = voiceCallerId
    ? importedPhoneNumberForConfig(config, voiceCallerId)
    : null;
  const writes: Prisma.PrismaPromise<unknown>[] = [
    prisma.integrationConnection.upsert({
      where: { provider: twilioProvider },
      update: {
        name: "Twilio",
        description:
          "Voice, SMS and WhatsApp communications for CRM conversations.",
        status: isConnected ? "CONNECTED" : "NOT_CONNECTED",
        config: config as Prisma.InputJsonValue,
      },
      create: {
        provider: twilioProvider,
        name: "Twilio",
        description:
          "Voice, SMS and WhatsApp communications for CRM conversations.",
        status: isConnected ? "CONNECTED" : "NOT_CONNECTED",
        config: config as Prisma.InputJsonValue,
      },
    }),
  ];

  if (voiceCallerId && importedVoiceNumber) {
    writes.push(
      prisma.businessPhoneNumber.upsert({
        where: { phoneNumber: voiceCallerId },
        update: {
          label:
            recordString(importedVoiceNumber.friendlyName) ||
            "Default voice number",
          twilioPhoneNumberSid: recordString(importedVoiceNumber.sid),
          capabilities: inventoryRecord(
            importedVoiceNumber.capabilities,
          ) as Prisma.InputJsonValue,
          status: "ACTIVE",
          releasedAt: null,
          metadata: {
            provider: "twilio",
            importedFromTwilio: true,
            source: "voiceCallerId",
            voiceUrl: recordString(importedVoiceNumber.voiceUrl),
            smsUrl: recordString(importedVoiceNumber.smsUrl),
          },
        },
        create: {
          phoneNumber: voiceCallerId,
          label:
            recordString(importedVoiceNumber.friendlyName) ||
            "Default voice number",
          twilioPhoneNumberSid: recordString(importedVoiceNumber.sid),
          capabilities: inventoryRecord(
            importedVoiceNumber.capabilities,
          ) as Prisma.InputJsonValue,
          metadata: {
            provider: "twilio",
            importedFromTwilio: true,
            source: "voiceCallerId",
            voiceUrl: recordString(importedVoiceNumber.voiceUrl),
            smsUrl: recordString(importedVoiceNumber.smsUrl),
          },
        },
      }),
    );
  }

  await prisma.$transaction(writes);
  const savedConnection = await prisma.integrationConnection.findUnique({
    where: { provider: twilioProvider },
    select: { id: true },
  });
  await recordIntegrationSetupHealth({
    connected: isConnected,
    integrationId: savedConnection?.id,
    message: isConnected
      ? "Twilio settings saved with account credentials."
      : "Twilio settings saved without account credentials.",
    metadata: {
      apiKeyCreated: wasApiKeyCreated,
      capabilities: config.capabilities,
      messagingConfigured: Boolean(
        config.messagingServiceSid ||
        config.smsFromNumber ||
        config.whatsappFromNumber,
      ),
      voiceConfigured: Boolean(config.twimlAppSid && config.voiceCallerId),
      webhookBaseUrlConfigured: Boolean(config.webhookBaseUrl),
    },
    provider: twilioProvider,
  });

  revalidatePath("/settings/integrations");
  revalidatePath("/settings/integrations/twilio");
  revalidatePath("/telephony");
  revalidatePath("/telephony/system");

  return {
    ok: true,
    message: wasApiKeyCreated
      ? "Twilio settings saved. A new CRM API key was created automatically."
      : isConnected
        ? "Twilio settings saved."
        : "Twilio settings saved. Add the Auth Token to connect.",
    savedAt: Date.now(),
    connected: isConnected,
  };
}

export async function importTwilioConfigurationAction(
  previousState: TwilioImportState,
): Promise<TwilioImportState> {
  void previousState;

  await requireAdmin();

  const connection = await prisma.integrationConnection.findUnique({
    where: { provider: twilioProvider },
  });
  const parsed = twilioStoredConfigSchema.safeParse(connection?.config ?? {});

  if (!parsed.success || !parsed.data.credentials?.authToken) {
    await recordIntegrationHealthSnapshot({
      capability: "configuration-import",
      integrationId: connection?.id,
      message: "Save the Twilio Account SID and Auth Token before importing.",
      provider: twilioProvider,
      source: "configuration-import",
      status: IntegrationHealthSnapshotStatus.WARNING,
    });

    return {
      ok: false,
      message: "Save the Twilio Account SID and Auth Token before importing.",
      savedAt: null,
      connected: false,
    };
  }

  try {
    const authToken = decryptSecret(parsed.data.credentials.authToken);
    const client = twilio(parsed.data.accountSid, authToken);
    const [incomingNumbers, addresses, messagingServices] = await Promise.all([
      client.incomingPhoneNumbers.list({ limit: 100 }),
      client.addresses.list({ limit: 100 }),
      client.messaging.v1.services.list({ limit: 50 }),
    ]);
    const bundleResults = await Promise.all(
      ["local", "national", "mobile", "toll-free"].map(async (numberType) => {
        try {
          const bundles =
            await client.numbers.v2.regulatoryCompliance.bundles.list({
              numberType,
              status: "twilio-approved",
              limit: 100,
            });

          return bundles.map((bundle) => ({ bundle, numberType }));
        } catch {
          return [];
        }
      }),
    );
    const bundles = bundleResults.flat();
    const serviceNumbers = await Promise.all(
      messagingServices.map(async (service) => {
        try {
          const numbers = await client.messaging.v1
            .services(service.sid)
            .phoneNumbers.list({ limit: 100 });

          return numbers.map((number) => ({
            capabilities: number.capabilities,
            countryCode: number.countryCode,
            phoneNumber: number.phoneNumber,
            serviceSid: number.serviceSid,
            sid: number.sid,
          }));
        } catch {
          return [];
        }
      }),
    );
    const flatServiceNumbers = serviceNumbers.flat();
    const smsCapableNumber =
      incomingNumbers.find((number) =>
        hasCapability(number.capabilities, "sms"),
      ) ?? null;
    const voiceCapableNumber =
      incomingNumbers.find((number) =>
        hasCapability(number.capabilities, "voice"),
      ) ?? null;
    const messagingService = messagingServices[0] ?? null;
    const importedAt = new Date().toISOString();
    const importedInventory = {
      lastImportedAt: importedAt,
      addresses: addresses.map((address) => ({
        city: address.city,
        country: address.isoCountry,
        customerName: address.customerName,
        label: address.friendlyName || address.customerName || address.sid,
        postalCode: address.postalCode,
        region: address.region,
        sid: address.sid,
        street: address.street,
        validated: Boolean(address.validated),
        verified: Boolean(address.verified),
      })),
      bundles: bundles.map(({ bundle, numberType }) => ({
        label: bundle.friendlyName || bundle.sid,
        numberType,
        regulationSid: bundle.regulationSid,
        sid: bundle.sid,
        status: bundle.status,
        validUntil: bundle.validUntil?.toISOString() ?? null,
      })),
      messagingServices: messagingServices.map((service) => ({
        friendlyName: service.friendlyName,
        inboundRequestUrl: service.inboundRequestUrl,
        numbers: flatServiceNumbers.filter(
          (number) => number.serviceSid === service.sid,
        ),
        sid: service.sid,
        statusCallback: service.statusCallback,
      })),
      phoneNumbers: incomingNumbers.map((number) => ({
        capabilities: number.capabilities ?? {},
        friendlyName: number.friendlyName,
        phoneNumber: number.phoneNumber,
        sid: number.sid,
        smsUrl: number.smsUrl,
        voiceUrl: number.voiceUrl,
      })),
    };

    for (const number of incomingNumbers) {
      const phoneNumber = normalizeCallableNumber(number.phoneNumber);

      if (!phoneNumber) continue;

      await prisma.attributionPhoneNumber.upsert({
        where: { phoneNumber },
        update: {
          label: number.friendlyName || "Imported Twilio number",
          metadata: {
            provider: "twilio",
            twilioPhoneNumberSid: number.sid,
            capabilities: number.capabilities ?? {},
            importedAt,
            smsUrl: number.smsUrl || null,
            voiceUrl: number.voiceUrl || null,
          },
        },
        create: {
          phoneNumber,
          label: number.friendlyName || "Imported Twilio number",
          isActive: false,
          metadata: {
            provider: "twilio",
            twilioPhoneNumberSid: number.sid,
            capabilities: number.capabilities ?? {},
            importedAt,
            importedFromTwilio: true,
            smsUrl: number.smsUrl || null,
            voiceUrl: number.voiceUrl || null,
          },
        },
      });
    }

    const nextConfig = {
      ...parsed.data,
      messagingServiceSid:
        parsed.data.messagingServiceSid || messagingService?.sid || "",
      smsFromNumber:
        parsed.data.smsFromNumber ||
        normalizeCallableNumber(smsCapableNumber?.phoneNumber ?? "") ||
        "",
      voiceCallerId:
        parsed.data.voiceCallerId ||
        normalizeCallableNumber(voiceCapableNumber?.phoneNumber ?? "") ||
        "",
      capabilities: Array.from(
        new Set([
          ...parsed.data.capabilities,
          ...(messagingService || smsCapableNumber ? ["sms" as const] : []),
          ...(voiceCapableNumber ? ["voice" as const] : []),
        ]),
      ),
      importedInventory,
    };

    const defaultVoiceNumber = normalizeCallableNumber(
      nextConfig.voiceCallerId ?? "",
    );
    const defaultIncomingNumber = defaultVoiceNumber
      ? incomingNumbers.find(
          (number) =>
            normalizeCallableNumber(number.phoneNumber) === defaultVoiceNumber,
        )
      : null;
    const writes: Prisma.PrismaPromise<unknown>[] = [
      prisma.integrationConnection.update({
        where: { provider: twilioProvider },
        data: {
          status: hasStoredTwilioCredentials(nextConfig)
            ? "CONNECTED"
            : "NOT_CONNECTED",
          config: nextConfig as Prisma.InputJsonValue,
        },
      }),
    ];

    if (defaultIncomingNumber) {
      writes.push(
        prisma.businessPhoneNumber.upsert({
          where: { phoneNumber: defaultVoiceNumber },
          update: {
            label: defaultIncomingNumber.friendlyName || "Default voice number",
            twilioPhoneNumberSid: defaultIncomingNumber.sid,
            capabilities: (defaultIncomingNumber.capabilities ??
              {}) as Prisma.InputJsonValue,
            status: "ACTIVE",
            releasedAt: null,
            metadata: {
              provider: "twilio",
              importedAt,
              importedFromTwilio: true,
              source: "voiceCallerId",
              smsUrl: defaultIncomingNumber.smsUrl || null,
              voiceUrl: defaultIncomingNumber.voiceUrl || null,
            },
          },
          create: {
            phoneNumber: defaultVoiceNumber,
            label: defaultIncomingNumber.friendlyName || "Default voice number",
            twilioPhoneNumberSid: defaultIncomingNumber.sid,
            capabilities: (defaultIncomingNumber.capabilities ??
              {}) as Prisma.InputJsonValue,
            metadata: {
              provider: "twilio",
              importedAt,
              importedFromTwilio: true,
              source: "voiceCallerId",
              smsUrl: defaultIncomingNumber.smsUrl || null,
              voiceUrl: defaultIncomingNumber.voiceUrl || null,
            },
          },
        }),
      );
    }

    await prisma.$transaction(writes);
    await recordIntegrationHealthSnapshot({
      capability: "configuration-import",
      integrationId: connection?.id,
      message:
        "Imported Twilio services, phone numbers, addresses and regulatory bundles.",
      metadata: {
        addresses: addresses.length,
        bundles: bundles.length,
        messagingServices: messagingServices.length,
        phoneNumbers: incomingNumbers.length,
      },
      provider: twilioProvider,
      source: "configuration-import",
      status: IntegrationHealthSnapshotStatus.READY,
    });

    revalidatePath("/settings/integrations");
    revalidatePath("/settings/integrations/twilio");
    revalidatePath("/telephony/numbers");
    revalidatePath("/telephony/system");
    revalidatePath("/telephony/call-tracking");
    revalidatePath("/telephony/call-tracking/overview");

    return {
      ok: true,
      message:
        "Imported Twilio services, phone numbers, addresses and regulatory bundles.",
      savedAt: Date.now(),
      connected: true,
      imported: {
        addresses: addresses.length,
        bundles: bundles.length,
        messagingServices: messagingServices.length,
        phoneNumbers: incomingNumbers.length,
      },
    };
  } catch (error) {
    const message = `Twilio import failed. ${twilioApiErrorMessage(error)}`;

    await recordIntegrationHealthSnapshot({
      capability: "configuration-import",
      integrationId: connection?.id,
      message,
      provider: twilioProvider,
      source: "configuration-import",
      status: IntegrationHealthSnapshotStatus.ERROR,
    });

    return {
      ok: false,
      message,
      savedAt: null,
      connected: false,
    };
  }
}

export async function searchTwilioCrmNumbersAction(
  _: TwilioNumberSearchState,
  formData: FormData,
): Promise<TwilioNumberSearchState> {
  await requireAdmin();

  const parsed = twilioNumberSearchSchema.safeParse({
    country: formData.get("numberCountry"),
    numberType: formData.get("numberType"),
    areaCode: formData.get("numberAreaCode"),
    contains: formData.get("numberContains"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Enter a valid number search.",
      numbers: [],
    };
  }

  const connection = await prisma.integrationConnection.findUnique({
    where: { provider: twilioProvider },
  });
  const config = twilioStoredConfigSchema.safeParse(connection?.config ?? {});

  if (!config.success || !config.data.credentials?.authToken) {
    return {
      ok: false,
      message: "Save the Twilio Account SID and Auth Token first.",
      numbers: [],
    };
  }

  try {
    const authToken = decryptSecret(config.data.credentials.authToken);
    const client = twilio(config.data.accountSid, authToken);
    const numbers = await listAvailableCrmNumbers(
      client,
      config.data,
      parsed.data,
      8,
    );
    const searchedBlockedMobile =
      parsed.data.numberType === "mobile" &&
      requiresApprovedBundleForPurchase({
        country: parsed.data.country,
        numberType: parsed.data.numberType,
      }) &&
      !(await approvedBundleSidForNumber({
        client,
        config: config.data,
        country: parsed.data.country,
        numberType: parsed.data.numberType,
      }));

    return {
      ok: !searchedBlockedMobile,
      message: searchedBlockedMobile
        ? regulatoryBundleRequiredMessage(parsed.data.country)
        : numbers.length
          ? `${numbers.length} available CRM number${numbers.length === 1 ? "" : "s"} found.`
          : "No voice and SMS capable numbers were found. Try Any, remove the area code, or choose a different country.",
      numbers,
    };
  } catch (error) {
    return {
      ok: false,
      message: `Could not search Twilio numbers. ${twilioApiErrorMessage(error)}`,
      numbers: [],
    };
  }
}

export async function generateTwilioGbMobileBundleAction(
  _: TwilioComplianceBundleState,
  formData: FormData,
): Promise<TwilioComplianceBundleState> {
  await requireAdmin();

  const parsed = gbMobileBundleSchema.safeParse({
    businessName: formData.get("businessName"),
    businessRegistrationNumber: formData.get("businessRegistrationNumber"),
    businessWebsite: formData.get("businessWebsite"),
    complianceEmail: formData.get("complianceEmail"),
    addressLine1: formData.get("addressLine1"),
    addressLine2: formData.get("addressLine2"),
    city: formData.get("city"),
    region: formData.get("region"),
    postalCode: formData.get("postalCode"),
    representativeName: formData.get("representativeName"),
    representativeEmail: formData.get("representativeEmail"),
    representativePhone: formData.get("representativePhone"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Enter valid compliance details.",
      savedAt: null,
      connected: false,
      bundleSid: null,
      status: null,
    };
  }

  const connection = await prisma.integrationConnection.findUnique({
    where: { provider: twilioProvider },
  });
  const config = twilioStoredConfigSchema.safeParse(connection?.config ?? {});

  if (!config.success || !config.data.credentials?.authToken) {
    return {
      ok: false,
      message: "Save the Twilio Account SID and Auth Token first.",
      savedAt: null,
      connected: false,
      bundleSid: null,
      status: null,
    };
  }

  try {
    const authToken = decryptSecret(config.data.credentials.authToken);
    const client = twilio(config.data.accountSid, authToken);
    const regulation = await targetBusinessRegulationForNumberType({
      client,
      country: "GB",
      numberType: "mobile",
    });

    if (!regulation) {
      return {
        ok: false,
        message:
          "Twilio did not return a GB mobile business regulation to build a bundle against.",
        savedAt: null,
        connected: false,
        bundleSid: null,
        status: null,
      };
    }

    const data = parsed.data;
    const [firstName, ...remainingNames] = data.representativeName.split(/\s+/);
    const lastName = remainingNames.join(" ") || firstName;
    const address = await client.addresses.create({
      customerName: data.businessName,
      street: data.addressLine1,
      streetSecondary: data.addressLine2,
      city: data.city,
      region: data.region,
      postalCode: data.postalCode,
      isoCountry: "GB",
      friendlyName: `${data.businessName} compliance address`,
      autoCorrectAddress: true,
    });
    const endUser =
      await client.numbers.v2.regulatoryCompliance.endUsers.create({
        friendlyName: `${data.businessName} business end user`,
        type: "business",
        attributes: {
          business_name: data.businessName,
          business_registration_number: data.businessRegistrationNumber,
          business_website: data.businessWebsite,
          email: data.complianceEmail,
          first_name: firstName,
          last_name: lastName,
          phone_number: data.representativePhone,
        },
      });
    const businessDocument =
      await client.numbers.v2.regulatoryCompliance.supportingDocuments.create({
        friendlyName: `${data.businessName} business registration`,
        type: "business_registration",
        attributes: {
          business_name: data.businessName,
          business_registration_number: data.businessRegistrationNumber,
          business_website: data.businessWebsite,
        },
      });
    const addressDocument =
      await client.numbers.v2.regulatoryCompliance.supportingDocuments.create({
        friendlyName: `${data.businessName} business address`,
        type: "address",
        attributes: {
          address_sids: address.sid,
          address_sid: address.sid,
          business_name: data.businessName,
          street: data.addressLine1,
          street_secondary: data.addressLine2,
          city: data.city,
          region: data.region,
          postal_code: data.postalCode,
          iso_country: "GB",
        },
      });
    const bundle = await client.numbers.v2.regulatoryCompliance.bundles.create({
      friendlyName: `${data.businessName} GB mobile`,
      email: data.complianceEmail,
      regulationSid: regulation.sid,
    });

    for (const objectSid of [
      endUser.sid,
      businessDocument.sid,
      addressDocument.sid,
    ]) {
      await client.numbers.v2.regulatoryCompliance
        .bundles(bundle.sid)
        .itemAssignments.create({ objectSid });
    }

    const evaluation = await client.numbers.v2.regulatoryCompliance
      .bundles(bundle.sid)
      .evaluations.create();

    await syncGeneratedTwilioComplianceRecords({
      config: config.data,
      address: {
        city: address.city,
        country: address.isoCountry,
        customerName: address.customerName,
        label: address.friendlyName || address.customerName || address.sid,
        postalCode: address.postalCode,
        region: address.region,
        sid: address.sid,
        street: address.street,
        validated: Boolean(address.validated),
        verified: Boolean(address.verified),
      },
      bundle: {
        label: bundle.friendlyName || bundle.sid,
        numberType: "mobile",
        regulationSid: bundle.regulationSid,
        sid: bundle.sid,
        status: bundle.status,
        validUntil: bundle.validUntil?.toISOString() ?? null,
      },
    });

    if (evaluation.status !== "compliant") {
      const violations = evaluationViolations(evaluation.results);

      return {
        ok: false,
        message: `Bundle ${bundle.sid} was created but Twilio says it is not compliant${violations ? `: ${violations}` : "."}`,
        savedAt: Date.now(),
        connected: true,
        bundleSid: bundle.sid,
        status: "draft",
      };
    }

    const submitted = await client.numbers.v2.regulatoryCompliance
      .bundles(bundle.sid)
      .update({ status: "pending-review" });

    await syncGeneratedTwilioComplianceRecords({
      config: config.data,
      address: {
        city: address.city,
        country: address.isoCountry,
        customerName: address.customerName,
        label: address.friendlyName || address.customerName || address.sid,
        postalCode: address.postalCode,
        region: address.region,
        sid: address.sid,
        street: address.street,
        validated: Boolean(address.validated),
        verified: Boolean(address.verified),
      },
      bundle: {
        label: submitted.friendlyName || submitted.sid,
        numberType: "mobile",
        regulationSid: submitted.regulationSid,
        sid: submitted.sid,
        status: submitted.status,
        validUntil: submitted.validUntil?.toISOString() ?? null,
      },
    });
    revalidatePath("/settings/integrations");
    revalidatePath("/settings/integrations/twilio");
    revalidatePath("/telephony/numbers");
    revalidatePath("/telephony/system");

    return {
      ok: true,
      message: `GB mobile bundle ${submitted.sid} was created and submitted to Twilio for review. Once Twilio approves it, retry the mobile number purchase.`,
      savedAt: Date.now(),
      connected: true,
      bundleSid: submitted.sid,
      status: submitted.status,
    };
  } catch (error) {
    return {
      ok: false,
      message: `Could not generate the GB mobile bundle. ${twilioApiErrorMessage(error)}`,
      savedAt: null,
      connected: false,
      bundleSid: null,
      status: null,
    };
  }
}

export async function generateTwilioGbMobileBundleFromExistingAction(
  previousState: TwilioComplianceBundleState,
  formData: FormData,
): Promise<TwilioComplianceBundleState> {
  void previousState;
  void formData;

  await requireAdmin();

  const connection = await prisma.integrationConnection.findUnique({
    where: { provider: twilioProvider },
  });
  const config = twilioStoredConfigSchema.safeParse(connection?.config ?? {});

  if (!config.success || !config.data.credentials?.authToken) {
    return {
      ok: false,
      message: "Save the Twilio Account SID and Auth Token first.",
      savedAt: null,
      connected: false,
      bundleSid: null,
      status: null,
    };
  }

  try {
    const authToken = decryptSecret(config.data.credentials.authToken);
    const client = twilio(config.data.accountSid, authToken);
    const regulation = await targetBusinessRegulationForNumberType({
      client,
      country: "GB",
      numberType: "mobile",
    });

    if (!regulation) {
      return {
        ok: false,
        message:
          "Twilio did not return a GB mobile business regulation to build a bundle against.",
        savedAt: null,
        connected: false,
        bundleSid: null,
        status: null,
      };
    }

    const existingBundles = await listBundlesForRegulation({
      client,
      regulationSid: regulation.sid,
    });
    const approved = existingBundles.find((bundle) =>
      ["twilio-approved", "provisionally-approved"].includes(bundle.status),
    );

    if (approved) {
      await syncGeneratedTwilioComplianceRecords({
        config: config.data,
        bundle: {
          label: approved.friendlyName || approved.sid,
          numberType: "mobile",
          regulationSid: approved.regulationSid,
          sid: approved.sid,
          status: approved.status,
          validUntil: approved.validUntil?.toISOString() ?? null,
        },
      });

      return {
        ok: true,
        message: `Approved GB mobile bundle ${approved.sid} is already available. Retry the mobile number purchase.`,
        savedAt: Date.now(),
        connected: true,
        bundleSid: approved.sid,
        status: approved.status,
      };
    }

    const inProgress = existingBundles.find((bundle) =>
      ["pending-review", "in-review"].includes(bundle.status),
    );

    if (inProgress) {
      await syncGeneratedTwilioComplianceRecords({
        config: config.data,
        bundle: {
          label: inProgress.friendlyName || inProgress.sid,
          numberType: "mobile",
          regulationSid: inProgress.regulationSid,
          sid: inProgress.sid,
          status: inProgress.status,
          validUntil: inProgress.validUntil?.toISOString() ?? null,
        },
      });

      return {
        ok: true,
        message: `GB mobile bundle ${inProgress.sid} is already ${inProgress.status}. Wait for Twilio approval, then retry the mobile number purchase.`,
        savedAt: Date.now(),
        connected: true,
        bundleSid: inProgress.sid,
        status: inProgress.status,
      };
    }

    const source = await findBundleWithReusableAssignments(client);

    if (!source) {
      return {
        ok: false,
        message:
          "No existing Twilio bundle with reusable End User and document assignments was found. Use the manual bundle form once, then future bundles can reuse it.",
        savedAt: null,
        connected: true,
        bundleSid: null,
        status: null,
      };
    }

    const draft = existingBundles.find((bundle) => bundle.status === "draft");
    const target =
      draft ??
      (await client.numbers.v2.regulatoryCompliance.bundles.create({
        email: source.bundle.email,
        friendlyName: `${regulation.friendlyName} - reused compliance details`,
        regulationSid: regulation.sid,
      }));
    const existingAssignments = draft
      ? await client.numbers.v2.regulatoryCompliance
          .bundles(target.sid)
          .itemAssignments.list({ limit: 50 })
      : [];
    const assignedObjectSids = new Set(
      existingAssignments.map((assignment) => assignment.objectSid),
    );

    for (const assignment of source.assignments) {
      if (assignedObjectSids.has(assignment.objectSid)) continue;

      await client.numbers.v2.regulatoryCompliance
        .bundles(target.sid)
        .itemAssignments.create({ objectSid: assignment.objectSid });
    }

    const evaluation = await client.numbers.v2.regulatoryCompliance
      .bundles(target.sid)
      .evaluations.create();

    await syncGeneratedTwilioComplianceRecords({
      config: config.data,
      bundle: {
        label: target.friendlyName || target.sid,
        numberType: "mobile",
        regulationSid: target.regulationSid,
        sid: target.sid,
        status: target.status,
        validUntil: target.validUntil?.toISOString() ?? null,
      },
    });

    if (evaluation.status !== "compliant") {
      const violations = evaluationViolations(evaluation.results);

      return {
        ok: false,
        message: `GB mobile bundle ${target.sid} was created from existing Twilio details but is not compliant${violations ? `: ${violations}` : "."}`,
        savedAt: Date.now(),
        connected: true,
        bundleSid: target.sid,
        status: "draft",
      };
    }

    const submitted = await client.numbers.v2.regulatoryCompliance
      .bundles(target.sid)
      .update({ status: "pending-review" });

    await syncGeneratedTwilioComplianceRecords({
      config: config.data,
      bundle: {
        label: submitted.friendlyName || submitted.sid,
        numberType: "mobile",
        regulationSid: submitted.regulationSid,
        sid: submitted.sid,
        status: submitted.status,
        validUntil: submitted.validUntil?.toISOString() ?? null,
      },
    });
    revalidatePath("/settings/integrations");
    revalidatePath("/settings/integrations/twilio");
    revalidatePath("/telephony/numbers");
    revalidatePath("/telephony/system");

    return {
      ok: true,
      message: `GB mobile bundle ${submitted.sid} was created from existing Twilio compliance details and submitted for review. Once Twilio approves it, retry the mobile number purchase.`,
      savedAt: Date.now(),
      connected: true,
      bundleSid: submitted.sid,
      status: submitted.status,
    };
  } catch (error) {
    return {
      ok: false,
      message: `Could not reuse existing Twilio compliance details. ${twilioApiErrorMessage(error)}`,
      savedAt: null,
      connected: false,
      bundleSid: null,
      status: null,
    };
  }
}

export async function purchaseTwilioCrmNumberAction(
  previousState: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  void previousState;

  await requireAdmin();

  const rawPayload = String(formData.get("numberPayload") ?? "");
  const payload = (() => {
    try {
      return JSON.parse(rawPayload) as unknown;
    } catch {
      return {};
    }
  })();
  const parsed = twilioNumberPurchaseSchema.safeParse(payload);

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Choose a valid Twilio number.",
      savedAt: null,
      connected: false,
    };
  }

  const connection = await prisma.integrationConnection.findUnique({
    where: { provider: twilioProvider },
  });
  const config = twilioStoredConfigSchema.safeParse(connection?.config ?? {});

  if (!config.success || !config.data.credentials?.authToken) {
    return {
      ok: false,
      message: "Save the Twilio Account SID and Auth Token first.",
      savedAt: null,
      connected: false,
    };
  }

  if (!config.data.webhookBaseUrl) {
    return {
      ok: false,
      message: "Add the webhook base URL before buying a CRM number.",
      savedAt: null,
      connected: false,
    };
  }

  try {
    const authToken = decryptSecret(config.data.credentials.authToken);
    const client = twilio(config.data.accountSid, authToken);
    const voiceUrl = voiceWebhookUrl(config.data.webhookBaseUrl);
    const messagingUrl = messagingWebhookUrl(config.data.webhookBaseUrl);
    const addressSid = addressSidForCountry(config.data, parsed.data.country);
    const bundleSid = await approvedBundleSidForNumber({
      client,
      config: config.data,
      country: parsed.data.country,
      numberType: parsed.data.numberType,
    });
    if (
      requiresApprovedBundleForPurchase({
        country: parsed.data.country,
        numberType: parsed.data.numberType,
      }) &&
      !bundleSid
    ) {
      return {
        ok: false,
        message: regulatoryBundleRequiredMessage(parsed.data.country),
        savedAt: null,
        connected: false,
      };
    }
    const purchased = await client.incomingPhoneNumbers.create({
      phoneNumber: parsed.data.phoneNumber,
      friendlyName: "CRM main number",
      voiceUrl,
      voiceMethod: "POST",
      smsUrl: messagingUrl,
      smsMethod: "POST",
      ...(addressSid ? { addressSid } : {}),
      ...(bundleSid ? { bundleSid } : {}),
    });
    const phoneNumber = normalizeCallableNumber(purchased.phoneNumber);
    const messagingService = await configureMessagingServiceForNumber({
      client,
      config: config.data,
      messagingUrl,
      phoneNumber,
      phoneNumberSid: purchased.sid,
    });
    const importedInventory = {
      ...(config.data.importedInventory ?? {
        addresses: [],
        bundles: [],
        messagingServices: [],
        phoneNumbers: [],
      }),
      lastImportedAt: new Date().toISOString(),
      messagingServices: [
        ...(config.data.importedInventory?.messagingServices ?? []).filter(
          (service) =>
            inventoryRecord(service).sid !== messagingService.service.sid,
        ),
        {
          friendlyName: messagingService.service.friendlyName,
          inboundRequestUrl: messagingUrl,
          numbers: messagingService.numbers.map((number) => ({
            capabilities: number.capabilities,
            countryCode: number.countryCode,
            phoneNumber: number.phoneNumber,
            serviceSid: number.serviceSid,
            sid: number.sid,
          })),
          sid: messagingService.service.sid,
          statusCallback: messagingUrl,
        },
      ],
      phoneNumbers: [
        ...(config.data.importedInventory?.phoneNumbers ?? []).filter(
          (number) => inventoryRecord(number).sid !== purchased.sid,
        ),
        {
          capabilities: purchased.capabilities ?? {},
          friendlyName: purchased.friendlyName,
          phoneNumber: purchased.phoneNumber,
          sid: purchased.sid,
          smsUrl: messagingUrl,
          voiceUrl,
        },
      ],
    };
    const nextConfig = {
      ...config.data,
      capabilities: Array.from(
        new Set([
          ...config.data.capabilities,
          "voice" as const,
          "sms" as const,
        ]),
      ),
      importedInventory,
      messagingServiceSid: messagingService.service.sid,
      smsFromNumber: config.data.smsFromNumber || phoneNumber,
      voiceCallerId: config.data.voiceCallerId || phoneNumber,
    };

    await prisma.integrationConnection.update({
      where: { provider: twilioProvider },
      data: {
        status: hasStoredTwilioCredentials(nextConfig)
          ? "CONNECTED"
          : "NOT_CONNECTED",
        config: nextConfig as Prisma.InputJsonValue,
      },
    });

    await prisma.attributionPhoneNumber.upsert({
      where: { phoneNumber },
      update: {
        label: "CRM main number",
        isActive: false,
        metadata: {
          provider: "twilio",
          twilioPhoneNumberSid: purchased.sid,
          capabilities: purchased.capabilities ?? {},
          importedFromTwilio: true,
          purchasedFromCrm: true,
          purchasedAt: new Date().toISOString(),
          smsUrl: messagingUrl,
          voiceUrl,
          addressSid: addressSid ?? null,
          bundleSid: bundleSid ?? null,
        },
      },
      create: {
        phoneNumber,
        label: "CRM main number",
        isActive: false,
        metadata: {
          provider: "twilio",
          twilioPhoneNumberSid: purchased.sid,
          capabilities: purchased.capabilities ?? {},
          importedFromTwilio: true,
          purchasedFromCrm: true,
          purchasedAt: new Date().toISOString(),
          smsUrl: messagingUrl,
          voiceUrl,
          addressSid: addressSid ?? null,
          bundleSid: bundleSid ?? null,
        },
      },
    });

    revalidatePath("/settings/integrations");
    revalidatePath("/settings/integrations/twilio");
    revalidatePath("/telephony/call-tracking");
    revalidatePath("/telephony/call-tracking/overview");

    return {
      ok: true,
      message: `${phoneNumber} was bought, saved as the CRM number, and attached to SMS.`,
      savedAt: Date.now(),
      connected: true,
    };
  } catch (error) {
    return {
      ok: false,
      message: `Could not buy that Twilio number. ${twilioApiErrorMessage(error)}`,
      savedAt: null,
      connected: false,
    };
  }
}

export async function purchaseBusinessPhoneNumberAction(
  previousState: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  void previousState;

  await requireAdmin();

  const rawPayload = String(formData.get("numberPayload") ?? "");
  const label = String(formData.get("numberLabel") ?? "Business number").trim();
  const payload = (() => {
    try {
      return JSON.parse(rawPayload) as unknown;
    } catch {
      return {};
    }
  })();
  const parsed = twilioNumberPurchaseSchema.safeParse(payload);

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Choose a valid Twilio number.",
      savedAt: null,
      connected: false,
    };
  }

  const existingTrackingNumber = await prisma.attributionPhoneNumber.findUnique(
    {
      where: { phoneNumber: normalizeCallableNumber(parsed.data.phoneNumber) },
      select: { id: true, isActive: true },
    },
  );

  if (existingTrackingNumber?.isActive) {
    return {
      ok: false,
      message:
        "That number is already active as a tracking number. Use Call Tracking to manage it.",
      savedAt: null,
      connected: false,
    };
  }

  const connection = await prisma.integrationConnection.findUnique({
    where: { provider: twilioProvider },
  });
  const config = twilioStoredConfigSchema.safeParse(connection?.config ?? {});

  if (!config.success || !config.data.credentials?.authToken) {
    return {
      ok: false,
      message: "Save the Twilio Account SID and Auth Token first.",
      savedAt: null,
      connected: false,
    };
  }

  if (!config.data.webhookBaseUrl) {
    return {
      ok: false,
      message: "Add the webhook base URL before buying a business number.",
      savedAt: null,
      connected: false,
    };
  }

  try {
    const authToken = decryptSecret(config.data.credentials.authToken);
    const client = twilio(config.data.accountSid, authToken);
    const voiceUrl = voiceWebhookUrl(config.data.webhookBaseUrl);
    const messagingUrl = messagingWebhookUrl(config.data.webhookBaseUrl);
    const addressSid = addressSidForCountry(config.data, parsed.data.country);
    const bundleSid = await approvedBundleSidForNumber({
      client,
      config: config.data,
      country: parsed.data.country,
      numberType: parsed.data.numberType,
    });
    if (
      requiresApprovedBundleForPurchase({
        country: parsed.data.country,
        numberType: parsed.data.numberType,
      }) &&
      !bundleSid
    ) {
      return {
        ok: false,
        message: regulatoryBundleRequiredMessage(parsed.data.country),
        savedAt: null,
        connected: false,
      };
    }
    const friendlyName = label || "Business number";
    const purchased = await client.incomingPhoneNumbers.create({
      phoneNumber: parsed.data.phoneNumber,
      friendlyName,
      voiceUrl,
      voiceMethod: "POST",
      smsUrl: messagingUrl,
      smsMethod: "POST",
      ...(addressSid ? { addressSid } : {}),
      ...(bundleSid ? { bundleSid } : {}),
    });
    const phoneNumber = normalizeCallableNumber(purchased.phoneNumber);
    const messagingService = await configureMessagingServiceForNumber({
      client,
      config: config.data,
      messagingUrl,
      phoneNumber,
      phoneNumberSid: purchased.sid,
    });
    const importedInventory = {
      ...(config.data.importedInventory ?? {
        addresses: [],
        bundles: [],
        messagingServices: [],
        phoneNumbers: [],
      }),
      lastImportedAt: new Date().toISOString(),
      messagingServices: [
        ...(config.data.importedInventory?.messagingServices ?? []).filter(
          (service) =>
            inventoryRecord(service).sid !== messagingService.service.sid,
        ),
        {
          friendlyName: messagingService.service.friendlyName,
          inboundRequestUrl: messagingUrl,
          numbers: messagingService.numbers.map((number) => ({
            capabilities: number.capabilities,
            countryCode: number.countryCode,
            phoneNumber: number.phoneNumber,
            serviceSid: number.serviceSid,
            sid: number.sid,
          })),
          sid: messagingService.service.sid,
          statusCallback: messagingUrl,
        },
      ],
      phoneNumbers: [
        ...(config.data.importedInventory?.phoneNumbers ?? []).filter(
          (number) => inventoryRecord(number).sid !== purchased.sid,
        ),
        {
          capabilities: purchased.capabilities ?? {},
          friendlyName: purchased.friendlyName,
          phoneNumber: purchased.phoneNumber,
          sid: purchased.sid,
          smsUrl: messagingUrl,
          voiceUrl,
        },
      ],
    };
    const nextConfig = {
      ...config.data,
      capabilities: Array.from(
        new Set([
          ...config.data.capabilities,
          "voice" as const,
          "sms" as const,
        ]),
      ),
      importedInventory,
      messagingServiceSid: messagingService.service.sid,
      smsFromNumber: config.data.smsFromNumber || phoneNumber,
      voiceCallerId: config.data.voiceCallerId || phoneNumber,
    };

    await prisma.$transaction([
      prisma.integrationConnection.update({
        where: { provider: twilioProvider },
        data: {
          status: hasStoredTwilioCredentials(nextConfig)
            ? "CONNECTED"
            : "NOT_CONNECTED",
          config: nextConfig as Prisma.InputJsonValue,
        },
      }),
      prisma.businessPhoneNumber.upsert({
        where: { phoneNumber },
        update: {
          label: friendlyName,
          twilioPhoneNumberSid: purchased.sid,
          country: parsed.data.country ?? null,
          numberType: parsed.data.numberType ?? null,
          capabilities: (purchased.capabilities ?? {}) as Prisma.InputJsonValue,
          status: "ACTIVE",
          releasedAt: null,
          metadata: {
            provider: "twilio",
            purchasedFromCrm: true,
            purchasedAt: new Date().toISOString(),
            smsUrl: messagingUrl,
            voiceUrl,
            addressSid: addressSid ?? null,
            bundleSid: bundleSid ?? null,
          },
        },
        create: {
          phoneNumber,
          label: friendlyName,
          twilioPhoneNumberSid: purchased.sid,
          country: parsed.data.country ?? null,
          numberType: parsed.data.numberType ?? null,
          capabilities: (purchased.capabilities ?? {}) as Prisma.InputJsonValue,
          metadata: {
            provider: "twilio",
            purchasedFromCrm: true,
            purchasedAt: new Date().toISOString(),
            smsUrl: messagingUrl,
            voiceUrl,
            addressSid: addressSid ?? null,
            bundleSid: bundleSid ?? null,
          },
        },
      }),
    ]);

    revalidatePath("/settings/integrations");
    revalidatePath("/settings/integrations/twilio");
    revalidatePath("/telephony/numbers");
    revalidatePath("/telephony/routing");
    revalidatePath("/telephony/system");

    return {
      ok: true,
      message: `${phoneNumber} was bought as a business number. Add routing coverage before publishing it publicly.`,
      savedAt: Date.now(),
      connected: true,
    };
  } catch (error) {
    return {
      ok: false,
      message: `Could not buy that business number. ${twilioApiErrorMessage(error)}`,
      savedAt: null,
      connected: false,
    };
  }
}

export async function releaseBusinessPhoneNumberAction(
  previousState: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  void previousState;

  await requireAdmin();

  const parsed = businessNumberReleaseSchema.safeParse({
    businessNumberId: formData.get("businessNumberId"),
    confirmationNumber: formData.get("confirmationNumber"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Confirm the number to release.",
      savedAt: null,
      connected: false,
    };
  }

  const businessNumber = await prisma.businessPhoneNumber.findUnique({
    where: { id: parsed.data.businessNumberId },
  });

  if (!businessNumber) {
    return {
      ok: false,
      message: "Business number not found.",
      savedAt: null,
      connected: false,
    };
  }

  if (businessNumber.status === "RELEASED") {
    return {
      ok: true,
      message: `${businessNumber.phoneNumber} is already marked as released.`,
      savedAt: Date.now(),
      connected: true,
    };
  }

  if (
    normalizeCallableNumber(parsed.data.confirmationNumber) !==
    businessNumber.phoneNumber
  ) {
    return {
      ok: false,
      message: "Type the full phone number exactly to confirm release.",
      savedAt: null,
      connected: false,
    };
  }

  const activeTrackingNumber = await prisma.attributionPhoneNumber.findUnique({
    where: { phoneNumber: businessNumber.phoneNumber },
    select: { isActive: true },
  });

  if (activeTrackingNumber?.isActive) {
    return {
      ok: false,
      message:
        "This number is active in Call Tracking. Remove it from tracking before releasing it from Twilio.",
      savedAt: null,
      connected: false,
    };
  }

  const connection = await prisma.integrationConnection.findUnique({
    where: { provider: twilioProvider },
  });
  const config = twilioStoredConfigSchema.safeParse(connection?.config ?? {});

  if (!config.success || !config.data.credentials?.authToken) {
    return {
      ok: false,
      message: "Save the Twilio Account SID and Auth Token first.",
      savedAt: null,
      connected: false,
    };
  }

  if (!businessNumber.twilioPhoneNumberSid) {
    await prisma.businessPhoneNumber.update({
      where: { id: businessNumber.id },
      data: {
        status: "RELEASED",
        releasedAt: new Date(),
        metadata: {
          ...inventoryRecord(businessNumber.metadata),
          releasedWithoutTwilioSid: true,
          releasedAt: new Date().toISOString(),
        },
      },
    });

    revalidatePath("/telephony/numbers");
    revalidatePath("/telephony/system");

    return {
      ok: true,
      message: `${businessNumber.phoneNumber} was removed locally. No Twilio SID was stored to release.`,
      savedAt: Date.now(),
      connected: true,
    };
  }

  try {
    const authToken = decryptSecret(config.data.credentials.authToken);
    const client = twilio(config.data.accountSid, authToken);
    await client
      .incomingPhoneNumbers(businessNumber.twilioPhoneNumberSid)
      .remove();

    const nextPhoneNumbers = (
      config.data.importedInventory?.phoneNumbers ?? []
    ).filter((number) => {
      const record = inventoryRecord(number);
      return (
        recordString(record.sid) !== businessNumber.twilioPhoneNumberSid &&
        normalizeCallableNumber(recordString(record.phoneNumber) ?? "") !==
          businessNumber.phoneNumber
      );
    });
    const nextConfig = {
      ...config.data,
      voiceCallerId:
        normalizeCallableNumber(config.data.voiceCallerId ?? "") ===
        businessNumber.phoneNumber
          ? ""
          : config.data.voiceCallerId,
      smsFromNumber:
        normalizeCallableNumber(config.data.smsFromNumber ?? "") ===
        businessNumber.phoneNumber
          ? ""
          : config.data.smsFromNumber,
      importedInventory: config.data.importedInventory
        ? {
            ...config.data.importedInventory,
            lastImportedAt: new Date().toISOString(),
            phoneNumbers: nextPhoneNumbers,
          }
        : config.data.importedInventory,
    };

    await prisma.$transaction([
      prisma.businessPhoneNumber.update({
        where: { id: businessNumber.id },
        data: {
          status: "RELEASED",
          releasedAt: new Date(),
          metadata: {
            ...inventoryRecord(businessNumber.metadata),
            releasedFromTwilio: true,
            releasedAt: new Date().toISOString(),
          },
        },
      }),
      prisma.integrationConnection.update({
        where: { provider: twilioProvider },
        data: {
          status: hasStoredTwilioCredentials(nextConfig)
            ? "CONNECTED"
            : "NOT_CONNECTED",
          config: nextConfig as Prisma.InputJsonValue,
        },
      }),
    ]);

    revalidatePath("/settings/integrations");
    revalidatePath("/settings/integrations/twilio");
    revalidatePath("/telephony/numbers");
    revalidatePath("/telephony/routing");
    revalidatePath("/telephony/system");

    return {
      ok: true,
      message: `${businessNumber.phoneNumber} was released from Twilio. Future Twilio number rental charges should stop, but the number is no longer owned.`,
      savedAt: Date.now(),
      connected: true,
    };
  } catch (error) {
    return {
      ok: false,
      message: `Could not release that business number. ${twilioApiErrorMessage(error)}`,
      savedAt: null,
      connected: false,
    };
  }
}

export async function configureTwilioMessagingAction(
  previousState: IntegrationActionState,
): Promise<IntegrationActionState> {
  void previousState;

  await requireAdmin();

  const connection = await prisma.integrationConnection.findUnique({
    where: { provider: twilioProvider },
  });
  const parsed = twilioStoredConfigSchema.safeParse(connection?.config ?? {});

  if (!parsed.success || !parsed.data.credentials?.authToken) {
    return {
      ok: false,
      message: "Save the Twilio Account SID and Auth Token first.",
      savedAt: null,
      connected: false,
    };
  }

  if (!parsed.data.webhookBaseUrl) {
    return {
      ok: false,
      message: "Add the webhook base URL before configuring SMS.",
      savedAt: null,
      connected: false,
    };
  }

  try {
    const authToken = decryptSecret(parsed.data.credentials.authToken);
    const client = twilio(parsed.data.accountSid, authToken);
    const messagingUrl = messagingWebhookUrl(parsed.data.webhookBaseUrl);
    const incomingNumbers = await client.incomingPhoneNumbers.list({
      limit: 100,
    });
    const smsCapableNumber =
      incomingNumbers.find((number) =>
        hasCapability(number.capabilities, "sms"),
      ) ?? null;

    if (!smsCapableNumber) {
      return {
        ok: false,
        message:
          "Twilio has no SMS-capable phone number in this account. Buy or import one, then run SMS setup again.",
        savedAt: null,
        connected: true,
      };
    }

    const existingServices = await client.messaging.v1.services.list({
      limit: 50,
    });
    const configuredService = parsed.data.messagingServiceSid
      ? existingServices.find(
          (service) => service.sid === parsed.data.messagingServiceSid,
        )
      : null;
    const namedService =
      existingServices.find(
        (service) => service.friendlyName === "CRM Outbound",
      ) ?? null;
    const service =
      configuredService ??
      namedService ??
      (await client.messaging.v1.services.create({
        friendlyName: "CRM Outbound",
      }));

    await client.messaging.v1.services(service.sid).update({
      inboundRequestUrl: messagingUrl,
      inboundMethod: "POST",
      statusCallback: messagingUrl,
    });

    const serviceNumbers = await client.messaging.v1
      .services(service.sid)
      .phoneNumbers.list({ limit: 100 });
    const senderAlreadyAttached = serviceNumbers.some(
      (number) =>
        number.sid === smsCapableNumber.sid ||
        number.phoneNumber === smsCapableNumber.phoneNumber,
    );

    if (!senderAlreadyAttached) {
      await client.messaging.v1.services(service.sid).phoneNumbers.create({
        phoneNumberSid: smsCapableNumber.sid,
      });
    }

    const refreshedServiceNumbers = await client.messaging.v1
      .services(service.sid)
      .phoneNumbers.list({ limit: 100 });
    const importedInventory = {
      ...(parsed.data.importedInventory ?? {
        addresses: [],
        bundles: [],
        messagingServices: [],
        phoneNumbers: [],
      }),
      lastImportedAt: new Date().toISOString(),
      messagingServices: [
        ...(parsed.data.importedInventory?.messagingServices ?? []).filter(
          (item) => item.sid !== service.sid,
        ),
        {
          friendlyName: service.friendlyName,
          inboundRequestUrl: messagingUrl,
          numbers: refreshedServiceNumbers.map((number) => ({
            capabilities: number.capabilities,
            countryCode: number.countryCode,
            phoneNumber: number.phoneNumber,
            serviceSid: number.serviceSid,
            sid: number.sid,
          })),
          sid: service.sid,
          statusCallback: messagingUrl,
        },
      ],
      phoneNumbers: incomingNumbers.map((number) => ({
        capabilities: number.capabilities ?? {},
        friendlyName: number.friendlyName,
        phoneNumber: number.phoneNumber,
        sid: number.sid,
        smsUrl: number.smsUrl,
        voiceUrl: number.voiceUrl,
      })),
    };
    const nextConfig = {
      ...parsed.data,
      capabilities: Array.from(
        new Set([...parsed.data.capabilities, "sms" as const]),
      ),
      importedInventory,
      messagingServiceSid: service.sid,
      smsFromNumber:
        parsed.data.smsFromNumber ||
        normalizeCallableNumber(smsCapableNumber.phoneNumber) ||
        "",
    };

    await prisma.integrationConnection.update({
      where: { provider: twilioProvider },
      data: {
        status: hasStoredTwilioCredentials(nextConfig)
          ? "CONNECTED"
          : "NOT_CONNECTED",
        config: nextConfig as Prisma.InputJsonValue,
      },
    });

    revalidatePath("/settings/integrations");
    revalidatePath("/settings/integrations/twilio");

    return {
      ok: true,
      message: senderAlreadyAttached
        ? "SMS is configured. The Messaging Service has an SMS sender and CRM webhooks."
        : "SMS is configured. Added an SMS-capable number to the Messaging Service.",
      savedAt: Date.now(),
      connected: true,
    };
  } catch (error) {
    return {
      ok: false,
      message: `Twilio SMS setup failed. ${twilioApiErrorMessage(error)}`,
      savedAt: null,
      connected: false,
    };
  }
}

export async function configureTwilioVoiceAppAction(
  previousState: IntegrationActionState,
): Promise<IntegrationActionState> {
  void previousState;

  await requireAdmin();

  const connection = await prisma.integrationConnection.findUnique({
    where: { provider: twilioProvider },
  });
  const parsed = twilioStoredConfigSchema.safeParse(connection?.config ?? {});

  if (!parsed.success || !parsed.data.credentials?.authToken) {
    return {
      ok: false,
      message: "Save the Twilio Account SID and Auth Token first.",
      savedAt: null,
      connected: false,
    };
  }

  if (!parsed.data.webhookBaseUrl) {
    return {
      ok: false,
      message: "Add the webhook base URL before creating the Voice App.",
      savedAt: null,
      connected: false,
    };
  }

  try {
    const authToken = decryptSecret(parsed.data.credentials.authToken);
    const client = twilio(parsed.data.accountSid, authToken);
    const baseUrl = parsed.data.webhookBaseUrl.replace(/\/$/, "");
    const voiceUrl = `${baseUrl}/api/webhooks/twilio/voice`;
    const friendlyName = "iD30 CRM browser softphone";
    const app = parsed.data.twimlAppSid
      ? await client.applications(parsed.data.twimlAppSid).update({
          friendlyName,
          voiceUrl,
          voiceMethod: "POST",
        })
      : await client.applications.create({
          friendlyName,
          voiceUrl,
          voiceMethod: "POST",
        });
    const intelligenceService = await configureTwilioVoiceIntelligenceService({
      accountSid: parsed.data.accountSid,
      authToken,
      existingServiceSid: parsed.data.voiceIntelligenceServiceSid,
      webhookBaseUrl: baseUrl,
    });

    if (!intelligenceService.ok) {
      return {
        ok: false,
        message: `Twilio Voice Intelligence setup failed. ${intelligenceService.message}`,
        savedAt: null,
        connected: false,
      };
    }

    const nextConfig = {
      ...parsed.data,
      twimlAppSid: app.sid,
      voiceIntelligenceServiceSid: intelligenceService.sid,
    };

    await prisma.integrationConnection.update({
      where: { provider: twilioProvider },
      data: {
        status: hasStoredTwilioCredentials(nextConfig)
          ? "CONNECTED"
          : "NOT_CONNECTED",
        config: nextConfig as Prisma.InputJsonValue,
      },
    });

    revalidatePath("/settings/integrations");
    revalidatePath("/settings/integrations/twilio");
    revalidatePath("/telephony");
    revalidatePath("/telephony/recordings");

    return {
      ok: true,
      message:
        parsed.data.twimlAppSid && !intelligenceService.created
          ? "Twilio Voice App and Voice Intelligence service updated."
          : "Twilio Voice App and Voice Intelligence service created or updated.",
      savedAt: Date.now(),
      connected: true,
    };
  } catch (error) {
    return {
      ok: false,
      message: `Twilio Voice App setup failed. ${twilioApiErrorMessage(error)}`,
      savedAt: null,
      connected: false,
    };
  }
}
