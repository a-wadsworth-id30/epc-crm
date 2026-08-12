CREATE TYPE "BusinessPhoneNumberStatus" AS ENUM ('ACTIVE', 'RELEASED');

CREATE TABLE "BusinessPhoneNumber" (
  "id" TEXT NOT NULL,
  "phoneNumber" TEXT NOT NULL,
  "label" TEXT,
  "twilioPhoneNumberSid" TEXT,
  "country" TEXT,
  "numberType" TEXT,
  "capabilities" JSONB,
  "status" "BusinessPhoneNumberStatus" NOT NULL DEFAULT 'ACTIVE',
  "metadata" JSONB,
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessPhoneNumber_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BusinessPhoneNumber_phoneNumber_key" ON "BusinessPhoneNumber"("phoneNumber");
CREATE UNIQUE INDEX "BusinessPhoneNumber_twilioPhoneNumberSid_key" ON "BusinessPhoneNumber"("twilioPhoneNumberSid");
CREATE INDEX "BusinessPhoneNumber_status_createdAt_idx" ON "BusinessPhoneNumber"("status", "createdAt");
