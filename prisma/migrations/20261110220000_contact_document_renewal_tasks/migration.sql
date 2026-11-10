ALTER TABLE "FileAsset"
ADD COLUMN "documentIssuedAt" TIMESTAMP(3),
ADD COLUMN "documentRenewalTaskId" TEXT;

CREATE UNIQUE INDEX "FileAsset_documentRenewalTaskId_key" ON "FileAsset"("documentRenewalTaskId");
CREATE INDEX "FileAsset_documentIssuedAt_idx" ON "FileAsset"("documentIssuedAt");

ALTER TABLE "FileAsset"
ADD CONSTRAINT "FileAsset_documentRenewalTaskId_fkey"
FOREIGN KEY ("documentRenewalTaskId") REFERENCES "Task"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
