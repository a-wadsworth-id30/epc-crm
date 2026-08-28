import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { RepositoryProfile } from "./types";

export function inspectRepository({
  cwd,
  env = process.env,
}: {
  cwd: string;
  env?: NodeJS.ProcessEnv;
}): RepositoryProfile {
  const packageJson = readJsonFile<PackageJson>(path.join(cwd, "package.json"));
  const netlifyToml = readTextFile(path.join(cwd, "netlify.toml"));
  const testsPath = path.join(cwd, "tests");

  return {
    app: {
      name: packageJson?.name ?? null,
      nextVersion: packageJson?.dependencies?.next ?? null,
      prismaVersion:
        packageJson?.dependencies?.["@prisma/client"] ??
        packageJson?.devDependencies?.prisma ??
        null,
      scripts: Object.keys(packageJson?.scripts ?? {}).sort(),
    },
    database: {
      databaseUrlPresent: Boolean(env.DATABASE_URL?.trim()),
      migrateDatabaseUrlPresent: Boolean(env.MIGRATE_DATABASE_URL?.trim()),
      prismaConnectionLimit: env.PRISMA_CONNECTION_LIMIT?.trim() || null,
      prismaPoolTimeout: env.PRISMA_POOL_TIMEOUT?.trim() || null,
      runtimeConnectionKind: databaseConnectionKind(env.DATABASE_URL),
    },
    deployment: {
      netlifyBuildCommand: matchTomlValue(netlifyToml, "command"),
      nodeVersion: matchTomlValue(netlifyToml, "NODE_VERSION"),
      scheduledFunctions: matchScheduledFunctions(netlifyToml),
    },
    observability: {
      databaseQueryTimingConfigured: Boolean(
        env.DATABASE_QUERY_TIMING_ENABLED?.trim(),
      ),
      databaseQueryTimingEnabled:
        truthyEnv(env.DATABASE_QUERY_TIMING_ENABLED) ||
        truthyEnv(env.PERFORMANCE_LOGGING_ENABLED),
      performanceLoggingConfigured: Boolean(env.PERFORMANCE_LOGGING_ENABLED?.trim()),
      webVitalsConfigured: Boolean(
        env.NEXT_PUBLIC_PERFORMANCE_WEB_VITALS_ENABLED?.trim(),
      ),
    },
    tests: {
      commands: ["typecheck", "lint", "test:unit", "build"].filter((script) =>
        Boolean(packageJson?.scripts?.[script]),
      ),
      unitTestFiles: existsSync(testsPath)
        ? readdirSync(testsPath).filter((file) => file.endsWith(".test.ts")).length
        : 0,
    },
  };
}

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  name?: string;
  scripts?: Record<string, string>;
};

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function readTextFile(filePath: string) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function databaseConnectionKind(url: string | undefined) {
  if (!url) return "unknown";

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    if (hostname.includes("-pooler.")) return "neon-pooler";
    if (hostname.includes("neon.tech")) return "neon-direct";
    if (parsed.protocol.startsWith("postgres")) return "postgres";

    return "unknown";
  } catch {
    return "unknown";
  }
}

function matchTomlValue(toml: string, key: string) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = toml.match(new RegExp(`^\\s*${escapedKey}\\s*=\\s*["']([^"']+)["']`, "m"));

  return match?.[1] ?? null;
}

function matchScheduledFunctions(toml: string) {
  return Array.from(
    toml.matchAll(/^\s*schedule\s*=\s*["']([^"']+)["']/gm),
    (match) => match[1] ?? "",
  ).filter(Boolean);
}

function truthyEnv(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}
