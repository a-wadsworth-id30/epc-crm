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
    toAddress: null,
    userName: null,
    ...overrides,
  };
}

test("imported Gmail sent mail uses a stored recipient before the linked lead", () => {
  const imported = message({ toAddress: "craig@epc-improvements.co.uk" });

  assert.equal(emailOriginLabel(imported), "Gmail");
  assert.equal(
    outboundEmailRoute(imported),
    "Adam Wadsworth → craig@epc-improvements.co.uk",
  );
});

test("CRM-composed Gmail mail remains identified as CRM", () => {
  const crmComposed = message({
    toAddress: "craig@epc-improvements.co.uk",
    userName: "Adam Wadsworth",
  });

  assert.equal(emailOriginLabel(crmComposed), "CRM");
  assert.equal(
    outboundEmailRoute(crmComposed),
    "CRM → craig@epc-improvements.co.uk",
  );
});

test("imported sent mail falls back to the sender address", () => {
  assert.equal(
    outboundEmailRoute(
      message({
        fromName: null,
        toAddress: "craig@epc-improvements.co.uk",
      }),
    ),
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

test("a linked lead matching the sender is not fabricated as the recipient", () => {
  assert.equal(
    emailParticipantRoute(message()),
    "Adam Wadsworth → Recipient unavailable",
  );
});

test("a distinct linked lead remains a valid last-resort recipient", () => {
  assert.equal(
    emailParticipantRoute(message({ contactName: "Craig McAllister" })),
    "Adam Wadsworth → Craig McAllister",
  );
});
