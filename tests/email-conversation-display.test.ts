import assert from "node:assert/strict";
import test from "node:test";
import {
  emailOriginLabel,
  outboundEmailRoute,
  type EmailConversationDisplay,
} from "../src/lib/sales/conversation-display";

function message(
  overrides: Partial<EmailConversationDisplay> = {},
): EmailConversationDisplay {
  return {
    channel: "EMAIL",
    contactName: "Adam Wadsworth",
    direction: "OUTBOUND",
    emailProvider: "gmail",
    fromAddress: "craig@epc-improvements.co.uk",
    fromName: "Craig",
    toAddress: "a.wadsworth@id30.com",
    userName: null,
    ...overrides,
  };
}

test("imported Gmail sent mail uses the real sender and Gmail origin", () => {
  const imported = message();

  assert.equal(emailOriginLabel(imported), "Gmail");
  assert.equal(outboundEmailRoute(imported), "Craig → Adam Wadsworth");
});

test("CRM-composed Gmail mail remains identified as CRM", () => {
  const crmComposed = message({ userName: "Adam Wadsworth" });

  assert.equal(emailOriginLabel(crmComposed), "CRM");
  assert.equal(outboundEmailRoute(crmComposed), "CRM → Adam Wadsworth");
});

test("imported sent mail falls back to the sender address", () => {
  assert.equal(
    outboundEmailRoute(message({ fromName: null })),
    "craig@epc-improvements.co.uk → Adam Wadsworth",
  );
});
