import assert from "node:assert/strict";
import { ContactCategory } from "@prisma/client";
import { describe, it } from "node:test";
import { systemContactTypeAssignment } from "../src/lib/contacts/contact-type-assignment";

describe("contact type creation assignment", () => {
  it("assigns general integration contacts to the Consumer system type", () => {
    assert.deepEqual(systemContactTypeAssignment(), {
      category: ContactCategory.CONSUMER,
      contactTypeId: "contact-type-consumer",
    });
  });

  it("keeps the legacy category and system person type aligned", () => {
    assert.deepEqual(systemContactTypeAssignment(ContactCategory.INSTALLER), {
      category: ContactCategory.INSTALLER,
      contactTypeId: "contact-type-installer",
    });
  });
});
