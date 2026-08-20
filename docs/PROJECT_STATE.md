# Project State

Last updated: 2026-08-19

## Current Product Shape

This is the live iD30 CRM implementation. It is being widened for multiple developers and Codex agents, so this document should be updated after meaningful product or architecture changes.

Live URL:

```text
https://crm.id30.com
```

Production runtime:

```text
Netlify Next.js runtime + Neon Postgres
```

Netlify builds run a Prisma migration status check before `migrate deploy`.
When production Neon is already up to date, code-only deploys skip
`migrate deploy` to avoid unnecessary advisory-lock contention.

Database development should use Neon branches per developer. See
`docs/NEON_DATABASE.md`.

Code changes should use branch-per-task and PRs rather than direct pushes to
`main`. See `docs/GIT_WORKFLOW.md`.

## What Works

- Authenticated CRM shell with custom database sessions.
- Settings > Company can store the organisation name and an uploaded company
  logo set in `CrmSettings.companyProfile`, including identity details,
  registered address details, document/report defaults, default/light/dark logo
  variants, plus primary/accent brand colours with light and dark mode primary
  overrides. The
  authenticated app header, sidebar, controls and sign-in page use that
  branding when present and fall back to the default CRM logos and colours.
  Sign-in uses the same theme-aware light/dark logo switching as the
  authenticated app shell.
  The settings form previews selected logo files before they are saved so
  admins can check the light and dark variants immediately.
  Company logo media is stored as public because the unauthenticated sign-in
  page must be able to render it.
- Settings > General stores workspace defaults in `CrmSettings.workspaceDefaults`
  for currency, timezone, locale and default country. The default currency is
  used for new manual sales opportunities, phone-call generated leads and
  captured website form leads.
- Settings > General stores display defaults in `CrmSettings.displayDefaults`
  for date format, time format, week start day, number locale and currency
  display style. Dashboard and sales views read these settings for visible
  date, time and currency formatting.
- Settings > General stores interface defaults in
  `CrmSettings.interfaceDefaults` for the post-login landing page and default
  table page size. Normal sign-in uses the landing page when there is no
  protected route to return to, and Contacts, Companies, Tasks, Sales and
  Storage use the page-size default when the URL does not override it.
- Settings > General also stores module toggles in `CrmSettings.moduleToggles`
  for Products, Discovery, Marketing, Telephony and AI/Sidekick. Companies
  remains backed by `CrmSettings.companiesEnabled`. The app shell, settings nav
  and header search hide disabled modules; the Sidekick API returns 403 when
  AI/Sidekick is disabled.
- Settings > General stores sales defaults in `CrmSettings.salesDefaults` for
  default new-sale owner mode, optional specific owner, optional default
  pipeline stage and stale lead review window. Manual sales, tracked website
  leads, phone-call generated leads and stale-sales header notifications use
  these defaults.
- Header quick-create Lead and Deal use the normal sale modal with a required
  linked-contact step. Users can search recent accessible contacts or create a
  new contact inline, optionally linking or creating an organisation before the
  sale is saved. Inline new-contact creation and sale creation run in one
  transaction and block obvious duplicate contacts by email or normalized phone.
- Settings > General stores task defaults in `CrmSettings.taskDefaults` for
  default follow-up task assignee mode, optional specific assignee and default
  due-date offset. The shared task creation API uses these defaults when AI
  follow-up task actions do not send explicit assignee or due-date values.
- Settings > General stores notification defaults in
  `CrmSettings.notificationDefaults` for non-critical header notification
  categories and information-only updates. Critical generated notifications
  always remain visible.
- Settings > Security is an admin-only operational overview for authentication
  posture, active/expired session visibility, password policy, credential
  encryption readiness, two-factor adoption, password reset email readiness,
  pending reset tokens and recent audit events. Admins can revoke non-current
  browser sessions from the recent sessions table. Sign-in, two-factor
  verification, password-reset request and reset-confirm actions are rate
  limited through database-backed throttle buckets, and new sessions prune
  expired rows while capping active sessions per user.
- CRM responses include enforced security headers by default, including CSP,
  frame blocking, HSTS, MIME sniffing prevention, strict referrer handling and
  Permissions-Policy. CSP can be moved back to report-only with
  `CSP_REPORT_ONLY=true` for controlled diagnostics, and remote script loading
  stays blocked unless `CSP_ALLOW_HTTPS_SCRIPTS=true` is deliberately set.
- Settings > Setup is an admin-only client readiness checklist that groups
  company identity, branding, workspace defaults, users, admin coverage, invite
  links, two-factor adoption, MailerSend, attribution tracking, iD30 Auth,
  marketing platforms, Geoapify address lookup, OpenAI, R2, sales pipeline,
  phone system and call tracking setup into linked readiness cards for client
  handover.
- Settings > Sidekick is an admin-only AI operations area for reviewing
  sanitized Sidekick answer feedback and inert AI write plans. The feedback
  dashboard shows useful-rate, negative ratings needing review, common report
  context, prompt/answer previews, checked tools and report metadata from
  `AuditLog` without exposing raw report rows or credentials.
- Reports keeps the page header and server-prepared report catalogue immediate
  while lazy-loading the interactive report builder, Sidekick handoff restore
  and chart/table rendering behind a route-local skeleton.
- Settings > Integrations provider pages for Google Ads, Bing Ads, LinkedIn
  Ads and Meta include provider-scoped conversion-upload dry-run actions in
  Sync history. Dry-runs do not send provider uploads; they inspect queued
  conversions for the selected provider and record sync-history feedback,
  including empty-queue checks for connected provider rows.
- Settings > Integrations Test connection now includes provider health checks.
  Auth-managed ad platforms use the signed Auth connection lookup and cached
  selector status so the action remains read-only, while direct fallback
  providers call lightweight account/property/list endpoints where credentials
  are available.
- Settings > Integrations Auth-managed provider pages include a connection
  process log. CRM reads Auth's signed provider diagnostics endpoint and shows
  safe step checks for signed CRM requests, Auth provider app readiness,
  provider approval, stored Auth connection, CRM callbacks, selector discovery
  and CRM-local mapping/readiness without exposing OAuth credentials.
- Auth-managed provider pages can switch provider accounts from the setup
  wizard. The reset first asks iD30 Auth to disconnect the stored provider
  connection, clearing central token material and selector/account metadata,
  then clears CRM's Auth broker pointer, cached selector options and saved
  provider account mappings so an admin can reconnect with the correct provider
  login. LinkedIn Ads also allows the ad account mapping to be saved as blank
  and returns to mapping-needed without removing the central Auth broker setup.
- Bing Ads conversion mapping keeps the numeric Microsoft conversion goal ID
  for selector/reference purposes while storing the conversion goal name used
  by Microsoft offline conversion uploads.
- Marketing provider API defaults are pinned to Google Ads `v24`, Meta Graph
  `v23.0`, LinkedIn Marketing API `202607` and Klaviyo revision `2026-07-15`,
  while still allowing environment overrides.
- Settings > Integrations includes Geoapify address lookup as a real system
  service. The CRM stores a client-provided Geoapify API key encrypted in
  `IntegrationConnection.config` or reads `GEOAPIFY_API_KEY` from the runtime,
  then uses an authenticated server route with a bounded provider timeout to
  return normalized address suggestions for contact and company address forms.
  The browser never receives the raw Geoapify key.
- Settings > Integrations includes Pipedrive as a real CRM data integration.
  The CRM can store a Pipedrive API token encrypted in
  `IntegrationConnection.config` or read `PIPEDRIVE_API_TOKEN` from the
  runtime fallback. `src/lib/integrations/pipedrive.ts` provides the
  server-side read-only Pipedrive client for current-user, user, lead, person
  and organisation GET requests. `src/lib/integrations/pipedrive-import.ts`
  maps Pipedrive leads into CRM contacts, companies, opportunities,
  communications and `ExternalRecordLink` rows. The Pipedrive settings page has
  admin-only preview, selected import and manual pull actions for Pipedrive
  leads. Preview classifies would-create, already-linked and skipped leads and
  records sync-history feedback with sanitized table rows for the latest
  preview without creating contacts, companies, opportunities, communications
  or external-link rows. Preview rows also show existing CRM company/contact
  matches that import would reuse, based on Pipedrive external links, company
  name, contact email and normalized phone. Selected import fetches checked
  preview lead IDs from Pipedrive with GET requests and imports only those CRM
  records after the server confirms the imported IDs were marked would-create
  in the latest preview; submitted IDs outside that latest would-create set are
  rejected and logged. Full pull imports one page of latest leads. Both import
  paths record the result in sync history with sanitized per-lead import detail
  rows showing created, already-linked and skipped outcomes. Scheduled
  import/webhook handling is still intentionally separate. Pipedrive is
  pull-only by default; do not write back to Pipedrive without Adam's explicit
  permission for that specific operation.
- Settings > Integrations includes DocuSign as a real document-signing service.
  DocuSign JWT credentials and the Connect HMAC secret are encrypted in
  `IntegrationConnection.config`. Contact, company and sales opportunity
  document libraries can send eligible PDF/Word files for signature, track
  envelope and recipient state, and store completed signed PDFs plus completion
  certificates back into the private Contracts & Finance document folder.
  DocuSign Connect callbacks are verified with HMAC before any CRM state is
  updated. Record document libraries also trigger a post-load authenticated
  refresh for open DocuSign requests and expose a manual refresh action,
  allowing staff to recover completed envelopes and store the signed
  PDF/certificate when a callback is delayed, missed or rejected. DocuSign
  account base URLs saved without `/restapi` are normalized before CRM calls
  the REST API. Completed DocuSign PDF storage is idempotent by checksum,
  record, folder, upload type, file name and tags so refresh retries reuse the
  existing signed/certificate files instead of adding duplicate documents. A
  maintenance script, `npm run maintenance:docusign-dedupe`, dry-runs cleanup
  for legacy duplicate signed/certificate PDFs and `npm run
  maintenance:docusign-dedupe:apply` deletes only unreferenced exact
  duplicates after re-checking related CRM/share/signature/upload references.
  Production cleanup can also run through the disabled-by-default protected
  `/api/maintenance/docusign-document-dedupe` endpoint when
  `DOCUSIGN_DOCUMENT_CLEANUP_SECRET` is configured; GET is always dry-run and
  POST applies cleanup unless `dryRun=1` is supplied.
- Admin dashboard shows a compact first-login setup readiness prompt while
  active setup items remain. Admins can dismiss the prompt per user; it hides
  automatically when setup is complete and reappears if the outstanding setup
  fingerprint changes.
- The app exposes a PWA manifest with install-ready product icons, standalone
  display mode and product metadata so supported browsers can offer desktop app
  installation.
- A conservative production-only service worker registers from the root layout,
  precaches the manifest, app icons and `/offline`, serves the offline fallback
  for failed navigations, and avoids caching API responses or private CRM data.
  PWA install assets are public through the proxy so supported browsers can
  read the manifest and register the service worker before authenticated app
  navigation begins.
- The user dropdown shows an Install desktop app action when the browser makes
  the native PWA prompt available. Settings > System includes PWA
  installability checks and live verification commands.
- Users can enable authenticator-app two-factor authentication from My Account.
  TOTP secrets are encrypted with `CREDENTIAL_ENCRYPTION_KEY`; when 2FA is
  enabled, sign-in requires a short-lived second-step verification challenge
  after the password check succeeds. Two-factor authentication remains optional;
  admins are not forced to enable it.
- `/reset-password` accepts a user email, creates a one-hour
  `PasswordResetToken` for active accounts and sends the reset link through the
  saved MailerSend integration using a privacy-safe generic response. The
  `/reset-password/confirm` route validates unused, unexpired tokens, enforces
  the CRM password policy, updates the password, marks reset tokens used and
  revokes active sessions for the account. Reset and setup email links use the
  trusted configured application origin (`APP_BASE_URL`, then
  `NEXT_PUBLIC_APP_URL`) rather than request `Host` / forwarded headers.
- Settings > System is an admin-only read-only operations dashboard for
  application health, build metadata, environment readiness, integration
  connection status, live deployment status, deployment readiness,
  schema migration readiness, background job history, session/audit summaries,
  process-local database query timing and implementation guardrails. Database
  query timing is opt-in and stores only safe Prisma model operation labels,
  counts and durations.
- Operational data retention is available through
  `/api/maintenance/retention` and an optional disabled-by-default Netlify
  scheduled function. It purges old operational history only, keeps core CRM
  records intact, supports dry runs, and writes an `AuditLog` rollup for real
  runs with matched/deleted counts per target. API, scheduled and manual runs
  also write compact `BackgroundJobRun` history. Settings > System shows
  retention readiness, scheduled-mode status, the last real retention run and a
  dry-run count preview for each retention target without writing preview
  history rows.
- Telephony call-log and recordings APIs support cursor-backed adjacent page
  loading while retaining page-number URLs. Call-log list rows use explicit
  relation selects, and normal recording summaries are calculated with database
  counts/aggregates instead of materializing every matching row. Recording
  transcript lookup and status filters use normalized `CallLog` columns
  backfilled from existing metadata, while transcript/summary bodies remain in
  metadata for display.
- Shared CRM boilerplate components cover repeated admin metric cards, status
  cards and audit-log tables so settings/system/security pages stay consistent
  and easier to maintain. Shared date formatting helpers live in
  `src/lib/formatters`.
- The authenticated shell lazy-loads heavy optional drawers such as Telephony
  softphone and Sidekick so they are not part of the first shell chunk when
  their module is disabled or unused. Header notification details, the sidebar
  application-health popover, account dropdown panel and the deploy-version
  guard are also split from the first shell bundle. Unused Tail Admin demo
  component folders have been removed from `src/components` so typecheck and
  build do not scan dead template code. Remaining unused Tail Admin demo
  assets, global CSS and package dependencies have also been removed so the
  repository carries less template weight. Deferring the account dropdown
  panel removed about 3.8 KB from authenticated route first-load JavaScript in
  the local bundle summary while keeping the PWA install prompt listener in the
  lightweight header trigger. The sidebar settings flyout is also loaded only
  after the settings control is opened, keeping flyout positioning and settings
  link filtering out of the initial sidebar chunk; the local bundle summary
  showed another roughly 2.1 KB reduction on common authenticated routes.
  Fixed sidebar navigation icons are served from `public/images/sidebar-icons.svg`
  through a compact shared React wrapper instead of importing Lucide icon
  modules into the sidebar shell; the measured 68-route shell chunk moved from
  about 59.0 KB raw / 19.5 KB gzip to 54.0 KB raw / 17.7 KB gzip.
- Build and runtime performance baselining is available through
  `npm run build:profile`, `npm run perf:bundle`, opt-in server timing logs,
  opt-in database query timing and opt-in Web Vitals logging. The metrics
  intentionally exclude query strings, form values and customer records.
- Migration-sensitive features should use the shared Prisma schema-drift
  helpers in `src/lib/prisma-errors.ts` so optional table/column rollout gaps
  produce controlled fallback states rather than taking down normal routes.
  Settings > System compares committed migration folders with the database
  `_prisma_migrations` table so admins can see pending or failed schema
  rollout before route smoke tests or users hit affected pages.
- `npm run smoke:routes` runs a focused authenticated Playwright smoke check
  for the dashboard, Marketing, Sales, Settings > System, Settings >
  Integrations and Telephony routes, failing on redirects, server errors or
  shared admin route error boundaries.
- `npm run test:e2e:audit` runs the broader authenticated Playwright audit
  matrix across core CRM modules on mobile and desktop. It collects route
  status, auth redirects, error boundaries, blank pages, missing headings,
  console errors, failed/5xx network responses and page-level horizontal
  overflow, then reports all findings together so one issue does not hide later
  gaps. Follow-up hardening fixed the first audit findings by adding
  mobile-safe lazy skeletons for table-heavy pages, containing shared table
  overflow, wrapping settings navigation on narrow screens, stacking Sales
  Kanban columns on mobile, and making Sales/Storage routes tolerate optional
  schema columns during partial database rollouts.
- Authenticated route changes use cached app-shell settings for branding and
  module toggles, and session lookups select only the fields required by the
  shell instead of loading complete user rows.
- Broad CRM `contains` searches are backed by Postgres `pg_trgm` GIN indexes
  for lightweight searched fields across contacts, companies, sales, users,
  inbox headers/summaries and storage metadata. Inbox list search skips full
  email body text to avoid large mailbox scans during normal route changes.
- Page headers defer the interactive help-tooltip library behind a tiny client
  wrapper, keeping route headers readable without making tooltip positioning
  code part of every described page's first-load JavaScript. Unit coverage now
  guards against direct route/component imports of the heavy tooltip module.
- Marketing visitor detail reuses the shared lazy copy-button wrapper so
  attribution IDs, click IDs and IP copy actions do not pull the full action
  icon button client bundle into the first route load.
- Dashboard and sales overview metrics use aggregate/grouped Prisma queries for
  pipeline totals instead of loading all opportunities, and dashboard activity
  panels select only the fields they render. The default unfiltered Sales
  Pipeline route reuses the total opportunity count instead of issuing a second
  equivalent filtered-count query. The dashboard also uses a 60-second
  server-side cache for workspace-wide summary counts and marketing rollups
  while leaving user-specific setup prompts and recent activity rows uncached.
- `MarketingDailyRollup` stores compact daily workspace marketing summaries for
  visitor sessions, attribution records, form/phone leads and imported
  platform spend/click/conversion metrics. A protected maintenance endpoint and
  disabled-by-default scheduled Netlify function refresh the rollups. Dashboard
  marketing summary reads rollups when the full 30-day window is covered and
  falls back to raw attribution/spend aggregates until coverage exists.
  Settings > System shows rollup readiness, latest real refresh status and
  30-day dry-run totals without writing summary rows or preview job history.
- `BackgroundJobRun` stores compact history for retention, marketing rollups,
  marketing conversion upload preparation/processing and advertising spend
  imports. Recent runs are visible in Settings > System with status, trigger,
  duration and read/write counts; old finished runs are removed by operational
  retention after 365 days.
- Tasks uses a narrow list payload for task fields and related display names
  instead of loading full company, contact and assignee records for every row.
- Company list pages use explicit scalar selects plus relation counts instead
  of returning unused columns during normal account browsing.
- Storage caches workspace-level support data for 60 seconds, including summary
  counts, folder/uploader filter labels and sanitized upload-policy flags, while
  keeping filtered counts and visible file rows live per request. File
  upload/edit/delete and Cloudflare R2 settings changes invalidate the cache.
- Storage file browsing has list-control indexes for file name, MIME/type,
  size, uploader/date, created date and visibility/date, while broad storage
  text search continues to use trigram GIN indexes.
- Telephony caller matching stores a normalized contact phone lookup key and
  resolves inbound voice/SMS contact context through an indexed query instead
  of loading and normalizing hundreds of contacts in Node. Session expiry and
  per-user active-session maintenance are backed by dedicated indexes.
- Heavy interactive Calendar and Telephony panels are loaded through deferred
  client chunks so first route paint is not blocked by FullCalendar, phone
  system managers, routing builders, live queue controls, realtime refresh hooks
  or recording settings forms. Calendar schedule help and Phone System route
  help also use the lazy tooltip wrapper so shared page chrome, team settings,
  monitoring call-log guidance, recordings workspace guidance and agent
  management guidance stay server-rendered without pulling tooltip positioning
  code into first load. The Phone System server page also skips inactive tab
  datasets, so call-log pages, recording pages, queue-entry details,
  missed-call task counts, recent-call rows and business-number inventory are
  loaded only for tabs that render them.
- Telephony call-tracking overview, number pools and tracking-number inventory
  keep the page header, server-rendered tabs and metrics immediate while
  lazy-loading metric help tooltips and the full call-tracking pool manager
  behind route-local client chunks. Call-tracking setup, diagnostics,
  validation, pool-manager guidance and DNI availability help also use the
  lazy tooltip wrapper.
- Telephony call-tracking DNI Rules keeps the page header, tabs and server
  rule fetch immediate while lazy-loading the interactive rule editor, preview
  and editor guidance behind route-local chunks.
- The authenticated shell shows a thin global route-change progress indicator
  after internal navigation clicks, giving immediate feedback while slow server
  routes stream their existing loading skeletons.
- Realtime page refresh helpers pause browser timers and close SSE streams while
  the tab is hidden, then reconnect on visibility/focus so inactive dashboards,
  inboxes, conversations, telephony and visitor-log views do not keep polling
  server routes unnecessarily.
- Settings integration provider pages defer provider-specific setup forms so a
  single provider page no longer loads every marketing and system integration
  form in the first client bundle. Marketing selector refresh controls are also
  loaded through a tiny deferred client button so provider pages keep status and
  setup guidance immediate. Provider-page help tooltips use the same lazy
  wrapper as page headers, and integration overview system-provider cards are
  also loaded through a small deferred client island so settings dialogs and
  modal forms wait until the overview has painted.
- Tracking Engine attribution settings uses a small client loader for
  section-specific panels so Tracking Script, Domains, Session Settings, Form
  Tracking, Attribution Rules, Consent Settings and Debug Logs do not all ship
  in the same first-load client chunk. Placeholder section help also uses the
  lazy tooltip wrapper, and the form-tracking endpoint mapper defers its
  guidance tooltips inside the mapper chunk. Tracking Script install-panel
  guidance, Domains panel registry help and Consent Settings privacy guidance
  are also deferred behind the lazy tooltip wrapper. Attribution Rules panel
  source-priority guidance and Session Settings retention/privacy guidance
  follow the same lazy-help pattern. Debug Logs diagnostics guidance is also
  deferred inside its panel chunk.
- Marketing > Offline Campaigns keeps the summary metrics server-rendered and
  immediate while lazy-loading the add-campaign form, QR generation,
  phone-number assignment and registry editing tools into route-local chunks.
  Offline setup and registry help uses the lazy tooltip wrapper inside those
  chunks.
- Settings > Sales Automation keeps the page header and server-prepared metrics
  immediate while lazy-loading the heavy rule builder, analytics tables,
  approval queue and activity tools behind a route-local skeleton.
- Settings > Sales Pipeline keeps the page header and server-prepared stage data
  immediate while lazy-loading the stage manager, table actions and modal forms
  behind a route-local skeleton.
- Contacts, Companies, Storage and Users settings defer create/edit/delete,
  upload and bulk-import action panels until an admin opens the relevant
  action, keeping list routes lighter while preserving the same action buttons.
- Contacts Segments keeps saved segment rows server-rendered while lazy-loading
  the AI segment builder and deferring section help tooltips so the list paints
  before form/action client code hydrates.
- Contacts keeps the page header and add-contact trigger immediate while
  lazy-loading the interactive people table, manual search/sort/pagination,
  URL-backed column visibility and row action triggers into a route-local chunk.
  The People table uses the shared column selector so optional fields such as
  Address can be added or removed without changing the search route. The
  add/edit/delete modal loader uses local lightweight triggers so the People
  route does not pull the shared modal button barrel into first load. Contact
  detail help uses the lazy tooltip wrapper so communication and linked-sales
  guidance does not add the tooltip client library to first load.
- Clients keeps the page header and add-company trigger immediate while
  lazy-loading the interactive companies table, manual search/sort/pagination
  and row action triggers into a route-local chunk. The add/edit/delete modal
  loader uses local lightweight triggers so the Companies route does not pull
  the shared modal button barrel into first load.
- Inbox keeps the page header and MailerSend settings action immediate while
  lazy-loading the interactive mailbox lanes, message list, selected-message
  panel and message actions into a route-local chunk. The inbox list query uses
  an explicit summary payload and fetches selected email bodies through an
  authenticated detail endpoint so large message content and provider metadata
  stay out of list page responses.
- Notes keeps the activity timeline server-rendered while deferring section
  help through the lazy tooltip wrapper so the lightweight chronology view does
  not include tooltip positioning code in first load.
- Tasks keeps the page header and server-prepared work queue data immediate
  while lazy-loading task metrics, filters, manual search/pagination and row
  actions into a route-local chunk.
- Settings > General keeps the page header and server-prepared defaults
  immediate while lazy-loading the full workspace, interface, display,
  notification, task, sales and module-toggle settings form into a route-local
  chunk. The form's section help uses the lazy tooltip wrapper so editing
  defaults does not pull tooltip positioning code into the first form chunk.
- Settings > AI Context keeps the page header and server-prepared CRM-wide AI
  context immediate while lazy-loading the editable prompt framework and help
  cards into a route-local chunk.
- Settings > Company keeps the page header and server-parsed company profile
  immediate while lazy-loading the full identity, branding, logo upload and
  document-defaults form into a route-local chunk. Company-profile section
  help uses the lazy tooltip wrapper so branding and document-default editing
  do not pull tooltip positioning code into the first form chunk.
- Sales keeps the page header, summary metrics, view switch and mobile
  opportunity cards immediate while lazy-loading the add-sale modal, pipeline
  filters and desktop bulk selection/pagination frame into route-local chunks.
  The overview supports the default table/list layout plus `view=kanban`, which
  reuses the same URL-backed search, stage, owner and sort filters and groups a
  bounded set of matching opportunities by pipeline stage. Admins can configure
  which fields show on Kanban cards from `Settings > Sales Pipeline`; the saved
  fields cover customer, value, owner, source, products, next activity, close
  date, service-plan status and open linked tasks. Kanban cards can be dragged
  between configured pipeline columns; the move uses the same server-side stage
  gate as the detail stage control and shows inline blocked/warning feedback on
  the board before refreshing. The overview uses a static help cue and local
  add-sale trigger so one tooltip or modal button does not pull shared client UI
  into the first route chunk, and filter stage/count derivation is memoized for
  cheaper search/sort updates. Sales detail workspace
  help uses the lazy tooltip wrapper so attribution and conversation guidance
  does not pull tooltip positioning code into first load.
- Settings > Users also keeps the page header and bulk-import entry point
  immediate while lazy-loading the interactive permissions table behind a
  route-local skeleton. Its add-user and import triggers avoid the shared
  modal button barrel so the first settings/users chunk stays smaller, and the
  table reuses stable column, search and row-action definitions during
  search/sort/pagination renders.
- Products keeps the page header immediate while lazy-loading the catalogue
  table, product editor, image upload and discovery-link controls into a
  route-local chunk. Catalogue help uses the lazy tooltip wrapper inside that
  chunk.
- Product categories keeps the page header and cached catalogue data immediate
  while lazy-loading the category table, automated rule builder and manual
  product selector drawer into a route-local chunk.
- Storage keeps the page header and server-prepared summaries immediate while
  lazy-loading the browser controls, paginated file table and deferred file
  actions into a route-local chunk.
- Shared CRM data tables split generic filter drawers and generic row-action
  icon renderers into optional client chunks so table routes that use custom
  actions or no filters do not ship that code in their first-load bundle.
  `CrmDataTable` also supports a reusable column selector with locked/default
  columns and controlled visible-column IDs for URL-backed table views.
- Sales detail defers heavy workspace panels, including AI assistance,
  automation activity, discovery answer editing, stage control and softphone
  call controls, behind route-local loading skeletons. Its server load uses
  explicit Prisma selects, caps the first conversation payload to recent
  activity with the true total count shown in the workspace, avoids Twilio
  provider status fetches during page render and only loads full product/category
  selector options when active Discovery questions need those option lists.
- Contact detail keeps contact facts and linked lead summaries immediate while
  lazy-loading the customer conversation thread, AI reply composer and AI
  guidance rail into route-local chunks, reducing the first-load bundle for
  `/contacts/[id]` while preserving the same reply, regenerate, task and call
  actions.
- Profile keeps the page header and account overview immediate while
  lazy-loading the interactive profile, password, two-factor, session and
  account-removal forms behind route-local skeletons. Profile and account form
  help uses the lazy tooltip wrapper so the route does not include tooltip
  positioning code in first load.
- Discovery setup defers its large question/template builder behind a route
  skeleton so admin navigation can show the page chrome before the editor bundle
  hydrates. Question and template guidance also uses the lazy tooltip wrapper.
- Admin header search is split out of the shared shell bundle, and the mobile
  search instance only mounts after the collapsed header menu is opened. The
  authenticated header includes a persistent `+` quick-create control beside
  search for Contact, Organisation, Lead and Deal. Quick create reuses the
  existing modal forms and lazily loads setup options through
  `/api/quick-create/options` only when the menu is used. Company option
  preloading is capped so large company databases do not make the header action
  expensive.
- Admin route transitions use a shared loading skeleton so slow server-rendered
  pages show immediate feedback inside the CRM shell instead of appearing idle.
- Admin route failures use a shared CRM error panel with retry and system-health
  actions. Route-specific boundaries are in place for Sales, Marketing,
  Reports, Settings and Telephony, with a broader authenticated-app fallback.
- Header notifications are generated from live CRM conditions and overlaid with
  per-user `NotificationState` review data. Users can mark one or all
  notifications as reviewed to clear the badge without removing visible
  notifications, and can dismiss non-critical items; critical action alerts
  remain visible until the underlying condition is fixed. Admins receive System
  alerts for failed background jobs and for running jobs that exceed the stale
  threshold. Dismissed alerts reappear unread if their generated fingerprint
  changes.
- Hot CRM list and activity tables have supporting indexes for common
  dashboard, sales, contacts, tasks, storage and activity sort/filter paths.
- Header search uses normalized and typo-tolerant matching for CRM records,
  including folded punctuation for emails/names, phone digit matching, reversed
  names, compact names and small name typos. The search API also broadens
  candidate terms from longer name tokens so likely matches can be scored even
  when one typed token is imperfect. Global search keeps candidate queries
  bounded, uses explicit Prisma select payloads and separates text terms from
  phone/digit terms so numeric searches avoid fanning out over text columns.
- Focused TypeScript unit tests cover search matching and attribution form-field
  normalization, including mixed client form payloads, sensitive-field filtering
  and richer conversation body output.
- Contacts, Companies, Tasks, Sales and Storage use URL-backed server-side
  pagination so those pages fetch bounded rows instead of loading entire tables
  into the route.
- Users, Contacts, Contact detail, Storage, Offline Campaigns and Attribution
  settings routes use explicit Prisma `select` projections for their rendered
  rows and timeline summaries, reducing over-fetching of relation data and
  avoiding sensitive user columns on admin list screens.
- Contacts, Companies, global record search, quick-create company options and
  the contacts API apply the same server-side CRM resource access predicates as
  contact/company detail pages, so normal users cannot enumerate unrelated
  contact or company records through list, search or option endpoints.
- Task creation validates linked lead and contact IDs through the same CRM
  resource access predicates before saving, and rejects mismatched lead/contact
  pairs instead of allowing tasks to reference inaccessible records.
- Signed CRM MCP read endpoints fail closed when their local `AuditLog` write
  fails, so read-only MCP data is not returned without CRM-side audit coverage.
  Rejected signed-request validation, malformed JSON and endpoint/tool mismatch
  paths also write sanitized MCP audit entries without storing signatures,
  body hashes or raw request bodies.
- Environment preflight treats a missing or unusable
  `CREDENTIAL_ENCRYPTION_KEY` as a failure. New installs should generate it
  with `openssl rand -base64 32`; unresolved example placeholders are rejected.
- Inbox, dashboard, telephony and lead/contact conversation surfaces use a
  Netlify-compatible realtime refresh path backed by the lightweight
  `RealtimeVersion` table and `/api/realtime/events` SSE endpoint. Webhooks and
  send actions bump named topics so open pages refresh without each page polling
  its full data query every few seconds.
- Authenticated media and recording playback routes enforce relationship-based
  access. Private R2 media requires admin, uploader, self-profile or linked
  CRM entity access, and Twilio recording playback requires admin, handled-call,
  queue-assignee or related sale/contact access before proxying audio.
- Public attribution write endpoints enforce the Attribution Domains registry
  and bounded request-body parsing before creating leads, assigning phone
  numbers or storing script debug events. Attribution runtime config derives
  its public `apiBase` from the request host so custom-domain deployments do
  not leak an older Netlify app URL into embedded website scripts.
- Next.js serves global security headers for HSTS, frame blocking, MIME sniffing
  prevention, referrer policy and permissions policy. Content Security Policy is
  currently report-only so third-party CRM integrations can be observed before
  enforcement. Production CSP omits `unsafe-eval` unless explicitly enabled,
  and `CSP_ENFORCE=true` can switch the header to enforcing mode after
  integration audit.
- Dependency audit remediation has cleared the known high-severity findings by
  refreshing safe semver-compatible packages and moving Next/ESLint config to
  the latest stable 16.2 patch line.
- Sensitive settings pages are admin-only at both the route and navigation
  levels. General, Company Profile, AI Context, Integrations, Security, System,
  Users, Sales Pipeline and Sales Automation require `ADMIN` before loading
  settings data. Desktop Softphone remains user-accessible for staff downloads.
- Tasks is now a table-first work queue. It defaults to the logged-in user's
  assigned tasks, can be switched to all tasks, supports due-date range and
  quick status views, orders incomplete tasks by due-date urgency and marks
  overdue/today rows visually.
- Sale detail notes support `@` mentions for active CRM users. Mention handles
  resolve from email local-parts and first/last-name combinations, and the note
  composer offers a member picker while typing a mention. Resolved mentions
  create assigned review tasks linked to the sales opportunity and source note.
  Open mention-review tasks generate user-specific Sales header notifications
  until the task is completed or dismissed. Resolved mention tasks also send a
  best-effort MailerSend email alert to the mentioned CRM user so reviews are
  not missed when the user is not logged in.
- Admin-created users; public signup is disabled. Settings > Users supports
  both single-user creation and bulk CSV import. Bulk imports validate emails,
  names, roles, duplicate rows and existing CRM accounts before creation, then
  create users without CSV passwords and optionally send each imported user a
  secure password setup link through the existing reset-token email flow.
  Skipped/error rows can be downloaded as a CSV report, and imports that create
  admin accounts require explicit confirmation before creation. The users table
  shows the latest setup/reset link status for each user, and admins can send or
  resend a one-hour setup link from the row actions. Users can also be assigned
  a client-facing role template such as Owner, Admin, Manager, Sales user,
  Marketing user, Reporting user or Support user. Role templates currently map
  to the existing `ADMIN` / `USER` enforcement boundary while creating a
  foundation for finer permissions later.
- The user dropdown opens a single My Account page for the signed-in user's
  avatar, name, contact numbers, account access metadata, active session count
  password change, two-factor authentication setup and active browser session
  management. Users can revoke other sessions from this page. Users can
  request account removal from this page; the request is logged to `AuditLog`,
  shown back on the profile and surfaced to admins through a System
  notification for review rather than immediately deleting CRM records.
- Sales overview with table/Kanban pipeline views and sale detail workspace.
- Sales detail URLs use opaque opportunity IDs rather than descriptive slugs.
- Sale detail now uses a compact lead header and connected workspace tabs:
  Conversation, Lead, Discovery, Estimate, Proposal and Automation.
  Conversation shows the compact latest-open timeline, Lead shows a compact
  lead-level Discovery summary and key lead facts, Discovery dynamically loads
  matching lead/category/product question packs from configured Discovery
  templates, and Automation shows score history, AI stage guidance and recent
  automation runs.
- Admin Products and Discovery modules now split catalogue setup from
  qualification setup. Products own reusable product/service records, image
  uploads, tags and Shopify-style categories. Manual categories select products
  directly; automated categories match products with AND/OR tag conditions.
  Products show
  catalogue readiness, category coverage and read-only Discovery linkage, with
  room for quoting, inventory and production extensions. Discovery owns
  reusable question groups,
  question banks, product or category links, conditional logic review, stage
  requirements and lead preview. Lead-level templates can apply to every sale
  and are always shown before product/category packs on the sale detail
  Discovery tab. The seeded Lead qualification pack captures products,
  categories, what the customer sells/provides, budget range, timeframe and
  project notes. Product/category templates are pulled into a sale when
  matching products are attached. Questions support single answers, capped multiple answers,
  unlimited multiple answers, date-time answers, domain/website answers,
  currency ranges, slider-style numeric answers and product/category selector
  answer types. Question group assignments can store Show and Require rules so
  one answer can reveal, hide or require follow-up questions on the sale
  Discovery form.
  Product selector answers attach selected products to the lead without
  removing existing product assignments, preserving product-specific answers.
  URL questions use this for example-site and competitor-site lists. Products
  and Discovery read reusable catalogue/template/question object data through a
  shared cached loader with explicit tag invalidation after admin mutations.
- Contacts and companies support manual address fields. Notes/activity, tasks
  and storage foundations are in place.
- Company creation can include up to 10 new linked contacts in the same modal.
  Each nested contact requires first name, last name, role/job title and lead
  source, with email and phone optional. The create action saves the company
  and contacts in one transaction.
- Manual contact creation requires a "Where did you hear about us?" lead-source
  dropdown. `Contact.leadSource` stores the normalized contact-level source,
  website and phone lead captures fill it when the source maps cleanly, and the
  contact detail page can create a linked lead without re-entering the contact
  or company details. Successful manual contact creation now navigates directly
  to the newly created contact record instead of leaving the user on the people
  list.
- Contacts keep one primary email and one primary phone for compatibility with
  existing sales, search and softphone flows, plus optional secondary email
  addresses in `ContactEmailAddress` and secondary phone numbers in
  `ContactPhoneNumber`. Contact create/edit supports adding multiple labelled
  secondary methods. Search, MCP search, inbound email matching, website lead
  matching, telephony caller context and privacy export read these secondary
  methods.
- When Companies is enabled, contact create/edit uses a searchable company
  selector that can link an existing organisation or create a new linked
  organisation by name. When Companies is disabled, contact forms keep a plain
  company-name text value only and do not create/link `Company` records.
  Submitted company IDs and name matches are validated through the current
  user's company access policy before a contact is linked.
  Contacts and organisations created by an authenticated user keep
  `createdByUserId`; non-admin creators can view those standalone records even
  before they are linked to an opportunity.
  Contact and organisation records link to each other for navigation, with
  contact roles/job titles shown in both directions.
- Contact detail pages expose explicit Create lead, Edit, Merge and Delete
  actions in the page header. Contact merge keeps the current record, moves the
  duplicate contact's leads, conversations, calls, notes, tasks, files,
  attribution records and tags across, fills missing primary contact fields
  from the duplicate, keeps non-primary email/phone values as secondary contact
  methods, then removes the duplicate record.
- Contacts support reusable tags. The contact create/edit modal suggests
  existing tags as users type and stores assignments through canonical
  `ContactTag` records to reduce duplicate misspellings.
- People segment counts, generated draft counts and member rows are evaluated
  through the current user's contact/opportunity access policy. Non-admins can
  only refresh or delete segments they created.
- Contacts can store a manual postal address with address line 1, address line
  2, city, county, postcode and country fields. The People list exposes a
  combined Address column as an optional table column.
- Contact detail pages show a lead-style customer conversation panel across
  every linked lead, with customer AI guidance and email/SMS/phone reply
  drafting. Customer AI guidance is cached on the contact by a context
  fingerprint so reloads do not regenerate it unless linked history, tone,
  channel or AI context changes. Email/SMS replies from contact pages are
  attached to the latest open linked lead, or the latest linked lead when no
  open lead exists. Lead
  and contact conversation panels open the latest event by default, keep older
  events as compact rows and route the inline Reply action to the existing AI
  composer.
- Lead and contact AI guidance panels use a compact narrow-rail layout:
  slim header, short summary, action-first next step, real task creation,
  draft/call controls and compact stage guidance. Summaries can expand inline
  with Show more, and the previous context-signal and static task quick-add
  sections are intentionally removed.
- Sidekick separates lead record-list questions from lead metric questions.
  Prompts asking for counts or average lead generation rates are answered from
  deterministic CRM metrics instead of dumping matching lead records.
  Natural lead-performance timing questions are routed to the semantic report
  runner, so prompts such as best weekday or hour for leads are answered from
  grouped CRM data rather than a fixed question list.
- Contacts navigation is grouped into People, Companies and Segments. Segments
  store dynamic people criteria as safe CRM JSON rules, can be drafted from a
  conversational AI prompt when OpenAI is configured, and fall back to
  deterministic rule parsing when AI is unavailable.
- Cloudflare R2 integration and file metadata storage. Storage is an
  admin-only workspace with overview metrics, server-side search/pagination,
  URL-backed filters for type, visibility, uploader, linked state, date range
  and R2 folder, direct R2 upload, metadata editing and safe R2/database
  deletion. Uploaded image/PDF files are checked against known file signatures
  before storage, and SVG uploads are rejected unless a future sanitizer is
  added.
- File uploads support drag-and-drop and multi-file batches from the admin
  Storage browser, contact/company/sales document libraries and the compact
  sales documents panel. `FileAsset` rows now store optional notes and
  lightweight tags alongside uploader/date metadata; Storage and record
  libraries can search by name, MIME/type, notes and tags, and preview common
  image/PDF/text files through a same-origin inline preview route without
  forcing a download. Record document libraries support non-destructive bulk
  actions for selected files: move to another configured folder, add/replace
  tags and download the selected files as a ZIP. Bulk delete remains
  intentionally deferred until the product owner explicitly approves
  irreversible multi-file removal from R2 and the database.
- Contact, company/customer and sales opportunity detail pages now show a
  structured document library backed by the existing private R2 `FileAsset`
  metadata. Files are grouped by configurable folder slugs stored on
  `FileAsset.documentFolder`, and admins can add, rename or remove the default
  folder template from Settings > General through
  `CrmSettings.documentLibrary`. The shared record document library uses a
  compact workflow layout with separate Library, Upload files, Request files,
  Send to customer and Signatures tabs so browsing, staff uploads, customer
  upload requests, outbound document links/portals and DocuSign tracking do not
  all render in one long surface. The Send to customer tab now makes users
  choose between a selected-file share link, a fuller customer portal and link
  history, with exact selected-document details shown before a link is created.
  Per-file signing/metadata controls stay behind a row-level More actions
  disclosure to keep large folders scannable.
- Document uploads now have an auto-filing contract: upload flows pass a
  controlled document type such as `utility_bill`, `floor_plan`, `site_photo`,
  `commissioning_handover` or `warranty_certificate`, and the shared
  `record-document-upload` helper resolves that type to the configured folder
  before creating the private `FileAsset`. This is the path future enquiry
  forms, secure upload links, email requests and customer portal uploads should
  use.
- Contact, company/customer and sales document libraries can create secure
  customer upload request links. `CustomerUploadRequest` stores only a
  SHA-256 token hash, expiry, target record and checklist items; the plaintext
  link is shown once in the CRM. `/upload/[token]` is a public token-scoped
  page where customers upload against the requested document checklist. When a
  recipient email is provided, the CRM sends the secure link through the saved
  MailerSend integration and records delivery status in audit metadata without
  storing the recipient address there. Uploads reuse `record-document-upload`,
  auto-file into the configured folder, mark checklist items fulfilled, audit
  create/revoke/upload events and close the request when all required items are
  received. Public customer uploads use 5MiB multipart chunks through
  token-bound, short-lived upload sessions with a visible browser progress bar
  before being completed into a private R2 object and linked to the same
  checklist item. Customer upload links default to a 100MB chunked-upload cap
  so they are not held to the legacy 25MB server-action limit, while still
  respecting a higher R2 max upload setting up to 500MB. Public customer upload
  pages show friendly file-type guidance and expose a customer message field
  instead of internal tags. Upload request emails and public upload pages show
  the configured company logo above the first card, falling back to the default
  CRM logo, so customers can identify who sent the request. Upload request
  emails and public upload pages explicitly describe the link as private and
  time-limited before the customer chooses files. Public upload pages show
  compact trust cues for private-link scope, encrypted transfer and
  authorised-team review, then end with a confidential-file handling message
  covering private-link use, HTTPS transfer, private CRM document storage,
  uploader permission and not forwarding the link unless the team requests it.
  Public upload/share/portal pages also include
  customer-friendly helper steps, clear download/upload calls to action, expiry
  guidance and specific expired, revoked, completed or missing-link messages.
  Staff link forms prompt users to explain what is needed and what happens next
  before sending an email or copying a one-time customer link. When customers
  add more files to an item, the public upload UI keeps a token-scoped
  "Already received" list visible with only the filename, type, size and
  received time for files uploaded through that checklist item. Customers can
  remove a wrongly uploaded file from that same active token; the CRM unlinks
  it from the request, detaches it from the record when it has no other record
  uses, audits the removal and reopens completed requests when a required item
  becomes incomplete.
- Contact, company/customer and sales document libraries can create secure
  document share links for sending existing private CRM documents to clients.
  `CustomerDocumentShare` stores only a SHA-256 token hash, expiry/status,
  recipient metadata and selected file references. `/share/[token]` is a public
  token-scoped page that lists only the selected files, while
  `/api/document-shares/[token]/files/[fileAssetId]` validates token
  status/expiry and selected-file membership before redirecting to a
  short-lived R2 download URL. Share create/revoke/download events are audited
  without storing the plaintext token or signed R2 URLs, and opportunity shares
  also add a safe system timeline entry.
- Contact, company/customer and sales document libraries can create unified
  customer document portals. `CustomerDocumentPortal` stores only a SHA-256
  token hash, expiry/status, optional recipient metadata and optional links to
  one portal-managed upload checklist plus one portal-managed document share.
  `/portal/[token]` is a public token-scoped page where customers can upload
  requested files, download explicitly shared files and view DocuSign signature
  status for the same record/recipient. Signature status is only surfaced when
  the portal has a recipient email matching the signature recipient, so a
  no-email portal cannot expose record-wide signature requests. Portal uploads
  reuse the same server-action and multipart customer upload validation paths,
  and public portal pages show a customer-facing task summary with progress
  across shared files, requested uploads and signature requests. Public
  portal/share pages show friendly file-type labels instead of raw MIME values.
  `/api/document-portals/[token]/files/[fileAssetId]` validates
  status/expiry plus document-share or completed-signature membership before
  redirecting to a short-lived R2 URL. Portal create/revoke/download/upload
  events are audited without storing plaintext tokens or signed R2 URLs.
- Twilio integration settings with encrypted credentials. Public Twilio voice,
  queue, status, recording, transcript, conference and messaging webhook routes
  validate `X-Twilio-Signature` against the saved encrypted Auth Token before
  mutating call, SMS, recording or transcript state.
- MailerSend integration settings for API token, sender defaults, domain DNS
  records, domain validation status and inbound route config. Settings can
  refresh MailerSend DNS records and verification state inline from the saved
  API token, with copy controls on each DNS host/value.
- Central Inbox captures signed MailerSend inbound email webhooks, stores
  unmatched messages, and links matched messages to active sales opportunities
  when the sender email matches the opportunity contact. Inbound email bodies
  are normalized to plain text and trimmed to the latest visible reply before
  being shown on leads or used by Sales AI.
- Sales lead email drafts can be sent through the saved MailerSend integration
  and are logged back to the lead conversation timeline as outbound email.
- CRM-managed Twilio voice setup, including TwiML App and Voice Intelligence
  service provisioning.
- Browser softphone registration, outbound calling and inbound ringing.
- Sales/contact call controls use a lightweight softphone dial dispatcher so
  they do not import the full browser softphone provider just to request a dial.
- Inbound Twilio queueing, call logs, recordings and missed-call tasks.
- Telephony call logs show a basic failure interpretation for failed, busy,
  no-answer and cancelled calls, including likely cause and next action.
- Telephony call logs resolve browser softphone `client:agent_*` identities to
  agent names in table rows and selected-call details.
- The softphone call context panel can generate a new lead from an unmatched
  inbound caller, creating a contact, LEAD-stage sale, phone communication and
  linking the call log/queue/attribution records to that sale.
- Telephony caller context and call-generated lead APIs enforce CRM record
  access on submitted contact, sale and call-log IDs before returning PII or
  linking call, queue and attribution records.
- General inbound telephony can use round-robin queue routing and voicemail fallback.
- Telephony Routing has a reusable SmartFlow builder with structured If/Else
  conditions for known contacts, open leads, attribution, tracking numbers,
  inbound number, lead source and campaign. The runtime evaluates those
  conditions during initial routing and queue no-answer progression, and the
  editor includes a non-live Test flow simulator for branch checks before
  publishing.
- Call teams/departments can play ringback or music while the caller waits; ringback is the default.
- Twilio number search/purchase/configuration workflow for SMS/voice setup.
- Telephony > Phone numbers is the owned-number inventory: admins can buy Twilio
  operational numbers, see whether each number has routing coverage, and release
  owned numbers from Twilio with an explicit ownership-loss warning. Tracking
  pool numbers remain separate under Call Tracking.
- Marketing attribution dashboard and attribution setup page.
- Marketing provider integrations for Google Analytics, Google Search Console,
  Google Ads, Bing Ads, Klaviyo, LinkedIn Ads and Meta are managed under
  `Settings > Integrations`; the
  Marketing area shows reporting/status and links to Settings for provider
  setup. The integrations overview groups marketing providers by purpose,
  starting with Analytics, Advertising and Email & Automation, so clients can
  scan setup options by job rather than provider brand alone.
- Google Ads, Bing Ads, LinkedIn Ads and Meta setup is client-login first:
  CRM has a first-class iD30 Auth integration under `Settings > Integrations`
  so admins can connect the central Auth broker with a setup code or broker
  details instead of editing environment variables. When saved broker settings
  or fallback environment settings are present, CRM signs provider connect
  requests and redirects OAuth starts through `https://auth.id30.com` so iD30
  can own provider app credentials and callbacks centrally. CRM also exposes
  `POST /api/integrations/oauth/complete` for signed Auth completion callbacks;
  the endpoint verifies the shared HMAC signature plus CRM client/workspace IDs,
  then stores Auth connection metadata and selector options without raw provider
  OAuth tokens. Existing workspace OAuth credentials from environment or admin
  fallback setup remain available as an advanced fallback. Clients connect
  through provider OAuth and choose account/tag/pixel/event mappings from
  selectors. Provider readiness now separates Auth provider access from direct
  CRM upload credentials, so the UI can show a successful Auth connection
  without claiming direct conversion uploads are ready before an Auth upload path
  or local upload credentials exist. Selector refresh for Auth-connected
  providers now calls the signed Auth refresh API first, asks Auth to rediscover
  selectors with its stored provider access token and stores the returned
  selector cache in CRM, with local-token provider refresh retained as a fallback
  for manually configured connections. Conversion upload dry runs can also ask
  Auth to inspect readiness for Auth-connected providers without sending live
  provider requests. Signed Auth JSON requests include
  `x-id30-content-sha256`, every signed Auth broker API call includes
  `x-id30-crm-request-id`, and the HMAC payload binds that request id plus the
  exact request body digest before Auth parses it. Auth-connected Meta, Google
  Ads, Bing Ads and LinkedIn Ads live conversion sends use the signed Auth send API so
  provider credentials stay centralised; manually configured fallback
  connections still use the existing local encrypted credential path. iD30 Auth
  broker provisioning is an
  internal iD30 setup step, not a normal client integration task. The Auth
  integration is hidden from the standard integrations grid; clients connect
  only the marketing provider accounts once CRM already has saved broker
  credentials. The internal Auth provisioning route can still save setup-code,
  manual or bootstrap broker details when iD30 prepares a CRM instance. iD30
  Auth CRM client/workspace IDs must be exact Auth-issued values rather than
  wildcard placeholders, and browser-started OAuth return URLs use the current
  CRM request host so custom-domain installs return to the domain the admin is
  using. Provider pages surface this as a setup wizard with a clear next action
  across platform readiness,
  client login,
  selector refresh, account selection and conversion mapping. Manual provider
  credentials are retained only as a shared advanced fallback in the setup
  forms, which label the matching server environment keys without pre-filling
  or exposing secret values in the browser. Google Ads setup can refresh
  accessible customer, manager account and
  conversion action selectors from a workspace or saved developer token, the
  OAuth refresh token and OAuth app credentials. Bing Ads setup can refresh
  accessible account/customer, UET tag and conversion goal selectors from
  workspace or saved Microsoft Advertising credentials, and auto-map obvious
  account, customer, UET tag and conversion goal fields when selector results
  are unambiguous. Successful Google Ads,
  Bing Ads, LinkedIn Ads and Meta OAuth callbacks now attempt to refresh
  selector metadata immediately so admins can choose account, pixel, tag and
  conversion mappings without a separate first refresh step when provider API
  credentials are ready. The provider setup wizard reports loaded selector
  options by provider-specific categories, including Bing Ads accounts,
  customers, UET tags and conversion goals. LinkedIn Ads setup can refresh ad
  account, Insight Tag
  and conversion rule selectors from a saved LinkedIn Marketing API access
  token or OAuth connection, and auto-map obvious ad account, account name,
  Insight Tag and conversion rule fields when selector results are
  unambiguous. LinkedIn Ads readiness can use the central Auth broker as the
  provider credential source, queues lifecycle conversions from captured
  `li_fat_id` click IDs and sends live conversion events through Auth once the
  connected token includes LinkedIn's `rw_conversions` scope. The conversion
  scope is optional behind `LINKEDIN_ADS_REQUEST_CONVERSION_SCOPE=true` so
  basic LinkedIn Ads account connection can complete before LinkedIn grants
  Conversions API access. Direct access tokens remain only as an advanced
  fallback. Meta setup can
  refresh ad account and pixel selectors from the saved Meta access token, and
  auto-map obvious ad account, account name and pixel fields when selector
  results are unambiguous. Meta setup copy now makes the central Auth path
  explicit: once iD30 provisions Meta in Auth, clients only click Connect Meta
  and approve access, while missing Auth/provider app credentials are shown as
  an iD30 setup gap rather than client-entered secrets.
  Google Analytics setup now uses the same client-login first Auth broker path
  as the managed ad platforms where iD30 Auth is configured. CRM can start GA
  OAuth through Auth, preserve the Auth connection/callback state while admins
  save GA4 mapping, refresh cached GA account/property/web-stream/event
  selector options from Auth, and keep direct OAuth credentials only as an
  advanced fallback. The website tracking script still only needs the saved
  GA4 measurement/property/event mapping to compare CRM attribution with GA4
  events. Google Search Console setup now also uses the client-login first Auth
  broker path where iD30 Auth is configured. CRM can start Search Console OAuth
  through Auth, preserve Auth connection/callback state while admins save the
  selected property, refresh cached verified site selectors from Auth, and keep
  direct OAuth credentials only as an advanced fallback. The marketing import
  worker can import Search Console Search Analytics query/page/date metrics
  into provider performance rows with zero cost. Klaviyo setup now uses the
  client-login first Auth broker path where iD30 Auth is configured. CRM can
  start Klaviyo OAuth through Auth, preserve Auth connection/callback state
  while admins save account/list mapping, refresh cached account/list/campaign/
  flow/metric/form/segment selectors from Auth, and keep private API keys only
  as an advanced fallback. The marketing import worker can import Klaviyo
  campaign and flow value-report rows when a matching conversion metric is
  available, plus configured metric aggregate event counts for lifecycle
  reporting through the Auth-owned Klaviyo reporting endpoint, with direct
  fallback credentials kept only for advanced/manual setups.
- Tracking Engine attribution settings are split into dedicated routes under
  `/settings/attribution/[section]`; legacy `?section=` links redirect.
- Attribution Domains has a database-backed registry for expected production,
  staging, development and microsite domains. When the registry contains
  entries, active domains can run the attribution script and inactive or
  unlisted domains receive disabled script settings.
  The admin install checker is constrained in production to public HTTPS URLs,
  blocks localhost/private/reserved network targets and revalidates redirect
  destinations before the CRM server or optional browser smoke check connects.
- Website attribution script, lead capture and dynamic phone-number attribution foundations. Form tracking now carries safe submitted field names, labels and values into the sales conversation and attribution metadata, promotes submitted email values from captured field labels/types when website forms use generated input names, and captures same-origin `fetch`/XHR form POST payloads from multi-step JavaScript forms such as FormKit/Plutio project enquiries.
- Attribution snapshots can store passive coarse request location from Netlify
  Edge geo context, hosting/CDN geo headers, with optional server-side IP
  geolocation enrichment for public IPs when `ATTRIBUTION_IP_GEOLOCATION_URL`
  is configured, so Marketing > Visitor log can show visitor location when
  available. Snapshot location fields are merged over time so later requests
  with missing geo data do not clear a previously known location.
- Attribution snapshots store denormalized source, medium, campaign, ad
  provider and click ID fields alongside the raw first/last-touch JSON so
  Marketing > Visitor log can filter and paginate from indexed database fields.
- Attribution confidence scoring has a shared core helper for rating evidence as
  High, Medium, Low or Unknown from click IDs, UTM/source fields, landing page,
  journey timeline, conversion records, CRM matches and consent evidence where
  required. Marketing > Visitor log shows confidence badges, visitor detail
  shows internal evidence factors, and visitor CSV export includes confidence
  fields. Lead Sources and Attribution Reports show aggregate confidence and
  common evidence gaps by source/campaign. Marketing > Visitor log can filter
  confidence levels through database-backed evidence buckets so pagination,
  result counts and CSV exports match the selected confidence filter. Visitor
  detail can save point-in-time confidence audit snapshots that preserve the
  score, level, factor evidence and client-safe summary for later review.
- Marketing > Visitor log keeps the page header, metrics, tabs, table rows and
  pagination server-rendered while lazy-loading the interactive filter
  controls, live refresh controller and copy buttons into route-local client
  chunks.
- Marketing Overview includes a fixed version-one lifecycle funnel for sessions,
  leads, qualified pipeline, proposals, won deals and revenue, with
  conversion/drop-off rates, value and spend-derived cost where imported spend
  is available. Headline opportunity totals and the Executive Report client-pack
  lifecycle totals use uncapped database aggregate queries; visible
  detail/source rows stay separately capped for bounded page payloads.
- Marketing report views use dedicated routes for Attribution Reports, Lead
  Sources, Ad Platforms, Conversion Reporting, Offline Media, Sales Quality and
  Executive Report. Legacy `/marketing?view=...` links still render for
  compatibility, but sidebar and search navigation use the dedicated routes.
  Shared report date-range and report-section help uses the lazy tooltip
  wrapper so marketing report routes do not pull tooltip positioning code into
  every first load.
- Marketing > Ad Platforms can trigger manual Google Ads, Bing Ads, LinkedIn Ads and Meta
  campaign spend imports when cost import is enabled and required provider
  credentials are saved. Bing Ads spend import uses Microsoft Advertising
  campaign performance reports, then imports the downloaded campaign/date rows.
  LinkedIn Ads spend import uses LinkedIn Ad Analytics campaign/day rows through
  the current direct CRM access-token fallback; central Auth-broker spend import
  remains a future improvement if we want cost imports fully brokered too.
- Lead Sources includes quality reporting by source, including qualified leads,
  proposals, won deals, close rate, open and weighted pipeline, won revenue,
  average lead value and spend-derived CPQL/cost-per-won where imported spend
  is available.
- Conversion Reporting includes upload feedback for manual/dry-run lifecycle
  conversion uploads, including queue status counts, attention categories,
  match rate, provider mapping rate, upload success rate, provider coverage,
  rejection classifications, recent provider job messages, row-level feedback
  and next action guidance. Upload rows are classified into normalized
  categories with ready/info/warning/error severity so setup gaps, attribution
  evidence gaps and provider failures are separated. A Netlify scheduled
  conversion-upload function is
  available but disabled by default; set `MARKETING_UPLOAD_CRON_ENABLED=true`
  with `MARKETING_UPLOAD_CRON_SECRET` to let it prepare/process upload rows
  automatically, with optional dry-run mode.
- Attribution Reports includes version-one assisted journey reporting from
  stored first touch, timeline and last touch evidence, with first-touch,
  last-touch and assisted contribution by source, medium and campaign.
- Attribution touchpoints are now also normalized into `AttributionTouchpoint`
  rows linked to snapshots and conversion records. The original JSON
  first-touch, timeline and last-touch payloads remain stored for compatibility
  and audit context.
- Attribution Reports has a model switcher for first-touch, last-touch,
  assisted, linear, position-based and time-decay ranking. The selected model
  controls the primary lead, journey, pipeline and revenue columns while the
  role breakdown remains visible for comparison.
- Marketing > Visitor log labels first, assisted and last journey roles in the
  visitor table and visitor detail timeline so individual sessions align with
  the assisted reporting model.
- Marketing > Visitor log shows per-row completion fields, scoring whether
  source, campaign, click ID, journey, location, conversion, matched lead and
  device evidence are present and surfacing the most important missing fields.
  It also derives richer commercial completion context from existing data:
  session count, page count, repeat visitor status, consent debug signal,
  matched opportunity and won-deal state.
- Marketing > Visitor log is table-first: filters live in a compact sidebar,
  filter changes update the table through Next.js client navigation without a
  full browser reload, and the page auto-refreshes while visible so new visitor
  sessions appear for users monitoring the live log.
- Marketing > Visitor log treats paid search/social as evidence-based buckets:
  organic or referral traffic from Google, Facebook, Instagram or LinkedIn
  should not be counted as paid without ad-provider, paid-click or paid-medium
  evidence.
- Marketing includes an Offline Media Report that uses existing source and
  first-class `OfflineCampaign` records first, then falls back to source and
  campaign metadata for radio, print, event, direct mail, QR, outdoor, offline
  and manual campaign activity. Report rows show campaign codes, registered
  status, QR/phone response cues, linked attribution records/touchpoints,
  assigned tracking numbers, schedule and budget pacing cues, cost/CPL,
  pipeline and won revenue. Marketing >
  Offline Campaigns is the admin setup screen for creating and editing those
  campaign records. The same screen generates downloadable SVG and PNG QR
  artwork from the destination URL plus campaign UTM fields and
  `id30_offline_code`, with configurable QR error correction, PNG size, margin
  and colours. It also lets admins assign attribution tracking pool numbers to
  offline campaigns, with campaign coverage metrics that flag active campaigns
  still missing an active tracking number.
- Marketing includes a Sales Quality Report grouped by source and owner,
  showing qualified leads, proposals, close rate, average probability, weighted
  pipeline, won revenue and follow-up gaps such as missing next step, missing
  close date and stale open opportunities. It now also reports contacted rate,
  average first-response time, lost reason summary and average time-to-close
  from lifecycle/contact history where available. Sales Quality also includes
  pipeline stage performance and lifecycle transition history rollups.
- Sales opportunities store lifecycle history foundations: stage-change events,
  first-contact timestamp, stage-changed timestamp, close timestamp and lost
  reason fields. Manual sale creation, bulk stage updates, website-created
  leads, outbound phone calls and outbound SMS now write the history/contact
  data needed for deeper Sales Quality metrics.
- Sales owner assignment is enforced server-side. Admins can assign active
  users; standard users can only assign sales to themselves or leave them
  unassigned. The Sales page only renders assignable owner options for the
  current user.
- Sales pipeline stages now have a custom-stage model foundation. The legacy
  `SalesStage` enum remains the reporting/conversion bucket, while
  `SalesPipelineStage` stores configurable stage records mapped to those
  buckets. Opportunities and lifecycle events can link to the custom stage;
  default rows matching the legacy stages are seeded and backfilled. Admins can
  manage active custom stages, reporting buckets, order, probability, colour,
  descriptions, stage goals, AI context, SLA days, movement policy and
  required-data gate mode under `Settings > Sales Pipeline`. Discovery
  templates can be linked to a
  pipeline stage; required questions from matching lead/product/category
  templates warn or block bulk stage movement depending on the target stage gate
  mode. Stages can also require linked documents, specific controlled document
  upload types, completed survey evidence, issued proposal evidence, deposit
  receipt evidence and design approval evidence; these requirements are stored
  in stage metadata and reuse the same stage gate for manual moves, bulk moves
  and approved automation suggestions. New structured uploads store
  `FileAsset.documentUploadType`, while older files still satisfy exact
  document-type checks through their configured folder slug where possible.
  Sales creation, bulk stage updates, sales filters and sale/detail stage
  labels now use those custom stage records while keeping the legacy bucket in
  sync. Sale detail includes a stage control that previews required-data
  blockers/warnings before movement and writes lifecycle/automation history when
  the stage changes. Sales Quality now
  includes a Pipeline Stage Performance rollup grouped by custom stage with the
  legacy bucket as fallback.
- Sales automation foundations are in place: opportunities store a bounded
  lead score, `LeadScoreEvent` keeps score movement history, and
  `SalesAutomationRule` / `SalesAutomationRun` provide trigger/action
  foundations for stage entry, email, SMS, calls and site visits. Current hooks
  update score and automation run logs from stage changes, inbound/outbound
  email, inbound/outbound SMS and phone communications. Automatic send actions
  are represented through approval tasks and deliberately do not send live
  messages automatically. Admins can manage rules under
  `Settings > Sales Automation`, including trigger/action config, stage scope,
  enable/disable state, approval queue visibility and recent run history. The
  approval queue now supports reviewing/editing/sending or dismissing queued
  email/SMS drafts; sent/dismissed approvals leave the queue but remain in run
  history. Starter presets can create common discovery, proposal follow-up,
  inbound scoring, missed-call recovery and stage-suggestion rules. Sale detail
  now surfaces automation runs, score history and cached AI stage guidance
  beside the stage control so operators can see why a lead score or suggested
  action changed. Stage suggestions can be approved from the sale activity
  panel; approval reuses the same stage-gate, lifecycle and automation history
  flow as manual movement and marks the linked review task complete.
  `Settings > Sales Automation` includes a 30-day analytics section for run
  totals, failures, approvals, stage-move suggestions, rule performance,
  attention items and automation-assisted pipeline impact. Operators can mark
  AI stage guidance as useful or not useful from the sale activity panel; this
  is stored as internal system communication feedback for reporting and future
  recommendation tuning. The automation settings screen also includes AI
  feedback metrics, stage-age/SLA visibility for open leads, approval queue
  filters, richer run traces and safe admin controls to dry-run or duplicate
  rules without sending live messages. Rule config now supports optional score,
  source, service and stage-age conditions; the same condition evaluator is used
  by dry-runs and live automation execution. Stage SLA rows can generate
  follow-up tasks for overdue leads, and sale detail shows the current stage age
  against its configured SLA. The Sales AI conversion memory now includes
  accepted/dismissed recommendation feedback plus service-level outcome memory
  for CRM/operating-system, Shopify/ecommerce, digital marketing and lead-gen
  website work. Rule performance reporting includes assisted leads, win rate,
  won revenue and open pipeline by rule.
- Marketing includes a client-facing Executive Report that summarises
  attributed lead coverage, lifecycle progress, qualified pipeline, proposals,
  won revenue, best commercial sources and sales quality without exposing
  internal confidence factors or upload diagnostics. Executive Report includes
  a client-pack print mode at `/marketing/executive-report?print=1` with
  browser print/save-as-PDF controls, plus an authenticated downloadable HTML
  client-pack export at `/api/marketing/executive-report/client-pack`.
- Tracking Engine > Debug Logs is backed by stored attribution debug events and
  surfaces recent script, config, form, phone and number-assignment activity.
  Config request events show the stored domain allow-list decision, including
  enabled/disabled config, registered/unregistered host and decision reason.
  Stored debug event history is paginated server-side so operators can inspect
  older runtime events without loading the full debug table into the page.
  Operators can export stored debug history to CSV for support handoff and
  incident review. Browser-local saved incident filters let operators quickly
  reapply common domain, event, level and search combinations.
- Attribution script features can be enabled or disabled from Settings > Attribution.
- Dynamic phone-number insertion can replace visible phone numbers before
  marketing consent using a display-only request that does not create browser
  visitor IDs, attribution storage, form tracking, hidden fields or persistent
  number assignments until consent is granted.
- Attribution Session Settings can tune dynamic-number assignment duration,
  browser timeline cap and referrer capture.
- Attribution privacy export/delete is admin-only and audited. Visitor/session
  export streams matching attribution data plus directly linked CRM contacts,
  opportunities, communications, email messages, calls, queue entries and file
  metadata in cursor-sized batches so large identity exports avoid one large
  database payload. Large one-to-many CRM relations such as contact notes/tasks
  and opportunity lifecycle/product/discovery/score history are exported as
  sibling arrays keyed by contact ID or opportunity ID. Identity delete and
  retention purge intentionally remove Tracking Engine data only; linked CRM
  records remain for separate operational review.
- Consent Settings records client rollout readiness for attribution tracking,
  including legal basis confirmation, privacy policy update, consent banner
  wiring, domain registry review, reviewer, date and notes. It can also enable
  an optional built-in fallback consent prompt from the attribution script for
  sites without a CMP, with placement, light/dark/auto/custom theme, size,
  radius and safe hex colour controls for matching the client website. Auto
  theme follows the visitor browser or operating-system colour-scheme
  preference. This records operational sign-off points and does not replace
  legal advice.
- Main navigation is grouped into Home, CRM, Communications, Marketing, and
  Products & Operations sections, with Settings retained as the bottom admin
  dropup. The app shell uses a compact Shopify-style sidebar with a 240px
  expanded desktop width, subtle inline chevron markers for expandable groups,
  submenu rails with L-shaped active child markers, child-only active
  highlighting and a Lucide icon set for consistent CRM, communications,
  marketing and operations navigation. Selecting a parent group opens its first
  visible child route. Calendar is hidden from the active sidebar for now.
  Telephony's left menu is intentionally limited to `Phone System` and `Call
Tracking`; their detailed tabs live inside those pages. Marketing's left menu
  is intentionally limited to `Marketing` and `Tracking Engine`; their detailed
  sections live in page-level tab bars.
  Call Tracking overview, number-pool and tracking-number inventory pages are
  server-gated to admins because they expose operational phone setup state.
- Main sidebar shows an application health widget backed by `/api/health`, with
  lightweight polling, a public short build fingerprint and short server-side
  health result caching to avoid unnecessary database pings.
- Desktop softphone install guidance lives under `Settings > Desktop Softphone`
  at `/settings/browser-extension`. The page detects macOS vs Windows in the
  browser and points downloads through `/api/desktop-softphone/download`. The
  route keeps the header and server-side download availability immediate while
  lazy-loading the platform-detection download panel.
- The browser softphone extension opens a dedicated authenticated softphone
  window at `/softphone-window`. That window uses the same floating softphone UI,
  including minimising, draggable positioning, context panels, transfers,
  Chrome notifications and the browser availability heartbeat, so agents can
  keep the phone available without an active CRM dashboard tab.
- A first-pass desktop softphone wrapper lives in `desktop/softphone`. It is a
  separate Electron package that loads `/softphone-window`, supports
  always-on-top and compact/expanded window modes, and is not part of the
  Hostinger Next.js production build.
- Packaged desktop softphone builds check for updates at startup and then every
  15 minutes from the baked static update feed. The desktop app surfaces its
  current version and update state in the softphone Settings panel, downloads
  updates in the background, and installs automatically when the phone is not
  in a live/ringing/dialing call. macOS automatic install requires signed
  builds.
- Desktop installer download URLs must be public URLs configured with
  `ID30_SOFTPHONE_DOWNLOAD_BASE_URL`, or platform-specific overrides
  `ID30_SOFTPHONE_MAC_DOWNLOAD_URL` and
  `ID30_SOFTPHONE_WINDOWS_DOWNLOAD_URL`. The desktop release workflow builds
  macOS and Windows installers, uploads them to R2-compatible public storage,
  and writes auto-update assets under `{base}/updates`. GitHub release fallback
  URLs are only available when
  `ID30_SOFTPHONE_ALLOW_GITHUB_RELEASE_DOWNLOADS=true`, which is not suitable
  while the GitHub repo is private.
- A dedicated public R2 bucket, `id30-softphone-downloads`, currently hosts the
  macOS desktop softphone download at
  `https://pub-dd0c50b7d886446ea973dd80b6ea38f6.r2.dev`. Windows downloads
  remain disabled until the Windows installer is published.
- The Desktop Softphone settings page uses authenticated staff download links.
  The legacy `/api/desktop-softphone/install-macos` script route is
  authenticated and retained only for controlled internal use; public curl
  installer commands are no longer shown in the CRM.
- The Telephony dashboard has an install card for the desktop softphone app
  that links to `Settings > Desktop Softphone`.
- The Telephony dashboard keeps queue summary and recent call log compact in
  the main content column, with system health retained as the right-side status
  rail.
- Telephony routing is managed through a SmartFlow-style preview in
  `Telephony > Routing` with a click-through full-screen editor. The editor
  now stores richer call-flow nodes plus explicit edges in phone-system config
  JSON while still saving `routingRules` for the Twilio queue runtime. The
  SmartFlow preview/editor help uses the lazy tooltip wrapper inside the
  deferred routing chunk.
- Business numbers are lifecycle records in `BusinessPhoneNumber`. They are not
  attribution pool records and they do not contain routing forms; routing starts
  still belong in `Telephony > Routing`. Business-number page guidance uses the
  lazy tooltip wrapper so the inventory route does not import tooltip
  positioning code on first load.
- Twilio import/save now backfills the configured Voice caller ID into
  `BusinessPhoneNumber` when that number is present in imported Twilio
  inventory, so existing operational numbers appear in `Telephony > Phone numbers`.
- Telephony > Users & Extensions is now table-first: agent availability,
  routing targets, team membership and capacity are shown in one table, with
  detailed per-agent editing moved into a modal. Agent avatars are shown where
  profile images exist, with initials as the fallback.
- Admin shell performance is tuned for Netlify serverless: global CRM settings
  are cached with explicit invalidation, header notifications load through an
  authenticated API after initial render, and session `lastSeenAt` writes are
  throttled.
- CRM Sidekick is exposed from the top-right app header as a Shopify-style
  right sidebar. Sidekick can inspect sales, lead-source, usage, call, customer
  timeline, stale lead and follow-up gap data through a fixed server-side tool
  registry. General write actions are blocked and logged, but Discovery pack
  requests can create an inert `SidekickWritePlan` preview that must be approved
  by an admin before the server applies it. Approved Discovery plans
  create/upsert templates and questions only; they do not hard-delete questions
  or mutate historical answers. Sidekick parses quoted pack names, numbered
  question lists and simple type hints before it falls back to generic
  Discovery-plan questions. OpenAI API calls run server-side using the existing OpenAI
  integration when present, with environment fallback and token guardrails.
  The drawer opens to a quiet prompt state with animated thinking feedback
  while CRM data is fetched. Non-CRM prompts are blocked before model calls, and
  visual report payloads are only generated for explicit report, chart, metric,
  trend, ranking or grouped analysis prompts. Sidekick now has a deterministic
  lead-list query path for record questions such as new leads today, open leads
  this week and recent website enquiries, returning exact counts and linked
  records instead of relying on model interpretation. Natural lead timing
  questions such as best day, weekday or hour for lead generation route to the
  semantic report runner and group sales opportunities by approved day,
  weekday and hour dimensions. Open-lead owner/source/stage report prompts use
  an approved `isOpen` sales filter that is applied before grouping, so open
  opportunities are separated from won/lost opportunities without relying on
  model-guessed stage names. Broad service demand prompts can still use the
  approved service-focus report dimension derived from lead scope product types
  and related lead text. Catalogue product prompts now use a first-class
  Opportunity products report dataset backed by `OpportunityProduct`, so
  questions about which product records, product types or product categories
  are linked to leads can report
  product leads, selections and linked pipeline/revenue without relying only on
  lead-scope text.
  Marketing attribution prompts about campaigns, source quality, visitors,
  sessions, touchpoints, landing pages, referrers, ad platforms, Search Console
  queries, search terms, organic pages and cost-per-lead use the approved
  Marketing attribution report dataset backed by normalized
  `AttributionTouchpoint` rows.
  Task workload prompts about overdue, due-today, upcoming, completed, blocked,
  unassigned, assignee, creator and linked-record coverage use the approved
  Tasks report dataset backed by `Task` rows and derived due-status metrics.
  Communication prompts about email, SMS, WhatsApp, phone, inbound/outbound
  replies, users, lead owners, channels, directions and missing linked contacts
  use the approved Communications report dataset backed by
  `SalesCommunication` rows.
  Empty report results now include dataset-specific guidance for likely setup,
  tracking, linked-record, filter or date-range causes, and the same guidance is
  rendered in Sidekick and the Reports workspace table empty state.
  Generated report answers also use deterministic insight summaries from the
  returned report rows, so fallback answers can explain the leading grouped
  result or first/latest period comparison even when OpenAI is unavailable.
  Assistant responses include a compact "How Sidekick answered this" disclosure
  in the drawer with answer mode, checked tools, permission scope and, for
  generated reports, dataset, date range, row count, grouping, metrics, filters,
  chart type and planner source.
  Sidekick answers now include useful/not-useful feedback buttons. Feedback is
  written to `AuditLog` as sanitized `ai.sidekick.feedback` metadata with
  prompt/answer previews, tool names and report identifiers, without storing
  raw report rows.
  Generated report cards can now save directly from the drawer through the
  existing report save API, storing the sanitized report plan as a private saved
  report without forcing the user to open Reports first.
  Sidekick responses can now offer contextual follow-up prompt buttons based on
  the checked tool or report dataset, so users can continue related analysis
  with one click.
  `npm run sidekick:prompt-smoke` provides a local Sidekick report-routing smoke
  harness that verifies representative natural-language prompts against
  expected tools, datasets, dimensions, filters and leading metrics without
  requiring live login credentials.
  Website form prompts about submitted fields, form lead volume and missing
  email/phone details use the approved Form submissions dataset backed by
  `AttributionRecord` rows with source `FORM`.
  Discovery answer prompts about budgets, timeframes, platforms, requirements,
  selected answers and answered questions use the approved Discovery answers
  report dataset backed by `OpportunityDiscoveryAnswer` rows, including
  product/category context and linked pipeline value.
  Sales lifecycle prompts about contacted rate, first-response time,
  time-to-close, lost reasons and stage transitions use the approved Sales
  lifecycle dataset backed by `SalesOpportunity` lifecycle fields and
  `SalesLifecycleEvent` history.
  Telephony prompts about queue wait, missed calls, recordings and transcript
  readiness use the expanded Calls report dataset backed by `CallLog` and
  `CallQueueEntry` records.
  Setup and handover prompts about outstanding items, client readiness and
  launch checklists use the approved Setup readiness dataset backed by the
  shared `loadSetupReadiness` checklist used by Dashboard and Settings > Setup.
  Contact and client prompts about open opportunities, recent activity, stale
  contact, paid-ad origins and submitted-form origins use the approved Contacts
  and clients dataset backed by contacts plus linked CRM activity. The dataset
  uses grouped form-attribution counts and the latest form sample per contact so
  reports do not load every form attribution row for each selected contact.
  User/security prompts about 2FA adoption, admin accounts without 2FA,
  pending setup links, active users by role and inactive logins use the
  approved Users and security dataset without exposing credentials or tokens.
  Storage prompts about workspace usage, largest files, recent uploads,
  uploaded-file records and unowned/unlinked files use the approved Storage
  assets dataset backed by `FileAsset` metadata.
  Month-over-month lead comparison prompts, such as this month compared with
  last month, route to a generated month-grouped report instead of the direct
  lead-count answer.
  Calendar ranges and report time buckets use the CRM workspace timezone rather
  than the server timezone. Sidekick API calls
  are throttled by user and IP through the database-backed rate-limit bucket,
  and OpenAI calls use a bounded timeout with deterministic CRM-data fallback
  when the provider is unavailable. Sidekick also passes the current browser
  path/title from the drawer and can load the current sales opportunity or
  contact record when the prompt explicitly refers to this/current page.
  Admins can review Sidekick write plans from Settings > Sidekick, including
  draft/applied/failed/rejected plan history, proposed Discovery questions and
  apply/reject actions outside the original chat drawer session.
  Generated Sidekick reports include an `Open generated report` card that stores
  the latest result in browser session storage and opens `/reports?source=sidekick`.
  The Reports workspace restores that Sidekick exploration with the same chart,
  table, export, customise, rerun and save controls as normal reports, while
  regenerating a Sidekick report dispatches a browser handoff event so an
  already-open Reports workspace replaces the visible result immediately. Future
  run/save actions still pass through the authenticated report APIs and plan
  sanitiser.
  Focused unit tests cover Sidekick intent routing, write-action blocking,
  Discovery write-plan detection and current-page path parsing.
  The Sidekick drawer keeps its local chat when closed/reopened and provides a
  New chat action to clear local messages, input and errors without deleting
  audit logs or write-plan records.
- Reports is a first-class workspace at `/reports`. It uses a semantic report
  registry rather than raw SQL, with approved datasets for sales opportunities,
  opportunity products, marketing attribution, calls, tasks and communications.
  Users can run default reports, customise dataset/metrics/dimension/date
  range/chart/filter settings, view KPI cards, charts and tables, export CSV
  and save private custom reports. `ReportDefinition`
  stores saved report configs and `ReportRun` stores run history/audit
  metadata. CRM Sidekick uses OpenAI, when configured, only to produce a
  structured report plan from the approved dataset catalogue; the report engine
  validates that plan before execution, with deterministic keyword planning as
  the fallback. The sales opportunity catalogue includes day, weekday and hour
  dimensions for semantic lead timing reports, plus an `isOpen` filter for
  open-lead rankings. The opportunity-products catalogue links selected
  Product records back to sales opportunities for product demand and linked
  pipeline reporting. Marketing attribution reporting reads normalized
  touchpoints for source, campaign, medium, visitor, landing-page and
  conversion-type analysis. Report filters are applied to underlying rows before
  grouping so filtered reports still work when the filtered field is not the
  selected dimension. Sidekick renders the same visual report payload directly
  in the drawer and can hand the generated report into `/reports` as a
  restorable Sidekick exploration for deeper review.
- Sales lead detail includes a read-only Sales AI assistant backed by
  `/api/ai/sales-lead`. It uses the current lead, contact/company,
  conversation history, call summaries/transcripts, attribution context, the
  CRM-wide AI context stored under `Settings > AI Context`, recent conversion
  memory derived from sent emails, replies, stage movement and won/lost
  outcomes, the current pipeline stage goal/AI context and the editable
  `SalesOpportunity.leadScope` JSON field to produce a lead summary, next best
  step, conservative stage movement recommendation and draft email/SMS/phone
  follow-up. The assistant focuses on progressing the lead according to the
  configured stage objective. The sale detail layout uses a connected tab rail
  for Conversation, Lead and Discovery, with Sales AI/customer context on the
  right. The AI email/SMS/phone-script composer opens from the conversation
  reply action or Sales AI draft controls, and expands into a bottom sheet with
  optional full-screen editing. SMS sends through Twilio, phone scripts use
  click-to-call, and email sends through MailerSend when configured.
- Twilio inbound SMS replies are handled before delivery-status callbacks,
  because inbound webhook payloads can include `SmsStatus=received`. The
  messaging webhook must return TwiML for inbound messages so Twilio accepts the
  webhook and the CRM can create the inbound lead conversation event.
- OpenAI credentials are managed under `Settings > Integrations > OpenAI` and
  are encrypted in `IntegrationConnection.config`; the same connection is used
  by Sidekick and call transcript analysis, with environment variables retained
  as fallback.
- Netlify runs a scheduled warmup function every four minutes to reduce
  user-facing cold starts on the main SSR/API path and keep Neon compute warm.
- DB load is reduced with short-lived caches for header notification counts and
  attribution domain config. Routine enabled attribution config requests update
  diagnostics at most every 15 minutes per registered domain instead of writing
  on every script load. Desktop softphone presence polling runs every 30 seconds
  with a 90-second active window.
- Inbound queue routing treats queue-level assigned agent IDs and per-agent
  assigned queue IDs separately, so a queue with assigned users can correctly
  find available agents.
- `mcp.id30.com` is the planned broker between client-owned ChatGPT/OpenAI
  accounts and client CRM hosts. CRM exposes signed read-only MCP endpoints,
  including search, approved report execution, sales summary, marketing report,
  setup status and executive report routes. CRM validates requests with
  `MCP_CRM_SHARED_SECRET` plus the configured Auth client/workspace IDs,
  rejects replayed `x-id30-mcp-request-id` values, enforces each endpoint's
  required scope from signed `x-id30-mcp-scopes` context, returns structured
  row-limited JSON and audits successful, failed, scope-denied and rejected MCP
  tool calls. Netlify production should set `ID30_AUTH_BASE_URL`,
  `ID30_AUTH_CRM_CLIENT_ID`, `ID30_AUTH_WORKSPACE_ID` and
  `MCP_CRM_SHARED_SECRET` together.

## Recent Decisions

- Marketing navigation is grouped as:
  - Attribution Dashboard
  - Tracking Engine
  - Lead Sources
  - Ad Platforms
  - Conversion Reporting
- Marketing provider setup belongs in `Settings > Integrations` so all
  third-party connection credentials and account mappings live in one place.
- Telephony navigation is grouped as:
  - Overview
  - Phone numbers
  - Agents
  - Teams
  - Routing & IVR
  - Business hours
  - Monitoring
  - Recordings
  - Phone settings
- The Telephony main sidebar submenu and in-page Telephony tabs share the same
  phone-system navigation list for labels, order and URLs. The sidebar also
  keeps a nested Call Tracking submenu for attribution-specific phone-number
  management.
- `Telephony > Monitoring` contains the live queue view and the searchable call
  log. The call log is paginated and updates the selected-call detail panel
  client-side, without a full page reload. Use `/telephony/live?view=logs` for
  call history rather than adding a separate top-level Call Log tab.
- `Telephony > Recordings` stays focused on recording/transcript settings,
  replay and AI analysis pipeline controls. Its recordings table is searchable,
  filterable and paginated through the Telephony recordings API.
- Settings > Integrations > Twilio can create or update the Twilio TwiML App
  and Voice Intelligence service through the CRM-managed voice setup action.
  The returned Voice Intelligence Service SID is saved back into Twilio config.
- Chrome extension installation is a generic Settings area rather than a
  Telephony tab. `/telephony/extension` redirects to
  `/settings/browser-extension` for older links.
- Phone System and Call Tracking were removed from the generic Settings nav to reduce duplication.
- Pushing to GitHub `main` triggers the Netlify production build; verify the
  live `/api/health` public build fingerprint after deployment. Detailed build
  metadata is available only to authenticated CRM users through `/api/build-info`
  and Settings > System.
- Netlify uses `npm run netlify:build`, which runs Prisma migrations before
  `next build`. Keep `MIGRATE_DATABASE_URL` set to a direct Neon URL when
  `DATABASE_URL` is pooled.
- Netlify scheduled function `warm-crm` pings `/api/health` and `/signin`
  every four minutes. Override with
  `CRM_WARMUP_PATHS` if the warmup target list needs changing.
- Netlify Edge Function `attribution-geo` runs on `/api/attribution/*` and
  forwards passive `context.geo` fields to the Next.js attribution handlers
  through normalized internal request headers.
- Multi-developer work should happen on task branches and merge through PRs.
- Twilio Conference `waitUrl` responses must not return invalid verbs such as `<Hangup>`.
- Active-call routing uses a live-call window so stale `IN_PROGRESS` rows do not block agents forever.
- Rejected pre-answer browser softphone calls should return the caller to queue routing and skip that agent on the next attempt.
- If a rejected pre-answer call has no remaining eligible agents, it should go straight to voicemail.
- Inbound calls linked to a single open sale route to the sale owner first when that owner has a valid target, fresh presence and no live call; queue routing is the fallback after rejection or genuine unavailability.
- Caller ringback continues while an agent invite is pending, then the queue wait URL rechecks state so rejected calls can move to the next agent.
- Queue wait URLs now guard terminal entries so Twilio cannot reroute an already-ended call after a reject or conference lifecycle callback.
- Conference status callbacks no longer complete waiting queue entries by themselves; the actual caller leg ending is what completes the queue.
- Queue wait URL redirects must use the public webhook base URL. Hostinger can expose `request.url` as `https://0.0.0.0:3000`, which caused Twilio error `11200` and caller-facing application errors.
- `/api/health` includes only an embedded short build fingerprint so live
  deployment freshness can be verified without exposing full release metadata
  publicly. Authenticated CRM users can read full commit, branch, build time
  and runtime start time from `/api/build-info`. Use `npm run deploy:check`
  after Netlify deploys.
- Browser softphone heartbeats continue while `/softphone-window` is open, including when the dashboard tab is closed; the stale browser-agent window is ten minutes.
- Desktop softphone packaging is separate from CRM deployment. Use
  `desktop/softphone` for Electron development and package signing/release
  work; do not add Electron dependencies to the root Hostinger app.
- Cold transfer agent legs now get the same Twilio status callbacks and browser context as queue-routed legs. The original agent leaving after starting a transfer must not complete the customer call before the target agent has taken over.
- Call routing setup now uses the iD30 Prospecting SmartFlow interaction
  pattern: compact preview on the settings page, full-screen editor for changes,
  draggable utility controls, canvas pan/zoom, plus-node insertion controls,
  branch handles and right-side inspector. Flow nodes present simple if/else
  rules, waits, team ringing, voicemail and end-call states.
- Routing editor node cards are draggable on the full-screen canvas using
  pointer capture and window-level pointer handling, so fast drags and drags
  across the side panel do not drop. The add menu exposes a single configurable
  `Route to` action; the sidebar lets admins choose sales-agent owner routing,
  a specific individual, or a team/call group with ring strategy and timeout
  settings.
- The default open-sale routing step is also the configurable `Route to` node,
  with `Sales agent from open sale` selected by default. Do not present the
  default journey as a separate static `Route to sale agent` action.
- The routing canvas should read as a caller journey: inbound call, open-sale
  decision, sale-agent attempt, short wait, team routing, voicemail and end call.
  Keep detailed ring strategy, timeout and fallback settings in the sidebar.
  The default journey now uses a cleaner left-branch/rejoin layout and the
  editor has a toolbar `Tidy flow` action to restore that structure.
- Routing flow edges intentionally allow multiple incoming connections to the
  same node, so separate paths can converge on a shared team, voicemail or end
  node. Incoming arrows should use separated target ports rather than stacking
  on the exact same point.
- Inbound route resolution now reads the published routing graph for supported
  caller-journey nodes. The live runtime can execute owner-only sale-agent
  attempts, wait nodes, team queue nodes, voicemail nodes and end-call nodes
  while still using the established Twilio conference/queue mechanism for
  agent invites and reject/no-answer callbacks.
- Queue routing now appends a `routingTransitions` trail to call and queue
  metadata for route resolution, graph node changes, waits, agent invites,
  no-answer timeouts, fallback handling and queue errors. `Telephony > Routing`
  shows a live diagnostics panel using this trail.
- The routing editor can run business-hours, time-rule, audio-message, IVR,
  redirect, wait, configurable Route to, team, voicemail and end-call nodes in
  the live Twilio queue runtime. Date-rule nodes can be stored and evaluated
  from node data, but customer-facing UI for detailed date configuration is
  still light.
- IVR menu nodes expose editable keypad options in the sidebar. Each option has
  a key, label, optional message and destination, and each key becomes its own
  canvas connector. Publish validation blocks IVR keys that are not connected.
- The IVR sidebar is keypad-led: admins click phone keys to add/select options,
  edit the selected key's label, destination and message, then optionally copy a
  generated prompt preview into the spoken IVR prompt.
- IVR settings are split into separate inspector sections for general prompt
  settings, keypad selection, the selected-key route and fallback handling so
  global settings are not mixed into the keypad-specific form.
- The selected-key route fields use a faint brand-tinted panel so admins can
  visually associate those fields with the currently selected keypad button.
- Voicemail and missed-call fallbacks now close the linked `CallLog` as
  `NO_ANSWER` instead of leaving a stale `IN_PROGRESS` row when no voicemail
  recording callback arrives.
- Routing diagnostics now show a compact caller journey alongside the raw
  transition trail.

## Known Gotchas

- The phone-system config may be absent in production. If absent, defaults apply:
  - timezone `Europe/London`
  - Mon-Fri `09:00-17:30`
  - after-hours destination `MISSED_CALL_TASK`
  - after-hours message: "Sorry, the team is unavailable..."
- If calls before 09:00 say the team is unavailable, business hours are the reason unless config says otherwise.
- Browser/Flex softphone users need a fresh availability heartbeat. The router excludes browser agents stale for more than ten minutes.
- Hidden browser tabs should not mark a softphone offline; page unload is the offline signal.
- Queue voicemail recordings are stored first as Twilio recording references on `CallLog`; R2 archiving is not implemented yet.
- Browser softphone recovery must treat the current user as active when they are the transfer target in call metadata, even before the status callback has reassigned `CallLog.userId`.
- Do not remove or bypass `routingRules` when adding routing-flow features. The
  inbound resolver can read supported graph nodes, but Twilio queue attempts,
  reject handling and agent selection still depend on the saved routing-rule
  metadata.
- A true sale-owner routing test requires the caller number to match
  `Contact.phone` and that contact to have exactly one open sale. Calling from
  an unlinked tracking number tests general queue routing, not owner routing.
- IVR digit-specific branches are supported by runtime edge handles such as
  `digit:1`, `key:1` or `1`. Saved legacy `ivrKeys` still load, but new editor
  changes write structured `ivrOptions` with per-key labels, messages and
  destinations. Full live DTMF analytics and audio asset management are still
  placeholders.
- Twilio credentials are live and chargeable. Do not buy numbers, release numbers, send SMS or place calls without explicit approval.
- Releasing a `BusinessPhoneNumber` calls Twilio to release the incoming phone
  number SID, removes it from the imported inventory snapshot, and clears it as
  default voice/SMS sender if applicable. The number may not be recoverable.
- If `Telephony > Phone numbers` looks empty after adding the owned-number table,
  check whether existing Twilio numbers have been imported/backfilled into
  `BusinessPhoneNumber`; legacy numbers used to live only in Twilio config.
- `npm audit --omit=dev` still reports a moderate PostCSS advisory through
  Next's bundled `postcss@8.4.31`. As of Next `16.2.10`, npm's suggested
  automated fix is a breaking downgrade to `next@9.3.3`; do not apply
  `npm audit fix --force` for this until a stable patched Next release is
  available.
- Local `npm run build` has previously hung during Next optimization on this machine. Typecheck/lint may still pass.
- Current worktree may contain unrelated local changes, especially `src/components/crm-boilerplate/SoftphoneProvider.tsx`, `docs/development-review-2026-06-19.md`, and `output/`. Do not revert them unless explicitly asked.

## Deployment Status

GitHub `main` deploys to Netlify production. Netlify live state must be checked separately after every push.

During the current dev phase, Codex should deploy completed jobs by merging or
pushing the intended commit to `main`, waiting for Netlify deployment, and
verifying `/api/health.build.shortCommit` matches GitHub `main`. If Netlify is
still serving an older commit, report that the work is not live yet.

Useful checks:

```bash
curl -s https://crm.id30.com/api/health
npm run typecheck
npm run lint
```

## Next High-Value Work

- Add a one-click admin repair/diagnostics screen for Twilio queue errors.
- Make phone-system business hours setup part of first-run onboarding.
- Split Marketing/Telephony placeholder nav targets into real pages or section anchors.
- Add Twilio Debugger/Event Streams ingestion for production observability.
- Add tests around inbound after-hours routing and Conference waitUrl TwiML.

## Update Rule

When a task changes system behaviour, update this file with:

- the change;
- any new operational gotcha;
- any live deployment requirement;
- test evidence or known gap.
