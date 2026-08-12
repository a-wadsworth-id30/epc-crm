CREATE TABLE "NotificationState" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "seenAt" TIMESTAMP(3),
  "dismissedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NotificationState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationState_userId_notificationId_key" ON "NotificationState"("userId", "notificationId");
CREATE INDEX "NotificationState_userId_seenAt_idx" ON "NotificationState"("userId", "seenAt");
CREATE INDEX "NotificationState_userId_dismissedAt_idx" ON "NotificationState"("userId", "dismissedAt");

ALTER TABLE "NotificationState"
  ADD CONSTRAINT "NotificationState_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
