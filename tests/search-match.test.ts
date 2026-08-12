import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  foldedSearchText,
  matchesSearchQuery,
  normalizeSearchDigits,
  normalizeSearchText,
  searchMatch,
} from "../src/lib/search/match";

const contactFields = [
  "Adam",
  "Wadsworth",
  "Adam Wadsworth",
  "Wadsworth Adam",
  "a.wadsworth@id30.com",
  "07394 486 272",
  "iD30",
];

describe("search matching", () => {
  it("normalizes casing, punctuation and repeated whitespace", () => {
    assert.equal(
      normalizeSearchText("  Adam   Wadsworth!! "),
      "adam wadsworth",
    );
  });

  it("normalizes phone numbers to digits", () => {
    assert.equal(normalizeSearchDigits("+44 (0)7394 486 272"), "4407394486272");
  });

  it("matches first name, last name and full name searches", () => {
    assert.equal(matchesSearchQuery("adam", contactFields), true);
    assert.equal(matchesSearchQuery("wadsworth", contactFields), true);
    assert.equal(matchesSearchQuery("Adam Wadsworth", contactFields), true);
  });

  it("matches reversed and partial multi-word name searches", () => {
    assert.equal(matchesSearchQuery("Wadsworth Adam", contactFields), true);
    assert.equal(matchesSearchQuery("adam wad", contactFields), true);
  });

  it("matches compact name searches without spaces", () => {
    assert.equal(matchesSearchQuery("adamwadsworth", contactFields), true);
  });

  it("matches small name typos and adjacent letter swaps", () => {
    assert.equal(matchesSearchQuery("Adam Wadswrth", contactFields), true);
    assert.equal(matchesSearchQuery("Adma Wadsworth", contactFields), true);
  });

  it("matches email and formatted phone number searches", () => {
    assert.equal(
      matchesSearchQuery("a.wadsworth@id30.com", contactFields),
      true,
    );
    assert.equal(
      matchesSearchQuery("awadsworthid30com", contactFields),
      true,
    );
    assert.equal(matchesSearchQuery("07394486272", contactFields), true);
    assert.equal(matchesSearchQuery("486272", contactFields), true);
  });

  it("folds punctuation out of searchable text", () => {
    assert.equal(foldedSearchText("a.wadsworth@id30.com"), "awadsworthid30com");
  });

  it("does not match unrelated searches", () => {
    assert.equal(matchesSearchQuery("charlotte", contactFields), false);
  });

  it("scores stronger direct matches above token matches", () => {
    assert.ok(searchMatch("Adam Wadsworth", contactFields).score > 60);
    assert.ok(searchMatch("adam wad", contactFields).score > 0);
  });
});
