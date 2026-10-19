import "server-only";

import crypto from "node:crypto";
import { z } from "zod";
import { appBaseUrlFromRequest } from "@/lib/http/origin";
import {
  getId30AuthRuntimeConfig,
  id30AuthIdentifierSchema,
} from "@/lib/integrations/id30-auth";

const completionStatuses = [
  "connected",
  "failed",
  "reconnect_required",
] as const;

const completionPayloadSchema = z
  .object({
    crmClientId: id30AuthIdentifierSchema,
    workspaceId: id30AuthIdentifierSchema,
    provider: z.string().trim().min(1),
    connectionId: z.string().trim().min(1).optional(),
    providerAccountId: z.string().trim().min(1).nullable().optional(),
    providerAccountName: z.string().trim().min(1).nullable().optional(),
    status: z.enum(completionStatuses),
    selectorOptions: z.record(z.string(), z.unknown()).optional(),
    connectedAt: z.string().datetime().optional(),
    errorRef: z.string().trim().min(1).optional(),
    issuedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
  })
  .passthrough()
  .superRefine((payload, context) => {
    if (payload.status === "connected" && !payload.connectionId) {
      context.addIssue({
        code: "custom",
        message: "Connected callbacks must include an Auth connection ID.",
        path: ["connectionId"],
      });
    }
  });

export type Id30AuthBrokerCompletionPayload = z.infer<
  typeof completionPayloadSchema
>;

type AuthBrokerRequestMethod = "DELETE" | "GET" | "POST";

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payloadSegment: string, secret: string) {
  return base64UrlEncode(
    crypto.createHmac("sha256", secret).update(payloadSegment).digest(),
  );
}

function signaturesMatch(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  return (
    expectedBuffer.length === actualBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

function completionSegments(body: unknown) {
  const objectBody = jsonObject(body);
  const token =
    typeof body === "string" ? body.trim() : stringValue(objectBody.token);
  if (token) {
    const [payloadSegment, signatureSegment] = token.split(".");
    return payloadSegment && signatureSegment
      ? { payloadSegment, signatureSegment }
      : null;
  }

  const signatureSegment = stringValue(objectBody.signature);
  const rawPayload = objectBody.payload;
  if (!signatureSegment) return null;

  if (typeof rawPayload === "string" && rawPayload.trim()) {
    return { payloadSegment: rawPayload.trim(), signatureSegment };
  }
  if (rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)) {
    return {
      payloadSegment: base64UrlEncode(JSON.stringify(rawPayload)),
      signatureSegment,
    };
  }

  return null;
}

function timestampError(payload: Id30AuthBrokerCompletionPayload) {
  const now = Date.now();
  const issuedAt = Date.parse(payload.issuedAt);
  const expiresAt = Date.parse(payload.expiresAt);

  if (Number.isNaN(issuedAt) || Number.isNaN(expiresAt)) {
    return "Completion callback timestamps are invalid.";
  }
  if (issuedAt > now + 60_000) {
    return "Completion callback was issued in the future.";
  }
  if (expiresAt <= now) return "Completion callback has expired.";
  if (expiresAt - issuedAt > 10 * 60_000) {
    return "Completion callback expiry window is too long.";
  }

  return null;
}

export async function verifyId30AuthBrokerCompletion(body: unknown): Promise<
  | { ok: true; payload: Id30AuthBrokerCompletionPayload }
  | { ok: false; status: number; message: string }
> {
  const authBroker = await getId30AuthRuntimeConfig();
  if (!authBroker) {
    return {
      ok: false,
      status: 503,
      message: "iD30 Auth shared secret is not configured.",
    };
  }

  const segments = completionSegments(body);
  if (!segments) {
    return {
      ok: false,
      status: 400,
      message: "Signed completion callback is missing or malformed.",
    };
  }

  const expected = signPayload(segments.payloadSegment, authBroker.sharedSecret);
  if (!signaturesMatch(expected, segments.signatureSegment)) {
    return {
      ok: false,
      status: 401,
      message: "Signed completion callback signature is invalid.",
    };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(base64UrlDecode(segments.payloadSegment));
  } catch {
    return {
      ok: false,
      status: 400,
      message: "Signed completion callback payload is invalid JSON.",
    };
  }

  const parsed = completionPayloadSchema.safeParse(decoded);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      message: "Signed completion callback payload is incomplete.",
    };
  }

  if (
    parsed.data.crmClientId !== authBroker.crmClientId ||
    parsed.data.workspaceId !== authBroker.workspaceId
  ) {
    return {
      ok: false,
      status: 403,
      message: "Signed completion callback does not match this CRM workspace.",
    };
  }

  const invalidTimestamp = timestampError(parsed.data);
  if (invalidTimestamp) {
    return { ok: false, status: 400, message: invalidTimestamp };
  }

  return { ok: true, payload: parsed.data };
}

export async function id30AuthBrokerStartUrl({
  provider,
  request,
  returnPath,
  userId,
}: {
  provider: string;
  request: Request;
  returnPath: string;
  userId: string;
}) {
  const authBroker = await getId30AuthRuntimeConfig();
  if (!authBroker) return null;

  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 10 * 60_000);
  const payload = {
    crmClientId: authBroker.crmClientId,
    workspaceId: authBroker.workspaceId,
    provider,
    returnUrl: `${appBaseUrlFromRequest(request)}${returnPath}`,
    requestedByUserId: userId,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  const payloadSegment = base64UrlEncode(JSON.stringify(payload));
  const signatureSegment = signPayload(payloadSegment, authBroker.sharedSecret);
  const url = new URL(`/connect/${provider}`, authBroker.baseUrl);
  url.searchParams.set("request", `${payloadSegment}.${signatureSegment}`);
  return url;
}

function sha256Base64Url(value: string) {
  return crypto.createHash("sha256").update(value).digest("base64url");
}

function signedHeaders({
  body,
  connectionId,
  method,
  pathname,
  runtime,
}: {
  body?: string;
  connectionId: string;
  method: AuthBrokerRequestMethod;
  pathname: string;
  runtime: NonNullable<Awaited<ReturnType<typeof getId30AuthRuntimeConfig>>>;
}) {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 10 * 60_000);
  const requestId = crypto.randomUUID();
  const contentDigest = body === undefined ? null : sha256Base64Url(body);
  const signaturePayload = [
    method,
    pathname,
    runtime.crmClientId,
    runtime.workspaceId,
    connectionId,
    requestId,
    issuedAt.toISOString(),
    expiresAt.toISOString(),
    ...(contentDigest ? [contentDigest] : []),
  ].join("\n");

  return {
    ...(body === undefined ? {} : { "content-type": "application/json" }),
    ...(contentDigest ? { "x-id30-content-sha256": contentDigest } : {}),
    "x-id30-crm-client-id": runtime.crmClientId,
    "x-id30-crm-request-id": requestId,
    "x-id30-workspace-id": runtime.workspaceId,
    "x-id30-issued-at": issuedAt.toISOString(),
    "x-id30-expires-at": expiresAt.toISOString(),
    "x-id30-signature": signPayload(signaturePayload, runtime.sharedSecret),
  };
}

export async function id30AuthBrokerRequest({
  body,
  connectionId,
  method,
  pathname,
}: {
  body?: unknown;
  connectionId: string;
  method: AuthBrokerRequestMethod;
  pathname: string;
}) {
  const runtime = await getId30AuthRuntimeConfig();
  if (!runtime) {
    return {
      ok: false as const,
      status: 503,
      message: "iD30 Auth broker is not configured.",
    };
  }

  const serializedBody = body === undefined ? undefined : JSON.stringify(body);
  const response = await fetch(new URL(pathname, runtime.baseUrl), {
    method,
    headers: signedHeaders({
      body: serializedBody,
      connectionId,
      method,
      pathname,
      runtime,
    }),
    body: serializedBody,
    cache: "no-store",
  });
  const responseBody = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    return {
      ok: false as const,
      status: response.status,
      message:
        stringValue(responseBody.message) ??
        `iD30 Auth request failed with HTTP ${response.status}.`,
      body: responseBody,
    };
  }

  return {
    ok: true as const,
    status: response.status,
    body: responseBody,
  };
}
