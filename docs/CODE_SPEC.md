# iD30 CRM Code Spec

This document tracks the iD30 CRM live-test implementation copied from the iD30 CRM Boilerplate. Keep customer/project-specific assumptions here, then port reusable improvements back to the boilerplate intentionally.

## Product Intent

- This is the iD30 CRM live-test implementation, based on the reusable bespoke CRM boilerplate.
- The default CRM is sales-led. Sales pipeline, contacts, activity, tasks and settings are core modules.
- The app is closed access. There is no public signup flow; admins create users.
- Tail Admin Pro is the design and component base. New CRM screens should feel operational, table-led and consistent with Tail Admin.
- Repeated admin metric, status, empty-state and section patterns should use
  shared `src/components/crm-boilerplate` components before adding local page
  helpers.

## Tech Stack

- Next.js App Router with TypeScript.
- Tail Admin Pro UI components and styling.
- Prisma ORM with PostgreSQL.
- Docker Compose for local database setup.
- Server actions for CRM mutations.
- HTTP-only cookie sessions with database-backed session records.
- Playwright/Cypress/Pytest plus focused TypeScript unit test coverage where appropriate.

## Authentication And Permissions

- `ADMIN`: full CRM access, user management and developer/system settings.
- `USER`: standard CRM access, profile and password management.
- `User.roleTemplate`: client-facing role template used for setup clarity.
  Templates map to the current `ADMIN` / `USER` enforcement boundary until
  finer-grained permissions are implemented. Do not treat role templates as
  security enforcement without adding server-side permission checks.
- Settings > Users supports bulk CSV user import. CSV imports must validate
  rows before creation, skip existing users, avoid CSV/password imports and use
  password setup/reset tokens for first sign-in. Skipped/error rows should be
  exportable as a CSV report, and admin-role imports must require explicit
  confirmation server-side and in the UI. The users table should show setup-link
  lifecycle status and allow admins to send/resend a secure setup link through
  the same reset-token email flow.
- User profiles include an R2-backed avatar upload, first name, last name, landline, mobile and email. The legacy `name` field remains the display/full name and should stay in sync with first/last name.
- Sign-in, two-factor verification, password-reset request and password-reset
  confirmation actions use database-backed server-side rate limits. Successful
  sign-in/reset completion clears the relevant throttle window.
- Password reset and setup email links must use the trusted configured
  application origin (`APP_BASE_URL`, then `NEXT_PUBLIC_APP_URL`) rather than
  request `Host` / forwarded headers.
- Users can enable authenticator-app TOTP two-factor authentication from My
  Account. When `User.twoFactorEnabled` is true, password sign-in issues a
  short-lived server-signed challenge and requires a valid six-digit code before
  creating the session. 2FA is opt-in for admins and users unless a future
  client-specific policy explicitly changes that.
- `User.twoFactorSecret` must remain encrypted with `CREDENTIAL_ENCRYPTION_KEY`;
  do not store authenticator secrets or backup credentials in plaintext.
- New sessions prune expired rows and cap active sessions per user through
  `SESSION_MAX_ACTIVE_PER_USER` (default `10`).
- My Account lists active browser sessions for the signed-in user and lets the
  user revoke other sessions. Settings > Security lets admins revoke
  non-current sessions from the recent sessions table. Session revocations are
  written to `AuditLog`.
- Protected routes are under `src/app/(admin)`.
- `src/proxy.ts` does the lightweight session-cookie route check.
- `src/app/(admin)/layout.tsx` performs full database session validation.
- Admin route loading and error states should use the shared CRM shell patterns
  so slow or failed server-rendered pages provide clear retry and diagnostics
  actions.
- Admin-only pages and actions must call `requireAdmin()` server-side.
- User-facing authenticated work should call `requireUser()` server-side.
- Global security headers are defined in `next.config.ts`. Keep CSP in
  report-only mode until third-party integration and softphone requirements are
  audited for an enforcing policy. Set `CSP_ENFORCE=true` only after that
  audit. Production omits `unsafe-eval` unless `CSP_ALLOW_UNSAFE_EVAL=true` is
  explicitly set.

## Core CRM Modules

- Dashboard: overview metrics for Sales, Companies, Contacts, Tasks and Notes.
- Sales: first-class pipeline module for opportunities, value, stage, probability, owner, next step and communication journey.
- Products: admin product/service catalogue used for lead scoping and later quoting, inventory or production extensions.
- Discovery: admin qualification framework showing reusable question groups,
  question banks, product/category links, logic rules and stage requirements.
  Conditional show/require rules must be validated server-side against the
  submitted template questions and allowed operators.
- Companies: account/company records. Visibility is controlled by General Settings.
- Contacts: grouped into People, Companies and Segments. People use dynamic CRUD with table search, sorting, pagination, optional manual postal address fields and a customer conversation workspace across linked leads. Segments save dynamic people criteria with optional AI-assisted prompt drafting.
- Header/global search should remain tolerant of practical client input:
  casing, punctuation, compact names, reversed names, phone formatting and small
  name typos should still find matching CRM records.
- The authenticated header should keep a permanent `+` create control next to
  global search. It opens quick-create actions for Contact, Organisation when
  Companies is enabled, Lead and Deal, reusing the normal modal forms rather
  than maintaining separate create flows. Quick-create Lead and Deal must
  require a linked person: users can search existing contacts or create a new
  contact inline, optionally linking/creating the organisation before the sale
  is saved.
- Notes / Activity: timeline/activity foundation.
- Tasks: follow-up and operational work queue.
- Calendar: retained as a Tail Admin route for schedule workflows.
- Storage: admin file browser for R2-backed `FileAsset` records, with view,
  metadata edit, document-folder metadata and delete.
- Settings: pinned to the bottom of the sidebar as a Shopify-style dropup.
- Settings > Setup: admin-only client handover checklist for company identity,
  branding, workspace defaults, users, security posture, integrations,
  attribution, telephony and operational readiness. It should link to existing
  setup surfaces rather than duplicating their forms.
- Dashboard setup readiness should use the same shared setup helper as
  Settings > Setup. Show it to admins only, hide it automatically when setup is
  complete, and store dismissals per user against the current outstanding-item
  fingerprint so newly introduced setup work can surface again.
- The CRM should be installable as a PWA using a root web app manifest and
  generic iD30 CRM app icons. PWA icons should stay product-level rather than
  client-brand-specific because workspace branding can vary after sign-in.
- PWA install assets must remain public through the proxy. Browsers request
  `/manifest.webmanifest`, `/service-worker.js`, `/offline` and `/icons/*`
  before they can rely on authenticated app navigation, so those paths must not
  redirect to sign-in.
- PWA service worker behaviour must stay conservative: cache static app shell
  assets and an offline fallback only. Do not cache CRM API responses,
  authenticated customer records, media downloads or other private workspace
  data.
- The user menu can expose the native browser install prompt when
  `beforeinstallprompt` is available. Settings > System should show PWA
  installability status and live checks for the manifest and service worker.
- Settings > System should expose live deployment identity, health, handoff
  checks and safe diagnostics without showing secret values.
- Phone System: admin settings page for staff routing, Twilio readiness, webhook paths and recent call logs.

## File Storage

- Cloudflare R2 is the default file storage integration for the boilerplate.
- R2 stores file bytes; PostgreSQL stores metadata in `FileAsset`.
- `FileAsset` records bucket, object key, original filename, MIME type, size,
  checksum, linked entity, optional document folder slug, uploader, optional
  notes and lightweight tags.
- Contact, company/customer and sales opportunity detail pages expose a shared
  foldered document library backed by private `FileAsset` rows. The folder
  template is stored in `CrmSettings.documentLibrary`; renaming a folder should
  keep its slug stable so existing file assignments remain grouped.
- Customer-facing and internal upload flows should use the controlled document
  upload type catalogue in `src/lib/document-library.ts` rather than accepting
  arbitrary folder names from the browser. `src/lib/record-document-upload.ts`
  resolves types such as `utility_bill`, `floor_plan`, `site_photo`,
  `commissioning_handover` and `warranty_certificate` into the configured
  folder before writing the `FileAsset` row.
- Record document libraries and the admin Storage browser should use the shared
  drag-and-drop file picker, support multi-file upload batches, preserve
  uploader/date metadata, preview common image/PDF/text files without forcing a
  download and allow notes/tags to be added where useful. Private previews
  should use same-origin authenticated media routes rather than framing raw R2
  signed download URLs. Record document libraries support selected-file bulk
  actions for moving folders, adding or replacing tags, and downloading a
  private ZIP through an authenticated record-scoped API route. Do not add
  irreversible bulk delete without an explicit product-owner confirmation and
  server-side access checks.
- Record document libraries should keep customer-facing tasks separated in the
  UI: staff uploads, customer upload requests, selected-file sends, full
  customer portals and signature tracking should not be combined into one long
  panel. Public pages should use friendly file-type labels and customer-facing
  copy, while internal metadata such as tags remains staff-only. Customer
  upload/share/portal links should include plain-language helper steps, visible
  download/upload actions, expiry/replacement guidance and specific closed-link
  messages so customers understand what is needed without CRM context.
- Contact, company/customer and sales document libraries should support secure
  customer upload request links. The CRM creates an expiring checklist backed
  by `CustomerUploadRequest` rows, stores only a token hash, shows the link
  once, and lets customers upload through public `/upload/[token]` without a CRM
  session. Customer uploads must validate token status/expiry server-side and
  must use the controlled document upload type catalogue so files auto-file
  into the correct configured folder. When a recipient email is provided, the
  link must be sent through the saved MailerSend integration while audit logs
  store delivery status only. Public customer uploads should use token-bound
  multipart upload sessions, 5MiB chunks and a visible progress bar so requests
  stay below platform body limits before completing into private R2 storage.
  Public customer upload links should default to 100MB support and respect
  higher R2 max upload settings up to the 500MB hard cap. Token-scoped upload
  pages may show customer-safe metadata for files already uploaded through that
  same checklist item, limited to filename, file type, file size and received
  time. Upload request emails and public upload pages should show the configured
  company logo above the first card, falling back to the default CRM logo, so
  customers can identify who sent the request before uploading files. Upload
  request emails and public upload pages should explicitly describe the link as
  private and time-limited before a customer chooses files. Public upload pages
  should show compact trust cues for private-link scope, encrypted transfer and
  limited authorised-team access, then end with a concise confidential-file
  handling message explaining that the private link is for requested documents
  only, files are sent over HTTPS into private CRM document storage, the link
  should not be forwarded unless requested by the team, and the uploader must
  have permission to share the documents. Customers may remove only files
  uploaded through the same active,
  token-scoped checklist item; removal must unlink the file from the request,
  audit the action, reopen the request if a required item becomes incomplete
  and avoid exposing or hard-deleting internal CRM files.
- Contact, company/customer and sales document libraries should support sending
  selected existing files to customers through secure document share links.
  `CustomerDocumentShare` rows must store only a SHA-256 token hash, expiry,
  recipient metadata, subject/message and selected file references. The public
  `/share/[token]` page must list only those selected files, and downloads must
  use a token-scoped API route that validates status/expiry and file membership
  before issuing a short-lived R2 URL. The raw token and signed R2 URLs must not
  be stored in audit logs or timeline metadata.
- Contact, company/customer and sales document libraries should support a
  unified customer document portal. `CustomerDocumentPortal` rows must store
  only a SHA-256 token hash and can reference one portal-managed upload request
  plus one portal-managed document share. Public `/portal/[token]` pages may
  show requested uploads, selected outgoing documents and DocuSign signature
  status for the same record/recipient. Signature status must be scoped to a
  matching portal recipient email; a portal without recipient email must not
  reveal record-wide signature requests. The portal should show a clear
  customer-facing task summary and completion progress across shared files,
  requested uploads and signature requests. Portal uploads must reuse the
  server-side customer upload validation path, including multipart uploads, and
  portal downloads must validate portal status/expiry and explicit
  document-share or completed-signature membership before issuing a short-lived
  R2 URL.
- Contact, company/customer and sales document libraries should support
  sending existing PDF/Word files for DocuSign electronic signature. Signature
  requests must validate the current user's access to the target record and
  source `FileAsset`, use encrypted DocuSign credentials server-side, include
  a CRM signature request custom field for callback correlation, verify
  DocuSign Connect HMAC signatures before applying state changes and store
  completed signed PDFs plus certificates as private `FileAsset` rows in the
  configured Contracts & Finance folder.
- Media object keys are foldered under `<uploadPrefix>/media/<type>/<entity>/<entityId>/...` so future media galleries can group uploads cleanly.
- Uploaded profile avatars are stored under `media/avatars/users/<userId>` and served via authenticated `/api/media/<fileAssetId>` URLs.
- Profile avatars use a Shopify-style media picker: if an avatar exists the upload/dropzone is hidden and the user must remove the current image before selecting another.
- The media picker supports searchable existing image media plus local upload to R2.
- All image upload interfaces should use a drag-and-drop dropzone with a browse fallback and local preview.
- Image/PDF uploads must verify file content bytes, not only browser-supplied
  MIME metadata. SVG uploads are rejected unless a future sanitizer is added.
- The Storage module lets admins browse files, review storage overview metrics,
  upload files directly to R2, filter by
  type/visibility/uploader/link/date/folder, search name/type/notes/tags, open
  or preview media, edit metadata and delete both the R2 object and the
  database metadata.
- R2 bucket/account settings and R2 access credentials are managed in Settings > Integrations > Cloudflare R2.
- R2 setup fields include inline help popovers that tell admins where to find values in Cloudflare and link to the relevant Cloudflare docs.
- R2 access credentials are encrypted before being stored in `IntegrationConnection.config`.
- Geoapify address lookup credentials are encrypted before being stored in
  `IntegrationConnection.config`. Address autocomplete must go through the
  authenticated CRM API route so API keys are never sent to the browser.
- DocuSign JWT credentials and Connect HMAC secrets are encrypted before being
  stored in `IntegrationConnection.config`. The browser must never receive the
  private key, impersonated user ID or Connect HMAC secret.
- `CREDENTIAL_ENCRYPTION_KEY` must be set in the environment before saving integration credentials.
- Do not store plaintext integration credentials in the database.
- Upload/download access should use short-lived presigned URLs.
- Private media downloads through `/api/media/<fileAssetId>` must call
  `authorizeFileAssetAccess` so users can only open admin, uploader,
  self-profile or related CRM entity files.
- Keep buckets private by default; use public/custom domains only when a client requirement needs public file access.

## Communications Integrations

- Twilio is the default communications integration for telephony, SMS and WhatsApp.
- Twilio credentials are managed in Settings > Integrations > Twilio.
- Twilio Auth Token and optional Client Secret are encrypted before being stored in `IntegrationConnection.config`.
- Twilio settings include Account SID, API key SID, TwiML App SID, Messaging Service SID, SMS sender, WhatsApp sender, voice caller ID, webhook base URL and enabled capabilities.
- Twilio settings include an admin-only CRM-managed voice setup action that creates or updates the Twilio TwiML App and Voice Intelligence service with the CRM voice/transcript webhook URLs.
- Browser click-to-call uses the Twilio Voice JavaScript SDK through the global CRM softphone dock.
- Browser outbound calls are conference-backed so transfers can be supported. Direct TwiML `<Dial><Number>` should not be used for calls that may need transfer.
- The softphone is a floating draggable utility panel with call, mute, hold, transfer and hang-up controls. Transfer opens a staff directory drawer and supports warm/cold transfer into the active conference.
- The softphone registers the browser client after login so browser-extension users can receive transferred calls.
- Browser staff transfers route to Twilio Client identities derived from the CRM user id; external staff routing uses SIP, landline or mobile depending on `User.voiceRoutingMode`.
- Hang-up must end the Twilio conference or customer leg via `/api/twilio/voice/hangup`, not only disconnect the local browser SDK call.
- Cold transfer should only disconnect the transferring agent locally after the new leg is started; it must not complete the conference.
- Warm transfer must place the customer participant on hold, dial the target agent into the same conference, then let the original agent leave via `/api/twilio/voice/transfer/complete` without completing the conference.
- Inbound calls to the Twilio number are handled by `/api/webhooks/twilio/voice`. Browser-originated calls are detected by Twilio Client identity and stay on the outbound path; PSTN-originated calls enter inbound routing.
- Inbound routing first tries an `AVAILABLE` routable agent. If none is available, the caller is held through `/api/webhooks/twilio/voice/queue`.
- Queue timeout creates a missed-call `Task` with `metadata.type = "MISSED_CALL"` and `metadata.sourceCallSid`.
- The browser softphone owns agent availability through `/api/telephony/availability` and should heartbeat/recover state through `/api/twilio/voice/recover`.
- Call recordings are linked by `/api/webhooks/twilio/voice/recording` onto `CallLog.recordingSid` and `CallLog.recordingUrl`.
- Twilio recording playback through `/api/twilio/voice/recordings/<recordingSid>` must call `authorizeCallRecordingAccess` before proxying audio from Twilio.
- Recording compliance is represented by `CallLog.recordingConsent`; current boilerplate behaviour plays a recording notice before conference entry and stores `CONSENTED`. Client builds must confirm jurisdiction-specific wording and consent rules.
- The voice token route is `/api/twilio/voice/token` and must authenticate the CRM user before minting a short-lived Twilio Access Token.
- The voice webhook path is `/api/webhooks/twilio/voice`; the Twilio TwiML App Voice request URL should point to this path on the deployed CRM domain.
- Voice conference and status callback paths are `/api/webhooks/twilio/voice/conference` and `/api/webhooks/twilio/voice/status`.
- Staff directory for transfers is exposed through authenticated `/api/telephony/directory`.
- Planned messaging webhook path is `/api/webhooks/twilio/messaging`.

## Phone System Model

- `CallLog` is the general phone-system record. It must be created for calls regardless of whether the call is attached to a sale.
- `CallLog` can optionally link to `SalesOpportunity`, `Contact` and `User`.
- `CallLog` stores Twilio call SID, parent call SID, conference identifiers, recording URL, duration, status and provider metadata.
- `User.voiceRoutingMode` defines how staff should receive transfers or routed calls: `BROWSER`, `MOBILE`, `LANDLINE`, `SIP` or `FLEX`.
- `User.voiceExtension` and `User.sipAddress` are optional staff telephony fields.
- `User.voiceAvailability` defines routing eligibility: `AVAILABLE`, `BUSY`, `AWAY` or `OFFLINE`.
- `CallQueueEntry` tracks inbound call queue state, assigned agent, linked contact/sale and missed/answered/completed timestamps.
- Missed inbound calls create open `Task` records rather than a separate notification table.
- Admins configure staff routing under `/telephony`.
- `/telephony` and its child routes show Twilio setup readiness, voice/messaging webhook URLs, staff routing forms and recent `CallLog` records.
- `/telephony` also shows queue activity and open missed-call follow-up counts.
- `/settings/integrations/twilio` is connection-only. Operational Twilio settings belong under `/telephony/system`, `/telephony/numbers`, `/telephony/recordings` and related Telephony routes.
- Sale-context calls launched from `/sales/[id]` must pass `opportunityId` and `contactId` into the softphone so conversation events are sale-scoped.
- Calls launched without explicit sale context remain general phone calls and should not be guessed into a sale if a contact has multiple enquiries.
- `/sales/[id]` shows both sale communication events and the linked phone-call journey, including recording links.
- `/contacts/[id]` shows contact-level sale communications, linked opportunities and phone-call journey.

## Sales Model

Sales is intentionally generic enough for bespoke builds:

- `SalesOpportunity` stores pipeline records.
- `SalesOpportunity` is the wrapper for communication and follow-up attached to a specific sale.
- `/sales/[id]` uses the exact opaque `SalesOpportunity.id`; do not put descriptive customer or enquiry text in sales URLs.
- Stage enum: `LEAD`, `QUALIFIED`, `PROPOSAL`, `NEGOTIATION`, `WON`, `LOST`.
- EPC's current customer-facing pipeline is Enquiries -> Opportunities ->
  Projects, with Lost retained for closed-lost reporting. These are represented
  by the existing `LEAD`, `PROPOSAL`, `WON` and `LOST` buckets so attribution,
  automation and reporting logic can stay stable; `QUALIFIED` and
  `NEGOTIATION` are legacy buckets unless explicitly reactivated.
- Custom lifecycle stages use `SalesPipelineStage`, which maps each configurable
  stage to the stable `SalesStage` enum bucket for reporting and conversion
  upload compatibility. Keep both fields in sync until the later cleanup phase.
- Money is stored as integer minor units in `valueCents`.
- `currency` defaults to `GBP`.
- `probability` is an integer percentage.
- Opportunities can link to `Company`, `Contact` and owner `User`.
- Each opportunity has optional `source`, `nextStep` and `expectedCloseDate`.
- Opportunities also store lifecycle metric foundations: `stageChangedAt`,
  `firstContactedAt`, `closedAt`, `lostReason` and `lostReasonNotes`.
- Opportunities can link to `SalesPipelineStage` through
  `salesPipelineStageId`; the legacy `stage` field remains the bucket.
- Admins manage custom sales stages under `/settings/sales-pipeline`. Stage
  management edits the display name, reporting bucket, active state, sort
  order, default probability, colour, description, movement gate mode and
  configured stage-progression requirements. Do not hard-delete linked stages;
  inactive stages remain available for historical records.
- `/sales` uses active `SalesPipelineStage` rows for manual sale creation,
  bulk stage updates, filtering, sorting and stage display. Server actions must
  still write the matching legacy `SalesStage` bucket alongside
  `salesPipelineStageId`.
- Manual lead/deal creation can receive an inline contact draft from
  quick-create. The server action creates the contact and sale in one
  transaction, copies the sale lead source onto the new contact, links the
  contact's organisation to the sale and rejects obvious duplicate contacts by
  matching accessible email or normalized phone values.
- `SalesLifecycleEvent` records creation, stage-change, first-contact and lost
  reason events for an opportunity. Stage events can also link from/to custom
  pipeline stage records. Use this table for contacted-rate, response-time,
  lost-reason and time-to-close reporting rather than inferring history from
  the current opportunity row.
- `SalesCommunication` stores the customer communication journey for a sale.
- Communication channels are `PHONE`, `EMAIL`, `SMS`, `WHATSAPP`, `NOTE` and `SYSTEM`.
- Communication direction is `INBOUND`, `OUTBOUND` or `INTERNAL`.
- Communication records can link to the sale, contact and user, and can store connector references through `externalId`.
- Manual sale notes can include `@` mentions for active CRM users. Mention
  picker suggestions should insert server-resolvable handles. Mention alerts
  must be represented as assigned `Task` records with
  `metadata.source = "sale-note-mention"` linked back to the opportunity and
  `SalesCommunication`; do not add a parallel notification table for this flow.
  Resolved mention tasks should also trigger a best-effort MailerSend email to
  the mentioned CRM user so they can review the note even when not logged in.
- Connector workflows should write inbound/outbound events to `SalesCommunication` so the sale remains the single wrapper for all related customer communication.
- Website form lead capture must preserve safe submitted field data in `SalesCommunication.metadata.formFields` and the conversation body instead of only storing the mapped message field.
- Form-field normalization must keep tests for mixed form styles, safe field capture,
  sensitive-field filtering, deduplication and conversation body generation.
- Phone calls write to `CallLog` first and only write to `SalesCommunication` when sale context is explicit or unambiguous.
- The default `/sales` surface is an overview with a compact pipeline stage rail,
  clickable sales cards and a table/Kanban view switch. The Kanban board is
  URL-backed through `view=kanban`, keeps the same search/stage/owner/sort
  filters, groups opportunities by configured pipeline stages and uses a bounded
  server-side row limit rather than loading the whole pipeline. Admins can
  choose which Kanban card fields are shown from `Settings > Sales Pipeline`;
  the selection is stored in `CrmSettings.salesKanban`. Kanban stage movement is
  drag-and-drop, but the browser only submits the target stage; ownership,
  lifecycle updates, automation triggers and required-data gates are enforced in
  the shared server action. Gate blocks and warnings must be shown inline on the
  board rather than relying only on toast feedback.
- Stage progression requirements are stored in
  `SalesPipelineStage.metadata.requiredActions` and evaluated by the shared
  server-side stage gate. The current required actions cover linked documents,
  survey completion, proposal issue, deposit receipt and design approval using
  CRM evidence from documents/tags/notes, linked tasks, lead-scope metadata and
  sales communications. When `metadata.requiredDocumentTypes` is configured for
  the linked-document rule, every listed controlled document type must be
  present; older files without `FileAsset.documentUploadType` fall back to their
  configured folder slug for compatibility.
- Sale conversation tracking belongs on `/sales/[id]`, where the customer journey panel shows communication attached to that sale.
- Sale and contact conversation panels use the shared compact timeline: the
  latest event opens by default, older events render as compact rows, and the
  inline Reply action opens the existing AI reply composer for the active lead
  or customer context.
- `/sales/[id]` uses a compact lead header with back navigation, current stage,
  linked customer, call action and overflow action. When the sale has a linked
  contact, the customer name in this header opens `/contacts/[id]`. The detail
  body is a connected tab workspace: Conversation, Lead, Discovery, Estimate
  and Proposal.
- The Lead tab owns editable `SalesOpportunity.leadScope` and key lead facts.
  Do not reintroduce a separate left-hand lead-info sidebar; the left rail is
  reserved for workspace tabs.
- The Discovery tab loads active `DiscoveryTemplate` packs dynamically: `LEAD`
  templates apply once, `PRODUCT` templates apply to matching
  `OpportunityProduct` rows, and `CATEGORY` templates apply to matching product
  categories. Answers are saved to `OpportunityDiscoveryAnswer` with product or
  category scope where relevant.
- Bespoke client CRMs can replace the sale-specific fields while keeping the sale detail and communication wrapper pattern.

## Products And Discovery Model

- Products are first-class catalogue records, separate from discovery questions,
  so client builds can later extend them into quoting, inventory or production
  without rewriting lead qualification.
- `ProductCategory` groups reusable services/products. `Product` stores the
  product name, slug, type, SKU, active state and optional category.
- `/products` is an admin catalogue page with add/edit drawers for products,
  image upload, category assignment and inline category creation. Discovery
  links are shown as read-only context and are edited from `/discovery`.
- `OpportunityProduct` links one or more products to a sale and stores the
  product status, quantity and optional price estimate at lead level.
- `DiscoveryQuestion` is the reusable question bank. Questions store scope,
  answer type, answer mode, optional max answer count, options, default
  required state and optional `visibilityRules` / `requirementRules` JSON for
  conditional logic.
- Discovery answer modes are `SINGLE`, `MULTIPLE_MAX` and
  `MULTIPLE_UNLIMITED`. Capped multiple questions should render all available
  answer fields up to `maxAnswers`; unlimited multiple questions should render
  one answer field first and let the user add more.
- URL questions are supported as a first-class answer type for reference sites,
  competitor sites and similar discovery inputs.
- `DiscoveryTemplate` groups questions. `LEAD` templates apply to every
  opportunity. `PRODUCT` templates apply when linked through
  `ProductDiscoveryTemplate`. `CATEGORY` templates apply when linked through
  `ProductCategoryDiscoveryTemplate`.
- `/discovery` is the canonical admin setup page for reusable questions,
  question groups, lead/product/category template links, conditional logic
  placeholders and stage requirement placeholders. `/questions` redirects to
  `/discovery` for compatibility.
- `DiscoveryTemplateQuestion` controls question order, labels, requirement
  overrides and conditional rules inside a template.
- `OpportunityDiscoveryAnswer` stores captured answers against the opportunity
  with optional product/category scope. Shared lead-level questions such as
  budget should use opportunity scope; repeated product-specific answers should
  use product or line-item scope.
- When multiple selected products share the same question, future resolver code
  should deduplicate by `dedupeKey` at opportunity/category scope and repeat
  only questions that explicitly need product-line answers.
- Products and Discovery are top-level admin modules because catalogue data may
  later support quoting, inventory and production, while Discovery configures
  how sales agents collect structured information during qualification calls.

## Companies Setting

- `CrmSettings.companiesEnabled` controls whether Companies appears in the sidebar.
- When enabled, contact forms use a searchable company dropdown that can link
  an existing `Company` or create a new linked company by name.
- When disabled, contact forms show a simple company text input and store only
  `Contact.companyName`; they do not create or link `Company` rows.
- `Contact.role` stores the person's role/job title at the company.

## Contacts UX

- Contacts use a table-first workflow.
- Add/edit forms are modal-based and hidden until invoked.
- Successful manual contact creation routes the user to the new contact detail
  page rather than leaving them on the people list.
- Contact forms keep one primary email and one primary phone, and can add
  multiple labelled secondary emails/phone numbers. Selecting Other on a
  secondary method reveals a custom label field, and that saved label is used in
  summaries and contact detail. The secondary email and phone editors stack as
  full-width sections so method rows have enough room in the modal. Existing
  sales, softphone and reply flows should use primary values first and fall back
  to the first secondary value when the primary is blank.
- Contact create/edit keeps Company and Role / job title on the same row, with
  lead source as a full-width field below them.
- Delete uses a confirmation modal.
- Contact tables include live search, sortable columns, page size control,
  icon-only previous/next pagination and the shared table column selector.
  The People list defaults to the core contact columns while allowing optional
  columns such as Address to be added or removed through URL-backed table state.
  People rows show the contact postal address under the contact name and the
  linked company postal address under the company name when those values exist.
- Table footer backgrounds use `bg-gray-50 dark:bg-white/[0.02]` and must preserve bottom border radius.
- Contact detail shows a combined customer conversation across linked leads,
  using the same compact latest-open timeline and AI Reply composer pattern as
  lead detail. The contact detail header shows the contact address under the
  person name and the linked company address under the company name when those
  values exist, with address, company and role details shown inline with
  compact contextual icons.
- People detail workspace summaries show all primary and labelled secondary
  email/phone methods in the existing Email and Phone summary cells so users
  can choose the correct method without opening the profile tab. Company and
  role stay in the page header/profile area rather than being duplicated in the
  workspace summary strip.
- Contact segments live at `/contacts/segments`. Segment criteria must be
  stored as validated JSON rules and evaluated through Prisma filters; do not
  generate or execute raw SQL from AI prompts.

## Save UX

- Every real save/delete action should show a toast confirmation.
- Save buttons are disabled until the user changes something that needs saving.
- After successful save, dirty state resets.
- Do not let stale successful action state auto-save later UI changes.
- Integration cards currently persist no credentials; their on/off switch is UI state only and shows toast feedback.

## Navigation Rules

- Main sidebar is sectioned into Home, CRM, Communications, Marketing, and
  Products & Operations. Calendar is currently hidden from the sidebar.
  Settings remains the bottom admin dropup.
- Home includes Dashboard, Reports and Tasks.
- CRM includes Sales, Contacts, Notes / Activity and Discovery.
- Communications includes Inbox and Telephony.
- Marketing includes the Marketing group.
- Products & Operations includes Products and admin-only Storage.
- Contacts expands to People, Companies and Segments.
- Marketing groups attribution dashboard, tracking engine, lead sources, ad platforms and conversion reporting.
- Offline campaign setup lives at `/marketing/offline-campaigns` and uses
  `OfflineCampaign` as the source of truth for campaign code, channel/status,
  source fields, dates, cost metadata and attribution links. QR artwork is
  generated from the destination URL plus UTM fields and `id30_offline_code`.
  Attribution tracking pool numbers can be assigned to offline campaigns from
  the same screen. The Offline Media report shows response setup, schedule and
  budget pacing cues, and intentionally keeps reading legacy source/campaign
  metadata as a fallback for older captured activity.
- Executive Report client-pack export uses `/marketing/executive-report?print=1`
  and browser print/save-as-PDF controls, with `/api/marketing/executive-report/client-pack`
  providing the authenticated downloadable HTML pack. Keep both packs
  client-facing and avoid internal confidence factors, upload queue details and
  provider diagnostics.
- Scheduled conversion upload processing uses the Netlify scheduled function
  `process-conversion-uploads`. It must remain opt-in through
  `MARKETING_UPLOAD_CRON_ENABLED=true` and `MARKETING_UPLOAD_CRON_SECRET`; use
  `MARKETING_UPLOAD_CRON_DRY_RUN=true` when testing schedule wiring without
  sending provider uploads.
- Conversion Reporting upload rows should use one normalized classifier for
  summary categories, row badges and next actions so setup gaps, attribution
  evidence gaps and provider failures stay consistent.
- Telephony groups softphone, users/extensions, queues, routing, numbers, call tracking and call reporting.
- Companies is hidden when `companiesEnabled` is false.
- The header quick-create Organisation action follows `companiesEnabled`; when
  the full company database is off, contacts continue to use the simple company
  text field instead of creating `Company` rows.
- Settings is not a normal main-menu link; it is fixed to the sidebar bottom.
- Settings opens a bottom dropup, uses plus/minus indicators and supports click-away dismissal.
- Settings submenu links must show active highlighting.
- User Management and Integrations should stay under Settings, not duplicated in the main menu.
- Sales Pipeline stage configuration belongs under Settings and is admin-only.
- Products and Discovery are admin-only top-level setup modules for catalogue
  and discovery-call configuration.
- Sales Quality reporting should use stored `SalesLifecycleEvent` rows for
  transition-history rollups instead of inferring every movement from the
  current opportunity stage.
- Marketing provider setup for Google Analytics, Google Ads, Bing Ads and Meta belongs under Settings > Integrations; Marketing may show status and reporting links back to those setup pages.
- Phone System and Call Tracking operational links belong under Telephony and are admin-only.

## UI Rules

- Use existing Tail Admin classes/components before creating new UI.
- Prefer dense, practical CRM screens over marketing-style panels.
- Tables are the primary view for large datasets.
- Forms for small/medium records should generally open in modals.
- Large forms can use secondary pages.
- Use icon buttons where commands are familiar.
- Keep cards to real repeated items, modals or framed tools.
- Avoid nested cards and decorative-only backgrounds.

## Boilerplate Extension Rules

- Add a Prisma model and migration for new persisted CRM data.
- Add seed data that is idempotent.
- Add server actions for mutations and keep permission checks server-side.
- Update sidebar navigation only for core modules.
- Update this spec and `docs/AI_HANDOFF.md` when the module or architecture changes.
- Run `npm run lint` and `npm run build` before handing off significant changes.

## Reusing As A New Codex Project

Best practice for a new bespoke CRM:

- Copy or clone this boilerplate into a new client-specific project folder.
- Create the new Codex project against that copied folder, not this source boilerplate.
- Keep this boilerplate as the upstream/reference version.
- In the new project, update branding, seed data, environment variables and any client-specific modules.
- Keep `docs/CODE_SPEC.md` in the new project and edit it for client-specific deviations.
- When a useful generic improvement is made in a client project, port it back into this boilerplate intentionally.
- Do not build client-specific assumptions into this source boilerplate unless they should apply to most future CRMs.
