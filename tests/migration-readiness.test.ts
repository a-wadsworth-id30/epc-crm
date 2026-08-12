import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareMigrationReadiness,
  type AppliedMigrationRow,
} from "@/lib/database/migration-readiness";

function appliedMigration(
  migrationName: string,
  overrides: Partial<AppliedMigrationRow> = {},
): AppliedMigrationRow {
  return {
    finishedAt: new Date("2026-07-21T10:00:00.000Z"),
    logs: null,
    migrationName,
    rolledBackAt: null,
    startedAt: new Date("2026-07-21T09:59:00.000Z"),
    ...overrides,
  };
}

describe("migration readiness", () => {
  it("reports ready when every committed migration is applied", () => {
    const result = compareMigrationReadiness({
      appliedMigrations: [
        appliedMigration("20260721110000_contact_phone_lookup_indexes"),
        appliedMigration("20260721130000_search_trigram_indexes"),
      ],
      committedMigrations: [
        "20260721110000_contact_phone_lookup_indexes",
        "20260721130000_search_trigram_indexes",
      ],
    });

    assert.equal(result.status, "READY");
    assert.equal(result.pendingMigrations.length, 0);
    assert.equal(result.appliedCount, 2);
  });

  it("reports pending committed migrations not found in the database", () => {
    const result = compareMigrationReadiness({
      appliedMigrations: [
        appliedMigration("20260721110000_contact_phone_lookup_indexes"),
      ],
      committedMigrations: [
        "20260721110000_contact_phone_lookup_indexes",
        "20260721130000_search_trigram_indexes",
      ],
    });

    assert.equal(result.status, "PENDING");
    assert.deepEqual(result.pendingMigrations, [
      "20260721130000_search_trigram_indexes",
    ]);
  });

  it("reports failed migrations before pending state", () => {
    const result = compareMigrationReadiness({
      appliedMigrations: [
        appliedMigration("20260721110000_contact_phone_lookup_indexes"),
        appliedMigration("20260721130000_search_trigram_indexes", {
          finishedAt: null,
          logs: "index creation failed",
        }),
      ],
      committedMigrations: [
        "20260721110000_contact_phone_lookup_indexes",
        "20260721130000_search_trigram_indexes",
      ],
    });

    assert.equal(result.status, "FAILED");
    assert.equal(result.failedMigrations[0]?.migrationName, "20260721130000_search_trigram_indexes");
  });

  it("reports unknown when committed migration folders cannot be read", () => {
    const result = compareMigrationReadiness({
      appliedMigrations: [
        appliedMigration("20260721110000_contact_phone_lookup_indexes"),
      ],
      committedMigrations: [],
      committedMigrationsAvailable: false,
    });

    assert.equal(result.status, "UNKNOWN");
    assert.equal(result.committedMigrationsAvailable, false);
  });
});
