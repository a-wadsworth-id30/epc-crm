import type { AdvisorConfig, AdvisorMode } from "./types";

const defaultOutputPath = ".neon-advisor/latest-report.json";

export function readAdvisorConfig(
  env: NodeJS.ProcessEnv = process.env,
): AdvisorConfig {
  return {
    costRates: {
      branchMonthlyCost: nullableNumberEnv(env, "NEON_ADVISOR_BRANCH_MONTHLY_COST"),
      computeHourlyCost: nullableNumberEnv(env, "NEON_ADVISOR_COMPUTE_HOURLY_COST"),
      currency: stringEnv(env, "NEON_ADVISOR_CURRENCY", "GBP"),
      storageGbMonthCost: nullableNumberEnv(
        env,
        "NEON_ADVISOR_STORAGE_GB_MONTH_COST",
      ),
    },
    mode: advisorModeEnv(env),
    neon: {
      apiKeyPresent: Boolean(env.NEON_API_KEY?.trim()),
      apiUrl: stringEnv(env, "NEON_API_URL", "https://console.neon.tech/api/v2"),
      orgId: optionalStringEnv(env, "NEON_ORG_ID"),
      projectId: optionalStringEnv(env, "NEON_PROJECT_ID"),
      requestTimeoutMs: numberEnv(env, "NEON_ADVISOR_REQUEST_TIMEOUT_MS", 10_000),
    },
    outputPath: outputPathEnv(env),
    thresholds: {
      activeConnectionSaturationPercent: numberEnv(
        env,
        "NEON_ADVISOR_CONNECTION_SATURATION_PERCENT",
        80,
      ),
      branchReviewAgeDays: numberEnv(env, "NEON_ADVISOR_BRANCH_REVIEW_AGE_DAYS", 14),
      databaseCpuSaturationPercent: numberEnv(
        env,
        "NEON_ADVISOR_DB_CPU_SATURATION_PERCENT",
        80,
      ),
      deadTupleWarningPercent: numberEnv(
        env,
        "NEON_ADVISOR_DEAD_TUPLE_WARNING_PERCENT",
        20,
      ),
      errorRateIncreaseLimitPoints: numberEnv(
        env,
        "NEON_ADVISOR_ERROR_RATE_INCREASE_LIMIT_POINTS",
        1,
      ),
      largeTableRows: numberEnv(env, "NEON_ADVISOR_LARGE_TABLE_ROWS", 10_000),
      lockWaitMs: numberEnv(env, "NEON_ADVISOR_LOCK_WAIT_MS", 1_000),
      maxIdleConnections: numberEnv(env, "NEON_ADVISOR_MAX_IDLE_CONNECTIONS", 10),
      maxIdleInTransactionConnections: numberEnv(
        env,
        "NEON_ADVISOR_MAX_IDLE_IN_TRANSACTION_CONNECTIONS",
        0,
      ),
      memoryPressurePercent: numberEnv(
        env,
        "NEON_ADVISOR_MEMORY_PRESSURE_PERCENT",
        85,
      ),
      minQueryCallsForNPlusOneSignal: numberEnv(
        env,
        "NEON_ADVISOR_MIN_QUERY_CALLS_FOR_N_PLUS_ONE_SIGNAL",
        1_000,
      ),
      minUnusedIndexBytes: numberEnv(
        env,
        "NEON_ADVISOR_MIN_UNUSED_INDEX_BYTES",
        10 * 1024 * 1024,
      ),
      p50LatencyIncreaseLimitPercent: numberEnv(
        env,
        "NEON_ADVISOR_P50_LATENCY_INCREASE_LIMIT_PERCENT",
        10,
      ),
      p95LatencyIncreaseLimitPercent: numberEnv(
        env,
        "NEON_ADVISOR_P95_LATENCY_INCREASE_LIMIT_PERCENT",
        10,
      ),
      p99LatencyIncreaseLimitPercent: numberEnv(
        env,
        "NEON_ADVISOR_P99_LATENCY_INCREASE_LIMIT_PERCENT",
        10,
      ),
      queryDurationMs: numberEnv(env, "NEON_ADVISOR_QUERY_DURATION_MS", 500),
      seqScanWarningCount: numberEnv(env, "NEON_ADVISOR_SEQ_SCAN_WARNING_COUNT", 100),
      targetMaxCu: numberEnv(env, "NEON_ADVISOR_TARGET_MAX_CU", 2),
      targetMinCu: numberEnv(env, "NEON_ADVISOR_TARGET_MIN_CU", 0),
      targetSuspendSeconds: numberEnv(
        env,
        "NEON_ADVISOR_TARGET_SUSPEND_SECONDS",
        300,
      ),
    },
  };
}

function advisorModeEnv(env: NodeJS.ProcessEnv): AdvisorMode {
  const requested = env.NEON_ADVISOR_MODE?.trim();

  if (
    requested === "APPROVAL_REQUIRED" ||
    requested === "SAFE_AUTOMATION" ||
    requested === "READ_ONLY_ADVISOR"
  ) {
    return requested;
  }

  return "READ_ONLY_ADVISOR";
}

function outputPathEnv(env: NodeJS.ProcessEnv) {
  const value = env.NEON_ADVISOR_OUTPUT_PATH?.trim();

  if (!value) return defaultOutputPath;
  if (["none", "stdout", "false", "0"].includes(value.toLowerCase())) return null;

  return value;
}

function optionalStringEnv(env: NodeJS.ProcessEnv, key: string) {
  const value = env[key]?.trim();

  return value ? value : null;
}

function stringEnv(env: NodeJS.ProcessEnv, key: string, fallback: string) {
  const value = env[key]?.trim();

  return value || fallback;
}

function nullableNumberEnv(env: NodeJS.ProcessEnv, key: string) {
  const value = Number(env[key]);

  return Number.isFinite(value) && value >= 0 ? value : null;
}

function numberEnv(env: NodeJS.ProcessEnv, key: string, fallback: number) {
  const value = Number(env[key]);

  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
