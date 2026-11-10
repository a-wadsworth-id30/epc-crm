import assert from "node:assert/strict";
import test from "node:test";
import { optionalFormIdSchema } from "../src/lib/forms/optional-id";

test("optional form IDs accept missing create-form values", () => {
  assert.deepEqual(optionalFormIdSchema.safeParse(null), {
    data: undefined,
    success: true,
  });
  assert.deepEqual(optionalFormIdSchema.safeParse(""), {
    data: undefined,
    success: true,
  });
});

test("optional form IDs preserve valid update IDs", () => {
  assert.deepEqual(optionalFormIdSchema.safeParse("  record-1  "), {
    data: "record-1",
    success: true,
  });
});
