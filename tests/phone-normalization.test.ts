import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeCallableNumber,
  normalizedContactPhone,
} from "../src/lib/phone-normalization";

describe("phone normalization", () => {
  it("normalizes UK local and international numbers for indexed lookup", () => {
    assert.equal(normalizeCallableNumber("07394 486 272"), "+447394486272");
    assert.equal(normalizeCallableNumber("0044 7394 486272"), "+447394486272");
    assert.equal(normalizeCallableNumber("+44 (0)7394 486272"), "+4407394486272");
  });

  it("returns null for empty contact phone values", () => {
    assert.equal(normalizedContactPhone(null), null);
    assert.equal(normalizedContactPhone(""), null);
    assert.equal(normalizedContactPhone("  "), null);
  });
});
