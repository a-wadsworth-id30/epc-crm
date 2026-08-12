# E2E Automation

The CRM has a focused Playwright route audit for finding broad product gaps and
regressions across authenticated modules.

## Command

```bash
npm run test:e2e:audit
```

The command starts the local Next.js dev server through `playwright.config.ts`
unless one is already running on port `3001`.
Playwright artifacts are written to `/private/tmp/id30-crm-playwright-results`
by default so route audits do not mutate local repo scratch output. Override
with `PLAYWRIGHT_OUTPUT_DIR` if you need a different artifact location.

Documentation screenshots are also written outside the repo by default:

```bash
npm run docs:screenshots
```

Those screenshots go to `/private/tmp/id30-crm-docs-screenshots`. Override with
`DOCS_SCREENSHOT_DIR`, or set `DOCS_SCREENSHOTS_WRITE_REPO=true` when you
intentionally want to refresh `docs/assets/screenshots`.

## Credentials

The audit signs in with:

```text
E2E_EMAIL / E2E_PASSWORD
```

It falls back to `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, then
`admin@example.com` / `ChangeMe123!`. Run database migrations and seed data
before using the default local credentials.

## Disposable E2E Tenant

Use a disposable database for mutation workflows and seeded end-to-end journeys:

```bash
npm run e2e:prepare
```

The script creates two test users, a company, contact, sales opportunity, task
and company-database setting required by the authenticated smoke tests. It
refuses to run unless the `DATABASE_URL` database name contains `test` or `e2e`.
For a deliberately disposable database with a different name, set
`CRM_E2E_ALLOW_DATABASE_URL=true` for that one command.

Optional overrides:

```text
CRM_E2E_ADMIN_EMAIL
CRM_E2E_ADMIN_PASSWORD
CRM_E2E_USER_EMAIL
CRM_E2E_USER_PASSWORD
```

## Coverage

`tests/e2e-audit.spec.ts` checks the public sign-in route and a broad
authenticated route matrix across Dashboard, Sales, Contacts, Organisations,
Storage, Tasks, Inbox, Reports, Products, Discovery, Marketing, Telephony and
Settings.

For each audited route it checks:

- the page does not return a server error;
- the authenticated session is retained and the page does not redirect to sign
  in;
- shared route error boundaries and error digests are not rendered;
- the page has meaningful body content and at least one visible heading;
- console errors and failed/4xx/5xx app responses are captured;
- mobile and desktop layouts do not create page-level horizontal overflow.

The test collects findings across the full route matrix and fails once at the
end with a grouped finding list, so one broken page does not hide later gaps.
Expected aborts from live background polling, optional telephony presence calls
and Next.js dynamic chunks during route transitions are filtered out so the
report stays focused on actionable product failures.

Current dated findings are tracked in `docs/E2E_AUDIT_FINDINGS.md`.

## Triage

Use the Playwright failure output first. When a route fails only on layout, run:

```bash
npm run playwright -- tests/responsive-qa.spec.ts
```

When a route fails on rendering or authentication, run:

```bash
npm run smoke:routes
```

`npm run smoke:routes` also checks that protected JSON API routes return a
consistent `401` JSON response while unauthenticated.

If the audit reports Prisma `P2022` missing-column errors, check local schema
drift before triaging UI code:

```bash
npm run db:migrate:status
```

Then apply the pending migrations or reseed the local database as appropriate
for the environment.

Playwright traces are enabled on retry in `playwright.config.ts`.
