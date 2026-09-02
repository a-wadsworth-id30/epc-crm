import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  customerRelationshipStatusOption,
  customerRelationshipStatusOptions,
  defaultCustomerRelationshipStatus,
} from "../src/lib/customer-relationship";

describe("customer relationship status helpers", () => {
  it("defines the manual relationship statuses Craig requested", () => {
    assert.deepEqual(
      customerRelationshipStatusOptions.map((option) => option.label),
      [
        "Prospect",
        "Active customer",
        "Past customer",
        "Lost prospect",
        "Partner",
        "Other",
      ],
    );
  });

  it("defaults new relationship profiles to prospect", () => {
    assert.equal(defaultCustomerRelationshipStatus, "PROSPECT");
    assert.equal(
      customerRelationshipStatusOption(defaultCustomerRelationshipStatus).label,
      "Prospect",
    );
  });
});
