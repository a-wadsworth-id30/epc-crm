import { toJsonSafe } from "./safety";
import type {
  AdvisorCapability,
  AdvisorCostEstimate,
  NeonOptimizationReport,
} from "./types";

export function formatNeonOptimizationReport(report: NeonOptimizationReport) {
  const recommendations = report.recommendations.slice(0, 10);
  const savings = totalEstimatedSavings(report.recommendations);

  return [
    "Neon Optimization Report",
    "========================",
    `Generated: ${report.generatedAt}`,
    `Mode: ${report.mode}`,
    "",
    "Current resource profile:",
    `- App: ${report.repository.app.name ?? "unknown"} on Next ${report.repository.app.nextVersion ?? "unknown"} with Prisma ${report.repository.app.prismaVersion ?? "unknown"}`,
    `- Runtime database connection: ${report.repository.database.runtimeConnectionKind}`,
    `- Runtime DATABASE_URL present: ${yesNo(report.repository.database.databaseUrlPresent)}`,
    `- MIGRATE_DATABASE_URL present: ${yesNo(report.repository.database.migrateDatabaseUrlPresent)}`,
    `- Netlify build command: ${report.repository.deployment.netlifyBuildCommand ?? "unknown"}`,
    `- Database query timing enabled: ${yesNo(report.repository.observability.databaseQueryTimingEnabled)}`,
    `- PostgreSQL: ${capabilityLabel(report.postgres.databaseOverview)}`,
    ...postgresProfileLines(report),
    ...neonProfileLines(report),
    "",
    "Top cost drivers:",
    ...costDriverLines(report),
    "",
    "Recommendations:",
    ...recommendationLines(recommendations),
    "",
    "Estimated savings:",
    `- Known monthly estimate: ${formatSavings(savings, report.config.costRates.currency)}`,
    "- Exact billing savings require Neon billing data and configured rate inputs.",
    "",
    "Risk:",
    `- Highest recommendation risk: ${highestRisk(report.recommendations)}`,
    "- Production execution is disabled in this milestone.",
    "",
    "Required approvals:",
    ...approvalLines(report),
    "",
    "Metrics to monitor:",
    ...report.validation.monitor.map((metric) => `- ${metric}`),
    "",
    "Automatic rollback rule:",
    `- ${report.validation.automaticRollbackRule}`,
  ].join("\n");
}

export function serializableNeonOptimizationReport(
  report: NeonOptimizationReport,
) {
  return toJsonSafe(report);
}

function postgresProfileLines(report: NeonOptimizationReport) {
  const lines: string[] = [];
  const overview = report.postgres.databaseOverview.data;
  const connections = report.postgres.connectionSummary.data;
  const databaseStats = report.postgres.databaseStats.data;

  if (overview) {
    lines.push(`- PostgreSQL version: ${overview.server_version}`);
    lines.push(`- Database size: ${formatBytes(Number(overview.database_size_bytes))}`);
  }

  if (connections) {
    lines.push(
      `- Connections: ${connections.current_database_connections}/${connections.max_connections} total, ${connections.active_connections} active, ${connections.idle_connections} idle`,
    );
  }

  if (databaseStats) {
    lines.push(`- Cache hit ratio: ${formatPercent(cacheHitRatio(databaseStats))}`);
    lines.push(`- Temp bytes in stats window: ${formatBytes(Number(databaseStats.temp_bytes))}`);
  }

  lines.push(
    `- pg_stat_statements: ${report.postgres.pgStatStatementsInstalled.data ? "available" : "not available"}`,
  );

  return lines;
}

function neonProfileLines(report: NeonOptimizationReport) {
  const branches = collectionCount(report.neon.branches, "branches");
  const endpoints = collectionCount(report.neon.endpoints, "endpoints");

  return [
    `- Neon project telemetry: ${capabilityLabel(report.neon.project)}`,
    `- Neon endpoints seen: ${endpoints ?? "unavailable"}`,
    `- Neon branches seen: ${branches ?? "unavailable"}`,
    `- Autoscaling review target: min ${formatNullableNumber(report.config.thresholds.targetMinCu)} CU / max ${formatNullableNumber(report.config.thresholds.targetMaxCu)} CU`,
    `- Suspend review target: ${formatNullableNumber(report.config.thresholds.targetSuspendSeconds)} seconds`,
    `- Monthly compute CU-hours: ${formatNullableNumber(report.costModel.monthlyComputeCuHours)}`,
    `- Database size for storage estimate: ${formatGb(report.costModel.databaseSizeGb)}`,
  ];
}

function costDriverLines(report: NeonOptimizationReport) {
  const lines = [
    `- Compute: ${formatCostEstimate(report.costModel.currentMonthlyComputeCost)}`,
    `- Storage: ${formatCostEstimate(report.costModel.currentMonthlyStorageCost)}`,
  ];
  const connections = report.postgres.connectionSummary.data;
  const topTables = report.postgres.tableStats.data?.slice(0, 3) ?? [];

  if (connections) {
    lines.push(
      `- Connection pressure: ${connections.current_database_connections}/${connections.max_connections} current database connections`,
    );
  }

  for (const table of topTables) {
    lines.push(
      `- Table storage: ${table.table_name} uses ${formatBytes(Number(table.total_bytes))}`,
    );
  }

  return lines;
}

function recommendationLines(recommendations: NeonOptimizationReport["recommendations"]) {
  if (!recommendations.length) return ["- No recommendations generated."];

  return recommendations.flatMap((recommendation, index) => [
    "",
    `${index + 1}. ${recommendation.title}`,
    `   Issue: ${recommendation.issue}`,
    `   Evidence: ${recommendation.evidence.map(formatEvidence).join("; ")}`,
    `   Estimated impact: ${recommendation.estimatedImpact}`,
    `   Expected savings: ${recommendation.expectedSavings}`,
    `   Monthly saving estimate: ${formatCostEstimate(recommendation.estimatedMonthlySavings)}`,
    `   Risk: ${recommendation.riskLevel}`,
    `   Confidence: ${Math.round(recommendation.confidence * 100)}%`,
    `   Score: ${recommendation.score}`,
    `   Proposed action: ${recommendation.proposedOptimization}`,
    `   Validation: ${recommendation.validationProcedure[0] ?? "Define validation before change."}`,
    `   Rollback: ${recommendation.rollbackProcedure[0] ?? "Define rollback before change."}`,
    `   Approval: ${recommendation.approval}`,
  ]);
}

function approvalLines(report: NeonOptimizationReport) {
  const required = report.recommendations.filter(
    (recommendation) => recommendation.approval !== "read_only",
  );

  if (!required.length) return ["- None for read-only reporting."];

  return required.map(
    (recommendation) => `- ${recommendation.title}: ${recommendation.approval}`,
  );
}

function totalEstimatedSavings(
  recommendations: NeonOptimizationReport["recommendations"],
) {
  return recommendations.reduce((total, recommendation) => {
    const amount = recommendation.estimatedMonthlySavings.amount;

    return amount === null ? total : total + amount;
  }, 0);
}

function formatEvidence(evidence: {
  detail?: string;
  label: string;
  unit?: string;
  value: string | number | boolean | null;
}) {
  const unit = evidence.unit ? ` ${evidence.unit}` : "";
  const detail = evidence.detail ? ` (${evidence.detail})` : "";

  return `${evidence.label}=${String(evidence.value)}${unit}${detail}`;
}

function formatCostEstimate(estimate: AdvisorCostEstimate) {
  const amount =
    estimate.amount === null
      ? "unavailable"
      : `${estimate.currency} ${estimate.amount.toFixed(2)}/month`;
  const certainty = estimate.exact ? "exact" : "estimate";
  const measured = estimate.measured ? "measured input" : "configured/unknown input";

  return `${amount} (${certainty}, ${measured}; ${estimate.basis})`;
}

function formatSavings(amount: number, currency: string) {
  return amount > 0 ? `${currency} ${amount.toFixed(2)}/month` : "unavailable";
}

function capabilityLabel<T>(capability: AdvisorCapability<T>) {
  if (capability.status === "available") return "available";
  if (capability.error) return `${capability.status} (${capability.error})`;

  return capability.status;
}

function collectionCount<T>(capability: AdvisorCapability<T>, key: string) {
  if (Array.isArray(capability.data)) return capability.data.length;
  if (!capability.data || typeof capability.data !== "object") return null;

  const collection = (capability.data as Record<string, unknown>)[key];

  return Array.isArray(collection) ? collection.length : null;
}

function yesNo(value: boolean) {
  return value ? "yes" : "no";
}

function highestRisk(recommendations: NeonOptimizationReport["recommendations"]) {
  if (recommendations.some((recommendation) => recommendation.riskLevel === "high")) {
    return "high";
  }

  if (
    recommendations.some((recommendation) => recommendation.riskLevel === "medium")
  ) {
    return "medium";
  }

  return "low";
}

function cacheHitRatio(stats: { blks_hit: bigint; blks_read: bigint }) {
  const hits = Number(stats.blks_hit);
  const reads = Number(stats.blks_read);
  const total = hits + reads;

  return total > 0 ? (hits / total) * 100 : null;
}

function formatPercent(value: number | null) {
  return value === null ? "unavailable" : `${round(value)}%`;
}

function formatNullableNumber(value: number | null) {
  return value === null ? "unavailable" : round(value).toString();
}

function formatGb(value: number | null) {
  if (value === null) return "unavailable";
  if (value === 0) return "0 GB";
  if (value < 0.01) return `${value.toFixed(4)} GB`;
  if (value < 1) return `${value.toFixed(3)} GB`;

  return `${round(value)} GB`;
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

function round(value: number) {
  return Math.round(value * 10) / 10;
}
