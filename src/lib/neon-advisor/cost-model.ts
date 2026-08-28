import type {
  AdvisorConfig,
  AdvisorCostEstimate,
  CostModelContext,
  NeonApiSnapshot,
  PostgresAnalysisSnapshot,
} from "./types";

const bytesPerGb = 1024 ** 3;

export function buildCostModelContext({
  config,
  neon,
  postgres,
}: {
  config: AdvisorConfig;
  neon: NeonApiSnapshot;
  postgres: PostgresAnalysisSnapshot;
}): CostModelContext {
  const computedFrom: string[] = [];
  const monthlyComputeCuSeconds =
    sumMetricValue(neon.projectConsumption.data, "compute_unit_seconds") ??
    sumMetricValue(neon.projectConsumption.data, "compute_time_seconds");
  const monthlyComputeCuHours =
    monthlyComputeCuSeconds === null ? null : monthlyComputeCuSeconds / 3600;
  const databaseSizeGb = postgres.databaseOverview.data
    ? Number(postgres.databaseOverview.data.database_size_bytes) / bytesPerGb
    : null;

  if (monthlyComputeCuHours !== null) {
    computedFrom.push("Neon project consumption history");
  }

  if (databaseSizeGb !== null) {
    computedFrom.push("PostgreSQL pg_database_size");
  }

  return {
    computedFrom,
    currentMonthlyComputeCost: estimateCurrentMonthlyComputeCost({
      config,
      monthlyComputeCuHours,
    }),
    currentMonthlyStorageCost: estimateCurrentMonthlyStorageCost({
      config,
      databaseSizeGb,
    }),
    databaseSizeGb,
    monthlyComputeCuHours,
  };
}

export function zeroSavingsEstimate(config: AdvisorConfig, basis: string) {
  return {
    amount: null,
    basis,
    currency: config.costRates.currency,
    exact: false,
    measured: false,
  } satisfies AdvisorCostEstimate;
}

export function estimateComputeSavings({
  basis,
  config,
  currentMonthlyComputeCost,
  percent,
}: {
  basis: string;
  config: AdvisorConfig;
  currentMonthlyComputeCost: AdvisorCostEstimate;
  percent: number;
}): AdvisorCostEstimate {
  if (currentMonthlyComputeCost.amount === null) {
    return zeroSavingsEstimate(
      config,
      `${basis} Set NEON_ADVISOR_COMPUTE_HOURLY_COST and Neon consumption access for a monetary estimate.`,
    );
  }

  return {
    amount: roundCurrency(currentMonthlyComputeCost.amount * clampPercent(percent)),
    basis,
    currency: currentMonthlyComputeCost.currency,
    exact: false,
    measured: currentMonthlyComputeCost.measured,
  };
}

export function estimateStorageSavings({
  basis,
  config,
  currentMonthlyStorageCost,
  percent,
}: {
  basis: string;
  config: AdvisorConfig;
  currentMonthlyStorageCost: AdvisorCostEstimate;
  percent: number;
}): AdvisorCostEstimate {
  if (currentMonthlyStorageCost.amount === null) {
    return zeroSavingsEstimate(
      config,
      `${basis} Set NEON_ADVISOR_STORAGE_GB_MONTH_COST for a monetary estimate.`,
    );
  }

  return {
    amount: roundCurrency(currentMonthlyStorageCost.amount * clampPercent(percent)),
    basis,
    currency: currentMonthlyStorageCost.currency,
    exact: false,
    measured: currentMonthlyStorageCost.measured,
  };
}

function estimateCurrentMonthlyComputeCost({
  config,
  monthlyComputeCuHours,
}: {
  config: AdvisorConfig;
  monthlyComputeCuHours: number | null;
}): AdvisorCostEstimate {
  if (
    monthlyComputeCuHours === null ||
    config.costRates.computeHourlyCost === null
  ) {
    return zeroSavingsEstimate(
      config,
      "Compute cost estimate unavailable without Neon consumption data and NEON_ADVISOR_COMPUTE_HOURLY_COST.",
    );
  }

  return {
    amount: roundCurrency(monthlyComputeCuHours * config.costRates.computeHourlyCost),
    basis: "Monthly CU-hour usage multiplied by configured compute hourly rate.",
    currency: config.costRates.currency,
    exact: false,
    measured: true,
  };
}

function estimateCurrentMonthlyStorageCost({
  config,
  databaseSizeGb,
}: {
  config: AdvisorConfig;
  databaseSizeGb: number | null;
}): AdvisorCostEstimate {
  if (databaseSizeGb === null || config.costRates.storageGbMonthCost === null) {
    return zeroSavingsEstimate(
      config,
      "Storage cost estimate unavailable without pg_database_size and NEON_ADVISOR_STORAGE_GB_MONTH_COST.",
    );
  }

  return {
    amount: roundCurrency(databaseSizeGb * config.costRates.storageGbMonthCost),
    basis: "PostgreSQL database size multiplied by configured storage GB-month rate.",
    currency: config.costRates.currency,
    exact: false,
    measured: true,
  };
}

export function sumMetricValue(data: unknown, metricName: string): number | null {
  const total = sumMetricValueInternal(data, metricName);

  return total === 0 ? null : total;
}

function sumMetricValueInternal(data: unknown, metricName: string): number {
  if (Array.isArray(data)) {
    return data.reduce(
      (total, item) => total + sumMetricValueInternal(item, metricName),
      0,
    );
  }

  if (!data || typeof data !== "object") return 0;

  let total = 0;
  const record = data as Record<string, unknown>;

  for (const [key, value] of Object.entries(record)) {
    if (key === metricName) {
      total += numericValue(value);
      continue;
    }

    if (
      key === "metric" ||
      key === "metric_name" ||
      key === "name" ||
      key === "type"
    ) {
      if (value === metricName) {
        total += numericValue(record.value);
        total += numericValue(record.usage);
        total += numericValue(record.total);
      }
      continue;
    }

    total += sumMetricValueInternal(value, metricName);
  }

  return total;
}

function numericValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function clampPercent(percent: number) {
  if (!Number.isFinite(percent)) return 0;

  return Math.min(1, Math.max(0, percent));
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}
