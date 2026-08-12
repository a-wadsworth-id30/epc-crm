-- Queue one pending CRM-to-desktop softphone command per user.
ALTER TABLE "User" ADD COLUMN "desktopSoftphoneCommand" JSONB;
