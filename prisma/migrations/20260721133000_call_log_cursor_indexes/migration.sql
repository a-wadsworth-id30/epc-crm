CREATE INDEX "CallLog_startedAt_id_idx" ON "CallLog"("startedAt", "id");
CREATE INDEX "CallLog_status_startedAt_id_idx" ON "CallLog"("status", "startedAt", "id");
