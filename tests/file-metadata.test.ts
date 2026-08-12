import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normaliseFileAssetNotes,
  parseFileAssetTags,
} from "../src/lib/storage/file-metadata";

describe("file metadata", () => {
  it("normalises optional file notes", () => {
    assert.equal(
      normaliseFileAssetNotes("  Customer uploaded bill  "),
      "Customer uploaded bill",
    );
    assert.equal(normaliseFileAssetNotes("   "), null);
    assert.equal(normaliseFileAssetNotes(null), null);
  });

  it("parses comma and newline separated tags", () => {
    assert.deepEqual(
      parseFileAssetTags("Utility bill, survey\nUtility bill, handover"),
      ["Utility bill", "survey", "handover"],
    );
  });

  it("bounds the number and length of tags", () => {
    const tags = parseFileAssetTags(
      Array.from(
        { length: 25 },
        (_, index) =>
          `tag-${index.toString().padStart(2, "0")}-with-extra-long-name`,
      ).join(","),
    );

    assert.equal(tags.length, 20);
    assert.ok(tags.every((tag) => tag.length <= 40));
  });
});
