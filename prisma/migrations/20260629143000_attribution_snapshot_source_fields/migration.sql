ALTER TABLE "AttributionSnapshot"
  ADD COLUMN "attributionSource" TEXT,
  ADD COLUMN "attributionMedium" TEXT,
  ADD COLUMN "attributionCampaign" TEXT,
  ADD COLUMN "attributionAdProvider" TEXT,
  ADD COLUMN "attributionClickId" TEXT,
  ADD COLUMN "attributionClickIdType" TEXT;

WITH source_fields AS (
  SELECT
    id,
    COALESCE(
      NULLIF("lastTouch" #>> '{params,utm_source}', ''),
      NULLIF("firstTouch" #>> '{params,utm_source}', ''),
      CASE WHEN COALESCE(NULLIF("referrer", ''), '') = '' THEN 'Direct' END
    ) AS source,
    COALESCE(
      NULLIF("lastTouch" #>> '{params,utm_medium}', ''),
      NULLIF("firstTouch" #>> '{params,utm_medium}', '')
    ) AS medium,
    COALESCE(
      NULLIF("lastTouch" #>> '{params,utm_campaign}', ''),
      NULLIF("firstTouch" #>> '{params,utm_campaign}', '')
    ) AS campaign,
    COALESCE(
      NULLIF("lastTouch" #>> '{params,gclid}', ''),
      NULLIF("firstTouch" #>> '{params,gclid}', ''),
      NULLIF("lastTouch" #>> '{params,gbraid}', ''),
      NULLIF("firstTouch" #>> '{params,gbraid}', ''),
      NULLIF("lastTouch" #>> '{params,wbraid}', ''),
      NULLIF("firstTouch" #>> '{params,wbraid}', ''),
      NULLIF("lastTouch" #>> '{params,msclkid}', ''),
      NULLIF("firstTouch" #>> '{params,msclkid}', ''),
      NULLIF("lastTouch" #>> '{params,fbclid}', ''),
      NULLIF("firstTouch" #>> '{params,fbclid}', '')
    ) AS click_id,
    CASE
      WHEN COALESCE(NULLIF("lastTouch" #>> '{params,gclid}', ''), NULLIF("firstTouch" #>> '{params,gclid}', '')) IS NOT NULL THEN 'GCLID'
      WHEN COALESCE(NULLIF("lastTouch" #>> '{params,gbraid}', ''), NULLIF("firstTouch" #>> '{params,gbraid}', '')) IS NOT NULL THEN 'GBRAID'
      WHEN COALESCE(NULLIF("lastTouch" #>> '{params,wbraid}', ''), NULLIF("firstTouch" #>> '{params,wbraid}', '')) IS NOT NULL THEN 'WBRAID'
      WHEN COALESCE(NULLIF("lastTouch" #>> '{params,msclkid}', ''), NULLIF("firstTouch" #>> '{params,msclkid}', '')) IS NOT NULL THEN 'MSCLKID'
      WHEN COALESCE(NULLIF("lastTouch" #>> '{params,fbclid}', ''), NULLIF("firstTouch" #>> '{params,fbclid}', '')) IS NOT NULL THEN 'FBCLID'
    END AS click_id_type
  FROM "AttributionSnapshot"
)
UPDATE "AttributionSnapshot" snapshot
SET
  "attributionSource" = source_fields.source,
  "attributionMedium" = source_fields.medium,
  "attributionCampaign" = source_fields.campaign,
  "attributionClickId" = source_fields.click_id,
  "attributionClickIdType" = source_fields.click_id_type,
  "attributionAdProvider" = CASE
    WHEN source_fields.click_id_type IN ('GCLID', 'GBRAID', 'WBRAID') THEN 'google-ads'
    WHEN source_fields.click_id_type = 'MSCLKID' THEN 'bing-ads'
    WHEN source_fields.click_id_type = 'FBCLID' THEN 'meta-ads'
    WHEN LOWER(COALESCE(source_fields.source, '')) LIKE '%google%'
      AND LOWER(COALESCE(source_fields.medium, '')) ~ '(cpc|ppc|paid|search)' THEN 'google-ads'
    WHEN (
        LOWER(COALESCE(source_fields.source, '')) LIKE '%bing%'
        OR LOWER(COALESCE(source_fields.source, '')) LIKE '%microsoft%'
      )
      AND LOWER(COALESCE(source_fields.medium, '')) ~ '(cpc|ppc|paid|search)' THEN 'bing-ads'
    WHEN (
        LOWER(COALESCE(source_fields.source, '')) LIKE '%facebook%'
        OR LOWER(COALESCE(source_fields.source, '')) LIKE '%instagram%'
        OR LOWER(COALESCE(source_fields.source, '')) LIKE '%meta%'
      )
      AND LOWER(COALESCE(source_fields.medium, '')) ~ '(paid|social|cpc|ppc)' THEN 'meta-ads'
  END
FROM source_fields
WHERE snapshot.id = source_fields.id;

CREATE INDEX "AttributionSnapshot_attributionSource_idx" ON "AttributionSnapshot"("attributionSource");
CREATE INDEX "AttributionSnapshot_attributionMedium_idx" ON "AttributionSnapshot"("attributionMedium");
CREATE INDEX "AttributionSnapshot_attributionAdProvider_idx" ON "AttributionSnapshot"("attributionAdProvider");
CREATE INDEX "AttributionSnapshot_attributionCampaign_idx" ON "AttributionSnapshot"("attributionCampaign");
