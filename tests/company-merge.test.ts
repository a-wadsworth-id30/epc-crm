import assert from "node:assert/strict";
import test from "node:test";
import {
  mergedCompanyProfile,
  type CompanyMergeProfile,
} from "../src/lib/companies/merge";

const emptyProfile: CompanyMergeProfile = {
  addressLine1: null,
  addressLine2: null,
  city: null,
  companyTypeId: null,
  country: null,
  county: null,
  domain: null,
  owner: null,
  ownerUserId: null,
  parentCompanyId: null,
  postcode: null,
};

test("company merge keeps primary profile values and fills empty values", () => {
  const result = mergedCompanyProfile({
    primary: {
      ...emptyProfile,
      id: "primary",
      domain: "primary.example",
      ownerUserId: "primary-owner",
    },
    duplicate: {
      ...emptyProfile,
      id: "duplicate",
      addressLine1: "1 Example Street",
      domain: "duplicate.example",
      ownerUserId: "duplicate-owner",
    },
  });

  assert.equal(result.domain, "primary.example");
  assert.equal(result.ownerUserId, "primary-owner");
  assert.equal(result.addressLine1, "1 Example Street");
});

test("company merge promotes the removed parent's parent", () => {
  const result = mergedCompanyProfile({
    primary: {
      ...emptyProfile,
      id: "primary",
      parentCompanyId: "duplicate",
    },
    duplicate: {
      ...emptyProfile,
      id: "duplicate",
      parentCompanyId: "group",
    },
  });

  assert.equal(result.parentCompanyId, "group");
});

test("company merge keeps legacy ownership as one consistent assignment", () => {
  const result = mergedCompanyProfile({
    primary: {
      ...emptyProfile,
      id: "primary",
      owner: "Legacy owner",
    },
    duplicate: {
      ...emptyProfile,
      id: "duplicate",
      owner: "CRM owner",
      ownerUserId: "crm-owner",
    },
  });

  assert.equal(result.owner, "Legacy owner");
  assert.equal(result.ownerUserId, null);
});

test("company merge does not make the retained company its own parent", () => {
  const result = mergedCompanyProfile({
    primary: { ...emptyProfile, id: "primary" },
    duplicate: {
      ...emptyProfile,
      id: "duplicate",
      parentCompanyId: "primary",
    },
  });

  assert.equal(result.parentCompanyId, null);
});
