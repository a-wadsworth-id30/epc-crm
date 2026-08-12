import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export type McpRequestContext = {
  crmClientId: string;
  scopes: string[];
  subject: string;
  workspaceId: string;
};

export type McpRequestValidationResult =
  | {
      ok: true;
      context: McpRequestContext;
    }
  | {
      ok: false;
      message: string;
      status: number;
    };

function mcpSharedSecret() {
  const value = process.env.MCP_CRM_SHARED_SECRET?.trim();

  return value && value.length >= 32 ? value : null;
}

function configuredCrmClientId() {
  return process.env.ID30_AUTH_CRM_CLIENT_ID?.trim() || null;
}

function configuredWorkspaceId() {
  return (
    process.env.ID30_AUTH_WORKSPACE_ID?.trim() ||
    process.env.ID30_AUTH_CRM_CLIENT_ID?.trim() ||
    null
  );
}

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function hmac(value: string, secret: string) {
  return base64UrlEncode(createHmac("sha256", secret).update(value).digest());
}

function signaturesMatch(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

function signaturePayload({
  bodyHash,
  crmClientId,
  expiresAt,
  issuedAt,
  method,
  pathname,
  requestId,
  scopes,
  subject,
  workspaceId,
}: McpRequestContext & {
  bodyHash: string;
  expiresAt: string;
  issuedAt: string;
  method: string;
  pathname: string;
  requestId: string;
}) {
  const parts = [
    method.toUpperCase(),
    pathname,
    crmClientId,
    workspaceId,
    subject,
    requestId,
    bodyHash,
    issuedAt,
    expiresAt,
  ];

  if (scopes.length) {
    parts.push(scopes.join(" "));
  }

  return parts.join("\n");
}

function parseScopes(value: string | null) {
  if (!value?.trim()) return [];

  return Array.from(
    new Set(value.split(/\s+/).map((item) => item.trim()).filter(Boolean)),
  ).sort();
}

export async function validateMcpReadRequest({
  body,
  request,
}: {
  body: string;
  request: NextRequest;
}): Promise<McpRequestValidationResult> {
  const secret = mcpSharedSecret();

  if (!secret) {
    return {
      ok: false,
      message: "MCP_CRM_SHARED_SECRET is not configured.",
      status: 503,
    };
  }

  const crmClientId = request.headers.get("x-id30-mcp-client-id")?.trim();
  const workspaceId = request.headers.get("x-id30-mcp-workspace-id")?.trim();
  const subject = request.headers.get("x-id30-mcp-subject")?.trim();
  const scopes = parseScopes(request.headers.get("x-id30-mcp-scopes"));
  const bodyHash = request.headers.get("x-id30-mcp-body-hash")?.trim();
  const issuedAt = request.headers.get("x-id30-mcp-issued-at")?.trim();
  const expiresAt = request.headers.get("x-id30-mcp-expires-at")?.trim();
  const requestId = request.headers.get("x-id30-mcp-request-id")?.trim();
  const signature = request.headers.get("x-id30-mcp-signature")?.trim();

  if (
    !crmClientId ||
    !workspaceId ||
    !subject ||
    !bodyHash ||
    !issuedAt ||
    !expiresAt ||
    !requestId ||
    !signature
  ) {
    return {
      ok: false,
      message: "Signed MCP request headers are incomplete.",
      status: 401,
    };
  }

  if (requestId && (requestId.length < 8 || requestId.length > 128)) {
    return {
      ok: false,
      message: "Signed MCP request id is invalid.",
      status: 401,
    };
  }

  if (
    scopes.some(
      (scope) => scope.length > 80 || !/^[a-z0-9._:-]+$/i.test(scope),
    )
  ) {
    return {
      ok: false,
      message: "Signed MCP request scopes are invalid.",
      status: 401,
    };
  }

  const expectedCrmClientId = configuredCrmClientId();
  const expectedWorkspaceId = configuredWorkspaceId();

  if (
    (expectedCrmClientId && crmClientId !== expectedCrmClientId) ||
    (expectedWorkspaceId && workspaceId !== expectedWorkspaceId)
  ) {
    return {
      ok: false,
      message: "Signed MCP request does not match this CRM workspace.",
      status: 403,
    };
  }

  const issuedAtTime = Date.parse(issuedAt);
  const expiresAtTime = Date.parse(expiresAt);
  const now = Date.now();

  if (Number.isNaN(issuedAtTime) || Number.isNaN(expiresAtTime)) {
    return {
      ok: false,
      message: "Signed MCP request timestamps are invalid.",
      status: 401,
    };
  }

  if (issuedAtTime > now + 60_000 || expiresAtTime <= now) {
    return {
      ok: false,
      message: "Signed MCP request is expired or not yet valid.",
      status: 401,
    };
  }

  if (expiresAtTime - issuedAtTime > 5 * 60_000) {
    return {
      ok: false,
      message: "Signed MCP request expiry window is too long.",
      status: 401,
    };
  }

  if (!signaturesMatch(hmac(body, secret), bodyHash)) {
    return {
      ok: false,
      message: "Signed MCP request body hash is invalid.",
      status: 401,
    };
  }

  const pathname = new URL(request.url).pathname;
  const expectedSignature = hmac(
    signaturePayload({
      bodyHash,
      crmClientId,
      expiresAt,
      issuedAt,
      method: request.method,
      pathname,
      requestId,
      scopes,
      subject,
      workspaceId,
    }),
    secret,
  );

  if (!signaturesMatch(expectedSignature, signature)) {
    return {
      ok: false,
      message: "Signed MCP request signature is invalid.",
      status: 401,
    };
  }

  await prisma.mcpRequestNonce
    .deleteMany({
      where: {
        expiresAt: {
          lt: new Date(now),
        },
      },
    })
    .catch(() => null);

  try {
    await prisma.mcpRequestNonce.create({
      data: {
        crmClientId,
        expiresAt: new Date(expiresAtTime),
        requestId,
        subject,
        workspaceId,
      },
      select: {
        id: true,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        ok: false,
        message: "Signed MCP request has already been used.",
        status: 409,
      };
    }

    throw error;
  }

  return {
    ok: true,
    context: {
      crmClientId,
      scopes,
      subject,
      workspaceId,
    },
  };
}
