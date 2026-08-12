import type { Metadata } from "next";
import Link from "next/link";
import MetricCard from "@/components/crm-boilerplate/MetricCard";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import StatusBadge from "@/components/crm-boilerplate/StatusBadge";
import {
  applySidekickWritePlanAction,
  rejectSidekickWritePlanAction,
} from "@/lib/actions/sidekick-write-plans";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const SIDEKICK_FEEDBACK_ACTION = "ai.sidekick.feedback";
const FEEDBACK_LOOKBACK_DAYS = 30;
const sidekickMetricValueClassName =
  "mt-3 text-2xl font-semibold text-gray-900 dark:text-white";

export const metadata: Metadata = {
  title: "Sidekick | iD30 CRM",
};

type FeedbackRating = "positive" | "negative" | "unknown";

function jsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => stringValue(item))
    .filter((item): item is string => Boolean(item));
}

function formatDate(date: Date | null) {
  if (!date) return "Not set";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function planPreview(plan: unknown) {
  const data = jsonObject(plan);
  const template = jsonObject(data.template);
  const questions = Array.isArray(data.questions) ? data.questions : [];

  return {
    kind: stringValue(data.kind) ?? "Unknown plan",
    replaceQuestions: data.replaceQuestions === true,
    templateName: stringValue(template.name) ?? "Untitled Discovery pack",
    templateScope: stringValue(template.scope) ?? "Unknown scope",
    questions: questions
      .map((question) => jsonObject(question))
      .map((question) => ({
        answerType: stringValue(question.answerType) ?? "TEXT",
        label: stringValue(question.label) ?? "Untitled question",
        required: question.required === true,
      })),
  };
}

function metricLabel(value: number, singular: string, plural = `${singular}s`) {
  return value === 1 ? `1 ${singular}` : `${value} ${plural}`;
}

function displayToolLabel(tool: string) {
  return tool.replace(/^crm_/, "").replaceAll("_", " ");
}

function displayDatasetLabel(dataset: string) {
  return dataset.replaceAll("_", " ");
}

function feedbackMetadata(metadata: unknown) {
  const data = jsonObject(metadata);
  const report = jsonObject(data.report);
  const rating = stringValue(data.rating);
  const parsedRating: FeedbackRating =
    rating === "positive" || rating === "negative" ? rating : "unknown";

  return {
    answerMode: stringValue(data.answerMode),
    answerPreview: stringValue(data.answerPreview),
    model: stringValue(data.model),
    pagePath: stringValue(data.pagePath),
    promptPreview: stringValue(data.promptPreview),
    rating: parsedRating,
    report: {
      dataset: stringValue(report.dataset),
      permissionScope: stringValue(report.permissionScope),
      planner: stringValue(report.planner),
      rowCount: numberValue(report.rowCount),
      title: stringValue(report.title),
    },
    tools: stringList(data.tools),
  };
}

function topOccurrence(values: string[]) {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((first, second) => second[1] - first[1])
    .map(([label, count]) => ({ count, label }))[0];
}

function feedbackLookbackDate() {
  const date = new Date();
  date.setDate(date.getDate() - FEEDBACK_LOOKBACK_DAYS);
  return date;
}

type FeedbackRow = {
  actor: { email: string; name: string } | null;
  createdAt: Date;
  entityId: string | null;
  id: string;
  metadata: unknown;
};

export default async function SidekickSettingsPage() {
  await requireAdmin();

  const feedbackSince = feedbackLookbackDate();

  const [
    plans,
    statusCounts,
    recentFeedbackRows,
    recentFeedbackStatsRows,
    totalFeedbackCount,
  ] = await Promise.all([
    prisma.sidekickWritePlan.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        type: true,
        prompt: true,
        summary: true,
        status: true,
        plan: true,
        failureMessage: true,
        createdAt: true,
        approvedAt: true,
        appliedAt: true,
        rejectedAt: true,
        createdByUser: { select: { name: true, email: true } },
        approvedByUser: { select: { name: true, email: true } },
      },
    }),
    prisma.sidekickWritePlan.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      where: { action: SIDEKICK_FEEDBACK_ACTION },
      select: {
        actor: { select: { email: true, name: true } },
        createdAt: true,
        entityId: true,
        id: true,
        metadata: true,
      },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      where: {
        action: SIDEKICK_FEEDBACK_ACTION,
        createdAt: { gte: feedbackSince },
      },
      select: { metadata: true },
    }),
    prisma.auditLog.count({
      where: { action: SIDEKICK_FEEDBACK_ACTION },
    }),
  ]);

  const statusCount = new Map(
    statusCounts.map((row) => [row.status, row._count._all]),
  );
  const pendingCount =
    (statusCount.get("DRAFT") ?? 0) + (statusCount.get("APPROVED") ?? 0);
  const feedbackRows = recentFeedbackRows.map((row) => ({
    ...row,
    details: feedbackMetadata(row.metadata),
  }));
  const feedbackStats = recentFeedbackStatsRows.map((row) =>
    feedbackMetadata(row.metadata),
  );
  const positiveFeedbackCount = feedbackStats.filter(
    (row) => row.rating === "positive",
  ).length;
  const negativeFeedbackCount = feedbackStats.filter(
    (row) => row.rating === "negative",
  ).length;
  const ratedFeedbackCount = positiveFeedbackCount + negativeFeedbackCount;
  const usefulRate = ratedFeedbackCount
    ? Math.round((positiveFeedbackCount / ratedFeedbackCount) * 100)
    : null;
  const topTool = topOccurrence(feedbackStats.flatMap((row) => row.tools));
  const topDataset = topOccurrence(
    feedbackStats
      .map((row) => row.report.dataset)
      .filter((dataset): dataset is string => Boolean(dataset)),
  );
  const negativeFeedbackRows = feedbackRows.filter(
    (row) => row.details.rating === "negative",
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sidekick"
        description="Review Sidekick answer feedback and AI-generated write plans before they affect CRM setup."
        actions={
          <Link
            href="/settings/ai-context"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.05]"
          >
            AI context
          </Link>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Feedback captured"
          value={metricLabel(totalFeedbackCount, "rating")}
          detail="All Sidekick answer ratings recorded in audit logs."
          labelVariant="uppercase"
          valueClassName={sidekickMetricValueClassName}
        />
        <MetricCard
          label="Useful rate"
          value={usefulRate === null ? "No ratings" : `${usefulRate}%`}
          detail={`${metricLabel(ratedFeedbackCount, "rating")} in the last ${FEEDBACK_LOOKBACK_DAYS} days.`}
          labelVariant="uppercase"
          valueClassName={sidekickMetricValueClassName}
        />
        <MetricCard
          label="Needs review"
          value={metricLabel(negativeFeedbackCount, "answer")}
          detail="Negative ratings in the latest 30-day sample."
          labelVariant="uppercase"
          valueClassName={sidekickMetricValueClassName}
        />
        <MetricCard
          label="Common context"
          value={
            topDataset
              ? displayDatasetLabel(topDataset.label)
              : topTool
                ? displayToolLabel(topTool.label)
                : "No context yet"
          }
          detail={
            topDataset
              ? `${metricLabel(topDataset.count, "rating")} included this report dataset.`
              : topTool
                ? `${metricLabel(topTool.count, "rating")} used this tool.`
                : "Context appears after users rate Sidekick answers."
          }
          labelVariant="uppercase"
          valueClassName={sidekickMetricValueClassName}
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-100 p-5 dark:border-gray-800">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
                Answer feedback
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Recent ratings show the prompt, answer preview, checked tools
                and report context saved from the drawer feedback controls.
              </p>
            </div>
            <StatusBadge>
              {negativeFeedbackRows.length ? "WARNING" : "Ready"}
            </StatusBadge>
          </div>
        </div>

        <FeedbackReviewPanel
          feedbackRows={feedbackRows}
          negativeFeedbackRows={negativeFeedbackRows}
        />
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Pending review"
          value={metricLabel(pendingCount, "plan")}
          detail="Draft or approved plans that can still be applied or rejected."
          labelVariant="uppercase"
          valueClassName={sidekickMetricValueClassName}
        />
        <MetricCard
          label="Applied"
          value={metricLabel(statusCount.get("APPLIED") ?? 0, "plan")}
          detail="Plans already applied to Discovery setup."
          labelVariant="uppercase"
          valueClassName={sidekickMetricValueClassName}
        />
        <MetricCard
          label="Failed or rejected"
          value={metricLabel(
            (statusCount.get("FAILED") ?? 0) + (statusCount.get("REJECTED") ?? 0),
            "plan",
          )}
          detail="Plans that need review or were intentionally declined."
          labelVariant="uppercase"
          valueClassName={sidekickMetricValueClassName}
        />
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Write plans
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Sidekick plans are inert until an admin applies them. Applying a
              Discovery plan creates or updates templates and questions.
            </p>
          </div>
          <StatusBadge>{pendingCount ? "Pending" : "Ready"}</StatusBadge>
        </div>

        {plans.length ? (
          <div className="space-y-4">
            {plans.map((plan) => (
              <WritePlanCard key={plan.id} plan={plan} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center dark:border-gray-800">
            <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
              No Sidekick write plans yet
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Ask Sidekick to create a Discovery pack and it will appear here
              for admin review.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function FeedbackReviewPanel({
  feedbackRows,
  negativeFeedbackRows,
}: {
  feedbackRows: Array<FeedbackRow & { details: ReturnType<typeof feedbackMetadata> }>;
  negativeFeedbackRows: Array<
    FeedbackRow & { details: ReturnType<typeof feedbackMetadata> }
  >;
}) {
  if (!feedbackRows.length) {
    return (
      <div className="px-5 py-10 text-center">
        <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
          No Sidekick answer feedback yet
        </p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Ratings will appear here after users mark Sidekick answers as useful
          or not useful.
        </p>
      </div>
    );
  }

  return (
    <div>
      {negativeFeedbackRows.length ? (
        <div className="border-b border-gray-100 p-5 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
            Needs review
          </h3>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {negativeFeedbackRows.slice(0, 4).map((feedback) => (
              <FeedbackIssueCard key={feedback.id} feedback={feedback} />
            ))}
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-white/[0.02]">
            <tr className="text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
              <th className="px-5 py-3">Rating</th>
              <th className="px-5 py-3">User</th>
              <th className="px-5 py-3">Prompt and answer</th>
              <th className="px-5 py-3">Context</th>
              <th className="px-5 py-3">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {feedbackRows.map((feedback) => (
              <tr key={feedback.id} className="text-sm text-gray-700 dark:text-gray-300">
                <td className="px-5 py-4 align-top">
                  <FeedbackRatingBadge rating={feedback.details.rating} />
                </td>
                <td className="px-5 py-4 align-top">
                  <div className="font-medium text-gray-800 dark:text-white/90">
                    {feedback.actor?.name ?? "Unknown user"}
                  </div>
                  {feedback.actor?.email ? (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {feedback.actor.email}
                    </div>
                  ) : null}
                </td>
                <td className="max-w-xl px-5 py-4 align-top">
                  <p className="font-medium text-gray-800 dark:text-white/90">
                    {feedback.details.promptPreview ?? "Prompt not captured"}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                    {feedback.details.answerPreview ?? "Answer preview not captured"}
                  </p>
                </td>
                <td className="px-5 py-4 align-top">
                  <FeedbackContext feedback={feedback} />
                </td>
                <td className="px-5 py-4 align-top">
                  <div>{formatDate(feedback.createdAt)}</div>
                  {feedback.details.pagePath ? (
                    <div className="mt-1 max-w-48 truncate text-xs text-gray-500 dark:text-gray-400">
                      {feedback.details.pagePath}
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FeedbackIssueCard({
  feedback,
}: {
  feedback: FeedbackRow & { details: ReturnType<typeof feedbackMetadata> };
}) {
  return (
    <article className="rounded-xl border border-error-200 bg-error-50/60 p-4 dark:border-error-900/40 dark:bg-error-900/10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-error-700 dark:text-error-300">
            {feedback.details.promptPreview ?? "Prompt not captured"}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-error-700/80 dark:text-error-200/80">
            {feedback.details.answerPreview ?? "Answer preview not captured"}
          </p>
        </div>
        <span className="shrink-0 text-xs font-medium text-error-600 dark:text-error-300">
          {formatDate(feedback.createdAt)}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {feedback.details.report.dataset ? (
          <FeedbackChip>
            {displayDatasetLabel(feedback.details.report.dataset)}
          </FeedbackChip>
        ) : null}
        {feedback.details.tools.slice(0, 3).map((tool) => (
          <FeedbackChip key={`${feedback.id}-${tool}`}>
            {displayToolLabel(tool)}
          </FeedbackChip>
        ))}
        {feedback.details.answerMode ? (
          <FeedbackChip>{feedback.details.answerMode}</FeedbackChip>
        ) : null}
      </div>
    </article>
  );
}

function FeedbackContext({
  feedback,
}: {
  feedback: FeedbackRow & { details: ReturnType<typeof feedbackMetadata> };
}) {
  const report = feedback.details.report;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {feedback.details.answerMode ? (
          <FeedbackChip>{feedback.details.answerMode}</FeedbackChip>
        ) : null}
        {feedback.details.model ? (
          <FeedbackChip>{feedback.details.model}</FeedbackChip>
        ) : null}
        {report.permissionScope ? (
          <FeedbackChip>{report.permissionScope}</FeedbackChip>
        ) : null}
      </div>
      {report.title || report.dataset ? (
        <div className="text-xs leading-5 text-gray-500 dark:text-gray-400">
          <div className="font-medium text-gray-700 dark:text-gray-200">
            {report.title ?? displayDatasetLabel(report.dataset ?? "Report")}
          </div>
          <div>
            {[
              report.dataset ? displayDatasetLabel(report.dataset) : null,
              report.rowCount === null
                ? null
                : metricLabel(report.rowCount, "row"),
              report.planner,
            ]
              .filter(Boolean)
              .join(" - ")}
          </div>
        </div>
      ) : null}
      {feedback.details.tools.length ? (
        <div className="flex max-w-md flex-wrap gap-1.5">
          {feedback.details.tools.map((tool) => (
            <FeedbackChip key={`${feedback.id}-${tool}`}>
              {displayToolLabel(tool)}
            </FeedbackChip>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FeedbackChip({ children }: { children: string }) {
  return (
    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-white/10 dark:text-gray-300">
      {children}
    </span>
  );
}

function FeedbackRatingBadge({ rating }: { rating: FeedbackRating }) {
  const label =
    rating === "positive"
      ? "Useful"
      : rating === "negative"
        ? "Not useful"
        : "Unknown";
  const className =
    rating === "positive"
      ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
      : rating === "negative"
        ? "bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300"
        : "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300";

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}

type WritePlanCardProps = {
  plan: {
    id: string;
    type: string;
    prompt: string;
    summary: string;
    status: string;
    plan: unknown;
    failureMessage: string | null;
    createdAt: Date;
    approvedAt: Date | null;
    appliedAt: Date | null;
    rejectedAt: Date | null;
    createdByUser: { name: string; email: string } | null;
    approvedByUser: { name: string; email: string } | null;
  };
};

function WritePlanCard({ plan }: WritePlanCardProps) {
  const preview = planPreview(plan.plan);
  const canHandle = plan.status === "DRAFT" || plan.status === "APPROVED";

  return (
    <article className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge>{plan.status}</StatusBadge>
            <span className="text-xs font-medium text-gray-400">
              {plan.type.replaceAll("_", " ")}
            </span>
          </div>
          <h3 className="mt-3 text-sm font-semibold text-gray-900 dark:text-white">
            {preview.templateName}
          </h3>
          <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">
            {plan.summary}
          </p>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-gray-500 dark:text-gray-400">
            Prompt: {plan.prompt}
          </p>
        </div>

        {canHandle ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            <form action={applySidekickWritePlanAction}>
              <input type="hidden" name="planId" value={plan.id} />
              <button
                type="submit"
                className="inline-flex h-9 items-center justify-center rounded-lg bg-brand-500 px-3 text-sm font-semibold text-white hover:bg-brand-600"
              >
                Apply
              </button>
            </form>
            <form action={rejectSidekickWritePlanAction}>
              <input type="hidden" name="planId" value={plan.id} />
              <button
                type="submit"
                className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.05]"
              >
                Reject
              </button>
            </form>
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 border-t border-gray-100 pt-4 text-xs text-gray-500 sm:grid-cols-2 lg:grid-cols-4 dark:border-gray-800 dark:text-gray-400">
        <PlanMeta label="Created" value={formatDate(plan.createdAt)} />
        <PlanMeta
          label="Created by"
          value={plan.createdByUser?.name ?? plan.createdByUser?.email ?? "Unknown"}
        />
        <PlanMeta
          label="Handled"
          value={formatDate(plan.appliedAt ?? plan.rejectedAt ?? plan.approvedAt)}
        />
        <PlanMeta
          label="Handled by"
          value={plan.approvedByUser?.name ?? plan.approvedByUser?.email ?? "Not handled"}
        />
      </div>

      <div className="mt-4 rounded-xl bg-gray-50 p-3 dark:bg-gray-950/60">
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span>{preview.templateScope.replaceAll("_", " ")} scope</span>
          <span>-</span>
          <span>
            {preview.replaceQuestions ? "Replace existing questions" : "Add/update questions"}
          </span>
          <span>-</span>
          <span>{metricLabel(preview.questions.length, "question")}</span>
        </div>
        <ul className="mt-3 space-y-2">
          {preview.questions.slice(0, 8).map((question) => (
            <li
              key={`${plan.id}-${question.label}`}
              className="flex flex-col gap-1 rounded-lg bg-white px-3 py-2 text-sm text-gray-700 sm:flex-row sm:items-center sm:justify-between dark:bg-white/[0.04] dark:text-gray-200"
            >
              <span>{question.label}</span>
              <span className="shrink-0 text-xs font-semibold text-gray-400">
                {question.answerType.replaceAll("_", " ").toLowerCase()} -{" "}
                {question.required ? "Required" : "Optional"}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {plan.failureMessage ? (
        <p className="mt-3 rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-xs text-error-700 dark:border-error-900/40 dark:bg-error-900/20 dark:text-error-300">
          {plan.failureMessage}
        </p>
      ) : null}
    </article>
  );
}

function PlanMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-semibold text-gray-400">{label}</p>
      <p className="mt-1 text-gray-700 dark:text-gray-200">{value}</p>
    </div>
  );
}
