import assert from "node:assert/strict";
import test from "node:test";
import {
  emailOriginLabel,
  emailParticipantRoute,
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
    fromAddress: "a.wadsworth@id30.com",
    fromName: "Adam Wadsworth",
    toAddress: "craig@epc-improvements.co.uk",
    userName: null,
    ...overrides,
  };
}

test("imported Gmail sent mail uses the real sender and Gmail origin", () => {
  const imported = message();

  assert.equal(emailOriginLabel(imported), "Gmail");
  assert.equal(
    outboundEmailRoute(imported),
    "Adam Wadsworth → craig@epc-improvements.co.uk",
  );
});

test("CRM-composed Gmail mail remains identified as CRM", () => {
  const crmComposed = message({ userName: "Adam Wadsworth" });

  assert.equal(emailOriginLabel(crmComposed), "CRM");
  assert.equal(
    outboundEmailRoute(crmComposed),
    "CRM → craig@epc-improvements.co.uk",
  );
});

test("imported sent mail falls back to the sender address", () => {
  assert.equal(
    outboundEmailRoute(message({ fromName: null })),
    "a.wadsworth@id30.com → craig@epc-improvements.co.uk",
  );
});

test("imported received mail uses stored participants before the linked lead", () => {
  assert.equal(
    emailParticipantRoute(
      message({
        direction: "INBOUND",
        fromAddress: "craig@epc-improvements.co.uk",
        fromName: "Craig McAllister",
        toAddress: "a.wadsworth@id30.com",
      }),
    ),
    "Craig McAllister → a.wadsworth@id30.com",
  );
});

test("stored To display name is preferred over its address", () => {
  assert.equal(
    emailParticipantRoute(message({ toName: "Craig McAllister" })),
    "Adam Wadsworth → Craig McAllister",
  );
});
