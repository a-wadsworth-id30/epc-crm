CREATE TABLE "ReportDefinition" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
  "source" TEXT NOT NULL DEFAULT 'CUSTOM',
  "config" JSONB NOT NULL,
  "ownerId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReportDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReportRun" (
  "id" TEXT NOT NULL,
  "reportDefinitionId" TEXT,
  "userId" TEXT,
  "prompt" TEXT,
  "config" JSONB NOT NULL,
  "summary" TEXT,
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "durationMs" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReportRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReportDefinition_ownerId_updatedAt_idx" ON "ReportDefinition"("ownerId", "updatedAt");
CREATE INDEX "ReportDefinition_visibility_updatedAt_idx" ON "ReportDefinition"("visibility", "updatedAt");
CREATE INDEX "ReportDefinition_source_updatedAt_idx" ON "ReportDefinition"("source", "updatedAt");
CREATE INDEX "ReportRun_reportDefinitionId_createdAt_idx" ON "ReportRun"("reportDefinitionId", "createdAt");
CREATE INDEX "ReportRun_userId_createdAt_idx" ON "ReportRun"("userId", "createdAt");
CREATE INDEX "ReportRun_status_createdAt_idx" ON "ReportRun"("status", "createdAt");

ALTER TABLE "ReportDefinition" ADD CONSTRAINT "ReportDefinition_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReportRun" ADD CONSTRAINT "ReportRun_reportDefinitionId_fkey" FOREIGN KEY ("reportDefinitionId") REFERENCES "ReportDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReportRun" ADD CONSTRAINT "ReportRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
