import type { SalesParticipantRole } from "@prisma/client";

export const salesParticipantRoles = [
  "PRIMARY_CUSTOMER",
  "JOINT_APPLICANT",
  "DECISION_MAKER",
  "BILLING_CONTACT",
  "INSTALLER",
  "TECHNICAL_CONTACT",
] as const satisfies readonly SalesParticipantRole[];

export const salesParticipantRoleOptions = [
  {
    label: "Primary customer",
    value: "PRIMARY_CUSTOMER",
  },
  {
    label: "Joint applicant",
    value: "JOINT_APPLICANT",
  },
  {
    label: "Decision-maker",
    value: "DECISION_MAKER",
  },
  {
    label: "Billing contact",
    value: "BILLING_CONTACT",
  },
  {
    label: "Installer",
    value: "INSTALLER",
  },
  {
    label: "Technical contact",
    value: "TECHNICAL_CONTACT",
  },
] as const satisfies ReadonlyArray<{
  label: string;
  value: SalesParticipantRole;
}>;

export function salesParticipantRoleLabel(role: SalesParticipantRole) {
  return (
    salesParticipantRoleOptions.find((option) => option.value === role)?.label ??
    "Participant"
  );
}

export function saleParticipantRoleChangeDecision({
  isCurrentPrimary,
  nextRole,
}: {
  isCurrentPrimary: boolean;
  nextRole: SalesParticipantRole;
}) {
  if (isCurrentPrimary && nextRole !== "PRIMARY_CUSTOMER") {
    return {
      message:
        "The Sale's primary contact must keep the Primary customer role. Choose another primary customer first.",
      ok: false as const,
    };
  }

  return { ok: true as const };
}
