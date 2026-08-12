import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import Module from "node:module";
import { before, beforeEach, describe, it } from "node:test";
import type { NextRequest } from "next/server";
import type { handleMcpReadToolRequest as handleMcpReadToolRequestType } from "../src/lib/mcp/tool-route";

type AuditWrite = {
  data: {
    action: string;
    entity: string;
    entityId: string;
    metadata: Record<string, unknown>;
  };
};

type ModuleWithLoad = typeof Module & {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
};

const auditWrites: AuditWrite[] = [];

const mockPrisma = {
  auditLog: {
    create: async (input: AuditWrite) => {
      auditWrites.push(input);
      return { id: "audit-1" };
    },
  },
  mcpRequestNonce: {
    create: async () => ({ id: "nonce-1" }),
    deleteMany: async () => ({ count: 0 }),
  },
};

const moduleWithLoad = Module as ModuleWithLoad;
const originalLoad = moduleWithLoad._load;

moduleWithLoad._load = function loadWithMcpRouteStubs(
  this: unknown,
  request: string,
  parent: unknown,
  isMain: boolean,
) {
  if (request === "server-only") {
    return {};
  }

  if (request === "@/lib/prisma") {
    return { prisma: mockPrisma };
  }

  return Reflect.apply(originalLoad, this, [request, parent, isMain]);
};

const secret = "mcp-test-secret-value-at-least-32";
const clientId = "crm-client-1";
const workspaceId = "workspace-1";
const subject = "user@example.com";
const scopes = ["crm.search.read"];

let handleMcpReadToolRequest: typeof handleMcpReadToolRequestType;
let requestCounter = 0;

before(async () => {
  process.env.MCP_CRM_SHARED_SECRET = secret;
  process.env.ID30_AUTH_CRM_CLIENT_ID = clientId;
  process.env.ID30_AUTH_WORKSPACE_ID = workspaceId;

  ({ handleMcpReadToolRequest } = await import("../src/lib/mcp/tool-route"));
});

beforeEach(() => {
  auditWrites.length = 0;
  requestCounter += 1;
});

function base64UrlHmac(value: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function signedRequest(body: string, requestId = `request-${requestCounter}`) {
  const url = "https://crm.test/api/mcp/search";
  const issuedAt = new Date(Date.now() - 1_000).toISOString();
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const bodyHash = base64UrlHmac(body);
  const signaturePayload = [
    "POST",
    "/api/mcp/search",
    clientId,
    workspaceId,
    subject,
    requestId,
    bodyHash,
    issuedAt,
    expiresAt,
    scopes.join(" "),
  ].join("\n");

  return new Request(url, {
    body,
    headers: {
      "content-type": "application/json",
      "x-id30-mcp-body-hash": bodyHash,
      "x-id30-mcp-client-id": clientId,
      "x-id30-mcp-expires-at": expiresAt,
      "x-id30-mcp-issued-at": issuedAt,
      "x-id30-mcp-request-id": requestId,
      "x-id30-mcp-scopes": scopes.join(" "),
      "x-id30-mcp-signature": base64UrlHmac(signaturePayload),
      "x-id30-mcp-subject": subject,
      "x-id30-mcp-workspace-id": workspaceId,
    },
    method: "POST",
  }) as unknown as NextRequest;
}

async function postToHandler(request: NextRequest) {
  return handleMcpReadToolRequest({
    errorAction: "mcp.search.error",
    request,
    requiredScopes: ["crm.search.read"],
    run: async () => {
      throw new Error("run should not be called");
    },
    successAction: "mcp.search.read",
    toolName: "crm.search",
  });
}

describe("MCP tool route rejection audit", () => {
  it("audits signed request validation failures without secret headers", async () => {
    const response = await postToHandler(
      new Request("https://crm.test/api/mcp/search", {
        body: "{}",
        headers: {
          "content-type": "application/json",
          "x-id30-mcp-body-hash": "not-stored",
          "x-id30-mcp-client-id": clientId,
          "x-id30-mcp-request-id": "request-missing-headers",
          "x-id30-mcp-scopes": "crm.search.read crm.sales.read",
          "x-id30-mcp-signature": "not-stored",
          "x-id30-mcp-subject": subject,
          "x-id30-mcp-workspace-id": workspaceId,
        },
        method: "POST",
      }) as unknown as NextRequest,
    );

    assert.equal(response.status, 401);
    assert.equal(auditWrites.length, 1);
    assert.equal(auditWrites[0].data.action, "mcp.search.error");
    assert.equal(auditWrites[0].data.entity, "McpTool");
    assert.equal(auditWrites[0].data.entityId, "crm.search");

    const metadata = auditWrites[0].data.metadata;
    assert.equal(metadata.rejectionStage, "request_validation");
    assert.equal(metadata.error, "Signed MCP request headers are incomplete.");
    assert.equal(metadata.status, 401);
    assert.equal(metadata.crmClientId, clientId);
    assert.deepEqual(metadata.scopes, ["crm.sales.read", "crm.search.read"]);
    assert.equal(Object.hasOwn(metadata, "signature"), false);
    assert.equal(Object.hasOwn(metadata, "bodyHash"), false);
  });

  it("audits malformed JSON after signed request validation passes", async () => {
    const response = await postToHandler(signedRequest("{bad-json"));

    assert.equal(response.status, 400);
    assert.equal(auditWrites.length, 1);

    const metadata = auditWrites[0].data.metadata;
    assert.equal(metadata.rejectionStage, "body_parse");
    assert.equal(metadata.error, "MCP request body must be valid JSON.");
    assert.equal(metadata.crmClientId, clientId);
    assert.equal(metadata.subject, subject);
    assert.equal(metadata.workspaceId, workspaceId);
  });

  it("audits signed tool mismatch rejections", async () => {
    const response = await postToHandler(
      signedRequest(JSON.stringify({ args: {}, tool: "crm.sales_summary" })),
    );

    assert.equal(response.status, 400);
    assert.equal(auditWrites.length, 1);

    const metadata = auditWrites[0].data.metadata;
    assert.equal(metadata.rejectionStage, "tool_mismatch");
    assert.equal(metadata.requestedTool, "crm.sales_summary");
    assert.equal(metadata.error, "MCP request tool does not match this endpoint.");
  });
});
