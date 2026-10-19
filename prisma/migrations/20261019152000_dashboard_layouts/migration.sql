CREATE TABLE "DashboardRoleLayout" (
    "id" TEXT NOT NULL,
    "roleTemplate" TEXT NOT NULL,
    "layout" JSONB NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardRoleLayout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DashboardUserLayout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleTemplate" TEXT NOT NULL,
    "layout" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardUserLayout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DashboardRoleLayout_roleTemplate_key" ON "DashboardRoleLayout"("roleTemplate");
CREATE INDEX "DashboardRoleLayout_updatedAt_idx" ON "DashboardRoleLayout"("updatedAt");
CREATE UNIQUE INDEX "DashboardUserLayout_userId_key" ON "DashboardUserLayout"("userId");
CREATE INDEX "DashboardUserLayout_roleTemplate_idx" ON "DashboardUserLayout"("roleTemplate");
CREATE INDEX "DashboardUserLayout_updatedAt_idx" ON "DashboardUserLayout"("updatedAt");

ALTER TABLE "DashboardUserLayout"
ADD CONSTRAINT "DashboardUserLayout_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
