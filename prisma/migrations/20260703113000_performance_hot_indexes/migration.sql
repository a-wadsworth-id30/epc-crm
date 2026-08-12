-- Add indexes for hot CRM list, dashboard and activity query paths.
CREATE INDEX "Company_updatedAt_idx" ON "Company"("updatedAt");
CREATE INDEX "Company_name_idx" ON "Company"("name");

CREATE INDEX "Contact_updatedAt_idx" ON "Contact"("updatedAt");
CREATE INDEX "Contact_createdAt_idx" ON "Contact"("createdAt");
CREATE INDEX "Contact_lastName_firstName_idx" ON "Contact"("lastName", "firstName");
CREATE INDEX "Contact_companyId_updatedAt_idx" ON "Contact"("companyId", "updatedAt");

CREATE INDEX "SalesOpportunity_createdAt_idx" ON "SalesOpportunity"("createdAt");
CREATE INDEX "SalesOpportunity_updatedAt_idx" ON "SalesOpportunity"("updatedAt");
CREATE INDEX "SalesOpportunity_stage_updatedAt_idx" ON "SalesOpportunity"("stage", "updatedAt");
CREATE INDEX "SalesOpportunity_source_createdAt_idx" ON "SalesOpportunity"("source", "createdAt");
CREATE INDEX "SalesOpportunity_ownerId_createdAt_idx" ON "SalesOpportunity"("ownerId", "createdAt");
CREATE INDEX "SalesOpportunity_companyId_createdAt_idx" ON "SalesOpportunity"("companyId", "createdAt");
CREATE INDEX "SalesOpportunity_contactId_createdAt_idx" ON "SalesOpportunity"("contactId", "createdAt");

CREATE INDEX "SalesCommunication_occurredAt_idx" ON "SalesCommunication"("occurredAt");
CREATE INDEX "SalesCommunication_channel_occurredAt_idx" ON "SalesCommunication"("channel", "occurredAt");

CREATE INDEX "CallLog_startedAt_idx" ON "CallLog"("startedAt");
CREATE INDEX "CallLog_status_startedAt_idx" ON "CallLog"("status", "startedAt");

CREATE INDEX "FileAsset_createdAt_idx" ON "FileAsset"("createdAt");
CREATE INDEX "FileAsset_updatedAt_idx" ON "FileAsset"("updatedAt");
CREATE INDEX "FileAsset_visibility_createdAt_idx" ON "FileAsset"("visibility", "createdAt");

CREATE INDEX "Note_createdAt_idx" ON "Note"("createdAt");
CREATE INDEX "Note_userId_createdAt_idx" ON "Note"("userId", "createdAt");
CREATE INDEX "Note_companyId_createdAt_idx" ON "Note"("companyId", "createdAt");
CREATE INDEX "Note_contactId_createdAt_idx" ON "Note"("contactId", "createdAt");

CREATE INDEX "Task_updatedAt_idx" ON "Task"("updatedAt");
CREATE INDEX "Task_createdAt_idx" ON "Task"("createdAt");
CREATE INDEX "Task_status_updatedAt_idx" ON "Task"("status", "updatedAt");
CREATE INDEX "Task_status_dueDate_updatedAt_idx" ON "Task"("status", "dueDate", "updatedAt");
CREATE INDEX "Task_assigneeId_updatedAt_idx" ON "Task"("assigneeId", "updatedAt");
CREATE INDEX "Task_companyId_updatedAt_idx" ON "Task"("companyId", "updatedAt");
CREATE INDEX "Task_contactId_updatedAt_idx" ON "Task"("contactId", "updatedAt");
