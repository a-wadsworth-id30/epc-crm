import type { PrismaClient } from "@prisma/client";

export type AdvisorMode =
  | "READ_ONLY_ADVISOR"
  | "APPROVAL_REQUIRED"
  | "SAFE_AUTOMATION";

export type AvailabilityStatus = "available" | "skipped" | "unavailable";

export type RiskLevel = "low" | "medium" | "high";

export type ApprovalRequirement =
  | "read_only"
  | "human_approval_required"
  | "not_automatable";

export type EvidenceValue = string | number | boolean | null;

export type AdvisorCapability<T> = {
  data: T | null;
  error?: string;
  name: string;
  source: string;
  status: AvailabilityStatus;
};

export type AdvisorCostEstimate = {
  amount: number | null;
  basis: string;
  currency: string;
  exact: boolean;
  measured: boolean;
};

export type AdvisorEvidence = {
  detail?: string;
  label: string;
  measured: boolean;
  source: string;
  unit?: string;
  value: EvidenceValue;
};

export type AdvisorRecommendation = {
  approval: ApprovalRequirement;
  automaticActionAllowed: boolean;
  confidence: number;
  engineeringEffort: number;
  estimatedImpact: string;
  estimatedMonthlySavings: AdvisorCostEstimate;
  evidence: AdvisorEvidence[];
  expectedSavings: string;
  id: string;
  issue: string;
  performanceOrFunctionalityEffect: string;
  proposedOptimization: string;
  reversibility: number;
  riskLevel: RiskLevel;
  rollbackProcedure: string[];
  score: number;
  title: string;
  validationProcedure: string[];
};

export type AdvisorGuardrails = {
  activeConnectionSaturationPercent: number;
  databaseCpuSaturationPercent: number;
  errorRateIncreaseLimitPoints: number;
  lockWaitMs: number;
  memoryPressurePercent: number;
  p50LatencyIncreaseLimitPercent: number;
  p95LatencyIncreaseLimitPercent: number;
  p99LatencyIncreaseLimitPercent: number;
  queryDurationMs: number;
};

export type AdvisorThresholds = AdvisorGuardrails & {
  branchReviewAgeDays: number;
  deadTupleWarningPercent: number;
  largeTableRows: number;
  maxIdleConnections: number;
  maxIdleInTransactionConnections: number;
  minQueryCallsForNPlusOneSignal: number;
  minUnusedIndexBytes: number;
  seqScanWarningCount: number;
  targetMaxCu: number;
  targetMinCu: number;
};

export type AdvisorCostRates = {
  branchMonthlyCost: number | null;
  computeHourlyCost: number | null;
  currency: string;
  storageGbMonthCost: number | null;
};

export type AdvisorConfig = {
  costRates: AdvisorCostRates;
  mode: AdvisorMode;
  neon: {
    apiKeyPresent: boolean;
    apiUrl: string;
    orgId: string | null;
    projectId: string | null;
    requestTimeoutMs: number;
  };
  outputPath: string | null;
  thresholds: AdvisorThresholds;
};

export type RepositoryProfile = {
  app: {
    name: string | null;
    nextVersion: string | null;
    prismaVersion: string | null;
    scripts: string[];
  };
  database: {
    databaseUrlPresent: boolean;
    migrateDatabaseUrlPresent: boolean;
    prismaConnectionLimit: string | null;
    prismaPoolTimeout: string | null;
    runtimeConnectionKind: "neon-pooler" | "neon-direct" | "postgres" | "unknown";
  };
  deployment: {
    netlifyBuildCommand: string | null;
    nodeVersion: string | null;
    scheduledFunctions: string[];
  };
  observability: {
    databaseQueryTimingConfigured: boolean;
    databaseQueryTimingEnabled: boolean;
    performanceLoggingConfigured: boolean;
    webVitalsConfigured: boolean;
  };
  tests: {
    commands: string[];
    unitTestFiles: number;
  };
};

export type PgSettingRow = {
  context: string;
  name: string;
  setting: string;
  source: string;
  unit: string | null;
};

export type PgDatabaseOverview = {
  collected_at: Date;
  database_size_bytes: bigint;
  database_name: string;
  server_version: string;
};

export type PgDatabaseStats = {
  blk_read_time: number;
  blk_write_time: number;
  blks_hit: bigint;
  blks_read: bigint;
  conflicts: bigint;
  deadlocks: bigint;
  numbackends: number;
  temp_bytes: bigint;
  temp_files: bigint;
  tup_deleted: bigint;
  tup_fetched: bigint;
  tup_inserted: bigint;
  tup_returned: bigint;
  tup_updated: bigint;
  xact_commit: bigint;
  xact_rollback: bigint;
};

export type PgConnectionSummary = {
  active_connections: number;
  current_database_connections: number;
  idle_connections: number;
  idle_in_transaction_connections: number;
  max_connections: number;
  waiting_connections: number;
};

export type PgActivitySummary = {
  count: number;
  max_state_age_ms: bigint | null;
  state: string | null;
  wait_event_type: string | null;
};

export type PgLockSummary = {
  count: number;
  granted: boolean;
  mode: string;
};

export type PgLockWaitSummary = {
  max_wait_ms: bigint | null;
  waiting_locks: number;
};

export type PgTableStats = {
  index_bytes: bigint;
  idx_scan: bigint;
  last_analyze: Date | null;
  last_autoanalyze: Date | null;
  last_autovacuum: Date | null;
  last_vacuum: Date | null;
  n_dead_tup: bigint;
  n_live_tup: bigint;
  n_tup_del: bigint;
  n_tup_ins: bigint;
  n_tup_upd: bigint;
  seq_scan: bigint;
  seq_tup_read: bigint;
  table_bytes: bigint;
  table_name: string;
  total_bytes: bigint;
};

export type PgIndexStats = {
  idx_scan: bigint;
  idx_tup_fetch: bigint;
  idx_tup_read: bigint;
  index_bytes: bigint;
  index_name: string;
  table_name: string;
};

export type PgIoStats = {
  heap_blks_hit: bigint;
  heap_blks_read: bigint;
  idx_blks_hit: bigint;
  idx_blks_read: bigint;
  table_name: string;
  toast_blks_hit: bigint;
  toast_blks_read: bigint;
};

export type PgStatementStats = {
  calls: bigint;
  max_exec_time_ms: number;
  mean_exec_time_ms: number;
  query: string;
  queryid: string;
  rows: bigint;
  shared_blks_hit: bigint;
  shared_blks_read: bigint;
  temp_blks_written: bigint;
  total_exec_time_ms: number;
};

export type PgWalStats = {
  stats_reset: Date | null;
  wal_bytes: bigint;
  wal_buffers_full: bigint;
  wal_records: bigint;
};

export type PostgresAnalysisSnapshot = {
  activitySummary: AdvisorCapability<PgActivitySummary[]>;
  capabilities: AdvisorCapability<unknown>[];
  connectionSummary: AdvisorCapability<PgConnectionSummary>;
  databaseOverview: AdvisorCapability<PgDatabaseOverview>;
  databaseStats: AdvisorCapability<PgDatabaseStats>;
  indexStats: AdvisorCapability<PgIndexStats[]>;
  ioStats: AdvisorCapability<PgIoStats[]>;
  lockSummary: AdvisorCapability<PgLockSummary[]>;
  lockWaitSummary: AdvisorCapability<PgLockWaitSummary>;
  pgStatStatementsInstalled: AdvisorCapability<boolean>;
  settings: AdvisorCapability<PgSettingRow[]>;
  statementStats: AdvisorCapability<PgStatementStats[]>;
  tableStats: AdvisorCapability<PgTableStats[]>;
  walStats: AdvisorCapability<PgWalStats>;
};

export type NeonApiSnapshot = {
  branchConsumption: AdvisorCapability<unknown>;
  branches: AdvisorCapability<unknown>;
  endpoints: AdvisorCapability<unknown>;
  operations: AdvisorCapability<unknown>;
  project: AdvisorCapability<unknown>;
  projectConsumption: AdvisorCapability<unknown>;
};

export type CostModelContext = {
  computedFrom: string[];
  currentMonthlyComputeCost: AdvisorCostEstimate;
  currentMonthlyStorageCost: AdvisorCostEstimate;
  databaseSizeGb: number | null;
  monthlyComputeCuHours: number | null;
};

export type ValidationSummary = {
  automaticRollbackRule: string;
  guardrails: AdvisorGuardrails;
  monitor: string[];
};

export type ChangeExecutionSummary = {
  allowListedActions: string[];
  enabled: boolean;
  mode: AdvisorMode;
  reason: string;
};

export type RollbackSummary = {
  ready: boolean;
  requirements: string[];
};

export type NeonOptimizationReport = {
  changeExecution: ChangeExecutionSummary;
  config: AdvisorConfig;
  costModel: CostModelContext;
  generatedAt: string;
  mode: AdvisorMode;
  neon: NeonApiSnapshot;
  postgres: PostgresAnalysisSnapshot;
  recommendations: AdvisorRecommendation[];
  repository: RepositoryProfile;
  rollback: RollbackSummary;
  validation: ValidationSummary;
};

export type AdvisorRuntime = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  prisma?: Pick<PrismaClient, "$queryRawUnsafe"> | null;
};
