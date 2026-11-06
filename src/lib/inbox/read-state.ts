import type { EmailMessageStatus, Prisma } from "@prisma/client";

type EmailMessageWithUserReadState = {
  status: EmailMessageStatus;
  userStates?: Array<{ readAt: Date | null }>;
};

export function effectiveEmailMessageStatus(
  message: EmailMessageWithUserReadState,
): EmailMessageStatus {
  if (message.status === "ARCHIVED") return "ARCHIVED";
  if (message.userStates?.length) {
    return message.userStates.some((state) => state.readAt) ? "READ" : "UNREAD";
  }
  return message.status;
}

export function emailMessageUnreadWhere(
  userId: string,
): Prisma.EmailMessageWhereInput {
  return {
    status: { not: "ARCHIVED" },
    OR: [
      {
        userStates: {
          some: {
            userId,
            readAt: null,
          },
        },
      },
      {
        status: "UNREAD",
        userStates: { none: { userId } },
      },
    ],
  };
}
