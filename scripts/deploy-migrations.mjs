import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

function loadDotEnv(path = ".env") {
  if (!existsSync(path)) return;

  const lines = readFileSync(path, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");

    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^"|"$/g, "");

    process.env[key] ??= value;
  }
}

loadDotEnv();

if (process.env.SKIP_DATABASE_MIGRATIONS === "true") {
  console.warn(
    "SKIP_DATABASE_MIGRATIONS=true; skipping Prisma migration status/deploy. Only use this before the production database is provisioned.",
  );
  process.exit(0);
}

const databaseUrl = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL;
const maxAttempts = Number(process.env.PRISMA_MIGRATE_DEPLOY_ATTEMPTS ?? "6");
const retryDelayMs = Number(process.env.PRISMA_MIGRATE_DEPLOY_RETRY_MS ?? "15000");
const statusCheckEnabled =
  process.env.PRISMA_MIGRATE_DEPLOY_STATUS_CHECK !== "false";

if (!databaseUrl) {
  console.error(
    "Missing DATABASE_URL. Set DATABASE_URL, or set MIGRATE_DATABASE_URL for migration-only deploys.",
  );
  process.exit(1);
}

if (!process.env.MIGRATE_DATABASE_URL && databaseUrl.includes("-pooler.")) {
  console.warn(
    "MIGRATE_DATABASE_URL is not set. Prisma migrations are using the pooled DATABASE_URL; use the direct Neon URL for migration deploys when possible.",
  );
}

if (statusCheckEnabled) {
  const status = migrationStatus(databaseUrl);

  if (status === "up-to-date") {
    console.log("Prisma migrations are already up to date. Skipping migrate deploy.");
    process.exit(0);
  }

  if (status === "pending") {
    console.log("Pending Prisma migrations detected. Running migrate deploy.");
  } else {
    console.warn(
      "Could not confirm Prisma migration status before deploy. Running migrate deploy.",
    );
  }
} else {
  console.log("Prisma migration status check disabled. Running migrate deploy.");
}

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  console.log(`Running Prisma migrations, attempt ${attempt}/${maxAttempts}...`);

  const result = runPrisma(["migrate", "deploy"], databaseUrl);

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if ((result.status ?? 1) === 0) {
    process.exit(0);
  }

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const shouldRetry =
    attempt < maxAttempts &&
    output.includes("Timed out trying to acquire a postgres advisory lock");

  if (!shouldRetry) {
    process.exit(result.status ?? 1);
  }

  console.warn(
    `Prisma migration advisory lock is busy. Retrying in ${Math.round(
      retryDelayMs / 1000,
    )}s...`,
  );
  sleep(retryDelayMs);
}

process.exit(1);

function migrationStatus(url) {
  console.log("Checking Prisma migration status before deploy...");

  const result = runPrisma(["migrate", "status"], url);

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) {
    console.warn(result.error.message);
    return "unknown";
  }

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

  if ((result.status ?? 1) === 0 && /Database schema is up to date/i.test(output)) {
    return "up-to-date";
  }

  if (/not yet been applied/i.test(output)) {
    return "pending";
  }

  return "unknown";
}

function runPrisma(args, url) {
  return spawnSync("npx", ["prisma", ...args], {
    env: {
      ...process.env,
      DATABASE_URL: url,
    },
    encoding: "utf8",
  });
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
