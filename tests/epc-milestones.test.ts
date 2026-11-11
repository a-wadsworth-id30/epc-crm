import assert from "node:assert/strict";
import test from "node:test";
import { epcMilestones } from "../src/lib/sales/epc-milestones";

test("EPC milestones reuse existing stage requirement evidence", () => {
  const milestones = epcMilestones({
    communications: [
      {
        body: null,
        direction: "OUTBOUND",
        subject: "Your proposal",
        summary: "Proposal sent to customer",
      },
    ],
    files: [
      {
        documentFolder: "surveys-and-site-photos",
        documentUploadType: null,
        notes: null,
        originalName: "site-survey.pdf",
        tags: ["survey"],
      },
    ],
    leadScope: { depositStatus: "received" },
    tasks: [],
  });

  assert.deepEqual(
    milestones.map((milestone) => [milestone.action, milestone.status]),
    [
      ["required_documents_uploaded", "evidenced"],
      ["survey_completed", "evidenced"],
      ["proposal_issued", "evidenced"],
      ["deposit_received", "evidenced"],
      ["design_approved", "not_evidenced"],
    ],
  );
});

test("EPC milestones do not invent completion without evidence", () => {
  const milestones = epcMilestones({
    communications: [],
    files: [],
    leadScope: null,
    tasks: [],
  });

  assert.equal(
    milestones.every((milestone) => milestone.status === "not_evidenced"),
    true,
  );
});
