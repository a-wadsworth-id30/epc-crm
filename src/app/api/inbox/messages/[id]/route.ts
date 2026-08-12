import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { emailMessageWhereWithAccess } from "@/lib/crm-resource-access";
import {
  inboxMessageDetailSelect,
  serializeInboxMessageDetail,
} from "@/lib/inbox/messages";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const user = await requireUser();

  const { id } = await context.params;
  const message = await prisma.emailMessage.findFirst({
    where: emailMessageWhereWithAccess(user, { id }),
    select: inboxMessageDetailSelect,
  });

  if (!message) {
    return NextResponse.json({ message: "Inbox message not found." }, { status: 404 });
  }

  return NextResponse.json({ message: serializeInboxMessageDetail(message) });
}
