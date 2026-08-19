import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractSaleNoteMentionTokens,
  resolveSaleNoteMentions,
  saleNoteMentionHandleCandidates,
  type SaleNoteMentionUser,
} from "../src/lib/sales/note-mentions";

const users: SaleNoteMentionUser[] = [
  {
    email: "d.moffat@example.com",
    firstName: "Dave",
    id: "user-1",
    lastName: "Moffat",
    name: "Dave Moffat",
  },
  {
    email: "jane.smith@example.com",
    firstName: "Jane",
    id: "user-2",
    lastName: "Smith",
    name: "Jane Smith",
  },
  {
    email: "d.smith@example.com",
    firstName: "Dan",
    id: "user-3",
    lastName: "Smith",
    name: "Dan Smith",
  },
];

describe("sales note mentions", () => {
  it("extracts unique mention tokens without treating email addresses as mentions", () => {
    assert.deepEqual(
      extractSaleNoteMentionTokens(
        "Ask @d.moffat, @jane_smith and d.moffat@example.com. Then @d.moffat.",
      ),
      ["d.moffat", "jane_smith"],
    );
  });

  it("builds handles from email and first/last name combinations", () => {
    assert.deepEqual(
      new Set(saleNoteMentionHandleCandidates(users[0])).has("d.moffat"),
      true,
    );
    assert.deepEqual(
      new Set(saleNoteMentionHandleCandidates(users[0])).has("dmoffat"),
      true,
    );
    assert.deepEqual(
      new Set(saleNoteMentionHandleCandidates(users[0])).has("dave.moffat"),
      true,
    );
  });

  it("resolves known users and reports unmatched handles", () => {
    const result = resolveSaleNoteMentions(
      "Please review @d.moffat and @unknown-user.",
      users,
    );

    assert.deepEqual(
      result.resolved.map((mention) => ({
        token: mention.token,
        userId: mention.user.id,
      })),
      [{ token: "d.moffat", userId: "user-1" }],
    );
    assert.deepEqual(result.unresolved, ["unknown-user"]);
    assert.deepEqual(result.ambiguous, []);
  });

  it("marks ambiguous handles without assigning them", () => {
    const result = resolveSaleNoteMentions("Please check @d.smith.", [
      users[2],
      {
        email: "d.smith@other.example",
        firstName: "Deb",
        id: "user-4",
        lastName: "Smith",
        name: "Deb Smith",
      },
    ]);

    assert.deepEqual(result.resolved, []);
    assert.deepEqual(result.unresolved, []);
    assert.deepEqual(result.ambiguous, ["d.smith"]);
  });
});
