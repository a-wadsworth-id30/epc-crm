import test from "node:test";
import assert from "node:assert/strict";
import {
  isLeadSourceValue,
  leadSourceValueFromText,
} from "../src/lib/sales/lead-sources";

test("validates configured lead source dropdown values", () => {
  assert.equal(isLeadSourceValue("Website"), true);
  assert.equal(isLeadSourceValue("Referral"), true);
  assert.equal(isLeadSourceValue("TikTok"), false);
});

test("normalises common attribution source text", () => {
  assert.equal(leadSourceValueFromText("gclid"), "Google Ads");
  assert.equal(leadSourceValueFromText("facebook / paid"), "Meta Ads");
  assert.equal(leadSourceValueFromText("Organic Google search"), "Organic search");
  assert.equal(leadSourceValueFromText("Inbound phone enquiry"), "Phone call");
  assert.equal(leadSourceValueFromText("unknown kiosk"), null);
});
