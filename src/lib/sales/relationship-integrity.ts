import type { SalesParticipantRole } from "@prisma/client";

export const saleRelationshipRepairKinds = [
  "SYNC_PRIMARY_PARTICIPANT",
  "USE_PRIMARY_PERSON_COMPANY",
  "LINK_PRIMARY_PERSON_TO_SALE_COMPANY",
] as const;

export type SaleRelationshipRepairKind =
  (typeof saleRelationshipRepairKinds)[number];

export type SaleRelationshipRepair = {
  kind: SaleRelationshipRepairKind;
  label: string;
};

export const saleRelationshipFindingCodes = [
  "MISSING_PRIMARY_PERSON",
  "PRIMARY_PARTICIPANT_MISMATCH",
  "MISSING_SALE_COMPANY",
  "PRIMARY_PERSON_COMPANY_MISMATCH",
  "PRIMARY_PERSON_COMPANY_MISSING",
  "MULTI_COMPANY_PARTICIPANTS",
] as const;

export type SaleRelationshipFindingCode =
  (typeof saleRelationshipFindingCodes)[number];

export type SaleRelationshipFinding = {
  code: SaleRelationshipFindingCode;
  detail: string;
  repairs: SaleRelationshipRepair[];
  severity: "warning" | "review";
  title: string;
};

type CompanyRef = { id: string; name: string };
type PersonRef = {
  companyIds: string[];
  id: string;
  name: string;
  primaryCompany: CompanyRef | null;
};
type ParticipantRef = {
  companyIds: string[];
  personId: string;
  role: SalesParticipantRole;
};

export function saleRelationshipFindings({
  participants,
  primaryPerson,
  saleCompany,
}: {
  participants: ParticipantRef[];
  primaryPerson: PersonRef | null;
  saleCompany: CompanyRef | null;
}): SaleRelationshipFinding[] {
  const findings: SaleRelationshipFinding[] = [];

  if (!primaryPerson) {
    findings.push({
      code: "MISSING_PRIMARY_PERSON",
      detail:
        "This Sale has no canonical primary Person. Add a Person and assign the Primary customer role before sending customer communications.",
      repairs: [],
      severity: "warning",
      title: "Primary Person is missing",
    });
    return findings;
  }

  const primaryParticipant = participants.find(
    (participant) => participant.role === "PRIMARY_CUSTOMER",
  );
  if (primaryParticipant?.personId !== primaryPerson.id) {
    findings.push({
      code: "PRIMARY_PARTICIPANT_MISMATCH",
      detail:
        "The Primary customer participant does not match the Sale's canonical reply and call contact.",
      repairs: [
        {
          kind: "SYNC_PRIMARY_PARTICIPANT",
          label: `Use ${primaryPerson.name} as Primary customer`,
        },
      ],
      severity: "warning",
      title: "Primary participant needs synchronising",
    });
  }

  if (!saleCompany && primaryPerson.primaryCompany) {
    findings.push({
      code: "MISSING_SALE_COMPANY",
      detail: `${primaryPerson.name} has ${primaryPerson.primaryCompany.name} as their primary Company, but the Sale has no Company link.`,
      repairs: [
        {
          kind: "USE_PRIMARY_PERSON_COMPANY",
          label: `Link Sale to ${primaryPerson.primaryCompany.name}`,
        },
      ],
      severity: "warning",
      title: "Sale Company is missing",
    });
  }

  if (saleCompany && !primaryPerson.companyIds.includes(saleCompany.id)) {
    if (!primaryPerson.companyIds.length) {
      findings.push({
        code: "PRIMARY_PERSON_COMPANY_MISSING",
        detail: `${primaryPerson.name} is not linked to a Company, while this Sale belongs to ${saleCompany.name}.`,
        repairs: [
          {
            kind: "LINK_PRIMARY_PERSON_TO_SALE_COMPANY",
            label: `Link ${primaryPerson.name} to ${saleCompany.name}`,
          },
        ],
        severity: "warning",
        title: "Primary Person has no Company",
      });
    } else {
      findings.push({
        code: "PRIMARY_PERSON_COMPANY_MISMATCH",
        detail: `${primaryPerson.name} is not affiliated with ${saleCompany.name}. Choose whether the Sale should use the Person's primary Company or retain the Sale Company and add it as an affiliation.`,
        repairs: [
          ...(primaryPerson.primaryCompany
            ? [
                {
                  kind: "USE_PRIMARY_PERSON_COMPANY" as const,
                  label: `Use ${primaryPerson.primaryCompany.name} for the Sale`,
                },
              ]
            : []),
          {
            kind: "LINK_PRIMARY_PERSON_TO_SALE_COMPANY",
            label: `Add ${saleCompany.name} to ${primaryPerson.name}`,
          },
        ],
        severity: "warning",
        title: "Person and Sale Companies differ",
      });
    }
  }

  if (saleCompany) {
    const externalParticipantCount = participants.filter(
      (participant) =>
        participant.personId !== primaryPerson.id &&
        participant.companyIds.length > 0 &&
        !participant.companyIds.includes(saleCompany.id),
    ).length;

    if (externalParticipantCount) {
      findings.push({
        code: "MULTI_COMPANY_PARTICIPANTS",
        detail: `${externalParticipantCount} additional participant${externalParticipantCount === 1 ? " is" : "s are"} affiliated with another Company. This can be correct for installers, contractors and partners; review their Sale roles before proceeding.`,
        repairs: [],
        severity: "review",
        title: "Participants span multiple Companies",
      });
    }
  }

  return findings;
}
