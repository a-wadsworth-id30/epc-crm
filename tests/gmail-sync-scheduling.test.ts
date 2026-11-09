import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  gmailMailboxHasContinuation,
  prioritizeGmailSyncMailboxes,
  scheduledGmailSyncCandidates,
} from "../src/lib/integrations/gmail-sync-scheduling";
import {
  clearGmailSyncRetryMetadata,
  gmailSyncFailureMetadata,
  gmailSyncRetryDelayMs,
  gmailSyncRetryState,
} from "../src/lib/integrations/gmail-sync-retry-policy";

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

  it("backs off repeated failures with a one-hour cap", () => {
    assert.equal(gmailSyncRetryDelayMs(1), 5 * 60 * 1_000);
    assert.equal(gmailSyncRetryDelayMs(2), 10 * 60 * 1_000);
    assert.equal(gmailSyncRetryDelayMs(20), 60 * 60 * 1_000);
  });

  it("defers cooling-down mailboxes without blocking healthy candidates", () => {
    const now = new Date("2026-11-09T10:00:00.000Z");
    const result = scheduledGmailSyncCandidates(
      [
        {
          id: "failed",
          lastHistoryId: "history-1",
          lastSyncAt: null,
          metadata: { gmailSyncRetryAfter: "2026-11-09T10:05:00.000Z" },
        },
        {
          id: "ready",
          lastHistoryId: "history-2",
          lastSyncAt: new Date("2026-11-09T09:55:00.000Z"),
          metadata: {},
        },
      ],
      now,
    );

    assert.equal(result.coolingDown, 1);
    assert.equal(result.leased, 0);
    assert.deepEqual(result.eligible.map((mailbox) => mailbox.id), ["ready"]);
  });

  it("defers actively leased mailboxes without blocking healthy candidates", () => {
    const now = new Date("2026-11-09T10:00:00.000Z");
    const result = scheduledGmailSyncCandidates(
      [
        {
          id: "leased",
          lastHistoryId: "history-1",
          lastSyncAt: null,
          metadata: {},
          syncLeaseUntil: new Date("2026-11-09T10:05:00.000Z"),
        },
        {
          id: "ready",
          lastHistoryId: "history-2",
          lastSyncAt: new Date("2026-11-09T09:55:00.000Z"),
          metadata: {},
          syncLeaseUntil: null,
        },
      ],
      now,
    );

    assert.equal(result.coolingDown, 0);
    assert.equal(result.leased, 1);
    assert.deepEqual(result.eligible.map((mailbox) => mailbox.id), ["ready"]);
  });

  it("allows an expired mailbox lease to be scheduled", () => {
    const now = new Date("2026-11-09T10:00:00.000Z");
    const result = scheduledGmailSyncCandidates(
      [
        {
          id: "expired",
          lastHistoryId: "history-1",
          lastSyncAt: null,
          metadata: {},
          syncLeaseUntil: new Date("2026-11-09T09:59:59.999Z"),
        },
      ],
      now,
    );

    assert.equal(result.leased, 0);
    assert.deepEqual(result.eligible.map((mailbox) => mailbox.id), ["expired"]);
  });

  it("increments retry metadata and clears it after a successful sync", () => {
    const now = new Date("2026-11-09T10:00:00.000Z");
    const firstFailure = gmailSyncFailureMetadata({ existing: true }, now);
    const secondFailure = gmailSyncFailureMetadata(firstFailure, now);

    assert.deepEqual(gmailSyncRetryState(secondFailure, now), {
      coolingDown: true,
      failureCount: 2,
      retryAfter: new Date("2026-11-09T10:10:00.000Z"),
    });
    assert.deepEqual(clearGmailSyncRetryMetadata(secondFailure), {
      existing: true,
    });
  });
});
