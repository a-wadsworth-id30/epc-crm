# E2E Audit Findings

Generated from:

```bash
npm run test:e2e:audit
```

## 2026-07-30

The public sign-in route rendered successfully. The authenticated audit ran
across the CRM route matrix on mobile and desktop and reported the following
gaps.

### Blocking Render Errors

- Sales table `/sales` and Sales Kanban `/sales?view=kanban` render the shared
  admin error boundary on mobile and desktop because the local database is
  missing `Company.createdByUserId`.
- Storage `/storage` renders the shared admin error boundary on mobile and
  desktop because the local database is missing `FileAsset.documentFolder`.

These look like local schema drift rather than route logic failures. Run
`npm run db:migrate:status` and apply pending migrations before using the audit
to triage UI regressions in those modules.

### Mobile Layout Overflow

The audit found page-level horizontal overflow on a 390px mobile viewport:

- Contacts `/contacts`: fixed-width table content overflows by 447px.
- Organisations `/clients`: fixed-width table content overflows by 507px.
- Tasks `/tasks`: fixed-width table content overflows by 507px.
- Products `/products`: fixed-width table content overflows by 361px.
- Sales Pipeline settings `/settings/sales-pipeline`: settings tab navigation
  overflows by 387px.

### Recommended Next Tasks

- Fix or apply the pending database migrations so Sales and Storage can render
  in the local E2E environment.
- Make shared data-table layouts mobile-safe, either with contained horizontal
  scrolling inside the table region or a responsive card/list presentation.
- Make settings tab navigation mobile-safe without increasing page-level
  document width.

### Follow-Up Fixes

Completed on 2026-07-30:

- Shared lazy table skeletons now render mobile card placeholders and keep wide
  table placeholders contained to desktop breakpoints.
- The shared CRM data table constrains horizontal scrolling inside the table
  region instead of increasing page-level document width.
- Settings navigation wraps on narrow screens so settings pages no longer
  overflow on mobile.
- Sales table and Kanban routes select only the relation fields they render,
  avoiding optional `createdByUserId` schema-drift failures in partially
  migrated databases.
- Sales Kanban columns stack on mobile and retain the horizontal board layout
  from medium breakpoints upward.
- Storage route loading and search tolerate optional `FileAsset` metadata
  columns that may not exist during a partial rollout, while preserving safe
  null/empty defaults for rendered metadata.
- The audit harness ignores aborted internal Next font requests, matching the
  existing treatment of aborted internal chunk requests during rapid route
  traversal.

Verification:

```bash
npm run typecheck
npm run lint
npm run test:e2e:audit
```

The route audit now passes across the configured public sign-in check and the
authenticated CRM mobile/desktop route matrix.
