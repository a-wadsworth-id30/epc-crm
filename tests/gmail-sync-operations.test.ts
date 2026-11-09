import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseGmailSyncOperationSummary,
  summarizeGmailSyncOperation,
} from "../src/lib/integrations/gmail-sync-operations";

describe("Gmail sync operation summaries", () => {
  it("aggregates safe batch counts without mailbox identities", () => {
    assert.deepEqual(
      summarizeGmailSyncOperation(
        [
          { ok: true, result: { created: 2, hasMore: true, read: 4, updated: 1 } },
          { ok: true, result: { created: 0, hasMore: false, read: 3, updated: 2 } },
          { ok: false },
        ],
        1,
      ),
      {
        backlogPending: 1,
        deferred: 1,
        failed: 1,
        messagesRead: 7,
        processed: 3,
        recordsWritten: 5,
        succeeded: 2,
      },
    );
  });

  it("rejects incomplete or invalid stored summaries", () => {
    assert.equal(parseGmailSyncOperationSummary({ processed: 2 }), null);
    assert.equal(
      parseGmailSyncOperationSummary({
        backlogPending: 0,
        deferred: 0,
        failed: -1,
        messagesRead: 2,
        processed: 1,
        recordsWritten: 1,
        succeeded: 1,
      }),
      null,
    );
  });
});
