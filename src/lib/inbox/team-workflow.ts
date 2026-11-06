import type { EmailTeamStatus, Prisma } from "@prisma/client";
import { emailMessageUnreadWhere } from "@/lib/inbox/read-state";

type EmailWorkflowScope = {
  id: string;
  mailboxId: string | null;
  provider: string;
  providerThreadId: string | null;
};

type ExistingThreadWorkflow = {
  assignedAt: Date | null;
  assignedUserId: string | null;
  teamStatus: EmailTeamStatus;
} | null;

export function newEmailWorkflowState(
  direction: "INBOUND" | "OUTBOUND",
  threadWorkflow: ExistingThreadWorkflow,
) {
  return {
    assignedAt: threadWorkflow?.assignedAt ?? null,
    assignedUserId: threadWorkflow?.assignedUserId ?? null,
    teamStatus:
      direction === "INBOUND"
        ? ("OPEN" as const)
        : (threadWorkflow?.teamStatus ?? ("OPEN" as const)),
  };
}

export function emailWorkflowScopeWhere(
  message: EmailWorkflowScope,
): Prisma.EmailMessageWhereInput {
  if (
    message.provider === "gmail" &&
    message.mailboxId &&
    message.providerThreadId
  ) {
    return {
      mailboxId: message.mailboxId,
      provider: "gmail",
      providerThreadId: message.providerThreadId,
    };
  }

  return { id: message.id };
}

export function emailTeamLaneWhere(
  lane: string,
  userId: string,
): Prisma.EmailMessageWhereInput {
  if (lane === "unread") {
    return {
      AND: [
        emailMessageUnreadWhere(userId),
        { teamStatus: { not: "RESOLVED" } },
      ],
    };
  }
  if (lane === "mine") {
    return {
      assignedUserId: userId,
      status: { not: "ARCHIVED" },
      teamStatus: { not: "RESOLVED" },
    };
  }
  if (lane === "unassigned") {
    return {
      assignedUserId: null,
      status: { not: "ARCHIVED" },
      teamStatus: { not: "RESOLVED" },
    };
  }
  if (lane === "waiting") {
    return { status: { not: "ARCHIVED" }, teamStatus: "WAITING" };
  }
  if (lane === "resolved") {
    return { status: { not: "ARCHIVED" }, teamStatus: "RESOLVED" };
  }
  if (lane === "matched") {
    return {
      opportunityId: { not: null },
      status: { not: "ARCHIVED" },
      teamStatus: { not: "RESOLVED" },
    };
  }
  if (lane === "unmatched") {
    return {
      opportunityId: null,
      status: { not: "ARCHIVED" },
      teamStatus: { not: "RESOLVED" },
    };
  }
  if (lane === "archived") return { status: "ARCHIVED" };

  return {
    status: { not: "ARCHIVED" },
    teamStatus: { not: "RESOLVED" },
  };
}
