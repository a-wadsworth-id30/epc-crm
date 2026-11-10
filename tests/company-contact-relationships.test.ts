import assert from "node:assert/strict";
import test from "node:test";
import { companyContactLinkDecision } from "../src/lib/companies/contact-relationships";

test("an unlinked person can be linked to a company", () => {
  assert.deepEqual(
    companyContactLinkDecision({
      allowMove: false,
      currentCompanyId: null,
      expectedCurrentCompanyId: null,
      targetCompanyId: "company-b",
    }),
    { ok: true, action: "linked" },
  );
});

test("moving a person between companies requires explicit confirmation", () => {
  assert.equal(
    companyContactLinkDecision({
      allowMove: false,
      currentCompanyId: "company-a",
      expectedCurrentCompanyId: "company-a",
      targetCompanyId: "company-b",
    }).ok,
    false,
  );
  assert.deepEqual(
    companyContactLinkDecision({
      allowMove: true,
      currentCompanyId: "company-a",
      expectedCurrentCompanyId: "company-a",
      targetCompanyId: "company-b",
    }),
    { ok: true, action: "moved" },
  );
});

test("stale company assignments cannot be overwritten", () => {
  const decision = companyContactLinkDecision({
    allowMove: true,
    currentCompanyId: "company-c",
    expectedCurrentCompanyId: "company-a",
    targetCompanyId: "company-b",
  });
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.match(decision.message, /changed/);
});

test("linking to the current company is idempotent", () => {
  assert.deepEqual(
    companyContactLinkDecision({
      allowMove: false,
      currentCompanyId: "company-a",
      expectedCurrentCompanyId: "company-a",
      targetCompanyId: "company-a",
    }),
    { ok: true, action: "unchanged" },
  );
});
