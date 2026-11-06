import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  gmailParticipantAddressesForMatch,
  unambiguousContactId,
} from "../src/lib/integrations/gmail-contact-matching";

describe("Gmail contact matching", () => {
  it("matches one unique contact and refuses shared addresses", () => {
    assert.equal(unambiguousContactId([{ id: "contact-1" }]), "contact-1");
    assert.equal(
      unambiguousContactId([{ id: "contact-1" }, { id: "contact-2" }]),
      null,
    );
    assert.equal(unambiguousContactId([]), null);
  });

  it("uses Reply-To only when an inbound From address is unavailable", () => {
    assert.deepEqual(
      gmailParticipantAddressesForMatch({
        direction: "INBOUND",
        from: "Website enquiry",
        mailboxAddress: "sales@example.test",
        replyTo: "Customer <customer@example.test>",
        to: "sales@example.test",
      }),
      ["customer@example.test"],
    );
    assert.deepEqual(
      gmailParticipantAddressesForMatch({
        direction: "INBOUND",
        from: "Sender <sender@example.test>",
        mailboxAddress: "sales@example.test",
        replyTo: "Different <different@example.test>",
        to: "sales@example.test",
      }),
      ["sender@example.test"],
    );
  });

  it("excludes the connected mailbox while preserving multiple recipients", () => {
    assert.deepEqual(
      gmailParticipantAddressesForMatch({
        direction: "OUTBOUND",
        from: "sales@example.test",
        mailboxAddress: "sales@example.test",
        replyTo: null,
        to: "sales@example.test, One <one@example.test>, Two <two@example.test>",
      }),
      ["one@example.test", "two@example.test"],
    );
  });
});
