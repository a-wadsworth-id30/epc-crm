CREATE TYPE "AttributionTouchpointRole" AS ENUM ('FIRST', 'ASSISTED', 'LAST', 'FIRST_LAST');

CREATE TABLE "AttributionTouchpoint" (
  "id" TEXT NOT NULL,
  "attributionSnapshotId" TEXT,
  "attributionRecordId" TEXT,
  "visitorId" TEXT,
  "sessionId" TEXT,
  "role" "AttributionTouchpointRole" NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "source" TEXT,
  "medium" TEXT,
  "campaign" TEXT,
  "content" TEXT,
  "term" TEXT,
  "url" TEXT,
  "landingPage" TEXT,
  "referrer" TEXT,
  "capturedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttributionTouchpoint_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AttributionTouchpoint_attributionSnapshotId_position_idx" ON "AttributionTouchpoint"("attributionSnapshotId", "position");
CREATE INDEX "AttributionTouchpoint_attributionRecordId_position_idx" ON "AttributionTouchpoint"("attributionRecordId", "position");
CREATE INDEX "AttributionTouchpoint_visitorId_sessionId_position_idx" ON "AttributionTouchpoint"("visitorId", "sessionId", "position");
CREATE INDEX "AttributionTouchpoint_role_capturedAt_idx" ON "AttributionTouchpoint"("role", "capturedAt");
CREATE INDEX "AttributionTouchpoint_source_campaign_idx" ON "AttributionTouchpoint"("source", "campaign");
CREATE INDEX "AttributionTouchpoint_medium_idx" ON "AttributionTouchpoint"("medium");
CREATE INDEX "AttributionTouchpoint_capturedAt_idx" ON "AttributionTouchpoint"("capturedAt");

ALTER TABLE "AttributionTouchpoint"
  ADD CONSTRAINT "AttributionTouchpoint_attributionSnapshotId_fkey"
  FOREIGN KEY ("attributionSnapshotId") REFERENCES "AttributionSnapshot"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AttributionTouchpoint"
  ADD CONSTRAINT "AttributionTouchpoint_attributionRecordId_fkey"
  FOREIGN KEY ("attributionRecordId") REFERENCES "AttributionRecord"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
