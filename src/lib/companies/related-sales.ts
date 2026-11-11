import type { Prisma } from "@prisma/client";

export function companyRelatedSalesWhere(
  companyId: string,
): Prisma.SalesOpportunityWhereInput {
  return {
    OR: [
      { companyId },
      {
        contact: {
          companyAffiliations: { some: { companyId } },
        },
      },
      {
        participants: {
          some: {
            contact: {
              companyAffiliations: { some: { companyId } },
            },
          },
        },
      },
    ],
  };
}
