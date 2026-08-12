export type SearchField = number | string | null | undefined;

export type SearchMatchResult = {
  matched: boolean;
  score: number;
};

const diacriticPattern = /[\u0300-\u036f]/g;
const nonSearchCharacterPattern = /[^a-z0-9@.+]+/g;
const whitespacePattern = /\s+/g;
const nonDigitPattern = /\D/g;
const nonAlphanumericPattern = /[^a-z0-9]+/g;

export function normalizeSearchText(value: SearchField): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(diacriticPattern, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(nonSearchCharacterPattern, " ")
    .replace(whitespacePattern, " ")
    .trim();
}

export function normalizeSearchDigits(value: SearchField): string {
  return String(value ?? "").replace(nonDigitPattern, "");
}

export function searchTokens(query: SearchField): string[] {
  return normalizeSearchText(query).split(" ").filter(Boolean);
}

export function compactSearchText(value: SearchField): string {
  return normalizeSearchText(value).replace(whitespacePattern, "");
}

export function foldedSearchText(value: SearchField): string {
  return normalizeSearchText(value).replace(nonAlphanumericPattern, "");
}

function editDistanceAtMost(left: string, right: string, maxDistance: number) {
  if (Math.abs(left.length - right.length) > maxDistance) return false;
  if (left === right) return true;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowMinimum = current[0];

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const value = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + cost,
      );

      current[rightIndex] = value;
      rowMinimum = Math.min(rowMinimum, value);
    }

    if (rowMinimum > maxDistance) return false;
    previous = current;
  }

  return previous[right.length] <= maxDistance;
}

function adjacentTranspositionMatch(left: string, right: string) {
  if (left.length !== right.length) return false;

  const differences: number[] = [];

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) differences.push(index);
    if (differences.length > 2) return false;
  }

  return (
    differences.length === 2 &&
    differences[1] === differences[0] + 1 &&
    left[differences[0]] === right[differences[1]] &&
    left[differences[1]] === right[differences[0]]
  );
}

function fuzzyTokenMatch(queryToken: string, fieldToken: string) {
  if (queryToken.length < 4 || fieldToken.length < 4) return false;
  if (fieldToken.startsWith(queryToken) || queryToken.startsWith(fieldToken)) {
    return true;
  }

  if (adjacentTranspositionMatch(queryToken, fieldToken)) return true;

  const maxDistance = queryToken.length >= 7 && fieldToken.length >= 7 ? 2 : 1;
  return editDistanceAtMost(queryToken, fieldToken, maxDistance);
}

export function searchMatch(
  query: SearchField,
  fields: SearchField[],
): SearchMatchResult {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return { matched: true, score: 0 };
  }

  const tokens = searchTokens(normalizedQuery);
  const normalizedFields = fields
    .map((field) => normalizeSearchText(field))
    .filter(Boolean);
  const joinedFields = normalizedFields.join(" ");
  const compactQuery = compactSearchText(normalizedQuery);
  const compactFields = compactSearchText(joinedFields);
  const foldedQuery = foldedSearchText(normalizedQuery);
  const foldedFields = foldedSearchText(joinedFields);
  const fieldTokens = searchTokens(joinedFields);
  const queryDigits = normalizeSearchDigits(query);
  const fieldDigits = fields.map(normalizeSearchDigits).filter(Boolean);

  let score = 0;

  for (const field of normalizedFields) {
    if (field === normalizedQuery) score = Math.max(score, 100);
    if (field.startsWith(normalizedQuery)) score = Math.max(score, 85);
    if (field.includes(normalizedQuery)) score = Math.max(score, 70);

    const foldedField = foldedSearchText(field);
    if (foldedField && foldedField === foldedQuery) {
      score = Math.max(score, 95);
    }
    if (foldedField && foldedField.startsWith(foldedQuery)) {
      score = Math.max(score, 82);
    }
  }

  if (joinedFields.includes(normalizedQuery)) {
    score = Math.max(score, 65);
  }

  if (tokens.length && tokens.every((token) => joinedFields.includes(token))) {
    score = Math.max(score, 55 + tokens.length);
  }

  if (compactQuery && compactFields.includes(compactQuery)) {
    score = Math.max(score, 50);
  }

  if (foldedQuery && foldedFields.includes(foldedQuery)) {
    score = Math.max(score, 68);
  }

  if (
    tokens.length &&
    tokens.every((token) =>
      fieldTokens.some((fieldToken) => fuzzyTokenMatch(token, fieldToken)),
    )
  ) {
    score = Math.max(score, 48 + tokens.length);
  }

  if (
    queryDigits.length >= 3 &&
    fieldDigits.some((digits) => digits.includes(queryDigits))
  ) {
    const exactDigits = fieldDigits.some((digits) => digits === queryDigits);
    score = Math.max(
      score,
      exactDigits ? 105 : queryDigits.length >= 7 ? 80 : 45,
    );
  }

  return { matched: score > 0, score };
}

export function matchesSearchQuery(
  query: SearchField,
  fields: SearchField[],
): boolean {
  return searchMatch(query, fields).matched;
}
