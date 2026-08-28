# CRM Attribution Tracking

This layer captures raw attribution on lead-generation websites and sends it into the CRM without connecting directly to ad platforms.

## Website Install

Add the script to the website, replacing the domain with the CRM domain:

```html
<script src="https://crm[.]epc-improvements[.]co[.]uk/attribution.js" data-id30-attribution defer></script>
```

The script captures:

- `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`
- `gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`, `ttclid`, `li_fat_id`

It stores first touch, last touch, and a capped interaction timeline in first-party storage. Runtime settings are fetched from the CRM through:

```txt
GET /api/attribution/config
```

The config response sets `apiBase` from the public host that served the config
request. This keeps embedded scripts working on the current CRM custom domain
even if a deployment environment still has an older `APP_BASE_URL` value.

Feature switches are managed in `Settings > Attribution`. The CRM can disable attribution capture, automatic form capture, hidden-field injection, dynamic phone tracking, `tel:` link replacement and visible-number replacement without changing the website script snippet.

Session behaviour is managed in `Settings > Attribution > Session Settings`.
Admins can adjust the dynamic-number assignment window, the browser timeline
cap and whether browser referrers are captured.

When `Require consent before tracking` is enabled, the script waits before
storing attribution IDs, injecting hidden fields, capturing forms or requesting
dynamic phone numbers. Client websites can call `grantConsent()` from their own
banner/CMP. Consent Settings also has an optional built-in fallback prompt for
sites that do not already provide a consent UI; it is off by default and only
appears when consent is required. The fallback prompt supports CRM-managed
placement, light/dark/auto/custom theme, size, radius and safe hex colour
overrides so it can better match the client website. Auto theme follows the
visitor browser or operating-system colour-scheme preference.

## Forms

For normal HTML/Storyblok forms, the script injects a hidden `crm_attribution` field before submit and sends a background lead capture event to the CRM. The website form can continue submitting to its existing destination. The background lead event includes the core CRM fields plus a bounded `fields` array containing safe submitted control names, labels and values; password, hidden, file and sensitive credential/payment-style fields are excluded.

For custom Next.js forms, post directly:

```js
await window.id30Attribution.submitLead({
  name: "Jane Smith",
  email: "jane@example.com",
  phone: "07700 900123",
  message: "I would like a callback",
  fields: [
    { name: "service", label: "Service", value: "Website" },
    { name: "budget", label: "Budget", value: "To be discussed" },
  ],
  source: "Website",
});
```

The CRM endpoint is:

```txt
POST /api/attribution/lead
```

It accepts either `attribution` as JSON or `crm_attribution` as a stringified hidden form value. Additional payload keys and explicit `fields`/`formFields` data are normalised into the inbound sales conversation body and stored on attribution metadata. The endpoint enforces the Attribution Domains registry and rejects inactive, unregistered or unknown origins once any domain has been registered.
Requests without a usable origin/referrer, requests with mismatched origin and
referrer hostnames, and requests made while the domain registry is unavailable
are rejected rather than enabling tracking by default.
Mapped lead fields such as name, email, phone, company and message are also included in the submitted-field body when they are not already present. If a website form uses generated input names, the tracker and endpoint can still promote a valid email from the input type, label or captured field metadata.
For multi-step JavaScript forms that submit through same-origin endpoints, the tracker also watches form-like `fetch` and XHR POST requests such as contact, enquiry, quote, project and Plutio endpoints, normalises safe JSON, `FormData` and URL-encoded body fields, and deduplicates them against native form-submit captures.
On Netlify, `/api/attribution/*` requests first pass through the
`attribution-geo` Edge Function so the lead and phone-number handlers can store
passive coarse location from Netlify `context.geo` when Netlify provides it.

## Dynamic Phone Numbers

The script auto-detects `tel:` links and visible telephone-number text. Explicit `data-crm-phone`, `data-attribution-phone`, `data-crm-tel`, and `data-attribution-tel` markers still work, but are no longer required for normal websites.

The script calls:

```txt
POST /api/attribution/phone-number
```

If an active tracking number exists in the CRM pool, it swaps the visible number and `tel:` link. If the pool is empty, it falls back to the configured Twilio voice caller ID or `NEXT_PUBLIC_DEFAULT_PHONE_NUMBER`. The endpoint uses the same Attribution Domains registry as `/api/attribution/config`.

When consent is required but has not yet been granted, the script can still
perform display-only phone-number replacement. That path does not create browser
visitor IDs, write attribution storage, inject hidden form fields, or track form
submissions; persistent attribution starts only after consent is granted.

## Twilio Number Pool

Tracking numbers are stored in `AttributionPhoneNumber`. Inbound Twilio calls are attributed by the dialled tracking number (`To`) and linked to:

- `CallLog.attribution`
- `CallQueueEntry.attribution`
- `AttributionRecord` with source `PHONE`

The default assignment window is 30 minutes and can be changed in Session
Settings.

Admins can manage the pool in:

```txt
Settings > Attribution
```

The CRM can search Twilio for voice-capable numbers, buy a selected number, configure its Voice webhook to:

```txt
/api/webhooks/twilio/voice
```

and add it to the attribution pool. When the website script swaps a phone number, the selected pool number is assigned to the visitor/session. If that visitor calls the tracking number, the inbound call is matched back to the stored first touch, last touch, timeline, UTM values and ad click IDs.

Removing a number from the CRM pool only marks it inactive in the CRM. It does not release the number from Twilio.
