ALTER TABLE "Contact" ADD COLUMN "phoneNormalized" TEXT;

UPDATE "Contact"
SET "phoneNormalized" = CASE
  WHEN regexp_replace("phone", '[^0-9+]', '', 'g') = '' THEN NULL
  WHEN regexp_replace("phone", '[^0-9+]', '', 'g') LIKE '00%' THEN '+' || substring(regexp_replace("phone", '[^0-9+]', '', 'g') FROM 3)
  WHEN regexp_replace("phone", '[^0-9+]', '', 'g') LIKE '0%' THEN '+44' || substring(regexp_replace("phone", '[^0-9+]', '', 'g') FROM 2)
  ELSE regexp_replace("phone", '[^0-9+]', '', 'g')
END
WHERE "phone" IS NOT NULL AND btrim("phone") <> '';

CREATE INDEX "Contact_phoneNormalized_idx" ON "Contact"("phoneNormalized");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");
CREATE INDEX "Session_userId_lastSeenAt_createdAt_idx" ON "Session"("userId", "lastSeenAt", "createdAt");
