-- Persist desktop softphone presence across Node.js worker restarts/processes.
ALTER TABLE "User" ADD COLUMN "desktopSoftphoneLastSeenAt" TIMESTAMP(3);
