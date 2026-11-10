import assert from "node:assert/strict";
import test from "node:test";
import {
  canEditContactField,
  canViewContactField,
  editableContactFields,
  visibleContactFields,
} from "../src/lib/contacts/field-access";

const salesUser = { role: "USER" as const, roleTemplate: "sales-user" };
const supportUser = { role: "USER" as const, roleTemplate: "support-user" };
const admin = { role: "ADMIN" as const, roleTemplate: "admin" };

test("empty role restrictions preserve access for existing fields", () => {
  assert.equal(canViewContactField({}, salesUser), true);
  assert.equal(canEditContactField({}, supportUser), true);
});

test("view and edit restrictions are independently enforced", () => {
  const field = {
    viewRoleTemplates: ["sales-user", "support-user"],
    editRoleTemplates: ["sales-user"],
  };

  assert.equal(canViewContactField(field, supportUser), true);
  assert.equal(canEditContactField(field, supportUser), false);
  assert.equal(canEditContactField(field, salesUser), true);
});

test("administrators cannot be locked out of a field", () => {
  const field = {
    viewRoleTemplates: ["support-user"],
    editRoleTemplates: ["support-user"],
  };

  assert.equal(canViewContactField(field, admin), true);
  assert.equal(canEditContactField(field, admin), true);
});

test("field collections can be filtered without exposing restricted fields", () => {
  const fields = [
    { id: "open" },
    { id: "sales", viewRoleTemplates: ["sales-user"], editRoleTemplates: ["sales-user"] },
    { id: "support", viewRoleTemplates: ["support-user"], editRoleTemplates: ["support-user"] },
    { id: "read-only", viewRoleTemplates: ["sales-user"], editRoleTemplates: ["manager"] },
  ];

  assert.deepEqual(visibleContactFields(fields, salesUser).map((field) => field.id), [
    "open",
    "sales",
    "read-only",
  ]);
  assert.deepEqual(editableContactFields(fields, salesUser).map((field) => field.id), [
    "open",
    "sales",
  ]);
});
