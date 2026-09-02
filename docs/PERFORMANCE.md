# Performance

The CRM has a lightweight performance baseline that can be enabled without
adding a third-party monitoring service.

## Build Profiling

Run a production build and summarize the heaviest routes and static chunks:

```bash
npm run build:profile
```

If a build already exists, rerun only the summary:

```bash
npm run perf:bundle
```

The summary reads Next.js diagnostics from `.next/diagnostics` and static chunk
sizes from `.next/static/chunks`. It does not upload data anywhere.

Optional limits:

```bash
PERF_ROUTE_LIMIT=25 PERF_CHUNK_LIMIT=30 npm run perf:bundle
```

## Server Route Timing

Slow server-side work can be logged by enabling:

```bash
PERFORMANCE_LOGGING_ENABLED="true"
PERFORMANCE_LOGGING_THRESHOLD_MS="400"
```

The authenticated admin layout logs slow bootstrap work, including session
lookup and CRM settings loading. Logs include timing labels and safe context
only; they must not include secrets, form values or customer records.
Global CRM settings and the app-shell projection are cached for one hour by
default through tagged Next.js caches. Admin settings saves revalidate the
shared tag, and `CRM_SETTINGS_CACHE_REVALIDATE_SECONDS` can tune the window
without code changes. The settings cache reads existing rows with `findUnique`
and only creates the default row when it is genuinely missing.

## Database Query Timing

Prisma model operation timing can be enabled without adding database writes or
capturing SQL:

```bash
DATABASE_QUERY_TIMING_ENABLED="true"
DATABASE_QUERY_SLOW_THRESHOLD_MS="250"
DATABASE_QUERY_METRIC_LIMIT="80"
DATABASE_QUERY_SLOW_SAMPLE_LIMIT="20"
```

`PERFORMANCE_LOGGING_ENABLED="true"` also enables the collector. Slow console
logging is separate and only turns on with:

```bash
DATABASE_QUERY_SLOW_LOGGING_ENABLED="true"
```

The collector stores process-local aggregates only: labels such as
`Contact.findMany`, counts, average/max duration and recent slow labels. It must
not store SQL, Prisma args, query parameters, form values, credentials or
customer records. Settings > System shows the same summary and authenticated
admins can read it from `/api/performance/database`.

Because the summary is in memory, it resets when the Node.js process restarts
and may only reflect the current runtime instance on serverless/edge-style
hosting. Use it to find candidate hot paths, then fix those routes with
explicit `select`, indexed lookup fields, pagination or grouped aggregate
queries.

## Database Payload Controls

High-volume list routes should use explicit Prisma `select` payloads and lazy
load large detail fields only when the user opens a record. For example, the
Inbox list excludes `EmailMessage` body, raw message, attachment, header and
metadata fields; the selected message body is loaded through an authenticated
detail endpoint.

Hot webhook and auth lookups should be backed by normalized/indexed lookup
fields. Contact phone matching stores `Contact.phoneNormalized` for indexed
caller matching instead of scanning and normalizing contact rows in Node.
Session maintenance has dedicated indexes for expiry pruning and per-user
active-session ordering.

Global record search should keep its candidate set bounded and use explicit
Prisma `select` payloads. Search terms are split into text and phone/digit
queries so numeric phone chunks do not fan out across every text column.
Broad `contains` searches across Contacts, Companies, Sales, Users, Inbox
headers/summaries and Storage metadata are backed by Postgres `pg_trgm` GIN
indexes. Inbox list search intentionally excludes full email body text so one
large unindexed field does not force expensive mailbox scans; load message
details for body review.

Reports should aggregate supporting data before materializing large related
record sets. The contacts/clients dataset reads grouped form-attribution counts
plus one latest form sample per contact instead of all form submissions for the
selected contacts.

Operational list routes should keep related-record payloads to the labels they
render. Tasks selects the task fields plus related company, contact and assignee
names instead of loading complete related rows for every page item.
Company list pages also use explicit scalar selects plus relation counts so
unused columns stay out of standard account browsing requests.
Storage keeps filtered file counts and current page rows live per request, but
caches global support data for 60 seconds: total counts, size summary, folder
filter labels, uploader filter labels and sanitized upload-policy flags. Upload,
edit, delete and R2 settings changes invalidate that cache.
Storage list browsing is backed by compact b-tree indexes for the controls that
sort or filter high-volume rows: file name, MIME/type, size, uploader/date,
created date and visibility/date. Text search remains handled by trigram GIN
indexes.

Telephony call-log and recording list APIs expose cursor metadata for adjacent
page loads and keep page-number fallbacks for direct links. Call-log rows use a
narrow list select instead of full related records. Recording summaries use
database counts/aggregates for normal filters instead of loading every matching
call row into application memory.
Recording transcript lookup/filter status is stored in indexed `CallLog`
columns (`transcriptSid`, `transcriptStatus`, `aiAnalysisStatus`) with metadata
kept as a display fallback for larger transcript/summary text.

Phone System server rendering avoids preparing inactive tab datasets. Heavy
call-log pages, recording pages, queue-entry detail rows, missed-call counts,
recent-call rows and business-number inventory are loaded only for the tabs that
render them, while small live status counts remain available for the shared
status strip.

Dashboard workspace-wide summary counts are cached for 60 seconds through
Next.js `unstable_cache`, covering company/contact counts, pipeline stage
aggregates, open-task counts and compact marketing rollups. User-specific setup
prompts and recent activity lists remain uncached so permission-sensitive and
actionable rows stay fresh.
Daily `MarketingDailyRollup` rows can now be refreshed through
`/api/maintenance/marketing-rollups` or the disabled-by-default scheduled
Netlify function. The Dashboard marketing summary reads those compact rows when
the full 30-day window is covered, then falls back to raw attribution/spend
aggregates until rollups are populated. Settings > System shows rollup
readiness, the latest real refresh and 30-day dry-run totals without writing
summary rows.

Realtime page refresh helpers close SSE connections and pause fallback timers
when the browser tab is hidden, then reconnect and refresh when the tab becomes
visible. This prevents hidden dashboards, inboxes, conversations and telephony
views from keeping low-value database polling active.
The sidebar application-health widget follows the same pattern: it checks
the DB-free `/api/health` route while visible/focused, then pauses hidden-tab
polling so idle CRM tabs do not keep doing passive network checks. Explicit
database proof is available at `/api/health?database=1` for operator checks.
The deploy-version guard checks the DB-free public `/api/build-version`
fingerprint every five minutes while visible, with immediate checks retained
for asset load errors. Authenticated `/api/build-info` remains available for
manual operator diagnostics rather than routine tab polling.
Settings > System now defaults to a light admin view that does not run optional
database diagnostics. Full system diagnostics remain available at
`/settings/system?diagnostics=1`, which runs the database ping, migration
readiness, background job history, integration rows, operational activity,
retention dry-run preview and marketing rollup dry-run preview only when an
admin explicitly requests them.
Normal CRM tabs also pause desktop-softphone presence checks while hidden; the
standalone `/softphone-window` heartbeat continues so live browser routing
presence is not marked offline just because the dashboard tab is inactive.

Operational retention is available through `/api/maintenance/retention` and an
optional disabled-by-default Netlify scheduled function. It removes old
operational history only: expired sessions, expired reset/setup tokens, dormant
auth throttle buckets, attribution install checks, report runs, marketing sync
logs, processed conversion upload rows and audit logs on conservative windows.
Retention predicates have supporting indexes, and every real run writes an
`AuditLog` rollup with matched/deleted counts by target. Settings > System
shows retention readiness and dry-run target counts without deleting rows.
Maintenance, rollup, conversion upload and ad spend jobs also write compact
`BackgroundJobRun` records with status, trigger, duration and read/write counts.
This gives admins job visibility without re-reading raw attribution or provider
payload data during normal System checks. Admin notifications also flag failed
jobs and running jobs older than `BACKGROUND_JOB_STALE_MINUTES`, which defaults
to 30 minutes.

## Web Vitals

Browser Web Vitals can be sent to `/api/performance/web-vitals` by enabling the
public client flag and the server logging flag:

```bash
NEXT_PUBLIC_PERFORMANCE_WEB_VITALS_ENABLED="true"
PERFORMANCE_WEB_VITALS_LOGGING_ENABLED="true"
```

The payload is intentionally small and privacy-safe: metric name, value, rating,
navigation type, build commit and pathname only. Query strings and page content
are not sent.
