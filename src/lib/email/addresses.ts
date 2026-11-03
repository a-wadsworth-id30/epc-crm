const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function emailAddresses(value: string | null | undefined) {
  const matches = value?.match(emailPattern) ?? [];
  return [...new Set(matches.map((item) => item.toLowerCase()))];
}

export function firstEmailAddress(
  ...values: Array<string | null | undefined>
) {
  for (const value of values) {
    const address = emailAddresses(value)[0];
    if (address) return address;
  }
  return null;
}

export function emailHeaderName(value: string | null | undefined) {
  if (!value?.trim()) return null;

  const address = firstEmailAddress(value);
  const bracketIndex = value.indexOf("<");
  const candidate = (bracketIndex >= 0 ? value.slice(0, bracketIndex) : value)
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .trim();

  if (!candidate || candidate.toLowerCase() === address) return null;
  return candidate;
}
