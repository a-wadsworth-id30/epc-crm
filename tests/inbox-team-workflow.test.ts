import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emailTeamLaneWhere,
  emailWorkflowScopeWhere,
  newEmailWorkflowState,
} from "../src/lib/inbox/team-workflow";

describe("inbox team workflow", () => {
  it("scopes Gmail workflow changes to the complete mailbox thread", () => {
    assert.deepEqual(
      emailWorkflowScopeWhere({
        id: "message-1",
        mailboxId: "mailbox-1",
        provider: "gmail",
        providerThreadId: "thread-1",
      }),
      {
        mailboxId: "mailbox-1",
        provider: "gmail",
        providerThreadId: "thread-1",
      },
    );
  });

  it("limits non-Gmail workflow changes to the selected message", () => {
    assert.deepEqual(
      emailWorkflowScopeWhere({
        id: "message-1",
        mailboxId: null,
        provider: "mailersend",
        providerThreadId: null,
      }),
      { id: "message-1" },
    );
  });

  it("keeps resolved and archived email out of the active personal queue", () => {
    assert.deepEqual(emailTeamLaneWhere("mine", "user-1"), {
      assignedUserId: "user-1",
      status: { not: "ARCHIVED" },
      teamStatus: { not: "RESOLVED" },
    });
  });

  it("provides dedicated waiting and resolved queues", () => {
    assert.deepEqual(emailTeamLaneWhere("waiting", "user-1"), {
      status: { not: "ARCHIVED" },
      teamStatus: "WAITING",
    });
    assert.deepEqual(emailTeamLaneWhere("resolved", "user-1"), {
      status: { not: "ARCHIVED" },
      teamStatus: "RESOLVED",
    });
  });

  it("reopens an inbound Gmail reply without losing its owner", () => {
    const assignedAt = new Date("2026-11-06T14:30:00.000Z");
    assert.deepEqual(
      newEmailWorkflowState("INBOUND", {
        assignedAt,
        assignedUserId: "user-1",
        teamStatus: "WAITING",
      }),
      {
        assignedAt,
        assignedUserId: "user-1",
        teamStatus: "OPEN",
      },
    );
  });

  it("inherits the thread workflow when Gmail sync reconciles sent mail", () => {
    assert.deepEqual(
      newEmailWorkflowState("OUTBOUND", {
        assignedAt: null,
        assignedUserId: null,
        teamStatus: "WAITING",
      }),
      {
        assignedAt: null,
        assignedUserId: null,
        teamStatus: "WAITING",
      },
    );
  });
});
