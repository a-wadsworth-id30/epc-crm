ALTER TABLE "CallLog"
  ADD COLUMN "transcriptSid" TEXT,
  ADD COLUMN "transcriptStatus" TEXT,
  ADD COLUMN "aiAnalysisStatus" TEXT;

UPDATE "CallLog"
SET
  "transcriptSid" = NULLIF("metadata" #>> '{transcriptSid}', ''),
  "transcriptStatus" = NULLIF("metadata" #>> '{transcriptStatus}', ''),
  "aiAnalysisStatus" = NULLIF("metadata" #>> '{aiAnalysisStatus}', '')
WHERE "metadata" IS NOT NULL;

CREATE INDEX "CallLog_transcriptSid_idx" ON "CallLog"("transcriptSid");
CREATE INDEX "CallLog_transcriptStatus_startedAt_id_idx" ON "CallLog"("transcriptStatus", "startedAt", "id");
CREATE INDEX "CallLog_aiAnalysisStatus_startedAt_id_idx" ON "CallLog"("aiAnalysisStatus", "startedAt", "id");
