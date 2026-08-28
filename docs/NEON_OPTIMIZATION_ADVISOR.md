# Neon Optimization Advisor

The Neon Optimization Advisor is a read-only cost and performance review tool
for the CRM database. The first milestone only collects telemetry and produces
recommendations. It does not change Neon, PostgreSQL, schema, data, indexes or
application code.

## Operating Mode

Default mode:

```bash
NEON_ADVISOR_MODE="READ_ONLY_ADVISOR"
```

Future modes are represented in code but disabled for production execution:

- `APPROVAL_REQUIRED`: prepare exact changes and wait for human approval.
- `SAFE_AUTOMATION`: only allow-listed low-risk actions may run.

The current executor has an empty allow-list and throws if execution is
attempted.

## Run

```bash
npm run neon:advisor
```

The command prints a report and writes a sanitized JSON audit file to:

```bash
.neon-advisor/latest-report.json
```

Disable file output with:

```bash
NEON_ADVISOR_OUTPUT_PATH="none" npm run neon:advisor
```

## Data Sources

Repository inspection:

- `package.json`
- `netlify.toml`
- selected environment-variable presence and connection shape

PostgreSQL read-only views:

- `pg_stat_activity`
- `pg_stat_database`
- `pg_stat_user_tables`
- `pg_stat_user_indexes`
- `pg_statio_user_tables`
- `pg_locks`
- `pg_settings`
- `pg_stat_wal` where available
- `pg_stat_statements` where installed and visible

Neon API, when configured:

- project details
- branches
- endpoints
- recent operations
- consumption history where the API key/org/project permissions allow it

## Required Environment Variables

For PostgreSQL analysis:

```bash
DATABASE_URL="postgresql://..."
```

For Neon project telemetry:

```bash
NEON_API_KEY="..."
NEON_PROJECT_ID="..."
```

For organisation-level consumption history, if applicable:

```bash
NEON_ORG_ID="..."
```

## Optional Cost Inputs

The advisor does not hardcode Neon pricing. Set these to get monetary estimates:

```bash
NEON_ADVISOR_CURRENCY="GBP"
NEON_ADVISOR_COMPUTE_HOURLY_COST="0"
NEON_ADVISOR_STORAGE_GB_MONTH_COST="0"
NEON_ADVISOR_BRANCH_MONTHLY_COST="0"
```

If cost rates are not configured, recommendations still show resource impact
and validation steps, but monthly savings are labelled unavailable.

## Guardrails

Configurable safety thresholds:

```bash
NEON_ADVISOR_ERROR_RATE_INCREASE_LIMIT_POINTS="1"
NEON_ADVISOR_P50_LATENCY_INCREASE_LIMIT_PERCENT="10"
NEON_ADVISOR_P95_LATENCY_INCREASE_LIMIT_PERCENT="10"
NEON_ADVISOR_P99_LATENCY_INCREASE_LIMIT_PERCENT="10"
NEON_ADVISOR_DB_CPU_SATURATION_PERCENT="80"
NEON_ADVISOR_MEMORY_PRESSURE_PERCENT="85"
NEON_ADVISOR_CONNECTION_SATURATION_PERCENT="80"
NEON_ADVISOR_QUERY_DURATION_MS="500"
NEON_ADVISOR_LOCK_WAIT_MS="1000"
```

Example rollback rule used by the report:

```text
rollback if p95 latency increases by more than 10% or application error rate
increases by more than 1 percentage point or database connection saturation
exceeds 80% or database CPU exceeds 80% after a change
```

## Read-Only Permissions

Use the least privileged credentials available:

- Neon API key with project/org read access only.
- PostgreSQL role that can read PostgreSQL catalog and statistics views.
- No write, DDL, extension creation, branch deletion or production admin
  permissions are required for the first milestone.

## Safety Assumptions

- The advisor never deletes production data.
- The advisor never drops tables, columns or indexes.
- The advisor never alters schema or retention rules.
- The advisor never rewrites production SQL.
- The advisor never reduces compute capacity automatically.
- Recommendations distinguish measured evidence from estimates.
- Query text from `pg_stat_activity` is not collected.
- Normalized `pg_stat_statements` text is truncated and treated as diagnostic
  evidence only.
- Generated JSON output redacts sensitive-looking keys and URL values.

## Validation Workflow

For any future approved change:

1. Capture a pre-change advisor report.
2. Capture application health, latency, error-rate and database metrics.
3. Apply the exact approved change only.
4. Validate `/api/health` and the affected CRM workflow.
5. Compare p50, p95, p99, errors, active connections, slow queries and lock
   waits against baseline.
6. Roll back if the configured guardrails are breached.

## Current Boundaries

This milestone is intentionally advisory-only. Schema changes, Neon endpoint
changes, branch deletion, index changes, SQL rewrites and retention changes all
require separate human approval and a purpose-built implementation.
