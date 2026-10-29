"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  emailMessageWhereWithAccess,
  salesOpportunityWhereWithAccess,
} from "@/lib/crm-resource-access";
import { prisma } from "@/lib/prisma";
import { bumpRealtimeTopics, realtimeTopics } from "@/lib/realtime/topics";

export type InboxSaleOption = {
  companyName: string | null;
  contactEmail: string | null;
  contactName: string | null;
  id: string;
  ownerName: string | null;
  stage: string;
  title: string;
};

export type InboxSaleSearchResult =
  | { ok: true; sales: InboxSaleOption[] }
  | { ok: false; message: string; sales: [] };

export type InboxThreadAssignmentResult =
  | {
      ok: true;
      message: string;
      opportunity: { id: string; stage: string; title: string };
    }
  | { ok: false; message: string };

function jsonInput(value: Prisma.JsonValue | null) {
  if (value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function opportunitySearchWhere(
  query: string,
): Prisma.SalesOpportunityWhereInput {
  if (!query) return {};

  return {
    OR: [
      { title: { contains: query, mode: "insensitive" } },
      { company: { name: { contains: query, mode: "insensitive" } } },
      {
        contact: {
          OR: [
            { firstName: { contains: query, mode: "insensitive" } },
            { lastName: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
          ],
        },
      },
      { owner: { name: { contains: query, mode: "insensitive" } } },
    ],
  };
}

export async function searchInboxSales(
  messageId: string,
  queryInput: string,
): Promise<InboxSaleSearchResult> {
  const user = await requireUser();
  const message = await prisma.emailMessage.findFirst({
    where: emailMessageWhereWithAccess(user, { id: messageId }),
    select: { contactId: true, id: true },
  });

  if (!message) {
    return { ok: false, message: "Email not found or unavailable.", sales: [] };
  }

  const query = queryInput.trim().slice(0, 120);
  const sales = await prisma.salesOpportunity.findMany({
    where: salesOpportunityWhereWithAccess(user, opportunitySearchWhere(query)),
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      company: { select: { name: true } },
      contact: {
        select: { email: true, firstName: true, lastName: true },
      },
      contactId: true,
      id: true,
      owner: { select: { name: true } },
      stage: true,
      title: true,
    },
  });

  sales.sort((left, right) => {
    const leftMatchesContact = Boolean(
      message.contactId && left.contactId === message.contactId,
    );
    const rightMatchesContact = Boolean(
      message.contactId && right.contactId === message.contactId,
    );
    return Number(rightMatchesContact) - Number(leftMatchesContact);
  });

  return {
    ok: true,
    sales: sales.slice(0, 30).map((sale) => ({
      companyName: sale.company?.name ?? null,
      contactEmail: sale.contact?.email ?? null,
      contactName: sale.contact
        ? `${sale.contact.firstName} ${sale.contact.lastName}`.trim() || null
        : null,
      id: sale.id,
      ownerName: sale.owner?.name ?? null,
      stage: sale.stage,
      title: sale.title,
    })),
  };
}

export async function assignInboxThreadToSale(
  messageId: string,
  opportunityId: string,
): Promise<InboxThreadAssignmentResult> {
  const user = await requireUser();
  const message = await prisma.emailMessage.findFirst({
    where: emailMessageWhereWithAccess(user, { id: messageId }),
    select: {
      contactId: true,
      id: true,
      mailboxId: true,
      opportunityId: true,
      provider: true,
      providerThreadId: true,
    },
  });

  if (!message) {
    return { ok: false, message: "Email not found or unavailable." };
  }
  if (
    message.provider !== "gmail" ||
    !message.mailboxId ||
    !message.providerThreadId
  ) {
    return {
      ok: false,
      message: "Only Gmail conversations can be assigned as a complete thread.",
    };
  }
  const mailboxId = message.mailboxId;
  const providerThreadId = message.providerThreadId;

  const opportunity = await prisma.salesOpportunity.findFirst({
    where: salesOpportunityWhereWithAccess(user, { id: opportunityId }),
    select: { contactId: true, id: true, stage: true, title: true },
  });

  if (!opportunity) {
    return { ok: false, message: "Sale not found or unavailable." };
  }

  const threadMessages = await prisma.emailMessage.findMany({
    where: {
      mailboxId,
      provider: "gmail",
      providerThreadId,
    },
    orderBy: { receivedAt: "asc" },
    select: {
      attachmentsArchive: { select: { fileAssetId: true } },
      contactId: true,
      direction: true,
      fromAddress: true,
      id: true,
      metadata: true,
      opportunityId: true,
      providerMessageId: true,
      receivedAt: true,
      salesCommunicationId: true,
      subject: true,
      summary: true,
      textBody: true,
      toAddress: true,
    },
  });

  if (!threadMessages.length) {
    return {
      ok: false,
      message: "No Gmail messages were found for this thread.",
    };
  }

  const previousOpportunityIds = Array.from(
    new Set(
      threadMessages
        .map((item) => item.opportunityId)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const previousContactIds = Array.from(
    new Set(
      threadMessages
        .map((item) => item.contactId)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const fileAssetIds = Array.from(
    new Set(
      threadMessages.flatMap((item) =>
        item.attachmentsArchive
          .map((attachment) => attachment.fileAssetId)
          .filter((value): value is string => Boolean(value)),
      ),
    ),
  );

  if (user.role !== "ADMIN" && previousOpportunityIds.length) {
    const accessiblePreviousSales = await prisma.salesOpportunity.count({
      where: salesOpportunityWhereWithAccess(user, {
        id: { in: previousOpportunityIds },
      }),
    });
    if (accessiblePreviousSales !== previousOpportunityIds.length) {
      return {
        ok: false,
        message:
          "This Gmail thread includes a sale that is not available to you.",
      };
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const item of threadMessages) {
      const communicationData = {
        body: item.textBody,
        channel: "EMAIL" as const,
        contactId: opportunity.contactId,
        direction: item.direction,
        fromAddress: item.fromAddress,
        metadata: jsonInput(item.metadata),
        occurredAt: item.receivedAt,
        opportunityId: opportunity.id,
        subject: item.subject ?? "Email",
        summary: item.summary,
        toAddress: item.toAddress,
      };

      let communicationId = item.salesCommunicationId;
      if (communicationId) {
        await tx.salesCommunication.update({
          where: { id: communicationId },
          data: communicationData,
        });
      } else {
        const communication = await tx.salesCommunication.create({
          data: {
            ...communicationData,
            externalId:
              item.providerMessageId ?? `gmail:${mailboxId}:${item.id}`,
          },
          select: { id: true },
        });
        communicationId = communication.id;
      }

      await tx.emailMessage.update({
        where: { id: item.id },
        data: {
          contactId: opportunity.contactId,
          opportunityId: opportunity.id,
          salesCommunicationId: communicationId,
        },
      });
    }

    await tx.emailThreadLink.upsert({
      where: {
        mailboxId_providerThreadId: {
          mailboxId,
          providerThreadId,
        },
      },
      update: {
        contactId: opportunity.contactId,
        opportunityId: opportunity.id,
        source: "manual",
      },
      create: {
        contactId: opportunity.contactId,
        mailboxId,
        opportunityId: opportunity.id,
        providerThreadId,
        source: "manual",
      },
    });

    if (fileAssetIds.length) {
      await tx.fileAsset.updateMany({
        where: { id: { in: fileAssetIds } },
        data: { entityId: opportunity.id, entityType: "sales_opportunity" },
      });
    }

    await tx.auditLog.create({
      data: {
        action: "gmail.thread.assigned_to_sale",
        actorId: user.id,
        entity: "EmailThreadLink",
        entityId: `${mailboxId}:${providerThreadId}`,
        metadata: {
          messageCount: threadMessages.length,
          opportunityId: opportunity.id,
          previousOpportunityIds,
          selectedMessageId: message.id,
        },
      },
    });
  });

  await bumpRealtimeTopics([
    realtimeTopics.inbox,
    realtimeTopics.saleConversation(opportunity.id),
    opportunity.contactId
      ? realtimeTopics.contactConversation(opportunity.contactId)
      : null,
    ...previousOpportunityIds.map(realtimeTopics.saleConversation),
    ...previousContactIds.map(realtimeTopics.contactConversation),
  ]);

  revalidatePath("/inbox");
  revalidatePath(`/sales/${opportunity.id}`);
  if (opportunity.contactId) {
    revalidatePath(`/contacts/${opportunity.contactId}`);
  }
  for (const previousOpportunityId of previousOpportunityIds) {
    if (previousOpportunityId !== opportunity.id) {
      revalidatePath(`/sales/${previousOpportunityId}`);
    }
  }
  for (const previousContactId of previousContactIds) {
    if (previousContactId !== opportunity.contactId) {
      revalidatePath(`/contacts/${previousContactId}`);
    }
  }

  return {
    ok: true,
    message: `Assigned ${threadMessages.length} email${threadMessages.length === 1 ? "" : "s"} in this Gmail thread to ${opportunity.title}.`,
    opportunity: {
      id: opportunity.id,
      stage: opportunity.stage,
      title: opportunity.title,
    },
  };
}

export async function markInboxMessageRead(messageId: string) {
  const user = await requireUser();

  await prisma.emailMessage.updateMany({
    where: emailMessageWhereWithAccess(user, { id: messageId }),
    data: { status: "READ" },
  });

  revalidatePath("/inbox");
}

export async function archiveInboxMessage(messageId: string) {
  const user = await requireUser();

  await prisma.emailMessage.updateMany({
    where: emailMessageWhereWithAccess(user, { id: messageId }),
    data: { status: "ARCHIVED" },
  });

  revalidatePath("/inbox");
}

export async function restoreInboxMessage(messageId: string) {
  const user = await requireUser();

  await prisma.emailMessage.updateMany({
    where: emailMessageWhereWithAccess(user, { id: messageId }),
    data: { status: "READ" },
  });

  revalidatePath("/inbox");
}
