export function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parsePositiveInteger(
  value: string | string[] | undefined,
  fallback: number,
) {
  const parsed = Number(singleParam(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parsePageSize({
  fallback,
  options,
  value,
}: {
  fallback: number;
  options: readonly number[];
  value: string | string[] | undefined;
}) {
  const parsed = parsePositiveInteger(value, fallback);
  return options.includes(parsed) ? parsed : fallback;
}
