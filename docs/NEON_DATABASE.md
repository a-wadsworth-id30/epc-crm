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

Production uses separate database roles as well as separate endpoints:

- `DATABASE_URL` uses the pooled endpoint and the restricted `crm_runtime`
  login. This role has schema usage plus CRUD access to application tables and
  sequences, but cannot create databases or roles, replicate, or bypass row
  security.
- `MIGRATE_DATABASE_URL` uses the direct endpoint and the `neondb_owner` role.
  Keep this owner credential limited to Netlify builds and controlled migration
  work; do not use it for application runtime queries.

Default privileges owned by `neondb_owner` grant the runtime role CRUD access
to tables and usage/select access to sequences created by future migrations. If
the migration owner changes, recreate those default grants for the new owner.

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

The migration `20261019152000_dashboard_layouts` adds role-default and
per-user dashboard layout tables. Dashboard reads fall back to code-defined
role defaults while this migration is pending, but saving a role or personal
layout requires the migration to have been applied.

The migration `20261103170000_gmail_mailbox_team_purposes` adds New Business,
Customer Success and Support to `EmailMailboxPurpose` and changes the default
for new mailbox rows to Sales. Existing Accounts and Shared values are retained
so the migration does not rewrite connected mailbox classifications.

The migration `20261106120000_email_message_user_state` adds per-user Gmail
read tracking. It does not rewrite existing `EmailMessage` rows: legacy READ
messages remain read for everyone, while newly imported UNREAD messages stay
unread independently until each authorised CRM user opens or replies to them.

The migration `20261106143000_email_team_workflow` adds the
`EmailTeamStatus` enum plus shared owner, assignment timestamp and team-status
fields to `EmailMessage`. Existing rows default to Open. These fields do not
replace `EmailMessageUserState`: read/unread remains personal, while assignment
and Open/In progress/Waiting/Resolved are shared operational state.

The migration `20261109104500_gmail_sync_lease` adds an optional lease token
and expiry to `EmailMailbox`. Gmail sync acquires these fields atomically so
manual and scheduled serverless invocations cannot process the same mailbox
at the same time. The lease is cleared after the run and expires after five
minutes if an invocation terminates unexpectedly.

The migration `20261109113000_gmail_push_receipts` adds the
`GmailPushReceiptStatus` enum and `GmailPushReceipt` table. It stores opaque
Gmail history and Pub/Sub delivery identifiers for idempotent push scheduling;
it does not store email addresses, message bodies, attachment metadata or
credentials. Pending receipts are marked processed only after the associated
mailbox sync has drained all pages, and processed/ignored rows are deleted after
14 days by the scheduled Gmail sync route.

The migration `20261109121500_gmail_watch_renewal` adds structured Gmail watch
expiry, last-renewal, retry, bounded-error and failure-count fields to
`EmailMailbox`. The fields let the hourly renewal route query due watches
without scanning mailbox JSON metadata. Existing mailboxes start with no watch
expiry and remain on the five-minute polling fallback until Gmail push is
explicitly enabled and a watch is successfully registered.

The migration `20261109161000_gmail_connection_reconciliation` adds
`authStatusCheckedAt` and `authStatusLastError` to `EmailMailbox`, plus an index
used to process the least recently checked mailboxes first. These fields contain
only operational timing/error state; provider tokens and mailbox content remain
in iD30 Auth and Gmail respectively.

The migration `20261110120000_contact_custom_fields` adds typed, ordered person
type field definitions and contact field values. It does not backfill customer
data. Definitions and values remain empty until an admin configures a field in
Settings > Person Types and a user saves it on a contact.

The migration `20261110140000_contact_document_requirements` adds ordered
required/optional document definitions for each person type. It does not copy
or alter R2 files and does not mark existing untyped files as compliant;
requirements match the existing `FileAsset.documentUploadType` metadata.

The data-only migration `20261110180000_contact_type_creation_backfill`
repairs contacts created by legacy integration paths after the original person
type migration. It assigns the stable system type matching each contact's
legacy category and does not change contact details or custom-field values.

The migration `20261110200000_contact_field_role_permissions` adds view and
edit role-template allow-list arrays to `ContactTypeField`. Both default to an
empty array, which preserves access for existing fields until an administrator
chooses restrictions in Settings > Person Types. It does not modify contact
values or user roles.

The migration `20261110220000_contact_document_renewal_tasks` adds an optional
document issue date and a nullable unique link from `FileAsset` to an existing
CRM `Task`. Existing files are unchanged. Renewal tasks are not backfilled or
created by the migration; users opt in while uploading or editing a document.

The migration `20260902094000_enable_pg_stat_statements` enables the
PostgreSQL `pg_stat_statements` extension for normalized statement statistics.
It does not change application tables or data. After it is applied, run
`npm run neon:advisor` to identify high-call or high-total-time query patterns
for separate, reviewed tuning work.

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
