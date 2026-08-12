CREATE INDEX "PasswordResetToken_expiresAt_idx"
  ON "PasswordResetToken"("expiresAt");
CREATE INDEX "PasswordResetToken_createdAt_idx"
  ON "PasswordResetToken"("createdAt");

CREATE INDEX "ReportRun_createdAt_idx"
  ON "ReportRun"("createdAt");

CREATE INDEX "AttributionInstallCheck_createdAt_idx"
  ON "AttributionInstallCheck"("createdAt");

CREATE INDEX "MarketingIntegrationSyncLog_createdAt_idx"
  ON "MarketingIntegrationSyncLog"("createdAt");

CREATE INDEX "MarketingConversionUpload_status_updatedAt_idx"
  ON "MarketingConversionUpload"("status", "updatedAt");

CREATE INDEX "AuditLog_createdAt_idx"
  ON "AuditLog"("createdAt");
