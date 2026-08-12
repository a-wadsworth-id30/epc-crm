CREATE TABLE "McpRequestNonce" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "crmClientId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "McpRequestNonce_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "McpRequestNonce_workspaceId_requestId_key" ON "McpRequestNonce"("workspaceId", "requestId");
CREATE INDEX "McpRequestNonce_crmClientId_createdAt_idx" ON "McpRequestNonce"("crmClientId", "createdAt");
CREATE INDEX "McpRequestNonce_workspaceId_createdAt_idx" ON "McpRequestNonce"("workspaceId", "createdAt");
CREATE INDEX "McpRequestNonce_expiresAt_idx" ON "McpRequestNonce"("expiresAt");
