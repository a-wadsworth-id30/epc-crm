export type CompanyAffiliationLinkDecision =
  | { ok: true; action: "linked_primary" | "linked_additional" | "unchanged" }
  | { ok: false; message: string };

export function companyAffiliationLinkDecision({
  currentPrimaryCompanyId,
  existingCompanyIds,
  targetCompanyId,
}: {
  currentPrimaryCompanyId: string | null;
  existingCompanyIds: Iterable<string>;
  targetCompanyId: string;
}): CompanyAffiliationLinkDecision {
  if (new Set(existingCompanyIds).has(targetCompanyId)) {
    return { ok: true, action: "unchanged" };
  }

  return {
    ok: true,
    action: currentPrimaryCompanyId ? "linked_additional" : "linked_primary",
  };
}

export type CompanyAffiliationUnlinkDecision =
  | { ok: true; action: "unlinked_primary" | "unlinked_additional" }
  | { ok: false; message: string };

export function companyAffiliationUnlinkDecision({
  affiliationIsPrimary,
  additionalAffiliationCount,
}: {
  affiliationIsPrimary: boolean;
  additionalAffiliationCount: number;
}): CompanyAffiliationUnlinkDecision {
  if (affiliationIsPrimary && additionalAffiliationCount > 0) {
    return {
      ok: false,
      message:
        "Make another Company primary before unlinking this primary relationship.",
    };
  }

  return {
    ok: true,
    action: affiliationIsPrimary ? "unlinked_primary" : "unlinked_additional",
  };
}
