import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import ServerPagination from "@/components/crm-boilerplate/ServerPagination";
import StatusBadge from "@/components/crm-boilerplate/StatusBadge";
import { requireUser } from "@/lib/auth";
import {
  contactWhereForSegment,
  parseContactSegmentCriteria,
  ruleLabel,
} from "@/lib/contact-segments";
import {
  normalizeContactEmailMethods,
  normalizeContactPhoneMethods,
} from "@/lib/contact-methods";
import {
  parsePageSize,
  parsePositiveInteger,
} from "@/lib/navigation/pagination";
import { prisma } from "@/lib/prisma";

type SegmentDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    page?: string | string[];
    pageSize?: string | string[];
  }>;
};

const pageSizes = [10, 25, 50];
const defaultPageSize = 25;

function contactName(contact: { firstName: string; lastName: string }) {
  return `${contact.firstName} ${contact.lastName}`;
}

function directContactLabel(contact: {
  additionalEmails: unknown;
  additionalPhones: unknown;
  email: string | null;
  phone: string | null;
}) {
  return (
    contact.email ??
    normalizeContactEmailMethods(contact.additionalEmails, contact.email)[0]?.email ??
    contact.phone ??
    normalizeContactPhoneMethods(contact.additionalPhones, contact.phone)[0]?.phone ??
    "No direct contact"
  );
}

export default async function ContactSegmentDetailPage({
  params,
  searchParams,
}: SegmentDetailPageProps) {
  const user = await requireUser();
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const requestedPage = parsePositiveInteger(query.page, 1);
  const pageSize = parsePageSize({
    fallback: defaultPageSize,
    options: pageSizes,
    value: query.pageSize,
  });
  const segment = await prisma.contactSegment.findUnique({
    where: { id },
  });

  if (!segment) {
    notFound();
  }

  const criteria = parseContactSegmentCriteria(segment.criteria);

  if (!criteria.success) {
    return (
      <>
        <PageHeader
          title={segment.name}
          description="This segment has criteria that are no longer supported."
        />
        <Link
          href="/contacts/segments"
          className="text-sm font-semibold text-brand-600 hover:text-brand-700"
        >
          Back to segments
        </Link>
      </>
    );
  }

  const where = contactWhereForSegment(criteria.data, user);
  const totalCount = await prisma.contact.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const contacts = await prisma.contact.findMany({
    where,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
    include: {
      additionalEmails: {
        orderBy: { createdAt: "asc" },
        select: { email: true, id: true, label: true },
      },
      additionalPhones: {
        orderBy: { createdAt: "asc" },
        select: { id: true, label: true, phone: true, phoneNormalized: true },
      },
      company: true,
      tagAssignments: {
        include: { tag: true },
        orderBy: { tag: { name: "asc" } },
      },
      _count: {
        select: { opportunities: true, tasks: true, callLogs: true },
      },
    },
  });

  return (
    <>
      <PageHeader
        title={segment.name}
        description={segment.description ?? "Dynamic people segment."}
        actions={
          <Link
            href="/contacts/segments"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 shadow-theme-xs transition hover:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300"
          >
            Segments
          </Link>
        }
      />

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
            Matching people
          </p>
          <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
            {totalCount}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03] md:col-span-2">
          <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
            Criteria
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {criteria.data.rules.map((rule, index) => (
              <span
                key={`${rule.type}-${index}`}
                className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700 dark:bg-white/10 dark:text-gray-300"
              >
                {ruleLabel(rule)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-white/[0.02]">
              <tr className="text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                <th className="px-5 py-3">Person</th>
                <th className="px-5 py-3">Company</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Tags</th>
                <th className="px-5 py-3">Activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {contacts.map((contact) => (
                <tr
                  key={contact.id}
                  className="text-sm text-gray-700 dark:text-gray-300"
                >
                  <td className="px-5 py-4">
                    <Link
                      href={`/contacts/${contact.id}`}
                      className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
                    >
                      {contactName(contact)}
                    </Link>
                    <p className="mt-1 text-xs text-gray-500">
                      {directContactLabel(contact)}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    {contact.company?.name ?? contact.companyName ?? "None"}
                  </td>
                  <td className="px-5 py-4">{contact.role ?? "None"}</td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {contact.tagAssignments.length ? (
                        contact.tagAssignments.slice(0, 3).map((assignment) => (
                          <StatusBadge key={assignment.tagId}>
                            {assignment.tag.name}
                          </StatusBadge>
                        ))
                      ) : (
                        <span className="text-gray-400">No tags</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400">
                    {contact._count.opportunities} leads · {contact._count.callLogs} calls · {contact._count.tasks} tasks
                  </td>
                </tr>
              ))}
              {!contacts.length ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-8 text-center text-sm text-gray-500"
                  >
                    No people currently match this segment.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <ServerPagination
          basePath={`/contacts/segments/${segment.id}`}
          page={currentPage}
          pageSize={pageSize}
          pageSizeOptions={pageSizes}
          totalCount={totalCount}
        />
      </section>
    </>
  );
}
