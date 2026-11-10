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
- `EmailMailboxSenderField` is the shared From-account control for Inbox,
  Sales and Contact conversation replies. It must remain rendered when the
  sender list is empty so mailbox access failures are visible rather than
  silently removing the field; the empty Gmail state represents the existing
  MailerSend fallback.
- `InboxClient` uses the document as its only vertical scroll container. Its
  desktop main/detail grid item is sticky below `AppHeader`; the message-list
  aside remains in normal flow so this does not reintroduce nested scrolling.
- Email participant avatars use only existing CRM-managed user media under
  `/api/media`. Outbound messages can inherit the CRM author or connected
  mailbox owner's uploaded avatar. External senders do not trigger Google,
  Gravatar or sender-hosted image requests; they use deterministic coloured
  initials until the CRM has a managed contact-avatar field.

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
- `DashboardRoleLayout`: admin-managed default dashboard widget order,
  visibility and size for each client-facing role template.
- `DashboardUserLayout`: a user's personal dashboard override. It stores the
  role template it was based on so a later role change safely falls back to the
  new role default instead of retaining widgets from the previous role.
- `Session`: database-backed auth session.
- `AuthRateLimitBucket`: database-backed authentication throttle bucket used
  for sign-in, two-factor and password-reset attempt limits across app
  instances.
- `Company`: account/company record.
- `Contact`: customer/person record, including a configurable `ContactType`,
  one primary email, one
  primary phone and optional manual postal address fields for address line 1,
  address line 2, city, county, postcode and country.
  The legacy `ContactCategory` remains populated during the staged migration of
  filters, imports and forms. `ContactType.systemKey` provides a stable mapping
  for Consumer, Trade, Installer and Company while allowing future custom types.
  Admin-only contact-type mutations preserve the stable slug/system key, enforce
  one active default in a transaction, block unsafe archival and write AuditLog
  events without storing contact data.
  `/contacts`, contact modals and header quick-create use active `ContactType`
  rows. Contact writes derive the legacy category from the selected system key;
  custom types use the Consumer compatibility bucket until downstream imports
  and reports complete their staged migration.
  Sales inline-create, company contact creation, website attribution, inbound
  phone leads, Pipedrive and Spruce also connect new contacts to the Consumer
  system type while retaining the matching legacy category. A data-only
  backfill repairs any null type links created by those paths after the original
  person-type migration.
  `ContactTypeField` stores stable, ordered field definitions for each person
  type. `ContactCustomFieldValue` stores one typed value per contact/field using
  text, decimal, boolean, date or JSON-array columns. Contact actions reload the
  definitions server-side from the submitted contact type, reject unknown
  select values and enforce only `REQUIRED` fields. `COMPLETENESS` fields can be
  saved empty for the separate profile-quality workflow. Changing a contact's
  type retains values belonging to the previous type so switching back does not
  destroy data.
  `src/lib/contacts/table-columns.ts` converts `showInTable` field definitions
  into stable People table column IDs and validates URL-backed column
  preferences against the currently available person-type fields. Custom
  columns display typed values but remain non-sortable until a database-backed
  custom-field sort is explicitly implemented.
  `src/lib/contacts/filters.ts` validates URL-backed structured field filters
  against active definitions and select options before producing typed Prisma
  predicates. The People page and CSV export share this parser and predicate
  builder so counts, pagination and exports use identical custom-field scope.
  `src/lib/contacts/profile-completeness.ts` is the shared pure calculator used
  by both the People list and contact profile. It evaluates serialised typed
  values, treats boolean `false` and numeric zero as present, ignores optional
  or archived definitions and returns no score when a type has no configured
  profile requirements.
  `ContactTypeDocumentRequirement` defines ordered required/optional controlled
  document types for a person type. `src/lib/contacts/document-requirements.ts`
  matches them only to `FileAsset.documentUploadType` on the contact record;
  labels and filenames are not trusted as compliance evidence. Admin mutations
  are audited and the upload type is immutable after creation so historical
  matching semantics cannot change when a visible label is edited.
  The shared `RecordDocumentLibrary` carries `documentUploadType` on every file
  in Contact, Company and Sales views. Contact requirements can recommend the
  first missing type to the internal upload form. Metadata edits may classify
  or deliberately unclassify a file only with a controlled catalogue value;
  the change is audited with parent record IDs and before/after types, never
  with file contents, notes or tags.
  `FileAsset.documentExpiresAt`, `documentExpiryReminderDays` and the derived
  `documentExpiryReminderAt` support indexed compliance reminders without a
  separate scheduled-job table. Record cards derive valid/due/expired state
  from those values. Header notifications batch-load matching contact records
  through the normal contact access filter before exposing a document alert.
  `src/lib/contacts/query.ts` owns People search semantics for both the list and
  `/api/contacts/export`. Only active custom fields with `isSearchable=true`
  participate in custom-value matching. CSV export reapplies
  `contactWhereWithAccess`, includes typed custom fields, prevents spreadsheet
  formula execution and audits only filter/count metadata.
  `src/lib/contacts/import.ts` and
  `src/lib/actions/contact-import.ts` provide the admin-only inverse path. CSV
  rows are parsed and previewed before mutation, person types resolve by stable
  slug, typed custom fields reuse the normal server validator, and email/phone
  duplicate checks run again inside the confirmed import action. The importer
  is create-only and never treats a CSV row as authority to update a contact.
  Secure customer upload requests reuse the same contact requirement status.
  The browser suggests only missing required types whose controlled catalogue
  entry is `customerFacing`; creation remains an explicit staff action. The
  server revalidates that allow-list and reloads active contact-type overrides
  before snapshotting labels/instructions into `CustomerUploadRequestItem`.
  Contacts and companies store a nullable creator user link so non-admins can
  still view standalone records they created before an opportunity exists.
- `CustomerRelationshipProfile` / `CustomerTechnologyCoverage`: contact-level
  relationship context. A contact can have one profile with manual customer
  status, summary, next-review date and notes, plus technology rows that track
  whether each technology is installed, covered and optionally linked to one of
  the contact's sales opportunities.
- `ContactEmailAddress` / `ContactPhoneNumber`: labelled secondary contact
  methods linked to `Contact`. Primary values remain on `Contact` for existing
  sales, search, MCP and telephony compatibility; secondary rows are used for
  search, inbound matching, caller context, merge preservation and privacy
  export.
- `ContactSegment`: saved dynamic people/company segment definition. The first
  runtime supports people segments backed by safe JSON criteria rather than
  arbitrary SQL. Segment counts and member rows are evaluated through the
  current user's CRM contact/opportunity access policy and can filter by the
  contact category enum.
- `ContactTag` / `ContactTagAssignment`: reusable contact tags with canonical
  slugs and many-to-many contact assignment.
- `SalesOpportunity`: sale/enquiry pipeline wrapper, including current customer
  sales category, lead score and score timestamp. Opportunity records can be
  referenced by contact relationship technology rows without making those rows
  part of the sales stage model.
- `SalesPipelineStage`: configurable sales stage mapped to the stable
  `SalesStage` reporting/conversion bucket and a customer sales category, with
  stage goal, AI context, movement policy, required-data gate mode and
  metadata-backed stage progression requirements.
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
- `EmailMailbox`, `EmailMailboxAccess` and `EmailThreadLink`: Auth-backed Gmail
  mailboxes, per-user send access and durable Gmail-thread-to-sale routing.
  Google OAuth tokens remain in iD30 Auth.
- CRM-to-Auth HTTP calls use one bounded resilience layer. Requests time out,
  safe read-only GETs retry with a fresh signed request ID, mutating requests
  never retry automatically, and repeated transient failures open a short
  process-local circuit so a slow Auth dependency cannot exhaust CRM workers.
- `EmailAttachment`: provider attachment metadata with an optional R2-backed
  `FileAsset` archive link so imported Gmail files remain available after the
  provider is disconnected.
- Inbox and sale-conversation reply composers derive the recipient from the
  message `Reply-To` header first, then the inbound sender or linked contact.
  Connected mailbox/receiving addresses are excluded from automatic defaults.
  Their editable subject is validated server-side and defaults to the original
  subject with normalized `Re:` prefixes. Recipient fields are locked by
  default; explicit changes outside the resolved reply address or linked
  contact email surface a warning. Successful overrides create a compact
  `email.reply.recipient_overridden` audit event without storing message body
  content.
- Reply composers list only connected, send-enabled `EmailMailbox` rows the
  current user can send from. The source mailbox is selected by default so an
  exact Gmail thread is reused only inside the mailbox that owns it. Choosing a
  different authorised mailbox clears provider threading for the send and
  records `email.reply.sender_overridden`; server-side mailbox access is always
  revalidated before delivery.
- Sale-conversation email serialization includes the provider `From` name.
  Outbound communications with a CRM user are displayed as CRM sends; imported
  Gmail/provider sent mail uses its actual sender name or address and carries a
  provider-origin badge instead of being presented as CRM-authored. Participant
  routes prefer provider `From`/`To` display names and addresses; the linked
  lead is only a fallback when the relevant provider identity is missing and
  does not conflict with the known sender. For imported provider mail without
  sender/recipient addresses, an exact sender-name match with the linked lead
  is inferred as inbound in both the importer and display layer, producing a
  **Lead (linked email) → CRM** route instead of inventing a CRM send or
  self-route. Provider-supplied sender addresses remain authoritative; the
  linked contact email is only displayed when the provider omitted the address
  and the provider sender name exactly matches that contact.
- `src/lib/email/deduplication.ts` owns provider-neutral email identity and
  strict fingerprint matching. Conversation rendering collapses duplicate
  Pipedrive/Gmail cards without deleting stored records, while Gmail import can
  transfer the shared `SalesCommunication` link to the richer Gmail row and
  leave the provider archive row intact. The email dedupe maintenance command
  is audit-only. Its strict content fallback treats a missing provider address
  as compatible, but never collapses records carrying different RFC
  `Message-ID` values.
- `CallLog`: provider-neutral phone call record.
- `CallQueueEntry`: inbound Twilio queue state.
- `Task`: follow-up work, including missed-call tasks.
- `NotificationState`: per-user review/dismiss state for generated header
  notifications keyed by notification ID and fingerprint.
  Recent unread inbound-email alerts are generated per user from mailbox access,
  contact creation and linked lead ownership rather than duplicating email data
  into a second notification table.
- `EmailMessageUserState`: per-user email read state. Marking or replying to a
  shared-mailbox message marks it read only for that CRM user; the shared
  `EmailMessage.status` remains responsible for the existing archive lifecycle.
- `EmailMessage.teamStatus`, `assignedUserId` and `assignedAt`: shared team Inbox
  workflow, kept independent from personal read state. Gmail changes are applied
  to every message with the same mailbox/thread identity; non-Gmail changes are
  scoped to the selected message. Assignment targets must be active and able to
  access the selected mailbox or linked lead.
- `FileAsset`: R2-backed media/file metadata, including linked CRM entity,
  optional document-library folder slug, controlled document upload type,
  optional expiry/reminder metadata, uploader, notes and lightweight tags for
  structured record documents.
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
  record IDs. Pipedrive import uses it to make lead/person/organisation sync
  retries idempotent without trusting names or email addresses as primary
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

## Dashboard Layouts

- `src/lib/dashboard/layout.ts` is the allow-listed widget registry and owns
  role restrictions, system defaults, saved-layout normalization and grid
  sizes. Saved JSON cannot add a widget that the current role is not allowed
  to use.
- The dashboard lets each user reorder, resize and hide permitted widgets.
  Personal changes are stored in `DashboardUserLayout` and can be reset to the
  current role default.
- Settings > Dashboard is admin-only and edits `DashboardRoleLayout` defaults.
  Role-template visibility is a dashboard presentation rule; the existing
  `ADMIN` / `USER` server authorization boundary remains authoritative.
- Team-level layouts are deliberately not inferred because the CRM does not
  yet have a defined team model. Add them only after team membership and
  precedence rules are agreed.

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
- `src/lib/neon-advisor/*` powers the read-only Neon optimization advisor.
  `npm run neon:advisor` inspects repository/runtime database configuration,
  safe PostgreSQL statistics views and optional Neon API telemetry, then ranks
  cost/resource recommendations with evidence, validation steps and rollback
  notes. Production execution is disabled and the action allow-list is empty.
- `src/lib/database/connection-url.ts` classifies runtime and migration database
  URLs without exposing hostnames. Env checks, production preflight, Prisma pool
  defaults and Settings > System use this shared classifier to keep Netlify
  runtime on Neon pooled connections while migration deploys stay direct.

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
stays aligned with provider sends. Lead emails set `Reply-To` to a signed,
sale-specific address derived from the configured inbound route address. The
inbound route validates that address and the customer sender before attaching
the reply to that exact sale; legacy replies to the generic address retain the
sender-based active-sale fallback. MailerSend must use a catch-all inbound
route for the configured inbound subdomain so the sale-specific plus addresses
reach the CRM webhook.

Manual sales email, manual SMS and approved automation drafts share
`src/lib/sales/outbound-messages.ts` so provider sends, timeline writes,
first-contact lifecycle updates and follow-on automation triggers stay
consistent.

### Gmail

Gmail uses iD30 Auth as the OAuth and token boundary. CRM stores one
`EmailMailbox` row per connected Google mailbox and calls signed Auth broker
endpoints for message sync, sending and attachment retrieval. Multiple personal
and shared mailboxes can coexist; admins assign mailbox purpose, primary owner
and users allowed to send.

Mailbox purposes use the same operational taxonomy as Phone System teams:
Sales, New Business, Customer Success and Support. Personal is available only
when the mailbox has an Owner/director-level primary user; the server action
revalidates that role template before saving. Legacy Accounts and Shared enum
values remain readable for existing records but are not offered for new
selections. New connections default to Personal for a matching Owner account
and Sales otherwise.

The admin Gmail settings page derives a mailbox health state from connection
status, sync enablement, the latest successful sync and the latest safe error.
Connected mailboxes are healthy when they have synced within 30 minutes;
otherwise the UI distinguishes first-sync pending, paused, delayed, warning,
disconnected and reauthorisation states. Actionable connection failures reuse
the existing iD30 Auth connection flow, while credentials and provider tokens
remain outside the browser and CRM database.

Each CRM Gmail send creates one operation ID shared by its RFC `Message-ID` and
all broker attempts. Auth persists that operation fingerprint and accepted
provider result, allowing CRM to retry one transient 503 safely without sending
a duplicate. The operation ID is retained in message metadata for support and
reconciliation without storing a second copy of the email body.

iD30 Auth signing-key changes use a 24-hour CRM overlap window. Saving a new
broker secret moves the encrypted existing secret into a time-bounded previous
slot. CRM signs new requests with the new key but verifies Auth completion and
Gmail push callbacks against either key until the overlap expires. No secret is
included in audit logs or exposed to the browser.

A ten-minute signed cross-system canary validates CRM request signing, Auth
request verification, Auth callback signing and the CRM callback receiver in
one non-destructive round trip. Results are stored in `BackgroundJobRun` under
`id30-auth-cross-system-canary`, using only status and latency aggregates.

Initial sync reads bounded pages from the most recent year, then switches to a
Gmail history cursor. Imported messages are idempotent, become central
`EmailMessage` rows and are attached to a sale conversation when an existing
Gmail thread link identifies the sale or when the participant has exactly one
open sale. Ambiguous contact matches remain in the inbox rather than being
attached to the wrong sale. CRM-originated Gmail sends create the thread link
immediately, allowing replies to return to the correct sale. Gmail sync stores
attachment metadata in `EmailAttachment` but leaves retrievable attachment
bytes in Gmail. Authenticated Preview and Download requests proxy the selected
file through iD30 Auth without creating an R2 object. These on-demand responses
use Auth's binary mode and pass the response body through to the browser,
removing the JSON/base64 copy and second full attachment buffer in CRM.
**Save to CRM** explicitly
archives a selected attachment through `FileAsset`; MIME parts supplied only as
inline data and without a later-retrievable Gmail attachment ID are retained
during sync because otherwise their bytes would be lost. Saved Gmail image
attachments use a SHA-256 content key and a shared `FileAsset`, so repeated
inline signature/footer images reuse the same R2 object. Existing Gmail image
archives can be inspected with the dry-run
`npm run maintenance:gmail-image-dedupe`; the separate `:apply` command hashes
the R2 bytes again, relinks attachment records, preserves files with unrelated
references and removes only verified surplus objects.

Gmail participant addresses are normalized from provider headers. When Gmail
omits `From`, inbound sync falls back to `Reply-To` and outbound sync falls back
to the connected mailbox. Inbox serialization also resolves older incomplete
rows from stored headers, `Reply-To`, the linked contact or mailbox, and the
reply server action uses the same resolution so display and sending cannot
disagree about the recipient.

Automatic contact matching excludes the connected mailbox address and requires
exactly one CRM contact across all external participants. A shared address or a
multi-recipient message that matches more than one contact remains unlinked in
the Inbox. Inbound `Reply-To` participates only when `From` has no usable email,
so it cannot compete with a valid sender. Existing mailbox/thread links remain
authoritative and bypass participant matching.

`netlify/functions/sync-gmail-mailboxes.mjs` invokes the protected maintenance
route every 5 minutes when `GMAIL_SYNC_CRON_ENABLED=true`. It reuses the
bounded sync path behind the manual action and authenticates with
`GMAIL_SYNC_SECRET` or the shared `CRON_SECRET`. Scheduled runs prioritise
mailboxes with a pending Gmail page, then the least recently synced mailbox.
The defaults process two mailboxes with up to 15 messages each inside a
20-second route budget. `GMAIL_SYNC_MAILBOX_LIMIT` and
`GMAIL_SYNC_MAX_RESULTS` provide bounded operational tuning without a code
deploy; repeated runs drain remaining pages.

Transient mailbox failures use metadata-backed exponential retry delays of 5,
10, 20, 40 and at most 60 minutes. A cooling-down mailbox is skipped by the
scheduled batch so it cannot repeatedly consume a limited sync slot, while
other connected mailboxes continue normally. The admin **Sync Gmail now**
action deliberately bypasses the delay. A successful sync clears the retry
state, and Gmail settings shows the next automatic retry time when one is
pending. This uses the existing `EmailMailbox.metadata` JSON and requires no
schema migration.

Admin header notifications derive a privacy-safe Gmail health alert from the
same mailbox health policy used by Gmail settings. Reconnect, disconnected and
connection-error states are critical; delayed syncs and retained sync warnings
are warnings. The alert reports only aggregate counts, links to Gmail settings
and is invalidated after OAuth completion, mailbox configuration changes,
sync failures and successful syncs.

Every Gmail sync acquires an atomic per-mailbox database lease before calling
the provider. Scheduled and manual invocations therefore cannot import the
same mailbox concurrently, while unrelated mailboxes continue normally. An
active lease is reported as deferred rather than failed and does not increase
the retry backoff. Leases expire after five minutes so a terminated serverless
invocation cannot leave a mailbox permanently locked.

Scheduled batches and admin-triggered manual syncs write a privacy-safe
`BackgroundJobRun` record under `gmail-mailbox-sync`. The summary contains only
aggregate mailbox, message, CRM-write, failure, deferred and continuation-page
counts; it does not store mailbox addresses or message content. Gmail settings
uses these records to show scheduler readiness, latest throughput, backlog and
recent outcomes without re-reading provider data.

Inbox users can manually assign or move a Gmail conversation to an accessible
sale. The action moves every imported message and sales communication in the
thread, updates archived attachment ownership, and writes the selected sale to
`EmailThreadLink` with a manual source so later Gmail replies keep the corrected
route. Existing and destination sale permissions are checked before the move,
and the change is recorded in `AuditLog`.

Matched Gmail conversations expose an inline Inbox reply composer. Replies use
the receiving mailbox, exact Gmail thread ID and original internet message ID,
then write the outbound email into `EmailMessage` and the sale conversation.
Inbox, Sales Conversation and Contact Conversation replies share a compact
rich-text composer supporting emphasis, underlining, links and ordered or
unordered lists. The browser always submits a plain-text representation beside
the authored HTML. The server sanitises the HTML against a narrow outbound
allow-list, MailerSend receives both representations and Gmail sends a proper
`multipart/alternative` MIME message. The plain body remains the timeline and
AI representation, while the sanitised HTML is stored on Gmail email records.
Unsent replies are autosaved in browser storage after a short debounce and are
scoped by the authenticated user ID plus Gmail message ID. Inbox, Sales and
Contact conversations restore the same body, formatting, mailbox, recipient and
subject after navigation or refresh. Drafts expire after 14 days and are removed
only after a successful send or the user's explicit **Discard draft** action.
The editor sanitises restored HTML before adding it back to the DOM.
The outbound write and Gmail sync share `gmail:<mailboxId>:<messageId>` as the
provider identity. The outbound transaction upserts that identity before it
creates a sale communication and reuses an already-linked communication when
sync won the race. Provider sync metadata is merged with the CRM send metadata;
the reconciliation path writes `gmail.send.reconciled` without storing message
body content in the audit log. This prevents a successfully accepted Gmail send
from surfacing as failed solely because its sent copy was imported first.
CRM-originated sends record **Accepted by Gmail**, not delivered, because the
Gmail send API confirms provider acceptance but does not provide final-recipient
delivery status. Provider-rejected attempts are retained as outbound Inbox and
conversation entries with `sendState: failed`, a bounded error reason and a
`gmail.send.failed` audit event. The attempted body is available to the linked
lead but is never written to the audit log. Later Gmail sync preserves CRM send
state and acceptance timestamps while refreshing provider labels and headers.
The existing per-user mailbox send permissions and sale access checks apply.
If an older Gmail record has a sender name but no machine-readable address, the
composer requires the user to enter and review a valid recipient instead of
hiding the reply action or guessing from the display name. Normal sale/contact
recipient permissions still apply, and the confirmed address is stored on the
source message only after a successful send.
Sale Conversation email entries surface the same Gmail reply context from the
linked `EmailMessage`, and reuse the Inbox reply action so mailbox permissions,
thread headers and persistence behaviour remain identical in both surfaces.
Reply controls are also created for linked MailerSend and other imported email
enquiries. Complete Gmail mailbox/thread metadata preserves the exact Gmail
thread; other providers use the CRM's normal authorised sale-email delivery
path with a `Re:` subject and the reviewed recipient instead of hiding the
composer.
Inbox and sale Conversation serializers derive a latest-response section,
quoted-history section and plain-text fallback from the stored Gmail body.
`EmailContent` renders both sections through the same `SanitizedEmailBody`
component, so **Show all** adds the previous conversation without changing the
latest response's formatting. Gmail, Outlook and common provider quote wrappers
are recognised structurally. When HTML history cannot be split confidently,
the complete sanitized message is preserved rather than removing content or
mixing an HTML latest view with a plain-text expanded view. The allow-list
preserves paragraphs, headings, emphasis, lists, links, quotes and tables while
removing scripts, event handlers, embedded forms, remote images and unsafe URL
schemes. Raw provider HTML is never inserted into the browser. Gmail sync
retains the provider's complete text and HTML bodies on `EmailMessage`; only
the linked sales communication is reduced for timeline and AI use.
Gmail attachment metadata is serialized alongside those body views for Inbox,
Sales Conversation and Contact Conversation. Safe raster images referenced by
a MIME Content-ID render at their `cid:` position through either the authorised
Gmail proxy or the authenticated media route when explicitly saved. Provider
attachment IDs join MIME metadata to the provider file; a one-to-one ordered
CID/image fallback covers older Gmail records that lack Content-ID metadata.
Embedded signature images are excluded from the attachment gallery to prevent
duplication. Genuine image attachments render as thumbnails, while PDFs and
safe text formats expose authenticated preview/download actions. Attachment
cards identify whether the file remains in Gmail or has been saved to CRM.
Access is checked against the related email and mailbox/sale permissions; raw
R2 object keys and Gmail credentials are never sent to the browser.

Legacy attachment cleanup is audit-first. `npm run maintenance:gmail-r2-cleanup`
only reports automatically archived Gmail files with no uploader/save marker,
no non-email CRM references and complete connected Gmail retrieval metadata.
`npm run maintenance:gmail-r2-cleanup:apply` re-fetches every linked provider
attachment and verifies its size/checksum before detaching the legacy
`FileAsset`; it processes at most 100 files by default and accepts
`-- --limit=<n>` up to 500. Failed provider verification preserves the R2 copy.
Failed R2 deletion leaves a tagged database record so a later run can retry.
Manual **Save to CRM** writes both uploader ownership and the
`gmail-user-saved` tag, including when it reuses a shared signature image.
Settings > Integrations > Gmail exposes the same policy through an admin-only
safe-scan server action and report component. The report reads current
candidate/protection totals plus `gmail-cleanup-pending` retry state and the
latest applied-cleanup audit metadata. It displays only opaque file ID prefixes
and aggregate counts/sizes; it does not expose R2 keys, provider content or an
apply control. Report generation writes
`maintenance.gmail_legacy_r2.report` with compact aggregate metadata.

Linked inbound email cards in Inbox and Sales > Conversation expose a
consistent **Reply** action plus **Reply with AI**. Sent emails expose neither
reply control. The browser requests `/api/ai/sales-lead` with the
sale ID and selected `SalesCommunication` ID, then inserts the returned email
body into the existing Gmail reply composer. Focused requests are generated
fresh and do not replace the sale-level cached AI guidance. The normal mailbox,
recipient and subject safeguards still apply, and the user must explicitly
send the draft.

Inbox, Sales Conversation and Contact Conversation share the email action
styles and sequence: **Show all** / **Show less**, **Reply**, **Reply with AI**,
then **Open lead** when the current context needs that link. Inbox-only thread
assignment controls follow the shared actions.

Contact Conversation reuses the same serialized email cards and authorised
Gmail mailbox list. Each contact email retains its own linked sale ID and, when
available, `SalesCommunication` ID so **Open lead**, **Reply** and **Reply with
AI** act on the correct sale even though the contact timeline aggregates
multiple leads. The shared sanitized latest/full body views also provide the
same **Show all** / **Show less** behavior as Inbox and Sales > Conversation.

Main files:

- `src/lib/integrations/gmail.ts`
- `src/lib/integrations/gmail-send.ts`
- `src/lib/integrations/gmail-sync.ts`
- `src/lib/integrations/gmail-push-contract.ts`
- `src/lib/integrations/gmail-push-receiver.ts`
- `src/components/crm-boilerplate/GmailIntegrationForm.tsx`
- `/api/integrations/gmail/connect`
- `/api/integrations/gmail/push`
- `/api/maintenance/gmail-sync`
- `/api/maintenance/gmail-watch`
- `netlify/functions/sync-gmail-mailboxes.mjs`
- `netlify/functions/renew-gmail-watches.mjs`
- `/settings/integrations/gmail`

iD30 Auth can notify the CRM of Gmail history changes through the dedicated
`/api/integrations/gmail/push` callback. Auth sends a short-lived HMAC-signed
event containing only opaque connection/history identifiers and Pub/Sub
delivery metadata; email addresses, credentials and message content are not
included. The CRM verifies the signature, exact client/workspace binding and a
maximum ten-minute validity window before resolving the opaque Auth connection
to a mailbox. Pub/Sub message IDs are unique in `GmailPushReceipt`, making
redelivery idempotent. Unknown mailbox events return a retryable response;
events for deliberately disconnected or disabled mailboxes are recorded as
ignored so Pub/Sub does not retry them indefinitely.

Signed provider diagnostics also carry the versioned `id30-auth-crm` contract
descriptor and additive capability names. CRM validates the supported contract
version and Gmail push/watch capabilities before presenting push delivery as
activation-ready. A missing or incompatible descriptor leaves polling
available and prevents operators from treating push as ready.

Accepted receipts mark the mailbox as push-pending. The existing protected
scheduled Gmail sync prioritises continuation pages first, then push-pending
mailboxes, and retains least-recently-synced polling as a fallback. A receipt is
only marked processed after the mailbox has drained all continuation pages, so
a bounded sync cannot acknowledge unfinished history. Receipts arriving after
a sync began remain pending for the next pass, avoiding a race with newer Gmail
history. Processed and ignored receipt metadata is deleted after 14 days by the
scheduled route. The callback does not perform the provider sync inline,
keeping Pub/Sub acknowledgement fast and leaving the existing retry, lease and
operation-history controls in charge of message import.

Gmail watches are registered and renewed separately from message sync.
`netlify/functions/renew-gmail-watches.mjs` calls the protected
`/api/maintenance/gmail-watch` route hourly when `GMAIL_PUSH_ENABLED=true`.
Missing watches and watches within 48 hours of expiry are renewed through the
signed Auth broker; the Auth-owned Pub/Sub topic cannot be overridden by CRM.
Expiry, retry and bounded safe-error fields live on `EmailMailbox`, allowing
due watches to be queried without scanning JSON metadata. Failures back off
from one to six hours and do not disable the five-minute polling fallback.
Gmail settings shows whether each mailbox is push-active, awaiting renewal or
using polling only. Successful and failed renewals write privacy-safe audit
events without mailbox addresses, Gmail history IDs or credentials. Each
hourly renewal batch also writes one `BackgroundJobRun` under
`gmail-watch-renewal`, containing aggregate processed, renewed, failed and
deferred counts only. Gmail settings presents that separate renewal history
alongside sync operations so admins can distinguish push-watch health from
normal message polling.

CRM also reconciles every Gmail mailbox against Auth's connection record every
15 minutes through the signed read-only broker endpoint. The least recently
checked mailboxes run first. Confirmed Auth transitions update the CRM mailbox
status and write a compact audit event, while transient broker failures are
stored separately and never disconnect a working mailbox. A mailbox that was
marked `NEEDS_REAUTH` automatically returns to `CONNECTED` after Auth confirms
a successful reconnect; sync/send preferences are not changed by reconciliation.

Admin mailbox configuration saves compare a normalized before/after snapshot
for purpose, owner, sync/send flags and authorised user IDs. Real changes write
`gmail.mailbox.settings_updated` in the same database transaction; no-op saves
do not create an audit row. Successful disconnects write
`gmail.mailbox.disconnected`. Neither event stores OAuth connection IDs,
credentials or message content.

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
- `src/lib/integrations/pipedrive-lead-sync.ts`
- `src/lib/integrations/pipedrive-contact-sync.ts`
- `src/lib/integrations/pipedrive-sale-context.ts`
- `src/lib/integrations/pipedrive-webhooks.ts`
- `src/lib/integrations/pipedrive-webhook-registration.ts`
- `src/components/crm-boilerplate/PipedriveLeadContextPanel.tsx`
- `src/components/crm-boilerplate/PipedriveLeadFilesAutoSync.tsx`
- `src/components/crm-boilerplate/PipedriveLeadFilesPanel.tsx`
- `src/components/crm-boilerplate/PipedriveSettingsForm.tsx`
- `/api/pipedrive/files/[linkId]`
- `/api/maintenance/pipedrive-lead-import`
- `/api/maintenance/pipedrive-contact-import`
- `/api/maintenance/pipedrive-webhook-registration`
- `/api/maintenance/pipedrive-validation`
- `/api/webhooks/pipedrive`
- `/settings/integrations/pipedrive`

Pipedrive is intentionally pull-only. Lead imports use Pipedrive GET requests
and create or link CRM contacts, companies and sales opportunities only. The
lead sync service supports preview-page import, bounded full pulls, webhook
read-back imports and direct single-lead imports from a Lead Inbox URL/UUID;
incremental lead pulls also sweep the latest one lead page before using the
saved cursor. Lead imports and the sale detail admin update action can also
pull Pipedrive Lead Inbox notes with GET requests and store them as CRM
`SalesCommunication` note rows. Scheduled/manual lead pulls also advance a
mailbox-thread cursor across inbox, sent and archive folders so older Lead
Inbox emails can be auto-discovered over time. Pipedrive-linked sale detail
pages can also pull mailbox threads linked to the Lead Inbox UUID and person
mail messages associated with the linked Pipedrive lead contact through
Pipedrive GET requests and store them as CRM-only `EMAIL`
`SalesCommunication`/`EmailMessage` rows using stable `pipedrive:mail:*`
external IDs. Pipedrive-linked sale detail pages can also pull Pipedrive file
metadata with GET requests and store provider file references as CRM-only
`ExternalRecordLink` rows. Those references are shown in
the sale document panel separately from R2-backed CRM `FileAsset` rows; CRM
does not download files during metadata refresh, reupload, delete or share the
Pipedrive files. Opening a provider file uses an authenticated CRM route that
checks sale access, downloads the file from Pipedrive server-side with the
stored API token and streams it back to the user without exposing Pipedrive
credentials; the sale document panel opens those files through the shared CRM
file preview modal and exposes a separate download action backed by the same
authenticated route. That route has the same same-origin frame header override
as CRM media previews so PDF/text previews can render inside the modal.
Pipedrive-linked sale Lead Enquiry panels can read the linked lead and
Pipedrive `leadFields` definitions on demand, formatting custom field option
values into readable CRM display fields without persisting raw provider
payloads. None of these paths write back to Pipedrive.

The first Pipedrive phase covers connection storage, readiness display and the
`ExternalRecordLink` idempotency foundation. `src/lib/integrations/pipedrive.ts`
also exposes a server-side read-only client that uses Pipedrive's `x-api-token`
header for GET-only current-user, user, lead, note, file, deal, person, person
mail-message, mailbox thread/mail-message and organisation requests, plus
cursor-paginated Pipedrive v2 deal and person listing.
`src/lib/integrations/pipedrive-import.ts` maps Pipedrive lead/person/
organisation records into CRM company, contact, sales opportunity,
communication and external-link rows. It converts Pipedrive lead note HTML to
plain text and uses stable Pipedrive note IDs in `SalesCommunication.externalId`
so repeated imports update existing CRM notes instead of duplicating them. Sale
detail pages for Pipedrive-linked leads run a throttled post-load note refresh
action that uses the same pull-only importer and refreshes the route only when
CRM notes changed. They also lazy-load a read-only Pipedrive context panel that
uses the linked Lead Inbox UUID, current-user domain and `leadFields` endpoint
to show summary values and custom fields in the Lead Enquiry tab. The sale
document panel runs a throttled Pipedrive file
metadata refresh when the Documents tab is opened and exposes an admin-only
"Pull Pipedrive files" action. Pipedrive file IDs are stored under
`ExternalRecordLink` with
`externalType = "file"` so repeated refreshes update the existing CRM
reference instead of creating duplicate rows. The
Pipedrive settings page also exposes a historical linked-sale backfill for CRM
sales that already have Pipedrive Lead Inbox links. It supports preview and
import modes, processes bounded cursor batches, writes
`MarketingIntegrationSyncLog` and `BackgroundJobRun` summaries, pulls Pipedrive
notes into idempotent CRM sale notes, pulls Pipedrive Lead Inbox mailbox thread
messages plus person mail messages into CRM sale email communications, and
stores Pipedrive file metadata as CRM-only provider file references. The
backfill reads a bounded set of Pipedrive file
pages once per batch and groups files by lead ID before writing CRM references,
avoiding repeated per-sale file scans while remaining
pull-only. Manual and scheduled Pipedrive lead pulls also run one bounded
linked-sale backfill continuation batch so older Pipedrive-linked sales
progressively receive missing notes, emails and file references without a
separate admin click. They also run a cursor-based mailbox-thread sweep for
older Lead Inbox emails, and the sale detail admin "Pull Pipedrive updates"
action pulls Lead Inbox notes and uses a deeper bounded email scan for
immediate historical recovery. The
same import module also maps standalone Pipedrive persons into CRM contacts and
companies without creating sales opportunities, including all imported
Pipedrive email/phone methods as CRM secondary contact methods. Linked contact
detail pages expose an admin-only targeted Pipedrive person refresh. The
Pipedrive settings page can
manually preview and
selected-import Pipedrive leads, can manually or automatically pull bounded
Pipedrive lead batches, sweeps updated Pipedrive lead notes with a separate
note cursor during lead pulls, and can separately pull Pipedrive persons
into CRM contacts. These actions write sync-history rows with
read/write counts. Preview classifies would-create, already-linked and skipped
leads without creating CRM records and stores sanitized preview rows for the
settings table. Preview also resolves the CRM company/contact that import would
reuse from Pipedrive external links, company name, contact email or normalized
phone so admins can review duplicates before selected import.
Selected import fetches checked preview lead IDs by GET and imports only those
CRM records after validating server-side that imported IDs were marked
would-create in the latest preview; submitted IDs outside that latest
would-create set are rejected and logged. Full pull creates CRM records and
external-link rows for bounded batches of up to five Pipedrive lead pages per
manual or scheduled run. After the first full pull, CRM stores
`lastFullLeadSyncAt` separately from the general `lastLeadSyncAt` timestamp and
sends it to Pipedrive as `updated_since` on later full pulls so selected
imports cannot move the full-pull cursor past unselected leads. Cursors advance
only when Pipedrive reports no more pages are available; capped runs store
`lastFullLeadSyncNextStart` and the next full pull resumes from that provider
continuation before the cursor advances. Import runs store sanitized
per-record outcome rows in
sync-history metadata so admins can review created, already-linked and skipped
records without storing raw Pipedrive payloads. The
manual pull action and protected `/api/maintenance/pipedrive-lead-import`
route share `src/lib/integrations/pipedrive-lead-sync.ts`; the route can be
called by the disabled-by-default Netlify scheduled function
`netlify/functions/pull-pipedrive-leads.mjs` and writes compact background job
history for scheduled runs. The route also supports `preview=1` for protected
Pipedrive GET-only operational previews that return aggregate counts only and
do not create CRM records. `POST` requests can use `approvedImport=1` for
controlled first imports: CRM re-previews the exact requested page, requires
the expected would-create count to match, caps the batch at 10 leads, aborts on
preview warnings/skips, and imports only those approved lead IDs into CRM.
Manual and scheduled pulls start a
`pipedrive.lead_import` background job before importing, and newer overlapping
runs skip with a warning when another non-stale Pipedrive pull is already
running. The Pipedrive settings page surfaces schedule readiness, credential
source, cursor, saved continuation and active guard state from the same CRM
state. Standalone Pipedrive person/contact pulls use
`src/lib/integrations/pipedrive-contact-sync.ts`, the protected
`/api/maintenance/pipedrive-contact-import` route and the disabled-by-default
`netlify/functions/pull-pipedrive-contacts.mjs` scheduled function. Contact
pulls use a separate `pipedrive.contact_import` background job,
`lastFullPersonSyncAt` timestamp and `lastFullPersonSyncNextCursor` cursor so
they cannot move or skip the lead full-pull cursor. Scheduled Pipedrive
functions resolve the first valid HTTPS CRM base URL from app/Netlify URL
environment variables and emit aggregate-only import logs for operational
verification without exposing provider payload data. The authenticated
`/api/webhooks/pipedrive` receiver supports Pipedrive v1/v2 lead, person and
note create/change payloads by reading the current record back from Pipedrive
using GET requests before importing into CRM. Note events only create or update
CRM sale notes when the Pipedrive note belongs to a Lead Inbox lead already
linked to a CRM sale. Deal, delete and organization webhook events are recorded
in sync history but do not import, delete or mutate CRM records and do not
write to Pipedrive. The protected
`/api/maintenance/pipedrive-webhook-registration` route previews required
Pipedrive v2 lead/person/note create/change webhook subscriptions with GET-only
provider checks. It only creates missing provider webhooks when called with
`POST`, `apply=1` and the explicit provider-write approval token
`pipedrive-webhook-registration`; creating Pipedrive webhooks is still a
provider-side write operation. The protected
`/api/maintenance/pipedrive-validation` route returns sanitized CRM-side
operational summaries for readiness, external-link counts, recent sync logs,
recent background jobs, webhook activity and webhook-registration status
without exposing raw provider payloads or secrets. Settings > Integrations >
Pipedrive can run a CRM-only receiver self-test through the authenticated
webhook route; it records `webhook-receiver-test` without reading or writing
Pipedrive data. Validation reports real provider deliveries separately from
receiver self-tests so admins can see whether Pipedrive itself has sent a
lead/person/note webhook event.
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
conversation topics together. Gmail and MailerSend inbound publishers also
invalidate generated header notifications and bump the `notifications` topic;
the header bell subscribes directly and falls back to a one-minute visible-tab
refresh.

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
Authenticated previews use a strict passive-content allow-list: raster images,
PDF, JSON and selected text formats are supported, while HTML, SVG and other
active formats remain download-only. Preview responses are no-store, nosniff
and sandboxed so uploaded content cannot execute in the CRM origin.

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
Portal signature downloads require the portal to have a recipient email and
the completed signature request to include that same recipient. Public token
download redirects use no-store and no-referrer headers so the opaque portal or
share token is not forwarded to R2.

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
form-attribution sample per contact. The same dataset resolves database-backed
person types, derives profile completeness from active type fields and derives
document compliance from valid typed contact files. Expired files do not
satisfy a required-document report. These values are available as approved
dimensions, filters and metrics to both Reports and Sidekick.
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

Sale conversation history is paginated through the authenticated
`GET /api/sales/[id]/conversation` endpoint. The endpoint applies normal sale
access rules, returns per-channel totals and merges CRM `SalesCommunication`
rows, Pipedrive file references and website attribution events in descending
event order. Each Calls, Emails, Notes, SMS, Files and Website filter queries
its complete server-side history rather than filtering only the initial sale
page payload.

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
`/api/build-version` after Netlify finishes. Public health and
`/api/build-version` expose only the short build fingerprint; full build
metadata is available to authenticated CRM users through `/api/build-info` and
Settings > System. `/api/health` is DB-free by default; use
`/api/health?database=1` for an explicit database ping.

Netlify settings:

- Install: `npm ci`
- Build: `npm run netlify:build`
- Functions region should be close to Neon.

Healthcheck:

```text
GET https://crm[.]epc-improvements[.]co[.]uk/api/health
```

Database healthcheck:

```text
GET https://crm[.]epc-improvements[.]co[.]uk/api/health?database=1
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
