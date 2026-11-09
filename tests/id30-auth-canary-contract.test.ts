import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it } from "node:test";
import { verifyId30AuthCanary } from "../src/lib/integrations/id30-auth-canary-contract";

const secret = "c".repeat(48);
const now = new Date("2026-11-09T16:30:00.000Z");

function token(signingSecret = secret) {
  const payload = Buffer.from(JSON.stringify({
    event: "id30-auth.canary",
    version: 1,
    crmClientId: "epc-crm",
    workspaceId: "epc-production",
    nonce: "c178f65b-4e4b-4b3f-b158-d6cd94923d0e",
    issuedAt: "2026-11-09T16:29:30.000Z",
    expiresAt: "2026-11-09T16:34:30.000Z",
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", signingSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

describe("iD30 Auth canary contract", () => {
  it("accepts a current or overlapping previous signing key", () => {
    const previous = "p".repeat(48);
    const result = verifyId30AuthCanary({
      body: { token: token(previous) },
      crmClientId: "epc-crm",
      now,
      verificationSecrets: [secret, previous],
      workspaceId: "epc-production",
    });
    assert.equal(result.ok, true);
  });

  it("rejects an invalid signature", () => {
    const result = verifyId30AuthCanary({
      body: { token: token("x".repeat(48)) },
      crmClientId: "epc-crm",
      now,
      verificationSecrets: [secret],
      workspaceId: "epc-production",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 401);
  });
});
