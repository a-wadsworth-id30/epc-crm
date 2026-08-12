ALTER TABLE "CrmSettings"
  ADD COLUMN "attributionSessionTimeoutMinutes" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "attributionTimelineLimit" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "attributionCaptureReferrerEnabled" BOOLEAN NOT NULL DEFAULT true;
