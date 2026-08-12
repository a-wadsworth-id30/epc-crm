export type CrmAddressSuggestion = {
  id: string;
  label: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  county: string;
  postcode: string;
  country: string;
};

type GeoapifyJsonResult = {
  address_line1?: unknown;
  address_line2?: unknown;
  city?: unknown;
  country?: unknown;
  county?: unknown;
  formatted?: unknown;
  housenumber?: unknown;
  lat?: unknown;
  lon?: unknown;
  municipality?: unknown;
  name?: unknown;
  place_id?: unknown;
  postcode?: unknown;
  state?: unknown;
  state_district?: unknown;
  street?: unknown;
  suburb?: unknown;
  town?: unknown;
  village?: unknown;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberText(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const parsed = text(value);
    if (parsed) return parsed;
  }

  return "";
}

function fallbackAddressLine1(result: GeoapifyJsonResult) {
  const streetAddress = [text(result.housenumber), text(result.street)]
    .filter(Boolean)
    .join(" ");

  return streetAddress || firstText(result.name, result.street);
}

export function normalizeGeoapifyAddressResults(
  results: unknown,
  limit = 6,
): CrmAddressSuggestion[] {
  if (!Array.isArray(results)) return [];

  return results
    .flatMap((item): CrmAddressSuggestion[] => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];

      const result = item as GeoapifyJsonResult;
      const label = firstText(result.formatted, result.address_line1, result.name);
      if (!label) return [];

      return [
        {
          id:
            firstText(result.place_id) ||
            [
              label,
              numberText(result.lat),
              numberText(result.lon),
            ]
              .filter(Boolean)
              .join("|"),
          label,
          addressLine1: firstText(result.address_line1) || fallbackAddressLine1(result),
          addressLine2: firstText(result.address_line2),
          city: firstText(
            result.city,
            result.town,
            result.village,
            result.municipality,
            result.suburb,
          ),
          county: firstText(result.county, result.state_district, result.state),
          postcode: firstText(result.postcode),
          country: firstText(result.country),
        },
      ];
    })
    .slice(0, Math.max(1, Math.min(limit, 10)));
}
