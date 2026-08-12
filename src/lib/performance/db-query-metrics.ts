type DatabaseQueryMetric = {
  count: number;
  label: string;
  lastSeenAt: string;
  maxMs: number;
  slowCount: number;
  totalMs: number;
};

export type DatabaseQueryMetricRow = DatabaseQueryMetric & {
  averageMs: number;
};

export type SlowDatabaseQuerySample = {
  durationMs: number;
  label: string;
  occurredAt: string;
};

export type DatabaseQueryPerformanceSnapshot = {
  enabled: boolean;
  labels: DatabaseQueryMetricRow[];
  metricLimit: number;
  slowQueries: number;
  slowSamples: SlowDatabaseQuerySample[];
  slowThresholdMs: number;
  totalQueries: number;
};

type DatabaseQueryMetricsState = {
  labels: Map<string, DatabaseQueryMetric>;
  slowSamples: SlowDatabaseQuerySample[];
  slowQueries: number;
  totalQueries: number;
};

const globalForDatabaseQueryMetrics = globalThis as unknown as {
  __id30DatabaseQueryMetrics?: DatabaseQueryMetricsState;
};

function state() {
  globalForDatabaseQueryMetrics.__id30DatabaseQueryMetrics ??= {
    labels: new Map<string, DatabaseQueryMetric>(),
    slowSamples: [],
    slowQueries: 0,
    totalQueries: 0,
  };

  return globalForDatabaseQueryMetrics.__id30DatabaseQueryMetrics;
}

function positiveIntegerEnv(key: string, fallback: number) {
  const value = Number.parseInt(process.env[key] ?? "", 10);

  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function thresholdEnv(key: string, fallback: number) {
  const value = Number.parseInt(process.env[key] ?? "", 10);

  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function roundMs(value: number) {
  return Math.round(value * 10) / 10;
}

function cleanQueryLabel(label: string) {
  const cleaned = label.replace(/[^a-zA-Z0-9$_.:-]/g, "").slice(0, 80);

  return cleaned || "unknown.query";
}

function slowSampleLimit() {
  return positiveIntegerEnv("DATABASE_QUERY_SLOW_SAMPLE_LIMIT", 20);
}

function shouldLogSlowDatabaseQueries() {
  return process.env.DATABASE_QUERY_SLOW_LOGGING_ENABLED === "true";
}

export function databaseQueryTimingEnabled() {
  return (
    process.env.DATABASE_QUERY_TIMING_ENABLED === "true" ||
    process.env.PERFORMANCE_LOGGING_ENABLED === "true"
  );
}

export function databaseQuerySlowThresholdMs() {
  return thresholdEnv(
    "DATABASE_QUERY_SLOW_THRESHOLD_MS",
    thresholdEnv("PERFORMANCE_LOGGING_THRESHOLD_MS", 250),
  );
}

export function databaseQueryMetricLimit() {
  return positiveIntegerEnv("DATABASE_QUERY_METRIC_LIMIT", 80);
}

export function databaseQueryLabel(model: string | undefined, operation: string) {
  return cleanQueryLabel(`${model ?? "prisma"}.${operation}`);
}

export function recordDatabaseQueryTiming({
  durationMs,
  label,
}: {
  durationMs: number;
  label: string;
}) {
  if (!databaseQueryTimingEnabled() || !Number.isFinite(durationMs)) return;

  const metrics = state();
  const safeLabel = cleanQueryLabel(label);
  const roundedDurationMs = roundMs(Math.max(0, durationMs));
  const occurredAt = new Date().toISOString();
  const existing = metrics.labels.get(safeLabel);
  const metric =
    existing ??
    ({
      count: 0,
      label: safeLabel,
      lastSeenAt: occurredAt,
      maxMs: 0,
      slowCount: 0,
      totalMs: 0,
    } satisfies DatabaseQueryMetric);
  const slow = roundedDurationMs >= databaseQuerySlowThresholdMs();

  metric.count += 1;
  metric.lastSeenAt = occurredAt;
  metric.maxMs = roundMs(Math.max(metric.maxMs, roundedDurationMs));
  metric.slowCount += slow ? 1 : 0;
  metric.totalMs = roundMs(metric.totalMs + roundedDurationMs);
  metrics.labels.set(safeLabel, metric);
  metrics.totalQueries += 1;

  if (slow) {
    metrics.slowQueries += 1;
    metrics.slowSamples.unshift({
      durationMs: roundedDurationMs,
      label: safeLabel,
      occurredAt,
    });
    metrics.slowSamples = metrics.slowSamples.slice(0, slowSampleLimit());

    if (shouldLogSlowDatabaseQueries()) {
      console.info(`[performance:database] ${safeLabel} ${roundedDurationMs}ms`);
    }
  }

  pruneOldLabels(metrics);
}

export function databaseQueryPerformanceSnapshot(): DatabaseQueryPerformanceSnapshot {
  const metrics = state();
  const labels = Array.from(metrics.labels.values())
    .map((metric) => ({
      ...metric,
      averageMs: metric.count ? roundMs(metric.totalMs / metric.count) : 0,
    }))
    .sort((first, second) => {
      if (second.totalMs !== first.totalMs) return second.totalMs - first.totalMs;
      if (second.maxMs !== first.maxMs) return second.maxMs - first.maxMs;

      return second.count - first.count;
    })
    .slice(0, databaseQueryMetricLimit());

  return {
    enabled: databaseQueryTimingEnabled(),
    labels,
    metricLimit: databaseQueryMetricLimit(),
    slowQueries: metrics.slowQueries,
    slowSamples: metrics.slowSamples.slice(0, slowSampleLimit()),
    slowThresholdMs: databaseQuerySlowThresholdMs(),
    totalQueries: metrics.totalQueries,
  };
}

export function resetDatabaseQueryPerformance() {
  const metrics = state();
  metrics.labels.clear();
  metrics.slowSamples = [];
  metrics.slowQueries = 0;
  metrics.totalQueries = 0;

  return databaseQueryPerformanceSnapshot();
}

function pruneOldLabels(metrics: DatabaseQueryMetricsState) {
  const limit = databaseQueryMetricLimit();

  if (metrics.labels.size <= limit) return;

  const labelsByAge = Array.from(metrics.labels.values()).sort((first, second) =>
    first.lastSeenAt.localeCompare(second.lastSeenAt),
  );

  for (const label of labelsByAge.slice(0, metrics.labels.size - limit)) {
    metrics.labels.delete(label.label);
  }
}
