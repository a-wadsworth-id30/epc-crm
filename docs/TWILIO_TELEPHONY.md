# Twilio Telephony

## Purpose

Twilio powers voice, SMS and future WhatsApp workflows in the CRM. Voice is live and should be treated as chargeable.

## Configuration

Twilio settings are stored in `IntegrationConnection` with provider `twilio`.

Managed fields include:

- Account SID
- Auth Token, encrypted
- API key SID
- Client Secret, encrypted
- TwiML App SID
- Messaging Service SID
- SMS from number
- WhatsApp sender
- Voice caller ID
- Voice Intelligence Service SID
- Webhook base URL
- enabled capabilities

Required environment:

```text
CREDENTIAL_ENCRYPTION_KEY
APP_BASE_URL=https://crm[.]epc-improvements[.]co[.]uk
```

The webhook base URL in Twilio config should be:

```text
https://crm[.]epc-improvements[.]co[.]uk
```

## Main User Surfaces

- Sidebar: `Telephony > Phone System`
- Sidebar: `Telephony > Call Tracking`
- Phone System tabs: Overview, Phone numbers, Agents, Teams, Routing & IVR,
  Business hours, Monitoring, Recordings and Phone settings
- Call Tracking tabs: Overview, Number pools, DNI rules, Tracking numbers,
  Diagnostics and Validation
- `Settings > Integrations > Twilio`

Selecting `Telephony` in the left menu opens `Phone System` by default.
Detailed telephony subsections should stay in the page-level tab bars, not in
the left sidebar.

`Telephony > Monitoring` is the operational call view. It contains both live
queue monitoring and the searchable call log at `/telephony/live?view=logs`.
The call log is paginated and row selection updates the selected-call panel
through the Telephony call-log API without a full page refresh. Do not add a
separate top-level Call Log tab unless the navigation model changes.

`Telephony > Recordings` is the recording/transcript settings and analysis
pipeline view. The recordings table is searchable, filterable and paginated.
Individual logged calls can still expose replay, transcript status and AI
summaries from Monitoring.

## Phone Numbers

`Telephony > Phone numbers` manages operational Twilio numbers for main lines,
regional lines and team lines. These records live in `BusinessPhoneNumber` and
are intentionally separate from call-tracking pool numbers.

The page should stay focused on number ownership:

- search for and buy voice/SMS-capable Twilio numbers;
- show whether an active number is covered by the current routing flow or only
  the default inbound route;
- link admins to `Telephony > Routing` for routing changes;
- release a number from Twilio only after an explicit confirmation warning.

UK mobile numbers require an approved Twilio regulatory bundle before purchase.
The phone-number modal can generate and submit a GB mobile bundle through the
Twilio API from CRM-entered business details, then purchase is blocked until
Twilio approves the resulting bundle. Local or national numbers remain the
default quick setup path. If the Twilio account already has submitted bundles,
the modal can reuse existing End User and supporting-document assignments to
create the GB mobile bundle without retyping the same business details.

When Twilio settings are saved or imported, the configured Voice caller ID is
backfilled into `BusinessPhoneNumber` if it matches an owned number in imported
Twilio inventory. This keeps pre-existing Twilio business numbers visible on
the inventory table.

Do not put routing-rule editors on the Phone numbers page. Future inbound
number-specific routing should be modelled as multiple start points in the
Routing tab, with this page only reflecting whether each number has coverage.

Releasing a business number stops future ownership/rental for that Twilio
number, removes it from the stored Twilio inventory snapshot, and may make the
number unrecoverable.

## Voice Flow

Inbound PSTN calls hit:

```text
POST /api/webhooks/twilio/voice
```

The webhook:

1. Creates/updates `CallLog`.
2. Resolves attribution/contact/opportunity context.
3. Checks business hours.
4. Resolves queue/routing rule.
5. If after-hours and not configured to queue, plays the after-hours path.
6. Otherwise places the caller into a conference with a queue `waitUrl`.

All public Twilio webhook handlers must validate `X-Twilio-Signature` through
`src/lib/telephony/twilio-webhooks.ts` before trusting form, JSON or query
payload values. The helper uses the saved encrypted Twilio Auth Token and the
configured public webhook base URL, falling back to `APP_BASE_URL` and the
request origin for local/dev compatibility.

Queue wait URL:

```text
POST /api/webhooks/twilio/voice/queue
```

The queue route:

1. Finds available agents via `findAvailableQueueAgents`.
2. Creates Twilio agent call legs.
3. Updates `CallQueueEntry`, `CallLog` and agent availability.
4. Retries until max attempts.
5. Creates a missed-call follow-up and, when the queue fallback is `VOICEMAIL`, redirects the caller to voicemail.

Missed-call follow-up tasks should read as agent work, not call-log entries.
Use `Return missed call from {number}` as the task title. Only one open
return-call task should exist per caller number; later missed attempts refresh
the existing task with the latest call SID, count and due date. Open missed-call
tasks are automatically marked done once a successful follow-up conversation is
seen, either from a completed call with enough duration or from a stored
transcript.

Status callbacks:

```text
POST /api/webhooks/twilio/voice/status
```

Recording callback:

```text
POST /api/webhooks/twilio/voice/recording
```

## Routing Rules

Browser/Flex agents are eligible only when:

- `User.status = ACTIVE`
- `User.voiceAvailability = AVAILABLE`
- `User.voiceLastSeenAt` is fresh
- `User.voiceExtension` exists
- the browser/desktop softphone has kept its Twilio Voice SDK device
  registered recently enough to refresh the availability heartbeat
- queue assignment allows the user
- not force-unavailable
- below max concurrent live calls

`Telephony > Users & Extensions` should stay table-led. Show each agent's
presence, target, teams, capacity and last seen state in the table, then edit
phone targets, manual availability, queue membership and routing eligibility in
a per-agent modal.

Non-browser routes use SIP, landline or mobile depending on `voiceRoutingMode`.

Browser softphones should not be marked offline merely because the CRM dashboard
tab is hidden. The `/softphone-window` route can keep the browser heartbeat
alive while it remains open; unload/page exit is what sends `OFFLINE`.
Normal CRM tabs pause passive desktop-softphone presence reads while hidden and
resume on focus/visibility. The standalone softphone window still sends its
presence heartbeat while open so routing can continue to see the desktop client.
Agents can manually select `BUSY` when they are unavailable at their desk; the
softphone must not treat manually selected busy as stale call state or
immediately reset it to available.
Multiple softphone windows may be open for the same user. Background heartbeat
updates should refresh `voiceLastSeenAt` and read back the shared availability,
but must not write `AVAILABLE` over a manual `BUSY` or `AWAY` selected in
another window.
The availability heartbeat is deliberately tied to Twilio Voice SDK
registration. If an available browser client becomes unregistered, the
softphone should try to re-register automatically before refreshing
routeability. Near-instant Twilio `no-answer` or failed browser client legs are
treated as stale registration signals; the server marks that endpoint offline
until the client self-heals and registers again.

When an inbound caller number does not match an existing contact or open sale,
the softphone's Call context panel exposes `Generate lead`. That action creates
a contact plus LEAD-stage sales opportunity, links the active `CallLog`,
`CallQueueEntry` and any phone attribution records to the new sale, then
refreshes the panel so the agent can open the sale workspace for product
assignment and discovery.

Routing-rule ring strategy overrides the queue default when the rule is not
`QUEUE_DEFAULT`. General inbound calls are intended to use round robin, so the
queue metadata includes the selected `routingRingStrategy` and the router uses
recent queue attempts to rotate eligible agents.

Admins manage routing rules through a SmartFlow-style preview and full-screen
editor in `Telephony > Routing`. The editor persists richer call-flow nodes and
explicit edges as `routingFlow`, including shared destinations where multiple
paths can converge on the same team, voicemail or end-call node. The Twilio
inbound resolver reads supported graph nodes first and falls back to
`routingRules` if the graph cannot safely resolve a route.

Reusable `If / else` nodes store structured condition data in node `data` JSON.
Supported condition types are: always match, known CRM contact, contact has
open lead, has attribution data, tracking number call, inbound number, lead
source and campaign. Value-based conditions support contains, equals, starts
with and ends with. These conditions are evaluated during initial inbound
routing and again while the queue wait URL advances through no-answer, wait,
audio, IVR and fallback paths.

The full-screen routing canvas supports dragging node cards, plus-node
insertion, branch handles and a right-side inspector. Node dragging uses pointer
capture plus window-level pointer handling so the card continues moving during
fast drags or when the pointer crosses the side panel. Connector arrows should
leave from the visible branch/plus handle and shared destinations should spread
incoming arrows across separate target ports. The toolbar includes `Tidy flow`
to restore the clean default caller journey layout. New routing actions should
be modelled as a configurable `Route to` node rather than separate palette
items for every destination type. `Route to` can target the open-sale owner, a
specific individual, or a team. The default open-sale owner step
uses `Route to` with target `Sales agent from open sale`; the older
`Route to sale agent` node is legacy-supported but should not be used for new
default editor flows.

The routing editor includes a non-live `Test flow` panel. It walks the saved
graph with mocked caller context such as known contact, open lead, attribution,
tracking number, source and inbound number. It must not be treated as a Twilio
call test; it exists to let admins check branch logic before publishing.

The live Smartflow runtime supports the caller journey nodes used by the
current editor: inbound call, contact-in-open-sale conditions, sale-agent owner
routing, configurable Route to actions, business-hours and time/date branching,
audio message, IVR menus, redirect, wait, team ringing, voicemail and end-call.
`Route to sale agent` and `Route to` with target `Sales agent from open sale`
are owner-only; if the owner rejects, times out or is unavailable, the queue
webhook advances through that node's no-answer connector instead of ringing
other agents from the same queue. `Route to` with target `Specific individual`
uses the same preferred-agent mechanism and also follows the no-answer
connector if that person is unavailable.

Routing decisions and queue movement are recorded in metadata under
`routingTransitions`. The live routing diagnostics panel reads that trail to
show route source, current node, wait, agent invite, no-answer, fallback and
error events.

Audio-message and IVR waitUrl responses use valid TwiML verbs (`Say`, `Gather`
and `Redirect`). IVR nodes expose structured keypad options with a key, label,
optional per-key message and destination. Digit branches are followed by
handles such as `digit:1`, `key:1` or `1`; if an option has a message, the
queue wait URL plays it before advancing to that option's destination. Timeout,
invalid-input, after-retries, retry message, text-to-speech voice/language and
audio reference fields are also editable. DTMF analytics and managed audio
uploads are UI placeholders until routing transition data and media storage are
expanded. Voicemail and external redirect actions update the live caller
leg via the Twilio REST API rather than returning unsupported waitUrl verbs.
Voicemail and missed-call fallbacks close the CRM `CallLog` as `NO_ANSWER` so
stale live-call rows do not keep agents looking busy.

A true sale-owner routing test requires the inbound caller number to match
`Contact.phone` and that contact to have exactly one open sale. Calling from an
unlinked tracking number exercises general queue routing and round-robin
selection instead.

If an agent rejects a browser softphone invite before answering, the caller
stays in the queue and that agent is excluded from the next attempt for the
same call.

When an inbound call matches a single open sale, the sale owner is stored as
the preferred agent for that call. If that owner is available and has a valid
telephony target, they get first refusal before the queue's normal strategy is
used. For browser owners, first-refusal eligibility is based on a fresh
heartbeat, valid extension, force-unavailable setting and live call count; a
stale `BUSY` flag alone must not send the call to another agent. If they reject
or are genuinely unavailable, normal queue routing continues.

If that rejection leaves no other eligible agents for the same queued call, the
queue sends the caller to voicemail immediately instead of waiting for the full
retry window.

Each call team/department has a `holdAudio` setting. `RING` is the default and plays the
CRM-generated ringback WAV from `/api/twilio/voice/audio/ring`; `MUSIC` plays
Twilio-hosted hold music.

When an agent leg is already ringing, the Conference `waitUrl` should return
wait media such as `Play` or `Say`, then redirect after the media has played so
ringback continues and rejected calls can move to the next queue attempt.

The queue wait URL must treat `MISSED`, `ABANDONED` and `COMPLETED` queue
entries as terminal. Twilio can call `waitUrl` once more after a reject or
conference lifecycle event; terminal entries should return harmless TwiML and
must not create new agent legs.

When the `customer` conference participant leaves before an agent answers, the
status webhook must treat the queue as abandoned, close the call log, cancel
any pending agent call legs and release attempted agents back to available.

Queue `waitUrl` redirects must always be built from the configured public
webhook base URL, normally `https://crm[.]epc-improvements[.]co[.]uk`. Do not use `request.url`
for Twilio redirects; reverse proxies can expose internal URLs such as
`https://0.0.0.0:3000/...`, causing Twilio Debugger error `11200` and the
caller-facing "application error" message.

Conference status callbacks should not by themselves mark a waiting queue
entry completed. Only the actual caller leg ending should complete the queue;
agent-leg terminal statuses should release the agent and put the queue back
into `WAITING` when the call was not answered.

Cold transfers keep the customer in the same Conference while the original
agent leaves and the target agent joins. The original agent's terminal status
callback must not complete the `CallLog` or queue entry while transfer metadata
has a pending target leg. Transfer-created agent legs must include the normal
voice status callback and browser softphone context (`CallLogId`,
`OriginalCallSid`) so recovery and call ownership update correctly.

## Business Hours

If no saved phone-system config exists, defaults apply:

- timezone: `Europe/London`
- Mon-Fri open
- start: `09:00`
- end: `17:30`
- after-hours destination: `MISSED_CALL_TASK`

Calls before 09:00 will play the after-hours unavailable message unless business hours or after-hours routing are changed.

## Important Twilio Constraint

Conference `waitUrl` TwiML must not return invalid verbs such as `<Hangup>`.

Allowed waitUrl responses should use `Say`, `Play`, `Pause` or `Redirect`. If the CRM needs to end the queued caller or send them to voicemail, return valid wait TwiML and complete or redirect the call via REST.

## Voicemail And Recordings

After-hours voicemail uses Twilio `<Record>` directly from the inbound voice
webhook.

In-hours queue voicemail is triggered after the queue reaches max attempts and
the queue fallback destination is `VOICEMAIL`. Because conference `waitUrl`
cannot return voicemail recording TwiML directly, the queue handler redirects
the live caller to voicemail via Twilio REST.

Rejected pre-answer calls with no remaining eligible agents also go straight to
queue voicemail, even if the existing saved queue config still has the older
missed-task fallback.

When a queue fallback points to another queue, the queue handler tries that
fallback queue before going to voicemail.

Recording callbacks are handled at:

```text
POST /api/webhooks/twilio/voice/recording
```

The callback stores `recordingSid` and `recordingUrl` on `CallLog`, creates a
sales communication with a playback URL, and queues transcript generation when
enabled. Current playback is proxied from Twilio through
`/api/twilio/voice/recordings/<recordingSid>`, which must authorize the current
CRM user with `authorizeCallRecordingAccess` before fetching the audio. The
phone-system config has a `recording.storage` option for `TWILIO` or `R2`, but
R2 archiving is not yet implemented.

The Voice Intelligence service is managed by Settings > Integrations > Twilio.
The CRM-managed voice setup action creates or updates the service via Twilio's
API, saves the returned `GA...` Service SID, and points transcript callbacks at:

```text
POST /api/webhooks/twilio/voice/transcript
```

The service keeps `AutoTranscribe` disabled. The CRM queues transcripts
deliberately from stored recording SIDs so recording/transcript policy stays
under CRM control and duplicate transcription charges are avoided.

## Debugging Checklist

1. Check the latest `CallLog` and `CallQueueEntry` metadata.
2. Check `afterHours`, `queueId`, `routingRuleId`, attempts and `queueError`.
3. Check agent availability and heartbeat freshness.
4. Query Twilio call resource by SID.
5. Query Twilio Monitor Alerts for recent webhook/TwiML errors.
6. Verify live deployment freshness on Netlify.

Useful local command pattern:

```bash
npx tsx -r dotenv/config -e '/* read-only Prisma diagnostic */'
```

Do not print full phone numbers, Twilio tokens, API secrets or database URLs in chat.

## Known Production Incidents

- Stale `IN_PROGRESS` call rows previously blocked routing. Routing now counts only recent live calls.
- Conference queue `waitUrl` previously returned `<Hangup>` and triggered Twilio error `13238`. The queue route now returns valid wait TwiML and completes terminal calls via REST.
- Calls before business hours can correctly produce the unavailable message.

## Change Safety

For telephony changes, run:

```bash
npm run typecheck
npm run lint
```

Also test with a real call only when explicitly requested, because calls may cost money and may affect live users.
