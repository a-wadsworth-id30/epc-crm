ALTER TABLE "EmailMailbox"
ADD COLUMN "syncLeaseId" TEXT,
ADD COLUMN "syncLeaseUntil" TIMESTAMP(3);

CREATE INDEX "EmailMailbox_syncLeaseUntil_idx"
ON "EmailMailbox"("syncLeaseUntil");
