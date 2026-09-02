import type { Metadata } from "next";
import Link from "next/link";
import type { BackgroundJobRunStatus } from "@prisma/client";
import AuditLogTable from "@/components/crm-boilerplate/AuditLogTable";
import MetricCard from "@/components/crm-boilerplate/MetricCard";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import SectionHeader from "@/components/crm-boilerplate/SectionHeader";
import StatusBadge from "@/components/crm-boilerplate/StatusBadge";
import StatusDetailCard from "@/components/crm-boilerplate/StatusDetailCard";
import { requireAdmin } from "@/lib/auth";
import { buildMetadata } from "@/lib/build-metadata";
import { hasCredentialEncryptionKey } from "@/lib/crypto/secrets";
import { inspectDatabaseConnectionUrl } from "@/lib/database/connection-url";
import {
  readMigrationReadiness,
  type MigrationReadiness,
} from "@/lib/database/migration-readiness";
import { formatDateTime, formatRelativeDate } from "@/lib/formatters/date";
import { id30AuthProvider } from "@/lib/integrations/id30-auth";
import { mailerSendProvider } from "@/lib/integrations/mailersend";
import { openaiProvider } from "@/lib/integrations/openai";
import { twilioProvider } from "@/lib/integrations/twilio";
import {
  refreshMarketingDailyRollups,
  type MarketingDailyRollupRefreshResult,
} from "@/lib/marketing/daily-rollups";
import {
  marketingIntegrationProviderDefinitions,
  marketingIntegrationProviderGroups,
} from "@/lib/marketing/integrations";
import {
  runOperationalDataRetention,
  type OperationalRetentionRunResult,
} from "@/lib/maintenance/retention";
import {
  backgroundJobStaleCutoff,
  backgroundJobStaleMinutes,
  formatBackgroundJobName,
  isBackgroundJobRunStale,
  isBackgroundJobSchemaPending,
  readBackgroundJobHealthSummary,
} from "@/lib/maintenance/background-jobs";
import {
  databaseQueryPerformanceSnapshot,
  databaseQueryTimingEnabled,
} from "@/lib/performance/db-query-metrics";
import { phoneSystemProvider } from "@/lib/phone-system/config";
import { prisma } from "@/lib/prisma";
import { cloudflareR2Provider } from "@/lib/storage/r2";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "System / Developer | iD30 CRM",
};

const coreIntegrationProviders = [
  {
    provider: twilioProvider,
    name: "Twilio",
    area: "Telephony",
    detail: "Calls, SMS, WhatsApp, tracking numbers and voice webhooks.",
  },
  {
    provider: phoneSystemProvider,
    name: "Phone System",
    area: "Telephony",
    detail: "Business hours, call routing, queues and agent routing rules.",
  },
  {
    provider: mailerSendProvider,
    name: "MailerSend",
    area: "Email",
    detail: "Transactional email, inbound routing and sender domain settings.",
  },
  {
    provider: cloudflareR2Provider,
    name: "Cloudflare R2",
    area: "Storage",
    detail: "Media storage for company branding, files and public assets.",
  },
  {
    provider: openaiProvider,
    name: "OpenAI",
    area: "AI",
    detail: "Server-side AI assistance and CRM Sidekick requests.",
  },
  {
    provider: id30AuthProvider,
    name: "iD30 Auth",
    area: "Auth broker",
    detail: "Centralised marketing OAuth broker for client integrations.",
  },
] as const;

const marketingGroupName = new Map(
  marketingIntegrationProviderGroups.map((group) => [group.key, group.title]),
);

const expectedIntegrationProviders = [
  ...coreIntegrationProviders,
  ...marketingIntegrationProviderDefinitions.map((provider) => ({
    provider: provider.provider,
    name: provider.name,
    area: marketingGroupName.get(provider.group) ?? "Marketing",
    detail: provider.next,
  })),
] as const;

type ConnectionRow = {
  name: string;
  provider: string;
  status: "CONNECTED" | "NOT_CONNECTED" | "ERROR";
  updatedAt: Date;
};

type AuditRow = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  createdAt: Date;
  actor: {
    email: string;
    name: string;
  } | null;
};

type OperationalData =
  | {
      available: true;
      activeSessionCount: number;
      activeUserCount: number;
      connections: ConnectionRow[];
      expiredSessionCount: number;
      recentAuditLogs: AuditRow[];
    }
  | {
      available: false;
      activeSessionCount: null;
      activeUserCount: null;
      connections: ConnectionRow[];
      expiredSessionCount: null;
      recentAuditLogs: AuditRow[];
    };

type RetentionData =
  | {
      available: true;
      lastRun: AuditRow | null;
      preview: OperationalRetentionRunResult;
    }
  | {
      available: false;
      lastRun: null;
      preview: null;
    };

type MarketingRollupData =
  | {
      available: true;
      lastRun: AuditRow | null;
      preview: MarketingDailyRollupRefreshResult;
    }
  | {
      available: false;
      lastRun: null;
      preview: null;
    };

type BackgroundJobRunRow = {
  id: string;
  actor: {
    email: string;
    name: string;
  } | null;
  dryRun: boolean;
  durationMs: number | null;
  errorMessage: string | null;
  finishedAt: Date | null;
  jobName: string;
  jobType: string;
  message: string | null;
  recordsRead: number;
  recordsWritten: number;
  startedAt: Date;
  status: BackgroundJobRunStatus;
  trigger: string;
};

type BackgroundJobHistoryData =
  | {
      available: true;
      recentErrorCount: number;
      recentErrorDays: number;
      recentRuns: BackgroundJobRunRow[];
      runningCount: number;
      staleCutoff: Date;
      staleMinutes: number;
      staleRunningCount: number;
    }
  | {
      available: false;
      recentErrorCount: null;
      recentErrorDays: number;
      recentRuns: BackgroundJobRunRow[];
      runningCount: null;
      staleCutoff: Date;
      staleMinutes: number;
      staleRunningCount: null;
    };

type MigrationData =
  | {
      available: true;
      readiness: MigrationReadiness;
    }
  | {
      available: false;
      readiness: null;
    };

type EnvironmentCheck = {
  detail: string;
  key: string;
  label: string;
  required?: boolean;
  status: "Ready" | "Needed" | "WARNING" | "Planned";
};

type DeploymentReadinessCheck = {
  detail: string;
  label: string;
  status: "Ready" | "Needed" | "WARNING" | "Planned" | "Error";
};

type DeploymentStatusItem = {
  detail: string;
  label: string;
  status: "Ready" | "Needed" | "WARNING" | "Planned" | "Error";
  value: string;
};

const releaseCommands = [
  {
    command: "npm run typecheck",
    detail: "TypeScript validation before the branch is pushed.",
  },
  {
    command: "npm run lint",
    detail: "ESLint validation for code quality and import safety.",
  },
  {
    command: "npm run build",
    detail: "Next.js production build confidence before handoff.",
  },
  {
    command: "npm run env:check",
    detail: "Production environment readiness check.",
  },
  {
    command: "npm run production:preflight",
    detail: "Production guardrail checks before deployment.",
  },
  {
    command: "npm run db:migrate:status",
    detail: "Prisma migration status check against the configured database.",
  },
] as const;

const releaseVerificationSteps = [
  "Merge feature branches through pull requests into main.",
  "Wait for the host deploy to complete before treating the change as live.",
  "Confirm /api/build-version reports the merged short commit.",
  "Use /api/health?database=1 only when the release needs an explicit database ping.",
  "Verify the changed workflow in the browser with an admin account.",
] as const;
const marketingRollupSystemPreviewDays = 30;

function envValue(key: string) {
  return process.env[key]?.trim() ?? "";
}

function positiveNumberEnv(key: string) {
  const value = Number(envValue(key));
  return Number.isFinite(value) && value > 0;
}

function nonNegativeNumberEnv(key: string) {
  const rawValue = envValue(key);
  const value = Number(rawValue);

  return rawValue !== "" && Number.isFinite(value) && value >= 0;
}

function booleanEnv(key: string) {
  return ["1", "true", "yes", "on"].includes(envValue(key).toLowerCase());
}

function getEnvironmentChecks(): EnvironmentCheck[] {
  const databaseUrl = envValue("DATABASE_URL");
  const migrationDatabaseUrl = envValue("MIGRATE_DATABASE_URL");
  const runtimeDatabase = inspectDatabaseConnectionUrl(databaseUrl);
  const migrationDatabase = inspectDatabaseConnectionUrl(migrationDatabaseUrl);
  const runtimeUsesPooler = runtimeDatabase.kind === "neon-pooler";
  const runtimeUsesDirectNeon = runtimeDatabase.kind === "neon-direct";
  const migrationUsesPooler = migrationDatabase.kind === "neon-pooler";
  const operationalRetentionSecretReady = Boolean(
    envValue("OPERATIONAL_RETENTION_SECRET") || envValue("CRON_SECRET"),
  );
  const operationalRetentionCronEnabled = booleanEnv("OPERATIONAL_RETENTION_CRON_ENABLED");
  const operationalRetentionDryRun = booleanEnv("OPERATIONAL_RETENTION_CRON_DRY_RUN");
  const marketingRollupSecretReady = Boolean(
    envValue("MARKETING_ROLLUP_SECRET") || envValue("CRON_SECRET"),
  );
  const marketingRollupCronEnabled = booleanEnv("MARKETING_ROLLUP_CRON_ENABLED");
  const marketingRollupDryRun = booleanEnv("MARKETING_ROLLUP_CRON_DRY_RUN");

  return [
    {
      label: "Database connection",
      key: "DATABASE_URL",
      status: databaseUrl && runtimeDatabase.valid ? "Ready" : "Needed",
      detail: "Required for Prisma runtime queries and server-rendered CRM pages.",
      required: true,
    },
    {
      label: "Neon runtime pooling",
      key: "DATABASE_URL",
      status: runtimeUsesPooler
        ? "Ready"
        : runtimeUsesDirectNeon
          ? "WARNING"
          : "Planned",
      detail: runtimeUsesDirectNeon
        ? "Use the pooled Neon connection string for Netlify runtime to reduce serverless connection churn."
        : runtimeUsesPooler
          ? "Runtime DATABASE_URL uses the Neon pooled endpoint."
          : "Only applies when DATABASE_URL points at Neon.",
    },
    {
      label: "Credential encryption",
      key: "CREDENTIAL_ENCRYPTION_KEY",
      status: hasCredentialEncryptionKey() ? "Ready" : "Needed",
      detail: "Required before integration credentials can be encrypted or decrypted.",
      required: true,
    },
    {
      label: "Session cookie",
      key: "SESSION_COOKIE_NAME",
      status: envValue("SESSION_COOKIE_NAME") ? "Ready" : "Needed",
      detail: "Required for consistent authentication cookies across deployments.",
      required: true,
    },
    {
      label: "Session lifetime",
      key: "SESSION_TTL_DAYS",
      status: positiveNumberEnv("SESSION_TTL_DAYS") ? "Ready" : "Needed",
      detail: "Required so server sessions have a valid expiry window.",
      required: true,
    },
    {
      label: "Application base URL",
      key: "APP_BASE_URL",
      status: envValue("APP_BASE_URL") ? "Ready" : "WARNING",
      detail: "Recommended for callbacks, canonical links and production-safe redirects.",
    },
    {
      label: "Migration database",
      key: "MIGRATE_DATABASE_URL",
      status: migrationUsesPooler
        ? "WARNING"
        : migrationDatabaseUrl
          ? "Ready"
          : runtimeUsesPooler
            ? "WARNING"
            : "Planned",
      detail: migrationUsesPooler
        ? "Use a direct Neon connection for Prisma migration deploys."
        : runtimeUsesPooler
          ? "Recommended when runtime DATABASE_URL uses a pooled Neon connection."
          : "Only needed when migrations require a separate direct database connection.",
    },
    {
      label: "Build commit",
      key: "APP_BUILD_COMMIT",
      status: envValue("APP_BUILD_COMMIT") ? "Ready" : "Planned",
      detail: "Optional deployment metadata used to identify the exact release.",
    },
    {
      label: "Build branch",
      key: "APP_BUILD_BRANCH",
      status: envValue("APP_BUILD_BRANCH") ? "Ready" : "Planned",
      detail: "Optional deployment metadata used to confirm the live source branch.",
    },
    {
      label: "Build time",
      key: "APP_BUILD_TIME",
      status: envValue("APP_BUILD_TIME") ? "Ready" : "Planned",
      detail: "Optional deployment metadata used to confirm when the release was built.",
    },
    {
      label: "Database query timing",
      key: "DATABASE_QUERY_TIMING_ENABLED",
      status: databaseQueryTimingEnabled() ? "Ready" : "Planned",
      detail: "Optional safe Prisma operation timing for the System performance panel.",
    },
    {
      label: "Database slow threshold",
      key: "DATABASE_QUERY_SLOW_THRESHOLD_MS",
      status:
        nonNegativeNumberEnv("DATABASE_QUERY_SLOW_THRESHOLD_MS") ||
        nonNegativeNumberEnv("PERFORMANCE_LOGGING_THRESHOLD_MS")
          ? "Ready"
          : "Planned",
      detail: "Optional millisecond threshold for slow query labels; defaults to the performance logging threshold or 250ms.",
    },
    {
      label: "Background job stale threshold",
      key: "BACKGROUND_JOB_STALE_MINUTES",
      status: positiveNumberEnv("BACKGROUND_JOB_STALE_MINUTES") ? "Ready" : "Planned",
      detail: `Optional running-job age threshold for stale job alerts; defaults to ${backgroundJobStaleMinutes()} minutes.`,
    },
    {
      label: "Operational retention secret",
      key: "OPERATIONAL_RETENTION_SECRET",
      status: operationalRetentionSecretReady ? "Ready" : "Planned",
      detail: "Optional shared secret for the protected operational retention endpoint. CRON_SECRET can be used instead.",
    },
    {
      label: "Operational retention cron",
      key: "OPERATIONAL_RETENTION_CRON_ENABLED",
      status: operationalRetentionCronEnabled ? "Ready" : "Planned",
      detail: "Optional scheduled cleanup for old operational history. The Netlify function is disabled unless this is true.",
    },
    {
      label: "Operational retention dry run",
      key: "OPERATIONAL_RETENTION_CRON_DRY_RUN",
      status:
        operationalRetentionCronEnabled && operationalRetentionDryRun
          ? "WARNING"
          : operationalRetentionCronEnabled
            ? "Ready"
            : "Planned",
      detail: operationalRetentionCronEnabled
        ? operationalRetentionDryRun
          ? "Scheduled retention is enabled but currently inspecting counts without deleting rows."
          : "Scheduled retention is enabled for real cleanup runs."
        : "Optional safety flag for reviewing scheduled retention counts before allowing deletes.",
    },
    {
      label: "Marketing rollup secret",
      key: "MARKETING_ROLLUP_SECRET",
      status: marketingRollupSecretReady ? "Ready" : "Planned",
      detail: "Optional shared secret for the protected marketing rollup refresh endpoint. CRON_SECRET can be used instead.",
    },
    {
      label: "Marketing rollup cron",
      key: "MARKETING_ROLLUP_CRON_ENABLED",
      status: marketingRollupCronEnabled ? "Ready" : "Planned",
      detail: "Optional scheduled refresh for compact daily marketing summary rows.",
    },
    {
      label: "Marketing rollup dry run",
      key: "MARKETING_ROLLUP_CRON_DRY_RUN",
      status:
        marketingRollupCronEnabled && marketingRollupDryRun
          ? "WARNING"
          : marketingRollupCronEnabled
            ? "Ready"
            : "Planned",
      detail: marketingRollupCronEnabled
        ? marketingRollupDryRun
          ? "Scheduled rollups are enabled but currently inspecting counts without writing rows."
          : "Scheduled rollups are enabled for real summary-row refreshes."
        : "Optional safety flag for reviewing scheduled rollup counts before writing rows.",
    },
    {
      label: "Marketing rollup window",
      key: "MARKETING_ROLLUP_CRON_WINDOW_DAYS",
      status: positiveNumberEnv("MARKETING_ROLLUP_CRON_WINDOW_DAYS") ? "Ready" : "Planned",
      detail: "Optional scheduled rollup refresh window. Defaults to 90 days and caps at 730.",
    },
  ];
}

async function readDatabaseHealth() {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;

    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
    };
  } catch {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
    };
  }
}

async function readOperationalData(databaseAvailable: boolean): Promise<OperationalData> {
  if (!databaseAvailable) {
    return unavailableOperationalData();
  }

  const now = new Date();

  try {
    const [
      connections,
      activeSessionCount,
      expiredSessionCount,
      activeUserCount,
      recentAuditLogs,
    ] = await Promise.all([
      prisma.integrationConnection.findMany({
        orderBy: { name: "asc" },
        select: {
          name: true,
          provider: true,
          status: true,
          updatedAt: true,
        },
      }),
      prisma.session.count({ where: { expiresAt: { gt: now } } }),
      prisma.session.count({ where: { expiresAt: { lte: now } } }),
      prisma.user.count({ where: { status: "ACTIVE" } }),
      prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          action: true,
          actor: {
            select: {
              email: true,
              name: true,
            },
          },
          createdAt: true,
          entity: true,
          entityId: true,
          id: true,
        },
      }),
    ]);

    return {
      available: true,
      activeSessionCount,
      activeUserCount,
      connections,
      expiredSessionCount,
      recentAuditLogs,
    };
  } catch {
    return unavailableOperationalData();
  }
}

function unavailableOperationalData(): OperationalData {
  return {
    available: false,
    activeSessionCount: null,
    activeUserCount: null,
    connections: [],
    expiredSessionCount: null,
    recentAuditLogs: [],
  };
}

async function readRetentionData(databaseAvailable: boolean): Promise<RetentionData> {
  if (!databaseAvailable) {
    return unavailableRetentionData();
  }

  try {
    const [preview, lastRun] = await Promise.all([
      runOperationalDataRetention({
        dryRun: true,
        recordJobRun: false,
        trigger: "system-preview",
      }),
      prisma.auditLog.findFirst({
        where: { action: "maintenance.retention.run" },
        orderBy: { createdAt: "desc" },
        select: {
          action: true,
          actor: {
            select: {
              email: true,
              name: true,
            },
          },
          createdAt: true,
          entity: true,
          entityId: true,
          id: true,
        },
      }),
    ]);

    return {
      available: true,
      lastRun,
      preview,
    };
  } catch {
    return unavailableRetentionData();
  }
}

function unavailableRetentionData(): RetentionData {
  return {
    available: false,
    lastRun: null,
    preview: null,
  };
}

async function readMarketingRollupData(
  databaseAvailable: boolean,
): Promise<MarketingRollupData> {
  if (!databaseAvailable) {
    return unavailableMarketingRollupData();
  }

  try {
    const [preview, lastRun] = await Promise.all([
      refreshMarketingDailyRollups({
        dryRun: true,
        recordJobRun: false,
        trigger: "system-preview",
        windowDays: marketingRollupSystemPreviewDays,
      }),
      prisma.auditLog.findFirst({
        where: { action: "marketing.rollups.daily_refreshed" },
        orderBy: { createdAt: "desc" },
        select: {
          action: true,
          actor: {
            select: {
              email: true,
              name: true,
            },
          },
          createdAt: true,
          entity: true,
          entityId: true,
          id: true,
        },
      }),
    ]);

    return {
      available: true,
      lastRun,
      preview,
    };
  } catch {
    return unavailableMarketingRollupData();
  }
}

function unavailableMarketingRollupData(): MarketingRollupData {
  return {
    available: false,
    lastRun: null,
    preview: null,
  };
}

async function readBackgroundJobHistoryData(
  databaseAvailable: boolean,
): Promise<BackgroundJobHistoryData> {
  if (!databaseAvailable) {
    return unavailableBackgroundJobHistoryData();
  }

  try {
    const [recentRuns, health] = await Promise.all([
      prisma.backgroundJobRun.findMany({
        orderBy: { startedAt: "desc" },
        take: 10,
        select: {
          actor: {
            select: {
              email: true,
              name: true,
            },
          },
          dryRun: true,
          durationMs: true,
          errorMessage: true,
          finishedAt: true,
          id: true,
          jobName: true,
          jobType: true,
          message: true,
          recordsRead: true,
          recordsWritten: true,
          startedAt: true,
          status: true,
          trigger: true,
        },
      }),
      readBackgroundJobHealthSummary(),
    ]);

    if (!health.available) {
      return unavailableBackgroundJobHistoryData();
    }

    return {
      available: true,
      recentErrorCount: health.recentErrorCount,
      recentErrorDays: health.recentErrorDays,
      recentRuns,
      runningCount: health.runningCount,
      staleCutoff: health.staleCutoff,
      staleMinutes: health.staleMinutes,
      staleRunningCount: health.staleRunningCount,
    };
  } catch (error) {
    if (isBackgroundJobSchemaPending(error)) {
      return unavailableBackgroundJobHistoryData();
    }

    return unavailableBackgroundJobHistoryData();
  }
}

function unavailableBackgroundJobHistoryData(): BackgroundJobHistoryData {
  const staleMinutes = backgroundJobStaleMinutes();
  const staleCutoff = backgroundJobStaleCutoff(new Date(), staleMinutes);
  const recentErrorDays = 7;

  return {
    available: false,
    recentErrorCount: null,
    recentErrorDays,
    recentRuns: [],
    runningCount: null,
    staleCutoff,
    staleMinutes,
    staleRunningCount: null,
  };
}

async function readMigrationData(databaseAvailable: boolean): Promise<MigrationData> {
  if (!databaseAvailable) {
    return unavailableMigrationData();
  }

  try {
    return {
      available: true,
      readiness: await readMigrationReadiness(),
    };
  } catch {
    return unavailableMigrationData();
  }
}

function unavailableMigrationData(): MigrationData {
  return {
    available: false,
    readiness: null,
  };
}

function integrationStatusLabel(status?: ConnectionRow["status"]) {
  if (status === "CONNECTED") return "Connected";
  if (status === "ERROR") return "Error";

  return "Not Connected";
}

function connectionUpdatedLabel(connection?: ConnectionRow) {
  return connection ? formatDateTime(connection.updatedAt) : "Never saved";
}

function pluralise(value: number, label: string) {
  return `${value} ${label}${value === 1 ? "" : "s"}`;
}

function formatCount(value: number) {
  return value.toLocaleString("en-GB");
}

function formatMs(value: number) {
  return `${value.toLocaleString("en-GB", {
    maximumFractionDigits: 1,
  })}ms`;
}

function formatCurrencyCents(value: number) {
  return new Intl.NumberFormat("en-GB", {
    currency: "GBP",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value / 100);
}

function roundPercentage(value: number) {
  return Math.round(value * 10) / 10;
}

function retentionStatusForMatchedRows(value: number): DeploymentStatusItem["status"] {
  if (value > 1000) return "WARNING";
  if (value > 0) return "Planned";

  return "Ready";
}

function migrationDeploymentStatus(
  migrationData: MigrationData,
): DeploymentStatusItem["status"] {
  if (!migrationData.available) return "Error";
  if (migrationData.readiness.status === "FAILED") return "Error";
  if (migrationData.readiness.status === "PENDING") return "WARNING";
  if (migrationData.readiness.status === "UNKNOWN") return "WARNING";

  return "Ready";
}

function migrationStatusLabel(migrationData: MigrationData) {
  if (!migrationData.available) return "Unavailable";

  if (migrationData.readiness.status === "FAILED") return "Failed";
  if (migrationData.readiness.status === "PENDING") return "Pending";
  if (migrationData.readiness.status === "UNKNOWN") return "Unknown";

  return "Up to date";
}

function migrationStatusDetail(migrationData: MigrationData) {
  if (!migrationData.available) {
    return "Migration readiness could not be read from the database.";
  }

  const readiness = migrationData.readiness;

  if (readiness.status === "FAILED") {
    return `${pluralise(readiness.failedMigrations.length, "migration")} failed or did not finish.`;
  }

  if (readiness.status === "PENDING") {
    return `${pluralise(readiness.pendingMigrations.length, "committed migration")} still needs to be applied.`;
  }

  if (readiness.status === "UNKNOWN") {
    return "Database migrations were readable, but committed migration folders were unavailable in this runtime.";
  }

  return "Committed Prisma migrations match the database migration table.";
}

function backgroundJobHistoryStatus(
  jobHistoryData: BackgroundJobHistoryData,
): DeploymentStatusItem["status"] {
  if (!jobHistoryData.available) return "Error";
  if (jobHistoryData.staleRunningCount > 0) return "Error";
  if (jobHistoryData.recentErrorCount > 0) return "WARNING";

  return "Ready";
}

function backgroundJobDuration(
  run: BackgroundJobRunRow,
  staleCutoff: Date,
  staleMinutes: number,
) {
  if (run.durationMs !== null) return formatMs(run.durationMs);
  if (isBackgroundJobRunStale(run, staleCutoff)) {
    return `Stale > ${pluralise(staleMinutes, "minute")}`;
  }
  if (run.status === "RUNNING") return "Running";

  return "Not finished";
}

function backgroundJobMessage(run: BackgroundJobRunRow) {
  return run.errorMessage || run.message || "No summary message logged.";
}

function backgroundJobActor(run: BackgroundJobRunRow) {
  if (!run.actor) return run.trigger;

  return run.actor.name || run.actor.email;
}

function getDeploymentReadinessChecks({
  advisoryEnvironmentIssues,
  build,
  databaseHealth,
  migrationData,
  operationalData,
  requiredEnvironmentIssues,
}: {
  advisoryEnvironmentIssues: number;
  build: ReturnType<typeof buildMetadata>;
  databaseHealth: Awaited<ReturnType<typeof readDatabaseHealth>>;
  migrationData: MigrationData;
  operationalData: OperationalData;
  requiredEnvironmentIssues: number;
}): DeploymentReadinessCheck[] {
  const hasBuildMetadata =
    build.shortCommit !== "unknown" &&
    build.branch !== "unknown" &&
    build.builtAt !== "unknown";

  return [
    {
      label: "Database health",
      status: databaseHealth.ok ? "Ready" : "Error",
      detail: databaseHealth.ok
        ? `Runtime database ping completed in ${databaseHealth.latencyMs}ms.`
        : "Runtime database ping failed; deployment should not be treated as healthy.",
    },
    {
      label: "Required environment",
      status: requiredEnvironmentIssues ? "Needed" : "Ready",
      detail: requiredEnvironmentIssues
        ? `${pluralise(requiredEnvironmentIssues, "required environment check")} still needs attention.`
        : "Required runtime environment checks are present.",
    },
    {
      label: "Recommended environment",
      status: advisoryEnvironmentIssues ? "WARNING" : "Ready",
      detail: advisoryEnvironmentIssues
        ? `${pluralise(advisoryEnvironmentIssues, "recommended environment check")} should be reviewed.`
        : "No advisory environment warnings detected.",
    },
    {
      label: "Credential encryption",
      status: hasCredentialEncryptionKey() ? "Ready" : "Needed",
      detail: hasCredentialEncryptionKey()
        ? "Integration credential encryption can initialise."
        : "CREDENTIAL_ENCRYPTION_KEY is missing or invalid.",
    },
    {
      label: "Build metadata",
      status: hasBuildMetadata ? "Ready" : "Planned",
      detail: hasBuildMetadata
        ? `Current runtime reports ${build.shortCommit} from ${build.branch}.`
        : "Build commit, branch or build time metadata is not exposed by this deployment.",
    },
    {
      label: "Operational reads",
      status: operationalData.available ? "Ready" : "Error",
      detail: operationalData.available
        ? "Session, user, audit and integration records can be read."
        : "Operational database reads failed after the health check.",
    },
    {
      label: "Schema migrations",
      status: migrationDeploymentStatus(migrationData),
      detail: migrationStatusDetail(migrationData),
    },
  ];
}

export default async function SystemSettingsPage() {
  await requireAdmin();

  const build = buildMetadata();
  const environmentChecks = getEnvironmentChecks();
  const databaseHealth = await readDatabaseHealth();
  const [
    operationalData,
    retentionData,
    marketingRollupData,
    backgroundJobHistoryData,
    migrationData,
  ] = await Promise.all([
      readOperationalData(databaseHealth.ok),
      readRetentionData(databaseHealth.ok),
      readMarketingRollupData(databaseHealth.ok),
      readBackgroundJobHistoryData(databaseHealth.ok),
      readMigrationData(databaseHealth.ok),
    ]);
  const connectionByProvider = new Map(
    operationalData.connections.map((connection) => [connection.provider, connection]),
  );
  const connectedIntegrationCount = expectedIntegrationProviders.filter(
    (provider) => connectionByProvider.get(provider.provider)?.status === "CONNECTED",
  ).length;
  const requiredEnvironmentIssues = environmentChecks.filter(
    (check) => check.required && check.status !== "Ready",
  ).length;
  const advisoryEnvironmentIssues = environmentChecks.filter(
    (check) => !check.required && check.status === "WARNING",
  ).length;
  const deploymentReadinessChecks = getDeploymentReadinessChecks({
    advisoryEnvironmentIssues,
    build,
    databaseHealth,
    migrationData,
    operationalData,
    requiredEnvironmentIssues,
  });
  const migrationStatus = migrationDeploymentStatus(migrationData);
  const deploymentReady =
    databaseHealth.ok &&
    operationalData.available &&
    requiredEnvironmentIssues === 0 &&
    migrationStatus === "Ready";
  const buildMetadataReady =
    build.shortCommit !== "unknown" &&
    build.branch !== "unknown" &&
    build.builtAt !== "unknown";
  const liveDeploymentStatus: DeploymentStatusItem["status"] = !deploymentReady
    ? "WARNING"
    : buildMetadataReady
      ? "Ready"
      : "Planned";
  const deploymentStatusItems: DeploymentStatusItem[] = [
    {
      label: "Live identity",
      value: buildMetadataReady ? `${build.shortCommit} on ${build.branch}` : "Metadata missing",
      status: buildMetadataReady ? "Ready" : "Planned",
      detail:
        "APP_BUILD_COMMIT, APP_BUILD_BRANCH and APP_BUILD_TIME identify the exact release currently serving traffic.",
    },
    {
      label: "Runtime health",
      value: databaseHealth.ok ? `${databaseHealth.latencyMs}ms database ping` : "Database error",
      status: databaseHealth.ok ? "Ready" : "Error",
      detail: "Uses the same runtime database path as server-rendered CRM pages.",
    },
    {
      label: "Operational reads",
      value: operationalData.available ? "Readable" : "Unavailable",
      status: operationalData.available ? "Ready" : "Error",
      detail: "Confirms sessions, users, audit logs and integration rows can be read after deploy.",
    },
    {
      label: "Runtime age",
      value: formatRelativeDate(build.runtimeStartedAt),
      status: "Ready",
      detail: "Shows when this Node.js process last started so admins can spot stale runtime state.",
    },
  ];
  const appBaseUrl = envValue("APP_BASE_URL");
  const secureOriginReady =
    appBaseUrl.startsWith("https://") || process.env.NODE_ENV === "production";
  const pwaReadinessStatus: DeploymentStatusItem["status"] = secureOriginReady
    ? "Ready"
    : "WARNING";
  const pwaReadinessItems: DeploymentStatusItem[] = [
    {
      label: "Web app manifest",
      value: "/manifest.webmanifest",
      status: "Ready",
      detail: "Defines app name, standalone display mode, start URL and install metadata.",
    },
    {
      label: "Install icons",
      value: "192 / 512 / maskable",
      status: "Ready",
      detail: "Product-level PNG icons are available for browser and OS install surfaces.",
    },
    {
      label: "Service worker",
      value: "/service-worker.js",
      status: "Ready",
      detail: "Registers in production and caches only safe static app shell assets.",
    },
    {
      label: "Secure origin",
      value: secureOriginReady ? "HTTPS ready" : "Confirm HTTPS",
      status: pwaReadinessStatus,
      detail: "Desktop PWA install prompts require HTTPS or localhost browser context.",
    },
  ];
  const databaseQueryPerformance = databaseQueryPerformanceSnapshot();
  const databaseSlowRate = databaseQueryPerformance.totalQueries
    ? `${roundPercentage(
        (databaseQueryPerformance.slowQueries / databaseQueryPerformance.totalQueries) * 100,
      )}%`
    : "0%";
  const topDatabaseQueryLabels = databaseQueryPerformance.labels.slice(0, 8);
  const recentSlowDatabaseQueries = databaseQueryPerformance.slowSamples.slice(0, 6);
  const retentionPreviewRows = retentionData.preview?.targets ?? [];
  const retentionMatchedRows = retentionData.preview?.totals.matched ?? 0;
  const retentionReadinessStatus: DeploymentStatusItem["status"] = !retentionData.available
    ? "Error"
    : retentionStatusForMatchedRows(retentionMatchedRows);
  const retentionCronEnabled = booleanEnv("OPERATIONAL_RETENTION_CRON_ENABLED");
  const retentionCronDryRun = booleanEnv("OPERATIONAL_RETENTION_CRON_DRY_RUN");
  const retentionSecretReady = Boolean(
    envValue("OPERATIONAL_RETENTION_SECRET") || envValue("CRON_SECRET"),
  );
  const marketingRollupPreview = marketingRollupData.preview;
  const marketingRollupStatus: DeploymentStatusItem["status"] = !marketingRollupData.available
    ? "Error"
    : marketingRollupPreview?.rowsMatched
      ? "Ready"
      : "Planned";
  const marketingRollupCronEnabled = booleanEnv("MARKETING_ROLLUP_CRON_ENABLED");
  const marketingRollupCronDryRun = booleanEnv("MARKETING_ROLLUP_CRON_DRY_RUN");
  const marketingRollupSecretReady = Boolean(
    envValue("MARKETING_ROLLUP_SECRET") || envValue("CRON_SECRET"),
  );
  const marketingRollupSpendCents = Math.round(
    Number(marketingRollupPreview?.totals.costMicros ?? "0") / 10000,
  );
  const migrationReadiness = migrationData.readiness;
  const migrationAppliedValue = migrationReadiness
    ? migrationReadiness.committedMigrationsAvailable
      ? `${formatCount(migrationReadiness.appliedCount)}/${formatCount(
          migrationReadiness.committedCount,
        )}`
      : formatCount(migrationReadiness.appliedCount)
    : "Unavailable";
  const visiblePendingMigrations = migrationReadiness?.pendingMigrations.slice(0, 8) ?? [];
  const visibleFailedMigrations = migrationReadiness?.failedMigrations.slice(0, 5) ?? [];
  const latestBackgroundJob = backgroundJobHistoryData.recentRuns[0];
  const backgroundJobStatus = backgroundJobHistoryStatus(backgroundJobHistoryData);

  return (
    <>
      <PageHeader
        title="System / Developer"
        description="Read-only operational health, deployment metadata, environment readiness and implementation guardrails."
        actions={
          <>
            <HeaderLink href="/api/health">Health JSON</HeaderLink>
            <HeaderLink href="/api/health?database=1">DB Health JSON</HeaderLink>
            <HeaderLink href="/api/build-info">Build info</HeaderLink>
            <HeaderLink href="/settings/security">Security</HeaderLink>
            <HeaderLink href="/settings/integrations">Integrations</HeaderLink>
          </>
        }
      />

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Application"
            value={databaseHealth.ok ? "Healthy" : "Attention"}
            detail={databaseHealth.ok ? "Runtime database ping succeeded" : "Database ping failed"}
            labelVariant="uppercase"
            muted={!databaseHealth.ok}
          />
          <MetricCard
            label="Database"
            value={databaseHealth.ok ? `${databaseHealth.latencyMs}ms` : "Error"}
            detail="SELECT 1 latency from this server render"
            labelVariant="uppercase"
            muted={!databaseHealth.ok}
          />
          <MetricCard
            label="Environment"
            value={requiredEnvironmentIssues ? "Action needed" : "Ready"}
            detail={
              requiredEnvironmentIssues
                ? pluralise(requiredEnvironmentIssues, "required check failed")
                : advisoryEnvironmentIssues
                  ? pluralise(advisoryEnvironmentIssues, "advisory warning")
                  : "Required runtime keys are present"
            }
            labelVariant="uppercase"
            muted={requiredEnvironmentIssues > 0}
          />
          <MetricCard
            label="Integrations"
            value={
              operationalData.available
                ? `${connectedIntegrationCount}/${expectedIntegrationProviders.length}`
                : "Unavailable"
            }
            detail="Expected provider connections currently marked connected"
            labelVariant="uppercase"
            muted={!operationalData.available}
          />
        </div>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <SectionHeader
            title="Live deployment status"
            description="Current release identity and handoff checks for this running CRM instance."
            help="Use this after merging a branch to confirm the live app is serving the expected build and can read required runtime data."
          />
          <div className="grid gap-0 divide-y divide-gray-100 dark:divide-gray-800 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)] xl:divide-x xl:divide-y-0">
            <div className="p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                    Running release
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
                    {liveDeploymentStatus === "Ready"
                      ? "The running app exposes build identity and required runtime checks are healthy."
                      : "Confirm build metadata and runtime checks before treating the latest merge as live."}
                  </p>
                </div>
                <StatusBadge>{liveDeploymentStatus}</StatusBadge>
              </div>
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {deploymentStatusItems.map((item) => (
                  <StatusDetailCard
                    key={item.label}
                    label={item.label}
                    value={item.value}
                    detail={item.detail}
                    status={item.status}
                  />
                ))}
              </div>
            </div>
            <div className="p-5">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Handoff checks
              </h3>
              <div className="mt-4 space-y-3">
                <CommandRow
                  command={[
                    "curl -s https://crm",
                    "epc-improvements.co.uk/api/build-version",
                  ].join(".")}
                  detail="DB-free build check should return ok and the expected public build.shortCommit."
                />
                <CommandRow
                  command={[
                    "curl -s 'https://crm",
                    "epc-improvements.co.uk/api/health?database=1'",
                  ].join(".")}
                  detail="Runs an explicit database ping only when deployment verification needs DB proof."
                />
                <CommandRow
                  command="npm run deploy:check"
                  detail="Checks whether the live build metadata matches the current release expectation."
                />
                <CommandRow
                  command="npm run db:migrate:status"
                  detail="Confirms Prisma migration state after schema-changing releases."
                />
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <SectionHeader
            title="Deployment readiness"
            description="Release checklist for the current CRM runtime before a branch is treated as live."
            help="Combines runtime health, environment readiness and the repository's standard release checks into one operational view."
          />
          <div className="grid gap-0 divide-y divide-gray-100 dark:divide-gray-800 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] xl:divide-x xl:divide-y-0">
            <div className="p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                    Current readiness
                  </h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {deploymentReady
                      ? "No blocking runtime readiness issues detected."
                      : "Review the checks below before marking a deployment as complete."}
                  </p>
                </div>
                <StatusBadge>{deploymentReady ? "Ready" : "WARNING"}</StatusBadge>
              </div>
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {deploymentReadinessChecks.map((check) => (
                  <StatusDetailCard
                    key={check.label}
                    label={check.label}
                    detail={check.detail}
                    status={check.status}
                  />
                ))}
              </div>
            </div>

            <div className="p-5">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Release commands
              </h3>
              <div className="mt-4 space-y-3">
                {releaseCommands.map((item) => (
                  <CommandRow key={item.command} command={item.command} detail={item.detail} />
                ))}
              </div>
            </div>
          </div>
          <div className="border-t border-gray-100 p-5 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
              Post-merge verification
            </h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {releaseVerificationSteps.map((step, index) => (
                <VerificationStep key={step} index={index + 1} step={step} />
              ))}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <SectionHeader
            title="Schema migrations"
            description="Runtime view of committed Prisma migrations against the database migration table."
            help="This reads migration names and timestamps only. It does not run migrations or expose database credentials."
          />
          <div className="grid gap-0 divide-y divide-gray-100 dark:divide-gray-800 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)] xl:divide-x xl:divide-y-0">
            <div className="p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                    Migration readiness
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
                    {migrationStatusDetail(migrationData)}
                  </p>
                </div>
                <StatusBadge>{migrationStatus}</StatusBadge>
              </div>
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                <StatusDetailCard
                  label="Database status"
                  value={migrationStatusLabel(migrationData)}
                  detail="Uses the Prisma _prisma_migrations table in the configured runtime database."
                  status={migrationStatus}
                />
                <StatusDetailCard
                  label="Applied migrations"
                  value={migrationAppliedValue}
                  detail={
                    migrationReadiness?.committedMigrationsAvailable
                      ? "Applied database migrations compared with committed migration folders."
                      : "Committed migration folders were not readable from this runtime."
                  }
                  status={migrationStatus}
                />
                <StatusDetailCard
                  label="Latest committed"
                  value={migrationReadiness?.latestCommitted ?? "Unknown"}
                  detail="Newest migration folder available in the deployed source bundle."
                  status={
                    migrationReadiness?.latestCommitted
                      ? migrationStatus
                      : "WARNING"
                  }
                />
                <StatusDetailCard
                  label="Latest applied"
                  value={migrationReadiness?.latestApplied?.migrationName ?? "None logged"}
                  detail={
                    migrationReadiness?.latestApplied?.finishedAt
                      ? `Finished ${formatRelativeDate(
                          migrationReadiness.latestApplied.finishedAt,
                        )}.`
                      : "No completed migration row was found."
                  }
                  status={
                    migrationReadiness?.latestApplied
                      ? migrationStatus
                      : migrationData.available
                        ? "WARNING"
                        : "Error"
                  }
                />
              </div>
            </div>

            <div className="p-5">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Commands
              </h3>
              <div className="mt-4 space-y-3">
                <CommandRow
                  command="npm run db:migrate:status"
                  detail="Checks the configured database against committed Prisma migrations."
                />
                <CommandRow
                  command="npm run db:migrate:deploy"
                  detail="Applies committed migrations to the target database during controlled deploys."
                />
                <CommandRow
                  command="npm run smoke:routes"
                  detail="Verifies critical authenticated routes after migrations are applied."
                />
              </div>
            </div>
          </div>

          {visibleFailedMigrations.length > 0 ? (
            <div className="border-t border-gray-100 p-5 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Failed migrations
              </h3>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead>
                    <tr className="text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                      <th className="py-2 pr-4">Migration</th>
                      <th className="py-2 pr-4">Started</th>
                      <th className="py-2">Logs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {visibleFailedMigrations.map((migration) => (
                      <tr
                        key={migration.migrationName}
                        className="text-sm text-gray-700 dark:text-gray-300"
                      >
                        <td className="max-w-[360px] break-all py-3 pr-4 font-mono text-xs">
                          {migration.migrationName}
                        </td>
                        <td className="py-3 pr-4">{formatDateTime(migration.startedAt)}</td>
                        <td className="max-w-[520px] py-3 text-gray-500 dark:text-gray-400">
                          {migration.logs ?? "No migration logs stored."}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {visiblePendingMigrations.length > 0 ? (
            <div className="border-t border-gray-100 p-5 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Pending migrations
              </h3>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {visiblePendingMigrations.map((migration) => (
                  <div
                    key={migration}
                    className="rounded-lg border border-gray-100 p-3 dark:border-gray-800"
                  >
                    <code className="break-all font-mono text-xs text-gray-700 dark:text-gray-300">
                      {migration}
                    </code>
                  </div>
                ))}
              </div>
              {(migrationReadiness?.pendingMigrations.length ?? 0) >
              visiblePendingMigrations.length ? (
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                  {formatCount(
                    (migrationReadiness?.pendingMigrations.length ?? 0) -
                      visiblePendingMigrations.length,
                  )}{" "}
                  more pending migration names are hidden from this summary.
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <SectionHeader
            title="Background jobs"
            description="Recent maintenance, marketing import and conversion upload job history."
            help="Shows job type, trigger, status, record counts and failure messages without exposing credentials or customer payloads."
          />
          <div className="grid gap-0 divide-y divide-gray-100 dark:divide-gray-800 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)] xl:divide-x xl:divide-y-0">
            <div className="p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                    Job history
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
                    {backgroundJobHistoryData.available
                      ? latestBackgroundJob
                        ? `${formatBackgroundJobName(
                            latestBackgroundJob.jobName,
                          )} last ran ${formatRelativeDate(
                            latestBackgroundJob.startedAt,
                          )}.`
                        : "No background jobs have been logged yet."
                      : "Background job history is unavailable until the latest migration is applied."}
                  </p>
                </div>
                <StatusBadge>{backgroundJobStatus}</StatusBadge>
              </div>
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                <StatusDetailCard
                  label="Latest job"
                  value={
                    latestBackgroundJob
                      ? formatBackgroundJobName(latestBackgroundJob.jobName)
                      : "No jobs logged"
                  }
                  detail={
                    latestBackgroundJob
                      ? backgroundJobMessage(latestBackgroundJob)
                      : "Job runs will appear after maintenance, rollups, conversion uploads or ad spend imports run."
                  }
                  status={latestBackgroundJob?.status ?? backgroundJobStatus}
                />
                <StatusDetailCard
                  label="Running jobs"
                  value={
                    backgroundJobHistoryData.runningCount === null
                      ? "Unavailable"
                      : formatCount(backgroundJobHistoryData.runningCount)
                  }
                  detail="Jobs that started but have not written a finished timestamp yet."
                  status={
                    backgroundJobHistoryData.runningCount
                      ? "RUNNING"
                      : backgroundJobHistoryData.available
                        ? "Ready"
                        : "Error"
                  }
                />
                <StatusDetailCard
                  label="Stale jobs"
                  value={
                    backgroundJobHistoryData.staleRunningCount === null
                      ? "Unavailable"
                      : formatCount(backgroundJobHistoryData.staleRunningCount)
                  }
                  detail={`Running jobs older than ${pluralise(
                    backgroundJobHistoryData.staleMinutes,
                    "minute",
                  )} are treated as stuck.`}
                  status={
                    backgroundJobHistoryData.staleRunningCount
                      ? "Error"
                      : backgroundJobHistoryData.available
                        ? "Ready"
                        : "Error"
                  }
                />
                <StatusDetailCard
                  label="Recent errors"
                  value={
                    backgroundJobHistoryData.recentErrorCount === null
                      ? "Unavailable"
                      : formatCount(backgroundJobHistoryData.recentErrorCount)
                  }
                  detail={`Error job runs captured in the last ${pluralise(
                    backgroundJobHistoryData.recentErrorDays,
                    "day",
                  )}.`}
                  status={
                    backgroundJobHistoryData.recentErrorCount
                      ? "ERROR"
                      : backgroundJobHistoryData.available
                        ? "Ready"
                        : "Error"
                  }
                />
                <StatusDetailCard
                  label="Latest duration"
                  value={
                    latestBackgroundJob
                      ? backgroundJobDuration(
                          latestBackgroundJob,
                          backgroundJobHistoryData.staleCutoff,
                          backgroundJobHistoryData.staleMinutes,
                        )
                      : "No duration"
                  }
                  detail="Measured from the job start timestamp to the completion/failure update."
                  status={latestBackgroundJob?.status ?? backgroundJobStatus}
                />
              </div>
            </div>

            <div className="p-5">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Logged job types
              </h3>
              <div className="mt-4 space-y-3">
                <CommandRow
                  command="operational-retention"
                  detail="Operational cleanup runs from the protected retention endpoint or scheduled function."
                />
                <CommandRow
                  command="marketing-daily-rollups"
                  detail="Daily marketing summary refreshes used to avoid repeated raw aggregation work."
                />
                <CommandRow
                  command="marketing-conversion-upload-*"
                  detail="Lifecycle conversion queue prep, dry-run inspection and provider upload processing."
                />
                <CommandRow
                  command="marketing-ad-spend-import"
                  detail="Manual advertising spend imports from connected marketing providers."
                />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 p-5 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
              Recent runs
            </h3>
            {backgroundJobHistoryData.recentRuns.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead>
                    <tr className="text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                      <th className="py-2 pr-4">Job</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Trigger</th>
                      <th className="py-2 pr-4">Records</th>
                      <th className="py-2 pr-4">Started</th>
                      <th className="py-2">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {backgroundJobHistoryData.recentRuns.map((run) => (
                      <tr key={run.id} className="text-sm text-gray-700 dark:text-gray-300">
                        <td className="max-w-[360px] py-3 pr-4">
                          <div className="font-medium text-gray-800 dark:text-white/90">
                            {formatBackgroundJobName(run.jobName)}
                          </div>
                          <div className="font-mono text-xs text-gray-500 dark:text-gray-400">
                            {run.jobType}
                            {run.dryRun ? " / dry run" : ""}
                          </div>
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {backgroundJobMessage(run)}
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <StatusBadge>{run.status}</StatusBadge>
                        </td>
                        <td className="py-3 pr-4">{backgroundJobActor(run)}</td>
                        <td className="py-3 pr-4">
                          {formatCount(run.recordsRead)} read /{" "}
                          {formatCount(run.recordsWritten)} written
                        </td>
                        <td className="py-3 pr-4">
                          <div>{formatRelativeDate(run.startedAt)}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {formatDateTime(run.startedAt)}
                          </div>
                        </td>
                        <td className="py-3">
                          {backgroundJobDuration(
                            run,
                            backgroundJobHistoryData.staleCutoff,
                            backgroundJobHistoryData.staleMinutes,
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 text-sm leading-6 text-gray-500 dark:text-gray-400">
                {backgroundJobHistoryData.available
                  ? "No background job runs have been logged yet."
                  : "Background job history cannot be read until the schema is available."}
              </p>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <SectionHeader
            title="PWA installability"
            description="Install-ready browser app checks for saving iD30 CRM to desktop."
            help="Confirms the app exposes the manifest, icons and conservative service worker required for supported browsers to offer installation."
          />
          <div className="grid gap-0 divide-y divide-gray-100 dark:divide-gray-800 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)] xl:divide-x xl:divide-y-0">
            <div className="p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                    Desktop install support
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
                    Supported browsers can show an install option from the user
                    menu once the native install prompt is available.
                  </p>
                </div>
                <StatusBadge>{pwaReadinessStatus}</StatusBadge>
              </div>
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {pwaReadinessItems.map((item) => (
                  <StatusDetailCard
                    key={item.label}
                    label={item.label}
                    value={item.value}
                    detail={item.detail}
                    status={item.status}
                  />
                ))}
              </div>
            </div>

            <div className="p-5">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Live checks
              </h3>
              <div className="mt-4 space-y-3">
                <CommandRow
                  command={[
                    "curl -I https://crm",
                    "epc-improvements.co.uk/manifest.webmanifest",
                  ].join(".")}
                  detail="Manifest should return 200 and application/manifest+json."
                />
                <CommandRow
                  command={[
                    "curl -I https://crm",
                    "epc-improvements.co.uk/service-worker.js",
                  ].join(".")}
                  detail="Service worker should return 200 as JavaScript from the app root."
                />
                <CommandRow
                  command="Chrome DevTools > Application > Manifest"
                  detail="Use Chrome or Edge to confirm installability and icon rendering."
                />
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <SectionHeader
            title="Application health"
            description="Live runtime and deployment signals for the current CRM instance."
            help="These checks are read directly from the running server process and a lightweight database ping."
          />
          <div className="grid gap-0 divide-y divide-gray-100 dark:divide-gray-800 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
            <div className="p-5">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Runtime
              </h3>
              <dl className="mt-4 space-y-3">
                <StatusRow
                  label="Database"
                  value={databaseHealth.ok ? `${databaseHealth.latencyMs}ms response` : "Ping failed"}
                  detail="Checks the Prisma connection used by server-rendered pages."
                  status={databaseHealth.ok ? "Ready" : "Error"}
                />
                <StatusRow
                  label="Environment"
                  value={process.env.NODE_ENV || "Unknown"}
                  detail="Current Node.js runtime mode."
                  status={process.env.NODE_ENV === "production" ? "Ready" : "Planned"}
                />
                <StatusRow
                  label="Runtime started"
                  value={formatDateTime(build.runtimeStartedAt)}
                  detail="When this server process first loaded the CRM runtime."
                  status="Ready"
                />
              </dl>
            </div>

            <div className="p-5">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Deployment metadata
              </h3>
              <dl className="mt-4 space-y-3">
                <StatusRow
                  label="Commit"
                  value={build.shortCommit}
                  detail="Set by APP_BUILD_COMMIT when the host exposes release metadata."
                  status={build.shortCommit === "unknown" ? "Planned" : "Ready"}
                />
                <StatusRow
                  label="Branch"
                  value={build.branch}
                  detail="Set by APP_BUILD_BRANCH during deployment."
                  status={build.branch === "unknown" ? "Planned" : "Ready"}
                />
                <StatusRow
                  label="Built at"
                  value={formatDateTime(build.builtAt)}
                  detail="Set by APP_BUILD_TIME during deployment."
                  status={build.builtAt === "unknown" ? "Planned" : "Ready"}
                />
              </dl>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <SectionHeader
            title="Database query timing"
            description="Safe process-local Prisma operation timing for spotting expensive data access."
            help="This records model and operation labels only, such as Contact.findMany. It never stores SQL, Prisma args, parameters, form data or customer record values."
          />
          <div className="grid gap-0 divide-y divide-gray-100 dark:divide-gray-800 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)] xl:divide-x xl:divide-y-0">
            <div className="p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                    Runtime query profile
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
                    {databaseQueryPerformance.enabled
                      ? "Prisma timing is collecting aggregate labels for this running server process."
                      : "Enable database query timing when investigating slow pages or heavy data usage."}
                  </p>
                </div>
                <StatusBadge>{databaseQueryPerformance.enabled ? "Ready" : "Planned"}</StatusBadge>
              </div>
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                <StatusDetailCard
                  label="Instrumentation"
                  value={databaseQueryPerformance.enabled ? "Enabled" : "Disabled"}
                  detail="Controlled by DATABASE_QUERY_TIMING_ENABLED or PERFORMANCE_LOGGING_ENABLED."
                  status={databaseQueryPerformance.enabled ? "Ready" : "Planned"}
                />
                <StatusDetailCard
                  label="Slow threshold"
                  value={formatMs(databaseQueryPerformance.slowThresholdMs)}
                  detail="Queries at or above this duration are counted as slow samples."
                  status="Ready"
                />
                <StatusDetailCard
                  label="Model queries"
                  value={formatCount(databaseQueryPerformance.totalQueries)}
                  detail="Total instrumented Prisma model operations captured in this process."
                  status={databaseQueryPerformance.totalQueries ? "Ready" : "Planned"}
                />
                <StatusDetailCard
                  label="Slow query rate"
                  value={databaseSlowRate}
                  detail={`${formatCount(databaseQueryPerformance.slowQueries)} slow operations captured so far.`}
                  status={databaseQueryPerformance.slowQueries ? "WARNING" : "Ready"}
                />
              </div>
            </div>

            <div className="p-5">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Setup and access
              </h3>
              <div className="mt-4 space-y-3">
                <CommandRow
                  command='DATABASE_QUERY_TIMING_ENABLED="true"'
                  detail="Turns on safe Prisma model operation timing after the runtime restarts."
                />
                <CommandRow
                  command='DATABASE_QUERY_SLOW_THRESHOLD_MS="250"'
                  detail="Optional slow query threshold. Raise it if production logs are too noisy."
                />
                <CommandRow
                  command="GET /api/performance/database"
                  detail="Authenticated admin JSON endpoint for the same process-local summary."
                />
              </div>
            </div>
          </div>

          <div className="grid gap-0 divide-y divide-gray-100 border-t border-gray-100 dark:divide-gray-800 dark:border-gray-800 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)] xl:divide-x xl:divide-y-0">
            <div className="p-5">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Top query labels
              </h3>
              {topDatabaseQueryLabels.length ? (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                    <thead>
                      <tr className="text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                        <th className="py-2 pr-4">Label</th>
                        <th className="py-2 pr-4">Count</th>
                        <th className="py-2 pr-4">Avg</th>
                        <th className="py-2 pr-4">Max</th>
                        <th className="py-2">Slow</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {topDatabaseQueryLabels.map((metric) => (
                        <tr key={metric.label} className="text-sm text-gray-700 dark:text-gray-300">
                          <td className="max-w-[260px] py-3 pr-4 font-mono text-xs text-gray-700 dark:text-gray-300">
                            {metric.label}
                          </td>
                          <td className="py-3 pr-4">{formatCount(metric.count)}</td>
                          <td className="py-3 pr-4">{formatMs(metric.averageMs)}</td>
                          <td className="py-3 pr-4">{formatMs(metric.maxMs)}</td>
                          <td className="py-3">{formatCount(metric.slowCount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-gray-500 dark:text-gray-400">
                  No Prisma model timings have been captured for this process yet.
                </p>
              )}
            </div>

            <div className="p-5">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Recent slow labels
              </h3>
              {recentSlowDatabaseQueries.length ? (
                <div className="mt-4 space-y-3">
                  {recentSlowDatabaseQueries.map((sample) => (
                    <div
                      key={`${sample.occurredAt}-${sample.label}`}
                      className="rounded-lg border border-gray-100 p-3 dark:border-gray-800"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <code className="break-all font-mono text-xs text-gray-700 dark:text-gray-300">
                          {sample.label}
                        </code>
                        <span className="text-xs font-semibold text-gray-800 dark:text-white/90">
                          {formatMs(sample.durationMs)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        {formatDateTime(sample.occurredAt)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-gray-500 dark:text-gray-400">
                  No slow Prisma labels have been captured above the current threshold.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <SectionHeader
            title="Data retention"
            description="Operational cleanup readiness, dry-run counts and recent retention audit history."
            help="This preview uses the retention service in dry-run mode. It never deletes rows or stores customer record data from this System page."
          />
          <div className="grid gap-0 divide-y divide-gray-100 dark:divide-gray-800 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)] xl:divide-x xl:divide-y-0">
            <div className="p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                    Retention preview
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
                    {retentionData.available
                      ? `${formatCount(retentionMatchedRows)} operational rows currently match retention rules.`
                      : "Retention preview is unavailable because operational reads failed."}
                  </p>
                </div>
                <StatusBadge>{retentionReadinessStatus}</StatusBadge>
              </div>
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                <StatusDetailCard
                  label="Endpoint secret"
                  value={retentionSecretReady ? "Configured" : "Missing"}
                  detail="OPERATIONAL_RETENTION_SECRET or CRON_SECRET protects /api/maintenance/retention."
                  status={retentionSecretReady ? "Ready" : "Planned"}
                />
                <StatusDetailCard
                  label="Scheduled function"
                  value={retentionCronEnabled ? "Enabled" : "Disabled"}
                  detail="Netlify runs the retention function daily at 02:30 only when enabled."
                  status={retentionCronEnabled ? "Ready" : "Planned"}
                />
                <StatusDetailCard
                  label="Scheduled mode"
                  value={
                    retentionCronEnabled
                      ? retentionCronDryRun
                        ? "Dry run"
                        : "Cleanup"
                      : "Not scheduled"
                  }
                  detail="Use dry-run mode first to inspect counts before allowing deletes."
                  status={
                    retentionCronEnabled && retentionCronDryRun
                      ? "WARNING"
                      : retentionCronEnabled
                        ? "Ready"
                        : "Planned"
                  }
                />
                <StatusDetailCard
                  label="Last real run"
                  value={
                    retentionData.lastRun
                      ? formatRelativeDate(retentionData.lastRun.createdAt)
                      : "No run logged"
                  }
                  detail="Real retention runs write maintenance.retention.run audit events."
                  status={retentionData.lastRun ? "Ready" : "Planned"}
                />
              </div>
            </div>

            <div className="p-5">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Commands
              </h3>
              <div className="mt-4 space-y-3">
                <CommandRow
                  command="GET /api/maintenance/retention"
                  detail="Authenticated by bearer secret; returns dry-run counts only."
                />
                <CommandRow
                  command="POST /api/maintenance/retention?dryRun=1"
                  detail="Explicit dry-run POST for scheduled-job testing."
                />
                <CommandRow
                  command="POST /api/maintenance/retention"
                  detail="Runs the configured operational retention cleanup and writes an audit rollup."
                />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 p-5 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
              Retention targets
            </h3>
            {retentionPreviewRows.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead>
                    <tr className="text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                      <th className="py-2 pr-4">Target</th>
                      <th className="py-2 pr-4">Window</th>
                      <th className="py-2 pr-4">Matched</th>
                      <th className="py-2">Cutoff</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {retentionPreviewRows.map((target) => (
                      <tr key={target.id} className="text-sm text-gray-700 dark:text-gray-300">
                        <td className="py-3 pr-4">
                          <div className="font-medium text-gray-800 dark:text-white/90">
                            {target.label}
                          </div>
                          <div className="font-mono text-xs text-gray-500 dark:text-gray-400">
                            {target.entity}
                          </div>
                        </td>
                        <td className="py-3 pr-4">{pluralise(target.retentionDays, "day")}</td>
                        <td className="py-3 pr-4">{formatCount(target.matched)}</td>
                        <td className="py-3">{formatDateTime(target.cutoff)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 text-sm leading-6 text-gray-500 dark:text-gray-400">
                Retention target preview is unavailable.
              </p>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <SectionHeader
            title="Marketing rollups"
            description="Daily summary-row refresh status for compact marketing dashboard and reporting data."
            help="This preview refreshes a 30-day rollup range in dry-run mode. It does not write summary rows or touch raw attribution records from this System page."
          />
          <div className="grid gap-0 divide-y divide-gray-100 dark:divide-gray-800 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)] xl:divide-x xl:divide-y-0">
            <div className="p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                    Rollup preview
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
                    {marketingRollupData.available
                      ? `${formatCount(marketingRollupPreview?.rowsMatched ?? 0)} daily summary rows would be refreshed for the dashboard window.`
                      : "Marketing rollup preview is unavailable because operational reads failed."}
                  </p>
                </div>
                <StatusBadge>{marketingRollupStatus}</StatusBadge>
              </div>
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                <StatusDetailCard
                  label="Endpoint secret"
                  value={marketingRollupSecretReady ? "Configured" : "Missing"}
                  detail="MARKETING_ROLLUP_SECRET or CRON_SECRET protects /api/maintenance/marketing-rollups."
                  status={marketingRollupSecretReady ? "Ready" : "Planned"}
                />
                <StatusDetailCard
                  label="Scheduled function"
                  value={marketingRollupCronEnabled ? "Enabled" : "Disabled"}
                  detail="Netlify runs the rollup function daily at 02:00 only when enabled."
                  status={marketingRollupCronEnabled ? "Ready" : "Planned"}
                />
                <StatusDetailCard
                  label="Scheduled mode"
                  value={
                    marketingRollupCronEnabled
                      ? marketingRollupCronDryRun
                        ? "Dry run"
                        : "Refresh"
                      : "Not scheduled"
                  }
                  detail="Use dry-run mode first to inspect counts before writing summary rows."
                  status={
                    marketingRollupCronEnabled && marketingRollupCronDryRun
                      ? "WARNING"
                      : marketingRollupCronEnabled
                        ? "Ready"
                        : "Planned"
                  }
                />
                <StatusDetailCard
                  label="Last real refresh"
                  value={
                    marketingRollupData.lastRun
                      ? formatRelativeDate(marketingRollupData.lastRun.createdAt)
                      : "No refresh logged"
                  }
                  detail="Real rollup refreshes write marketing.rollups.daily_refreshed audit events."
                  status={marketingRollupData.lastRun ? "Ready" : "Planned"}
                />
              </div>
            </div>

            <div className="p-5">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Preview totals
              </h3>
              <div className="mt-4 space-y-3">
                <StatusDetailCard
                  label="Sessions"
                  value={formatCount(marketingRollupPreview?.totals.sessions ?? 0)}
                  detail={`${marketingRollupSystemPreviewDays}-day dry-run visitor-session total.`}
                  status={marketingRollupData.available ? "Ready" : "Error"}
                />
                <StatusDetailCard
                  label="Attributed leads"
                  value={formatCount(
                    (marketingRollupPreview?.totals.formLeads ?? 0) +
                      (marketingRollupPreview?.totals.phoneLeads ?? 0),
                  )}
                  detail={`${formatCount(marketingRollupPreview?.totals.formLeads ?? 0)} forms and ${formatCount(marketingRollupPreview?.totals.phoneLeads ?? 0)} phone leads.`}
                  status={marketingRollupData.available ? "Ready" : "Error"}
                />
                <StatusDetailCard
                  label="Imported activity"
                  value={formatCurrencyCents(marketingRollupSpendCents)}
                  detail={`${formatCount(
                    marketingRollupPreview?.totals.clicks ?? 0,
                  )} clicks and ${formatCount(
                    marketingRollupPreview?.totals.conversions ?? 0,
                  )} conversions.`}
                  status={marketingRollupData.available ? "Ready" : "Error"}
                />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 p-5 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
              Commands
            </h3>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <CommandRow
                command="GET /api/maintenance/marketing-rollups?windowDays=30"
                detail="Authenticated by bearer secret; returns dry-run summary counts only."
              />
              <CommandRow
                command="POST /api/maintenance/marketing-rollups?windowDays=90&dryRun=1"
                detail="Explicit dry-run POST for scheduled-job testing."
              />
              <CommandRow
                command="POST /api/maintenance/marketing-rollups?windowDays=90"
                detail="Refreshes daily marketing summary rows and writes an audit rollup."
              />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <SectionHeader
            title="Environment readiness"
            description="Safe runtime checks for required and recommended environment configuration."
            help="Only key names and status are shown. Secret values, database URLs and encrypted credentials are never displayed."
          />
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-white/[0.02]">
                <tr className="text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
                  <th className="px-5 py-3">Check</th>
                  <th className="px-5 py-3">Key</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {environmentChecks.map((check) => (
                  <tr key={check.key} className="text-sm text-gray-700 dark:text-gray-300">
                    <td className="px-5 py-4 font-medium text-gray-800 dark:text-white/90">
                      {check.label}
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-gray-600 dark:text-gray-400">
                      {check.key}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge>{check.status}</StatusBadge>
                    </td>
                    <td className="max-w-[520px] px-5 py-4 text-gray-500 dark:text-gray-400">
                      {check.detail}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <SectionHeader
            title="Integration overview"
            description="Connection status for core services and marketing platforms."
            help="Uses IntegrationConnection rows only. The dashboard does not display saved config or encrypted credential values."
          />
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-white/[0.02]">
                <tr className="text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
                  <th className="px-5 py-3">Provider</th>
                  <th className="px-5 py-3">Area</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Last saved</th>
                  <th className="px-5 py-3">Purpose</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {expectedIntegrationProviders.map((provider) => {
                  const connection = connectionByProvider.get(provider.provider);

                  return (
                    <tr key={provider.provider} className="text-sm text-gray-700 dark:text-gray-300">
                      <td className="px-5 py-4">
                        <div className="font-medium text-gray-800 dark:text-white/90">
                          {provider.name}
                        </div>
                        <div className="font-mono text-xs text-gray-500 dark:text-gray-400">
                          {provider.provider}
                        </div>
                      </td>
                      <td className="px-5 py-4">{provider.area}</td>
                      <td className="px-5 py-4">
                        <StatusBadge>{integrationStatusLabel(connection?.status)}</StatusBadge>
                      </td>
                      <td className="px-5 py-4">{connectionUpdatedLabel(connection)}</td>
                      <td className="max-w-[520px] px-5 py-4 text-gray-500 dark:text-gray-400">
                        {provider.detail}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <SectionHeader
            title="Operational activity"
            description="Current session counts, active users and recent audit activity."
            help="Summarises operational database records so admins can quickly check whether the app is being used and whether audit events are being recorded."
          />
          <div className="grid gap-0 divide-y divide-gray-100 dark:divide-gray-800 md:grid-cols-3 md:divide-x md:divide-y-0">
            <ActivityMetric
              label="Active sessions"
              value={operationalData.activeSessionCount?.toString() ?? "Unavailable"}
              detail={
                operationalData.expiredSessionCount === null
                  ? "Database activity could not be loaded"
                  : `${operationalData.expiredSessionCount} expired session records retained`
              }
            />
            <ActivityMetric
              label="Active users"
              value={operationalData.activeUserCount?.toString() ?? "Unavailable"}
              detail="Users with ACTIVE account status"
            />
            <ActivityMetric
              label="Audit events"
              value={operationalData.recentAuditLogs.length.toString()}
              detail="Most recent records shown below"
            />
          </div>
          <AuditLogTable
            className="border-t border-gray-100 dark:border-gray-800"
            emptyMessage={
              operationalData.available
                ? "No audit records found yet."
                : "Operational activity is unavailable because database reads failed."
            }
            events={operationalData.recentAuditLogs}
          />
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <SectionHeader
            title="Implementation guardrails"
            description="Engineering notes for schema changes, permissions, deployment and handoff documentation."
            help="Summarises the development practices that keep CRM extensions consistent, deployable and supportable."
          />
          <div className="grid gap-0 divide-y divide-gray-100 dark:divide-gray-800 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
            <div className="p-5">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Development rules
              </h3>
              <ul className="mt-4 space-y-3 text-sm text-gray-600 dark:text-gray-400">
                <GuardrailItem>Use Prisma migrations for all schema changes.</GuardrailItem>
                <GuardrailItem>Keep permission checks server-side in actions, route handlers and server components.</GuardrailItem>
                <GuardrailItem>Keep feature work branch-based and merge through the documented git workflow.</GuardrailItem>
                <GuardrailItem>Document new modules in the shared project docs as the CRM is extended.</GuardrailItem>
              </ul>
            </div>
            <div className="p-5">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Reference docs
              </h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  "docs/PROJECT_STATE.md",
                  "docs/ARCHITECTURE.md",
                  "docs/GIT_WORKFLOW.md",
                  "docs/DEPLOYMENT_GUIDE.md",
                  "docs/NEON_DATABASE.md",
                ].map((doc) => (
                  <span
                    key={doc}
                    className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-white/10 dark:text-gray-300"
                  >
                    {doc}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

function HeaderLink({ children, href }: { children: string; href: string }) {
  return (
    <Link
      href={href}
      target={href.startsWith("/api/") ? "_blank" : undefined}
      rel={href.startsWith("/api/") ? "noreferrer" : undefined}
      className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
    >
      {children}
    </Link>
  );
}

function CommandRow({ command, detail }: { command: string; detail: string }) {
  return (
    <div className="rounded-lg border border-gray-100 p-3 dark:border-gray-800">
      <code className="block break-all rounded-md bg-gray-50 px-2.5 py-2 font-mono text-xs text-gray-700 dark:bg-white/[0.04] dark:text-gray-300">
        {command}
      </code>
      <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">{detail}</p>
    </div>
  );
}

function VerificationStep({ index, step }: { index: number; step: string }) {
  return (
    <div className="flex gap-3 rounded-lg border border-gray-100 p-3 dark:border-gray-800">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 dark:bg-brand-900/20 dark:text-brand-300">
        {index}
      </span>
      <p className="text-sm leading-6 text-gray-600 dark:text-gray-400">{step}</p>
    </div>
  );
}

function StatusRow({
  detail,
  label,
  status,
  value,
}: {
  detail: string;
  label: string;
  status: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gray-100 p-3 dark:border-gray-800 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <dt className="text-sm font-medium text-gray-800 dark:text-white/90">
          {label}
        </dt>
        <dd className="mt-1 text-sm text-gray-600 dark:text-gray-300">{value}</dd>
        <dd className="mt-1 text-xs text-gray-500 dark:text-gray-400">{detail}</dd>
      </div>
      <StatusBadge>{status}</StatusBadge>
    </div>
  );
}

function ActivityMetric({
  detail,
  label,
  value,
}: {
  detail: string;
  label: string;
  value: string;
}) {
  return (
    <div className="p-5">
      <div className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div className="mt-3 text-title-sm font-semibold text-gray-800 dark:text-white/90">
        {value}
      </div>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{detail}</p>
    </div>
  );
}

function GuardrailItem({ children }: { children: string }) {
  return (
    <li className="flex gap-2">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success-500" />
      <span>{children}</span>
    </li>
  );
}
