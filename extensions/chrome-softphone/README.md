# iD30 CRM Chrome Softphone

This is a Manifest V3 companion extension for the CRM softphone.

The CRM remains the call runtime and Twilio device owner. The extension opens a dedicated CRM-authenticated softphone window at `https://crm.id30.com/softphone-window`, receives softphone state from that page, and sends toolbar or notification commands back to the running softphone.

## Local Install

1. Open Chrome Extensions: `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select this folder: `extensions/chrome-softphone`.
5. Open `https://crm.id30.com` and sign in.
6. Click the extension icon to open the browser-level softphone window.

When the softphone window is open, it keeps the browser softphone available and can be focused from any tab using the extension icon.

## Current Scope

- Opens or focuses the dedicated CRM softphone window from the Chrome toolbar.
- Sends toolbar and notification actions back to the running CRM softphone.
- Shows toolbar badge and Chrome notification for inbound calls.

## Next Scope

- Move from page-bridged commands to a server-backed live call session stream.
- Add click-to-call and number detection outside the CRM.
