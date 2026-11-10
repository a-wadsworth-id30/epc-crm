import assert from "node:assert/strict";
import test from "node:test";
import { contactSearchWhere } from "../src/lib/contacts/query";

test("contact search includes only searchable active custom fields", () => {
  const where = contactSearchWhere("MCS");
  const serialized = JSON.stringify(where);

  assert.match(serialized, /customFieldValues/);
  assert.match(serialized, /isSearchable/);
  assert.match(serialized, /textValue/);
  assert.match(serialized, /array_contains/);
});

test("contact search adds typed custom-field filters", () => {
  assert.match(JSON.stringify(contactSearchWhere("12.5")), /numberValue/);
  assert.match(JSON.stringify(contactSearchWhere("2027-06-30")), /dateValue/);
  assert.match(JSON.stringify(contactSearchWhere("yes")), /booleanValue/);
});

test("blank contact search has no filter", () => {
  assert.equal(contactSearchWhere("   "), undefined);
});
