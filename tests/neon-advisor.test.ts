import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readAdvisorConfig } from "../src/lib/neon-advisor/config";
import { sumMetricValue } from "../src/lib/neon-advisor/cost-model";
import { buildRecommendations } from "../src/lib/neon-advisor/recommendation-engine";
import type {
  AdvisorCapability,
  CostModelContext,
  NeonApiSnapshot,
  PgDatabaseStats,
  PostgresAnalysisSnapshot,
  RepositoryProfile,
} from "../src/lib/neon-advisor/types";

describe("Neon optimization advisor", () => {
  it("defaults to read-only advisory mode with conservative guardrails", () => {
    const config = readAdvisorConfig({} as NodeJS.ProcessEnv);

    assert.equal(config.mode, "READ_ONLY_ADVISOR");
    assert.equal(config.outputPath, ".neon-advisor/latest-report.json");
    assert.equal(config.neon.apiKeyPresent, false);
    assert.equal(config.thresholds.p95LatencyIncreaseLimitPercent, 10);
    assert.equal(config.thresholds.errorRateIncreaseLimitPoints, 1);
    assert.equal(config.thresholds.activeConnectionSaturationPercent, 80);
  });

  it("extracts Neon consumption metrics from nested response shapes", () => {
    const total = sumMetricValue(
      {
        projects: [
          { compute_unit_seconds: 120 },
          { metric: "compute_unit_seconds", value: "30" },
          { nested: [{ metric_name: "compute_unit_seconds", usage: 50 }] },
        ],
      },
      "compute_unit_seconds",
    );

    assert.equal(total, 200);
  });

  it("marks risky changes as approval-required and blocks unsafe downsizing", () => {
    const config = readAdvisorConfig({
      DATABASE_URL: "postgresql://user:pass@example.neon.tech/neondb",
    } as unknown as NodeJS.ProcessEnv);
    const recommendations = buildRecommendations({
      config,
      costModel: costModelFixture(config.costRates.currency),
      neon: neonFixture(),
      postgres: postgresFixture({
        active_connections: 8,
        current_database_connections: 9,
        idle_connections: 1,
        idle_in_transaction_connections: 0,
        max_connections: 10,
        waiting_connections: 0,
      }),
      repository: repositoryFixture("neon-direct"),
    });

    assert.ok(
      recommendations.some(
        (recommendation) => recommendation.id === "use-neon-pooler-for-runtime",
      ),
    );
    assert.ok(
      recommendations.some(
        (recommendation) =>
          recommendation.id === "do-not-downsize-under-connection-saturation",
      ),
    );
    assert.ok(
      recommendations.every(
        (recommendation) =>
          recommendation.automaticActionAllowed === false &&
          recommendation.approval !== "read_only",
      ),
    );
  });
});

function capability<T>(
  name: string,
  data: T | null,
  status: AdvisorCapability<T>["status"] = "available",
): AdvisorCapability<T> {
  return {
    data,
    name,
    source: "test",
    status,
  };
}

function costModelFixture(currency: string): CostModelContext {
  return {
    computedFrom: ["test"],
    currentMonthlyComputeCost: {
      amount: null,
      basis: "test",
      currency,
      exact: false,
      measured: false,
    },
    currentMonthlyStorageCost: {
      amount: null,
      basis: "test",
      currency,
      exact: false,
      measured: false,
    },
    databaseSizeGb: null,
    monthlyComputeCuHours: null,
  };
}

function neonFixture(): NeonApiSnapshot {
  return {
    branchConsumption: capability("branch-consumption-history", null, "skipped"),
    branches: capability("branches", { branches: [] }),
    endpoints: capability("endpoints", { endpoints: [] }),
    operations: capability("operations", null, "skipped"),
    project: capability("project", null, "skipped"),
    projectConsumption: capability("project-consumption-history", null, "skipped"),
  };
}

function postgresFixture(
  connectionSummary: NonNullable<
    PostgresAnalysisSnapshot["connectionSummary"]["data"]
  >,
): PostgresAnalysisSnapshot {
  const databaseStats: PgDatabaseStats = {
    blk_read_time: 0,
    blk_write_time: 0,
    blks_hit: BigInt(1000),
    blks_read: BigInt(1),
    conflicts: BigInt(0),
    deadlocks: BigInt(0),
    numbackends: 1,
    temp_bytes: BigInt(0),
    temp_files: BigInt(0),
    tup_deleted: BigInt(0),
    tup_fetched: BigInt(0),
    tup_inserted: BigInt(0),
    tup_returned: BigInt(0),
    tup_updated: BigInt(0),
    xact_commit: BigInt(0),
    xact_rollback: BigInt(0),
  };

  const postgres: PostgresAnalysisSnapshot = {
    activitySummary: capability("activity-summary", []),
    capabilities: [],
    connectionSummary: capability("connection-summary", connectionSummary),
    databaseOverview: capability<
      NonNullable<PostgresAnalysisSnapshot["databaseOverview"]["data"]>
    >("database-overview", null, "skipped"),
    databaseStats: capability("database-statistics", databaseStats),
    indexStats: capability("index-statistics", []),
    ioStats: capability("table-io-statistics", []),
    lockSummary: capability("lock-summary", []),
    lockWaitSummary: capability("lock-wait-summary", {
      max_wait_ms: null,
      waiting_locks: 0,
    }),
    pgStatStatementsInstalled: capability("pg-stat-statements-capability", false),
    settings: capability("database-settings", []),
    statementStats: capability("pg-stat-statements", []),
    tableStats: capability("table-statistics", []),
    walStats: capability<NonNullable<PostgresAnalysisSnapshot["walStats"]["data"]>>(
      "wal-statistics",
      null,
      "skipped",
    ),
  };

  postgres.capabilities = [
    postgres.connectionSummary,
    postgres.databaseStats,
    postgres.pgStatStatementsInstalled,
  ];

  return postgres;
}

function repositoryFixture(
  runtimeConnectionKind: RepositoryProfile["database"]["runtimeConnectionKind"],
): RepositoryProfile {
  return {
    app: {
      name: "id30-crm",
      nextVersion: "16",
      prismaVersion: "6",
      scripts: ["neon:advisor"],
    },
    database: {
      databaseUrlPresent: true,
      migrateDatabaseUrlPresent: true,
      prismaConnectionLimit: "1",
      prismaPoolTimeout: "10",
      runtimeConnectionKind,
    },
    deployment: {
      netlifyBuildCommand: "npm run netlify:build",
      nodeVersion: "20",
      scheduledFunctions: [],
    },
    observability: {
      databaseQueryTimingConfigured: false,
      databaseQueryTimingEnabled: false,
      performanceLoggingConfigured: false,
      webVitalsConfigured: false,
    },
    tests: {
      commands: ["typecheck", "lint"],
      unitTestFiles: 1,
    },
  };
}
