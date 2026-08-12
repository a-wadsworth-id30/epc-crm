import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mergeContactEmailMethods,
  mergeContactPhoneMethods,
  parseContactEmailMethodsFormValue,
  parseContactPhoneMethodsFormValue,
} from "../src/lib/contact-methods";

describe("contact methods", () => {
  it("parses additional emails and deduplicates against the primary email", () => {
    const parsed = parseContactEmailMethodsFormValue(
      JSON.stringify([
        { label: "Work", email: " SECONDARY@example.com " },
        { label: "Personal", email: "primary@example.com" },
        { label: "", email: "billing@example.com" },
      ]),
      "primary@example.com",
    );

    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.deepEqual(parsed.items, [
      { label: "Work", email: "SECONDARY@example.com" },
      { label: "Other", email: "billing@example.com" },
    ]);
  });

  it("rejects invalid additional email addresses", () => {
    const parsed = parseContactEmailMethodsFormValue(
      JSON.stringify([{ label: "Work", email: "not-an-email" }]),
      null,
    );

    assert.equal(parsed.ok, false);
  });

  it("normalizes additional phone numbers and deduplicates primary numbers", () => {
    const parsed = parseContactPhoneMethodsFormValue(
      JSON.stringify([
        { label: "Mobile", phone: "0044 7394 486272" },
        { label: "Work", phone: "020 7946 0000" },
      ]),
      "07394 486272",
    );

    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.deepEqual(parsed.items, [
      {
        label: "Work",
        phone: "020 7946 0000",
        phoneNormalized: "+442079460000",
      },
    ]);
  });

  it("preserves duplicate primary methods as secondary values during merge", () => {
    assert.deepEqual(
      mergeContactEmailMethods({
        duplicateEmail: "duplicate@example.com",
        duplicateMethods: [{ label: "Accounts", email: "accounts@example.com" }],
        mergedPrimaryEmail: "primary@example.com",
        primaryMethods: [{ label: "Work", email: "support@example.com" }],
      }),
      [
        { label: "Work", email: "support@example.com" },
        { label: "Other", email: "duplicate@example.com" },
        { label: "Accounts", email: "accounts@example.com" },
      ],
    );

    assert.deepEqual(
      mergeContactPhoneMethods({
        duplicateMethods: [{ label: "Home", phone: "01904 111111" }],
        duplicatePhone: "020 7946 0000",
        mergedPrimaryPhone: "07394 486272",
        primaryMethods: [{ label: "Work", phone: "01632 960000" }],
      }).map((method) => ({
        label: method.label,
        phone: method.phone,
        phoneNormalized: method.phoneNormalized,
      })),
      [
        {
          label: "Work",
          phone: "01632 960000",
          phoneNormalized: "+441632960000",
        },
        {
          label: "Other",
          phone: "020 7946 0000",
          phoneNormalized: "+442079460000",
        },
        {
          label: "Home",
          phone: "01904 111111",
          phoneNormalized: "+441904111111",
        },
      ],
    );
  });
});
