import { Prisma } from "@prisma/client";

export type AttributionConfidenceFilter = "all" | "high" | "medium" | "low" | "unknown";

export const attributionConfidenceFilterValues = [
  "all",
  "high",
  "medium",
  "low",
  "unknown",
] as const;

type ConfidenceFactorWhere = {
  absent: Prisma.AttributionSnapshotWhereInput;
  present: Prisma.AttributionSnapshotWhereInput;
  weight: number;
};

const confidenceFactors: ConfidenceFactorWhere[] = [
  {
    weight: 25,
    present: { attributionClickId: { not: null } },
    absent: { attributionClickId: null },
  },
  {
    weight: 15,
    present: { OR: [{ attributionSource: { not: null } }, { referrer: { not: null } }] },
    absent: { AND: [{ attributionSource: null }, { referrer: null }] },
  },
  {
    weight: 10,
    present: { attributionCampaign: { not: null } },
    absent: { attributionCampaign: null },
  },
  {
    weight: 10,
    present: { OR: [{ landingPage: { not: null } }, { currentPage: { not: null } }] },
    absent: { AND: [{ landingPage: null }, { currentPage: null }] },
  },
  {
    weight: 15,
    present: jsonPresent("timeline"),
    absent: jsonMissing("timeline"),
  },
  {
    weight: 15,
    present: { records: { some: {} } },
    absent: { records: { none: {} } },
  },
  {
    weight: 10,
    present: {
      records: {
        some: {
          OR: [{ contactId: { not: null } }, { opportunityId: { not: null } }],
        },
      },
    },
    absent: {
      records: {
        none: {
          OR: [{ contactId: { not: null } }, { opportunityId: { not: null } }],
        },
      },
    },
  },
];

export function attributionConfidenceWhere(
  filter: AttributionConfidenceFilter,
): Prisma.AttributionSnapshotWhereInput | null {
  if (filter === "all") return null;

  const subsets = confidenceSubsets().filter(({ score }) => scoreMatchesFilter(score, filter));

  return {
    OR: subsets.map(({ mask }) => ({
      AND: confidenceFactors.map((factor, index) =>
        mask & (1 << index) ? factor.present : factor.absent,
      ),
    })),
  };
}

function confidenceSubsets() {
  const subsets: Array<{ mask: number; score: number }> = [];
  const total = 1 << confidenceFactors.length;

  for (let mask = 0; mask < total; mask += 1) {
    const score = confidenceFactors.reduce(
      (totalScore, factor, index) => totalScore + (mask & (1 << index) ? factor.weight : 0),
      0,
    );
    subsets.push({ mask, score });
  }

  return subsets;
}

function scoreMatchesFilter(score: number, filter: AttributionConfidenceFilter) {
  if (filter === "high") return score >= 75;
  if (filter === "medium") return score >= 45 && score < 75;
  if (filter === "low") return score >= 15 && score < 45;
  return score < 15;
}

function jsonPresent(field: "timeline"): Prisma.AttributionSnapshotWhereInput {
  return {
    NOT: [
      { [field]: { equals: Prisma.DbNull } },
      { [field]: { equals: Prisma.JsonNull } },
    ],
  };
}

function jsonMissing(field: "timeline"): Prisma.AttributionSnapshotWhereInput {
  return {
    OR: [
      { [field]: { equals: Prisma.DbNull } },
      { [field]: { equals: Prisma.JsonNull } },
    ],
  };
}
