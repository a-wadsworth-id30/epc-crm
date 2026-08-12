# CRM Sidekick AI

## Purpose

Sidekick is the CRM-wide AI assistant exposed from the top-right app header. It
is designed as a read-only helper for sales, calls, attribution, usage stats,
customer timelines and follow-up gaps.

## Current Scope

Phase 1 and 2 are intentionally read-only:

- sales summary;
- lead source and attribution summary;
- usage/activity summary;
- call summary;
- record search;
- customer timeline summary;
- current sales/contact page context when the prompt refers to this/current
  record;
- stale lead detection;
- follow-up gap detection;
- structured lead/enquiry list queries with date, stage, source and ownership
  filters;
- deterministic lead metrics for count and average-rate questions such as
  leads today, leads this week or average leads per week/month;
- natural-language reports rendered as charts, KPI cards and tables, including
  semantic lead-performance questions such as best weekday or hour for lead
  generation, open-lead ownership rankings, and product or service demand from
  lead scope data.
- website form submission reports for submitted field frequency, form/page
  lead volume and missing email/phone completeness.
- contact and client activity reports for open opportunities, stale contact,
  paid-ad origins and submitted-form origins.
- user security reports for role mix, 2FA adoption, admin 2FA gaps, inactive
  logins and pending setup links.
- storage asset reports for total usage, largest files, recent uploads,
  uploader ownership and linked-record coverage.
- expanded marketing attribution reports for ad platforms, Search Console/search
  terms, organic pages and cost-per-conversion where provider metadata includes
  spend.
- task workload reports for overdue, due-today, upcoming, completed, blocked,
  unassigned, assignee workload, creator and linked-record coverage.
- communication activity reports for email, SMS, WhatsApp, phone,
  inbound/outbound replies, CRM users, lead owners and missing linked contacts.

Sidekick can suggest next steps and link users to CRM records, but it cannot
create, update, delete, merge, reassign, send messages or perform bulk actions.
When opened on a sales or contact detail page, the drawer sends the current
path and browser title. Sidekick only loads that record when the prompt refers
to the current page, so broad reports from a customer page do not automatically
send that customer context to OpenAI.
Admins can review Sidekick write plans from `Settings > Sidekick`. The page
lists draft, applied, failed and rejected plans, previews proposed Discovery
questions, and provides apply/reject actions without requiring the original
chat drawer session to stay open.
Closing and reopening the drawer keeps the current local chat session while the
app shell remains mounted. The drawer header includes a `New chat` action that
clears local messages, input and errors; this does not delete server-side audit
logs or already-created write plans.
Sidekick-generated reports include an `Open generated report` action. The
drawer stores the generated `ReportResult` in session storage and opens
`/reports?source=sidekick`, where the Reports workspace restores the plan/result
as a Sidekick exploration that can be refreshed, customised, exported or saved.
When the user is already in Reports, the handoff also dispatches a browser event
so regenerating from Sidekick immediately replaces the visible report without
requiring a route refresh.
The generated report card also includes a direct `Save` action, which uses the
existing `/api/reports/save` endpoint to save the sanitized report plan as a
private report for the current user without first opening the Reports workspace.
When a generated report has no rows, the result includes dataset-specific
guidance covering likely setup, tracking, linked-record, filter or date-range
causes so users are not left with only an empty table.
Generated report tool results also include a deterministic insight summary
derived from the returned rows, metrics and dimensions. This gives Sidekick a
useful ranked or period-comparison explanation even when OpenAI is unavailable
or returns a thin narrative.
Assistant responses expose a compact "How Sidekick answered this" disclosure in
the drawer. It shows the answer mode, checked tools, permission scope and, for
generated reports, the approved dataset, date range, row count, grouping,
metrics, filters, chart type and planner source.
Users can mark answers as useful or not useful from the drawer. Feedback is
recorded through `/api/ai/sidekick/feedback` as sanitized `AuditLog` metadata
including rating, answer mode, checked tool names and report identifiers, not
raw report rows or credentials.
Admins can review that sanitized answer feedback in `Settings > Sidekick`.
The dashboard surfaces useful-rate, recent negative feedback, the prompt and
answer previews, checked tools, permission scope and report metadata so weak
answers can be triaged without exposing raw report rows or credentials.
Assistant responses can show contextual follow-up prompt buttons derived from
the checked tools or report dataset, helping users continue analysis without
needing to know the exact supported phrasing.

## Runtime Shape

User prompt flow:

```text
Sidekick drawer
-> /api/ai/sidekick
-> authenticated user check
-> read-only CRM tool selection
-> structured report planning for report requests
-> permission-scoped Prisma reads
-> sensitive field scrubber
-> OpenAI narrative answer when configured
-> AuditLog entry
```

If OpenAI is not configured, Sidekick returns a deterministic fallback summary
from the CRM tool results.
For generated reports, that fallback includes the leading grouped result or the
first/latest period comparison, plus a note that the visual report is shown
below and can be opened in Reports.
The drawer-level answer disclosure is derived from the same structured tool
results and report plan, not from model-generated explanation text.

For report requests, OpenAI is used only to choose from the approved report
catalogue: dataset, metrics, dimensions, filters, date range, chart type and
sort. The model never receives raw SQL access and the generated plan is
validated by `src/lib/reports/engine.ts` before execution. If planning fails or
OpenAI is unavailable, Sidekick falls back to deterministic report planning.
Sales opportunity reports expose approved day, weekday and hour dimensions so
natural prompts such as "What is our best day for getting leads?" can be
answered from grouped CRM data rather than a fixed question list.
They also expose an approved `isOpen` filter so prompts such as "Which lead
owner has the most open leads?" filter opportunities before grouping, instead
of asking OpenAI to guess which lifecycle stages count as open.
Product and service demand prompts such as "What products do I get asked for
most on leads?" map to the approved `sales_opportunities.service` dimension,
which is derived from lead scope product types, custom product types, title and
source text rather than unrestricted form data.
Opening a generated report in the Reports workspace does not trust URL-encoded
report data; the browser handoff stays in session storage, and future run/save
actions still go through the authenticated report APIs and plan sanitiser.

## OpenAI Configuration

Sidekick looks for an `IntegrationConnection` with provider `openai`.

Expected encrypted key shapes:

```json
{
  "credentials": {
    "apiKey": "encrypted-value"
  },
  "defaultModel": "gpt-4.1-mini",
  "sidekickModel": "gpt-4.1-mini"
}
```

`OPENAI_API_KEY` and `OPENAI_SIDEKICK_MODEL` are fallback environment options.
The browser never receives the OpenAI API key.

## Guardrails

- Server-side auth is required.
- Normal users are scoped to their owned opportunities where practical.
- Admins can inspect company-wide CRM stats.
- The model never receives raw database access.
- No raw SQL is generated by the model.
- Tool calls are selected from a fixed allow-list.
- Write-like prompts are answered with guidance and a blocked-action warning.
- Sensitive keys are scrubbed recursively before OpenAI calls.
- User rows are selected without passwords, session tokens or credentials.
- CRM notes, emails, transcripts and form data are treated as untrusted content.
- Non-CRM prompts are blocked before any model call and return a clear
  CRM-scope message instead of running fallback data tools.
- Visual report generation is opt-in to explicit report, chart, metric,
  trend, ranking or grouped analysis prompts. General questions should not
  generate a report payload just because Sidekick cannot otherwise answer.
- Lead performance prompts that ask for the best/worst day, weekday, hour or
  time for leads route to the semantic report runner and use approved report
  dimensions rather than hardcoded prompt matching.
- Open-lead report prompts use the approved sales `isOpen` semantic filter,
  which is applied before report rows are grouped.
- Record-list questions such as new leads today, open leads this week or recent
  website enquiries use deterministic CRM query results for the count and links
  instead of relying on the model to infer whether records exist. Calendar
  ranges such as today, yesterday, this week and this month use the CRM
  workspace timezone, not the server timezone.
- Lead metric questions such as "how many leads came in today" or "on average
  how many leads a week do we generate" use a separate deterministic CRM
  metrics path. They should not fall through to the lead-list tool or generate
  a record dump.
- Intent routing, write-action blocking, Discovery plan detection and current
  page path parsing are covered by focused unit tests in
  `tests/sidekick-intent.test.ts`.
- Natural-language report routing can also be smoke-tested locally with
  `npm run sidekick:prompt-smoke`, which checks representative prompts against
  expected tools, datasets, dimensions, filters and leading metrics without
  requiring production credentials or database writes.

## Token Controls

Defaults:

- maximum user message: 2,000 characters;
- recent history: 8 messages;
- maximum tool calls per request: 3;
- maximum date range: 90 days;
- maximum returned rows per nested result: 50;
- maximum OpenAI output: 900 tokens;
- estimated input cap: 7,000 tokens.
- OpenAI requests time out after 25 seconds and fall back to verified CRM tool
  summaries when the provider is unavailable.
- Sidekick API calls are throttled through the database-backed rate-limit
  bucket by user and IP address before any model request is made.

Oversized prompts or oversized tool context are blocked before OpenAI is called.

## Audit

Each request writes to `AuditLog` with:

- prompt preview;
- tools used;
- estimated input/output tokens;
- model;
- mode: `openai`, `fallback` or `blocked`;
- blocked reason when applicable.

Each feedback click writes a separate `ai.sidekick.feedback` audit entry with:

- rating: `positive` or `negative`;
- prompt and answer previews;
- checked tool names;
- answer mode and model name when available;
- report title, dataset, row count, planner and permission scope when present.
