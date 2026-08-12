import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";

export type AppliedMigrationRow = {
  finishedAt: Date | null;
  logs: string | null;
  migrationName: string;
  rolledBackAt: Date | null;
  startedAt: Date;
};

export type MigrationReadiness = {
  appliedCount: number;
  committedCount: number;
  committedMigrationsAvailable: boolean;
  failedMigrations: AppliedMigrationRow[];
  latestApplied: AppliedMigrationRow | null;
  latestCommitted: string | null;
  pendingMigrations: string[];
  status: "READY" | "PENDING" | "FAILED" | "UNKNOWN";
};

export async function readMigrationReadiness(): Promise<MigrationReadiness> {
  const [committedMigrations, appliedMigrations] = await Promise.all([
    readCommittedMigrationNames(),
    readAppliedMigrationRows(),
  ]);

  return compareMigrationReadiness({
    appliedMigrations,
    committedMigrations: committedMigrations.names,
    committedMigrationsAvailable: committedMigrations.available,
  });
}

export function compareMigrationReadiness({
  appliedMigrations,
  committedMigrations,
  committedMigrationsAvailable = true,
}: {
  appliedMigrations: AppliedMigrationRow[];
  committedMigrations: string[];
  committedMigrationsAvailable?: boolean;
}): MigrationReadiness {
  const appliedMigrationNames = new Set(
    appliedMigrations
      .filter((migration) => migration.finishedAt && !migration.rolledBackAt)
      .map((migration) => migration.migrationName),
  );
  const failedMigrations = appliedMigrations.filter(
    (migration) => !migration.finishedAt && !migration.rolledBackAt,
  );
  const pendingMigrations = committedMigrations.filter(
    (migration) => !appliedMigrationNames.has(migration),
  );
  const latestApplied =
    appliedMigrations
      .filter((migration) => migration.finishedAt && !migration.rolledBackAt)
      .sort(
        (a, b) =>
          (b.finishedAt?.getTime() ?? 0) - (a.finishedAt?.getTime() ?? 0) ||
          b.migrationName.localeCompare(a.migrationName),
      )[0] ?? null;
  const latestCommitted = committedMigrations.at(-1) ?? null;
  const status = failedMigrations.length
    ? "FAILED"
    : !committedMigrationsAvailable
      ? "UNKNOWN"
      : pendingMigrations.length
        ? "PENDING"
        : "READY";

  return {
    appliedCount: appliedMigrationNames.size,
    committedCount: committedMigrations.length,
    committedMigrationsAvailable,
    failedMigrations,
    latestApplied,
    latestCommitted,
    pendingMigrations,
    status,
  };
}

async function readCommittedMigrationNames() {
  try {
    const migrationsPath = join(process.cwd(), "prisma", "migrations");
    const entries = await readdir(migrationsPath, { withFileTypes: true });

    return {
      available: true,
      names: entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort(),
    };
  } catch {
    return {
      available: false,
      names: [],
    };
  }
}

async function readAppliedMigrationRows() {
  return prisma.$queryRaw<AppliedMigrationRow[]>`
    SELECT
      "migration_name" AS "migrationName",
      "started_at" AS "startedAt",
      "finished_at" AS "finishedAt",
      "rolled_back_at" AS "rolledBackAt",
      "logs"
    FROM "_prisma_migrations"
    ORDER BY "migration_name" ASC
  `;
}
