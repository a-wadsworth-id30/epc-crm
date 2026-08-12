CREATE TABLE "AttributionConfidenceSnapshot" (
  "id" TEXT NOT NULL,
  "attributionSnapshotId" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "maxScore" INTEGER NOT NULL,
  "percentage" INTEGER NOT NULL,
  "clientSummary" TEXT,
  "factors" JSONB,
  "presentFactors" JSONB,
  "missingFactors" JSONB,
  "internalReasons" JSONB,
  "metadata" JSONB,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AttributionConfidenceSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AttributionConfidenceSnapshot_attributionSnapshotId_createdAt_idx"
ON "AttributionConfidenceSnapshot"("attributionSnapshotId", "createdAt");

CREATE INDEX "AttributionConfidenceSnapshot_level_createdAt_idx"
ON "AttributionConfidenceSnapshot"("level", "createdAt");

ALTER TABLE "AttributionConfidenceSnapshot"
ADD CONSTRAINT "AttributionConfidenceSnapshot_attributionSnapshotId_fkey"
FOREIGN KEY ("attributionSnapshotId") REFERENCES "AttributionSnapshot"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
