import "server-only";

import type { Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type ResourceAccessUser = Pick<CurrentUser, "id" | "role">;

export type AuthorizableCallLog = {
  userId: string | null;
  contactId: string | null;
  opportunity: { ownerId: string | null } | null;
  queueEntries: Array<{ assignedUserId: string | null }>;
};

export function salesOpportunityAccessWhere(
  user: ResourceAccessUser,
): Prisma.SalesOpportunityWhereInput {
  if (user.role === "ADMIN") return {};

  return { OR: [{ ownerId: user.id }, { ownerId: null }] };
}

export function salesOpportunityWhereWithAccess(
  user: ResourceAccessUser,
  where?: Prisma.SalesOpportunityWhereInput,
): Prisma.SalesOpportunityWhereInput {
  const accessWhere = salesOpportunityAccessWhere(user);

  if (user.role === "ADMIN") return where ?? {};
  if (!where || Object.keys(where).length === 0) return accessWhere;

  return { AND: [accessWhere, where] };
}

export function salesOpportunityIdAccessWhere(
  opportunityId: string,
  user: ResourceAccessUser,
): Prisma.SalesOpportunityWhereInput {
  return salesOpportunityWhereWithAccess(user, { id: opportunityId });
}

export function contactAccessWhere(
  user: ResourceAccessUser,
): Prisma.ContactWhereInput {
  if (user.role === "ADMIN") return {};

  return {
    OR: [
      { createdByUserId: user.id },
      {
        opportunities: {
          some: salesOpportunityAccessWhere(user),
        },
      },
    ],
  };
}

export function contactWhereWithAccess(
  user: ResourceAccessUser,
  where?: Prisma.ContactWhereInput,
): Prisma.ContactWhereInput {
  const accessWhere = contactAccessWhere(user);

  if (user.role === "ADMIN") return where ?? {};
  if (!where || Object.keys(where).length === 0) return accessWhere;

  return { AND: [accessWhere, where] };
}

export function contactIdAccessWhere(
  contactId: string,
  user: ResourceAccessUser,
): Prisma.ContactWhereInput {
  return contactWhereWithAccess(user, { id: contactId });
}

export function companyAccessWhere(
  user: ResourceAccessUser,
): Prisma.CompanyWhereInput {
  if (user.role === "ADMIN") return {};

  return {
    OR: [
      { createdByUserId: user.id },
      {
        opportunities: {
          some: salesOpportunityAccessWhere(user),
        },
      },
    ],
  };
}

export function companyWhereWithAccess(
  user: ResourceAccessUser,
  where?: Prisma.CompanyWhereInput,
): Prisma.CompanyWhereInput {
  const accessWhere = companyAccessWhere(user);

  if (user.role === "ADMIN") return where ?? {};
  if (!where || Object.keys(where).length === 0) return accessWhere;

  return { AND: [accessWhere, where] };
}

export function companyIdAccessWhere(
  companyId: string,
  user: ResourceAccessUser,
): Prisma.CompanyWhereInput {
  return companyWhereWithAccess(user, { id: companyId });
}

export function emailMessageAccessWhere(
  user: ResourceAccessUser,
): Prisma.EmailMessageWhereInput {
  if (user.role === "ADMIN") return {};

  return {
    opportunity: salesOpportunityAccessWhere(user),
  };
}

export function emailMessageWhereWithAccess(
  user: ResourceAccessUser,
  where?: Prisma.EmailMessageWhereInput,
): Prisma.EmailMessageWhereInput {
  const accessWhere = emailMessageAccessWhere(user);

  if (user.role === "ADMIN") return where ?? {};
  if (!where || Object.keys(where).length === 0) return accessWhere;

  return { AND: [accessWhere, where] };
}

export async function userCanAccessOpportunityRecord(
  opportunityId: string,
  user: ResourceAccessUser,
) {
  if (user.role === "ADMIN") return true;

  const opportunity = await prisma.salesOpportunity.findFirst({
    where: salesOpportunityIdAccessWhere(opportunityId, user),
    select: { id: true },
  });

  return Boolean(opportunity);
}

export async function userCanAccessContactRecord(
  contactId: string,
  user: ResourceAccessUser,
) {
  if (user.role === "ADMIN") return true;

  const contact = await prisma.contact.findFirst({
    where: contactIdAccessWhere(contactId, user),
    select: { id: true },
  });

  return Boolean(contact);
}

export async function userCanAccessCompanyRecord(
  companyId: string,
  user: ResourceAccessUser,
) {
  const company = await prisma.company.findFirst({
    where: companyIdAccessWhere(companyId, user),
    select: { id: true },
  });

  return Boolean(company);
}

export async function userCanAccessCallLogRecord(
  callLog: AuthorizableCallLog,
  user: ResourceAccessUser,
) {
  if (user.role === "ADMIN") return true;
  if (callLog.userId === user.id) return true;
  if (callLog.opportunity && !callLog.opportunity.ownerId) return true;
  if (callLog.opportunity?.ownerId === user.id) return true;
  if (callLog.queueEntries.some((entry) => entry.assignedUserId === user.id)) {
    return true;
  }

  return callLog.contactId
    ? userCanAccessContactRecord(callLog.contactId, user)
    : false;
}
