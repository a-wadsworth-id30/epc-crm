import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isDiscoveryPackWritePlanRequest,
  isExplicitReportIntent,
  isLeadMetricIntent,
  isWriteActionRequest,
  selectSidekickTools,
  shouldUseCurrentPageContext,
  sidekickEntityIdFromPath,
  sidekickPathParts,
} from "../src/lib/ai/sidekick-intent";

describe("Sidekick intent routing", () => {
  it("routes direct lead count questions to deterministic lead metrics", () => {
    assert.deepEqual(selectSidekickTools("How many leads came in today?"), [
      "crm_get_lead_metrics",
    ]);
  });

  it("routes lead record requests to the lead list tool", () => {
    assert.deepEqual(selectSidekickTools("Show open leads this week"), [
      "crm_list_leads",
      "crm_search_records",
    ]);
  });

  it("routes explicit report questions to the report runner", () => {
    assert.equal(
      selectSidekickTools("Create a chart of won revenue by source")[0],
      "crm_run_report",
    );
  });

  it("routes open lead owner ranking questions to the report runner", () => {
    assert.equal(
      selectSidekickTools("Which lead owner has the most open leads?")[0],
      "crm_run_report",
    );
  });

  it("routes natural lead timing questions to the report runner", () => {
    assert.equal(
      selectSidekickTools("What is our best day for getting leads?")[0],
      "crm_run_report",
    );
    assert.equal(
      selectSidekickTools("When do we get most leads?")[0],
      "crm_run_report",
    );
  });

  it("routes product demand lead questions to the report runner", () => {
    assert.equal(
      selectSidekickTools("What products do I get asked for most on leads?")[0],
      "crm_run_report",
    );
    assert.equal(
      selectSidekickTools("Which services are requested most by leads?")[0],
      "crm_run_report",
    );
    assert.equal(
      selectSidekickTools("Which product records convert best?")[0],
      "crm_run_report",
    );
  });

  it("routes month-over-month lead comparisons to the report runner", () => {
    const question =
      "How many leads did we get this month compared with last month?";

    assert.equal(isExplicitReportIntent(question), true);
    assert.equal(isLeadMetricIntent(question), false);
    assert.equal(selectSidekickTools(question)[0], "crm_run_report");
  });

  it("routes marketing attribution questions to the report runner", () => {
    assert.equal(
      selectSidekickTools(
        "Which campaigns are generating the best quality leads?",
      )[0],
      "crm_run_report",
    );
    assert.equal(
      selectSidekickTools("Which landing pages convert best?")[0],
      "crm_run_report",
    );
    assert.equal(
      selectSidekickTools("Which Google Ads campaign generated the most leads?")[0],
      "crm_run_report",
    );
    assert.equal(
      selectSidekickTools("Which Search Console queries generate enquiries?")[0],
      "crm_run_report",
    );
    assert.equal(
      selectSidekickTools("Which ad platform has the best cost per lead?")[0],
      "crm_run_report",
    );
    assert.equal(
      selectSidekickTools("Which organic pages should we focus on?")[0],
      "crm_run_report",
    );
    assert.equal(
      selectSidekickTools("How many leads came from organic search this month?")[0],
      "crm_run_report",
    );
  });

  it("routes form submission questions to the report runner", () => {
    const questions = [
      "Which form fields are being submitted most?",
      "Which forms generate the most leads?",
      "Which submitted forms have missing phone or email details?",
    ];

    for (const question of questions) {
      assert.equal(isExplicitReportIntent(question), true);
      assert.equal(selectSidekickTools(question)[0], "crm_run_report");
    }
  });

  it("routes contacts and client activity questions to the report runner", () => {
    const questions = [
      "Which contacts have not been contacted recently?",
      "Show me contacts with open opportunities.",
      "Which clients have the most sales activity?",
      "Which contacts came from paid ads?",
      "Which contacts submitted forms but have no open lead?",
      "Which clients have the most recent activity?",
    ];

    for (const question of questions) {
      assert.equal(isExplicitReportIntent(question), true);
      assert.equal(selectSidekickTools(question)[0], "crm_run_report");
    }
  });

  it("routes user security questions to the report runner", () => {
    const questions = [
      "Which users have not enabled two-factor authentication?",
      "Which users have not logged in recently?",
      "Show active users by role.",
      "Are there any admin accounts without 2FA?",
      "Which user invites are still pending?",
      "Which accounts look inactive?",
    ];

    for (const question of questions) {
      assert.equal(isExplicitReportIntent(question), true);
      assert.equal(selectSidekickTools(question)[0], "crm_run_report");
    }
  });

  it("routes storage asset questions to the report runner", () => {
    const questions = [
      "How much storage are we using?",
      "Which files are taking the most space?",
      "Which records have uploaded files?",
      "Show recent uploads.",
      "Are there files without an owner or linked record?",
    ];

    for (const question of questions) {
      assert.equal(isExplicitReportIntent(question), true);
      assert.equal(selectSidekickTools(question)[0], "crm_run_report");
    }
  });

  it("routes task workload questions to the report runner", () => {
    const questions = [
      "Which tasks are overdue by assignee?",
      "What tasks are due today?",
      "Show completed tasks by status.",
      "Which follow-ups are blocked?",
      "Which tasks are unassigned?",
    ];

    for (const question of questions) {
      assert.equal(isExplicitReportIntent(question), true);
      assert.equal(selectSidekickTools(question)[0], "crm_run_report");
    }
  });

  it("routes communication activity questions to the report runner", () => {
    const questions = [
      "Which users sent the most emails?",
      "How many SMS messages did we send this week?",
      "Which lead owners get the most inbound replies?",
      "Which communications are missing linked contacts?",
    ];

    for (const question of questions) {
      assert.equal(isExplicitReportIntent(question), true);
      assert.equal(selectSidekickTools(question)[0], "crm_run_report");
    }
  });

  it("routes discovery answer questions to the report runner", () => {
    assert.equal(
      selectSidekickTools("What budget ranges do leads choose most?")[0],
      "crm_run_report",
    );
    assert.equal(
      selectSidekickTools(
        "Which ecommerce platforms are selected in Discovery?",
      )[0],
      "crm_run_report",
    );
  });

  it("routes sales lifecycle quality questions to the report runner", () => {
    assert.equal(
      selectSidekickTools("Which owners have the best contacted rate?")[0],
      "crm_run_report",
    );
    assert.equal(
      selectSidekickTools("What are our most common lost reasons?")[0],
      "crm_run_report",
    );
    assert.equal(
      selectSidekickTools("Show stage transitions this month")[0],
      "crm_run_report",
    );
  });

  it("routes telephony queue and transcript questions to the report runner", () => {
    assert.equal(
      selectSidekickTools("Which queue assignees have the longest wait time?")[0],
      "crm_run_report",
    );
    assert.equal(
      selectSidekickTools("Which recordings still need transcripts?")[0],
      "crm_run_report",
    );
  });

  it("routes setup readiness questions to the report runner", () => {
    assert.equal(
      selectSidekickTools("What setup items are outstanding before handover?")[0],
      "crm_run_report",
    );
    assert.equal(
      selectSidekickTools("Show client setup readiness by status")[0],
      "crm_run_report",
    );
  });

  it("keeps read-only report creation out of write-action blocking", () => {
    assert.equal(
      isWriteActionRequest("Create a chart of leads by source"),
      false,
    );
    assert.equal(
      isWriteActionRequest("Create a follow-up task for this lead"),
      true,
    );
  });

  it("detects Discovery pack write-plan requests separately", () => {
    assert.equal(
      isDiscoveryPackWritePlanRequest(
        "Create a discovery question pack for ecommerce leads",
      ),
      true,
    );
  });

  it("only uses current-page context for current record language", () => {
    assert.equal(shouldUseCurrentPageContext("Summarise this lead"), true);
    assert.equal(shouldUseCurrentPageContext("What should I do here?"), true);
    assert.equal(
      shouldUseCurrentPageContext("Which lead source is best this month?"),
      false,
    );
  });
});

describe("Sidekick page path parsing", () => {
  it("parses sales and contact ids from CRM routes", () => {
    assert.deepEqual(sidekickPathParts("/sales/cmr123?tab=lead"), [
      "sales",
      "cmr123",
    ]);
    assert.equal(
      sidekickEntityIdFromPath({ pathname: "/sales/cmr123" }, "sales"),
      "cmr123",
    );
    assert.equal(
      sidekickEntityIdFromPath({ pathname: "/contacts/customer%201" }, "contacts"),
      "customer 1",
    );
  });

  it("returns null when the expected route segment is absent", () => {
    assert.equal(
      sidekickEntityIdFromPath({ pathname: "/settings/sidekick" }, "sales"),
      null,
    );
  });
});
