CREATE TYPE "ProductRecordType" AS ENUM ('SERVICE', 'PHYSICAL', 'DIGITAL', 'SUBSCRIPTION', 'BUNDLE');
CREATE TYPE "OpportunityProductStatus" AS ENUM ('SUSPECTED', 'CONFIRMED', 'QUOTED', 'DECLINED');
CREATE TYPE "DiscoveryTemplateScope" AS ENUM ('LEAD', 'PRODUCT', 'CATEGORY');
CREATE TYPE "DiscoveryQuestionScope" AS ENUM ('OPPORTUNITY', 'PRODUCT', 'CATEGORY', 'LINE_ITEM');
CREATE TYPE "DiscoveryAnswerType" AS ENUM ('TEXT', 'LONG_TEXT', 'BOOLEAN', 'SINGLE_SELECT', 'MULTI_SELECT', 'NUMBER', 'DATE', 'CURRENCY');
CREATE TYPE "DiscoveryAnswerSource" AS ENUM ('MANUAL', 'AI', 'FORM', 'IMPORT');

CREATE TABLE "ProductCategory" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "parentId" TEXT,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Product" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "type" "ProductRecordType" NOT NULL DEFAULT 'SERVICE',
  "categoryId" TEXT,
  "sku" TEXT,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscoveryTemplate" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "scope" "DiscoveryTemplateScope" NOT NULL DEFAULT 'LEAD',
  "version" INTEGER NOT NULL DEFAULT 1,
  "description" TEXT,
  "salesPipelineStageId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiscoveryTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscoveryQuestion" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "helpText" TEXT,
  "scope" "DiscoveryQuestionScope" NOT NULL DEFAULT 'OPPORTUNITY',
  "answerType" "DiscoveryAnswerType" NOT NULL DEFAULT 'TEXT',
  "options" JSONB,
  "defaultRequired" BOOLEAN NOT NULL DEFAULT false,
  "dedupeKey" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiscoveryQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscoveryTemplateQuestion" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "requirementLevel" TEXT NOT NULL DEFAULT 'standard',
  "visibilityRules" JSONB,
  "requirementRules" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiscoveryTemplateQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductDiscoveryTemplate" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductDiscoveryTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductCategoryDiscoveryTemplate" (
  "id" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductCategoryDiscoveryTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OpportunityProduct" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "status" "OpportunityProductStatus" NOT NULL DEFAULT 'SUSPECTED',
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "estimatedValueCents" INTEGER,
  "source" TEXT,
  "confidence" INTEGER,
  "notes" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OpportunityProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OpportunityDiscoveryAnswer" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "productId" TEXT,
  "categoryId" TEXT,
  "value" JSONB,
  "source" "DiscoveryAnswerSource" NOT NULL DEFAULT 'MANUAL',
  "confidence" INTEGER,
  "answeredAt" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "answeredByUserId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OpportunityDiscoveryAnswer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductCategory_slug_key" ON "ProductCategory"("slug");
CREATE INDEX "ProductCategory_isActive_sortOrder_idx" ON "ProductCategory"("isActive", "sortOrder");
CREATE INDEX "ProductCategory_parentId_idx" ON "ProductCategory"("parentId");

CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");
CREATE INDEX "Product_isActive_sortOrder_idx" ON "Product"("isActive", "sortOrder");
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");
CREATE INDEX "Product_type_idx" ON "Product"("type");
CREATE INDEX "Product_sku_idx" ON "Product"("sku");

CREATE UNIQUE INDEX "DiscoveryTemplate_slug_key" ON "DiscoveryTemplate"("slug");
CREATE INDEX "DiscoveryTemplate_scope_isActive_idx" ON "DiscoveryTemplate"("scope", "isActive");
CREATE INDEX "DiscoveryTemplate_salesPipelineStageId_idx" ON "DiscoveryTemplate"("salesPipelineStageId");

CREATE UNIQUE INDEX "DiscoveryQuestion_slug_key" ON "DiscoveryQuestion"("slug");
CREATE INDEX "DiscoveryQuestion_scope_isActive_idx" ON "DiscoveryQuestion"("scope", "isActive");
CREATE INDEX "DiscoveryQuestion_dedupeKey_idx" ON "DiscoveryQuestion"("dedupeKey");
CREATE INDEX "DiscoveryQuestion_sortOrder_idx" ON "DiscoveryQuestion"("sortOrder");

CREATE UNIQUE INDEX "DiscoveryTemplateQuestion_templateId_questionId_key" ON "DiscoveryTemplateQuestion"("templateId", "questionId");
CREATE INDEX "DiscoveryTemplateQuestion_questionId_idx" ON "DiscoveryTemplateQuestion"("questionId");
CREATE INDEX "DiscoveryTemplateQuestion_templateId_sortOrder_idx" ON "DiscoveryTemplateQuestion"("templateId", "sortOrder");

CREATE UNIQUE INDEX "ProductDiscoveryTemplate_productId_templateId_key" ON "ProductDiscoveryTemplate"("productId", "templateId");
CREATE INDEX "ProductDiscoveryTemplate_templateId_idx" ON "ProductDiscoveryTemplate"("templateId");

CREATE UNIQUE INDEX "ProductCategoryDiscoveryTemplate_categoryId_templateId_key" ON "ProductCategoryDiscoveryTemplate"("categoryId", "templateId");
CREATE INDEX "ProductCategoryDiscoveryTemplate_templateId_idx" ON "ProductCategoryDiscoveryTemplate"("templateId");

CREATE UNIQUE INDEX "OpportunityProduct_opportunityId_productId_key" ON "OpportunityProduct"("opportunityId", "productId");
CREATE INDEX "OpportunityProduct_productId_status_idx" ON "OpportunityProduct"("productId", "status");
CREATE INDEX "OpportunityProduct_opportunityId_status_idx" ON "OpportunityProduct"("opportunityId", "status");

CREATE INDEX "OpportunityDiscoveryAnswer_opportunityId_questionId_idx" ON "OpportunityDiscoveryAnswer"("opportunityId", "questionId");
CREATE INDEX "OpportunityDiscoveryAnswer_productId_questionId_idx" ON "OpportunityDiscoveryAnswer"("productId", "questionId");
CREATE INDEX "OpportunityDiscoveryAnswer_categoryId_questionId_idx" ON "OpportunityDiscoveryAnswer"("categoryId", "questionId");
CREATE INDEX "OpportunityDiscoveryAnswer_answeredByUserId_answeredAt_idx" ON "OpportunityDiscoveryAnswer"("answeredByUserId", "answeredAt");

ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DiscoveryTemplate" ADD CONSTRAINT "DiscoveryTemplate_salesPipelineStageId_fkey" FOREIGN KEY ("salesPipelineStageId") REFERENCES "SalesPipelineStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DiscoveryTemplateQuestion" ADD CONSTRAINT "DiscoveryTemplateQuestion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DiscoveryTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscoveryTemplateQuestion" ADD CONSTRAINT "DiscoveryTemplateQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "DiscoveryQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductDiscoveryTemplate" ADD CONSTRAINT "ProductDiscoveryTemplate_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductDiscoveryTemplate" ADD CONSTRAINT "ProductDiscoveryTemplate_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DiscoveryTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductCategoryDiscoveryTemplate" ADD CONSTRAINT "ProductCategoryDiscoveryTemplate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductCategoryDiscoveryTemplate" ADD CONSTRAINT "ProductCategoryDiscoveryTemplate_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DiscoveryTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpportunityProduct" ADD CONSTRAINT "OpportunityProduct_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "SalesOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpportunityProduct" ADD CONSTRAINT "OpportunityProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OpportunityDiscoveryAnswer" ADD CONSTRAINT "OpportunityDiscoveryAnswer_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "SalesOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpportunityDiscoveryAnswer" ADD CONSTRAINT "OpportunityDiscoveryAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "DiscoveryQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OpportunityDiscoveryAnswer" ADD CONSTRAINT "OpportunityDiscoveryAnswer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OpportunityDiscoveryAnswer" ADD CONSTRAINT "OpportunityDiscoveryAnswer_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OpportunityDiscoveryAnswer" ADD CONSTRAINT "OpportunityDiscoveryAnswer_answeredByUserId_fkey" FOREIGN KEY ("answeredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
