import assert from "node:assert/strict";
import test from "node:test";
import {
  documentExpiryInputValue,
  documentExpiryReminderAt,
  documentExpiryStatus,
  parseDocumentExpiryDate,
  parseDocumentIssueDate,
} from "../src/lib/documents/expiry";

test("document expiry dates use the end of the selected day", () => {
  const expiresAt = parseDocumentExpiryDate("2026-12-31");

  assert.ok(expiresAt instanceof Date);
  assert.equal(expiresAt.toISOString(), "2026-12-31T23:59:59.999Z");
  assert.equal(documentExpiryInputValue(expiresAt), "2026-12-31");
  assert.equal(parseDocumentExpiryDate(""), null);
  assert.equal(parseDocumentExpiryDate("not-a-date"), undefined);
  assert.equal(parseDocumentExpiryDate("2026-02-31"), undefined);
});

test("document issue dates use the start of the selected day", () => {
  const issuedAt = parseDocumentIssueDate("2026-01-15");

  assert.ok(issuedAt instanceof Date);
  assert.equal(issuedAt.toISOString(), "2026-01-15T00:00:00.000Z");
  assert.equal(parseDocumentIssueDate(""), null);
  assert.equal(parseDocumentIssueDate("2026-02-31"), undefined);
});

test("document reminder timestamps are derived from the expiry date", () => {
  const expiresAt = new Date("2026-12-31T23:59:59.999Z");

  assert.equal(
    documentExpiryReminderAt(expiresAt, 30)?.toISOString(),
    "2026-12-01T23:59:59.999Z",
  );
  assert.equal(documentExpiryReminderAt(expiresAt, null), null);
});

test("document expiry status distinguishes valid, due and expired files", () => {
  const now = new Date("2026-12-15T12:00:00.000Z");
  const expiresAt = new Date("2026-12-31T23:59:59.999Z");

  assert.equal(
    documentExpiryStatus({ expiresAt, now, reminderAt: new Date("2026-12-20") }),
    "valid",
  );
  assert.equal(
    documentExpiryStatus({ expiresAt, now, reminderAt: new Date("2026-12-01") }),
    "expiring",
  );
  assert.equal(
    documentExpiryStatus({
      expiresAt: new Date("2026-12-01"),
      now,
      reminderAt: new Date("2026-11-01"),
    }),
    "expired",
  );
});
