# Tracking Engine Runbook

## Install A Website

1. Add the client domain in **Settings > Attribution > Attribution Domains**.
2. Confirm the domain is active.
3. Add the snippet from **Tracking Script** to the website:

```html
<script src="https://crm.epc-improvements.co.uk/attribution.js" data-id30-attribution defer></script>
```

4. Run **Check installation** from the Tracking Script page.
5. Use `/attribution-toggle-test.html` for a controlled CRM-side QA check.

## Domain Decisions

The website script calls `/api/attribution/config`.

- Active registered domains receive enabled config.
- Inactive registered domains receive disabled config.
- Unregistered domains are disabled when the registry contains domains.
- Per-domain overrides can change tracking, consent, form tracking, phone tracking and visible number replacement for one domain.

Use **Debug Logs > Config decision simulator** to preview the expected decision.

## Consent

If consent is required globally or for a domain, the script waits before capture, form injection and phone tracking.

Wire the website consent banner to:

```js
window.id30Attribution.grantConsent();
window.id30Attribution.revokeConsent();
window.id30Attribution.hasConsent();
```

## Forms

Automatic form capture is controlled by Tracking Script feature controls and per-domain overrides.

Use `data-crm-no-track="true"` on forms that should never create CRM leads.

Custom forms can call:

```js
await window.id30Attribution.submitLead({
  name,
  email,
  phone,
  message,
  source: "Website",
});
```

## Phone Tracking

Dynamic phone tracking requests `/api/attribution/phone-number`.

The script can:

- update marked phone elements with `data-crm-phone` or `data-attribution-phone`
- replace `tel:` links
- replace visible phone-number text

These behaviours can be controlled globally or per domain.

## Attribution Rules

Rules are CRM-side source resolution rules. The browser script captures raw attribution facts; the CRM applies rules when a form lead is created.

Use **Attribution Rules** to:

- add source override rules
- set priority
- enable or disable rules
- preview recent match counts

## Debug Logs

Debug Logs show runtime events from:

- config requests
- script readiness
- consent checks
- form capture
- phone assignment
- QA toggle checks

Filter by domain, event type, severity, visitor ID or session ID.

## Retention

Session Settings controls retention days.

Manual purge is available in Session Settings. Automated purge is documented in `docs/ATTRIBUTION_RETENTION.md`.

## Production Checklist

Before marking a client site ready:

1. Domain is registered and active.
2. Per-domain overrides are correct.
3. Consent requirement matches the client policy.
4. Browser install check passes.
5. Toggle test page logs a debug event.
6. A test form includes attribution or successfully submits through `submitLead`.
7. Debug Logs show expected config/script/form/phone events.
