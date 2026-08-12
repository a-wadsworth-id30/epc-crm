import Link from "next/link";
import { RefreshCw, Trash2 } from "lucide-react";
import EmptyState from "@/components/crm-boilerplate/EmptyState";
import LazyContactSegmentBuilder from "@/components/crm-boilerplate/LazyContactSegmentBuilder";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import SectionHeader from "@/components/crm-boilerplate/SectionHeader";
import StatusBadge from "@/components/crm-boilerplate/StatusBadge";
import {
  deleteContactSegmentAction,
  refreshContactSegmentAction,
} from "@/lib/actions/contact-segments";
import { requireUser } from "@/lib/auth";
import {
  countContactsForSegment,
  parseContactSegmentCriteria,
  ruleLabel,
} from "@/lib/contact-segments";
import { prisma } from "@/lib/prisma";

function formatDateTime(value: Date | null) {
  if (!value) return "Not evaluated";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export default async function ContactSegmentsPage() {
  const user = await requireUser();
  const segments = await prisma.contactSegment.findMany({
    where: { audience: "PEOPLE" },
    orderBy: { updatedAt: "desc" },
    include: {
      createdByUser: {
        select: { firstName: true, lastName: true, name: true },
      },
    },
  });
  const segmentRows = await Promise.all(
    segments.map(async (segment) => {
      const criteria = parseContactSegmentCriteria(segment.criteria);
      const visibleMatchCount = criteria.success
        ? await countContactsForSegment(criteria.data, user)
        : segment.matchCount;
      const creator = segment.createdByUser
        ? [segment.createdByUser.firstName, segment.createdByUser.lastName]
            .filter(Boolean)
            .join(" ") || segment.createdByUser.name
        : "Unknown";

      return {
        canManage: user.role === "ADMIN" || segment.createdByUserId === user.id,
        criteria,
        creator,
        segment,
        visibleMatchCount,
      };
    }),
  );

  return (
    <>
      <PageHeader
        title="Segments"
        description="Create reusable groups of people from CRM activity, sales history, products, tags and contact fields."
      />

      <div className="space-y-6">
        <LazyContactSegmentBuilder />

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <SectionHeader
            title="Saved segments"
            description="Dynamic groups re-evaluated from the current CRM data."
            help="Segments store safe CRM criteria rather than fixed membership, so counts can be refreshed as contacts and sales activity changes."
          />

          {segmentRows.length ? (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {segmentRows.map((row) => {
                const { canManage, criteria, creator, segment, visibleMatchCount } = row;
                return (
                  <article
                    key={segment.id}
                    className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_220px]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/contacts/segments/${segment.id}`}
                          className="text-base font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
                        >
                          {segment.name}
                        </Link>
                        <StatusBadge>{segment.audience === "PEOPLE" ? "People" : "Companies"}</StatusBadge>
                      </div>
                      {segment.description ? (
                        <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
                          {segment.description}
                        </p>
                      ) : null}
                      {segment.aiSummary ? (
                        <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                          {segment.aiSummary}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {criteria.success
                          ? criteria.data.rules.slice(0, 5).map((rule, index) => (
                              <span
                                key={`${segment.id}-${index}`}
                                className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700 dark:bg-white/10 dark:text-gray-300"
                              >
                                {ruleLabel(rule)}
                              </span>
                            ))
                          : (
                              <span className="text-sm text-error-600 dark:text-error-300">
                                Criteria need review
                              </span>
                            )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 lg:items-end">
                      <div className="text-left lg:text-right">
                        <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                          {visibleMatchCount}
                        </p>
                        <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                          matching people
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Updated {formatDateTime(segment.lastEvaluatedAt)}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          Created by {creator}
                        </p>
                      </div>
                      {canManage ? (
                        <div className="flex gap-2">
                        <form action={refreshContactSegmentAction}>
                          <input type="hidden" name="id" value={segment.id} />
                          <button
                            type="submit"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50 hover:text-brand-600 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.06]"
                            aria-label={`Refresh ${segment.name}`}
                          >
                            <RefreshCw className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </form>
                        <form action={deleteContactSegmentAction}>
                          <input type="hidden" name="id" value={segment.id} />
                          <button
                            type="submit"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-error-50 hover:text-error-600 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-error-900/20"
                            aria-label={`Delete ${segment.name}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </form>
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="p-5">
              <EmptyState
                title="No segments yet"
                description="Use the segment builder to create your first dynamic group of people."
              />
            </div>
          )}
        </section>
      </div>
    </>
  );
}
