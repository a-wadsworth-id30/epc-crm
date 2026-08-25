import "server-only";

import { z } from "zod";
import { decryptSecret } from "@/lib/crypto/secrets";
import { prisma } from "@/lib/prisma";

export const pipedriveProvider = "pipedrive";
export const defaultPipedriveApiBaseUrl = "https://api.pipedrive.com/v1";
export const defaultPipedriveLeadSource = "Pipedrive";
export const defaultPipedriveRequestTimeoutMs = 10_000;

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
  lastContactSyncAt: z.string().datetime().optional(),
  lastFullDealSyncAt: z.string().datetime().optional(),
  lastFullDealSyncNextCursor: z.string().nullable().optional(),
  lastFullLeadSyncAt: z.string().datetime().optional(),
  lastFullLeadSyncNextStart: z.number().int().nonnegative().nullable().optional(),
  lastFullPersonSyncAt: z.string().datetime().optional(),
  lastFullPersonSyncNextCursor: z.string().nullable().optional(),
  lastLeadEmailThreadSyncCompletedAt: z.string().datetime().nullable().optional(),
  lastLeadEmailThreadSyncFolder: z.string().nullable().optional(),
  lastLeadEmailThreadSyncNextStart: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .optional(),
  lastLeadSyncAt: z.string().datetime().optional(),
  lastLeadNoteSyncAt: z.string().datetime().optional(),
  lastLeadNoteSyncNextStart: z.number().int().nonnegative().nullable().optional(),
  lastLeadNoteSyncPendingUntil: z.string().datetime().nullable().optional(),
});

export type PipedriveConfig = z.infer<typeof pipedriveConfigSchema>;
export type PipedriveStoredConfig = z.infer<
  typeof pipedriveStoredConfigSchema
>;
export type PipedriveRuntimeConfig = Awaited<
  ReturnType<typeof getPipedriveRuntimeConfig>
>;

type PipedrivePrimitiveParam = boolean | number | string;
type PipedriveQueryParams = Record<
  string,
  PipedrivePrimitiveParam | null | undefined
>;

type PipedriveApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  additional_data?: unknown;
  related_objects?: unknown;
  error?: unknown;
  error_info?: unknown;
  message?: unknown;
};

type PipedrivePaginationPayload = {
  limit?: unknown;
  more_items_in_collection?: unknown;
  next_cursor?: unknown;
  next_start?: unknown;
  start?: unknown;
};

export type PipedrivePagination = {
  limit: number | null;
  moreItemsInCollection: boolean;
  nextCursor?: string | null;
  nextStart: number | null;
  start: number | null;
};

export type PipedriveListResult<T> = {
  data: T[];
  pagination: PipedrivePagination;
  relatedObjects: unknown;
};

export type PipedriveCurrentUser = Record<string, unknown> & {
  id?: number;
  name?: string;
  email?: string;
  company_id?: number;
  company_name?: string;
  company_domain?: string;
};

export type PipedriveUser = Record<string, unknown> & {
  id?: number;
  name?: string;
  email?: string;
  active_flag?: boolean;
};

export type PipedriveLead = Record<string, unknown> & {
  id?: string;
  name?: string;
  title?: string;
  owner_id?: unknown;
  person_id?: unknown;
  person?: unknown;
  organization_id?: unknown;
  organization?: unknown;
  org_id?: unknown;
  value?: unknown;
  expected_close_date?: string | null;
  add_time?: string;
  update_time?: string;
};

export type PipedriveDeal = Record<string, unknown> & {
  id?: number;
  title?: string;
  person_id?: unknown;
  person?: unknown;
  org_id?: unknown;
  organization_id?: unknown;
  organization?: unknown;
  value?: unknown;
  currency?: string | null;
  expected_close_date?: string | null;
  add_time?: string;
  update_time?: string;
};

export type PipedrivePerson = Record<string, unknown> & {
  id?: number;
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: unknown;
  emails?: unknown;
  phone?: unknown;
  phones?: unknown;
  org_id?: unknown;
  update_time?: string;
  add_time?: string;
};

export type PipedriveOrganization = Record<string, unknown> & {
  id?: number;
  name?: string;
  address?: string | null;
};

export type PipedriveNote = Record<string, unknown> & {
  id?: number;
  active_flag?: boolean;
  add_time?: string;
  content?: string;
  deal_id?: unknown;
  lead_id?: string | null;
  lead?: unknown;
  org_id?: unknown;
  organization_id?: unknown;
  person_id?: unknown;
  update_time?: string;
  user?: unknown;
  user_id?: unknown;
};

export type PipedriveFile = Record<string, unknown> & {
  id?: number;
  active_flag?: boolean;
  add_time?: string;
  download_url?: string;
  file_name?: string;
  file_size?: unknown;
  file_type?: string;
  lead?: unknown;
  lead_id?: unknown;
  mime_type?: string;
  name?: string;
  size?: unknown;
  update_time?: string;
  url?: string;
};

export type PipedriveMailMessage = Record<string, unknown> & {
  id?: number;
  add_time?: string;
  body?: string | null;
  body_plain?: string | null;
  data?: unknown;
  deal_id?: unknown;
  from?: unknown;
  lead_id?: unknown;
  mail_thread_id?: unknown;
  message_time?: string | null;
  subject?: string | null;
  snippet?: string | null;
  timestamp?: string | null;
  to?: unknown;
  update_time?: string;
};

export type PipedriveMailThread = Record<string, unknown> & {
  id?: number;
  add_time?: string;
  deal_id?: unknown;
  folders?: unknown;
  last_message_received_timestamp?: string | null;
  last_message_sent_timestamp?: string | null;
  lead_id?: unknown;
  person_id?: unknown;
  subject?: string | null;
  update_time?: string;
};

export type PipedriveMailThreadFolder =
  | "archive"
  | "drafts"
  | "inbox"
  | "sent";

export type PipedriveListLeadsParams = {
  filterId?: number | null;
  limit?: number | null;
  organizationId?: number | null;
  ownerId?: number | null;
  personId?: number | null;
  sort?: string | null;
  start?: number | null;
  updatedSince?: string | null;
};

export type PipedriveListDealsParams = {
  cursor?: string | null;
  filterId?: number | null;
  ids?: string[] | null;
  limit?: number | null;
  organizationId?: number | null;
  ownerId?: number | null;
  personId?: number | null;
  sortBy?: "add_time" | "id" | "update_time" | null;
  sortDirection?: "asc" | "desc" | null;
  status?: "all_not_deleted" | "deleted" | "lost" | "open" | "won" | null;
  updatedSince?: string | null;
  updatedUntil?: string | null;
};

export type PipedriveListPersonsParams = {
  cursor?: string | null;
  filterId?: number | null;
  ids?: string[] | null;
  limit?: number | null;
  organizationId?: number | null;
  ownerId?: number | null;
  sortBy?: "add_time" | "id" | "update_time" | null;
  sortDirection?: "asc" | "desc" | null;
  updatedSince?: string | null;
  updatedUntil?: string | null;
};

export type PipedriveListNotesParams = {
  dealId?: number | null;
  leadId?: string | null;
  limit?: number | null;
  organizationId?: number | null;
  personId?: number | null;
  sort?: string | null;
  start?: number | null;
  updatedSince?: string | null;
  updatedUntil?: string | null;
  userId?: number | null;
};

export type PipedriveListFilesParams = {
  limit?: number | null;
  sort?: string | null;
  start?: number | null;
};

export type PipedriveListPersonMailMessagesParams = {
  includeBody?: boolean | null;
  limit?: number | null;
  start?: number | null;
};

export type PipedriveListMailThreadsParams = {
  folder?: PipedriveMailThreadFolder | null;
  limit?: number | null;
  start?: number | null;
};

export type PipedriveGetMailMessageParams = {
  includeBody?: boolean | null;
};

export class PipedriveApiError extends Error {
  status: number;
  details: string | null;

  constructor({
    details = null,
    message,
    status,
  }: {
    details?: string | null;
    message: string;
    status: number;
  }) {
    super(message);
    this.name = "PipedriveApiError";
    this.status = status;
    this.details = details;
  }
}

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
    lastContactSyncAt: config?.lastContactSyncAt ?? null,
    lastFullDealSyncAt: config?.lastFullDealSyncAt ?? null,
    lastFullDealSyncNextCursor:
      typeof config?.lastFullDealSyncNextCursor === "string" &&
      config.lastFullDealSyncNextCursor.trim()
        ? config.lastFullDealSyncNextCursor
        : null,
    lastFullLeadSyncAt: config?.lastFullLeadSyncAt ?? null,
    lastFullLeadSyncNextStart:
      typeof config?.lastFullLeadSyncNextStart === "number"
        ? config.lastFullLeadSyncNextStart
        : null,
    lastFullPersonSyncAt: config?.lastFullPersonSyncAt ?? null,
    lastFullPersonSyncNextCursor:
      typeof config?.lastFullPersonSyncNextCursor === "string" &&
      config.lastFullPersonSyncNextCursor.trim()
        ? config.lastFullPersonSyncNextCursor
        : null,
    lastLeadEmailThreadSyncCompletedAt:
      typeof config?.lastLeadEmailThreadSyncCompletedAt === "string" &&
      config.lastLeadEmailThreadSyncCompletedAt.trim()
        ? config.lastLeadEmailThreadSyncCompletedAt
        : null,
    lastLeadEmailThreadSyncFolder:
      typeof config?.lastLeadEmailThreadSyncFolder === "string" &&
      config.lastLeadEmailThreadSyncFolder.trim()
        ? config.lastLeadEmailThreadSyncFolder
        : null,
    lastLeadEmailThreadSyncNextStart:
      typeof config?.lastLeadEmailThreadSyncNextStart === "number"
        ? config.lastLeadEmailThreadSyncNextStart
        : null,
    lastLeadSyncAt: config?.lastLeadSyncAt ?? null,
    lastLeadNoteSyncAt: config?.lastLeadNoteSyncAt ?? null,
    lastLeadNoteSyncNextStart:
      typeof config?.lastLeadNoteSyncNextStart === "number"
        ? config.lastLeadNoteSyncNextStart
        : null,
    lastLeadNoteSyncPendingUntil:
      typeof config?.lastLeadNoteSyncPendingUntil === "string" &&
      config.lastLeadNoteSyncPendingUntil.trim()
        ? config.lastLeadNoteSyncPendingUntil
        : null,
  };
}

export async function getPipedriveReadOnlyClient() {
  const config = await getPipedriveRuntimeConfig();
  const apiToken = config.apiToken;

  if (!apiToken) return null;

  return new PipedriveReadOnlyClient({ ...config, apiToken });
}

export class PipedriveReadOnlyClient {
  private readonly apiBaseUrl: string;
  private readonly apiToken: string;
  readonly defaultLeadSource: string;
  readonly lastContactSyncAt: string | null;
  readonly lastFullDealSyncAt: string | null;
  readonly lastFullDealSyncNextCursor: string | null;
  readonly lastFullLeadSyncAt: string | null;
  readonly lastFullLeadSyncNextStart: number | null;
  readonly lastFullPersonSyncAt: string | null;
  readonly lastFullPersonSyncNextCursor: string | null;
  readonly lastLeadEmailThreadSyncCompletedAt: string | null;
  readonly lastLeadEmailThreadSyncFolder: string | null;
  readonly lastLeadEmailThreadSyncNextStart: number | null;
  readonly lastLeadSyncAt: string | null;
  readonly lastLeadNoteSyncAt: string | null;
  readonly lastLeadNoteSyncNextStart: number | null;
  readonly lastLeadNoteSyncPendingUntil: string | null;
  private readonly timeoutMs: number;

  constructor(
    config: Omit<PipedriveRuntimeConfig, "apiToken"> & { apiToken: string },
    options: { timeoutMs?: number } = {},
  ) {
    this.apiBaseUrl = config.apiBaseUrl;
    this.apiToken = config.apiToken;
    this.defaultLeadSource = config.defaultLeadSource;
    this.lastContactSyncAt = config.lastContactSyncAt;
    this.lastFullDealSyncAt = config.lastFullDealSyncAt;
    this.lastFullDealSyncNextCursor = config.lastFullDealSyncNextCursor;
    this.lastFullLeadSyncAt = config.lastFullLeadSyncAt;
    this.lastFullLeadSyncNextStart = config.lastFullLeadSyncNextStart;
    this.lastFullPersonSyncAt = config.lastFullPersonSyncAt;
    this.lastFullPersonSyncNextCursor = config.lastFullPersonSyncNextCursor;
    this.lastLeadEmailThreadSyncCompletedAt =
      config.lastLeadEmailThreadSyncCompletedAt;
    this.lastLeadEmailThreadSyncFolder = config.lastLeadEmailThreadSyncFolder;
    this.lastLeadEmailThreadSyncNextStart =
      config.lastLeadEmailThreadSyncNextStart;
    this.lastLeadSyncAt = config.lastLeadSyncAt;
    this.lastLeadNoteSyncAt = config.lastLeadNoteSyncAt;
    this.lastLeadNoteSyncNextStart = config.lastLeadNoteSyncNextStart;
    this.lastLeadNoteSyncPendingUntil = config.lastLeadNoteSyncPendingUntil;
    this.timeoutMs = boundedTimeoutMs(options.timeoutMs);
  }

  async getCurrentUser() {
    return this.getSingle<PipedriveCurrentUser>("users/me");
  }

  async listUsers(params: { limit?: number; start?: number } = {}) {
    return this.getList<PipedriveUser>("users", {
      limit: integerParam(params.limit, { max: 500 }),
      start: integerParam(params.start, { min: 0 }),
    });
  }

  async listLeads(params: PipedriveListLeadsParams = {}) {
    return this.getList<PipedriveLead>("leads", {
      filter_id: integerParam(params.filterId),
      limit: integerParam(params.limit, { max: 500 }),
      organization_id: integerParam(params.organizationId),
      owner_id: integerParam(params.ownerId),
      person_id: integerParam(params.personId),
      sort: params.sort || undefined,
      start: integerParam(params.start, { min: 0 }),
      updated_since: pipedriveDateTimeParam(params.updatedSince),
    });
  }

  async listDeals(params: PipedriveListDealsParams = {}) {
    return this.getList<PipedriveDeal>(
      "deals",
      {
        cursor: params.cursor || undefined,
        filter_id: integerParam(params.filterId),
        ids: textIdsParam(params.ids),
        limit: integerParam(params.limit, { max: 500 }),
        org_id: integerParam(params.organizationId),
        owner_id: integerParam(params.ownerId),
        person_id: integerParam(params.personId),
        sort_by: params.sortBy || undefined,
        sort_direction: params.sortDirection || undefined,
        status: params.status || "open",
        updated_since: pipedriveDateTimeParam(params.updatedSince),
        updated_until: pipedriveDateTimeParam(params.updatedUntil),
      },
      { apiVersion: "v2" },
    );
  }

  async listPersons(params: PipedriveListPersonsParams = {}) {
    return this.getList<PipedrivePerson>(
      "persons",
      {
        cursor: params.cursor || undefined,
        filter_id: integerParam(params.filterId),
        ids: personIdsParam(params.ids),
        limit: integerParam(params.limit, { max: 500 }),
        org_id: integerParam(params.organizationId),
        owner_id: integerParam(params.ownerId),
        sort_by: params.sortBy || undefined,
        sort_direction: params.sortDirection || undefined,
        updated_since: pipedriveDateTimeParam(params.updatedSince),
        updated_until: pipedriveDateTimeParam(params.updatedUntil),
      },
      { apiVersion: "v2" },
    );
  }

  async listNotes(params: PipedriveListNotesParams = {}) {
    return this.getList<PipedriveNote>("notes", {
      deal_id: integerParam(params.dealId),
      lead_id: textParam(params.leadId),
      limit: integerParam(params.limit, { max: 500 }),
      org_id: integerParam(params.organizationId),
      person_id: integerParam(params.personId),
      sort: params.sort || undefined,
      start: integerParam(params.start, { min: 0 }),
      updated_since: pipedriveDateTimeParam(params.updatedSince),
      updated_until: pipedriveDateTimeParam(params.updatedUntil),
      user_id: integerParam(params.userId),
    });
  }

  async listFiles(params: PipedriveListFilesParams = {}) {
    return this.getList<PipedriveFile>("files", {
      limit: integerParam(params.limit, { max: 500 }),
      sort: params.sort || undefined,
      start: integerParam(params.start, { min: 0 }),
    });
  }

  async listPersonMailMessages(
    personId: number,
    params: PipedriveListPersonMailMessagesParams = {},
  ) {
    return this.getList<PipedriveMailMessage>(
      `persons/${pipedriveNumericId(personId, "person")}/mailMessages`,
      {
        include_body: booleanParam(params.includeBody),
        limit: integerParam(params.limit, { max: 500 }),
        start: integerParam(params.start, { min: 0 }),
      },
    );
  }

  async listMailThreads(params: PipedriveListMailThreadsParams = {}) {
    return this.getList<PipedriveMailThread>("mailbox/mailThreads", {
      folder: params.folder || "inbox",
      limit: integerParam(params.limit, { max: 500 }),
      start: integerParam(params.start, { min: 0 }),
    });
  }

  async listMailThreadMessages(mailThreadId: number) {
    return this.getList<PipedriveMailMessage>(
      `mailbox/mailThreads/${pipedriveNumericId(mailThreadId, "mail thread")}/mailMessages`,
    );
  }

  async getMailMessage(
    id: number,
    params: PipedriveGetMailMessageParams = {},
  ) {
    return this.getSingle<PipedriveMailMessage>(
      `mailbox/mailMessages/${pipedriveNumericId(id, "mail message")}`,
      {
        include_body: booleanParam(params.includeBody),
      },
    );
  }

  async downloadFile(id: number) {
    return this.getBinary(`files/${pipedriveNumericId(id, "file")}/download`);
  }

  async getLead(id: string) {
    return this.getSingle<PipedriveLead>(`leads/${pipedriveTextId(id, "lead")}`);
  }

  async getDeal(id: number) {
    return this.getSingle<PipedriveDeal>(
      `deals/${pipedriveNumericId(id, "deal")}`,
      {},
      { apiVersion: "v2" },
    );
  }

  async getNote(id: number) {
    return this.getSingle<PipedriveNote>(
      `notes/${pipedriveNumericId(id, "note")}`,
    );
  }

  async getPerson(id: number) {
    return this.getSingle<PipedrivePerson>(
      `persons/${pipedriveNumericId(id, "person")}`,
    );
  }

  async getOrganization(id: number) {
    return this.getSingle<PipedriveOrganization>(
      `organizations/${pipedriveNumericId(id, "organization")}`,
    );
  }

  private async getSingle<T>(
    path: string,
    params: PipedriveQueryParams = {},
    options: { apiVersion?: string } = {},
  ) {
    const envelope = await this.getEnvelope<T>(path, params, options);

    if (envelope.data === undefined || envelope.data === null) {
      throw new PipedriveApiError({
        message: "Pipedrive response did not include data.",
        status: 502,
      });
    }

    return envelope.data;
  }

  private async getList<T>(
    path: string,
    params: PipedriveQueryParams = {},
    options: { apiVersion?: string } = {},
  ): Promise<PipedriveListResult<T>> {
    const envelope = await this.getEnvelope<T[]>(path, params, options);

    return {
      data: Array.isArray(envelope.data) ? envelope.data : [],
      pagination: normalizePipedrivePagination(envelope.additional_data),
      relatedObjects: envelope.related_objects ?? null,
    };
  }

  private async getEnvelope<T>(
    path: string,
    params: PipedriveQueryParams = {},
    options: { apiVersion?: string } = {},
  ): Promise<PipedriveApiEnvelope<T>> {
    const url = pipedriveUrl(this.apiBaseUrl, path, options.apiVersion);
    appendQueryParams(url, params);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "x-api-token": this.apiToken,
        },
        method: "GET",
        signal: controller.signal,
      });
      const payload = parsePipedrivePayload<T>(await response.text());

      if (!response.ok || payload.success === false) {
        throw pipedriveApiErrorFromResponse(response.status, payload);
      }

      return payload;
    } catch (error) {
      if (error instanceof PipedriveApiError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new PipedriveApiError({
          message: "Pipedrive request timed out.",
          status: 504,
        });
      }

      throw new PipedriveApiError({
        details: error instanceof Error ? error.message : null,
        message: "Pipedrive request failed.",
        status: 502,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getBinary(
    path: string,
    params: PipedriveQueryParams = {},
    options: { apiVersion?: string } = {},
  ) {
    const url = pipedriveUrl(this.apiBaseUrl, path, options.apiVersion);
    appendQueryParams(url, params);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          Accept: "*/*",
          "x-api-token": this.apiToken,
        },
        method: "GET",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw await pipedriveBinaryErrorFromResponse(response);
      }

      return response;
    } catch (error) {
      if (error instanceof PipedriveApiError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new PipedriveApiError({
          message: "Pipedrive request timed out.",
          status: 504,
        });
      }

      throw new PipedriveApiError({
        details: error instanceof Error ? error.message : null,
        message: "Pipedrive request failed.",
        status: 502,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function boundedTimeoutMs(value: number | undefined) {
  const parsed =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : Number.parseInt(process.env.PIPEDRIVE_TIMEOUT_MS ?? "", 10);

  if (!Number.isFinite(parsed)) return defaultPipedriveRequestTimeoutMs;

  return Math.max(1_000, Math.min(parsed, 30_000));
}

function integerParam(
  value: number | null | undefined,
  { max = Number.MAX_SAFE_INTEGER, min = 1 }: { max?: number; min?: number } = {},
) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;

  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function booleanParam(value: boolean | null | undefined) {
  return typeof value === "boolean" ? value : undefined;
}

function pipedriveDateTimeParam(value: string | null | undefined) {
  const text = textValue(value);
  if (!text) return undefined;

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return undefined;

  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function appendQueryParams(url: URL, params: PipedriveQueryParams) {
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    url.searchParams.set(
      key,
      typeof value === "boolean" ? String(Number(value)) : String(value),
    );
  }
}

function pipedriveUrl(apiBaseUrl: string, path: string, apiVersion?: string) {
  const baseUrl = apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`;
  const base = new URL(baseUrl);

  if (apiVersion) {
    const parts = base.pathname.split("/").filter(Boolean);
    let versionIndex = -1;

    for (let index = parts.length - 1; index >= 0; index -= 1) {
      if (/^v\d+$/i.test(parts[index]!)) {
        versionIndex = index;
        break;
      }
    }

    if (versionIndex >= 0) {
      parts[versionIndex] = apiVersion;
    } else {
      parts.push(apiVersion);
    }

    if (
      base.hostname === "api.pipedrive.com" &&
      parts[0] !== "api" &&
      /^v\d+$/i.test(parts[0] ?? "")
    ) {
      parts.unshift("api");
    }

    base.pathname = `/${parts.join("/")}/`;
  }

  return new URL(path.replace(/^\/+/, ""), base);
}

function pipedriveTextId(value: string, label: string) {
  const id = value.trim();

  if (!id) {
    throw new PipedriveApiError({
      message: `Missing Pipedrive ${label} ID.`,
      status: 400,
    });
  }

  return encodeURIComponent(id);
}

function pipedriveNumericId(value: number, label: string) {
  const id = integerParam(value);

  if (id === undefined) {
    throw new PipedriveApiError({
      message: `Invalid Pipedrive ${label} ID.`,
      status: 400,
    });
  }

  return encodeURIComponent(String(id));
}

function parsePipedrivePayload<T>(body: string): PipedriveApiEnvelope<T> {
  if (!body.trim()) return {};

  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === "object"
      ? (parsed as PipedriveApiEnvelope<T>)
      : {};
  } catch {
    return {
      error: "Pipedrive returned an invalid JSON response.",
      success: false,
    };
  }
}

function pipedriveApiErrorFromResponse(
  status: number,
  payload: PipedriveApiEnvelope<unknown>,
) {
  const message =
    textValue(payload.error) ||
    textValue(payload.message) ||
    "Pipedrive request was rejected.";
  const details = textValue(payload.error_info);

  return new PipedriveApiError({ details, message, status });
}

async function pipedriveBinaryErrorFromResponse(response: Response) {
  const body = await response.text().catch(() => "");
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("json")) {
    return pipedriveApiErrorFromResponse(
      response.status,
      parsePipedrivePayload<unknown>(body),
    );
  }

  return new PipedriveApiError({
    details: textValue(body.slice(0, 500)),
    message: "Pipedrive file download was rejected.",
    status: response.status,
  });
}

function normalizePipedrivePagination(
  additionalData: unknown,
): PipedrivePagination {
  const additional =
    additionalData && typeof additionalData === "object"
      ? (additionalData as { next_cursor?: unknown; pagination?: PipedrivePaginationPayload })
      : null;
  const pagination =
    additionalData && typeof additionalData === "object"
      ? (additionalData as { pagination?: PipedrivePaginationPayload })
          .pagination
      : null;

  return {
    limit: numberValue(pagination?.limit),
    moreItemsInCollection: Boolean(pagination?.more_items_in_collection),
    nextCursor: textValue(additional?.next_cursor ?? pagination?.next_cursor),
    nextStart: numberValue(pagination?.next_start),
    start: numberValue(pagination?.start),
  };
}

function personIdsParam(value: string[] | null | undefined) {
  if (!Array.isArray(value)) return undefined;

  const ids = value
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 100);

  return ids.length ? ids.join(",") : undefined;
}

function textIdsParam(value: string[] | null | undefined) {
  if (!Array.isArray(value) || !value.length) return undefined;

  const ids = value
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 50);

  return ids.length ? ids.join(",") : undefined;
}

function textParam(value: string | null | undefined) {
  return textValue(value) ?? undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
