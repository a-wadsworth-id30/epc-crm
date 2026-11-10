import assert from "node:assert/strict";
import test from "node:test";
import { documentRenewalTaskData } from "../src/lib/documents/renewal-task";

test("contact document renewal tasks are assigned and linked safely", () => {
  const dueDate = new Date("2027-01-01T23:59:59.999Z");
  const task = documentRenewalTaskData({
    creatorId: "user-1",
    dueDate,
    entityId: "contact-1",
    entityType: "Contact",
    fileAssetId: "file-1",
    fileName: "driving-licence.pdf",
  });

  assert.equal(task.assigneeId, "user-1");
  assert.equal(task.contactId, "contact-1");
  assert.equal(task.companyId, null);
  assert.equal(task.dueDate, dueDate);
  assert.equal(task.status, "TODO");
  assert.deepEqual(task.metadata, {
    entityId: "contact-1",
    entityType: "Contact",
    fileAssetId: "file-1",
    source: "document-renewal",
  });
});

test("company renewal tasks link to the company without inventing a contact", () => {
  const task = documentRenewalTaskData({
    creatorId: "user-1",
    dueDate: new Date("2027-01-01T23:59:59.999Z"),
    entityId: "company-1",
    entityType: "Company",
    fileAssetId: "file-1",
    fileName: "insurance.pdf",
  });

  assert.equal(task.companyId, "company-1");
  assert.equal(task.contactId, null);
});
