CREATE TYPE "AgentAvailability" AS ENUM ('AVAILABLE', 'BUSY', 'AWAY', 'OFFLINE');

CREATE TYPE "CallQueueStatus" AS ENUM ('WAITING', 'CONNECTING', 'ANSWERED', 'MISSED', 'ABANDONED', 'COMPLETED');

CREATE TYPE "RecordingConsentStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'CONSENTED', 'DECLINED');

ALTER TABLE "User" ADD COLUMN "voiceAvailability" "AgentAvailability" NOT NULL DEFAULT 'OFFLINE';
ALTER TABLE "User" ADD COLUMN "voiceLastSeenAt" TIMESTAMP(3);

ALTER TABLE "CallLog" ADD COLUMN "recordingSid" TEXT;
ALTER TABLE "CallLog" ADD COLUMN "recordingConsent" "RecordingConsentStatus" NOT NULL DEFAULT 'PENDING';

ALTER TABLE "Task" ADD COLUMN "metadata" JSONB;

CREATE TABLE "CallQueueEntry" (
  "id" TEXT NOT NULL,
  "status" "CallQueueStatus" NOT NULL DEFAULT 'WAITING',
  "callSid" TEXT NOT NULL,
  "conferenceName" TEXT NOT NULL,
  "fromNumber" TEXT,
  "toNumber" TEXT,
  "assignedUserId" TEXT,
  "callLogId" TEXT,
  "contactId" TEXT,
  "opportunityId" TEXT,
  "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "answeredAt" TIMESTAMP(3),
  "missedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CallQueueEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CallQueueEntry_callSid_key" ON "CallQueueEntry"("callSid");
CREATE INDEX "CallQueueEntry_status_queuedAt_idx" ON "CallQueueEntry"("status", "queuedAt");
CREATE INDEX "CallQueueEntry_assignedUserId_queuedAt_idx" ON "CallQueueEntry"("assignedUserId", "queuedAt");
CREATE INDEX "CallQueueEntry_contactId_queuedAt_idx" ON "CallQueueEntry"("contactId", "queuedAt");
CREATE INDEX "CallQueueEntry_opportunityId_queuedAt_idx" ON "CallQueueEntry"("opportunityId", "queuedAt");
CREATE INDEX "CallLog_recordingSid_idx" ON "CallLog"("recordingSid");

ALTER TABLE "CallQueueEntry" ADD CONSTRAINT "CallQueueEntry_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CallQueueEntry" ADD CONSTRAINT "CallQueueEntry_callLogId_fkey" FOREIGN KEY ("callLogId") REFERENCES "CallLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CallQueueEntry" ADD CONSTRAINT "CallQueueEntry_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CallQueueEntry" ADD CONSTRAINT "CallQueueEntry_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "SalesOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
