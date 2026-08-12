import type { Prisma } from "@prisma/client";
import Link from "next/link";
import LazyInboxClient from "@/components/crm-boilerplate/LazyInboxClient";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import RealtimePageRefresh from "@/components/crm-boilerplate/RealtimePageRefresh";
import { requireUser } from "@/lib/auth";
import { emailMessageWhereWithAccess } from "@/lib/crm-resource-access";
import {
  inboxMessageSummarySelect,
  serializeInboxMessageSummary,
} from "@/lib/inbox/messages";
import {
  parsePageSize,
  parsePositiveInteger,
} from "@/lib/navigation/pagination";
import { prisma } from "@/lib/prisma";
import { realtimeTopics } from "@/lib/realtime/topic-names";

type InboxPageProps = {
  searchParams?: Promise<{
    lane?: string | string[];
    message?: string | string[];
    page?: string | string[];
    pageSize?: string | string[];
    q?: string | string[];
  }>;
};

const inboxPageSizes = [10, 25, 50];
const defaultInboxPageSize = 25;

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function laneWhere(lane: string): Prisma.EmailMessageWhereInput {
  if (lane === "unread") return { status: "UNREAD" };
  if (lane === "matched") return { opportunityId: { not: null } };
  if (lane === "unmatched") return { opportunityId: null };
  if (lane === "archived") return { status: "ARCHIVED" };
  return { status: { not: "ARCHIVED" } };
}

function searchWhere(query: string): Prisma.EmailMessageWhereInput {
  if (!query) return {};

  return {
    OR: [
      { fromAddress: { contains: query, mode: "insensitive" } },
      { fromName: { contains: query, mode: "insensitive" } },
      { subject: { contains: query, mode: "insensitive" } },
      { summary: { contains: query, mode: "insensitive" } },
      { toAddress: { contains: query, mode: "insensitive" } },
      {
        contact: {
          OR: [
            { firstName: { contains: query, mode: "insensitive" } },
            { lastName: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
          ],
        },
      },
      {
        opportunity: {
          title: { contains: query, mode: "insensitive" },
        },
      },
    ],
  };
}

export default async function InboxPage({ searchParams }: InboxPageProps) {
  const user = await requireUser();

  const params = (await searchParams) ?? {};
  const lane = singleParam(params.lane) ?? "";
  const query = (singleParam(params.q) ?? "").trim();
  const selectedMessageId = singleParam(params.message);
  const requestedPage = parsePositiveInteger(params.page, 1);
  const pageSize = parsePageSize({
    fallback: defaultInboxPageSize,
    options: inboxPageSizes,
    value: params.pageSize,
  });
  const where: Prisma.EmailMessageWhereInput = {
    AND: [
      emailMessageWhereWithAccess(user),
      laneWhere(lane),
      searchWhere(query),
    ],
  };

  const [totalCount, allCount, unreadCount, matchedCount, unmatchedCount, archivedCount] =
    await Promise.all([
      prisma.emailMessage.count({ where }),
      prisma.emailMessage.count({
        where: emailMessageWhereWithAccess(user, { status: { not: "ARCHIVED" } }),
      }),
      prisma.emailMessage.count({
        where: emailMessageWhereWithAccess(user, { status: "UNREAD" }),
      }),
      prisma.emailMessage.count({
        where: emailMessageWhereWithAccess(user, {
          status: { not: "ARCHIVED" },
          opportunityId: { not: null },
        }),
      }),
      prisma.emailMessage.count({
        where: emailMessageWhereWithAccess(user, {
          status: { not: "ARCHIVED" },
          opportunityId: null,
        }),
      }),
      prisma.emailMessage.count({
        where: emailMessageWhereWithAccess(user, { status: "ARCHIVED" }),
      }),
    ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const messages = await prisma.emailMessage.findMany({
    where,
    orderBy: { receivedAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: inboxMessageSummarySelect,
  });

  return (
    <>
      <RealtimePageRefresh topics={[realtimeTopics.inbox]} />
      <PageHeader
        title="Inbox"
        description="Inbound email captured from MailerSend and routed to active leads when the sender matches a contact."
        actions={
          <Link
            href="/settings/integrations/mailersend"
            className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
          >
            MailerSend settings
          </Link>
        }
      />

      <LazyInboxClient
        counts={{
          all: allCount,
          archived: archivedCount,
          matched: matchedCount,
          unmatched: unmatchedCount,
          unread: unreadCount,
        }}
        lane={lane}
        messages={messages.map(serializeInboxMessageSummary)}
        page={page}
        pageSize={pageSize}
        pageSizeOptions={inboxPageSizes}
        query={query}
        selectedMessageId={selectedMessageId}
        totalCount={totalCount}
      />
    </>
  );
}
