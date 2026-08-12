import "server-only";

import crypto from "node:crypto";
import { z } from "zod";
import { decryptSecret } from "@/lib/crypto/secrets";
import { prisma } from "@/lib/prisma";
import {
  docuSignAuthBaseUrl,
  docuSignDefaultApiBaseUri,
  docuSignDocumentExtension,
  normaliseDocuSignBaseUri,
  type DocuSignEnvironment,
} from "@/lib/integrations/docusign-utils";

export const docusignProvider = "docusign";

const optionalUrl = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || "")
  .pipe(z.string().url().or(z.literal("")));

export const docusignConfigSchema = z.object({
  accountId: z.string().trim().min(1, "DocuSign account ID is required."),
  baseUri: optionalUrl,
  defaultEmailMessage: z
    .string()
    .trim()
    .max(1000, "Default email message must be 1000 characters or fewer.")
    .optional()
    .transform((value) => value || ""),
  defaultEmailSubject: z
    .string()
    .trim()
    .max(140, "Default email subject must be 140 characters or fewer.")
    .optional()
    .transform((value) => value || "Please sign this document"),
  environment: z.enum(["demo", "production"]).optional().default("demo"),
  webhookBaseUrl: optionalUrl,
});

const docusignStoredCredentialsSchema = z.object({
  connectHmacSecret: z.string().min(1),
  impersonatedUserId: z.string().min(1),
  integrationKey: z.string().min(1),
  privateKey: z.string().min(1),
  savedAt: z.string().datetime().optional(),
});

export const docusignStoredConfigSchema = docusignConfigSchema.extend({
  credentials: docusignStoredCredentialsSchema.optional(),
});

export type DocuSignConfig = z.infer<typeof docusignConfigSchema>;
export type DocuSignStoredConfig = z.infer<typeof docusignStoredConfigSchema>;

export type DocuSignRuntimeConfig = {
  accountId: string;
  apiBaseUri: string;
  connectHmacSecret: string;
  defaultEmailMessage: string;
  defaultEmailSubject: string;
  environment: DocuSignEnvironment;
  impersonatedUserId: string;
  integrationKey: string;
  privateKey: string;
  webhookBaseUrl: string;
};

export function hasStoredDocuSignCredentials(config: unknown) {
  const parsed = docusignStoredConfigSchema.safeParse(config ?? {});
  return Boolean(
    parsed.success &&
    parsed.data.credentials?.connectHmacSecret &&
    parsed.data.credentials.impersonatedUserId &&
    parsed.data.credentials.integrationKey &&
    parsed.data.credentials.privateKey,
  );
}

export async function getDocuSignStoredConfig() {
  const integration = await prisma.integrationConnection.findUnique({
    where: { provider: docusignProvider },
  });
  const parsed = docusignStoredConfigSchema.safeParse(
    integration?.config ?? {},
  );

  return parsed.success ? parsed.data : null;
}

export async function getDocuSignRuntimeConfig() {
  const config = await getDocuSignStoredConfig();
  const credentials = config?.credentials;

  if (!config || !credentials) {
    throw new Error("DocuSign is not connected.");
  }

  return {
    accountId: config.accountId,
    apiBaseUri: normaliseDocuSignBaseUri(config.baseUri, config.environment),
    connectHmacSecret: decryptSecret(credentials.connectHmacSecret),
    defaultEmailMessage: config.defaultEmailMessage,
    defaultEmailSubject: config.defaultEmailSubject,
    environment: config.environment,
    impersonatedUserId: decryptSecret(credentials.impersonatedUserId),
    integrationKey: decryptSecret(credentials.integrationKey),
    privateKey: decryptSecret(credentials.privateKey).replace(/\\n/g, "\n"),
    webhookBaseUrl: config.webhookBaseUrl,
  } satisfies DocuSignRuntimeConfig;
}

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function jwtTimestampSeconds(date = new Date()) {
  return Math.floor(date.getTime() / 1000);
}

export function createDocuSignJwtAssertion(config: DocuSignRuntimeConfig) {
  const now = jwtTimestampSeconds();
  const header = base64UrlEncode(
    JSON.stringify({
      alg: "RS256",
      typ: "JWT",
    }),
  );
  const payload = base64UrlEncode(
    JSON.stringify({
      aud: new URL(docuSignAuthBaseUrl(config.environment)).host,
      exp: now + 3600,
      iat: now,
      iss: config.integrationKey,
      scope: "signature impersonation",
      sub: config.impersonatedUserId,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signature = crypto.sign(
    "RSA-SHA256",
    Buffer.from(signingInput),
    config.privateKey,
  );

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

export async function requestDocuSignAccessToken(
  config: DocuSignRuntimeConfig,
) {
  const response = await fetch(
    `${docuSignAuthBaseUrl(config.environment)}/oauth/token`,
    {
      body: new URLSearchParams({
        assertion: createDocuSignJwtAssertion(config),
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      }),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    },
  );
  const payload = (await response.json().catch(() => null)) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  } | null;

  if (!response.ok || !payload?.access_token) {
    const reason =
      payload?.error === "consent_required"
        ? "DocuSign consent is required for the configured integration key and impersonated user."
        : payload?.error_description ||
          payload?.error ||
          "DocuSign OAuth failed.";
    throw new Error(reason);
  }

  return payload.access_token;
}

async function docusignJsonRequest<T>({
  body,
  config,
  method = "GET",
  path,
}: {
  body?: unknown;
  config: DocuSignRuntimeConfig;
  method?: "GET" | "POST";
  path: string;
}) {
  const accessToken = await requestDocuSignAccessToken(config);
  const response = await fetch(
    `${config.apiBaseUri.replace(/\/$/, "")}${path}`,
    {
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      method,
    },
  );
  const text = await response.text();
  let payload = {} as T;

  if (text) {
    try {
      payload = JSON.parse(text) as T;
    } catch {
      if (response.ok) {
        throw new Error("DocuSign returned an invalid JSON response.");
      }
    }
  }

  if (!response.ok) {
    throw new Error(
      `DocuSign request failed with status ${response.status}${
        text ? `: ${text.slice(0, 240)}` : ""
      }`,
    );
  }

  return payload;
}

export async function createDocuSignEnvelope({
  config,
  envelopeDefinition,
}: {
  config: DocuSignRuntimeConfig;
  envelopeDefinition: unknown;
}) {
  return docusignJsonRequest<{
    envelopeId?: string;
    status?: string;
    statusDateTime?: string;
    uri?: string;
  }>({
    body: envelopeDefinition,
    config,
    method: "POST",
    path: `/v2.1/accounts/${encodeURIComponent(config.accountId)}/envelopes`,
  });
}

export async function getDocuSignEnvelope({
  config,
  envelopeId,
}: {
  config: DocuSignRuntimeConfig;
  envelopeId: string;
}) {
  return docusignJsonRequest<{
    completedDateTime?: string;
    deliveredDateTime?: string;
    declinedDateTime?: string;
    envelopeId?: string;
    recipients?: {
      carbonCopies?: Array<Record<string, unknown>>;
      signers?: Array<Record<string, unknown>>;
    };
    sentDateTime?: string;
    status?: string;
    statusDateTime?: string;
    voidedDateTime?: string;
  }>({
    config,
    path: `/v2.1/accounts/${encodeURIComponent(
      config.accountId,
    )}/envelopes/${encodeURIComponent(envelopeId)}?include=recipients`,
  });
}

export async function getDocuSignEnvelopeRecipients({
  config,
  envelopeId,
}: {
  config: DocuSignRuntimeConfig;
  envelopeId: string;
}) {
  return docusignJsonRequest<{
    carbonCopies?: Array<Record<string, unknown>>;
    currentRoutingOrder?: string;
    signers?: Array<Record<string, unknown>>;
  }>({
    config,
    path: `/v2.1/accounts/${encodeURIComponent(
      config.accountId,
    )}/envelopes/${encodeURIComponent(envelopeId)}/recipients`,
  });
}

export async function downloadDocuSignEnvelopeDocument({
  config,
  documentId,
  envelopeId,
}: {
  config: DocuSignRuntimeConfig;
  documentId: "certificate" | "combined";
  envelopeId: string;
}) {
  const accessToken = await requestDocuSignAccessToken(config);
  const response = await fetch(
    `${config.apiBaseUri.replace(/\/$/, "")}/v2.1/accounts/${encodeURIComponent(
      config.accountId,
    )}/envelopes/${encodeURIComponent(envelopeId)}/documents/${documentId}`,
    {
      headers: {
        Accept: "application/pdf",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `DocuSign document download failed with status ${response.status}${
        body ? `: ${body.slice(0, 240)}` : ""
      }`,
    );
  }

  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "application/pdf",
  };
}

export { docuSignDocumentExtension, docuSignDefaultApiBaseUri };
