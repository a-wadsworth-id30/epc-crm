export function normalizeCallableNumber(value: string) {
  const trimmed = value.trim().replace(/[^\d+]/g, "");

  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("00")) {
    return `+${trimmed.slice(2)}`;
  }

  if (trimmed.startsWith("0")) {
    return `+44${trimmed.slice(1)}`;
  }

  return trimmed;
}

export function normalizedContactPhone(value: string | null | undefined) {
  const normalized = value ? normalizeCallableNumber(value) : "";
  return normalized || null;
}
