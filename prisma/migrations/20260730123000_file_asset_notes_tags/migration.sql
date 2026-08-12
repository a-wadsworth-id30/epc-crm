-- Add optional CRM document notes and lightweight tags to file metadata.
ALTER TABLE "FileAsset"
ADD COLUMN "notes" TEXT,
ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "FileAsset_tags_idx"
ON "FileAsset" USING GIN ("tags");
