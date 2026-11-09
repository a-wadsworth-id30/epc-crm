import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emailDeliveryStatus } from "../src/lib/email/delivery-status";

describe("email delivery status", () => {
  it("describes a CRM Gmail send as accepted rather than delivered", () => {
    assert.deepEqual(
      emailDeliveryStatus({
        direction: "OUTBOUND",
        metadata: {
          acceptedAt: "2026-11-07T12:00:00.000Z",
          sendState: "accepted",
        },
        provider: "gmail",
      }),
      {
        at: "2026-11-07T12:00:00.000Z",
        detail:
          "Gmail accepted the message. Final recipient delivery is not reported by this integration.",
        label: "Accepted by Gmail",
        state: "accepted",
      },
    );
  });

  it("surfaces a retained provider failure with its safe reason", () => {
    assert.deepEqual(
      emailDeliveryStatus({
        direction: "OUTBOUND",
        metadata: {
          failedAt: "2026-11-07T12:01:00.000Z",
          failureReason: "The Gmail connection needs to be reauthorised.",
          sendState: "failed",
        },
        provider: "gmail",
      }),
      {
        at: "2026-11-07T12:01:00.000Z",
        detail: "The Gmail connection needs to be reauthorised.",
        label: "Send failed",
        state: "failed",
      },
    );
  });

  it("does not add delivery state to inbound email", () => {
    assert.equal(
      emailDeliveryStatus({
        direction: "INBOUND",
        metadata: { sendState: "failed" },
        provider: "gmail",
      }),
      null,
    );
  });
});
