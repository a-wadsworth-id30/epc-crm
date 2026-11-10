import { Prisma } from "@prisma/client";
import { contactCategoryOptions } from "@/lib/contacts/categories";

function contains(term: string) {
  return { contains: term, mode: "insensitive" as const };
}

function customFieldValueWhere(term: string, allowedFieldIds?: string[]) {
  const valueFilters: Prisma.ContactCustomFieldValueWhereInput[] = [
    { textValue: contains(term) },
    { jsonValue: { array_contains: [term] } },
  ];

  try {
    valueFilters.push({ numberValue: new Prisma.Decimal(term) });
  } catch {
    // Non-numeric search terms should not add a decimal filter.
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(term)) {
    const date = new Date(`${term}T00:00:00.000Z`);
    if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === term) {
      valueFilters.push({ dateValue: date });
    }
  }

  const normalized = term.toLowerCase();
  if (["yes", "true"].includes(normalized)) {
    valueFilters.push({ booleanValue: true });
  } else if (["no", "false"].includes(normalized)) {
    valueFilters.push({ booleanValue: false });
  }

  return {
    field: {
      isActive: true,
      isSearchable: true,
      ...(allowedFieldIds ? { id: { in: allowedFieldIds } } : {}),
    },
    OR: valueFilters,
  } satisfies Prisma.ContactCustomFieldValueWhereInput;
}

export function contactSearchWhere(
  query: string,
  allowedCustomFieldIds?: string[],
): Prisma.ContactWhereInput | undefined {
  const terms = query
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);

  if (!terms.length) return undefined;

  return {
    AND: terms.map((term) => {
      const normalizedTerm = term.toLowerCase();
      const matchingCategories = contactCategoryOptions
        .filter(
          (option) =>
            option.value.toLowerCase().includes(normalizedTerm) ||
            option.label.toLowerCase().includes(normalizedTerm) ||
            option.pluralLabel.toLowerCase().includes(normalizedTerm),
        )
        .map((option) => option.value);

      return {
        OR: [
          { firstName: contains(term) },
          { lastName: contains(term) },
          { email: contains(term) },
          { phone: contains(term) },
          { additionalEmails: { some: { email: contains(term) } } },
          { additionalPhones: { some: { phone: contains(term) } } },
          { additionalPhones: { some: { phoneNormalized: contains(term) } } },
          { leadSource: contains(term) },
          { role: contains(term) },
          { addressLine1: contains(term) },
          { addressLine2: contains(term) },
          { city: contains(term) },
          { county: contains(term) },
          { postcode: contains(term) },
          { country: contains(term) },
          { companyName: contains(term) },
          { company: { name: contains(term) } },
          { company: { addressLine1: contains(term) } },
          { company: { addressLine2: contains(term) } },
          { company: { city: contains(term) } },
          { company: { county: contains(term) } },
          { company: { postcode: contains(term) } },
          { company: { country: contains(term) } },
          { contactType: { name: contains(term) } },
          { contactType: { pluralName: contains(term) } },
          { tagAssignments: { some: { tag: { name: contains(term) } } } },
          ...(allowedCustomFieldIds?.length === 0
            ? []
            : [{ customFieldValues: { some: customFieldValueWhere(term, allowedCustomFieldIds) } }]),
          ...(matchingCategories.length
            ? [{ category: { in: matchingCategories } }]
            : []),
        ],
      };
    }),
  };
}
