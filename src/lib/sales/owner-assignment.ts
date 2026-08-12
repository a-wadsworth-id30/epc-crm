export type SalesOwnerAssignmentUser = {
  id: string;
  role: "ADMIN" | "USER";
};

export type SalesOwnerOption = {
  id: string;
  name: string;
};

export function saleOwnerOptionsForUser(
  activeUsers: SalesOwnerOption[],
  currentUser: SalesOwnerAssignmentUser,
) {
  if (currentUser.role === "ADMIN") {
    return activeUsers;
  }

  return activeUsers.filter((user) => user.id === currentUser.id);
}

export function validateSaleOwnerAssignment({
  activeOwnerIds,
  currentUser,
  ownerId,
}: {
  activeOwnerIds: Set<string>;
  currentUser: SalesOwnerAssignmentUser;
  ownerId: string | null;
}):
  | {
      ok: true;
      ownerId: string | null;
    }
  | {
      ok: false;
      message: string;
    } {
  if (!ownerId) {
    return { ok: true, ownerId: null };
  }

  if (currentUser.role !== "ADMIN" && ownerId !== currentUser.id) {
    return {
      ok: false,
      message: "Only admins can assign sales to another owner.",
    };
  }

  if (!activeOwnerIds.has(ownerId)) {
    return {
      ok: false,
      message: "Choose an active owner.",
    };
  }

  return { ok: true, ownerId };
}
