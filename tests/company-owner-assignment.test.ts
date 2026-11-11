import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  LEGACY_COMPANY_OWNER_VALUE,
  companyOwnerOptionsForUser,
  validateCompanyOwnerAssignment,
} from "../src/lib/companies/owner-assignment";

const activeOwnerIds = new Set(["admin-1", "user-1", "user-2"]);

describe("company owner assignment policy", () => {
  it("uses a reserved value for preserving unmatched legacy owners", () => {
    assert.equal(LEGACY_COMPANY_OWNER_VALUE, "__legacy_company_owner__");
  });

  it("allows admins to assign any active user", () => {
    assert.deepEqual(
      validateCompanyOwnerAssignment({
        activeOwnerIds,
        currentUser: { id: "admin-1", role: "ADMIN" },
        ownerUserId: "user-2",
      }),
      { ok: true, ownerUserId: "user-2" },
    );
  });

  it("allows standard users to assign themselves or leave a company unassigned", () => {
    assert.deepEqual(
      validateCompanyOwnerAssignment({
        activeOwnerIds,
        currentUser: { id: "user-1", role: "USER" },
        ownerUserId: "user-1",
      }),
      { ok: true, ownerUserId: "user-1" },
    );
    assert.deepEqual(
      validateCompanyOwnerAssignment({
        activeOwnerIds,
        currentUser: { id: "user-1", role: "USER" },
        ownerUserId: null,
      }),
      { ok: true, ownerUserId: null },
    );
    assert.equal(
      validateCompanyOwnerAssignment({
        activeOwnerIds,
        currentUser: { id: "user-1", role: "USER" },
        ownerUserId: "user-2",
      }).ok,
      false,
    );
  });

  it("rejects inactive users and limits standard-user choices to themselves", () => {
    assert.deepEqual(
      validateCompanyOwnerAssignment({
        activeOwnerIds,
        currentUser: { id: "admin-1", role: "ADMIN" },
        ownerUserId: "inactive-user",
      }),
      { ok: false, message: "Choose an active Company owner." },
    );
    assert.deepEqual(
      companyOwnerOptionsForUser(
        [
          { id: "user-1", name: "User One" },
          { id: "user-2", name: "User Two" },
        ],
        { id: "user-1", role: "USER" },
      ),
      [{ id: "user-1", name: "User One" }],
    );
  });

  it("uses an additive migration with conservative legacy-name backfill", () => {
    const migration = readFileSync(
      new URL(
        "../prisma/migrations/20261111131500_company_user_ownership/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );

    assert.match(migration, /ADD COLUMN "ownerUserId" TEXT/);
    assert.match(migration, /HAVING COUNT\(\*\) = 1/);
    assert.match(migration, /WHERE "status" = 'ACTIVE'/);
    assert.match(migration, /ON DELETE SET NULL/);
    assert.doesNotMatch(migration, /DROP COLUMN "owner"/);
  });
});
