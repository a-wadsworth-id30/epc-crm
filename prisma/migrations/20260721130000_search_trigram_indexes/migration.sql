CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Contact_firstName_trgm_idx"
  ON "Contact" USING GIN ("firstName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Contact_lastName_trgm_idx"
  ON "Contact" USING GIN ("lastName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Contact_email_trgm_idx"
  ON "Contact" USING GIN ("email" gin_trgm_ops)
  WHERE "email" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Contact_phone_trgm_idx"
  ON "Contact" USING GIN ("phone" gin_trgm_ops)
  WHERE "phone" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Contact_phoneNormalized_trgm_idx"
  ON "Contact" USING GIN ("phoneNormalized" gin_trgm_ops)
  WHERE "phoneNormalized" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Contact_companyName_trgm_idx"
  ON "Contact" USING GIN ("companyName" gin_trgm_ops)
  WHERE "companyName" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Contact_role_trgm_idx"
  ON "Contact" USING GIN ("role" gin_trgm_ops)
  WHERE "role" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Contact_addressLine1_trgm_idx"
  ON "Contact" USING GIN ("addressLine1" gin_trgm_ops)
  WHERE "addressLine1" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Contact_addressLine2_trgm_idx"
  ON "Contact" USING GIN ("addressLine2" gin_trgm_ops)
  WHERE "addressLine2" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Contact_city_trgm_idx"
  ON "Contact" USING GIN ("city" gin_trgm_ops)
  WHERE "city" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Contact_county_trgm_idx"
  ON "Contact" USING GIN ("county" gin_trgm_ops)
  WHERE "county" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Contact_postcode_trgm_idx"
  ON "Contact" USING GIN ("postcode" gin_trgm_ops)
  WHERE "postcode" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Contact_country_trgm_idx"
  ON "Contact" USING GIN ("country" gin_trgm_ops)
  WHERE "country" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "Company_name_trgm_idx"
  ON "Company" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Company_domain_trgm_idx"
  ON "Company" USING GIN ("domain" gin_trgm_ops)
  WHERE "domain" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Company_status_trgm_idx"
  ON "Company" USING GIN ("status" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Company_owner_trgm_idx"
  ON "Company" USING GIN ("owner" gin_trgm_ops)
  WHERE "owner" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "SalesOpportunity_title_trgm_idx"
  ON "SalesOpportunity" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "SalesOpportunity_source_trgm_idx"
  ON "SalesOpportunity" USING GIN ("source" gin_trgm_ops)
  WHERE "source" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "SalesOpportunity_nextStep_trgm_idx"
  ON "SalesOpportunity" USING GIN ("nextStep" gin_trgm_ops)
  WHERE "nextStep" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "SalesPipelineStage_name_trgm_idx"
  ON "SalesPipelineStage" USING GIN ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "ContactTag_name_trgm_idx"
  ON "ContactTag" USING GIN ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "User_name_trgm_idx"
  ON "User" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "User_firstName_trgm_idx"
  ON "User" USING GIN ("firstName" gin_trgm_ops)
  WHERE "firstName" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "User_lastName_trgm_idx"
  ON "User" USING GIN ("lastName" gin_trgm_ops)
  WHERE "lastName" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "User_email_trgm_idx"
  ON "User" USING GIN ("email" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "User_roleTemplate_trgm_idx"
  ON "User" USING GIN ("roleTemplate" gin_trgm_ops)
  WHERE "roleTemplate" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "User_voiceExtension_trgm_idx"
  ON "User" USING GIN ("voiceExtension" gin_trgm_ops)
  WHERE "voiceExtension" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "User_sipAddress_trgm_idx"
  ON "User" USING GIN ("sipAddress" gin_trgm_ops)
  WHERE "sipAddress" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "User_landline_trgm_idx"
  ON "User" USING GIN ("landline" gin_trgm_ops)
  WHERE "landline" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "User_mobile_trgm_idx"
  ON "User" USING GIN ("mobile" gin_trgm_ops)
  WHERE "mobile" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "EmailMessage_fromAddress_trgm_idx"
  ON "EmailMessage" USING GIN ("fromAddress" gin_trgm_ops)
  WHERE "fromAddress" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "EmailMessage_fromName_trgm_idx"
  ON "EmailMessage" USING GIN ("fromName" gin_trgm_ops)
  WHERE "fromName" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "EmailMessage_toAddress_trgm_idx"
  ON "EmailMessage" USING GIN ("toAddress" gin_trgm_ops)
  WHERE "toAddress" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "EmailMessage_subject_trgm_idx"
  ON "EmailMessage" USING GIN ("subject" gin_trgm_ops)
  WHERE "subject" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "EmailMessage_summary_trgm_idx"
  ON "EmailMessage" USING GIN ("summary" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "FileAsset_originalName_trgm_idx"
  ON "FileAsset" USING GIN ("originalName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "FileAsset_mimeType_trgm_idx"
  ON "FileAsset" USING GIN ("mimeType" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "FileAsset_key_trgm_idx"
  ON "FileAsset" USING GIN ("key" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "FileAsset_bucket_trgm_idx"
  ON "FileAsset" USING GIN ("bucket" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "FileAsset_entityType_trgm_idx"
  ON "FileAsset" USING GIN ("entityType" gin_trgm_ops)
  WHERE "entityType" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "FileAsset_entityId_trgm_idx"
  ON "FileAsset" USING GIN ("entityId" gin_trgm_ops)
  WHERE "entityId" IS NOT NULL;
