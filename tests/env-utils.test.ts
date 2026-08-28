import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  validateCredentialEncryptionKey,
  validateProductionEnv,
} from "../scripts/env-utils";
import {
  databaseUrlWithPoolDefaults,
  inspectDatabaseConnectionUrl,
} from "../src/lib/database/connection-url";

describe("credential encryption env validation", () => {
  it("treats blank keys as missing", () => {
    assert.deepEqual(validateCredentialEncryptionKey(""), {
      preferredBase64: false,
      present: false,
      usable: false,
    });
  });

  it("rejects short placeholders that the app cannot use", () => {
    assert.deepEqual(
      validateCredentialEncryptionKey("replace-with-base64-32-byte-key"),
      {
        preferredBase64: false,
        present: true,
        usable: false,
      },
    );
  });

  it("accepts generated 32-byte base64 keys as preferred", () => {
    const key = Buffer.alloc(32, 7).toString("base64");

    assert.deepEqual(validateCredentialEncryptionKey(key), {
      preferredBase64: true,
      present: true,
      usable: true,
    });
  });

  it("accepts legacy long string keys but marks them non-preferred", () => {
    assert.deepEqual(validateCredentialEncryptionKey("x".repeat(32)), {
      preferredBase64: false,
      present: true,
      usable: true,
    });
  });
});

describe("database connection env validation", () => {
  it("detects Neon pooled runtime URLs without exposing the host", () => {
    const profile = inspectDatabaseConnectionUrl(
      "postgresql://user:pass@ep-test-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require",
    );

    assert.equal(profile.kind, "neon-pooler");
    assert.equal(profile.usesNeon, true);
    assert.equal(profile.usesPooler, true);
    assert.equal(profile.hasSslModeRequire, true);
  });

  it("detects direct Neon runtime URLs", () => {
    const profile = inspectDatabaseConnectionUrl(
      "postgresql://user:pass@ep-test.eu-west-2.aws.neon.tech/neondb?sslmode=require",
    );

    assert.equal(profile.kind, "neon-direct");
    assert.equal(profile.usesNeon, true);
    assert.equal(profile.usesPooler, false);
  });

  it("adds conservative Prisma defaults only for Neon pooled URLs", () => {
    assert.equal(
      databaseUrlWithPoolDefaults(
        "postgresql://user:pass@ep-test-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require",
        { connectionLimit: "2", poolTimeout: "15" },
      ),
      "postgresql://user:pass@ep-test-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&connection_limit=2&pool_timeout=15",
    );
    assert.equal(
      databaseUrlWithPoolDefaults(
        "postgresql://user:pass@ep-test.eu-west-2.aws.neon.tech/neondb?sslmode=require",
        { connectionLimit: "2", poolTimeout: "15" },
      ),
      "postgresql://user:pass@ep-test.eu-west-2.aws.neon.tech/neondb?sslmode=require",
    );
  });

  it("warns when production runtime uses a direct Neon URL", () => {
    const result = withProductionEnv({
      DATABASE_URL:
        "postgresql://user:pass@ep-test.eu-west-2.aws.neon.tech/neondb?sslmode=require",
      MIGRATE_DATABASE_URL:
        "postgresql://user:pass@ep-test.eu-west-2.aws.neon.tech/neondb?sslmode=require",
    });

    assert.equal(result.ok, true);
    assert.equal(result.database.runtime.kind, "neon-direct");
    assert.match(result.warnings.join("\n"), /direct Neon host/);
  });

  it("warns when pooled Neon runtime migrations would also use the pooler", () => {
    const result = withProductionEnv({
      DATABASE_URL:
        "postgresql://user:pass@ep-test-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require",
      MIGRATE_DATABASE_URL:
        "postgresql://user:pass@ep-test-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require",
    });

    assert.equal(result.ok, true);
    assert.equal(result.database.runtime.kind, "neon-pooler");
    assert.match(result.warnings.join("\n"), /MIGRATE_DATABASE_URL.*pooled host/);
  });
});

function withProductionEnv(
  overrides: Partial<Record<string, string>>,
): ReturnType<typeof validateProductionEnv> {
  const keys = [
    "APP_BASE_URL",
    "CREDENTIAL_ENCRYPTION_KEY",
    "DATABASE_URL",
    "MIGRATE_DATABASE_URL",
    "SESSION_COOKIE_NAME",
    "SESSION_TTL_DAYS",
  ];
  const previous = new Map(keys.map((key) => [key, process.env[key]]));

  for (const key of keys) {
    delete process.env[key];
  }

  Object.assign(process.env, {
    APP_BASE_URL: "https://crm.epc.example",
    CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("base64"),
    SESSION_COOKIE_NAME: "epc_crm_session",
    SESSION_TTL_DAYS: "7",
    ...overrides,
  });

  try {
    return validateProductionEnv();
  } finally {
    for (const key of keys) {
      const value = previous.get(key);

      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}
