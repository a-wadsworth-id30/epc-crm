import type { AdvisorGuardrails, ValidationSummary } from "./types";

export function buildValidationSummary(
  guardrails: AdvisorGuardrails,
): ValidationSummary {
  return {
    automaticRollbackRule: [
      `rollback if p95 latency increases by more than ${guardrails.p95LatencyIncreaseLimitPercent}%`,
      `or application error rate increases by more than ${guardrails.errorRateIncreaseLimitPoints} percentage point(s)`,
      `or database connection saturation exceeds ${guardrails.activeConnectionSaturationPercent}%`,
      `or database CPU exceeds ${guardrails.databaseCpuSaturationPercent}% after a change`,
    ].join(" "),
    guardrails,
    monitor: [
      "GET /api/health status and database field",
      "Application error rate",
      "p50, p95 and p99 request latency",
      "Neon CPU and memory pressure",
      "Active connections and connection saturation",
      "Slow query count and duration",
      "Lock wait time",
      "Background job error rate",
    ],
  };
}

export function defaultValidationProcedure() {
  return [
    "Capture a pre-change report from `npm run neon:advisor`.",
    "Run `npm run typecheck` and `npm run lint` for code changes.",
    "Validate the relevant workflow in staging or a canary release.",
    "Compare p50, p95, p99 latency, error rate, active connections and slow-query metrics against baseline.",
    "Monitor production for at least one representative traffic window before closing the recommendation.",
  ];
}

export function defaultRollbackProcedure() {
  return [
    "Restore the previous configuration or code commit.",
    "Redeploy the previous known-good build if application behavior changes.",
    "Re-run `/api/health` and the affected user workflow.",
    "Compare post-rollback metrics against the pre-change baseline.",
  ];
}
