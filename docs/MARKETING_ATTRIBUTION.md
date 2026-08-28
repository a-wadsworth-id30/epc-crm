# Marketing Attribution

## Purpose

The marketing attribution layer captures website session/source data and links form leads and phone calls back to advertising and traffic sources.

## Main User Surfaces

Sidebar navigation:

- `Marketing`
- `Tracking Engine`

The detailed Marketing areas and Tracking Engine settings appear as horizontal
page-level tabs inside those sections rather than as nested left-menu items.

Current route mapping uses dedicated Marketing and Tracking Engine routes:

- Dashboard/reporting overview: `/marketing`
- Attribution Reports: `/marketing/attribution-reports`
- Lead Sources: `/marketing/lead-sources`
- Ad Platforms: `/marketing/ad-platforms`
- Conversion Reporting: `/marketing/conversion-reporting`
- Offline Campaigns setup: `/marketing/offline-campaigns`
- Offline Media: `/marketing/offline-media`
- Sales Quality: `/marketing/sales-quality`
- Executive Report: `/marketing/executive-report`
- Tracking script: `/settings/attribution/tracking-script`
- Domains: `/settings/attribution/domains`
- Session settings: `/settings/attribution/session-settings`
- Form tracking: `/settings/attribution/form-tracking`
- Attribution rules: `/settings/attribution/attribution-rules`
- Consent settings: `/settings/attribution/consent-settings`
- Debug logs: `/settings/attribution/debug-logs`
- Call tracking/DNI setup: `/telephony/call-tracking`
- Marketing integrations overview: `/settings/integrations`
- Marketing integration provider setup:
  `/settings/integrations/google-analytics`,
  `/settings/integrations/google-search-console`,
  `/settings/integrations/google-ads`,
  `/settings/integrations/bing-ads`,
  `/settings/integrations/klaviyo`,
  `/settings/integrations/linkedin-ads`,
  `/settings/integrations/meta`

Legacy `/marketing/integrations` and `/marketing/integrations/[provider]`
links redirect to the matching Settings integration routes.

Legacy `/marketing?view=...` report links remain supported, but navigation and
search should use the dedicated `/marketing/[report]` routes.

Legacy `/settings/attribution?section=...` links redirect to the matching
dedicated route. Legacy `/settings/call-tracking?section=...` links redirect
to the matching `/telephony/call-tracking/...` route.

## Website Script

Install on lead-generation websites:

```html
<script src="https://crm.epc-improvements.co.uk/attribution.js" data-id30-attribution defer></script>
```

The admin install checker fetches candidate websites from the CRM server. In
production it only checks public HTTPS URLs, validates DNS results before
connecting, rejects localhost/private/reserved destinations and revalidates
each redirect target. The optional browser runtime check applies the same
network guard to page subrequests.

Runtime settings are fetched from:

```text
GET /api/attribution/config
```

The config response uses the current request host for `apiBase`, so browser
lead, phone-number and debug calls stay on the same CRM custom domain that
served the script configuration.

Admins can enable or disable the script features from `Settings > Attribution`:

- attribution capture;
- automatic form lead capture;
- hidden `crm_attribution` field injection;
- dynamic phone-number assignment;
- `tel:` link replacement;
- visible phone-number text replacement.

Admins can also tune session behaviour from `Settings > Attribution > Session
Settings`, including dynamic-number assignment duration, browser timeline cap
and referrer capture.

Consent Settings records client rollout readiness without replacing legal
advice. Admins can save whether the legal basis was confirmed, privacy policy
updated, consent banner connected and domain registry reviewed, with reviewer,
date and notes captured alongside the runtime consent gate.
Consent Settings can also enable an optional built-in fallback consent prompt
from the attribution script. The prompt is disabled by default, only appears
when consent is required, and should remain off when the client already has a
cookie banner or consent management platform wired to `grantConsent()` and
`revokeConsent()`. Operators can tune its placement, light/dark/auto/custom
theme, size, corner radius and safe hex colour overrides to better match the
client website when the fallback prompt is used. Auto theme follows the visitor
browser or operating-system colour-scheme preference.

Attribution domains are managed in `/settings/attribution/domains`. This is a
coverage registry for expected production, staging, development and microsite
domains. When the registry has entries, `/api/attribution/config` only enables
tracking for active registered domains. Public write endpoints such as
`/api/attribution/lead`, `/api/attribution/phone-number` and
`/api/attribution/debug` use the same registry and reject inactive,
unregistered or unknown origins once any domain is registered. Inactive or
unlisted domains receive a disabled script configuration. Local development
hosts such as `localhost` are only enabled automatically while the registry is
empty; once domains exist, `localhost` must be registered and active like any
other hostname. Requests without a usable `Origin` or `Referer`, requests with
mismatched origin/referrer hostnames, and requests made while the domain
registry table is unavailable fail closed.

The script captures:

- UTM fields
- Google click identifiers
- Meta, Microsoft, TikTok and LinkedIn click identifiers
- first touch
- last touch
- interaction timeline

The CRM also records coarse request location on attribution snapshots. On
Netlify, the `attribution-geo` Edge Function runs for `/api/attribution/*` and
passes `context.geo` fields into the Next.js attribution handlers through
normalized internal request headers. The handlers also understand common
hosting/CDN geo headers, then can fill missing fields from a configured
server-side IP geolocation endpoint when `ATTRIBUTION_IP_GEOLOCATION_URL` is
set and the request IP is public. Stored fields can include city, region,
country, country code, timezone and the location source. This is passive
server-side location only; the tracking script does not request browser GPS
permission and the CRM does not use a hardcoded city fallback.

`ATTRIBUTION_IP_GEOLOCATION_URL` may include an `{ip}` placeholder, for example
`https://geo.example.com/{ip}`. If no placeholder is present, the CRM appends an
`ip` query parameter. The endpoint should return JSON with common fields such
as `city`, `region` or `region_name`, `country_name`, `country_code` and
`timezone`.

Visitor snapshot location is merged over time. A later request with missing geo
fields does not clear a previously known city, region, country or timezone; a
later request with new fields fills or improves the stored location.

Attribution snapshots also store denormalized source fields derived from
first/last-touch parameters: source, medium, campaign, ad provider and click ID.
The raw touch JSON remains the audit source, while these indexed fields support
database-backed filtering and pagination in Marketing > Visitor log.
Visitor Log paid-search and paid-social buckets should require paid evidence
such as an ad provider, paid click ID or paid medium; a referrer/source such as
Google, Facebook or LinkedIn on its own should be treated as referral/organic
traffic rather than paid advertising.

Attribution confidence scoring is calculated from captured evidence rather than
stored as a separate schema field in version one. The shared helper rates
attribution as `High`, `Medium`, `Low` or `Unknown` using click IDs, source,
campaign, landing page, journey timeline, conversion evidence, CRM match and
consent evidence where consent is required. UI surfaces should show the
simplified confidence level to client-facing users and reserve detailed factor
reasons for internal diagnostics.
Marketing > Visitor log shows the simplified confidence badge, visitor detail
shows the internal factor breakdown, and the visitor CSV export includes the
confidence level, score and client-safe summary. Marketing Lead Sources and
Attribution Reports also show source/campaign-level aggregate confidence by
averaging scored attribution evidence and surfacing the most common missing
signals. The Visitor Log confidence filter is database-backed through the same
version-one evidence buckets so pagination, result counts and CSV exports stay
aligned with the selected confidence level.
Visitor detail can also save point-in-time confidence audit snapshots to
`AttributionConfidenceSnapshot`, preserving the score, level, factor evidence
and client-safe summary for later review.

Marketing Overview includes a fixed version-one lifecycle funnel for the
selected reporting range: sessions, leads, qualified pipeline, proposals, won
deals and revenue. The funnel shows count, conversion rate, drop-off rate,
value and cost where imported spend is available. Qualified pipeline uses the
`QUALIFIED` stage or later, proposals use `PROPOSAL` or later, and won/revenue
only count `WON` opportunities.

Lead Sources now reports lead quality by source as well as volume. Source rows
include qualified count, proposals, won deals, close rate, open and weighted
pipeline, won revenue, average lead value, cost per qualified lead and cost per
won deal when imported spend exists.

Conversion Reporting now includes operator-facing upload feedback for prepared
lifecycle conversion rows. The page summarises pending, sent, failed and
skipped uploads, highlights recent rows that need attention, shows match rate,
provider mapping rate, upload success rate, provider coverage and rejection
categories, shows preparation and dry-run job messages, and explains the next
action for each queued provider conversion row. Recent rows are classified by
normalized category and severity so provider setup, attribution evidence,
mapping and provider-response issues are easier to triage. Version one remains
manual/dry-run first until scheduled processing is explicitly enabled. The
Netlify scheduled function `process-conversion-uploads` is disabled by default;
when `MARKETING_UPLOAD_CRON_ENABLED=true` and `MARKETING_UPLOAD_CRON_SECRET` is
configured, it can prepare lifecycle upload rows and call the protected upload
processor automatically. Use `MARKETING_UPLOAD_CRON_DRY_RUN=true` for scheduled
inspection without provider sends.

Marketing provider setup forms are selector-ready for stored provider metadata.
`IntegrationConnection.config.selectorOptions` can hold discovered accounts,
manager accounts, Search Console sites, Klaviyo lists/campaigns/flows/forms,
pixels, tags, events and conversion objects; the Google Ads, Google Search
Console, Klaviyo, Bing Ads, LinkedIn Ads and Meta setup fields expose those
values through searchable browser selectors while still accepting manual IDs.
When Google Ads, Bing Ads, LinkedIn Ads or Meta conversion mappings are saved
or auto-mapped during selector refresh, pending conversion-upload rows are
remapped to the latest provider conversion target so queued uploads do not stay
attached to stale conversion IDs.
Provider setup is
client-login first after iD30 has provisioned the central Auth broker for the
CRM instance. The Auth broker connection is hidden from the normal integrations
grid because clients should not need Auth dashboard access. iD30 can still use
the internal `/settings/integrations/id30-auth` route to save setup-code,
manual or bootstrap broker details instead of editing environment variables.
The saved broker config is used before environment-variable fallback values
such as `ID30_AUTH_BASE_URL`, `ID30_AUTH_CRM_CLIENT_ID` and
`ID30_AUTH_SHARED_SECRET`. Once the broker is configured, CRM redirects
provider OAuth starts to the central iD30 Auth broker at `auth.id30.com`. Auth
sends signed completion callbacks to
`POST /api/integrations/oauth/complete`; CRM verifies the shared HMAC
signature, checks the CRM client/workspace IDs and stores the Auth connection
ID, callback status and cached selector options in
`IntegrationConnection.config.authBroker`. Manual access tokens, refresh tokens,
developer tokens and OAuth app fields remain available only in a shared
advanced fallback panel for edge cases. Provider setup pages distinguish Auth
provider access from direct CRM upload credentials: completed Auth login enables
account mapping and selector refresh. Refreshing selectors for Auth-connected
providers now calls the signed Auth server refresh API first, lets Auth
rediscover selectors with its stored provider access token and updates the CRM
cache from the returned Auth-owned selector data; the older local-token provider
refresh remains as a fallback for manually configured connections. Direct
conversion-upload dry runs can now ask Auth to inspect provider readiness for
Auth-connected providers without sending provider requests. Auth-connected
Meta, Google Ads, Bing Ads and LinkedIn Ads live conversion sends now use the
signed Auth send endpoint, keeping provider credentials in Auth; JSON request
bodies sent to Auth include `x-id30-content-sha256`, every signed Auth broker
API call includes `x-id30-crm-request-id`, and the HMAC signature binds the
request id plus body digest to the canonical payload so Auth can reject replayed
requests. Manually configured fallback connections still use local encrypted
credentials.
Google Ads, Bing Ads, LinkedIn Ads and Meta provider setup pages also expose a
provider-scoped dry-run action in Sync history. The action filters the
conversion-upload inspection to that platform and records a sync-history row
even when no conversions are currently queued, so setup gaps are visible from
the provider page. Auth-managed ad platform setup pages also expose a switch
account action for wrong-account connection attempts. The reset asks Auth to
disconnect the central provider connection, then clears CRM's Auth connection
pointer, cached selector options and saved account mapping so the admin can
reconnect with the correct provider login. LinkedIn Ads account mapping can
also be intentionally saved as blank; this keeps setup in the mapping-needed
state instead of silently reusing a stale account.
Broker provisioning is owned by iD30. If broker credentials are missing,
provider pages show an iD30 setup-required state instead of sending clients to
the Auth dashboard. The internal bootstrap flow can redirect an iD30 operator
to Auth with the current CRM origin and callbacks, then return a short-lived
encrypted code that CRM exchanges server-side for the broker setup details.
CRM now also calls Auth's signed `/api/crm/providers` readiness endpoint before
an Auth-connected provider has a saved connection, so Test connection can
report whether the central Auth provider app is ready or which non-secret Auth
env keys iD30 still needs to configure.
CRM provider pages also call Auth's signed
`/api/crm/providers/[provider]/diagnostics` endpoint for Auth-managed ad
providers when the broker is configured. The page renders a process log with
safe success/error/needed checks for the signed CRM request, Auth app
readiness, provider approval, stored Auth connection, CRM completion callback,
selector discovery and CRM-local mapping/upload state. The diagnostics payload
does not include OAuth tokens, app secrets, encrypted credential blobs or raw
provider responses.
Broker client/workspace identifiers must be exact Auth-issued values rather
than wildcard placeholders, and browser-started OAuth return URLs use the
current CRM request host instead of an environment-only base URL.
Provider setup pages show a wizard-style sequence and current next action for
platform readiness, client login, selector refresh, account selection and
conversion mapping. The provider Test connection action performs a read-only
CRM/Auth status check for Auth-managed providers by reading the stored Auth
connection and cached selectors; direct fallback providers still call
lightweight account/property/list endpoints when credentials are available.
Refresh options remains the action that calls Auth's selector refresh endpoint
and updates the CRM selector cache. The shared advanced fallback panel labels
the matching server environment keys for OAuth app credentials and developer
tokens without pre-filling secret values into browser-rendered fields. Google
Ads setup can refresh accessible
customer, manager account and conversion action selectors from a workspace or
saved developer token, OAuth refresh token and OAuth app credentials. Bing Ads
setup can refresh accessible account/customer, UET tag and conversion goal
selectors from workspace or saved Microsoft Advertising credentials, then
auto-map account, customer, UET tag and conversion goal fields when one clear
selector match exists. Bing keeps the numeric goal ID for selector/reference
purposes and stores the provider conversion goal name separately because
Microsoft offline conversion uploads require `ConversionName`. LinkedIn
Ads setup can refresh ad account, Insight Tag and conversion rule selectors from
a saved LinkedIn Marketing API access token or OAuth connection, then auto-map
ad account, account name, Insight Tag and conversion rule fields when one clear
selector match exists. LinkedIn OAuth requests the Advertising API scopes by
default; the conversion-write `rw_conversions` scope is only requested when
`LINKEDIN_ADS_REQUEST_CONVERSION_SCOPE=true` is enabled after LinkedIn grants
Conversions API access for the app.
LinkedIn Ads upload readiness can use Auth-managed
provider access, queues lifecycle conversions from captured `li_fat_id` click
IDs and sends live conversion events through Auth once the connected token has
`rw_conversions`, with direct access tokens kept only as an advanced fallback.
LinkedIn Ads cost import uses LinkedIn Ad
Analytics campaign/day rows through the current direct CRM access-token fallback;
central Auth-broker spend import remains a future improvement if we want cost
imports fully brokered too.
Meta setup can
refresh ad account and pixel selectors from the saved Meta access token, then
auto-map ad account, account name and pixel fields when one clear selector
match exists. Meta setup messaging makes the central Auth route explicit: once
iD30 provisions Meta in Auth, clients only click Connect Meta and approve
access, and missing Auth/provider app credentials are presented as an iD30 setup
gap rather than client-entered secrets. Klaviyo is an Email & Automation
provider using the iD30 Auth broker where provisioned. Clients can click
Connect Klaviyo, approve lifecycle marketing access, then CRM can refresh
Auth-owned account/list/campaign/flow/metric/form/segment selectors. Direct
private API keys remain available only as an advanced fallback through an
encrypted saved key or `KLAVIYO_PRIVATE_API_KEY`. `KLAVIYO_API_REVISION`
optionally overrides the API revision (default `2026-07-15`) for the fallback
path. Admins map the account and optional default list, and record campaign,
flow and profile-event import settings. The marketing import worker can import
Klaviyo campaign and flow value-report rows where a matching conversion metric
is available, plus configured metric aggregate event counts for lifecycle
reporting through the Auth-owned Klaviyo reporting endpoint, with direct
fallback credentials kept only for advanced/manual setups. The setup wizard
reports loaded selector options with provider-specific categories so Bing Ads
can show accounts, customers, UET tags and conversion goals separately and
Klaviyo can show accounts, lists, campaigns, flows, metrics, forms and segments.
Google
Ads, Google Analytics, Bing Ads, LinkedIn Ads and Meta OAuth callbacks attempt
an immediate selector refresh after tokens are saved; if provider API
prerequisites are not ready, the setup page keeps the connection and prompts
the admin to refresh selectors later. Google Analytics uses iD30 Auth for
client login and cached GA account/property/web-stream/event selectors where
the broker is configured, while still allowing manual GA4
measurement/property/event mapping for website attribution and direct OAuth as
an advanced fallback. Google Search Console also uses iD30 Auth for client
login and cached verified Search Console URL-prefix/domain property selectors
where the broker is configured, while direct OAuth remains available only as an
advanced fallback. After OAuth, CRM can refresh verified Search Console
properties from Auth or the direct fallback, save the selected property and
record organic performance import settings. The marketing import worker can
import Search Console Search Analytics query/page/date metrics into the shared
provider performance table with zero cost and organic search metadata.
The tracking script itself still only needs the saved GA4 website measurement
mapping.
CRM provider API defaults are pinned to Google Ads `v24`, Meta Graph `v23.0`,
LinkedIn Marketing API `202607` and Klaviyo revision `2026-07-15`, with
environment variables available for deliberate upgrades or rollbacks.

Attribution Reports includes assisted journey reporting. The report uses stored
first touch, timeline and last touch evidence to show first-touch, last-touch
and assisted contribution by source, medium and campaign. Assisted credit is
given to middle journey touchpoints.
New attribution captures also write normalized `AttributionTouchpoint` rows for
first, assisted, last and single-touch journeys, linked back to the source
snapshot or conversion record. The raw JSON first-touch, timeline and
last-touch fields remain the compatibility and audit fallback.

Attribution Reports also has an attribution model switcher. Users can rank the
report by first-touch, last-touch, assisted, linear, position-based or
time-decay contribution. The switcher changes the primary lead, journey,
pipeline and revenue columns while keeping the role breakdown visible for
comparison.

Marketing > Visitor log now labels journey roles directly in visitor rows and
visitor detail. The list shows first, assisted and last journey steps, while
the detail timeline marks page events as first touch, assisted touch, last
touch or first + last touch when there is only one captured page touch.

Marketing > Visitor log also shows completion fields for each visitor row. The
completion score checks whether source, campaign, click ID, journey, location,
conversion, matched lead, matched opportunity, won sale, consent and device
evidence are present, then highlights the highest-priority missing fields so
operators can quickly see which records need attention. Visitor rows also show
session count, page count, repeat visitor state, consent state and matched
commercial outcome where those can be derived from existing attribution records.
The visitor log uses a table-first layout with compact metrics and a filter
sidebar. Filter changes use client-side route updates so the table refreshes
without a full browser reload, and the visible page periodically refreshes to
surface newly captured visitor sessions for live monitoring.

Marketing includes an Offline Media Report. It reads first-class
`OfflineCampaign` records first, including campaign code, channel/status,
source fields, destination URL, date range, budget/actual cost metadata,
schedule and budget pacing cues, tracking-number assignments, linked
attribution records and normalized touchpoints. It still falls back to
source/campaign metadata when names include offline markers such as radio,
print, event, direct mail, leaflet, QR, poster, offline or manual. Admins
manage offline campaign records at
`/marketing/offline-campaigns`. The setup screen can generate downloadable SVG
and PNG QR artwork from a campaign destination URL plus UTM fields and an
`id30_offline_code` query parameter. QR output supports selectable error
correction, PNG size, margin and foreground/background colours, and the same
screen can assign attribution tracking pool numbers to offline campaigns.
Phone assignment shows campaign coverage metrics and flags active campaigns
that still need an active tracking number.

Marketing includes a Sales Quality Report that groups opportunities by source
and owner. It shows lead volume, qualified leads, proposals, close rate,
average probability, weighted pipeline, won revenue and follow-up gaps such as
missing next step, missing expected close date and stale open opportunities.
It also shows contacted rate, average first-response time, lost reason summary
and average time-to-close where lifecycle/contact history is available.
Sales opportunities now also persist lifecycle event history and denormalized
first-contact, stage-changed, closed and lost-reason fields so reports can
calculate contacted rate, average response time, lost reason and time-to-close
from stored history instead of current-row heuristics.
The Sales Quality view also includes a Pipeline Stage Performance rollup by
custom `SalesPipelineStage`, using the stable legacy bucket only as a fallback,
and a Lifecycle Transition History rollup from stored `SalesLifecycleEvent`
records.

Marketing includes a client-facing Executive Report. It summarises attributed
lead coverage, lifecycle progress, qualified pipeline, proposals, won revenue,
best commercial sources and sales quality in a simplified format that avoids
internal confidence logic, upload queue diagnostics and provider error details.
The Executive Report can open a client-pack print mode at
`/marketing/executive-report?print=1`; admins can use browser print/save-as-PDF
from that pack. It can also download an authenticated standalone HTML client
pack from `/api/marketing/executive-report/client-pack`, preserving a
client-facing summary that can be opened, shared internally and printed to PDF.

Tracking Engine > Debug Logs is backed by stored `AttributionDebugEvent`
records. It shows recent script, config, form, phone and number-assignment
events with filters for domain, event type, level and search text. Config
request rows expose the stored domain allow-list decision, including enabled
versus disabled config, registered versus unregistered host and the recorded
decision reason. Stored debug event history is paginated server-side so
operators can move back through older runtime events without loading the full
debug table into the page. Operators can export stored debug history to CSV for
support handoff and incident review. Debug Logs also supports browser-local
saved incident filters so operators can quickly reapply common domain, event,
level and search combinations during investigations.

## Lead Capture

Endpoint:

```text
POST /api/attribution/lead
```

The endpoint accepts direct attribution JSON or a stringified `crm_attribution` hidden field. Form lead payloads may include explicit `fields`/`formFields` data, mapped name/email/phone/company/message values, and any non-reserved extra payload keys; those are normalised into safe submitted form fields. The tracker and endpoint also promote a valid email from field type, label or captured field metadata when the website form uses generated input names. For multi-step JavaScript forms, the tracker watches same-origin form-like `fetch` and XHR POST requests, including contact/enquiry/project/Plutio endpoints, normalises safe JSON, `FormData` and URL-encoded body fields into submitted fields, and deduplicates that richer payload against any native submit capture. Captured fields are stored on the sales communication metadata and rendered into the inbound conversation body so sales users can see the complete submitted enquiry, not just the mapped message field. When a source maps cleanly to the CRM lead-source dropdown, new captured contacts store it in `Contact.leadSource` and existing contacts keep their current value. The endpoint must enforce the attribution domain registry and bounded request-body parser before creating CRM records.

## Dynamic Number Insertion

Endpoint:

```text
POST /api/attribution/phone-number
```

The script can replace detected phone numbers with an active tracking number from the CRM pool. Assignment windows currently last 30 minutes. The endpoint must enforce the attribution domain registry and bounded request-body parser before assigning or returning tracking numbers.

Inbound calls to tracking numbers are linked to:

- `CallLog.attribution`
- `CallQueueEntry.attribution`
- `AttributionRecord`
- `AttributionDomain`

## Main Files

- `docs/ATTRIBUTION_TRACKING.md`
- `docs/MARKETING_QA_BASELINE.md`
- `src/lib/attribution/tracking.ts`
- `src/app/api/attribution/config/route.ts`
- `src/app/api/attribution/lead/route.ts`
- `src/app/api/attribution/phone-number/route.ts`
- `src/app/(admin)/(home)/marketing/page.tsx`
- `src/app/(admin)/(home)/marketing/[report]/page.tsx` wrappers for
  Attribution Reports, Lead Sources, Ad Platforms, Conversion Reporting,
  Offline Media, Sales Quality and Executive Report
- `src/app/(admin)/(home)/marketing/visitors/page.tsx`
- `src/app/(admin)/settings/attribution/[section]/page.tsx`
- `src/app/(admin)/settings/integrations/page.tsx`
- `src/app/(admin)/settings/integrations/[provider]/page.tsx`
- `src/app/(admin)/(home)/marketing/integrations/page.tsx` (redirect)
- `src/app/(admin)/(home)/marketing/integrations/[provider]/page.tsx` (redirect)
- `src/app/(admin)/telephony/call-tracking/page.tsx`
- `src/lib/marketing/integrations.ts`
- `src/components/crm-boilerplate/AttributionInstallPanel.tsx`
- `src/components/crm-boilerplate/CallTrackingPoolManager.tsx`

## Current Gaps

- No core Phase 1-5 commercial attribution implementation gaps are currently
  documented. Future work should be agreed as new reporting or automation
  requirements emerge.

## Development Rules

- Keep attribution capture provider-neutral.
- Do not connect ad platforms without explicit requirements.
- Do not expose raw visitor identifiers unnecessarily.
- Keep phone-number assignment windows and fallback behaviour documented when changed.
- Update this doc and `docs/PROJECT_STATE.md` for attribution architecture changes.
