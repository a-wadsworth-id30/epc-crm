-- CreateEnum
CREATE TYPE "ProductCategoryCollectionMode" AS ENUM ('MANUAL', 'AUTOMATED');

-- CreateEnum
CREATE TYPE "ProductCategoryRuleMatch" AS ENUM ('ANY', 'ALL');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "ProductCategory"
  ADD COLUMN "collectionMode" "ProductCategoryCollectionMode" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "ruleMatch" "ProductCategoryRuleMatch" NOT NULL DEFAULT 'ANY',
  ADD COLUMN "ruleTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "ProductCategoryProduct" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCategoryProduct_pkey" PRIMARY KEY ("id")
);

-- Preserve existing primary category assignments as manual collection membership.
INSERT INTO "ProductCategoryProduct" ("id", "categoryId", "productId", "createdAt")
SELECT
  'pcp_' || substr(md5(random()::text || clock_timestamp()::text || id), 1, 24),
  "categoryId",
  id,
  CURRENT_TIMESTAMP
FROM "Product"
WHERE "categoryId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategoryProduct_categoryId_productId_key" ON "ProductCategoryProduct"("categoryId", "productId");

-- CreateIndex
CREATE INDEX "ProductCategoryProduct_productId_idx" ON "ProductCategoryProduct"("productId");

-- CreateIndex
CREATE INDEX "ProductCategoryProduct_categoryId_sortOrder_idx" ON "ProductCategoryProduct"("categoryId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProductCategory_collectionMode_idx" ON "ProductCategory"("collectionMode");

-- AddForeignKey
ALTER TABLE "ProductCategoryProduct" ADD CONSTRAINT "ProductCategoryProduct_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategoryProduct" ADD CONSTRAINT "ProductCategoryProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
