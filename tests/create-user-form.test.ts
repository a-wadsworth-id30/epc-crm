import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCreateUserFormData } from "../src/lib/users/create-user-form";

describe("create user form parsing", () => {
  it("accepts a role-template submission without the legacy role field", () => {
    const parsed = parseCreateUserFormData(
      formData({
        email: "new.user@example.com",
        name: "New User",
        password: "ChangeMe123!",
        roleTemplate: "sales-user",
      }),
    );

    assert.equal(parsed.success, true);
    if (!parsed.success) return;
    assert.equal(parsed.data.role, undefined);
    assert.equal(parsed.data.roleTemplate, "sales-user");
  });

  it("normalizes supported role template labels", () => {
    const parsed = parseCreateUserFormData(
      formData({
        email: "new.user@example.com",
        name: "New User",
        password: "ChangeMe123!",
        roleTemplate: "Sales user",
      }),
    );

    assert.equal(parsed.success, true);
    if (!parsed.success) return;
    assert.equal(parsed.data.roleTemplate, "sales-user");
  });

  it("rejects submissions without a role template or legacy role", () => {
    const parsed = parseCreateUserFormData(
      formData({
        email: "new.user@example.com",
        name: "New User",
        password: "ChangeMe123!",
      }),
    );

    assert.equal(parsed.success, false);
  });
});

function formData(fields: Record<string, string>) {
  const data = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }

  return data;
}
