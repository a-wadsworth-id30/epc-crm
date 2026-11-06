import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  effectiveEmailMessageStatus,
  emailMessageUnreadWhere,
} from "../src/lib/inbox/read-state";

describe("inbox per-user read state", () => {
  it("keeps a new shared message unread until this user reads it", () => {
    assert.equal(
      effectiveEmailMessageStatus({ status: "UNREAD", userStates: [] }),
      "UNREAD",
    );
  });

  it("marks only the selected user's copy as read", () => {
    assert.equal(
      effectiveEmailMessageStatus({
        status: "UNREAD",
        userStates: [{ readAt: new Date("2026-11-06T12:00:00.000Z") }],
      }),
      "READ",
    );
  });

  it("allows a user to mark a legacy shared read message unread", () => {
    assert.equal(
      effectiveEmailMessageStatus({
        status: "READ",
        userStates: [{ readAt: null }],
      }),
      "UNREAD",
    );
  });

  it("retains legacy shared read and archive states", () => {
    assert.equal(
      effectiveEmailMessageStatus({ status: "READ", userStates: [] }),
      "READ",
    );
    assert.equal(
      effectiveEmailMessageStatus({
        status: "ARCHIVED",
        userStates: [{ readAt: new Date("2026-11-06T12:00:00.000Z") }],
      }),
      "ARCHIVED",
    );
  });

  it("filters unread messages against only the current user's read rows", () => {
    assert.deepEqual(emailMessageUnreadWhere("user-1"), {
      status: { not: "ARCHIVED" },
      OR: [
        {
          userStates: {
            some: {
              userId: "user-1",
              readAt: null,
            },
          },
        },
        {
          status: "UNREAD",
          userStates: { none: { userId: "user-1" } },
        },
      ],
    });
  });
});
