import {
  stageRequirementHasEvidence,
  type StageRequirementEvidence,
  type StageRequiredAction,
} from "@/lib/sales/stage-requirements";

export type EpcMilestone = {
  action: StageRequiredAction;
  description: string;
  label: string;
  status: "evidenced" | "not_evidenced";
};

const epcMilestoneDefinitions: ReadonlyArray<Omit<EpcMilestone, "status">> = [
  {
    action: "required_documents_uploaded",
    label: "Documents gathered",
    description: "A customer, Company or Sale document is available.",
  },
  {
    action: "survey_completed",
    label: "Site survey",
    description:
      "Survey evidence, a completed visit task or survey status is available.",
  },
  {
    action: "proposal_issued",
    label: "Proposal issued",
    description:
      "A quotation, proposal file or sent communication is available.",
  },
  {
    action: "deposit_received",
    label: "Deposit received",
    description:
      "Payment evidence is available in files, communication or Sale scope.",
  },
  {
    action: "design_approved",
    label: "Design approved",
    description: "Approved design evidence or status is available.",
  },
];

export function epcMilestones(
  evidence: StageRequirementEvidence,
): EpcMilestone[] {
  return epcMilestoneDefinitions.map((milestone) => ({
    ...milestone,
    status: stageRequirementHasEvidence({
      action: milestone.action,
      evidence,
    })
      ? "evidenced"
      : "not_evidenced",
  }));
}
