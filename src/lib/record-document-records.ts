import "server-only";

import type { Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import {
  companyIdAccessWhere,
  contactIdAccessWhere,
  salesOpportunityIdAccessWhere,
} from "@/lib/crm-resource-access";
import { prisma } from "@/lib/prisma";

export type RecordDocumentEntityType = "Contact" | "Company" | "SalesOpportunity";

type RecordAccessClient = Pick<
  Prisma.TransactionClient,
  "company" | "contact" | "salesOpportunity"
>;

export function isRecordDocumentEntityType(
  value: unknown,
): value is RecordDocumentEntityType {
  return (
    value === "Contact" ||
    value === "Company" ||
    value === "SalesOpportunity"
  );
}

export function recordDocumentPath(
  entityType: RecordDocumentEntityType,
  entityId: string,
) {
  if (entityType === "Contact") return `/contacts/${entityId}`;
  if (entityType === "Company") return `/clients/${entityId}`;
  return `/sales/${entityId}`;
}

export async function canAccessRecordDocumentEntity({
  client = prisma,
  entityId,
  entityType,
  user,
}: {
  client?: RecordAccessClient;
  entityId: string;
  entityType: RecordDocumentEntityType;
  user: CurrentUser;
}) {
  if (entityType === "Contact") {
    return client.contact.findFirst({
      where: contactIdAccessWhere(entityId, user),
      select: { id: true },
    });
  }

  if (entityType === "Company") {
    return client.company.findFirst({
      where: companyIdAccessWhere(entityId, user),
      select: { id: true },
    });
  }

  return client.salesOpportunity.findFirst({
    where: salesOpportunityIdAccessWhere(entityId, user),
    select: { id: true },
  });
}
