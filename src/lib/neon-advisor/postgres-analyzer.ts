import type {
  AdvisorCapability,
  AdvisorRuntime,
  PgActivitySummary,
  PgConnectionSummary,
  PgDatabaseOverview,
  PgDatabaseStats,
  PgIndexStats,
  PgIoStats,
  PgLockSummary,
  PgLockWaitSummary,
  PgSettingRow,
  PgStatementStats,
  PgTableStats,
  PgWalStats,
  PostgresAnalysisSnapshot,
} from "./types";
import {
  availableCapability,
  skippedCapability,
  unavailableCapability,
} from "./safety";

type QueryClient = NonNullable<AdvisorRuntime["prisma"]>;

const postgresSource = "postgres-system-views";

export async function analyzePostgres(
  prisma: AdvisorRuntime["prisma"],
): Promise<PostgresAnalysisSnapshot> {
  if (!prisma) {
    return skippedPostgresSnapshot("DATABASE_URL is not configured.");
  }

  const databaseOverview = await safeQueryOne<PgDatabaseOverview>(
    prisma,
    "database-overview",
    `
      SELECT
        current_database() AS database_name,
        current_setting('server_version') AS server_version,
        pg_database_size(current_database())::bigint AS database_size_bytes,
        now() AS collected_at
    `,
  );
  const settings = await safeQueryMany<PgSettingRow>(
    prisma,
    "database-settings",
    `
      SELECT name, setting, unit, context, source
      FROM pg_settings
      WHERE name IN (
        'autovacuum',
        'effective_cache_size',
        'idle_in_transaction_session_timeout',
        'log_min_duration_statement',
        'max_connections',
        'shared_buffers',
        'statement_timeout',
        'track_activity_query_size',
        'track_counts',
        'track_io_timing',
        'work_mem'
      )
      ORDER BY name
    `,
  );
  const databaseStats = await safeQueryOne<PgDatabaseStats>(
    prisma,
    "database-statistics",
    `
      SELECT
        numbackends::int,
        xact_commit::bigint,
        xact_rollback::bigint,
        blks_read::bigint,
        blks_hit::bigint,
        tup_returned::bigint,
        tup_fetched::bigint,
        tup_inserted::bigint,
        tup_updated::bigint,
        tup_deleted::bigint,
        conflicts::bigint,
        temp_files::bigint,
        temp_bytes::bigint,
        deadlocks::bigint,
        blk_read_time::float8,
        blk_write_time::float8
      FROM pg_stat_database
      WHERE datname = current_database()
    `,
  );
  const connectionSummary = await safeQueryOne<PgConnectionSummary>(
    prisma,
    "connection-summary",
    `
      SELECT
        COUNT(*)::int AS current_database_connections,
        COUNT(*) FILTER (WHERE state = 'active')::int AS active_connections,
        COUNT(*) FILTER (WHERE state = 'idle')::int AS idle_connections,
        COUNT(*) FILTER (WHERE state = 'idle in transaction')::int AS idle_in_transaction_connections,
        COUNT(*) FILTER (WHERE wait_event_type IS NOT NULL)::int AS waiting_connections,
        (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_connections
      FROM pg_stat_activity
      WHERE datname = current_database()
    `,
  );
  const activitySummary = await safeQueryMany<PgActivitySummary>(
    prisma,
    "activity-summary",
    `
      SELECT
        state,
        wait_event_type,
        COUNT(*)::int AS count,
        MAX(EXTRACT(EPOCH FROM now() - state_change) * 1000)::bigint AS max_state_age_ms
      FROM pg_stat_activity
      WHERE datname = current_database()
      GROUP BY state, wait_event_type
      ORDER BY count DESC, state NULLS LAST, wait_event_type NULLS LAST
    `,
  );
  const lockSummary = await safeQueryMany<PgLockSummary>(
    prisma,
    "lock-summary",
    `
      SELECT mode, granted, COUNT(*)::int AS count
      FROM pg_locks
      GROUP BY mode, granted
      ORDER BY granted ASC, count DESC, mode ASC
    `,
  );
  const lockWaitSummary = await safeQueryOne<PgLockWaitSummary>(
    prisma,
    "lock-wait-summary",
    `
      SELECT
        COUNT(*) FILTER (WHERE NOT l.granted)::int AS waiting_locks,
        MAX(EXTRACT(EPOCH FROM now() - COALESCE(a.query_start, a.xact_start, a.state_change)) * 1000)::bigint AS max_wait_ms
      FROM pg_locks l
      LEFT JOIN pg_stat_activity a ON a.pid = l.pid
      WHERE NOT l.granted
    `,
  );
  const tableStats = await safeQueryMany<PgTableStats>(
    prisma,
    "table-statistics",
    `
      SELECT
        relid::regclass::text AS table_name,
        seq_scan::bigint,
        seq_tup_read::bigint,
        idx_scan::bigint,
        n_live_tup::bigint,
        n_dead_tup::bigint,
        n_tup_ins::bigint,
        n_tup_upd::bigint,
        n_tup_del::bigint,
        last_vacuum,
        last_autovacuum,
        last_analyze,
        last_autoanalyze,
        pg_relation_size(relid)::bigint AS table_bytes,
        pg_indexes_size(relid)::bigint AS index_bytes,
        pg_total_relation_size(relid)::bigint AS total_bytes
      FROM pg_stat_user_tables
      ORDER BY pg_total_relation_size(relid) DESC
      LIMIT 100
    `,
  );
  const indexStats = await safeQueryMany<PgIndexStats>(
    prisma,
    "index-statistics",
    `
      SELECT
        relname AS table_name,
        indexrelname AS index_name,
        idx_scan::bigint,
        idx_tup_read::bigint,
        idx_tup_fetch::bigint,
        pg_relation_size(indexrelid)::bigint AS index_bytes
      FROM pg_stat_user_indexes
      ORDER BY pg_relation_size(indexrelid) DESC, idx_scan ASC
      LIMIT 150
    `,
  );
  const ioStats = await safeQueryMany<PgIoStats>(
    prisma,
    "table-io-statistics",
    `
      SELECT
        relname AS table_name,
        heap_blks_read::bigint,
        heap_blks_hit::bigint,
        idx_blks_read::bigint,
        idx_blks_hit::bigint,
        toast_blks_read::bigint,
        toast_blks_hit::bigint
      FROM pg_statio_user_tables
      ORDER BY (heap_blks_read + idx_blks_read + toast_blks_read) DESC
      LIMIT 100
    `,
  );
  const pgStatStatementsInstalled = await detectPgStatStatements(prisma);
  const statementStats =
    pgStatStatementsInstalled.status === "available" &&
    pgStatStatementsInstalled.data
      ? await safeQueryMany<PgStatementStats>(
          prisma,
          "pg-stat-statements",
          `
            SELECT
              queryid::text,
              calls::bigint,
              rows::bigint,
              round(total_exec_time::numeric, 2)::float8 AS total_exec_time_ms,
              round(mean_exec_time::numeric, 2)::float8 AS mean_exec_time_ms,
              round(max_exec_time::numeric, 2)::float8 AS max_exec_time_ms,
              shared_blks_read::bigint,
              shared_blks_hit::bigint,
              temp_blks_written::bigint,
              left(regexp_replace(query, E'\\\\s+', ' ', 'g'), 500) AS query
            FROM pg_stat_statements
            WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
            ORDER BY total_exec_time DESC
            LIMIT 25
          `,
        )
      : skippedCapability<PgStatementStats[]>({
          name: "pg-stat-statements",
          reason: "pg_stat_statements is not installed or not visible.",
          source: "pg_stat_statements",
        });
  const walStats = await safeQueryOne<PgWalStats>(
    prisma,
    "wal-statistics",
    `
      SELECT
        wal_records::bigint,
        wal_bytes::bigint,
        wal_buffers_full::bigint,
        stats_reset
      FROM pg_stat_wal
    `,
  );

  const capabilities: AdvisorCapability<unknown>[] = [
    databaseOverview,
    settings,
    databaseStats,
    connectionSummary,
    activitySummary,
    lockSummary,
    lockWaitSummary,
    tableStats,
    indexStats,
    ioStats,
    pgStatStatementsInstalled,
    statementStats,
    walStats,
  ];

  return {
    activitySummary,
    capabilities,
    connectionSummary,
    databaseOverview,
    databaseStats,
    indexStats,
    ioStats,
    lockSummary,
    lockWaitSummary,
    pgStatStatementsInstalled,
    settings,
    statementStats,
    tableStats,
    walStats,
  };
}

async function detectPgStatStatements(prisma: QueryClient) {
  const result = await safeQueryOne<{ installed: boolean }>(
    prisma,
    "pg-stat-statements-capability",
    `
      SELECT EXISTS (
        SELECT 1
        FROM pg_extension
        WHERE extname = 'pg_stat_statements'
      ) AS installed
    `,
  );

  if (result.status !== "available") {
    return {
      ...result,
      data: false,
    } satisfies AdvisorCapability<boolean>;
  }

  return availableCapability<boolean>({
    data: Boolean(result.data?.installed),
    name: "pg-stat-statements-capability",
    source: "pg_extension",
  });
}

async function safeQueryMany<T>(
  prisma: QueryClient,
  name: string,
  query: string,
): Promise<AdvisorCapability<T[]>> {
  try {
    const data = await prisma.$queryRawUnsafe<T[]>(query);

    return availableCapability({ data, name, source: postgresSource });
  } catch (error) {
    return unavailableCapability<T[]>({ error, name, source: postgresSource });
  }
}

async function safeQueryOne<T>(
  prisma: QueryClient,
  name: string,
  query: string,
): Promise<AdvisorCapability<T>> {
  const result = await safeQueryMany<T>(prisma, name, query);

  if (result.status !== "available") {
    return result as AdvisorCapability<T>;
  }

  return availableCapability({
    data: result.data?.[0] ?? (null as T),
    name,
    source: postgresSource,
  });
}

function skippedPostgresSnapshot(reason: string): PostgresAnalysisSnapshot {
  const databaseOverview = skippedCapability<PgDatabaseOverview>({
    name: "database-overview",
    reason,
    source: postgresSource,
  });
  const settings = skippedCapability<PgSettingRow[]>({
    name: "database-settings",
    reason,
    source: postgresSource,
  });
  const databaseStats = skippedCapability<PgDatabaseStats>({
    name: "database-statistics",
    reason,
    source: postgresSource,
  });
  const connectionSummary = skippedCapability<PgConnectionSummary>({
    name: "connection-summary",
    reason,
    source: postgresSource,
  });
  const activitySummary = skippedCapability<PgActivitySummary[]>({
    name: "activity-summary",
    reason,
    source: postgresSource,
  });
  const lockSummary = skippedCapability<PgLockSummary[]>({
    name: "lock-summary",
    reason,
    source: postgresSource,
  });
  const lockWaitSummary = skippedCapability<PgLockWaitSummary>({
    name: "lock-wait-summary",
    reason,
    source: postgresSource,
  });
  const tableStats = skippedCapability<PgTableStats[]>({
    name: "table-statistics",
    reason,
    source: postgresSource,
  });
  const indexStats = skippedCapability<PgIndexStats[]>({
    name: "index-statistics",
    reason,
    source: postgresSource,
  });
  const ioStats = skippedCapability<PgIoStats[]>({
    name: "table-io-statistics",
    reason,
    source: postgresSource,
  });
  const pgStatStatementsInstalled = skippedCapability<boolean>({
    name: "pg-stat-statements-capability",
    reason,
    source: "pg_extension",
  });
  const statementStats = skippedCapability<PgStatementStats[]>({
    name: "pg-stat-statements",
    reason,
    source: "pg_stat_statements",
  });
  const walStats = skippedCapability<PgWalStats>({
    name: "wal-statistics",
    reason,
    source: postgresSource,
  });
  const capabilities: AdvisorCapability<unknown>[] = [
    databaseOverview,
    settings,
    databaseStats,
    connectionSummary,
    activitySummary,
    lockSummary,
    lockWaitSummary,
    tableStats,
    indexStats,
    ioStats,
    pgStatStatementsInstalled,
    statementStats,
    walStats,
  ];

  return {
    activitySummary,
    capabilities,
    connectionSummary,
    databaseOverview,
    databaseStats,
    indexStats,
    ioStats,
    lockSummary,
    lockWaitSummary,
    pgStatStatementsInstalled,
    settings,
    statementStats,
    tableStats,
    walStats,
  };
}
