const GEO_HEADER_PREFIX = "x-id30-geo-";

function clearGeoHeaders(headers) {
  for (const key of Array.from(headers.keys())) {
    if (key.toLowerCase().startsWith(GEO_HEADER_PREFIX)) {
      headers.delete(key);
    }
  }
}

function setGeoHeader(headers, key, value) {
  if (typeof value !== "string") return false;

  const trimmed = value.trim();
  if (!trimmed) return false;

  headers.set(`${GEO_HEADER_PREFIX}${key}`, trimmed);
  return true;
}

export default async function attributionGeo(request, context) {
  const headers = new Headers(request.headers);
  clearGeoHeaders(headers);

  const geo = context.geo ?? {};
  const country = geo.country ?? {};
  const subdivision = geo.subdivision ?? {};
  const hasGeo = [
    setGeoHeader(headers, "city", geo.city),
    setGeoHeader(headers, "region", subdivision.name ?? subdivision.code),
    setGeoHeader(headers, "country", country.name),
    setGeoHeader(headers, "country-code", country.code),
    setGeoHeader(headers, "timezone", geo.timezone),
  ].some(Boolean);

  if (typeof context.ip === "string" && context.ip.trim()) {
    headers.set(`${GEO_HEADER_PREFIX}ip`, context.ip.trim());
  }

  if (hasGeo) {
    headers.set(`${GEO_HEADER_PREFIX}source`, "netlify-geo");
  }

  return context.next(new Request(request, { headers }));
}
