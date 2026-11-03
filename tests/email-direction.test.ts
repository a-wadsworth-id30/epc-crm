import assert from "node:assert/strict";
import test from "node:test";
import { inferredEmailDirection } from "../src/lib/email/direction";

test("a sender address belonging to the linked contact is inbound", () => {
  assert.equal(
    inferredEmailDirection({
      contactAddresses: ["adam@example.com"],
      fromAddress: "ADAM@example.com",
      storedDirection: "OUTBOUND",
    }),
    "INBOUND",
  );
});

test("a name-only sender matching the linked contact is inbound", () => {
  assert.equal(
    inferredEmailDirection({
      contactName: "Adam Wadsworth",
      fromAddress: null,
      fromName: "Adam Wadsworth",
      storedDirection: "OUTBOUND",
    }),
    "INBOUND",
  );
});

test("a different sender preserves the stored direction", () => {
  assert.equal(
    inferredEmailDirection({
      contactName: "Craig McAllister",
      fromAddress: null,
      fromName: "Adam Wadsworth",
      storedDirection: "OUTBOUND",
    }),
    "OUTBOUND",
  );
});
