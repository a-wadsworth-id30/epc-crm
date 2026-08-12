import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultSalesKanbanCardFields,
  parseSalesKanbanSettings,
  salesKanbanSettingsToJson,
} from "../src/lib/sales/kanban-settings";

describe("sales Kanban settings", () => {
  it("uses the full default card field set when settings are empty", () => {
    assert.deepEqual(
      parseSalesKanbanSettings(null).cardFields,
      defaultSalesKanbanCardFields,
    );
  });

  it("normalizes selected fields and removes duplicates", () => {
    assert.deepEqual(
      parseSalesKanbanSettings({
        cardFields: [
          "customerName",
          "unknown",
          "dealValue",
          "customerName",
          "outstandingTasks",
        ],
      }).cardFields,
      ["customerName", "dealValue", "outstandingTasks"],
    );
  });

  it("serializes only supported card fields", () => {
    assert.deepEqual(
      salesKanbanSettingsToJson({
        cardFields: ["leadSource", "leadSource", "salesperson"],
      }),
      { cardFields: ["leadSource", "salesperson"] },
    );
  });
});
