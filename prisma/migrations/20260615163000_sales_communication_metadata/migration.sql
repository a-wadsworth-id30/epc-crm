ALTER TABLE "SalesCommunication" ADD COLUMN "metadata" JSONB;

CREATE INDEX "SalesCommunication_externalId_idx" ON "SalesCommunication"("externalId");
