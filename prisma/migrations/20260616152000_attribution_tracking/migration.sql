CREATE TYPE "AttributionRecordSource" AS ENUM ('FORM', 'PHONE', 'MANUAL');

ALTER TABLE "Contact" ADD COLUMN "attribution" JSONB;
ALTER TABLE "SalesOpportunity" ADD COLUMN "attribution" JSONB;
ALTER TABLE "CallLog" ADD COLUMN "attribution" JSONB;
ALTER TABLE "CallQueueEntry" ADD COLUMN "attribution" JSONB;

CREATE TABLE "AttributionSnapshot" (
  "id" TEXT NOT NULL,
  "visitorId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "firstTouch" JSONB,
  "lastTouch" JSONB,
  "timeline" JSONB,
  "landingPage" TEXT,
  "currentPage" TEXT,
  "referrer" TEXT,
  "userAgent" TEXT,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AttributionSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttributionPhoneNumber" (
  "id" TEXT NOT NULL,
  "phoneNumber" TEXT NOT NULL,
  "label" TEXT,
  "destinationNumber" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AttributionPhoneNumber_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttributionNumberAssignment" (
  "id" TEXT NOT NULL,
  "phoneNumberId" TEXT NOT NULL,
  "attributionSnapshotId" TEXT,
  "visitorId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,

  CONSTRAINT "AttributionNumberAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttributionRecord" (
  "id" TEXT NOT NULL,
  "source" "AttributionRecordSource" NOT NULL,
  "attributionSnapshotId" TEXT,
  "trackingPhoneNumberId" TEXT,
  "visitorId" TEXT,
  "sessionId" TEXT,
  "contactId" TEXT,
  "opportunityId" TEXT,
  "callLogId" TEXT,
  "callQueueEntryId" TEXT,
  "firstTouch" JSONB,
  "lastTouch" JSONB,
  "timeline" JSONB,
  "landingPage" TEXT,
  "currentPage" TEXT,
  "referrer" TEXT,
  "trackingPhoneNumber" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AttributionRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AttributionSnapshot_visitorId_sessionId_key" ON "AttributionSnapshot"("visitorId", "sessionId");
CREATE INDEX "AttributionSnapshot_visitorId_idx" ON "AttributionSnapshot"("visitorId");
CREATE INDEX "AttributionSnapshot_sessionId_idx" ON "AttributionSnapshot"("sessionId");
CREATE INDEX "AttributionSnapshot_updatedAt_idx" ON "AttributionSnapshot"("updatedAt");

CREATE UNIQUE INDEX "AttributionPhoneNumber_phoneNumber_key" ON "AttributionPhoneNumber"("phoneNumber");
CREATE INDEX "AttributionPhoneNumber_isActive_priority_idx" ON "AttributionPhoneNumber"("isActive", "priority");

CREATE INDEX "AttributionNumberAssignment_visitorId_sessionId_expiresAt_idx" ON "AttributionNumberAssignment"("visitorId", "sessionId", "expiresAt");
CREATE INDEX "AttributionNumberAssignment_phoneNumberId_expiresAt_idx" ON "AttributionNumberAssignment"("phoneNumberId", "expiresAt");

CREATE INDEX "AttributionRecord_source_createdAt_idx" ON "AttributionRecord"("source", "createdAt");
CREATE INDEX "AttributionRecord_visitorId_idx" ON "AttributionRecord"("visitorId");
CREATE INDEX "AttributionRecord_sessionId_idx" ON "AttributionRecord"("sessionId");
CREATE INDEX "AttributionRecord_contactId_idx" ON "AttributionRecord"("contactId");
CREATE INDEX "AttributionRecord_opportunityId_idx" ON "AttributionRecord"("opportunityId");
CREATE INDEX "AttributionRecord_callLogId_idx" ON "AttributionRecord"("callLogId");
CREATE INDEX "AttributionRecord_callQueueEntryId_idx" ON "AttributionRecord"("callQueueEntryId");
CREATE INDEX "AttributionRecord_trackingPhoneNumber_idx" ON "AttributionRecord"("trackingPhoneNumber");

ALTER TABLE "AttributionNumberAssignment" ADD CONSTRAINT "AttributionNumberAssignment_phoneNumberId_fkey" FOREIGN KEY ("phoneNumberId") REFERENCES "AttributionPhoneNumber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttributionNumberAssignment" ADD CONSTRAINT "AttributionNumberAssignment_attributionSnapshotId_fkey" FOREIGN KEY ("attributionSnapshotId") REFERENCES "AttributionSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttributionRecord" ADD CONSTRAINT "AttributionRecord_attributionSnapshotId_fkey" FOREIGN KEY ("attributionSnapshotId") REFERENCES "AttributionSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttributionRecord" ADD CONSTRAINT "AttributionRecord_trackingPhoneNumberId_fkey" FOREIGN KEY ("trackingPhoneNumberId") REFERENCES "AttributionPhoneNumber"("id") ON DELETE SET NULL ON UPDATE CASCADE;
