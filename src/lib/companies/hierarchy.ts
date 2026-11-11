export type CompanyHierarchyDecision =
  | { ok: true }
  | { message: string; ok: false };

export function companyHierarchyDecision({
  ancestorIds,
  companyId,
  parentCompanyId,
}: {
  ancestorIds: string[];
  companyId: string;
  parentCompanyId: string | null;
}): CompanyHierarchyDecision {
  if (!parentCompanyId) return { ok: true };

  if (parentCompanyId === companyId) {
    return { ok: false, message: "A Company cannot be its own parent." };
  }

  if (ancestorIds.includes(companyId)) {
    return {
      ok: false,
      message: "This parent would create a circular Company hierarchy.",
    };
  }

  return { ok: true };
}
