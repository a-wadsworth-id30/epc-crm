import {
  estimateComputeSavings,
  estimateStorageSavings,
  zeroSavingsEstimate,
} from "./cost-model";
import {
  defaultRollbackProcedure,
  defaultValidationProcedure,
} from "./validation-engine";
import type {
  AdvisorConfig,
  AdvisorCostEstimate,
  AdvisorEvidence,
  AdvisorRecommendation,
  CostModelContext,
  NeonApiSnapshot,
  PgIndexStats,
  PgStatementStats,
  PgTableStats,
  PostgresAnalysisSnapshot,
  RepositoryProfile,
  RiskLevel,
} from "./types";

export function buildRecommendations({
  config,
  costModel,
  neon,
  postgres,
  repository,
}: {
  config: AdvisorConfig;
  costModel: CostModelContext;
  neon: NeonApiSnapshot;
  postgres: PostgresAnalysisSnapshot;
  repository: RepositoryProfile;
}) {
  const recommendations: AdvisorRecommendation[] = [];

  addTelemetryRecommendation({ config, neon, recommendations });
  addConnectionPoolRecommendation({ config, recommendations, repository });
  addEndpointRecommendations({ config, costModel, neon, recommendations });
  addBranchRecommendations({ config, neon, recommendations });
  addConnectionRecommendations({ config, postgres, recommendations });
  addPgStatStatementsRecommendation({ config, postgres, recommendations });
  addStatementRecommendations({ config, costModel, postgres, recommendations });
  addTableRecommendations({ config, costModel, postgres, recommendations });
  addIndexRecommendations({ config, costModel, postgres, recommendations });
  addDatabaseStatRecommendations({ config, costModel, postgres, recommendations });

  if (!recommendations.length) {
    recommendations.push(
      recommendation({
        config,
        confidence: 0.6,
        engineeringEffort: 1,
        estimatedImpact:
          "No high-confidence optimization was identified from the available read-only data.",
        estimatedMonthlySavings: zeroSavingsEstimate(
          config,
          "No change recommended from the available sample.",
        ),
        evidence: [
          evidence({
            label: "PostgreSQL capabilities collected",
            measured: true,
            source: "postgres-system-views",
            value: postgres.capabilities.filter(
              (capability) => capability.status === "available",
            ).length,
          }),
        ],
        expectedSavings:
          "Savings are unknown until more Neon usage history and query statistics are available.",
        id: "continue-read-only-baselining",
        issue: "The safe next step is to collect a wider baseline before changing capacity, schema or application code.",
        proposedOptimization:
          "Run the advisor over multiple representative traffic windows and enable optional read-only Neon telemetry.",
        reversibility: 1,
        riskLevel: "low",
        savingsScore: 10,
        title: "Continue read-only baselining",
      }),
    );
  }

  return recommendations.sort((first, second) => second.score - first.score);
}

function addTelemetryRecommendation({
  config,
  neon,
  recommendations,
}: {
  config: AdvisorConfig;
  neon: NeonApiSnapshot;
  recommendations: AdvisorRecommendation[];
}) {
  if (neon.project.status === "available") return;

  recommendations.push(
    recommendation({
      config,
      confidence: 0.8,
      engineeringEffort: 1,
      estimatedImpact:
        "Improves confidence in compute uptime, autoscaling, branch and consumption recommendations.",
      estimatedMonthlySavings: zeroSavingsEstimate(
        config,
        "Telemetry enablement does not directly save cost.",
      ),
      evidence: [
        evidence({
          label: "Neon project telemetry",
          measured: true,
          source: "neon-api",
          value: neon.project.status,
          detail: neon.project.error,
        }),
      ],
      expectedSavings:
        "Indirect. Enables measured savings estimates instead of qualitative guesses.",
      id: "enable-read-only-neon-telemetry",
      issue:
        "Neon API telemetry is unavailable, so compute uptime and branch usage cannot be verified from this run.",
      proposedOptimization:
        "Provide a read-only Neon API key and `NEON_PROJECT_ID` for advisory runs only.",
      reversibility: 1,
      riskLevel: "low",
      savingsScore: 20,
      title: "Enable read-only Neon telemetry",
      validationProcedure: [
        "Set `NEON_API_KEY` and `NEON_PROJECT_ID` in the execution environment only.",
        "Run `npm run neon:advisor` and confirm Neon project, branch and endpoint capabilities are available.",
        "Confirm the generated report does not include secrets or raw connection strings.",
      ],
    }),
  );
}

function addConnectionPoolRecommendation({
  config,
  recommendations,
  repository,
}: {
  config: AdvisorConfig;
  recommendations: AdvisorRecommendation[];
  repository: RepositoryProfile;
}) {
  if (
    !repository.database.databaseUrlPresent ||
    repository.database.runtimeConnectionKind === "neon-pooler"
  ) {
    return;
  }

  if (repository.database.runtimeConnectionKind !== "neon-direct") {
    recommendations.push(
      recommendation({
        config,
        confidence: 0.65,
        engineeringEffort: 1,
        estimatedImpact:
          "The current execution environment does not prove whether production is using Neon pooler or direct connections.",
        estimatedMonthlySavings: zeroSavingsEstimate(
          config,
          "Environment verification does not directly save cost.",
        ),
        evidence: [
          evidence({
            label: "Runtime connection kind",
            measured: true,
            source: "repository-environment",
            value: repository.database.runtimeConnectionKind,
          }),
        ],
        expectedSavings:
          "Indirect. Running against a production-like Neon environment gives safer pooling and capacity recommendations.",
        id: "verify-production-neon-runtime-connection",
        issue:
          "The advisor was not run with a recognizable Neon runtime connection URL.",
        proposedOptimization:
          "Run the advisor with the production or staging Neon environment loaded, then confirm production `DATABASE_URL` uses the pooled endpoint and migrations use the direct endpoint.",
        reversibility: 1,
        riskLevel: "low",
        savingsScore: 25,
        title: "Verify production Neon runtime connection",
      }),
    );

    return;
  }

  recommendations.push(
    recommendation({
      config,
      confidence: 0.75,
      engineeringEffort: 1,
      estimatedImpact:
        "Serverless runtimes can create connection churn when they use direct Postgres connections.",
      estimatedMonthlySavings: zeroSavingsEstimate(
        config,
        "Connection pooling reduces churn and saturation risk; monetary savings require Neon compute data.",
      ),
      evidence: [
        evidence({
          label: "Runtime connection kind",
          measured: true,
          source: "repository-environment",
          value: repository.database.runtimeConnectionKind,
        }),
      ],
      expectedSavings:
        "Lower connection churn and lower chance of unnecessary compute pressure.",
      id: "use-neon-pooler-for-runtime",
      issue:
        "Runtime `DATABASE_URL` does not appear to use the Neon pooled endpoint.",
      proposedOptimization:
        "Use the Neon pooled connection URL for runtime `DATABASE_URL`; keep `MIGRATE_DATABASE_URL` on the direct endpoint for migrations.",
      reversibility: 0.95,
      riskLevel: "low",
      savingsScore: 45,
      title: "Use Neon pooled runtime connections",
      validationProcedure: [
        "Confirm `DATABASE_URL` host contains `-pooler.` and `MIGRATE_DATABASE_URL` points to the direct endpoint.",
        "Deploy to staging or canary.",
        "Verify `/api/build-version`, `/api/health?database=1`, sign-in and high-volume list routes.",
        "Compare active connections, connection errors and p95 latency with the previous baseline.",
      ],
    }),
  );
}

function addEndpointRecommendations({
  config,
  costModel,
  neon,
  recommendations,
}: {
  config: AdvisorConfig;
  costModel: CostModelContext;
  neon: NeonApiSnapshot;
  recommendations: AdvisorRecommendation[];
}) {
  const endpoints = recordsFrom(neon.endpoints.data, "endpoints");
  const suspendReviewCandidates = endpoints.filter((endpoint) => {
    const suspendSeconds = numberField(endpoint, [
      "suspend_timeout_seconds",
      "suspendTimeoutSeconds",
    ]);

    return (
      suspendSeconds === null ||
      suspendSeconds <= 0 ||
      suspendSeconds > config.thresholds.targetSuspendSeconds
    );
  });
  const autoscalingEndpoints = endpoints.filter(
    (endpoint) =>
      numberField(endpoint, ["autoscaling_limit_max_cu", "max_cu"]) !== null ||
      numberField(endpoint, ["autoscaling_limit_min_cu", "min_cu"]) !== null,
  );
  const oversizedCandidates = autoscalingEndpoints.filter((endpoint) => {
    const minCu = numberField(endpoint, ["autoscaling_limit_min_cu", "min_cu"]);
    const maxCu = numberField(endpoint, ["autoscaling_limit_max_cu", "max_cu"]);

    return (
      (minCu !== null && minCu > config.thresholds.targetMinCu) ||
      (maxCu !== null && maxCu > config.thresholds.targetMaxCu)
    );
  });

  if (suspendReviewCandidates.length) {
    recommendations.push(
      recommendation({
        config,
        confidence: costModel.monthlyComputeCuHours === null ? 0.45 : 0.7,
        engineeringEffort: 1,
        estimatedImpact:
          "Potential reduction in active compute time when the CRM has quiet periods and no background worker requires a persistent connection.",
        estimatedMonthlySavings: estimateComputeSavings({
          basis:
            "Estimated 15-30% compute reduction from enabling or tightening suspend settings after validating background jobs.",
          config,
          currentMonthlyComputeCost: costModel.currentMonthlyComputeCost,
          percent: 0.2,
        }),
        evidence: [
          evidence({
            label: "Endpoints without confirmed suspend timeout",
            measured: true,
            source: "neon-api",
            value: suspendReviewCandidates.length,
          }),
          evidence({
            label: "Target suspend timeout",
            measured: false,
            source: "advisor-config",
            value: config.thresholds.targetSuspendSeconds,
            unit: "seconds",
          }),
        ],
        expectedSavings:
          "Potential compute-active time reduction during low-traffic periods.",
        id: "review-endpoint-suspend-settings",
        issue:
          "One or more Neon endpoints have no confirmed suspend timeout, disabled suspend or a timeout above the CRM review target.",
        proposedOptimization:
          "Review endpoint suspend settings and keep scale-to-zero enabled with a timeout no higher than the validated CRM target.",
        reversibility: 0.95,
        riskLevel: "low",
        savingsScore: 70,
        title: "Review endpoint suspend settings",
        validationProcedure: [
          "Capture active compute and request baseline for at least one week.",
          "Confirm no background worker needs a persistent database connection.",
          "Apply the suspend timeout target only after approval in a low-traffic window.",
          "Monitor cold-start latency, webhook failures, scheduled jobs, `/api/build-version` and explicit database health.",
        ],
      }),
    );
  }

  if (oversizedCandidates.length) {
    recommendations.push(
      recommendation({
        config,
        confidence: costModel.monthlyComputeCuHours === null ? 0.4 : 0.65,
        engineeringEffort: 1,
        estimatedImpact:
          "May reduce compute spend if peak CPU, memory and connection pressure remain safely below current autoscaling headroom.",
        estimatedMonthlySavings: estimateComputeSavings({
          basis:
            "Estimated 10-25% compute reduction from resizing autoscaling limits after peak-load validation.",
          config,
          currentMonthlyComputeCost: costModel.currentMonthlyComputeCost,
          percent: 0.15,
        }),
        evidence: [
          evidence({
            label: "Endpoints with high min/max CU candidates",
            measured: true,
            source: "neon-api",
            value: oversizedCandidates.length,
          }),
          evidence({
            label: "Target min CU",
            measured: false,
            source: "advisor-config",
            value: config.thresholds.targetMinCu,
            unit: "CU",
          }),
          evidence({
            label: "Target max CU",
            measured: false,
            source: "advisor-config",
            value: config.thresholds.targetMaxCu,
            unit: "CU",
          }),
        ],
        expectedSavings:
          "Lower compute spend if peak load has enough headroom at a smaller size.",
        id: "review-compute-autoscaling-limits",
        issue:
          "Endpoint autoscaling limits are above the CRM cost-review target, but peak-load headroom must be proven first.",
        proposedOptimization:
          "Compare peak CPU, memory, active connections and p95 latency against the target CU range before applying a lower Neon autoscaling ceiling.",
        reversibility: 0.9,
        riskLevel: "medium",
        savingsScore: 65,
        title: "Review Neon compute autoscaling limits",
        validationProcedure: [
          "Run the advisor with read-only Neon API telemetry over a representative week.",
          "Confirm peak CPU, memory and connection saturation stay below configured guardrails.",
          "Apply the new Neon max CU in the Neon console or API during a quiet period.",
          "Verify `/api/build-version`, `/api/health?database=1`, sign-in, dashboard, Sales and Pipedrive scheduled imports.",
          "Roll back the CU ceiling if latency, errors or saturation breach guardrails.",
        ],
      }),
    );
  }
}

function addBranchRecommendations({
  config,
  neon,
  recommendations,
}: {
  config: AdvisorConfig;
  neon: NeonApiSnapshot;
  recommendations: AdvisorRecommendation[];
}) {
  const branches = recordsFrom(neon.branches.data, "branches");
  const staleBranches = branches.filter((branch) => {
    if (booleanField(branch, ["primary", "default", "is_primary"])) return false;

    const updatedAt = dateField(branch, ["updated_at", "last_active_at", "created_at"]);
    if (!updatedAt) return false;

    const ageDays = (Date.now() - updatedAt.getTime()) / 86_400_000;

    return ageDays >= config.thresholds.branchReviewAgeDays;
  });

  if (!staleBranches.length) return;

  const amount =
    config.costRates.branchMonthlyCost === null
      ? null
      : Math.round(
          staleBranches.length * config.costRates.branchMonthlyCost * 100,
        ) / 100;

  recommendations.push(
    recommendation({
      config,
      confidence: 0.6,
      engineeringEffort: 1,
      estimatedImpact:
        "Old preview or development branches may consume branch/storage resources if they are no longer needed.",
      estimatedMonthlySavings: {
        amount,
        basis:
          amount === null
            ? "Set NEON_ADVISOR_BRANCH_MONTHLY_COST for a monetary estimate. Branch deletion is not automated."
            : "Stale branch count multiplied by configured branch monthly rate.",
        currency: config.costRates.currency,
        exact: false,
        measured: true,
      },
      evidence: [
        evidence({
          label: "Branches older than review threshold",
          measured: true,
          source: "neon-api",
          unit: "branches",
          value: staleBranches.length,
        }),
        evidence({
          label: "Branch review threshold",
          measured: false,
          source: "advisor-config",
          unit: "days",
          value: config.thresholds.branchReviewAgeDays,
        }),
      ],
      expectedSavings:
        "Reduced branch and storage overhead if unused branches are manually removed after owner approval.",
      id: "review-stale-neon-branches",
      issue:
        "Non-primary Neon branches are older than the configured review threshold.",
      proposedOptimization:
        "Ask branch owners to confirm whether each branch is still needed; remove only approved unused branches outside this advisor.",
      reversibility: 0.4,
      riskLevel: "high",
      rollbackProcedure: [
        "Do not delete branches automatically.",
        "Before approved deletion, capture branch metadata and confirm backups/restore options.",
        "If a branch is removed incorrectly, restore from Neon backup/branch history where available or recreate from main.",
      ],
      savingsScore: 30,
      title: "Review stale Neon branches",
    }),
  );
}

function addConnectionRecommendations({
  config,
  postgres,
  recommendations,
}: {
  config: AdvisorConfig;
  postgres: PostgresAnalysisSnapshot;
  recommendations: AdvisorRecommendation[];
}) {
  const summary = postgres.connectionSummary.data;
  if (!summary) return;

  const saturation =
    summary.max_connections > 0
      ? (summary.current_database_connections / summary.max_connections) * 100
      : 0;

  if (saturation >= config.thresholds.activeConnectionSaturationPercent) {
    recommendations.push(
      recommendation({
        config,
        confidence: 0.8,
        engineeringEffort: 2,
        estimatedImpact:
          "Capacity reduction is unsafe until connection saturation falls below the configured guardrail.",
        estimatedMonthlySavings: zeroSavingsEstimate(
          config,
          "This is a safety finding, not a direct saving.",
        ),
        evidence: [
          evidence({
            label: "Connection saturation",
            measured: true,
            source: "pg_stat_activity",
            unit: "%",
            value: round(saturation),
          }),
          evidence({
            label: "Configured saturation guardrail",
            measured: false,
            source: "advisor-config",
            unit: "%",
            value: config.thresholds.activeConnectionSaturationPercent,
          }),
        ],
        expectedSavings:
          "No immediate savings. Prevents an unsafe compute downsize.",
        id: "do-not-downsize-under-connection-saturation",
        issue:
          "Current database connections are near the configured max-connection guardrail.",
        proposedOptimization:
          "Investigate connection pooling, long-lived sessions and route-level DB usage before considering compute changes.",
        reversibility: 1,
        riskLevel: "high",
        savingsScore: 5,
        title: "Do not downsize while connections are saturated",
      }),
    );
  }

  if (summary.idle_connections > config.thresholds.maxIdleConnections) {
    recommendations.push(
      recommendation({
        config,
        confidence: 0.7,
        engineeringEffort: 2,
        estimatedImpact:
          "Idle connections can keep compute warm and reduce connection headroom on serverless runtimes.",
        estimatedMonthlySavings: zeroSavingsEstimate(
          config,
          "Connection savings require before/after Neon active compute data.",
        ),
        evidence: [
          evidence({
            label: "Idle connections",
            measured: true,
            source: "pg_stat_activity",
            value: summary.idle_connections,
          }),
        ],
        expectedSavings:
          "Lower idle connection pressure and possible compute active-time reduction.",
        id: "reduce-idle-database-connections",
        issue: "Idle database connections exceed the configured advisory threshold.",
        proposedOptimization:
          "Audit runtime connection pooling, hidden browser polling and background jobs that may keep connections open.",
        reversibility: 0.85,
        riskLevel: "medium",
        savingsScore: 45,
        title: "Reduce idle database connections",
      }),
    );
  }

  if (
    summary.idle_in_transaction_connections >
    config.thresholds.maxIdleInTransactionConnections
  ) {
    recommendations.push(
      recommendation({
        config,
        confidence: 0.9,
        engineeringEffort: 2,
        estimatedImpact:
          "Idle-in-transaction sessions can hold locks, retain MVCC snapshots and block vacuum cleanup.",
        estimatedMonthlySavings: zeroSavingsEstimate(
          config,
          "Reliability and bloat prevention finding; savings are workload-dependent.",
        ),
        evidence: [
          evidence({
            label: "Idle-in-transaction connections",
            measured: true,
            source: "pg_stat_activity",
            value: summary.idle_in_transaction_connections,
          }),
        ],
        expectedSavings:
          "Reduced lock/bloat risk and lower chance of unnecessary compute pressure.",
        id: "fix-idle-in-transaction-sessions",
        issue:
          "The database has idle-in-transaction sessions above the configured threshold.",
        proposedOptimization:
          "Find request paths or jobs that leave transactions open; set or confirm `idle_in_transaction_session_timeout` after approval.",
        reversibility: 0.8,
        riskLevel: "medium",
        savingsScore: 55,
        title: "Fix idle-in-transaction sessions",
      }),
    );
  }
}

function addPgStatStatementsRecommendation({
  config,
  postgres,
  recommendations,
}: {
  config: AdvisorConfig;
  postgres: PostgresAnalysisSnapshot;
  recommendations: AdvisorRecommendation[];
}) {
  if (postgres.pgStatStatementsInstalled.data) return;

  recommendations.push(
    recommendation({
      config,
      confidence: 0.85,
      engineeringEffort: 1,
      estimatedImpact:
        "Without normalized statement statistics, expensive SQL and repeated query patterns are harder to identify safely.",
      estimatedMonthlySavings: zeroSavingsEstimate(
        config,
        "Enabling query statistics does not directly save cost.",
      ),
      evidence: [
        evidence({
          label: "pg_stat_statements available",
          measured: true,
          source: "pg_extension",
          value: postgres.pgStatStatementsInstalled.data ?? false,
        }),
      ],
      expectedSavings:
        "Indirect. Enables targeted query, index and caching recommendations with stronger evidence.",
      id: "enable-pg-stat-statements",
      issue: "`pg_stat_statements` is not installed or is not visible to this user.",
      proposedOptimization:
        "Enable `pg_stat_statements` only after approval and confirm the extension is supported in the Neon branch.",
      reversibility: 0.8,
      riskLevel: "low",
      savingsScore: 35,
      title: "Enable normalized query statistics",
      validationProcedure: [
        "Enable on staging first if available.",
        "Run the advisor and confirm normalized statements appear without sensitive literals.",
        "Check for measurable overhead under representative load.",
      ],
    }),
  );
}

function addStatementRecommendations({
  config,
  costModel,
  postgres,
  recommendations,
}: {
  config: AdvisorConfig;
  costModel: CostModelContext;
  postgres: PostgresAnalysisSnapshot;
  recommendations: AdvisorRecommendation[];
}) {
  const statements = postgres.statementStats.data ?? [];
  const slowStatements = statements.filter(
    (statement) => statement.mean_exec_time_ms >= config.thresholds.queryDurationMs,
  );
  const repeatedStatements = statements.filter(
    (statement) =>
      Number(statement.calls) >= config.thresholds.minQueryCallsForNPlusOneSignal &&
      statement.mean_exec_time_ms < config.thresholds.queryDurationMs,
  );
  const tempHeavyStatements = statements.filter(
    (statement) => Number(statement.temp_blks_written) > 0,
  );

  if (slowStatements.length) {
    recommendations.push(
      recommendation({
        config,
        confidence: 0.75,
        engineeringEffort: 3,
        estimatedImpact:
          "Reducing the highest mean-duration statements can lower DB CPU time and improve user-facing latency.",
        estimatedMonthlySavings: estimateComputeSavings({
          basis:
            "Estimated 5-15% compute reduction if the top expensive statements are optimized and validated.",
          config,
          currentMonthlyComputeCost: costModel.currentMonthlyComputeCost,
          percent: 0.1,
        }),
        evidence: statementEvidence(slowStatements.slice(0, 3), "Slow statement"),
        expectedSavings:
          "Lower query duration, lower compute load and lower p95 latency on affected routes.",
        id: "optimize-slow-statements",
        issue:
          "Normalized statement statistics show queries whose mean execution time exceeds the configured advisory threshold.",
        proposedOptimization:
          "Review query plans, selected columns, pagination and indexes for the top normalized statements. Do not rewrite SQL without equivalence proof and approval.",
        reversibility: 0.7,
        riskLevel: "medium",
        savingsScore: 70,
        title: "Optimize expensive queries",
      }),
    );
  }

  if (repeatedStatements.length) {
    recommendations.push(
      recommendation({
        config,
        confidence: 0.7,
        engineeringEffort: 2,
        estimatedImpact:
          "High-call low-duration statements can indicate repeated identical lookups, N+1 patterns or polling loops.",
        estimatedMonthlySavings: estimateComputeSavings({
          basis:
            "Estimated 5-20% compute reduction if high-call repeated statements are batched, cached or deduplicated safely.",
          config,
          currentMonthlyComputeCost: costModel.currentMonthlyComputeCost,
          percent: 0.1,
        }),
        evidence: statementEvidence(
          repeatedStatements.slice(0, 3),
          "Repeated statement",
        ),
        expectedSavings:
          "Fewer database round trips and lower compute active time on busy pages.",
        id: "reduce-repeated-queries",
        issue:
          "Normalized statement statistics show high-call queries that may be repeated more often than necessary.",
        proposedOptimization:
          "Map each statement to an application route, then use existing caching, batching, explicit `select`, pagination or grouped aggregates where behavior stays identical.",
        reversibility: 0.75,
        riskLevel: "medium",
        savingsScore: 75,
        title: "Reduce repeated database queries",
      }),
    );
  }

  if (tempHeavyStatements.length) {
    recommendations.push(
      recommendation({
        config,
        confidence: 0.65,
        engineeringEffort: 3,
        estimatedImpact:
          "Temporary block writes can indicate large sorts, hashes or joins spilling beyond available memory.",
        estimatedMonthlySavings: estimateComputeSavings({
          basis:
            "Estimated 3-10% compute reduction if spill-heavy statements are indexed or narrowed safely.",
          config,
          currentMonthlyComputeCost: costModel.currentMonthlyComputeCost,
          percent: 0.05,
        }),
        evidence: statementEvidence(
          tempHeavyStatements.slice(0, 3),
          "Temp-heavy statement",
        ),
        expectedSavings:
          "Less temporary IO, lower query duration and lower memory pressure.",
        id: "reduce-query-temp-blocks",
        issue:
          "Some normalized statements write temporary blocks, which may indicate avoidable sort/hash work.",
        proposedOptimization:
          "Review execution plans and indexes for temp-heavy statements before changing `work_mem` or query shape.",
        reversibility: 0.65,
        riskLevel: "medium",
        savingsScore: 45,
        title: "Review temp-heavy queries",
      }),
    );
  }
}

function addTableRecommendations({
  config,
  costModel,
  postgres,
  recommendations,
}: {
  config: AdvisorConfig;
  costModel: CostModelContext;
  postgres: PostgresAnalysisSnapshot;
  recommendations: AdvisorRecommendation[];
}) {
  const tables = postgres.tableStats.data ?? [];
  const seqScanTables = tables.filter(
    (table) =>
      Number(table.n_live_tup) >= config.thresholds.largeTableRows &&
      Number(table.seq_scan) >= config.thresholds.seqScanWarningCount &&
      table.seq_scan > table.idx_scan,
  );
  const deadTupleTables = tables.filter((table) => {
    const live = Number(table.n_live_tup);
    const dead = Number(table.n_dead_tup);
    const total = live + dead;

    return (
      total > 0 &&
      (dead / total) * 100 >= config.thresholds.deadTupleWarningPercent
    );
  });

  if (seqScanTables.length) {
    recommendations.push(
      recommendation({
        config,
        confidence: 0.65,
        engineeringEffort: 3,
        estimatedImpact:
          "Large tables with frequent sequential scans may be missing a supporting index or may be queried without selective filters.",
        estimatedMonthlySavings: estimateComputeSavings({
          basis:
            "Estimated 5-15% compute reduction if large sequential scans are replaced with validated indexed access.",
          config,
          currentMonthlyComputeCost: costModel.currentMonthlyComputeCost,
          percent: 0.08,
        }),
        evidence: tableEvidence(seqScanTables.slice(0, 5), "Sequential scan table"),
        expectedSavings:
          "Lower read IO and query duration on affected list/report routes.",
        id: "review-large-sequential-scans",
        issue:
          "PostgreSQL table statistics show large tables with more sequential scans than index scans.",
        proposedOptimization:
          "Run `EXPLAIN (ANALYZE, BUFFERS)` in staging for the matching application queries and add indexes only after plan validation and approval.",
        reversibility: 0.55,
        riskLevel: "medium",
        savingsScore: 60,
        title: "Review large sequential scans",
      }),
    );
  }

  if (deadTupleTables.length) {
    recommendations.push(
      recommendation({
        config,
        confidence: 0.7,
        engineeringEffort: 2,
        estimatedImpact:
          "High dead-tuple ratios can increase storage and slow scans until autovacuum catches up.",
        estimatedMonthlySavings: estimateStorageSavings({
          basis:
            "Estimated 3-10% storage/read efficiency improvement if dead tuples are reduced and autovacuum keeps pace.",
          config,
          currentMonthlyStorageCost: costModel.currentMonthlyStorageCost,
          percent: 0.05,
        }),
        evidence: tableEvidence(deadTupleTables.slice(0, 5), "Dead-tuple table"),
        expectedSavings:
          "Reduced bloat pressure and lower scan cost if vacuum lag is the cause.",
        id: "review-autovacuum-dead-tuples",
        issue:
          "Some tables have dead-tuple ratios above the configured threshold.",
        proposedOptimization:
          "Review update/delete-heavy workflows, autovacuum settings and long transactions before running manual maintenance.",
        reversibility: 0.75,
        riskLevel: "medium",
        savingsScore: 45,
        title: "Review autovacuum and dead tuples",
      }),
    );
  }
}

function addIndexRecommendations({
  config,
  costModel,
  postgres,
  recommendations,
}: {
  config: AdvisorConfig;
  costModel: CostModelContext;
  postgres: PostgresAnalysisSnapshot;
  recommendations: AdvisorRecommendation[];
}) {
  const unusedIndexes = (postgres.indexStats.data ?? []).filter(
    (index) =>
      index.idx_scan === BigInt(0) &&
      Number(index.index_bytes) >= config.thresholds.minUnusedIndexBytes,
  );

  if (!unusedIndexes.length) return;

  recommendations.push(
    recommendation({
      config,
      confidence: 0.45,
      engineeringEffort: 3,
      estimatedImpact:
        "Unused indexes consume storage and can add write overhead, but stats reset and rare query paths can make this misleading.",
      estimatedMonthlySavings: estimateStorageSavings({
        basis:
          "Estimated storage saving from reviewing large zero-scan indexes. No drop is automated.",
        config,
        currentMonthlyStorageCost: costModel.currentMonthlyStorageCost,
        percent: 0.05,
      }),
      evidence: indexEvidence(unusedIndexes.slice(0, 5)),
      expectedSavings:
        "Potentially lower storage and write overhead after a long observation window.",
      id: "review-unused-indexes",
      issue:
        "Large indexes show zero scans in the current PostgreSQL statistics window.",
      proposedOptimization:
        "Track these indexes over a representative period and confirm they are not used by rare reports, constraints or maintenance before any manual drop.",
      reversibility: 0.35,
      riskLevel: "high",
      rollbackProcedure: [
        "Never drop indexes automatically.",
        "Before any approved drop, capture the exact `CREATE INDEX` definition and dependent constraints.",
        "If latency or plans regress, recreate the index concurrently where supported.",
      ],
      savingsScore: 25,
      title: "Review large unused indexes",
    }),
  );
}

function addDatabaseStatRecommendations({
  config,
  costModel,
  postgres,
  recommendations,
}: {
  config: AdvisorConfig;
  costModel: CostModelContext;
  postgres: PostgresAnalysisSnapshot;
  recommendations: AdvisorRecommendation[];
}) {
  const stats = postgres.databaseStats.data;
  const lockWait = postgres.lockWaitSummary.data;
  if (!stats) return;

  const blockTotal = Number(stats.blks_hit + stats.blks_read);
  const cacheHitPercent =
    blockTotal > 0 ? (Number(stats.blks_hit) / blockTotal) * 100 : null;
  const tempBytes = Number(stats.temp_bytes);

  if (cacheHitPercent !== null && cacheHitPercent < 99) {
    recommendations.push(
      recommendation({
        config,
        confidence: 0.6,
        engineeringEffort: 3,
        estimatedImpact:
          "Lower cache hit ratios can increase disk reads and compute time, especially on large list/report queries.",
        estimatedMonthlySavings: estimateComputeSavings({
          basis:
            "Estimated 3-12% compute reduction if cache misses are caused by fixable query/index patterns.",
          config,
          currentMonthlyComputeCost: costModel.currentMonthlyComputeCost,
          percent: 0.06,
        }),
        evidence: [
          evidence({
            label: "Database cache hit ratio",
            measured: true,
            source: "pg_stat_database",
            unit: "%",
            value: round(cacheHitPercent),
          }),
        ],
        expectedSavings:
          "Lower read IO and more stable query latency if the root cause is query or index shape.",
        id: "review-cache-hit-ratio",
        issue: "Database block cache hit ratio is below the advisory threshold.",
        proposedOptimization:
          "Review largest read-heavy tables, query plans and indexes before changing compute size.",
        reversibility: 0.7,
        riskLevel: "medium",
        savingsScore: 40,
        title: "Review cache hit ratio",
      }),
    );
  }

  if (tempBytes > 100 * 1024 * 1024) {
    recommendations.push(
      recommendation({
        config,
        confidence: 0.65,
        engineeringEffort: 3,
        estimatedImpact:
          "Temporary file usage can indicate expensive sorts, hashes or materialized intermediate results.",
        estimatedMonthlySavings: estimateComputeSavings({
          basis:
            "Estimated 3-10% compute reduction if temp-file-heavy workloads are narrowed or indexed.",
          config,
          currentMonthlyComputeCost: costModel.currentMonthlyComputeCost,
          percent: 0.05,
        }),
        evidence: [
          evidence({
            label: "Temporary bytes",
            measured: true,
            source: "pg_stat_database",
            unit: "bytes",
            value: tempBytes,
          }),
        ],
        expectedSavings:
          "Lower temporary IO and less memory pressure for large reports or exports.",
        id: "review-temporary-file-usage",
        issue: "PostgreSQL has written significant temporary files in the current stats window.",
        proposedOptimization:
          "Use `pg_stat_statements`, query plans and route profiling to locate temp-heavy workloads.",
        reversibility: 0.7,
        riskLevel: "medium",
        savingsScore: 35,
        title: "Review temporary file usage",
      }),
    );
  }

  if (
    lockWait &&
    lockWait.waiting_locks > 0 &&
    Number(lockWait.max_wait_ms ?? 0) >= config.thresholds.lockWaitMs
  ) {
    recommendations.push(
      recommendation({
        config,
        confidence: 0.8,
        engineeringEffort: 2,
        estimatedImpact:
          "Lock waits can cause request latency and retry pressure; capacity changes should wait until locking is understood.",
        estimatedMonthlySavings: zeroSavingsEstimate(
          config,
          "Reliability finding; monetary savings are not estimated.",
        ),
        evidence: [
          evidence({
            label: "Waiting locks",
            measured: true,
            source: "pg_locks",
            value: lockWait.waiting_locks,
          }),
          evidence({
            label: "Max lock wait",
            measured: true,
            source: "pg_locks",
            unit: "ms",
            value: Number(lockWait.max_wait_ms ?? 0),
          }),
        ],
        expectedSavings:
          "Improved availability and latency after lock root cause is fixed.",
        id: "investigate-lock-waits",
        issue: "Current lock waits exceed the configured threshold.",
        proposedOptimization:
          "Identify blocking sessions from live database tooling and affected application workflows before changing compute or schema.",
        reversibility: 0.85,
        riskLevel: "high",
        savingsScore: 10,
        title: "Investigate lock waits before optimizing cost",
      }),
    );
  }
}

function recommendation({
  approval = "human_approval_required",
  automaticActionAllowed = false,
  confidence,
  config,
  engineeringEffort,
  estimatedImpact,
  estimatedMonthlySavings,
  evidence,
  expectedSavings,
  id,
  issue,
  performanceOrFunctionalityEffect = "No application behavior should change. Validate latency and errors before and after any approved change.",
  proposedOptimization,
  reversibility,
  riskLevel,
  rollbackProcedure = defaultRollbackProcedure(),
  savingsScore,
  title,
  validationProcedure = defaultValidationProcedure(),
}: {
  approval?: AdvisorRecommendation["approval"];
  automaticActionAllowed?: boolean;
  confidence: number;
  config: AdvisorConfig;
  engineeringEffort: number;
  estimatedImpact: string;
  estimatedMonthlySavings: AdvisorCostEstimate;
  evidence: AdvisorEvidence[];
  expectedSavings: string;
  id: string;
  issue: string;
  performanceOrFunctionalityEffect?: string;
  proposedOptimization: string;
  reversibility: number;
  riskLevel: RiskLevel;
  rollbackProcedure?: string[];
  savingsScore: number;
  title: string;
  validationProcedure?: string[];
}): AdvisorRecommendation {
  const safeSavingsScore =
    savingsScore + Math.max(0, estimatedMonthlySavings.amount ?? 0);
  const risk = riskWeight(riskLevel);
  const effort = Math.max(1, engineeringEffort);

  return {
    approval,
    automaticActionAllowed: automaticActionAllowed && config.mode === "SAFE_AUTOMATION",
    confidence,
    engineeringEffort,
    estimatedImpact,
    estimatedMonthlySavings,
    evidence,
    expectedSavings,
    id,
    issue,
    performanceOrFunctionalityEffect,
    proposedOptimization,
    reversibility,
    riskLevel,
    rollbackProcedure,
    score: round((safeSavingsScore * confidence * reversibility) / (risk * effort)),
    title,
    validationProcedure,
  };
}

function evidence(input: AdvisorEvidence): AdvisorEvidence {
  return input;
}

function statementEvidence(
  statements: PgStatementStats[],
  label: string,
): AdvisorEvidence[] {
  return statements.map((statement, index) =>
    evidence({
      detail: statement.query,
      label: `${label} ${index + 1}`,
      measured: true,
      source: "pg_stat_statements",
      value: `${Number(statement.calls)} calls, ${statement.mean_exec_time_ms}ms mean, ${statement.total_exec_time_ms}ms total`,
    }),
  );
}

function tableEvidence(tables: PgTableStats[], label: string): AdvisorEvidence[] {
  return tables.map((table, index) =>
    evidence({
      detail: `${table.table_name}: seq_scan=${table.seq_scan.toString()}, idx_scan=${table.idx_scan.toString()}, live=${table.n_live_tup.toString()}, dead=${table.n_dead_tup.toString()}`,
      label: `${label} ${index + 1}`,
      measured: true,
      source: "pg_stat_user_tables",
      value: table.table_name,
    }),
  );
}

function indexEvidence(indexes: PgIndexStats[]): AdvisorEvidence[] {
  return indexes.map((index, item) =>
    evidence({
      detail: `${index.table_name}.${index.index_name}: idx_scan=${index.idx_scan.toString()}, size=${formatBytes(Number(index.index_bytes))}`,
      label: `Zero-scan index ${item + 1}`,
      measured: true,
      source: "pg_stat_user_indexes",
      value: index.index_name,
    }),
  );
}

function recordsFrom(data: unknown, collectionKey: string): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return [];

  const collection = data[collectionKey];

  return Array.isArray(collection) ? collection.filter(isRecord) : [];
}

function numberField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return null;
}

function booleanField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (["true", "1", "yes"].includes(value.toLowerCase())) return true;
      if (["false", "0", "no"].includes(value.toLowerCase())) return false;
    }
  }

  return false;
}

function dateField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value !== "string") continue;

    const date = new Date(value);

    if (!Number.isNaN(date.getTime())) return date;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function riskWeight(riskLevel: RiskLevel) {
  if (riskLevel === "high") return 4;
  if (riskLevel === "medium") return 2;

  return 1;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${round(value)} ${units[unitIndex]}`;
}
