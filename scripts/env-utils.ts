import { existsSync, readFileSync } from "node:fs";
import {
  databaseConnectionKindLabel,
  inspectDatabaseConnectionUrl,
} from "../src/lib/database/connection-url";

const requiredProductionKeys = [
  "DATABASE_URL",
  "CREDENTIAL_ENCRYPTION_KEY",
  "SESSION_COOKIE_NAME",
  "SESSION_TTL_DAYS",
] as const;

export function loadDotEnv(path = ".env") {
  if (!existsSync(path)) {
    return;
  }

  const lines = readFileSync(path, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^"|"$/g, "");

    process.env[key] ??= value;
  }
}

export function validateProductionEnv() {
  const missing = requiredProductionKeys.filter((key) => !process.env[key]);
  const invalid: string[] = [];
  const warnings: string[] = [];
  const runtimeDatabase = inspectDatabaseConnectionUrl(process.env.DATABASE_URL);
  const migrationDatabase = inspectDatabaseConnectionUrl(
    process.env.MIGRATE_DATABASE_URL,
  );

  if (runtimeDatabase.present && !runtimeDatabase.valid) {
    invalid.push("DATABASE_URL");
  }

  if (migrationDatabase.present && !migrationDatabase.valid) {
    invalid.push("MIGRATE_DATABASE_URL");
  }

  const encryptionKey = validateCredentialEncryptionKey(
    process.env.CREDENTIAL_ENCRYPTION_KEY,
  );
  if (encryptionKey.present) {
    if (!encryptionKey.usable) {
      invalid.push("CREDENTIAL_ENCRYPTION_KEY");
    } else if (!encryptionKey.preferredBase64) {
      warnings.push(
        "CREDENTIAL_ENCRYPTION_KEY should be generated with `openssl rand -base64 32` for new installs.",
      );
    }
  }

  const sessionDays = Number(process.env.SESSION_TTL_DAYS);
  if (!Number.isFinite(sessionDays) || sessionDays <= 0) {
    warnings.push("SESSION_TTL_DAYS should be a positive number.");
  }

  if (!process.env.APP_BASE_URL) {
    warnings.push(
      "APP_BASE_URL is recommended so Twilio and healthcheck URLs are clear.",
    );
  }

  if (runtimeDatabase.kind === "neon-direct") {
    warnings.push(
      "DATABASE_URL uses a direct Neon host. Use the pooled Neon host for Netlify runtime to reduce serverless connection churn; keep MIGRATE_DATABASE_URL on the direct host.",
    );
  }

  if (runtimeDatabase.usesNeon && !runtimeDatabase.hasSslModeRequire) {
    warnings.push("DATABASE_URL should include sslmode=require for Neon.");
  }

  if (runtimeDatabase.usesPooler && !process.env.MIGRATE_DATABASE_URL) {
    warnings.push(
      "DATABASE_URL appears to use a Neon pooled host. Set MIGRATE_DATABASE_URL to a direct Neon connection for Netlify migration deploys.",
    );
  }

  if (migrationDatabase.usesPooler) {
    warnings.push(
      "MIGRATE_DATABASE_URL appears to use a Neon pooled host. Use the direct Neon connection for Prisma migration deploys.",
    );
  }

  if (migrationDatabase.usesNeon && !migrationDatabase.hasSslModeRequire) {
    warnings.push("MIGRATE_DATABASE_URL should include sslmode=require for Neon.");
  }

  return {
    database: {
      migration: {
        kind: migrationDatabase.kind,
        label: databaseConnectionKindLabel(migrationDatabase.kind),
      },
      runtime: {
        kind: runtimeDatabase.kind,
        label: databaseConnectionKindLabel(runtimeDatabase.kind),
      },
    },
    ok: missing.length === 0 && invalid.length === 0,
    invalid,
    missing,
    warnings,
  };
}

export function validateCredentialEncryptionKey(value: string | undefined) {
  const trimmed = value?.trim() ?? "";

  if (!trimmed) {
    return {
      preferredBase64: false,
      present: false,
      usable: false,
    };
  }

  const preferredBase64 = isBase64Encoded32ByteValue(trimmed);

  return {
    preferredBase64,
    present: true,
    usable:
      preferredBase64 ||
      isHexEncoded32ByteValue(trimmed) ||
      trimmed.length >= 32,
  };
}

function isBase64Encoded32ByteValue(value: string) {
  const trimmed = value.trim();

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) {
    return false;
  }

  return Buffer.from(trimmed, "base64").length === 32;
}

function isHexEncoded32ByteValue(value: string) {
  return /^[a-f0-9]{64}$/i.test(value.trim());
}
