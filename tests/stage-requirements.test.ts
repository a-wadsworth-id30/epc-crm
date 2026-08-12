import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseStageRequiredActions,
  stageRequirementHasEvidence,
} from "../src/lib/sales/stage-requirements";

describe("sales stage requirements", () => {
  it("parses requirement metadata safely", () => {
    assert.deepEqual(
      parseStageRequiredActions({
        requiredActions: [
          "survey_completed",
          "unknown",
          "proposal_issued",
          "survey_completed",
        ],
      }),
      ["survey_completed", "proposal_issued"],
    );
  });

  it("passes document upload requirements with any linked file", () => {
    assert.equal(
      stageRequirementHasEvidence({
        action: "required_documents_uploaded",
        evidence: {
          communications: [],
          files: [
            {
              documentFolder: "utility-bills",
              notes: null,
              originalName: "bill.pdf",
              tags: [],
            },
          ],
          leadScope: null,
          tasks: [],
        },
      }),
      true,
    );
  });

  it("requires every configured document type when specified", () => {
    const evidence = {
      communications: [],
      files: [
        {
          documentFolder: "utility-bills",
          documentUploadType: "utility_bill",
          notes: null,
          originalName: "bill.pdf",
          tags: [],
        },
        {
          documentFolder: "floor-plans-and-drawings",
          documentUploadType: null,
          notes: null,
          originalName: "floor-plan.pdf",
          tags: [],
        },
      ],
      leadScope: null,
      tasks: [],
    };

    assert.equal(
      stageRequirementHasEvidence({
        action: "required_documents_uploaded",
        evidence,
        requiredDocumentTypes: ["utility_bill", "floor_plan"],
      }),
      true,
    );
    assert.equal(
      stageRequirementHasEvidence({
        action: "required_documents_uploaded",
        evidence,
        requiredDocumentTypes: ["utility_bill", "design_document"],
      }),
      false,
    );
  });

  it("recognizes proposal and deposit evidence from files and communication", () => {
    const evidence = {
      communications: [
        {
          body: null,
          direction: "OUTBOUND",
          subject: "Deposit received",
          summary: "Payment received from customer.",
        },
      ],
      files: [
        {
          documentFolder: "quotations-and-proposals",
          notes: null,
          originalName: "proposal.pdf",
          tags: ["proposal"],
        },
      ],
      leadScope: null,
      tasks: [],
    };

    assert.equal(
      stageRequirementHasEvidence({ action: "proposal_issued", evidence }),
      true,
    );
    assert.equal(
      stageRequirementHasEvidence({ action: "deposit_received", evidence }),
      true,
    );
  });

  it("recognizes survey completion from completed linked tasks", () => {
    assert.equal(
      stageRequirementHasEvidence({
        action: "survey_completed",
        evidence: {
          communications: [],
          files: [],
          leadScope: null,
          tasks: [
            {
              description: "Engineer visit completed.",
              status: "DONE",
              title: "Survey appointment",
            },
          ],
        },
      }),
      true,
    );
  });

  it("recognizes design approval from lead-scope status", () => {
    assert.equal(
      stageRequirementHasEvidence({
        action: "design_approved",
        evidence: {
          communications: [],
          files: [],
          leadScope: { designStatus: "approved" },
          tasks: [],
        },
      }),
      true,
    );
  });
});
