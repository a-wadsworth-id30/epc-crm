import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  databaseQueryLabel,
  databaseQueryPerformanceSnapshot,
  recordDatabaseQueryTiming,
  resetDatabaseQueryPerformance,
} from "../src/lib/performance/db-query-metrics";

const managedEnvKeys = [
  "DATABASE_QUERY_TIMING_ENABLED",
  "DATABASE_QUERY_SLOW_THRESHOLD_MS",
  "DATABASE_QUERY_METRIC_LIMIT",
  "DATABASE_QUERY_SLOW_SAMPLE_LIMIT",
  "DATABASE_QUERY_SLOW_LOGGING_ENABLED",
  "PERFORMANCE_LOGGING_ENABLED",
  "PERFORMANCE_LOGGING_THRESHOLD_MS",
] as const;

const originalEnv = new Map(
  managedEnvKeys.map((key) => [key, process.env[key]]),
);

function clearManagedEnv() {
  for (const key of managedEnvKeys) {
    delete process.env[key];
  }
}

function restoreManagedEnv() {
  for (const key of managedEnvKeys) {
    const value = originalEnv.get(key);

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe("database query metrics", () => {
  afterEach(() => {
    resetDatabaseQueryPerformance();
    restoreManagedEnv();
  });

  it("does not record query timings while disabled", () => {
    clearManagedEnv();
    resetDatabaseQueryPerformance();

    recordDatabaseQueryTiming({ label: "Contact.findMany", durationMs: 120 });

    const snapshot = databaseQueryPerformanceSnapshot();

    assert.equal(snapshot.enabled, false);
    assert.equal(snapshot.totalQueries, 0);
    assert.equal(snapshot.slowQueries, 0);
    assert.equal(snapshot.labels.length, 0);
  });

  it("aggregates safe query label counts and slow samples", () => {
    clearManagedEnv();
    process.env.DATABASE_QUERY_TIMING_ENABLED = "true";
    process.env.DATABASE_QUERY_SLOW_THRESHOLD_MS = "50";
    resetDatabaseQueryPerformance();

    recordDatabaseQueryTiming({ label: "Contact.findMany", durationMs: 12 });
    recordDatabaseQueryTiming({ label: "Contact.findMany", durationMs: 75.38 });
    recordDatabaseQueryTiming({ label: "SalesOpportunity.count", durationMs: 125 });

    const snapshot = databaseQueryPerformanceSnapshot();
    const contactMetric = snapshot.labels.find(
      (metric) => metric.label === "Contact.findMany",
    );
    const salesMetric = snapshot.labels.find(
      (metric) => metric.label === "SalesOpportunity.count",
    );

    assert.equal(snapshot.enabled, true);
    assert.equal(snapshot.totalQueries, 3);
    assert.equal(snapshot.slowQueries, 2);
    assert.equal(snapshot.slowSamples.length, 2);
    assert.equal(contactMetric?.count, 2);
    assert.equal(contactMetric?.slowCount, 1);
    assert.equal(contactMetric?.averageMs, 43.7);
    assert.equal(contactMetric?.maxMs, 75.4);
    assert.equal(salesMetric?.count, 1);
    assert.equal(salesMetric?.slowCount, 1);
  });

  it("sanitizes labels and resets process-local state", () => {
    clearManagedEnv();
    process.env.DATABASE_QUERY_TIMING_ENABLED = "true";
    process.env.DATABASE_QUERY_SLOW_THRESHOLD_MS = "1";
    resetDatabaseQueryPerformance();

    assert.equal(databaseQueryLabel("Contact value", "find Many?"), "Contactvalue.findMany");

    recordDatabaseQueryTiming({
      label: "Contact.findMany email=person@example.com",
      durationMs: 10,
    });

    const beforeReset = databaseQueryPerformanceSnapshot();
    assert.equal(beforeReset.totalQueries, 1);
    assert.equal(beforeReset.labels[0]?.label.includes("@"), false);

    const afterReset = resetDatabaseQueryPerformance();
    assert.equal(afterReset.totalQueries, 0);
    assert.equal(afterReset.slowQueries, 0);
    assert.equal(afterReset.labels.length, 0);
    assert.equal(afterReset.slowSamples.length, 0);
  });
});
