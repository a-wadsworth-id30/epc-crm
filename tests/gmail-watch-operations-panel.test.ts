import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import GmailWatchOperationsPanel from "../src/components/crm-boilerplate/GmailWatchOperationsPanel";

function renderPanel(
  overrides: Partial<Parameters<typeof GmailWatchOperationsPanel>[0]> = {},
) {
  return renderToStaticMarkup(
    createElement(GmailWatchOperationsPanel, {
      available: true,
      authContractMessage: "iD30 Auth CRM contract v1 is compatible.",
      authContractReady: true,
      authPushMessage: "iD30 Auth Gmail push checks pass.",
      authPushReady: true,
      eligibleMailboxCount: 1,
      pushEnabled: true,
      runs: [],
      secretConfigured: true,
      ...overrides,
    }),
  );
}

test("shows the complete Gmail push activation checklist", () => {
  const html = renderPanel();

  assert.match(html, /Auth Pub\/Sub/);
  assert.match(html, /CRM push flag/);
  assert.match(html, /Renewal secret/);
  assert.match(html, /Eligible mailboxes/);
  assert.match(html, /Scheduled hourly/);
});

test("keeps polling fallback visible while Auth push is not ready", () => {
  const html = renderPanel({
    authPushMessage: "iD30 Auth needs GMAIL_PUBSUB_TOPIC_NAME.",
    authPushReady: false,
  });

  assert.match(html, /Polling fallback active/);
  assert.match(html, /iD30 Auth needs GMAIL_PUBSUB_TOPIC_NAME/);
  assert.doesNotMatch(html, /projects\/.*\/topics/);
});

test("requires a connected sync-enabled mailbox before activation", () => {
  const html = renderPanel({ eligibleMailboxCount: 0 });

  assert.match(
    html,
    /Reconnect and enable sync for at least one Gmail mailbox/,
  );
  assert.match(html, /0 connected, sync-enabled mailboxes/);
  assert.match(html, /Polling fallback active/);
});
