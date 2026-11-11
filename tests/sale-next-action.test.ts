import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  saleNextActionMaxLength,
  saleNextActionSchema,
} from "../src/lib/sales/next-action";

test("normalises the canonical Sale next action", () => {
  assert.deepEqual(
    saleNextActionSchema.parse({
      nextAction: "  Call Friday to confirm the survey.  ",
      saleId: "sale-1",
    }),
    {
      nextAction: "Call Friday to confirm the survey.",
      saleId: "sale-1",
    },
  );
  assert.equal(
    saleNextActionSchema.parse({ nextAction: "   ", saleId: "sale-1" })
      .nextAction,
    null,
  );
});

test("rejects missing Sale context and oversized actions", () => {
  assert.equal(
    saleNextActionSchema.safeParse({ nextAction: "Call", saleId: "" }).success,
    false,
  );
  assert.equal(
    saleNextActionSchema.safeParse({
      nextAction: "x".repeat(saleNextActionMaxLength + 1),
      saleId: "sale-1",
    }).success,
    false,
  );
});

test("distinguishes committed CRM state from AI recommendations", () => {
  const editor = readFileSync(
    "src/components/crm-boilerplate/SaleNextActionEditor.tsx",
    "utf8",
  );
  const compactAi = readFileSync(
    "src/components/crm-boilerplate/CompactAIGuidanceRail.tsx",
    "utf8",
  );
  const fullAi = readFileSync(
    "src/components/crm-boilerplate/SalesLeadAIAssistant.tsx",
    "utf8",
  );

  assert.match(editor, /committed CRM action, not an AI suggestion/);
  assert.match(compactAi, /AI recommendation/);
  assert.match(fullAi, /AI recommendation/);
  assert.doesNotMatch(fullAi, /sale\.nextStep\s*\|\|/);
});
