ALTER TABLE "Product" ADD COLUMN "imageFileAssetId" TEXT;

ALTER TABLE "Product" ADD CONSTRAINT "Product_imageFileAssetId_fkey" FOREIGN KEY ("imageFileAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Product_imageFileAssetId_idx" ON "Product"("imageFileAssetId");
