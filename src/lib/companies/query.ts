import { Prisma } from "@prisma/client";

function contains(term: string) {
  return { contains: term, mode: "insensitive" as const };
}

function customFieldValueWhere(term: string, allowedFieldIds: string[]) {
  const valueFilters: Prisma.CompanyCustomFieldValueWhereInput[] = [
    { textValue: contains(term) },
    { jsonValue: { array_contains: [term] } },
  ];
  try {
    valueFilters.push({ numberValue: new Prisma.Decimal(term) });
  } catch {
    // Non-numeric search terms should not add a decimal filter.
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(term)) {
    valueFilters.push({ dateValue: new Date(`${term}T00:00:00.000Z`) });
  }
  const normalized = term.toLowerCase();
  if (["yes", "true"].includes(normalized)) {
    valueFilters.push({ booleanValue: true });
  } else if (["no", "false"].includes(normalized)) {
    valueFilters.push({ booleanValue: false });
  }

  return {
    field: {
      id: { in: allowedFieldIds },
      isActive: true,
      isSearchable: true,
    },
    OR: valueFilters,
  } satisfies Prisma.CompanyCustomFieldValueWhereInput;
}

export function companySearchWhere(
  query: string,
  allowedCustomFieldIds: string[],
): Prisma.CompanyWhereInput | undefined {
  const terms = query
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
  if (!terms.length) return undefined;

  return {
    AND: terms.map((term) => ({
      OR: [
        { name: contains(term) },
        { domain: contains(term) },
        { status: contains(term) },
        { owner: contains(term) },
        { ownerUser: { name: contains(term) } },
        { ownerUser: { email: contains(term) } },
        { addressLine1: contains(term) },
        { addressLine2: contains(term) },
        { city: contains(term) },
        { county: contains(term) },
        { postcode: contains(term) },
        { country: contains(term) },
        { companyType: { name: contains(term) } },
        { companyType: { pluralName: contains(term) } },
        ...(allowedCustomFieldIds.length
          ? [
              {
                customFieldValues: {
                  some: customFieldValueWhere(term, allowedCustomFieldIds),
                },
              },
            ]
          : []),
      ],
    })),
  };
}
