# Architecture

## Stack

- Next.js App Router with TypeScript.
- Prisma ORM with PostgreSQL.
- Neon Postgres in production.
- Netlify Next.js runtime for the live app.
- Tail Admin Pro styling/components as the UI base.
- Custom database-backed sessions with HTTP-only cookies.

## App Layout

- Authenticated app routes live under `src/app/(admin)`.
- `src/app/(admin)/layout.tsx` validates the current user.
- `src/layout/AdminShell.tsx` wraps the main app shell and global softphone.
- `src/layout/AppSidebar.tsx` owns the main navigation.
- `src/components/crm-boilerplate` contains project-specific reusable UI.

## Auth

- `src/lib/auth.ts` exposes session helpers, `requireUser()` and `requireAdmin()`.
- `src/lib/actions/auth.ts` contains login/logout/profile/password/admin user actions.
- `src/lib/auth/two-factor.ts` owns TOTP secret generation, code verification
  and short-lived signed 2FA login challenge tokens.
- `src/lib/auth/session-display.ts` contains shared browser/IP display helpers
  for session management surfaces.
- `src/lib/users/bulk-user-import.ts` owns CSV parsing and normalization for
  Settings > Users bulk account creation.
- `src/proxy.ts` does a lightweight session-cookie check only.
- Admin-only server pages/actions must enforce `requireAdmin()` server-side.

## Data Model

Core Prisma models are in `prisma/schema.prisma`.

- `User`: CRM user, auth identity and telephony profile.
- `Session`: database-backed auth session.
- `AuthRateLimitBucket`: database-backed authentication throttle bucket used
  for sign-in, two-factor and password-reset attempt limits across app
  instances.
- `Company`: account/company record.
- `Contact`: customer/person record, including one primary email, one primary
  phone and optional manual postal address fields for address line 1, address
  line 2, city, county, postcode and country.
  Contacts and companies store a nullable creator user link so non-admins can
  still view standalone records they created before an opportunity exists.
- `ContactEmailAddress` / `ContactPhoneNumber`: labelled secondary contact
  methods linked to `Contact`. Primary values remain on `Contact` for existing
  sales, search, MCP and telephony compatibility; secondary rows are used for
  search, inbound matching, caller context, merge preservation and privacy
  export.
- `ContactSegment`: saved dynamic people/company segment definition. The first
  runtime supports people segments backed by safe JSON criteria rather than
  arbitrary SQL. Segment counts and member rows are evaluated through the
  current user's CRM contact/opportunity access policy.
- `ContactTag` / `ContactTagAssignment`: reusable contact tags with canonical
  slugs and many-to-many contact assignment.
- `SalesOpportunity`: sale/enquiry pipeline wrapper, including current lead
  score and score timestamp.
- `SalesPipelineStage`: configurable sales stage mapped to the stable
  `SalesStage` reporting/conversion bucket, with stage goal, AI context,
  movement policy, required-data gate mode and metadata-backed stage
  progression requirements.
- `SalesCommunication`: communication journey events attached to a sale.
- `ProductCategory` / `Product`: reusable service/product catalogue for sales
  scoping, with optional R2-backed product image assets and room for later
  quoting, inventory or production workflows.
- `DiscoveryTemplate`, `DiscoveryQuestion` and `DiscoveryTemplateQuestion`:
  reusable lead/product discovery framework. Lead templates apply to every
  opportunity; product/category templates are pulled in when the related
  product exists on a lead. Templates can be scoped to a sales pipeline stage so
  required answers can warn or block stage movement. Discovery questions store
  answer type plus answer mode for single, capped multiple and unlimited
  multiple answer collection. Product/category selector answer types allow
  lead-level Discovery packs to attach catalogue products or capture category
  intent without using bespoke lead-scope JSON fields.
- `OpportunityProduct` and `OpportunityDiscoveryAnswer`: selected products and
  captured discovery answers for a sale, optionally scoped to a product line or
  category. Answers snapshot the question label, help text, answer type, answer
  mode, options and version at answer time so old leads remain understandable
  if a question is later renamed, archived or superseded.
- `LeadScoreEvent`, `SalesAutomationRule` and `SalesAutomationRun`: sales
  automation foundations for scoring and trigger/action history across stage
  movement, communications, calls and site-visit events. Send-email and
  send-SMS automation actions create approval tasks and skipped run records
  instead of sending messages automatically.
- `EmailMessage`: central inbound email inbox rows, optionally linked to a
  contact, sales opportunity and sale communication.
- `CallLog`: provider-neutral phone call record.
- `CallQueueEntry`: inbound Twilio queue state.
- `Task`: follow-up work, including missed-call tasks.
- `NotificationState`: per-user review/dismiss state for generated header
  notifications keyed by notification ID and fingerprint.
- `FileAsset`: R2-backed media/file metadata, including linked CRM entity,
  optional document-library folder slug, controlled document upload type,
  uploader, notes and lightweight tags for structured record documents.
- `CustomerUploadRequest`, `CustomerUploadRequestItem` and
  `CustomerUploadRequestFile`: public customer upload-link records. Requests
  store only token hashes, expiry/status, the target CRM entity and required
  document checklist items; uploaded files remain normal private `FileAsset`
  rows.
- `CustomerDocumentShare` and `CustomerDocumentShareFile`: public customer
  document share-link records for sending existing CRM documents to clients.
  Shares store only token hashes, expiry/status, selected file links and
  download counters; source files remain private `FileAsset` rows.
- `CustomerDocumentPortal`: public customer document portal records. A portal
  stores only its token hash, target CRM record, optional recipient metadata and
  optional links to one portal-managed upload checklist and one portal-managed
  document share.
- `SignatureRequest`, `SignatureRecipient` and `SignatureEvent`: DocuSign
  envelope tracking linked to CRM record documents. Requests store safe
  provider IDs, statuses, timestamps and links to source/signed/certificate
  `FileAsset` rows, not OAuth tokens or raw provider payloads.
- `IntegrationConnection`: provider config and encrypted credentials.
- `ExternalRecordLink`: provider-neutral mapping from external records to CRM
  record IDs. Pipedrive import will use it to make lead/person/organisation
  sync retries idempotent without trusting names or email addresses as primary
  provider identity.
- `BackgroundJobRun`: compact operational job history for maintenance,
  marketing rollup refreshes, conversion uploads and ad spend imports. It
  stores status, trigger, duration and read/write counts, not credentials or
  raw customer payloads.
- `CrmSettings`: global CRM settings, including workspace defaults, display
  formatting defaults, interface defaults, document-library folder templates,
  module toggles, sales defaults, sales Kanban card settings, task defaults,
  notification defaults, company profile/logo branding and the CRM-wide AI
  context used by assistant prompts.
- `SidekickWritePlan`: inert AI-proposed write plans. Discovery pack plans can
  be previewed in Sidekick and applied only through an authenticated admin
  approval route. Plans do not delete questions, mutate historical answers or
  bypass server-side validation.
- `RealtimeVersion`: tiny topic/version rows used by the generic SSE endpoint
  so active pages can refresh after communication, task and telephony changes
  without polling their full datasets.
- Attribution models: snapshots, normalized touchpoints, records, tracking
  numbers and phone assignments.
- `OfflineCampaign`: offline media campaign metadata, including campaign code,
  channel/status, source fields, dates/costs and optional attribution links.

## Performance Observability

- `src/lib/prisma.ts` owns the shared Prisma client and opt-in model operation
  timing. Timings are aggregated in process memory by safe labels such as
  `Contact.findMany`; raw SQL, Prisma args, parameters, credentials and
  customer values are never captured.
- Settings > System and `/api/performance/database` expose the database timing
  summary to authenticated admins when investigating slow routes or expensive
  data access.
- Settings > System also reads recent `BackgroundJobRun` rows so admins can see
  whether scheduled/manual jobs are running, stale, warning or failing without
  re-aggregating raw provider data. Admin header notifications reuse the same
  background job health rules for failed and stale job alerts.

## Integrations

### Twilio

Twilio config is stored in `IntegrationConnection` with provider `twilio`.
Credential fields are encrypted using `CREDENTIAL_ENCRYPTION_KEY`.

Main runtime files:

- `src/lib/integrations/twilio.ts`
- `src/lib/integrations/twilio-server.ts`
- `src/lib/telephony/twilio-voice.ts`
- `src/lib/telephony/phone-system-routing.ts`
- `src/lib/telephony/call-routing.ts`

Main routes:

- `/api/twilio/voice/token`
- `/api/twilio/voice/hangup`
- `/api/twilio/voice/recover`
- `/api/twilio/voice/transfer`
- `/api/webhooks/twilio/voice`
- `/api/webhooks/twilio/voice/queue`
- `/api/webhooks/twilio/voice/status`
- `/api/webhooks/twilio/voice/recording`
- `/api/webhooks/twilio/messaging`

### MailerSend

MailerSend config is stored in `IntegrationConnection` with provider
`mailersend`. API tokens and inbound route secrets are encrypted using
`CREDENTIAL_ENCRYPTION_KEY`. Domain DNS records and verification status are
stored in the provider config JSON and can be refreshed from the MailerSend API.
The settings UI treats MailerSend as the source of truth for DNS records and
exposes copy controls rather than manual DNS editing fields.

Main files:

- `src/lib/integrations/mailersend.ts`
- `src/components/crm-boilerplate/MailerSendSettingsForm.tsx`
- `src/app/api/mailersend/email/send/route.ts`
- `src/app/api/webhooks/mailersend/inbound/route.ts`
- `src/app/(admin)/inbox/page.tsx`

Inbound MailerSend webhooks are verified with the `Signature` HMAC-SHA256
header and the saved inbound route secret. Signed `inbound.message` payloads
are stored in `EmailMessage`; when the sender email matches a contact on an
active opportunity, the handler also creates an inbound `SalesCommunication`
on that sale. Inbound email bodies are normalized to plain text and trimmed to
the latest visible reply before they are stored in the sales timeline so
Outlook HTML, signatures and quoted conversation history do not pollute lead
context or Sales AI prompts.

Outbound sales lead email uses the saved MailerSend API token and sender
defaults, then creates an outbound `SalesCommunication` so the sales timeline
stays aligned with provider sends. Lead emails set `Reply-To` to the configured
inbound route address so replies are captured by the CRM inbox instead of a
personal mailbox.

Manual sales email, manual SMS and approved automation drafts share
`src/lib/sales/outbound-messages.ts` so provider sends, timeline writes,
first-contact lifecycle updates and follow-on automation triggers stay
consistent.

### Geoapify

Geoapify config is stored in `IntegrationConnection` with provider
`geoapify`. API keys are encrypted using `CREDENTIAL_ENCRYPTION_KEY`; a
deployment may also provide `GEOAPIFY_API_KEY` as a runtime fallback.

Main files:

- `src/lib/integrations/geoapify.ts`
- `src/lib/integrations/geoapify-addresses.ts`
- `src/components/crm-boilerplate/GeoapifySettingsForm.tsx`
- `src/components/crm-boilerplate/AddressLookupControl.tsx`
- `src/app/api/integrations/geoapify/address/autocomplete/route.ts`

The browser calls the authenticated CRM autocomplete route, not Geoapify
directly. The route applies short-query and rate-limit guards, uses the saved
or environment API key server-side, forwards the optional country/language
settings to Geoapify with a bounded timeout and returns only normalized CRM
address suggestion fields.

### Pipedrive

Pipedrive config is stored in `IntegrationConnection` with provider
`pipedrive`. API tokens are encrypted using `CREDENTIAL_ENCRYPTION_KEY`; a
deployment may also provide `PIPEDRIVE_API_TOKEN` as a runtime fallback.

Main files:

- `src/lib/integrations/pipedrive.ts`
- `src/lib/integrations/pipedrive-import.ts`
- `src/components/crm-boilerplate/PipedriveSettingsForm.tsx`
- `/settings/integrations/pipedrive`

The first Pipedrive phase covers connection storage, readiness display and the
`ExternalRecordLink` idempotency foundation. `src/lib/integrations/pipedrive.ts`
also exposes a server-side read-only client that uses Pipedrive's `x-api-token`
header for GET-only current-user, user, lead, person and organisation requests.
`src/lib/integrations/pipedrive-import.ts` maps Pipedrive lead/person/
organisation records into CRM company, contact, sales opportunity,
communication and external-link rows. The Pipedrive settings page can manually
preview or pull one page of latest leads and writes sync-history rows with
read/write counts. Preview classifies would-create, already-linked and skipped
leads without creating CRM records; pull creates CRM records and external-link
rows where needed. Scheduled import and webhook handling should be implemented
as a dedicated server-side sync layer rather than posting provider payloads
through the public attribution lead endpoint.
Pipedrive integration work is pull-only by default. Do not push, update,
delete, create, merge or otherwise mutate Pipedrive data unless Adam explicitly
approves that specific write-back operation.

### DocuSign

DocuSign config is stored in `IntegrationConnection` with provider `docusign`.
The integration key, impersonated user ID, private key and Connect HMAC secret
are encrypted using `CREDENTIAL_ENCRYPTION_KEY`.

Main files:

- `src/lib/integrations/docusign.ts`
- `src/lib/integrations/docusign-utils.ts`
- `src/lib/actions/signature-requests.ts`
- `src/lib/docusign/webhook.ts`
- `src/components/crm-boilerplate/DocuSignSettingsForm.tsx`
- `src/components/crm-boilerplate/RecordDocumentLibrary.tsx`

Main routes:

- `/settings/integrations/docusign`
- `/api/webhooks/docusign`

CRM users send eligible PDF/Word record documents to DocuSign with JWT grant
impersonation. The envelope includes a hidden CRM signature request ID custom
field and a per-envelope Connect webhook. Webhooks must pass HMAC verification
before status updates are applied. Completed signed documents and certificates
are downloaded server-side and stored as private `FileAsset` records in the
configured Contracts & Finance folder. Contact, company and sales document
libraries trigger a post-load authenticated refresh for open DocuSign requests
and expose a manual refresh action; these checks validate record access
server-side, read live envelope and recipient status from DocuSign, update
local request/recipient status and store any missing completed PDFs/certificates
without exposing provider credentials to the browser. Completed PDF storage is
idempotent by checksum and document metadata. Legacy duplicate signed PDFs and
certificates can be inspected with `npm run maintenance:docusign-dedupe` and
removed with `npm run maintenance:docusign-dedupe:apply`; the cleanup only
targets DocuSign-generated Contracts & Finance PDFs and skips referenced files.
Production cleanup can run inside the deployed app through
`/api/maintenance/docusign-document-dedupe` when the dedicated
`DOCUSIGN_DOCUMENT_CLEANUP_SECRET` bearer secret is configured.

### Realtime UI Refresh

`/api/realtime/events` is the generic authenticated Server-Sent Events endpoint.
It accepts `topic` query parameters, polls only `RealtimeVersion` rows, and
emits an `update` event when a topic version changes. Client pages mount
`RealtimePageRefresh` with the topics they care about, then call
`router.refresh()` only after a version change or a long fallback interval.

Publishers should call `bumpRealtimeTopics()` after durable writes. Shared
topic names live in `src/lib/realtime/topic-names.ts`; phone call publishers
can use `bumpCallRealtimeTopics()` to update telephony, tasks and linked
conversation topics together.

### Attribution

The website attribution script captures UTM/ad-click/session data and sends it to the CRM.

Main files:

- `src/lib/attribution/tracking.ts`
- `src/app/api/attribution/config/route.ts`
- `src/app/api/attribution/lead/route.ts`
- `src/app/api/attribution/phone-number/route.ts`
- `public/attribution.js` if present in the deployed bundle.

### R2

Cloudflare R2 is configured through the Cloudflare R2 integration card.

Main files:

- `src/lib/storage/r2.ts`
- `src/lib/storage/media.ts`
- `src/app/api/media/[fileAssetId]/route.ts`

Structured CRM document libraries reuse R2-backed `FileAsset` rows rather than
creating a second storage system. Contact, company/customer and sales
opportunity detail pages mount the shared record document library component,
which groups private uploads by `FileAsset.documentFolder`. The default folder
template is stored in `CrmSettings.documentLibrary` and can be edited from
Settings > General. Customer-facing forms, secure upload links, email-request
uploads, customer portal uploads and internal workflow uploads should pass a
controlled document upload type such as `utility_bill`, `floor_plan`,
`site_photo` or `commissioning_handover`; `src/lib/record-document-upload.ts`
resolves that type to the current configured folder slug before creating the
`FileAsset` row. Record document libraries and the admin Storage browser use
drag-and-drop multi-file uploads, show uploader/date metadata, preview common
image/PDF/text files through authenticated media URLs and let users search by
file name, MIME/type, notes and tags. Record document bulk actions are
record-scoped: the server validates the current user can access the parent CRM
record, confirms every selected `FileAsset` belongs to that record, then allows
non-destructive folder moves, tag updates or authenticated ZIP export.

Secure customer upload links are served from public `/upload/[token]` pages.
The proxy allow-lists `/upload`, but the page and upload action validate the
opaque token hash, request status and expiry before accepting files. The
plaintext token is not stored and cannot be recovered after link creation. If a
recipient email is supplied, link creation sends the secure URL through
MailerSend and audits only delivery metadata. Customer uploads above the
server-action threshold use `/api/customer-upload-requests/multipart/*` routes
with signed, token-bound upload sessions and 5MiB chunks, then complete into a
private R2 object before the file is linked to the requested checklist item.
The public upload policy defaults to 100MB for chunked uploads and can rise to
the configured R2 max upload value, capped at 500MB.

Secure customer document share links are served from public `/share/[token]`
pages. Staff select existing record documents, create an expiring share link and
optionally email it through MailerSend. The share stores only a token hash and
selected file references; customer downloads go through
`/api/document-shares/[token]/files/[fileAssetId]`, which validates token
status/expiry and selected-file membership before redirecting to a short-lived
R2 download URL. Create, revoke and download events are audited without storing
the plaintext token or raw signed R2 URL.

Secure customer document portals are served from public `/portal/[token]`
pages. A portal can combine a document upload checklist, selected outgoing
documents and DocuSign status for the same CRM record/recipient behind one
opaque token. The portal stores only a SHA-256 token hash. DocuSign status is
included only when the portal has a recipient email that matches the signature
recipient; portals without an email do not expose record-level signature
requests. Portal uploads reuse the same token-bound server-action and
multipart upload paths as standalone upload links, and portal downloads use
`/api/document-portals/[token]/files/[fileAssetId]`, which validates the portal
status/expiry plus document-share membership or completed DocuSign output
membership before issuing a short-lived R2 URL.

### OpenAI Sidekick

The CRM Sidekick assistant is an app-shell drawer triggered from the top-right
header. The browser calls `/api/ai/sidekick`; server-side code in
`src/lib/ai/sidekick.ts` selects from a fixed CRM tool registry, scrubs
sensitive fields, applies token guards, audits to `AuditLog`, then calls OpenAI
when an `openai` integration or `OPENAI_API_KEY` is configured.
OpenAI credentials are saved from `Settings > Integrations > OpenAI` as
encrypted `IntegrationConnection.config.credentials.apiKey` values and are also
used by call transcript analysis. For natural-language report requests,
Sidekick may ask OpenAI for a structured report plan, but only against the
approved report catalogue; the plan is validated before the report engine runs.
Write actions remain blocked except for Discovery pack write plans: Sidekick can
draft an inert plan, the UI previews the exact proposed questions, and
`/api/ai/sidekick/write-plans/[id]/apply` applies it only after admin approval.

### Reports

The reporting workspace is `/reports`. It is backed by
`src/lib/reports/engine.ts`, which exposes approved semantic datasets,
metrics, dimensions, filters and chart types. Saved report configs are stored in
`ReportDefinition`; each execution writes `ReportRun` metadata. Report queries
are built by dataset-specific server code rather than AI-generated SQL. The
same `ReportResult` payload is rendered by `/reports` and by Sidekick through
`src/components/reports/ReportVisualization.tsx`. AI planning is limited to
choosing a dataset, metrics, dimensions, filters, date range, chart type and
sort from the approved catalogue. Catalogue product demand is represented by
the `opportunity_products` dataset, which reads `OpportunityProduct` links back
to sales opportunities instead of inferring product demand only from free text.
Marketing attribution is represented by the `marketing_attribution` dataset,
which reads normalized `AttributionTouchpoint` rows for source, campaign,
visitor, session, landing-page, platform, search-term, content, cost and
conversion evidence.
Website form reporting is represented by the `form_submissions` dataset, which
reads `AttributionRecord` rows with source `FORM` and aggregates submitted
field labels, form/page/source context and missing email/phone completeness.
Captured Discovery answers are represented by the `discovery_answers` dataset,
which reads `OpportunityDiscoveryAnswer` rows and links them back to questions,
selected answers, product/category context, owners, stages and pipeline value.
Sales lifecycle quality and stage movement are represented by the
`sales_lifecycle` dataset, which reads `SalesOpportunity` lifecycle fields and
`SalesLifecycleEvent` rows for contacted rate, first-response time,
time-to-close, lost reasons and transitions.
Telephony reporting is represented by the `calls` dataset, which now includes
call status, direction, agent, queue wait/outcome, recording coverage and
transcript-readiness metrics from `CallLog` and `CallQueueEntry`.
Client handover and setup readiness are represented by the `setup_readiness`
dataset, which uses the shared Setup checklist loader behind Dashboard and
Settings > Setup so Sidekick reports the same outstanding readiness items.
Contact and client activity is represented by the `contacts_clients` dataset,
which aggregates `Contact` records with linked opportunities, latest
communications, calls, tasks, grouped form counts and the latest
form-attribution sample per contact.
User security posture is represented by the `users_security` dataset, which
aggregates `User`, `Session` and `PasswordResetToken` status without selecting
password hashes, token hashes, 2FA secrets or raw session tokens.
Storage reporting is represented by the `storage_assets` dataset, which
aggregates `FileAsset` rows by size, visibility, uploader and linked-record
coverage.
Task reporting is represented by the `tasks` dataset, which aggregates `Task`
rows by assignee, creator, status, due status, linked-record coverage and
created/due date buckets.
Communication reporting is represented by the `communications` dataset, which
aggregates `SalesCommunication` rows by channel, direction, CRM user, lead
owner, pipeline stage, source, linked-contact coverage and time bucket.
Empty report results include dataset-specific guidance so Sidekick and Reports
can explain likely setup, tracking, filter or date-range causes instead of only
showing a zero-row table.
Sidekick report answers also use `src/lib/reports/insights.ts` to derive a
deterministic plain-English insight from `ReportResult` rows, so fallback
answers can still explain leading grouped results and period comparisons
without relying on OpenAI.
The Sidekick drawer renders a compact answer-transparency disclosure from the
structured tool payload, including answer mode, checked tools, permission scope
and report plan details. This is UI metadata only; the report plan still goes
through the authenticated report APIs and plan sanitiser.
Sidekick answer feedback posts to `/api/ai/sidekick/feedback`, requires the
current CRM session and stores sanitized rating metadata in `AuditLog` under
`ai.sidekick.feedback`.
Generated Sidekick report cards can save directly from the drawer by posting
the existing sanitized report plan to `/api/reports/save`; saved reports remain
private to the current user unless changed later in Reports.
Sidekick message bubbles derive contextual follow-up prompt buttons from the
checked tool names and generated report dataset, then route clicks back through
the normal `/api/ai/sidekick` request flow.
`npm run sidekick:prompt-smoke` exercises representative Sidekick report prompts
against deterministic tool and report-plan expectations without database writes.

### OpenAI Sales Lead Assistant

The sale detail page uses `src/components/crm-boilerplate/SaleDetailAIWorkspace.tsx`
to call `/api/ai/sales-lead`. Server-side code in
`src/lib/ai/sales-lead-assistant.ts` gathers the sale, contact/company,
communications, recent call summaries/transcripts, attribution records, the
CRM-wide AI context from `Settings > AI Context`, the current pipeline stage
goal/AI context, recent conversion memory derived from sent emails, replies,
stage movement, won/lost outcomes, AI recommendation feedback and service-level
outcomes, and the editable `SalesOpportunity.leadScope` JSON field, then uses
the OpenAI integration to return a concise summary, recommended next step,
stage movement recommendation and draft email/SMS/phone follow-up. Stage
movement recommendations must respect each stage's movement policy: AI can
suggest only where the target stage allows AI-suggested or AI-approved
movement. The sale workspace has an editable lead-scope rail on the left,
conversation in the centre and AI/customer context on the right. The AI reply
launcher is sticky within the centre conversation column and expands into a
bottom sheet with an optional full-screen editing mode. SMS sends through
Twilio, phone scripts start the softphone, and email sends through MailerSend
when configured.

### OpenAI Contact Assistant

The contact detail page uses
`src/components/crm-boilerplate/ContactConversationWorkspace.tsx` and
`/api/ai/contact` to summarise all customer communications across every linked
lead. It reuses the lead conversation thread component for calls, email, SMS
and website activity. Email and SMS replies from a contact page are sent
through the existing lead outbound endpoints and logged against the latest open
linked lead, falling back to the latest linked lead if every lead is closed.
Phone replies can still launch the softphone with contact context even when no
lead is linked.

### Sales Automation

Admins manage pipeline automation under `/settings/sales-automation`, rendered
by `src/components/crm-boilerplate/SalesAutomationManager.tsx` and backed by
server actions in `src/lib/actions/sales-automation.ts`. Rules can be scoped to
a custom pipeline stage, enabled or disabled, and configured for triggers such
as stage entry, email/SMS events, calls and site visits. Supported actions
include task creation, owner notification, score adjustment, stage-move
suggestion and guarded email/SMS drafts. The settings screen includes starter
presets for common discovery, proposal follow-up, inbound scoring, missed-call
recovery and stage-suggestion rules, plus a bounded 30-day analytics snapshot
for run totals, status/action mix, AI recommendation feedback, rule
performance, conversion impact, attention items, stage-age/SLA risk and
automation-assisted pipeline impact. Admin rule controls include condition
filters for score, source, service focus and stage age, dry-run previews
against a lead ID and disabled-copy duplication so configuration can be tested
without live sends. Pipeline stages can define `slaDays`; sales automation can
create follow-up tasks for overdue stage SLA rows without sending live messages.

Runtime execution lives in `src/lib/sales/automation.ts`. Automation runs are
logged in `SalesAutomationRun`, score changes are logged in `LeadScoreEvent`,
and sale detail shows recent automation/score activity through
`src/components/crm-boilerplate/SaleAutomationActivity.tsx`. Email/SMS
automation creates approval tasks plus skipped run records; operators can edit
and send or dismiss those drafts from the approval queue. Stage-move
suggestions and owner notifications create review/follow-up tasks rather than
moving stages automatically. Sale-detail stage-suggestion approval is handled
by `approveSaleStageSuggestionAction`, which validates ownership and
required-data gates, writes lifecycle history, triggers stage-entered
automation and marks the linked review task done.
The `/sales?view=kanban` drag-and-drop board calls the same server-side stage
move helper through `moveSaleStageFromKanbanAction`; the client component only
passes the sale and target stage IDs, then renders any gate block or warning
inline before refreshing the server-rendered board.

## Navigation

The desktop app shell uses a compact Shopify-style sidebar owned by
`src/layout/AppSidebar.tsx`: 240px expanded, 72px collapsed, inline expandable
groups with Shopify-style inline chevron markers, submenu rails with L-shaped
active child markers, child-only active highlighting and Lucide icons for the
main navigation. Expandable parent items route to their first visible child
route when selected.

Current main groups:

- Home
  - Dashboard
  - Reports
  - Tasks
- CRM
  - Sales
  - Contacts
    - People
    - Companies
    - Segments
  - Notes / Activity
  - Discovery
- Communications
  - Inbox
  - Telephony
- Marketing
  - Marketing
- Products & Operations
  - Products
  - Storage
- Settings dropup

Calendar routes still exist but are hidden from the active sidebar for now.

Marketing and Telephony are operational groups. Do not duplicate their operational pages under the Settings dropup unless the product structure changes.
Marketing provider credentials and account mappings are not operational
Marketing pages; Google Analytics, Google Ads, Bing Ads and Meta are managed
under `Settings > Integrations` while Marketing links to those settings for
configuration.
Marketing is grouped in the sidebar as `Marketing` and `Tracking Engine` only.
Detailed Marketing report/setup links and Tracking Engine settings belong in
the horizontal tabs inside those pages, not as nested left-menu items.
Telephony is grouped in the sidebar as `Phone System` and `Call Tracking` only.
The detailed phone-system and call-tracking section navigation belongs in the
horizontal tabs inside those pages, not as nested left-menu items.

## Deployment

GitHub Actions runs CI. The live app deploys through Netlify from GitHub
`main`. A GitHub push alone does not prove live has changed; verify
`/api/health` after Netlify finishes. Public health exposes only the short
build fingerprint; full build metadata is available to authenticated CRM users
through `/api/build-info` and Settings > System.

Netlify settings:

- Install: `npm ci`
- Build: `npm run netlify:build`
- Functions region should be close to Neon.

Healthcheck:

```text
GET https://crm.id30.com/api/health
```

Focused authenticated route smoke test:

```text
npm run smoke:routes
```

Broader authenticated route audit:

```text
npm run test:e2e:audit
```

The audit covers the main CRM modules across mobile and desktop viewports and
collects render, auth, console, network and horizontal-overflow findings before
failing, so one broken route does not stop the remaining checks.

## MCP Broker

Client-owned ChatGPT/OpenAI accounts should connect to `mcp.id30.com`, not
directly to each CRM host. The MCP service validates its bearer token with
`auth.id30.com`, enforces tool scopes, then calls this CRM through signed
read-only API routes.

The CRM validates MCP calls with `MCP_CRM_SHARED_SECRET`, the configured
`ID30_AUTH_CRM_CLIENT_ID`, and `ID30_AUTH_WORKSPACE_ID`. Supported phase-one
CRM tool endpoints are:

```text
POST /api/mcp/search
POST /api/mcp/reports/run
POST /api/mcp/reports/sales-summary
POST /api/mcp/reports/marketing
POST /api/mcp/setup/status
POST /api/mcp/reports/executive
```

Requests must include the `x-id30-mcp-*` HMAC headers generated by
`mcp.id30.com`. Endpoints return structured, row-limited JSON using existing
safe CRM search, setup and report loaders, and record audit log entries for
successful, failed and rejected tool calls. Validation-failure audit metadata is
sanitized and does not store signatures, body hashes or raw request bodies.
Signed MCP requests include
`x-id30-mcp-request-id`; CRM stores each request id until its expiry and
rejects duplicate ids to prevent replay inside the signing window.
