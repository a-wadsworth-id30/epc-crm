# Marketing QA Baseline

This checklist is the baseline for the commercial attribution build. Run it before starting the next reporting task and after each task that changes Marketing attribution, visitor tracking, conversion uploads or reporting tables.

## Scope

Primary routes:

- `/marketing`
- `/marketing/attribution-reports`
- `/marketing/lead-sources`
- `/marketing/ad-platforms`
- `/marketing/conversion-reporting`
- `/marketing/offline-media?range=all`
- `/marketing/sales-quality?range=all`
- `/marketing/executive-report`
- `/marketing/visitors`
- `/marketing/visitors/[id]`

Supporting public/runtime routes:

- `/api/health`
- `/api/attribution/config`
- `/api/attribution/lead`
- `/api/attribution/phone-number`
- `/attribution-toggle-test.html?utm_source=toggle-test&utm_medium=qa&utm_campaign=attribution-toggle-test`

## Local Verification

Run these checks before handoff:

```bash
npm run typecheck
npm run lint
npm run build
```

For schema, environment or production-sensitive changes, also run the relevant checks:

```bash
npm run env:check
npm run production:preflight
npm run db:migrate:status
```

## View Checks

### Marketing Overview

- Navigation tabs render for Overview, Attribution reports, Lead sources, Conversion reporting, Offline media, Sales quality and Executive report.
- Date range changes preserve the active view.
- Empty states explain what data is missing without showing broken tables.
- Integration links point to `Settings > Integrations` for Google Analytics, Google Ads, Bing Ads and Meta.

### Attribution Reports

- Lifecycle, lead quality, assisted journey and model comparison sections render without horizontal clipping.
- Tables use the full available content width while retaining horizontal scroll on narrow screens.
- Confidence score labels are understandable to clients and detailed evidence remains available for internal review.
- First-touch, last-touch and assisted reporting agree with the same underlying record totals.

### Lead Sources

- Source, campaign and provider rows show lead count, qualified lead count, opportunity value and won revenue where data exists.
- Google Ads evidence is visible through compact UI, such as a tooltip or details control, without widening the table.
- Unknown or missing source values are grouped clearly and do not hide valid paid-search records.

### Conversion Reporting

- Dry-run/manual upload state is clear before any provider upload action.
- Provider feedback separates matched, uploaded, rejected and pending conversions.
- Rejection reasons, missing identifiers, mapping gaps and provider setup blockers are grouped by category and severity without requiring database inspection.
- Export or retry actions do not imply automatic scheduled uploads unless that feature has been explicitly enabled.

### Offline Media

- Campaign metadata rows render full width and keep source, campaign, phone pool, date range and cost fields visible.
- Offline rows can be connected back to phone, form or visitor activity where identifiers exist.
- Schedule and budget pacing fields flag missing dates, missing budgets and over-budget campaigns.
- The UI reads as an operational report plus setup workflow; deeper planning calendar, pacing and media-buy workflow remain future work.

### Sales Quality

- Qualified, proposal, won and lost counts line up with lifecycle stage totals.
- Revenue values match the related sales opportunity records.
- Contacted rate, response time, lost reason and time-to-close values display when lifecycle/contact history exists, and missing history is clear.
- Pipeline stage and lifecycle transition rollups use stored stage history rather than only current opportunity stage.

### Executive Report

- Client-facing summary avoids internal-only diagnostic language.
- Lead, quality, revenue and confidence summary cards agree with the lower-level reports.
- Recommendations are not shown as definitive advice when confidence is low or data is incomplete.
- Client-pack export opens `/marketing/executive-report?print=1`, browser
  print/save-as-PDF controls are available, and the report can download a
  standalone HTML client pack from `/api/marketing/executive-report/client-pack`.

### Visitor Log

- Filters for source, campaign, completion, confidence, lifecycle and date range preserve query state.
- Visitor rows show location, source, journey role, conversion state, completion fields and linked records when present.
- Detail pages show first touch, last touch, assisted journey, UTM/ad-click evidence, phone assignments and debug events.
- Unknown location is only shown when no trustworthy geo data exists.

## Live Verification

After `main` is deployed, verify:

- `GET https://crm[.]epc-improvements[.]co[.]uk/api/health` returns healthy
  DB-free status. Use `/api/health?database=1` only when this QA needs an
  explicit database ping.
- `GET https://crm[.]epc-improvements[.]co[.]uk/api/attribution/config` returns HTTP 200 from the live domain.
- The phone replacement test page passes when dynamic phone tracking is enabled and the pool has an assignable number.
- Authenticated Marketing pages load on desktop and mobile widths without table overflow outside the page container.

Live Marketing pages require an authenticated CRM session, so record the signed-in user, browser, viewport and timestamp when completing visual QA.

## Current Gaps To Track

- Visitor log has richer completion fields; remaining improvements are trend comparisons, exports and deeper consent/audit drilldowns.
- Confidence scoring should be made more actionable in Lead Sources and Attribution Reports.
- Conversion upload feedback needs stronger match-rate, success-rate and rejection classification reporting.
- Attribution model comparison uses captured touchpoints; remaining improvements are side-by-side exports and benchmark views.
- Offline Media still needs planning/pacing workflows, Sales Quality needs deeper transition trend visualisations, and Executive Report may later need native PDF generation if browser save-as-PDF and HTML packs are not enough.
