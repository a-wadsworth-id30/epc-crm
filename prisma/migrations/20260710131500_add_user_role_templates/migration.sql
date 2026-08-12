ALTER TABLE "User" ADD COLUMN "roleTemplate" TEXT;

CREATE INDEX "User_roleTemplate_idx" ON "User"("roleTemplate");
