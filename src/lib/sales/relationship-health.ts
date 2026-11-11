import type { SalesParticipantRole } from "@prisma/client";
import {
  saleRelationshipFindings,
  type SaleRelationshipFinding,
  type SaleRelationshipFindingCode,
} from "@/lib/sales/relationship-integrity";

export type RelationshipHealthSale = {
  company: { id: string; name: string } | null;
  id: string;
  participants: Array<{
    contact: {
      companyAffiliations: Array<{ companyId: string }>;
      companyId: string | null;
      id: string;
    };
    role: SalesParticipantRole;
  }>;
  primaryPerson: {
    company: { id: string; name: string } | null;
    companyAffiliations: Array<{ companyId: string }>;
    companyId: string | null;
    firstName: string;
    id: string;
    lastName: string;
  } | null;
  title: string;
};

export type RelationshipHealthRow<T extends RelationshipHealthSale> = T & {
  findings: SaleRelationshipFinding[];
};

function personName(
  person: NonNullable<RelationshipHealthSale["primaryPerson"]>,
) {
  return `${person.firstName} ${person.lastName}`.trim() || "Unnamed Person";
}

function companyIdsFor(person: {
  companyAffiliations: Array<{ companyId: string }>;
  companyId: string | null;
}) {
  return Array.from(
    new Set([
      ...(person.companyId ? [person.companyId] : []),
      ...person.companyAffiliations.map((affiliation) => affiliation.companyId),
    ]),
  );
}

export function relationshipHealthRows<T extends RelationshipHealthSale>(
  sales: T[],
): Array<RelationshipHealthRow<T>> {
  return sales.flatMap((sale) => {
    const findings = saleRelationshipFindings({
      participants: sale.participants.map((participant) => ({
        companyIds: companyIdsFor(participant.contact),
        personId: participant.contact.id,
        role: participant.role,
      })),
      primaryPerson: sale.primaryPerson
        ? {
            companyIds: companyIdsFor(sale.primaryPerson),
            id: sale.primaryPerson.id,
            name: personName(sale.primaryPerson),
            primaryCompany: sale.primaryPerson.company,
          }
        : null,
      saleCompany: sale.company,
    });

    return findings.length ? [{ ...sale, findings }] : [];
  });
}

export function filterRelationshipHealthRows<T extends RelationshipHealthSale>(
  rows: Array<RelationshipHealthRow<T>>,
  filters: {
    code?: SaleRelationshipFindingCode;
    severity?: SaleRelationshipFinding["severity"];
  },
) {
  return rows.filter((row) =>
    row.findings.some(
      (finding) =>
        (!filters.code || finding.code === filters.code) &&
        (!filters.severity || finding.severity === filters.severity),
    ),
  );
}

export function relationshipHealthSummary<T extends RelationshipHealthSale>(
  rows: Array<RelationshipHealthRow<T>>,
) {
  return rows.reduce(
    (summary, row) => {
      summary.sales += 1;
      for (const finding of row.findings) {
        summary.findings += 1;
        summary[finding.severity] += 1;
        summary.byCode[finding.code] = (summary.byCode[finding.code] ?? 0) + 1;
      }
      return summary;
    },
    {
      byCode: {} as Partial<Record<SaleRelationshipFindingCode, number>>,
      findings: 0,
      review: 0,
      sales: 0,
      warning: 0,
    },
  );
}
