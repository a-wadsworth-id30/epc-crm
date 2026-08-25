import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPipedriveSaleContext } from "../src/lib/integrations/pipedrive-sale-context";

describe("Pipedrive sale context", () => {
  it("maps lead field definitions and option values into readable custom fields", () => {
    const ratingFieldKey = "abcdef1234567890abcdef1234567890abcdef12";
    const measureFieldKey = "1234567890abcdef1234567890abcdefabcdef12";

    const context = buildPipedriveSaleContext({
      fields: [
        {
          field_type: "enum",
          key: ratingFieldKey,
          name: "EPC rating",
          options: [
            { id: 1, label: "B" },
            { id: 2, label: "C" },
          ],
        },
        {
          field_type: "set",
          key: measureFieldKey,
          name: "Recommended measures",
          options: [
            { id: 10, label: "Solar" },
            { id: 20, label: "Insulation" },
          ],
        },
      ],
      lead: {
        [measureFieldKey]: "10,20",
        [ratingFieldKey]: 2,
        owner_id: { name: "Sales Team" },
        source_name: "Website",
        title: "Kitchen survey",
        value: { amount: 1250, currency: "GBP" },
      },
    });

    assert.equal(context.leadTitle, "Kitchen survey");
    assert.deepEqual(context.customFields, [
      {
        key: ratingFieldKey,
        label: "EPC rating",
        type: "enum",
        value: "C",
      },
      {
        key: measureFieldKey,
        label: "Recommended measures",
        type: "set",
        value: "Solar, Insulation",
      },
    ]);
    assert.equal(
      context.summary.find((item) => item.label === "Value")?.value,
      "GBP 1,250",
    );
    assert.equal(
      context.summary.find((item) => item.label === "Owner")?.value,
      "Sales Team",
    );
  });

  it("keeps non-empty unmapped generated custom fields visible", () => {
    const customFieldKey = "fedcba9876543210fedcba9876543210fedcba98";

    const context = buildPipedriveSaleContext({
      fields: [],
      lead: {
        [customFieldKey]: "Needs survey pack",
        title: "Older lead",
      },
    });

    assert.deepEqual(context.customFields, [
      {
        key: customFieldKey,
        label: "Custom field fedcba98",
        type: null,
        value: "Needs survey pack",
      },
    ]);
  });
});
