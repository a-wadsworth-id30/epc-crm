export const companyContactResponsibilityValues = [
  "PRIMARY",
  "COMMERCIAL",
  "TECHNICAL",
  "ACCOUNTS",
  "COMPLIANCE",
] as const;

export type CompanyContactResponsibilityValue =
  (typeof companyContactResponsibilityValues)[number];

export const companyContactResponsibilityOptions: ReadonlyArray<{
  description: string;
  label: string;
  value: CompanyContactResponsibilityValue;
}> = [
  {
    description: "Main contact for the organisation.",
    label: "Primary",
    value: "PRIMARY",
  },
  {
    description: "Commercial discussions, contracts and pricing.",
    label: "Commercial",
    value: "COMMERCIAL",
  },
  {
    description: "Technical questions and delivery details.",
    label: "Technical",
    value: "TECHNICAL",
  },
  {
    description: "Invoices, payments and account queries.",
    label: "Accounts",
    value: "ACCOUNTS",
  },
  {
    description: "Accreditations, insurance and compliance.",
    label: "Compliance",
    value: "COMPLIANCE",
  },
];

const responsibilitySet = new Set<string>(
  companyContactResponsibilityValues,
);

export function normalizeCompanyContactResponsibilities(
  values: Iterable<string>,
): CompanyContactResponsibilityValue[] {
  const selected = new Set(values);

  return companyContactResponsibilityValues.filter(
    (value) => responsibilitySet.has(value) && selected.has(value),
  );
}

export function companyContactResponsibilityLabel(
  value: CompanyContactResponsibilityValue,
) {
  return (
    companyContactResponsibilityOptions.find((option) => option.value === value)
      ?.label ?? value
  );
}

export function mergedCompanyContactResponsibilities({
  duplicateCompanyId,
  duplicateResponsibilities,
  primaryCompanyId,
  primaryResponsibilities,
  resultingCompanyId,
}: {
  duplicateCompanyId: string | null;
  duplicateResponsibilities: CompanyContactResponsibilityValue[];
  primaryCompanyId: string | null;
  primaryResponsibilities: CompanyContactResponsibilityValue[];
  resultingCompanyId: string | null;
}) {
  if (!resultingCompanyId) return [];

  return normalizeCompanyContactResponsibilities([
    ...(primaryCompanyId === resultingCompanyId ? primaryResponsibilities : []),
    ...(duplicateCompanyId === resultingCompanyId
      ? duplicateResponsibilities
      : []),
  ]);
}
