import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  customerSalesCategoryForStage,
  customerSalesCategoryOptions,
} from "../src/lib/sales/customer-sales-category";

describe("customer sales category mapping", () => {
  it("keeps customer status separate from reporting stage buckets", () => {
    assert.equal(customerSalesCategoryForStage("LEAD"), "ENQUIRY");
    assert.equal(customerSalesCategoryForStage("QUALIFIED"), "OPPORTUNITY");
    assert.equal(customerSalesCategoryForStage("PROPOSAL"), "OPPORTUNITY");
    assert.equal(customerSalesCategoryForStage("NEGOTIATION"), "OPPORTUNITY");
    assert.equal(customerSalesCategoryForStage("LOST"), "OPPORTUNITY");
    assert.equal(customerSalesCategoryForStage("WON"), "PROJECT");
  });

  it("exposes Craig's three customer statuses", () => {
    assert.deepEqual(
      customerSalesCategoryOptions.map((option) => option.pluralLabel),
      ["Enquiries", "Opportunities", "Projects"],
    );
  });
});
