import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

let plannerImport:
  | Promise<typeof import("../src/lib/reports/engine")>
  | undefined;

async function loadPlanner() {
  if (!plannerImport) {
    const loader = Module as unknown as {
      _load: (request: string, ...args: unknown[]) => unknown;
    };
    const originalLoad = loader._load;

    loader._load = function (
      this: unknown,
      request: string,
      ...args: unknown[]
    ) {
      if (request === "server-only") return {};
      return originalLoad.call(this, request, ...args);
    };

    plannerImport = import("../src/lib/reports/engine");
  }

  return plannerImport;
}

describe("Sidekick deterministic report planner", () => {
  it("keeps explicit Discovery platform questions out of marketing attribution", async () => {
    const { reportPlanFromPrompt } = await loadPlanner();
    const plan = reportPlanFromPrompt(
      "What platforms do leads ask for in Discovery?",
    );

    assert.equal(plan.dataset, "discovery_answers");
    assert.deepEqual(plan.dimensions, ["answer"]);
    assert.deepEqual(plan.filters, [
      { field: "question", operator: "contains", value: "platform" },
    ]);
  });

  it("keeps ad-platform cost questions in marketing attribution", async () => {
    const { reportPlanFromPrompt } = await loadPlanner();
    const plan = reportPlanFromPrompt(
      "Which ad platform has the best cost per lead?",
    );

    assert.equal(plan.dataset, "marketing_attribution");
    assert.deepEqual(plan.dimensions, ["platform"]);
    assert.equal(plan.metrics[0], "costPerConversion");
  });

  it("filters admin accounts that do not have 2FA enabled", async () => {
    const { reportPlanFromPrompt } = await loadPlanner();
    const plan = reportPlanFromPrompt("Which admins do not have 2FA enabled?");

    assert.equal(plan.dataset, "users_security");
    assert.deepEqual(plan.dimensions, ["user"]);
    assert.deepEqual(plan.filters, [
      {
        field: "twoFactorStatus",
        operator: "equals",
        value: "2FA not enabled",
      },
      {
        field: "adminTwoFactorStatus",
        operator: "equals",
        value: "Admin without 2FA",
      },
    ]);
  });

  it("honours owner grouping for contacted-rate lifecycle questions", async () => {
    const { reportPlanFromPrompt } = await loadPlanner();
    const plan = reportPlanFromPrompt("What is our contacted rate by owner?");

    assert.equal(plan.dataset, "sales_lifecycle");
    assert.deepEqual(plan.dimensions, ["owner"]);
    assert.equal(plan.metrics[0], "contactedRate");
  });

  it("prioritises transcript status when recordings need transcripts", async () => {
    const { reportPlanFromPrompt } = await loadPlanner();
    const plan = reportPlanFromPrompt("Which recordings are missing transcripts?");

    assert.equal(plan.dataset, "calls");
    assert.deepEqual(plan.dimensions, ["transcriptStatus"]);
    assert.equal(plan.metrics[0], "transcriptMissing");
  });

  it("treats not-linked storage wording as unlinked files", async () => {
    const { reportPlanFromPrompt } = await loadPlanner();
    const plan = reportPlanFromPrompt("Which files are not linked to a record?");

    assert.equal(plan.dataset, "storage_assets");
    assert.deepEqual(plan.filters, [
      { field: "linkStatus", operator: "equals", value: "Unlinked" },
    ]);
    assert.equal(plan.metrics[0], "unlinkedFiles");
  });

  it("plans overdue tasks by assignee", async () => {
    const { reportPlanFromPrompt } = await loadPlanner();
    const plan = reportPlanFromPrompt("Which tasks are overdue by assignee?");

    assert.equal(plan.dataset, "tasks");
    assert.deepEqual(plan.dimensions, ["assignee"]);
    assert.deepEqual(plan.filters, [
      { field: "dueStatus", operator: "equals", value: "Overdue" },
    ]);
    assert.equal(plan.metrics[0], "overdueTasks");
    assert.equal(plan.dateRange.preset, "all");
  });

  it("plans due-today task reports", async () => {
    const { reportPlanFromPrompt } = await loadPlanner();
    const plan = reportPlanFromPrompt("What tasks are due today?");

    assert.equal(plan.dataset, "tasks");
    assert.deepEqual(plan.dimensions, ["dueStatus"]);
    assert.deepEqual(plan.filters, [
      { field: "dueStatus", operator: "equals", value: "Due today" },
    ]);
    assert.equal(plan.metrics[0], "dueTodayTasks");
  });

  it("plans completed task reports", async () => {
    const { reportPlanFromPrompt } = await loadPlanner();
    const plan = reportPlanFromPrompt("Show completed tasks by status.");

    assert.equal(plan.dataset, "tasks");
    assert.deepEqual(plan.dimensions, ["status"]);
    assert.deepEqual(plan.filters, [
      { field: "status", operator: "equals", value: "Done" },
    ]);
    assert.equal(plan.metrics[0], "completedTasks");
  });

  it("plans unassigned task reports", async () => {
    const { reportPlanFromPrompt } = await loadPlanner();
    const plan = reportPlanFromPrompt("Which tasks are unassigned?");

    assert.equal(plan.dataset, "tasks");
    assert.deepEqual(plan.dimensions, ["assignee"]);
    assert.deepEqual(plan.filters, [
      { field: "assignee", operator: "equals", value: "Unassigned" },
    ]);
    assert.equal(plan.metrics[0], "unassignedTasks");
  });

  it("plans outbound email reports by user", async () => {
    const { reportPlanFromPrompt } = await loadPlanner();
    const plan = reportPlanFromPrompt("Which users sent the most emails?");

    assert.equal(plan.dataset, "communications");
    assert.deepEqual(plan.dimensions, ["owner"]);
    assert.deepEqual(plan.filters, [
      { field: "channel", operator: "equals", value: "Email" },
      { field: "direction", operator: "equals", value: "Outbound" },
    ]);
    assert.equal(plan.metrics[0], "emailCount");
  });

  it("plans outbound SMS reports", async () => {
    const { reportPlanFromPrompt } = await loadPlanner();
    const plan = reportPlanFromPrompt(
      "How many SMS messages did we send this week?",
    );

    assert.equal(plan.dataset, "communications");
    assert.deepEqual(plan.filters, [
      { field: "channel", operator: "equals", value: "Sms" },
      { field: "direction", operator: "equals", value: "Outbound" },
    ]);
    assert.equal(plan.metrics[0], "smsCount");
  });

  it("plans inbound reply reports by lead owner", async () => {
    const { reportPlanFromPrompt } = await loadPlanner();
    const plan = reportPlanFromPrompt(
      "Which lead owners get the most inbound replies?",
    );

    assert.equal(plan.dataset, "communications");
    assert.deepEqual(plan.dimensions, ["opportunityOwner"]);
    assert.deepEqual(plan.filters, [
      { field: "direction", operator: "equals", value: "Inbound" },
    ]);
    assert.equal(plan.metrics[0], "communicationCount");
  });

  it("plans communication contact coverage reports", async () => {
    const { reportPlanFromPrompt } = await loadPlanner();
    const plan = reportPlanFromPrompt(
      "Which communications are missing linked contacts?",
    );

    assert.equal(plan.dataset, "communications");
    assert.deepEqual(plan.dimensions, ["contactStatus"]);
    assert.deepEqual(plan.filters, [
      {
        field: "contactStatus",
        operator: "equals",
        value: "No linked contact",
      },
    ]);
    assert.equal(plan.metrics[0], "unlinkedContacts");
  });

  it("explains empty marketing attribution reports", async () => {
    const { reportEmptyStateMessage, reportPlanFromPrompt } =
      await loadPlanner();
    const plan = reportPlanFromPrompt(
      "Which Google Ads campaign generated the most leads?",
    );
    const message = reportEmptyStateMessage("marketing_attribution", plan);

    assert.match(message, /tracking script/i);
    assert.match(message, /approved domains/i);
    assert.match(message, /Active filters: platform equals Google Ads\./);
  });

  it("explains empty task reports", async () => {
    const { reportEmptyStateMessage, reportPlanFromPrompt } =
      await loadPlanner();
    const plan = reportPlanFromPrompt("Which tasks are overdue by assignee?");
    const message = reportEmptyStateMessage("tasks", plan);

    assert.match(message, /task due dates/i);
    assert.match(message, /assignees/i);
    assert.match(message, /Active filters: dueStatus equals Overdue\./);
  });
});
