import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emailAddresses,
  emailHeaderName,
  firstEmailAddress,
} from "../src/lib/email/addresses";

describe("email address parsing", () => {
  it("extracts and normalizes addresses from provider headers", () => {
    assert.deepEqual(
      emailAddresses('"Craig" <Craig@EPC-Improvements.co.uk>, sales@example.com'),
      ["craig@epc-improvements.co.uk", "sales@example.com"],
    );
    assert.equal(
      firstEmailAddress(null, 'Reply Person <reply@example.com>'),
      "reply@example.com",
    );
  });

  it("extracts a display name without returning the address as a name", () => {
    assert.equal(emailHeaderName('"Craig Smith" <craig@example.com>'), "Craig Smith");
    assert.equal(emailHeaderName("craig@example.com"), null);
  });
});
