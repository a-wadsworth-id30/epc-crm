import type { Prisma, TaskStatus } from "@prisma/client";

export function documentRenewalTaskData({
  creatorId,
  dueDate,
  entityId,
  entityType,
  fileAssetId,
  fileName,
}: {
  creatorId: string;
  dueDate: Date;
  entityId: string;
  entityType: "Contact" | "Company" | "SalesOpportunity";
  fileAssetId: string;
  fileName: string;
}) {
  return {
    assigneeId: creatorId,
    companyId: entityType === "Company" ? entityId : null,
    contactId: entityType === "Contact" ? entityId : null,
    creatorId,
    description: `Review and renew ${fileName} before it expires.`,
    dueDate,
    metadata: {
      fileAssetId,
      source: "document-renewal",
      entityId,
      entityType,
    } satisfies Prisma.InputJsonValue,
    status: "TODO" as TaskStatus,
    title: `Renew document: ${fileName}`,
  };
}
