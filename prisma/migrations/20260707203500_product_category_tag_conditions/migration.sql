-- AlterTable
ALTER TABLE "ProductCategory" ADD COLUMN "ruleConditions" JSONB;

-- Backfill existing simple any/all tag rules into ordered tag conditions.
UPDATE "ProductCategory"
SET "ruleConditions" = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'tag', tag,
      'operator', 'HAS_TAG',
      'join',
        CASE
          WHEN ordinality = 1 OR "ProductCategory"."ruleMatch" = 'ALL'
            THEN 'AND'
          ELSE 'OR'
        END
    )
    ORDER BY ordinality
  )
  FROM unnest("ProductCategory"."ruleTags") WITH ORDINALITY AS tags(tag, ordinality)
)
WHERE "collectionMode" = 'AUTOMATED'
  AND cardinality("ruleTags") > 0
  AND "ruleConditions" IS NULL;
