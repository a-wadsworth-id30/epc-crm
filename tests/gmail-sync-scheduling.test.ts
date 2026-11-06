import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  gmailMailboxHasContinuation,
  prioritizeGmailSyncMailboxes,
} from "../src/lib/integrations/gmail-sync-scheduling";

describe("Gmail sync scheduling", () => {
  it("detects the correct continuation token for initial and history sync", () => {
    assert.equal(
      gmailMailboxHasContinuation({
        lastHistoryId: null,
        metadata: { initialSyncPageToken: "initial-next" },
      }),
      true,
    );
    assert.equal(
      gmailMailboxHasContinuation({
        lastHistoryId: "history-1",
        metadata: { historySyncPageToken: "history-next" },
      }),
      true,
    );
    assert.equal(
      gmailMailboxHasContinuation({
        lastHistoryId: "history-1",
        metadata: { initialSyncPageToken: "stale-token" },
      }),
      false,
    );
  });

  it("prioritizes backlog pages and keeps each group oldest-first", () => {
    const rows = prioritizeGmailSyncMailboxes([
      {
        id: "regular-old",
        lastHistoryId: "history-1",
        lastSyncAt: new Date("2026-11-06T09:00:00.000Z"),
        metadata: {},
      },
      {
        id: "backlog-new",
        lastHistoryId: "history-2",
        lastSyncAt: new Date("2026-11-06T11:00:00.000Z"),
        metadata: { historySyncPageToken: "page-2" },
      },
      {
        id: "backlog-old",
        lastHistoryId: null,
        lastSyncAt: new Date("2026-11-06T10:00:00.000Z"),
        metadata: { initialSyncPageToken: "page-1" },
      },
    ]);

    assert.deepEqual(
      rows.map((row) => row.id),
      ["backlog-old", "backlog-new", "regular-old"],
    );
  });
});
