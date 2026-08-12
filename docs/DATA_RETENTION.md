# Data Retention

The CRM has two retention layers:

- Tracking Engine retention: attribution snapshots, records, number
  assignments and debug events. See `docs/ATTRIBUTION_RETENTION.md`.
- Operational retention: high-volume operational history that can grow without
  changing customer CRM records.

Operational retention never deletes contacts, companies, opportunities, calls,
emails, sales communications, tasks, notes or file assets.

The CRM also has a marketing rollup layer for compact reporting summaries. It
does not delete raw marketing data; it writes daily summary rows that dashboards
and future reports can read instead of repeatedly aggregating raw event tables.

## Operational Retention Policies

Current fixed policies:

- Expired sessions: 30 days after expiry.
- Expired password reset/setup tokens: 7 days after expiry.
- Dormant auth throttle buckets: 7 days after last update once no active block
  remains.
- Attribution install check history: 90 days.
- Report run history: 180 days.
- Marketing integration sync logs: 180 days.
- Processed conversion upload rows: 365 days, only `SENT` and `SKIPPED` rows.
  Pending and failed rows are retained for retry/review.
- Background job history: 365 days for finished `SUCCESS`, `WARNING` and
  `ERROR` runs. Active `RUNNING` rows are retained for investigation.
- Audit logs: 730 days.

Every real operational retention run writes an `AuditLog` rollup with matched
and deleted counts per target. API, scheduled and manual retention runs also
write a `BackgroundJobRun` summary with trigger, status, duration and record
counts. Settings > System dry-run previews do not write audit or job-history
rows.

## Manual Check

Admins can review retention readiness and dry-run match counts in
**Settings > System > Data retention**. The System page calls the retention
service in dry-run mode only; it does not delete rows or write retention audit
events or background job history.

Dry run:

```bash
curl -X GET https://crm.id30.com/api/maintenance/retention \
  -H "Authorization: Bearer $OPERATIONAL_RETENTION_SECRET"
```

Real run:

```bash
curl -X POST https://crm.id30.com/api/maintenance/retention \
  -H "Authorization: Bearer $OPERATIONAL_RETENTION_SECRET"
```

`CRON_SECRET` can be used instead of `OPERATIONAL_RETENTION_SECRET` if a shared
maintenance secret is preferred.

## Scheduled Runs

Netlify includes `netlify/functions/run-operational-retention.mjs`, scheduled
daily at 02:30. It is disabled unless:

```text
OPERATIONAL_RETENTION_CRON_ENABLED=true
OPERATIONAL_RETENTION_SECRET=<shared secret>
```

Optional:

```text
OPERATIONAL_RETENTION_CRON_DRY_RUN=true
```

Use dry-run mode first on a production account to inspect counts before
allowing deletes.

## Marketing Daily Rollups

`MarketingDailyRollup` stores one workspace-wide `ALL` source / `ALL` provider
row per day with:

- visitor sessions;
- attribution records;
- form leads;
- phone leads;
- imported clicks, impressions, conversions and spend.

The Dashboard marketing summary uses rollups only when the full 30-day window
has daily coverage. Until then, it falls back to the existing raw attribution
and spend aggregate queries.

Admins can review marketing rollup readiness and 30-day dry-run totals in
**Settings > System > Marketing rollups**. The System page does not write
summary rows or background job history; it only previews the refresh totals.

Dry run:

```bash
curl -X GET "https://crm.id30.com/api/maintenance/marketing-rollups?windowDays=90" \
  -H "Authorization: Bearer $MARKETING_ROLLUP_SECRET"
```

Real refresh:

```bash
curl -X POST "https://crm.id30.com/api/maintenance/marketing-rollups?windowDays=90" \
  -H "Authorization: Bearer $MARKETING_ROLLUP_SECRET"
```

`CRON_SECRET` can be used instead of `MARKETING_ROLLUP_SECRET`.

Netlify includes `netlify/functions/refresh-marketing-rollups.mjs`, scheduled
daily at 02:00. It is disabled unless:

```text
MARKETING_ROLLUP_CRON_ENABLED=true
MARKETING_ROLLUP_SECRET=<shared secret>
```

Optional:

```text
MARKETING_ROLLUP_CRON_DRY_RUN=true
MARKETING_ROLLUP_CRON_WINDOW_DAYS=90
```

## Background Job History

`BackgroundJobRun` stores compact run history for operational retention,
marketing daily rollups, marketing conversion upload preparation/processing
and advertising spend imports. It stores job metadata, trigger, dry-run flag,
status, record counts, duration, summary JSON and error text. It must not store
provider credentials, raw form payloads or customer secrets.

Admins can review recent runs in **Settings > System > Background jobs**.
Running jobs older than `BACKGROUND_JOB_STALE_MINUTES` are treated as stale;
the default threshold is 30 minutes. Admin header notifications alert on stale
running jobs and recent failed job runs.
