CREATE TYPE "VoiceRoutingMode" AS ENUM ('BROWSER', 'MOBILE', 'LANDLINE', 'SIP', 'FLEX');

CREATE TYPE "CallDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'INTERNAL');

CREATE TYPE "CallStatus" AS ENUM ('QUEUED', 'RINGING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'BUSY', 'NO_ANSWER', 'CANCELED');

ALTER TABLE "User" ADD COLUMN "voiceRoutingMode" "VoiceRoutingMode" NOT NULL DEFAULT 'BROWSER';
ALTER TABLE "User" ADD COLUMN "voiceExtension" TEXT;
ALTER TABLE "User" ADD COLUMN "sipAddress" TEXT;

CREATE TABLE "CallLog" (
  "id" TEXT NOT NULL,
  "direction" "CallDirection" NOT NULL,
  "status" "CallStatus" NOT NULL DEFAULT 'QUEUED',
  "fromNumber" TEXT,
  "toNumber" TEXT,
  "fromIdentity" TEXT,
  "toIdentity" TEXT,
  "callSid" TEXT,
  "parentCallSid" TEXT,
  "conferenceSid" TEXT,
  "conferenceName" TEXT,
  "recordingUrl" TEXT,
  "durationSeconds" INTEGER,
  "provider" TEXT NOT NULL DEFAULT 'twilio',
  "metadata" JSONB,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "answeredAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "userId" TEXT,
  "contactId" TEXT,
  "opportunityId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CallLog_callSid_key" ON "CallLog"("callSid");
CREATE INDEX "CallLog_userId_startedAt_idx" ON "CallLog"("userId", "startedAt");
CREATE INDEX "CallLog_contactId_startedAt_idx" ON "CallLog"("contactId", "startedAt");
CREATE INDEX "CallLog_opportunityId_startedAt_idx" ON "CallLog"("opportunityId", "startedAt");
CREATE INDEX "CallLog_parentCallSid_idx" ON "CallLog"("parentCallSid");
CREATE INDEX "CallLog_conferenceName_idx" ON "CallLog"("conferenceName");
CREATE INDEX "CallLog_status_idx" ON "CallLog"("status");

ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "SalesOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
