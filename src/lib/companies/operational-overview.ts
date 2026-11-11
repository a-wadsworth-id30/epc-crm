export type CompanyOperationalOverviewInput = {
  activeSalesCount: number;
  activeSalesMissingNextStepCount: number;
  hasOwner: boolean;
  hasPrimaryContact: boolean;
  latestActivityAt: string | null;
  linkedContactsCount: number;
  missingProfileFieldCount: number;
  missingRequiredDocumentCount: number;
  openTaskCount: number;
  overdueTaskCount: number;
  profileIsConfigured: boolean;
};

export type CompanyOperationalAttention = {
  count: number;
  key:
    | "overdue-tasks"
    | "missing-next-actions"
    | "missing-documents"
    | "missing-profile"
    | "missing-owner"
    | "missing-primary-contact";
  label: string;
  tab: "activity" | "contacts" | "documents" | "leads" | "overview";
};

export type CompanyOperationalOverview = {
  activeSalesCount: number;
  attention: CompanyOperationalAttention[];
  latestActivityAt: string | null;
  openTaskCount: number;
};

export function companyOperationalOverview(
  input: CompanyOperationalOverviewInput,
): CompanyOperationalOverview {
  const attention: CompanyOperationalAttention[] = [];

  if (input.overdueTaskCount > 0) {
    attention.push({
      count: input.overdueTaskCount,
      key: "overdue-tasks",
      label: `${input.overdueTaskCount} overdue task${input.overdueTaskCount === 1 ? "" : "s"}`,
      tab: "activity",
    });
  }

  if (input.activeSalesMissingNextStepCount > 0) {
    attention.push({
      count: input.activeSalesMissingNextStepCount,
      key: "missing-next-actions",
      label: `${input.activeSalesMissingNextStepCount} active Sale${input.activeSalesMissingNextStepCount === 1 ? "" : "s"} without a next action`,
      tab: "leads",
    });
  }

  if (input.missingRequiredDocumentCount > 0) {
    attention.push({
      count: input.missingRequiredDocumentCount,
      key: "missing-documents",
      label: `${input.missingRequiredDocumentCount} required document${input.missingRequiredDocumentCount === 1 ? "" : "s"} missing`,
      tab: "documents",
    });
  }

  if (input.profileIsConfigured && input.missingProfileFieldCount > 0) {
    attention.push({
      count: input.missingProfileFieldCount,
      key: "missing-profile",
      label: `${input.missingProfileFieldCount} tracked profile field${input.missingProfileFieldCount === 1 ? "" : "s"} incomplete`,
      tab: "overview",
    });
  }

  if (!input.hasOwner) {
    attention.push({
      count: 1,
      key: "missing-owner",
      label: "Company owner is unassigned",
      tab: "overview",
    });
  }

  if (input.linkedContactsCount > 0 && !input.hasPrimaryContact) {
    attention.push({
      count: 1,
      key: "missing-primary-contact",
      label: "No primary Company contact selected",
      tab: "contacts",
    });
  }

  return {
    activeSalesCount: input.activeSalesCount,
    attention,
    latestActivityAt: input.latestActivityAt,
    openTaskCount: input.openTaskCount,
  };
}
