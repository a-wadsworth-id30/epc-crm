export type CompanyNameMatch = {
  id: string;
  name: string;
};

export function normalizeCompanyMatchName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function uniqueCompanyMatchesByName<T extends CompanyNameMatch>(
  companies: T[],
) {
  const grouped = new Map<string, T[]>();
  for (const company of companies) {
    const key = normalizeCompanyMatchName(company.name);
    grouped.set(key, [...(grouped.get(key) ?? []), company]);
  }
  return new Map(
    Array.from(grouped.entries()).flatMap(([key, matches]) =>
      matches.length === 1 ? [[key, matches[0]!] as const] : [],
    ),
  );
}

export function uniqueCompanyMatchByName<T extends CompanyNameMatch>(
  companies: T[],
  requestedName: string,
) {
  return uniqueCompanyMatchesByName(companies).get(
    normalizeCompanyMatchName(requestedName),
  ) ?? null;
}
