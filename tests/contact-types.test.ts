import assert from "node:assert/strict";
import test from "node:test";
import { contactCategoryValues } from "../src/lib/contacts/categories";
import {
  contactTypeArchiveBlockReason,
  contactTypeSlugBase,
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

test("person type labels produce stable safe slugs", () => {
  assert.equal(contactTypeSlugBase("Accredited Installer"), "accredited-installer");
  assert.equal(contactTypeSlugBase("  Rénovation & Trade  "), "renovation-trade");
  assert.equal(contactTypeSlugBase("---"), "person-type");
});

test("person types cannot be archived while default or populated", () => {
  assert.equal(
    contactTypeArchiveBlockReason({ contactCount: 0, isDefault: true, name: "Consumer" }),
    "Choose another default type before archiving this one.",
  );
  assert.equal(
    contactTypeArchiveBlockReason({ contactCount: 2, isDefault: false, name: "Installer" }),
    "Reassign 2 contacts before archiving Installer.",
  );
  assert.equal(
    contactTypeArchiveBlockReason({ contactCount: 0, isDefault: false, name: "Installer" }),
    null,
  );
});
