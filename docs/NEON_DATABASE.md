# Neon Database Workflow

## Core Rule

Do not let multiple developers make schema changes directly against the shared live Neon database.

Use Neon branches for development and keep production migrations controlled.

## Recommended Setup

Each developer should have their own Neon branch:

```text
main production branch
├── dev/david
├── dev/developer-name
└── preview/pr-123
```

Give each developer a `.env` pointing at their own Neon branch, not the live production branch.

Required local values:

```text
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DB?sslmode=require"
APP_BASE_URL="http://localhost:3001"
SESSION_COOKIE_NAME="id30_crm_session"
SESSION_TTL_DAYS="7"
CREDENTIAL_ENCRYPTION_KEY="<same key if they need to decrypt existing integration credentials>"
```

Use the Neon pooled URL for app runtime and a direct/non-pooled Neon connection
for migration commands when possible. Pooled URLs reduce serverless connection
churn, but can cause issues with Prisma schema migration workflows.

## App Data Changes

For normal app writes through the CRM UI or server actions:

```bash
npm run dev
```

The app writes through `DATABASE_URL`.

If writes fail, check:

- the Neon branch is active;
- the connection string has the correct password;
- the database user has write permissions;
- the URL includes `sslmode=require`;
- migrations have been applied to that branch.

## Schema Changes

For a developer creating a new migration on their own branch:

```bash
npm run db:generate
npm run db:migrate
```

This creates files under `prisma/migrations`. Commit those files with the code change.

Do not run `prisma db push` against production.

## Applying Existing Migrations

When a developer pulls new migrations:

```bash
npm run db:migrate:deploy
```

This applies committed migrations to their database branch.
Settings > System also shows a read-only migration readiness panel that
compares committed migration folders with the database `_prisma_migrations`
table. Use it to spot branches or deployments that are behind before running
route smoke tests.

## Production

Production migration should happen once, after merge:

```bash
npm run db:migrate:deploy
```

On the CRM Netlify deployment this is part of:

```bash
npm run netlify:build
```

iD30 Prospecting is the Hostinger deployment and may still use
`npm run hostinger:build`; do not assume that applies to the CRM.

Code that can safely operate without a newly introduced optional table or
column should use `src/lib/prisma-errors.ts` to catch only the expected Prisma
missing-schema errors and fall back deliberately. Do not catch broad database
errors around new queries; operator/type mistakes and permission failures
should still fail loudly.

## Common Errors

### Authentication failed

The `.env` has the wrong Neon user/password or branch connection string.

### Database does not exist

The connection string points to the wrong database name or a deleted Neon branch.

### Permission denied for schema public

The database user is not the owner or does not have write privileges.

Use a Neon role with write permissions for dev branches.

### Migration fails on pooled connection

Use the direct Neon connection string for migration commands, or create a separate dev branch connection string from Neon that is not the pooled endpoint.

### App works but integrations fail

If Twilio/R2 credentials were saved in another environment, the developer needs the matching `CREDENTIAL_ENCRYPTION_KEY` to decrypt them. This affects integrations, not basic database writes.

## Safe Handoff Checklist

For every new developer:

- create a Neon branch;
- send branch-specific `.env`;
- run `npm ci`;
- run `npm run db:generate`;
- run `npm run db:migrate:deploy`;
- run `npm run dev`;
- avoid production writes unless explicitly approved.
