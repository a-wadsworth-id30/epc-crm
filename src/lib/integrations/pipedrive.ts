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
  lastFullLeadSyncAt: z.string().datetime().optional(),
  lastLeadSyncAt: z.string().datetime().optional(),
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
  next_start?: unknown;
  start?: unknown;
};

export type PipedrivePagination = {
  limit: number | null;
  moreItemsInCollection: boolean;
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

export type PipedrivePerson = Record<string, unknown> & {
  id?: number;
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: unknown;
  phone?: unknown;
  org_id?: unknown;
};

export type PipedriveOrganization = Record<string, unknown> & {
  id?: number;
  name?: string;
  address?: string | null;
};

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
    lastFullLeadSyncAt: config?.lastFullLeadSyncAt ?? null,
    lastLeadSyncAt: config?.lastLeadSyncAt ?? null,
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
  readonly lastFullLeadSyncAt: string | null;
  readonly lastLeadSyncAt: string | null;
  private readonly timeoutMs: number;

  constructor(
    config: Omit<PipedriveRuntimeConfig, "apiToken"> & { apiToken: string },
    options: { timeoutMs?: number } = {},
  ) {
    this.apiBaseUrl = config.apiBaseUrl;
    this.apiToken = config.apiToken;
    this.defaultLeadSource = config.defaultLeadSource;
    this.lastFullLeadSyncAt = config.lastFullLeadSyncAt;
    this.lastLeadSyncAt = config.lastLeadSyncAt;
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
      updated_since: params.updatedSince || undefined,
    });
  }

  async getLead(id: string) {
    return this.getSingle<PipedriveLead>(`leads/${pipedriveTextId(id, "lead")}`);
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
  ) {
    const envelope = await this.getEnvelope<T>(path, params);

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
  ): Promise<PipedriveListResult<T>> {
    const envelope = await this.getEnvelope<T[]>(path, params);

    return {
      data: Array.isArray(envelope.data) ? envelope.data : [],
      pagination: normalizePipedrivePagination(envelope.additional_data),
      relatedObjects: envelope.related_objects ?? null,
    };
  }

  private async getEnvelope<T>(
    path: string,
    params: PipedriveQueryParams = {},
  ): Promise<PipedriveApiEnvelope<T>> {
    const url = pipedriveUrl(this.apiBaseUrl, path);
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

function appendQueryParams(url: URL, params: PipedriveQueryParams) {
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    url.searchParams.set(
      key,
      typeof value === "boolean" ? String(Number(value)) : String(value),
    );
  }
}

function pipedriveUrl(apiBaseUrl: string, path: string) {
  const baseUrl = apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`;
  return new URL(path.replace(/^\/+/, ""), baseUrl);
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

function normalizePipedrivePagination(
  additionalData: unknown,
): PipedrivePagination {
  const pagination =
    additionalData && typeof additionalData === "object"
      ? (additionalData as { pagination?: PipedrivePaginationPayload })
          .pagination
      : null;

  return {
    limit: numberValue(pagination?.limit),
    moreItemsInCollection: Boolean(pagination?.more_items_in_collection),
    nextStart: numberValue(pagination?.next_start),
    start: numberValue(pagination?.start),
  };
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
