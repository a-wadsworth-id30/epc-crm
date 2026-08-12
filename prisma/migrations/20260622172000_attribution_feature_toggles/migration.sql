ALTER TABLE "CrmSettings"
  ADD COLUMN "attributionTrackingEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "attributionFormTrackingEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "attributionInjectHiddenFieldEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "attributionPhoneTrackingEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "attributionReplaceTelLinksEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "attributionReplaceVisibleNumbersEnabled" BOOLEAN NOT NULL DEFAULT true;
