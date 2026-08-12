import "server-only";

import { NextRequest, NextResponse } from "next/server";
import type { McpRequestContext } from "@/lib/mcp/request-auth";
import { validateMcpReadRequest } from "@/lib/mcp/request-auth";
import { prisma } from "@/lib/prisma";

type McpReadToolRunInput = {
  args: Record<string, unknown>;
  context: McpRequestContext;
  payload: Record<string, unknown>;
};

type McpReadToolRunResult = {
  data: unknown;
  audit?: Record<string, unknown>;
};

function jsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseJsonBody(value: string) {
  try {
    return jsonObject(JSON.parse(value || "{}"));
  } catch {
    return null;
  }
}

function safeMetadata(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function safeHeaderValue(value: string | null, maxLength = 160) {
  if (!value) return null;

  const normalized = value.replace(/[\r\n]/g, " ").trim();

  return normalized ? normalized.slice(0, maxLength) : null;
}

function safeHeaderScopes(value: string | null) {
  return Array.from(
    new Set(
      (value ?? "")
        .split(/\s+/)
        .map((scope) => scope.trim())
        .filter((scope) => scope && scope.length <= 80)
        .filter((scope) => /^[a-z0-9._:-]+$/i.test(scope)),
    ),
  ).sort();
}

function requestPath(request: NextRequest) {
  try {
    return new URL(request.url).pathname;
  } catch {
    return null;
  }
}

function safeToolName(value: unknown) {
  return typeof value === "string" ? safeHeaderValue(value, 120) : null;
}

async function auditMcpToolCall({
  action,
  context,
  error,
  metadata,
  toolName,
}: {
  action: string;
  context: McpRequestContext;
  error?: string;
  metadata?: Record<string, unknown>;
  toolName: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        entity: "McpTool",
        entityId: toolName,
        metadata: safeMetadata({
          crmClientId: context.crmClientId,
          error: error ?? null,
          subject: context.subject,
          workspaceId: context.workspaceId,
          ...(metadata ?? {}),
        }),
      },
    });
  } catch (auditError) {
    console.error("MCP audit log write failed", auditError);
    throw new Error("MCP audit log write failed.");
  }
}

async function auditMcpRejectedRequest({
  action,
  error,
  metadata,
  request,
  status,
  toolName,
}: {
  action: string;
  error: string;
  metadata?: Record<string, unknown>;
  request: NextRequest;
  status: number;
  toolName: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        entity: "McpTool",
        entityId: toolName,
        metadata: safeMetadata({
          crmClientId: safeHeaderValue(request.headers.get("x-id30-mcp-client-id")),
          error,
          method: request.method,
          path: requestPath(request),
          requestId: safeHeaderValue(request.headers.get("x-id30-mcp-request-id")),
          scopes: safeHeaderScopes(request.headers.get("x-id30-mcp-scopes")),
          status,
          subject: safeHeaderValue(request.headers.get("x-id30-mcp-subject")),
          workspaceId: safeHeaderValue(request.headers.get("x-id30-mcp-workspace-id")),
          ...(metadata ?? {}),
        }),
      },
    });
  } catch (auditError) {
    console.error("MCP audit log write failed", auditError);
    throw new Error("MCP audit log write failed.");
  }
}

export async function handleMcpReadToolRequest({
  errorAction,
  request,
  requiredScopes,
  run,
  successAction,
  toolName,
}: {
  errorAction: string;
  request: NextRequest;
  requiredScopes: string[];
  run: (input: McpReadToolRunInput) => Promise<McpReadToolRunResult>;
  successAction: string;
  toolName: string;
}) {
  const body = await request.text();
  const validation = await validateMcpReadRequest({ body, request });

  if (!validation.ok) {
    await auditMcpRejectedRequest({
      action: errorAction,
      error: validation.message,
      metadata: { rejectionStage: "request_validation" },
      request,
      status: validation.status,
      toolName,
    });

    return NextResponse.json(
      { ok: false, message: validation.message },
      { status: validation.status },
    );
  }

  const grantedScopes = new Set(validation.context.scopes);
  const missingScopes = requiredScopes.filter((scope) => !grantedScopes.has(scope));

  if (missingScopes.length) {
    await auditMcpToolCall({
      action: errorAction,
      context: validation.context,
      error: "MCP request is missing a required scope.",
      metadata: {
        grantedScopes: validation.context.scopes,
        missingScopes,
        requiredScopes,
      },
      toolName,
    });

    return NextResponse.json(
      { ok: false, message: "MCP request is missing a required scope." },
      { status: 403 },
    );
  }

  const payload = parseJsonBody(body);

  if (!payload) {
    await auditMcpToolCall({
      action: errorAction,
      context: validation.context,
      error: "MCP request body must be valid JSON.",
      metadata: { rejectionStage: "body_parse" },
      toolName,
    });

    return NextResponse.json(
      { ok: false, message: "MCP request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (payload.tool !== toolName) {
    await auditMcpToolCall({
      action: errorAction,
      context: validation.context,
      error: "MCP request tool does not match this endpoint.",
      metadata: {
        rejectionStage: "tool_mismatch",
        requestedTool: safeToolName(payload.tool),
      },
      toolName,
    });

    return NextResponse.json(
      { ok: false, message: "MCP request tool does not match this endpoint." },
      { status: 400 },
    );
  }

  const args = jsonObject(payload.args);

  try {
    const result = await run({
      args,
      context: validation.context,
      payload,
    });

    await auditMcpToolCall({
      action: successAction,
      context: validation.context,
      metadata: result.audit,
      toolName,
    });

    return NextResponse.json(result.data);
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "MCP tool call failed.";

    await auditMcpToolCall({
      action: errorAction,
      context: validation.context,
      error: message,
      toolName,
    });

    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
