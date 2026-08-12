UPDATE "FileAsset"
SET "visibility" = 'PUBLIC'
WHERE "entityType" = 'CrmSettings'
  AND "entityId" = 'default'
  AND "id" IN (
    SELECT "companyProfile"->>'logoFileAssetId'
    FROM "CrmSettings"
    WHERE "companyProfile"->>'logoFileAssetId' IS NOT NULL
  );
