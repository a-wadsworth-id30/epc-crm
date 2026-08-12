# AI Handoff

This file is retained for historical handoff context. For new Codex agents and
developers, start with:

- `../AGENTS.md`
- `docs/PROJECT_STATE.md`
- `docs/ARCHITECTURE.md`
- `docs/TWILIO_TELEPHONY.md` for telephony work
- `docs/MARKETING_ATTRIBUTION.md` for attribution work

## System Summary

This is the iD30 CRM live-test implementation copied from the Tail Admin Pro based CRM boilerplate. The active product surface is the authenticated CRM under `src/app/(admin)`. Public signup is disabled and redirects to sign in.

Use this project for live integration testing and client-specific operational assumptions. Port reusable improvements back to `iD30 CRM Boilerplate` intentionally.

## Architecture Overview

- Next.js App Router with server components where possible.
- Tail Admin Pro remains the visual/component base.
- Prisma models define the reusable CRM data foundation.
- Auth is custom and server-side: bcrypt passwords, database sessions, HTTP-only cookies.
- `src/proxy.ts` only checks whether a session cookie exists; the admin layout validates the session against the database.

## Key Files And Folders

- `src/lib/auth.ts`: session creation, lookup, `requireUser()`, `requireAdmin()`.
- `src/lib/actions/auth.ts`: login, logout, profile, password and admin user actions.
- `src/lib/prisma.ts`: Prisma singleton.
- `src/lib/password.ts`: password hashing and policy checks.
- `src/layout/AdminShell.tsx`: authenticated Tail Admin shell.
- `src/layout/AppSidebar.tsx`: CRM-specific navigation with admin-only filtering.
- `src/components/crm-boilerplate`: project-specific reusable UI.
- `prisma/schema.prisma`: CRM data model.
- `prisma/seed.ts`: default admin, sample CRM records and integration placeholders.
- `docs/USER_DOCS.md`: user-facing documentation.

## Auth And Permissions Logic

Users have roles:

- `ADMIN`: full access.
- `USER`: normal CRM access, own profile and password only.

Rules for future agents:

- Do not add public signup unless explicitly requested.
- Do not rely on hidden frontend controls for permission enforcement.
- Use `requireAdmin()` for all admin-only server pages/actions.
- Use `requireUser()` for authenticated server work.
- Password reset request and confirmation use MailerSend plus hashed
  `PasswordResetToken` rows; keep responses privacy-safe and server-side.

## Database Model Summary

- `Company` is the client/company record. The create-company flow can create up to 10 linked contacts in the same transaction, using each contact's role/job title plus the existing contact lead-source field.
- `Contact` optionally belongs to a company. When the Companies module is enabled, the contact form can link an existing `Company` or create a new linked one by name; when the module is disabled, the form stores only plain `Contact.companyName` text and does not create/link `Company` rows. `Contact.role` stores the person's role/job title at that organisation. `Contact.leadSource` stores the normalized "Where did you hear about us?" source used by manual contact creation and cleanly mapped website/phone captures. Contact and company detail pages link back to each other. Contact detail exposes explicit edit, merge and delete actions; merge keeps the viewed contact, moves duplicate-linked leads, communications, calls, notes, tasks, files, attribution records and tags across, fills missing primary fields, and deletes the duplicate.
- `CrmSettings.companiesEnabled` controls whether Companies appears in the sidebar and whether contacts use a searchable company dropdown or a text input.
- `SalesOpportunity` is the sales pipeline record and sale wrapper. It links optionally to company/contact/owner, stores value in `valueCents`, and uses `SalesStage`. Contact detail can open the manual create-lead flow with contact/company details already linked.
- `SalesPipelineStage` is the custom stage foundation. It maps configurable
  stages to the stable `SalesStage` enum bucket; opportunities and lifecycle
  stage events can link to it while reports/conversion uploads keep using the
  bucket. Admins can manage those stage records at
  `/settings/sales-pipeline`. The sales overview uses active custom stages for
  create, bulk update, filter, sort and display flows while keeping the legacy
  bucket synced for reporting.
- `SalesLifecycleEvent` records opportunity creation, stage changes, first-contact events and lost-reason updates. `SalesOpportunity` keeps denormalized lifecycle timestamps (`stageChangedAt`, `firstContactedAt`, `closedAt`) plus lost-reason fields for reporting.
- `SalesCommunication` stores sale-level communication journey events across phone, email, SMS, WhatsApp, notes and system events.
- `ProductCategory` and `Product` are the reusable sales catalogue foundation;
  products can link to an R2-backed `FileAsset` image.
  They are intentionally separate from discovery questions so future client
  builds can extend products into quoting, inventory or production workflows.
- `DiscoveryTemplate`, `DiscoveryQuestion` and `DiscoveryTemplateQuestion`
  define reusable discovery-call question sets. Lead-level templates apply to
  every sale; product/category templates apply when matching products are
  attached to the opportunity. `DiscoveryQuestion.answerMode` controls whether
  the answer is single, capped multiple or unlimited multiple; URL questions
  use this for example-site and competitor-site lists.
- `OpportunityProduct` and `OpportunityDiscoveryAnswer` store selected products
  and captured discovery answers for each sale, with optional product/category
  scoping for product-specific questions.
- `CallLog` stores general phone-system calls and can optionally link to a sale/contact/user. Calls are logged generally first; sale attachment should be explicit or unambiguous.
- Users have telephony profile fields: `voiceRoutingMode`, `voiceExtension`, `sipAddress`, `voiceAvailability`, and `voiceLastSeenAt`.
- `CallQueueEntry` tracks inbound queue state for Twilio-number calls. Queue timeout creates a normal `Task` with `metadata.type = "MISSED_CALL"`.
- `/telephony` is the admin UI for staff phone routing, Twilio readiness, webhook references and recent call logs.
- `/settings/integrations/twilio` is connection-only. Operational Twilio settings belong under Telephony.
- `FileAsset` stores metadata for files held in Cloudflare R2. R2 is the
  default storage integration; R2 credentials are entered in the integration
  card and encrypted before database storage. Record document libraries on
  contacts, companies/customers and sales opportunities group private
  `FileAsset` rows by the optional `documentFolder` slug from the configurable
  `CrmSettings.documentLibrary` template. Future customer-facing upload flows
  should pass the controlled document upload type catalogue from
  `src/lib/document-library.ts`; `record-document-upload` resolves the type to
  the current folder before writing the file metadata. File upload surfaces use
  the shared drag-and-drop multi-file picker; common image/PDF/text previews
  use authenticated media URLs, and `FileAsset.notes` / `FileAsset.tags` carry
  optional document annotations.
- `Note` can belong to a company/contact and is authored by a user.
- `Task` can belong to a company/contact and can be assigned to a user.
- `IntegrationConnection` stores integration state and encrypted provider credentials.
- `AttributionTouchpoint` stores normalized first, assisted, last and
  first-last journey rows linked to attribution snapshots or records. Keep raw
  attribution JSON for audit/fallback, but prefer normalized rows for future
  assisted reporting work.
- `OfflineCampaign` stores offline media campaign metadata and can be linked
  from attribution phone numbers, attribution records and normalized
  touchpoints. Admins manage records and generate QR campaign artwork at
  `/marketing/offline-campaigns`, where attribution tracking pool numbers can
  also be assigned to offline campaigns.
- Scheduled conversion uploads are available through
  `netlify/functions/process-conversion-uploads.mjs`, but the job is disabled
  unless `MARKETING_UPLOAD_CRON_ENABLED=true` and
  `MARKETING_UPLOAD_CRON_SECRET` are configured.
- `AuditLog` exists for future operational logging.

## UI Component Rules

- Use Tail Admin layout/classes/components as the baseline.
- Keep CRM surfaces clean, table-led and operational.
- Settings must remain a submenu, not a single flat page.
- Integrations should use reusable cards with status badges and cog settings modals. Cloudflare R2 and Twilio are real integration cards.
- Real save/delete actions should show toast confirmations and keep save buttons disabled until dirty.

## Testing Strategy

- Cypress covers login, protected route redirects, admin user management visibility and logout.
- Playwright covers smoke checks and documentation screenshots.
- Pytest currently checks project contract files and no public signup link in the active sidebar.

## Known Placeholders

- Company, notes, tasks and sales mutation flows still need bespoke CRUD forms.
- `/sales` currently shows a compact pipeline stage rail and clickable sales cards.
- `/sales/[id]` is the sale detail workspace and contains the read-only communication journey panel for that sale.
- `/products` and `/discovery` are admin-only setup screens for the product
  catalogue and discovery question framework. Products can be added/edited
  with category assignment and image upload; discovery links are read-only
  context there. Discovery owns question/group editing plus product and
  category links. `/questions` redirects to `/discovery` for compatibility.
- Real third-party integrations currently include Cloudflare R2 for storage and Twilio for voice/SMS/WhatsApp settings.
- Twilio browser click-to-call is implemented with the global CRM softphone, `/api/twilio/voice/token`, and `/api/webhooks/twilio/voice`; messaging webhook processing is still planned.
- Twilio voice calls are conference-backed through `/api/webhooks/twilio/voice`, `/api/webhooks/twilio/voice/conference`, `/api/webhooks/twilio/voice/status`, `/api/webhooks/twilio/voice/queue`, and `/api/webhooks/twilio/voice/recording`, with transfer via `/api/twilio/voice/transfer`, warm-transfer completion via `/api/twilio/voice/transfer/complete`, state recovery via `/api/twilio/voice/recover`, and full conference/customer-leg hangup via `/api/twilio/voice/hangup`.
- Browser staff transfers use Twilio Client identities derived from CRM user ids. The softphone registers after login so extension-based browser users can receive transfer calls.
- Recording consent is currently a notice-before-recording implementation (`CallLog.recordingConsent = CONSENTED`). Confirm client-specific legal wording/rules before production use.
- `/sales/[id]` and `/contacts/[id]` now show phone journeys and recording links alongside sale/contact communications.
- Settings > Integrations > Twilio has a CRM-managed voice setup action to create/update the Twilio TwiML App and Voice Intelligence service using stored credentials.
- Settings > Phone System is separate from Twilio credentials because it manages CRM-level staff routing and call-log visibility.
- Password reset email delivery and token confirmation are implemented through
  MailerSend and hashed `PasswordResetToken` rows. Completing a reset updates
  the password, marks tokens used and revokes active sessions.
- Integration credentials are stored encrypted in `IntegrationConnection.config` and require `CREDENTIAL_ENCRYPTION_KEY`.

## Extension Rules

- Prefer simple server actions and server components.
- Add Prisma migrations for schema changes.
- Keep `docs/CODE_SPEC.md` and user-facing docs updated when routes/workflows change.
- Keep this handoff updated for new modules, assumptions and placeholders.
