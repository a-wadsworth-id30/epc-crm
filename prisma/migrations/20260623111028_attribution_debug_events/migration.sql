-- CreateTable
CREATE TABLE "AttributionDebugEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT,
    "hostname" TEXT,
    "origin" TEXT,
    "path" TEXT,
    "visitorId" TEXT,
    "sessionId" TEXT,
    "attributionSnapshotId" TEXT,
    "metadata" JSONB,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttributionDebugEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttributionDebugEvent_eventType_createdAt_idx" ON "AttributionDebugEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "AttributionDebugEvent_level_createdAt_idx" ON "AttributionDebugEvent"("level", "createdAt");

-- CreateIndex
CREATE INDEX "AttributionDebugEvent_hostname_createdAt_idx" ON "AttributionDebugEvent"("hostname", "createdAt");

-- CreateIndex
CREATE INDEX "AttributionDebugEvent_visitorId_idx" ON "AttributionDebugEvent"("visitorId");

-- CreateIndex
CREATE INDEX "AttributionDebugEvent_sessionId_idx" ON "AttributionDebugEvent"("sessionId");

-- CreateIndex
CREATE INDEX "AttributionDebugEvent_attributionSnapshotId_idx" ON "AttributionDebugEvent"("attributionSnapshotId");

-- AddForeignKey
ALTER TABLE "AttributionDebugEvent" ADD CONSTRAINT "AttributionDebugEvent_attributionSnapshotId_fkey" FOREIGN KEY ("attributionSnapshotId") REFERENCES "AttributionSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
