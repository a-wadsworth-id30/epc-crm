import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it } from "node:test";
import { verifyGmailPushPayload } from "../src/lib/integrations/gmail-push-contract";

const sharedSecret = "a".repeat(48);
const now = new Date("2026-11-09T12:00:00.000Z");

function signedToken(
  overrides: Record<string, unknown> = {},
  signingSecret = sharedSecret,
) {
  const payload = {
    event: "gmail.history.available",
    version: 1,
    connectionId: "connection-1",
    crmConnectionId: "mailbox-1",
    crmClientId: "epc-crm",
    workspaceId: "epc-production",
    provider: "gmail",
    historyId: "123456",
    messageId: "pubsub-message-1",
    publishTime: "2026-11-09T11:59:30.000Z",
    issuedAt: "2026-11-09T11:59:30.000Z",
    expiresAt: "2026-11-09T12:04:30.000Z",
    ...overrides,
  };
  const payloadSegment = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", signingSecret)
    .update(payloadSegment)
    .digest("base64url");

  return `${payloadSegment}.${signature}`;
}

function verify(token: string, workspaceId = "epc-production") {
  return verifyGmailPushPayload({
    body: { token },
    crmClientId: "epc-crm",
    now,
    sharedSecret,
    workspaceId,
  });
}

describe("Gmail push contract", () => {
  it("accepts a valid signed event for this CRM workspace", () => {
    const result = verify(signedToken());

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.payload.historyId, "123456");
  });

  it("accepts the temporary previous key during a rotation window", () => {
    const previousSecret = "p".repeat(48);
    const result = verifyGmailPushPayload({
      body: { token: signedToken({}, previousSecret) },
      crmClientId: "epc-crm",
      now,
      sharedSecret,
      verificationSecrets: [sharedSecret, previousSecret],
      workspaceId: "epc-production",
    });

    assert.equal(result.ok, true);
  });

  it("rejects a token with an invalid signature", () => {
    const token = signedToken();
    const result = verify(`${token.slice(0, -1)}x`);

    assert.deepEqual(result, {
      ok: false,
      status: 401,
      message: "Signed Gmail event signature is invalid.",
    });
  });

  it("rejects an event for a different CRM workspace", () => {
    const result = verify(signedToken(), "another-workspace");

    assert.deepEqual(result, {
      ok: false,
      status: 403,
      message: "Signed Gmail event does not match this CRM workspace.",
    });
  });

  it("rejects an expired event", () => {
    const result = verify(
      signedToken({
        issuedAt: "2026-11-09T11:50:00.000Z",
        expiresAt: "2026-11-09T11:55:00.000Z",
      }),
    );

    assert.deepEqual(result, {
      ok: false,
      status: 400,
      message: "Signed Gmail event has expired.",
    });
  });
});
