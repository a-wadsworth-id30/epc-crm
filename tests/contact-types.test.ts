import assert from "node:assert/strict";
import test from "node:test";
import { contactCategoryValues } from "../src/lib/contacts/categories";
import {
  systemContactTypeId,
  systemContactTypeIds,
  systemContactTypeSlugs,
} from "../src/lib/contacts/contact-types";

test("every legacy contact category has a stable contact type identity", () => {
  assert.deepEqual(Object.keys(systemContactTypeIds), contactCategoryValues);
  assert.deepEqual(Object.keys(systemContactTypeSlugs), contactCategoryValues);

  for (const category of contactCategoryValues) {
    assert.equal(systemContactTypeId(category), systemContactTypeIds[category]);
    assert.match(systemContactTypeIds[category], /^contact-type-/);
    assert.ok(systemContactTypeSlugs[category]);
  }
});
