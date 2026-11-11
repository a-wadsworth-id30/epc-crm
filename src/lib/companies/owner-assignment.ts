export type CompanyOwnerAssignmentUser = {
  id: string;
  role: "ADMIN" | "USER";
};

export type CompanyOwnerOption = {
  id: string;
  name: string;
};

export const LEGACY_COMPANY_OWNER_VALUE = "__legacy_company_owner__";

export function companyOwnerOptionsForUser(
  activeUsers: CompanyOwnerOption[],
  currentUser: CompanyOwnerAssignmentUser,
) {
  if (currentUser.role === "ADMIN") return activeUsers;
  return activeUsers.filter((user) => user.id === currentUser.id);
}

export function validateCompanyOwnerAssignment({
  activeOwnerIds,
  currentUser,
  ownerUserId,
}: {
  activeOwnerIds: Set<string>;
  currentUser: CompanyOwnerAssignmentUser;
  ownerUserId: string | null;
}): { ok: true; ownerUserId: string | null } | { message: string; ok: false } {
  if (!ownerUserId) return { ok: true, ownerUserId: null };

  if (currentUser.role !== "ADMIN" && ownerUserId !== currentUser.id) {
    return {
      ok: false,
      message: "Only admins can assign a Company to another owner.",
    };
  }

  if (!activeOwnerIds.has(ownerUserId)) {
    return { ok: false, message: "Choose an active Company owner." };
  }

  return { ok: true, ownerUserId };
}
