export type SaleNoteMentionUser = {
  email: string;
  firstName: string | null;
  id: string;
  lastName: string | null;
  name: string;
};

export type ResolvedSaleNoteMention = {
  token: string;
  user: SaleNoteMentionUser;
};

export type SaleNoteMentionResolution = {
  ambiguous: string[];
  resolved: ResolvedSaleNoteMention[];
  tokens: string[];
  unresolved: string[];
};

const mentionPattern = /(^|[^A-Za-z0-9_@.-])@([A-Za-z0-9._-]{1,64})/g;

export function normaliseMentionHandle(value: string) {
  return value
    .trim()
    .replace(/^@+/, "")
    .replace(/[._-]+$/g, "")
    .toLowerCase();
}

export function extractSaleNoteMentionTokens(body: string) {
  const tokens: string[] = [];
  const seen = new Set<string>();

  for (const match of body.matchAll(mentionPattern)) {
    const token = normaliseMentionHandle(match[2] ?? "");

    if (token.length < 2 || seen.has(token)) continue;

    seen.add(token);
    tokens.push(token);
  }

  return tokens;
}

function addCandidate(candidates: Set<string>, value: string | null | undefined) {
  const candidate = normaliseMentionHandle(value ?? "");

  if (candidate.length >= 2) {
    candidates.add(candidate);
  }
}

function textParts(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function addNamePairCandidates(
  candidates: Set<string>,
  first: string | undefined,
  last: string | undefined,
) {
  if (!first || !last) return;

  for (const separator of [".", "_", "-"]) {
    addCandidate(candidates, `${first}${separator}${last}`);
    addCandidate(candidates, `${first.charAt(0)}${separator}${last}`);
  }

  addCandidate(candidates, `${first}${last}`);
  addCandidate(candidates, `${first.charAt(0)}${last}`);
}

export function saleNoteMentionHandleCandidates(user: SaleNoteMentionUser) {
  const candidates = new Set<string>();
  const emailLocalPart = user.email.split("@")[0] ?? "";
  const emailLocalWithoutPlus = emailLocalPart.split("+")[0] ?? emailLocalPart;

  addCandidate(candidates, emailLocalPart);
  addCandidate(candidates, emailLocalWithoutPlus);
  addCandidate(candidates, emailLocalPart.replace(/[^a-z0-9]+/gi, ""));
  addCandidate(candidates, emailLocalWithoutPlus.replace(/[^a-z0-9]+/gi, ""));

  const explicitFirst = textParts(user.firstName)[0];
  const explicitLast = textParts(user.lastName).at(-1);
  addNamePairCandidates(candidates, explicitFirst, explicitLast);

  const displayNameParts = textParts(user.name);
  addNamePairCandidates(
    candidates,
    displayNameParts[0],
    displayNameParts.at(-1),
  );

  return Array.from(candidates);
}

export function resolveSaleNoteMentions(
  body: string,
  users: SaleNoteMentionUser[],
): SaleNoteMentionResolution {
  const tokens = extractSaleNoteMentionTokens(body);
  const usersByHandle = new Map<string, Map<string, SaleNoteMentionUser>>();

  for (const user of users) {
    for (const handle of saleNoteMentionHandleCandidates(user)) {
      const matches = usersByHandle.get(handle) ?? new Map();
      matches.set(user.id, user);
      usersByHandle.set(handle, matches);
    }
  }

  const ambiguous: string[] = [];
  const resolved: ResolvedSaleNoteMention[] = [];
  const unresolved: string[] = [];

  for (const token of tokens) {
    const matches = Array.from(usersByHandle.get(token)?.values() ?? []);

    if (matches.length === 1) {
      resolved.push({ token, user: matches[0] });
    } else if (matches.length > 1) {
      ambiguous.push(token);
    } else {
      unresolved.push(token);
    }
  }

  return { ambiguous, resolved, tokens, unresolved };
}
