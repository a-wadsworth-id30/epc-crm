# Deployment Guide

For current live status and operational gotchas, read `docs/PROJECT_STATE.md`
before deploying.

This CRM currently deploys to Netlify:

- Netlify Next.js runtime.
- Neon Postgres for production database.
- Prisma migrations with `migrate deploy` during the Netlify build.
- R2 and Twilio credentials configured in the CRM integration cards.

## Preflight

Run locally before deploying:

```text
npm run env:check
npm run production:preflight
npm run verify
```

## Production Database

Use Prisma migrations in production:

```text
npm run db:generate
npm run db:migrate:status
npm run db:migrate:deploy
```

Do not use `npm run db:push` against production.

## Netlify Runtime

Netlify should use the repository `netlify.toml`:

```text
Install command: npm ci
Build command: npm run netlify:build
Node.js version: 20
```

`npm run netlify:build` runs:

```text
prisma generate
prisma migrate status
prisma migrate deploy when pending or status is inconclusive
next build
```

This prevents Netlify from deploying application code that expects database
columns or tables that production Neon has not migrated yet.
When the status check confirms the database is already up to date, the build
skips `prisma migrate deploy` to avoid taking Prisma's advisory migration lock
on code-only deploys.

## Required Environment

Use `.env.production.example` as the Netlify template.

Required:

- `DATABASE_URL`
- `MIGRATE_DATABASE_URL` recommended for Netlify migration deploys
- `APP_BASE_URL`
- `SESSION_COOKIE_NAME`
- `SESSION_TTL_DAYS`
- `CREDENTIAL_ENCRYPTION_KEY`
- `MCP_CRM_SHARED_SECRET` when this CRM is connected to `mcp.id30.com`
- `ID30_AUTH_CRM_CLIENT_ID` and `ID30_AUTH_WORKSPACE_ID` when this CRM is
  connected to `mcp.id30.com`

Generate `CREDENTIAL_ENCRYPTION_KEY` with `openssl rand -base64 32` before
running preflight. Blank values and unresolved placeholders fail
`npm run env:check` and `npm run production:preflight`.

`DATABASE_URL` may be the Neon pooled URL for serverless runtime performance.
`MIGRATE_DATABASE_URL`, when set, should be the direct Neon connection URL. The
Netlify build temporarily uses it for `prisma migrate deploy`; runtime still
uses `DATABASE_URL`.

When the runtime `DATABASE_URL` uses a Neon pooled host, the shared Prisma
client adds conservative defaults of `connection_limit=1` and
`pool_timeout=10` unless those query parameters are already present. Override
with `PRISMA_CONNECTION_LIMIT` or `PRISMA_POOL_TIMEOUT` only after checking
Neon connection usage and CRM concurrency.

Optional:

- `CRM_WARMUP_PATHS`: comma-separated public paths for the scheduled Netlify
  warmup function. Defaults to `/signin`. Keep warmup paths DB-free; do not
  include `/api/health` or attribution config because they wake Neon compute.
- `MARKETING_UPLOAD_CRON_ENABLED`: set to `true` to let the scheduled Netlify
  conversion-upload function call the protected upload processor.
- `MARKETING_UPLOAD_CRON_SECRET`: shared secret required by
  `/api/marketing/conversion-uploads/process` and the scheduled function.
- `MARKETING_UPLOAD_CRON_DRY_RUN`: set to `true` to keep the scheduled job in
  inspection mode without sending provider uploads.
- `MARKETING_UPLOAD_CRON_PREPARE`: defaults to `true`; set to `false` if the
  scheduled job should only process already prepared upload rows.
- `MARKETING_UPLOAD_CRON_LIMIT`: optional per-run upload row cap, default `50`,
  maximum `250`.
- `OPERATIONAL_RETENTION_SECRET`: shared secret for
  `/api/maintenance/retention`; `CRON_SECRET` can be used instead when a single
  maintenance secret is preferred.
- `OPERATIONAL_RETENTION_CRON_ENABLED`: set to `true` to let the scheduled
  Netlify retention function purge old operational history.
- `OPERATIONAL_RETENTION_CRON_DRY_RUN`: set to `true` to inspect scheduled
  retention counts without deleting rows.
- `MARKETING_ROLLUP_SECRET`: shared secret for
  `/api/maintenance/marketing-rollups`; `CRON_SECRET` can be used instead.
- `MARKETING_ROLLUP_CRON_ENABLED`: set to `true` to let the scheduled Netlify
  function refresh daily marketing summary rollups.
- `MARKETING_ROLLUP_CRON_DRY_RUN`: set to `true` to inspect rollup counts
  without writing summary rows.
- `MARKETING_ROLLUP_CRON_WINDOW_DAYS`: optional rollup refresh window, default
  `90`, maximum `730`.
- `BACKGROUND_JOB_STALE_MINUTES`: optional running background job age threshold
  for Settings > System and admin header alerts, default `30`, minimum `5`,
  maximum `1440`.
- `MCP_CRM_SHARED_SECRET`: shared HMAC secret for signed read-only requests
  from `mcp.id30.com`. This must match the MCP Netlify environment and should
  be rotated if a client workspace is disconnected.
- `ID30_AUTH_BASE_URL`, `ID30_AUTH_CRM_CLIENT_ID` and
  `ID30_AUTH_WORKSPACE_ID`: identify the Auth broker and workspace expected in
  signed MCP requests. These IDs are not secrets, but they must match the Auth
  client registration used by `mcp.id30.com`.

If `MIGRATE_DATABASE_URL` is not set and `DATABASE_URL` points at the Neon
pooler host, the build still attempts migrations but prints a warning. Prefer
the direct Neon connection for migration deploys to avoid pooler-specific
migration lock issues.

`scripts/deploy-migrations.mjs` first runs `prisma migrate status`. If Prisma
confirms the database is already up to date, it skips `migrate deploy`. If
pending migrations exist or the status check is inconclusive, it runs
`migrate deploy` and retries transient advisory-lock timeouts before failing
the Netlify build. Optional tuning:

- `PRISMA_MIGRATE_DEPLOY_ATTEMPTS` defaults to `6`.
- `PRISMA_MIGRATE_DEPLOY_RETRY_MS` defaults to `15000`.
- `PRISMA_MIGRATE_DEPLOY_STATUS_CHECK=false` disables the preflight status
  check and always runs `migrate deploy`.

Desktop softphone downloads:

- `ID30_SOFTPHONE_DOWNLOAD_BASE_URL` should point at the public folder used by
  the `Desktop Softphone Release` GitHub Actions workflow, for example
  `https://downloads.example.com/desktop-softphone`.
- The current macOS fallback is hosted in the dedicated public R2 bucket
  `id30-softphone-downloads` at
  `https://pub-dd0c50b7d886446ea973dd80b6ea38f6.r2.dev`.
- `/api/desktop-softphone/download` is the authenticated staff download path.
  `/api/desktop-softphone/install-macos` is also authenticated and retained only
  as a legacy script route; do not advertise public curl installer commands.

First bootstrap only:

- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_PASSWORD`
- `SEED_ADMIN_NAME`

Remote or production-like database seeds require explicit `SEED_ADMIN_EMAIL`
and `SEED_ADMIN_PASSWORD`; the seed script refuses the local fallback password.

## Bootstrap

After the production database is migrated:

```text
npm run db:seed
```

Change the seeded admin password after first login.

## Healthcheck

Healthcheck:

```text
GET /api/health
```

Use this for uptime and deployment freshness monitoring. The response includes
a public build fingerprint embedded into the compiled Next.js bundle:

```json
{
  "build": {
    "shortCommit": "c374b97"
  }
}
```

Detailed build metadata is available to authenticated CRM users at
`/api/build-info` and in Settings > System.

After every Netlify deploy, verify the live runtime is serving the
expected commit:

```text
npm run deploy:check
```

If `/api/health.build.shortCommit` does not match GitHub `main`, wait for or
retry the Netlify production deploy before testing live workflows.

Settings > System includes a read-only Schema migrations panel. It compares
committed Prisma migration folders with the runtime database
`_prisma_migrations` table and should show no failed or pending migrations
before handoff.

For deployment confidence before handoff, run the focused authenticated route
smoke test against a migrated and seeded environment:

```text
npm run smoke:routes
```

This checks the dashboard, Marketing, Sales, System, Integrations and Telephony
routes for server errors, sign-in redirects and shared admin error boundaries.

## Cold Starts

The repository includes `netlify/functions/warm-crm.mjs`, a scheduled Netlify
function that fetches DB-free public routes every five minutes. It currently
defaults to `/signin` only so the warmup does not keep Neon compute active.
This reduces serverless cold-start cost without defeating Neon autosuspend.

The repository also includes
`netlify/functions/process-conversion-uploads.mjs`, scheduled every 30 minutes.
It is disabled unless `MARKETING_UPLOAD_CRON_ENABLED=true` is set. When enabled,
it calls the protected conversion-upload processor with
`MARKETING_UPLOAD_CRON_SECRET`, optionally prepares new lifecycle upload rows,
and can run in dry-run mode through `MARKETING_UPLOAD_CRON_DRY_RUN=true`.

The repository also includes
`netlify/functions/run-operational-retention.mjs`, scheduled daily at 02:30. It
is disabled unless `OPERATIONAL_RETENTION_CRON_ENABLED=true` is set. When
enabled, it calls `/api/maintenance/retention` with
`OPERATIONAL_RETENTION_SECRET` or `CRON_SECRET`. Start with
`OPERATIONAL_RETENTION_CRON_DRY_RUN=true` to review matched counts before
allowing deletes. API and scheduled runs write compact background job history
visible in Settings > System.

The repository also includes
`netlify/functions/refresh-marketing-rollups.mjs`, scheduled daily at 02:00. It
is disabled unless `MARKETING_ROLLUP_CRON_ENABLED=true` is set. When enabled,
it calls `/api/maintenance/marketing-rollups` with `MARKETING_ROLLUP_SECRET`
or `CRON_SECRET` and refreshes compact daily marketing summary rows for the
configured window. API and scheduled refreshes write compact background job
history visible in Settings > System.

## Current Dev-Phase Rule

For now, Codex should deploy when completing a job. The expected handoff is:

1. Merge the completed PR to `main`.
2. Wait for or trigger the Netlify production deploy.
3. Run `npm run deploy:check` or compare `/api/health.build.shortCommit`
   against GitHub `main`.
4. State clearly whether the change is actually live.

This rule can be relaxed later when the project is treated as live production.

## Twilio

Once the Netlify URL is live, set the CRM webhook base URL to:

```text
https://crm.id30.com
```

The preflight command prints the exact Twilio URLs:

```text
npm run production:preflight
```

Then run the CRM-managed voice setup from Settings > Integrations > Twilio.
It creates or updates the Twilio TwiML App and Voice Intelligence service, then
saves the returned SIDs into CRM config.

## Storage

Cloudflare R2 remains configured through Settings > Integrations. The app only
needs `CREDENTIAL_ENCRYPTION_KEY` in the environment so those credentials can be
encrypted before storage. Use the same key for any environment that must
decrypt previously saved integration credentials.

## Desktop Softphone Releases

The CRM settings page does not serve desktop installer binaries directly. The
`Desktop Softphone Release` GitHub Actions workflow builds macOS and Windows
installers, publishes them to public R2-compatible storage, and creates the
static auto-update layout under `{ID30_SOFTPHONE_DOWNLOAD_BASE_URL}/updates`.
Packaged desktop apps show their installed version in the softphone Settings
panel, download updates in the background, and install automatically once no
call is active.

GitHub repository variable:

```text
DESKTOP_SOFTPHONE_PUBLIC_BASE_URL=https://downloads.example.com/desktop-softphone
```

GitHub Actions secrets:

```text
DESKTOP_SOFTPHONE_R2_ACCOUNT_ID
DESKTOP_SOFTPHONE_R2_ACCESS_KEY_ID
DESKTOP_SOFTPHONE_R2_SECRET_ACCESS_KEY
DESKTOP_SOFTPHONE_R2_BUCKET
```

For normal double-click macOS installation, configure Developer ID signing and
notarization before publishing the mac artifact. The desktop Forge config reads:

```text
MACOS_CODESIGN_IDENTITY="Developer ID Application: ..."
MACOS_INSTALLER_IDENTITY="Developer ID Installer: ..."
APPLE_API_KEY_PATH=/path/to/AuthKey_XXXXXXXXXX.p8
APPLE_API_KEY_ID=XXXXXXXXXX
APPLE_API_ISSUER=<issuer UUID>
ID30_SOFTPHONE_BUILD_MAC_INSTALLER=true
```

Without those credentials, downloaded macOS apps can be blocked by Gatekeeper.
Prefer signed and notarized builds before distributing the macOS download to
client teams.
