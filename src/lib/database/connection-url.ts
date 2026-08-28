export type DatabaseConnectionKind =
  | "missing"
  | "invalid"
  | "neon-pooler"
  | "neon-direct"
  | "postgres";

export type DatabaseConnectionProfile = {
  hasConnectionLimit: boolean;
  hasPoolTimeout: boolean;
  hasSslModeRequire: boolean;
  kind: DatabaseConnectionKind;
  present: boolean;
  usesNeon: boolean;
  usesPooler: boolean;
  valid: boolean;
};

export function inspectDatabaseConnectionUrl(
  value: string | null | undefined,
): DatabaseConnectionProfile {
  const trimmed = value?.trim() ?? "";

  if (!trimmed) {
    return databaseConnectionProfile("missing", false);
  }

  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();

    if (protocol !== "postgres:" && protocol !== "postgresql:") {
      return databaseConnectionProfile("invalid", true);
    }

    const hostname = parsed.hostname.toLowerCase();
    const usesNeon = hostname.includes("neon.tech");
    const usesPooler = hostname.includes("-pooler.");
    const kind: DatabaseConnectionKind = usesPooler
      ? "neon-pooler"
      : usesNeon
        ? "neon-direct"
        : "postgres";

    return {
      hasConnectionLimit: parsed.searchParams.has("connection_limit"),
      hasPoolTimeout: parsed.searchParams.has("pool_timeout"),
      hasSslModeRequire:
        parsed.searchParams.get("sslmode")?.toLowerCase() === "require",
      kind,
      present: true,
      usesNeon,
      usesPooler,
      valid: true,
    };
  } catch {
    return databaseConnectionProfile("invalid", true);
  }
}

export function databaseConnectionKindLabel(kind: DatabaseConnectionKind) {
  switch (kind) {
    case "missing":
      return "missing";
    case "invalid":
      return "invalid";
    case "neon-pooler":
      return "Neon pooled runtime";
    case "neon-direct":
      return "Neon direct connection";
    case "postgres":
      return "Postgres connection";
  }
}

export function databaseUrlWithPoolDefaults(
  url: string | undefined,
  {
    connectionLimit = process.env.PRISMA_CONNECTION_LIMIT ?? "1",
    poolTimeout = process.env.PRISMA_POOL_TIMEOUT ?? "10",
  }: {
    connectionLimit?: string;
    poolTimeout?: string;
  } = {},
) {
  if (!url) return undefined;

  const profile = inspectDatabaseConnectionUrl(url);

  if (!profile.usesPooler) return url;

  try {
    const parsed = new URL(url);

    if (!parsed.searchParams.has("connection_limit")) {
      parsed.searchParams.set("connection_limit", connectionLimit);
    }

    if (!parsed.searchParams.has("pool_timeout")) {
      parsed.searchParams.set("pool_timeout", poolTimeout);
    }

    return parsed.toString();
  } catch {
    return url;
  }
}

function databaseConnectionProfile(
  kind: DatabaseConnectionKind,
  present: boolean,
): DatabaseConnectionProfile {
  return {
    hasConnectionLimit: false,
    hasPoolTimeout: false,
    hasSslModeRequire: false,
    kind,
    present,
    usesNeon: false,
    usesPooler: false,
    valid: kind !== "invalid",
  };
}
