import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  saleOwnerOptionsForUser,
  validateSaleOwnerAssignment,
} from "../src/lib/sales/owner-assignment";

const activeOwnerIds = new Set(["admin-1", "user-1", "user-2"]);

describe("sales owner assignment policy", () => {
  it("allows admins to assign any active owner", () => {
    assert.deepEqual(
      validateSaleOwnerAssignment({
        activeOwnerIds,
        currentUser: { id: "admin-1", role: "ADMIN" },
        ownerId: "user-2",
      }),
      { ok: true, ownerId: "user-2" },
    );
  });

  it("allows normal users to assign themselves or unassigned only", () => {
    assert.deepEqual(
      validateSaleOwnerAssignment({
        activeOwnerIds,
        currentUser: { id: "user-1", role: "USER" },
        ownerId: "user-1",
      }),
      { ok: true, ownerId: "user-1" },
    );
    assert.deepEqual(
      validateSaleOwnerAssignment({
        activeOwnerIds,
        currentUser: { id: "user-1", role: "USER" },
        ownerId: null,
      }),
      { ok: true, ownerId: null },
    );
    assert.equal(
      validateSaleOwnerAssignment({
        activeOwnerIds,
        currentUser: { id: "user-1", role: "USER" },
        ownerId: "user-2",
      }).ok,
      false,
    );
  });

  it("rejects inactive owners", () => {
    assert.deepEqual(
      validateSaleOwnerAssignment({
        activeOwnerIds,
        currentUser: { id: "admin-1", role: "ADMIN" },
        ownerId: "inactive-user",
      }),
      { ok: false, message: "Choose an active owner." },
    );
  });

  it("limits non-admin owner options to the current user", () => {
    assert.deepEqual(
      saleOwnerOptionsForUser(
        [
          { id: "user-1", name: "User One" },
          { id: "user-2", name: "User Two" },
        ],
        { id: "user-1", role: "USER" },
      ),
      [{ id: "user-1", name: "User One" }],
    );
  });
});
