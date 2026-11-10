export type CompanyContactLinkDecision =
  | { ok: true; action: "linked" | "moved" | "unchanged" }
  | { ok: false; message: string };

export function companyContactLinkDecision({
  allowMove,
  currentCompanyId,
  expectedCurrentCompanyId,
  targetCompanyId,
}: {
  allowMove: boolean;
  currentCompanyId: string | null;
  expectedCurrentCompanyId: string | null;
  targetCompanyId: string;
}): CompanyContactLinkDecision {
  if (currentCompanyId === targetCompanyId) {
    return { ok: true, action: "unchanged" };
  }
  if (currentCompanyId !== expectedCurrentCompanyId) {
    return {
      ok: false,
      message:
        "The person's company changed. Refresh and review before moving them.",
    };
  }
  if (currentCompanyId && !allowMove) {
    return {
      ok: false,
      message:
        "This person already belongs to another company. Use Move to confirm the reassignment.",
    };
  }
  return { ok: true, action: currentCompanyId ? "moved" : "linked" };
}
