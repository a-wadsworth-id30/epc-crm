import "server-only";

import {
  getPipedriveRuntimeConfig,
  pipedriveProvider,
} from "@/lib/integrations/pipedrive";

type PipedriveWebhookAction = "change" | "create";
type PipedriveWebhookObject = "lead" | "person";
type PipedriveRegistrationStatus = "ERROR" | "READY" | "SUCCESS" | "WARNING";

type PipedriveWebhookEnvelope<T> = {
  data?: T;
  error?: unknown;
  error_info?: unknown;
  message?: unknown;
  success?: boolean;
};

type PipedriveWebhookRow = {
  event_action?: unknown;
  event_object?: unknown;
  id?: unknown;
  is_active?: unknown;
  last_delivery_time?: unknown;
  last_http_status?: unknown;
  name?: unknown;
  subscription_url?: unknown;
  version?: unknown;
};

export type DesiredPipedriveWebhook = {
  eventAction: PipedriveWebhookAction;
  eventObject: PipedriveWebhookObject;
  name: string;
  subscriptionUrl: string;
  version: "2.0";
};

export type SafePipedriveWebhook = {
  eventAction: PipedriveWebhookAction | "unknown";
  eventObject: PipedriveWebhookObject | "unknown";
  id: number | null;
  isActive: boolean | null;
  lastDeliveryTime: string | null;
  lastHttpStatus: number | null;
  name: string;
  subscriptionUrl: string;
  version: string;
};

export type PipedriveWebhookRegistrationResult = {
  createdWebhooks: SafePipedriveWebhook[];
  desiredWebhooks: DesiredPipedriveWebhook[];
  existingTargetWebhooks: SafePipedriveWebhook[];
  message: string;
  missingWebhooks: DesiredPipedriveWebhook[];
  pipedriveWritesPerformed: number;
  pipedriveWritesRequired: number;
  provider: typeof pipedriveProvider;
  providerWriteApproval: typeof pipedriveWebhookRegistrationApproval;
  receiverAuthConfigured: boolean;
  status: PipedriveRegistrationStatus;
  subscriptionUrl: string | null;
};

export const pipedriveWebhookRegistrationApproval =
  "pipedrive-webhook-registration";

const pipedriveWebhookReceiverPath = "/api/webhooks/pipedrive";
const pipedriveWebhookVersion = "2.0" as const;
const pipedriveWebhookTimeoutMs = 15_000;

const desiredWebhookEvents: Array<{
  action: PipedriveWebhookAction;
  name: string;
  object: PipedriveWebhookObject;
}> = [
  {
    action: "create",
    name: "EPC CRM Pipedrive lead created import",
    object: "lead",
  },
  {
    action: "change",
    name: "EPC CRM Pipedrive lead changed import",
    object: "lead",
  },
  {
    action: "create",
    name: "EPC CRM Pipedrive person created import",
    object: "person",
  },
  {
    action: "change",
    name: "EPC CRM Pipedrive person changed import",
    object: "person",
  },
];

export async function planPipedriveWebhookRegistration() {
  return writePipedriveWebhookRegistration({
    apply: false,
    providerWriteApproval: null,
  });
}

export async function runPipedriveWebhookRegistration({
  providerWriteApproval,
}: {
  providerWriteApproval: string | null;
}) {
  return writePipedriveWebhookRegistration({
    apply: true,
    providerWriteApproval,
  });
}

async function writePipedriveWebhookRegistration({
  apply,
  providerWriteApproval,
}: {
  apply: boolean;
  providerWriteApproval: string | null;
}): Promise<PipedriveWebhookRegistrationResult> {
  const runtimeConfig = await getPipedriveRuntimeConfig();
  const subscriptionUrl = configuredSubscriptionUrl();
  const desiredWebhooks = subscriptionUrl
    ? desiredWebhookEvents.map((event) => ({
        eventAction: event.action,
        eventObject: event.object,
        name: event.name,
        subscriptionUrl,
        version: pipedriveWebhookVersion,
      }))
    : [];
  const auth = configuredWebhookAuth();

  if (!runtimeConfig.apiToken) {
    return emptyRegistrationResult({
      desiredWebhooks,
      message:
        "Pipedrive API credentials are missing, so webhook registration cannot be checked.",
      receiverAuthConfigured: Boolean(auth),
      status: "WARNING",
      subscriptionUrl,
    });
  }

  if (!subscriptionUrl) {
    return emptyRegistrationResult({
      desiredWebhooks,
      message:
        "Set APP_BASE_URL or PIPEDRIVE_WEBHOOK_SUBSCRIPTION_URL before registering Pipedrive webhooks.",
      receiverAuthConfigured: Boolean(auth),
      status: "WARNING",
      subscriptionUrl,
    });
  }

  if (!auth) {
    return emptyRegistrationResult({
      desiredWebhooks,
      message:
        "Set PIPEDRIVE_WEBHOOK_SECRET before registering Pipedrive webhooks.",
      receiverAuthConfigured: false,
      status: "WARNING",
      subscriptionUrl,
    });
  }

  const existing = await listPipedriveWebhooks({
    apiBaseUrl: runtimeConfig.apiBaseUrl,
    apiToken: runtimeConfig.apiToken,
  });
  const existingTargetWebhooks = existing
    .filter((webhook) => webhook.subscriptionUrl === subscriptionUrl)
    .map(safeWebhookFromExisting);
  const missingWebhooks = desiredWebhooks.filter(
    (desired) =>
      !existingTargetWebhooks.some((existingWebhook) =>
        sameWebhookSubscription(existingWebhook, desired),
      ),
  );

  if (!apply) {
    return {
      createdWebhooks: [],
      desiredWebhooks,
      existingTargetWebhooks,
      message:
        missingWebhooks.length > 0
          ? `${missingWebhooks.length} Pipedrive webhook${missingWebhooks.length === 1 ? "" : "s"} need registration. No Pipedrive writes were performed.`
          : "All required Pipedrive webhooks are already registered. No Pipedrive writes were performed.",
      missingWebhooks,
      pipedriveWritesPerformed: 0,
      pipedriveWritesRequired: missingWebhooks.length,
      provider: pipedriveProvider,
      providerWriteApproval: pipedriveWebhookRegistrationApproval,
      receiverAuthConfigured: true,
      status: missingWebhooks.length > 0 ? "READY" : "SUCCESS",
      subscriptionUrl,
    };
  }

  if (providerWriteApproval !== pipedriveWebhookRegistrationApproval) {
    return {
      createdWebhooks: [],
      desiredWebhooks,
      existingTargetWebhooks,
      message:
        "Pipedrive webhook registration requires explicit provider-write approval before any Pipedrive webhook is created.",
      missingWebhooks,
      pipedriveWritesPerformed: 0,
      pipedriveWritesRequired: missingWebhooks.length,
      provider: pipedriveProvider,
      providerWriteApproval: pipedriveWebhookRegistrationApproval,
      receiverAuthConfigured: true,
      status: missingWebhooks.length > 0 ? "WARNING" : "SUCCESS",
      subscriptionUrl,
    };
  }

  const createdWebhooks: SafePipedriveWebhook[] = [];

  for (const desired of missingWebhooks) {
    const created = await createPipedriveWebhook({
      apiBaseUrl: runtimeConfig.apiBaseUrl,
      apiToken: runtimeConfig.apiToken,
      auth,
      webhook: desired,
    });
    createdWebhooks.push(safeWebhookFromExisting(created));
  }

  return {
    createdWebhooks,
    desiredWebhooks,
    existingTargetWebhooks,
    message:
      createdWebhooks.length > 0
        ? `${createdWebhooks.length} Pipedrive webhook${createdWebhooks.length === 1 ? "" : "s"} created for CRM pull-only imports.`
        : "All required Pipedrive webhooks were already registered. No Pipedrive writes were needed.",
    missingWebhooks: [],
    pipedriveWritesPerformed: createdWebhooks.length,
    pipedriveWritesRequired: 0,
    provider: pipedriveProvider,
    providerWriteApproval: pipedriveWebhookRegistrationApproval,
    receiverAuthConfigured: true,
    status: "SUCCESS",
    subscriptionUrl,
  };
}

async function listPipedriveWebhooks({
  apiBaseUrl,
  apiToken,
}: {
  apiBaseUrl: string;
  apiToken: string;
}) {
  const envelope = await pipedriveWebhookRequest<PipedriveWebhookRow[]>({
    apiBaseUrl,
    apiToken,
    method: "GET",
    path: "webhooks",
  });

  return Array.isArray(envelope.data)
    ? envelope.data.map(safeWebhookFromProvider)
    : [];
}

async function createPipedriveWebhook({
  apiBaseUrl,
  apiToken,
  auth,
  webhook,
}: {
  apiBaseUrl: string;
  apiToken: string;
  auth: { password: string; username: string };
  webhook: DesiredPipedriveWebhook;
}) {
  const envelope = await pipedriveWebhookRequest<PipedriveWebhookRow>({
    apiBaseUrl,
    apiToken,
    body: {
      event_action: webhook.eventAction,
      event_object: webhook.eventObject,
      http_auth_password: auth.password,
      http_auth_user: auth.username,
      name: webhook.name,
      subscription_url: webhook.subscriptionUrl,
      version: webhook.version,
    },
    method: "POST",
    path: "webhooks",
  });

  return safeWebhookFromProvider(envelope.data ?? {});
}

async function pipedriveWebhookRequest<T>({
  apiBaseUrl,
  apiToken,
  body,
  method,
  path,
}: {
  apiBaseUrl: string;
  apiToken: string;
  body?: Record<string, unknown>;
  method: "GET" | "POST";
  path: string;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), pipedriveWebhookTimeoutMs);

  try {
    const response = await fetch(pipedriveWebhookUrl(apiBaseUrl, path), {
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-api-token": apiToken,
      },
      method,
      signal: controller.signal,
    });
    const payload = parsePipedriveWebhookPayload<T>(await response.text());

    if (!response.ok || payload.success === false) {
      throw new Error(pipedriveWebhookErrorMessage(response.status, payload));
    }

    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Pipedrive webhook request timed out.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parsePipedriveWebhookPayload<T>(text: string) {
  try {
    return JSON.parse(text) as PipedriveWebhookEnvelope<T>;
  } catch {
    throw new Error("Pipedrive returned an invalid JSON response.");
  }
}

function pipedriveWebhookErrorMessage(
  status: number,
  payload: PipedriveWebhookEnvelope<unknown>,
) {
  const message =
    stringValue(payload.message) ??
    stringValue(payload.error) ??
    stringValue(payload.error_info);

  return message
    ? `Pipedrive webhook API returned ${status}: ${message}`
    : `Pipedrive webhook API returned ${status}.`;
}

function pipedriveWebhookUrl(apiBaseUrl: string, path: string) {
  return new URL(path, apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`);
}

function configuredSubscriptionUrl() {
  const explicit = process.env.PIPEDRIVE_WEBHOOK_SUBSCRIPTION_URL?.trim();
  if (explicit) return normalizedHttpsUrl(explicit);

  const baseUrl = (
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.URL ||
    process.env.DEPLOY_URL ||
    ""
  ).trim();
  if (!baseUrl) return null;

  try {
    return normalizedHttpsUrl(new URL(pipedriveWebhookReceiverPath, baseUrl).href);
  } catch {
    return null;
  }
}

function normalizedHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;

    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return null;
  }
}

function configuredWebhookAuth() {
  const password = (
    process.env.PIPEDRIVE_WEBHOOK_SECRET ||
    process.env.PIPEDRIVE_LEAD_IMPORT_SECRET ||
    process.env.CRON_SECRET ||
    ""
  ).trim();

  if (!password) return null;

  return {
    password,
    username: process.env.PIPEDRIVE_WEBHOOK_BASIC_USER?.trim() || "pipedrive",
  };
}

function emptyRegistrationResult({
  desiredWebhooks,
  message,
  receiverAuthConfigured,
  status,
  subscriptionUrl,
}: {
  desiredWebhooks: DesiredPipedriveWebhook[];
  message: string;
  receiverAuthConfigured: boolean;
  status: PipedriveRegistrationStatus;
  subscriptionUrl: string | null;
}): PipedriveWebhookRegistrationResult {
  return {
    createdWebhooks: [],
    desiredWebhooks,
    existingTargetWebhooks: [],
    message,
    missingWebhooks: desiredWebhooks,
    pipedriveWritesPerformed: 0,
    pipedriveWritesRequired: desiredWebhooks.length,
    provider: pipedriveProvider,
    providerWriteApproval: pipedriveWebhookRegistrationApproval,
    receiverAuthConfigured,
    status,
    subscriptionUrl,
  };
}

function sameWebhookSubscription(
  existing: Pick<SafePipedriveWebhook, "eventAction" | "eventObject">,
  desired: Pick<DesiredPipedriveWebhook, "eventAction" | "eventObject">,
) {
  return (
    existing.eventAction === desired.eventAction &&
    existing.eventObject === desired.eventObject
  );
}

function safeWebhookFromExisting(
  webhook: ReturnType<typeof safeWebhookFromProvider>,
): SafePipedriveWebhook {
  return {
    eventAction: webhook.eventAction,
    eventObject: webhook.eventObject,
    id: webhook.id,
    isActive: webhook.isActive,
    lastDeliveryTime: webhook.lastDeliveryTime,
    lastHttpStatus: webhook.lastHttpStatus,
    name: webhook.name,
    subscriptionUrl: webhook.subscriptionUrl,
    version: webhook.version,
  };
}

function safeWebhookFromProvider(row: PipedriveWebhookRow) {
  return {
    eventAction: webhookAction(row.event_action),
    eventObject: webhookObject(row.event_object),
    id: numberValue(row.id),
    isActive: booleanValue(row.is_active),
    lastDeliveryTime: stringValue(row.last_delivery_time),
    lastHttpStatus: numberValue(row.last_http_status),
    name: stringValue(row.name) ?? "Pipedrive webhook",
    subscriptionUrl: stringValue(row.subscription_url) ?? "",
    version: webhookVersion(row.version),
  };
}

function webhookAction(value: unknown): PipedriveWebhookAction | "unknown" {
  const normalized = String(value).trim().toLowerCase();

  if (["change", "changed", "update", "updated"].includes(normalized)) {
    return "change";
  }

  if (["add", "added", "create", "created"].includes(normalized)) {
    return "create";
  }

  return "unknown";
}

function webhookObject(value: unknown): PipedriveWebhookObject | "unknown" {
  const normalized = String(value).trim().toLowerCase();

  if (["person", "persons"].includes(normalized)) return "person";
  if (["lead", "leads"].includes(normalized)) return "lead";

  return "unknown";
}

function webhookVersion(value: unknown) {
  return String(value).trim() || pipedriveWebhookVersion;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);

  return Number.isFinite(parsed) ? parsed : null;
}

function booleanValue(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string" && value.trim()) {
    return ["1", "true", "yes"].includes(value.trim().toLowerCase());
  }

  return null;
}
