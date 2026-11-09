import type { BackgroundJobRunStatus } from "@prisma/client";
import StatusBadge from "@/components/crm-boilerplate/StatusBadge";
import { formatDateTime, formatRelativeDate } from "@/lib/formatters/date";
import {
  parseGmailSyncOperationSummary,
  type GmailSyncOperationSummary,
} from "@/lib/integrations/gmail-sync-operations";

type GmailSyncRun = {
  durationMs: number | null;
  errorMessage: string | null;
  id: string;
  message: string | null;
  recordsRead: number;
  recordsWritten: number;
  startedAt: Date;
  status: BackgroundJobRunStatus;
  summary: unknown;
  trigger: string;
};

function duration(value: number | null) {
  if (value === null) return "In progress";
  if (value < 1_000) return `${value}ms`;
  return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}s`;
}

function operationSummary(run: GmailSyncRun | undefined) {
  return run ? parseGmailSyncOperationSummary(run.summary) : null;
}

function metric(summary: GmailSyncOperationSummary | null, key: keyof GmailSyncOperationSummary) {
  return summary ? summary[key].toLocaleString("en-GB") : "—";
}

export default function GmailSyncOperationsPanel({
  available,
  runs,
  scheduleEnabled,
  secretConfigured,
}: {
  available: boolean;
  runs: GmailSyncRun[];
  scheduleEnabled: boolean;
  secretConfigured: boolean;
}) {
  const latest = runs[0];
  const latestSummary = operationSummary(latest);
  const schedulerReady = scheduleEnabled && secretConfigured;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Gmail sync operations
          </h2>
          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
            Scheduled batch health, throughput and backlog without exposing mailbox content.
          </p>
        </div>
        <span
          className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold ${
            schedulerReady
              ? "border-success-200 bg-success-50 text-success-700 dark:border-success-900/50 dark:bg-success-500/10 dark:text-success-300"
              : "border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-900/50 dark:bg-warning-500/10 dark:text-warning-300"
          }`}
        >
          {schedulerReady ? "Scheduled every 5 minutes" : "Scheduler needs attention"}
        </span>
      </div>

      {!scheduleEnabled || !secretConfigured ? (
        <div className="mt-4 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800 dark:border-warning-900/50 dark:bg-warning-500/10 dark:text-warning-200">
          {!scheduleEnabled
            ? "Automatic Gmail sync is disabled. Set GMAIL_SYNC_CRON_ENABLED=true to run scheduled imports."
            : "The scheduled sync secret is missing. Configure GMAIL_SYNC_SECRET or CRON_SECRET before enabling the job."}
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OperationMetric
          label="Last operation"
          value={latest ? formatRelativeDate(latest.startedAt) : "No runs yet"}
          detail={latest ? formatDateTime(latest.startedAt) : "Waiting for the first recorded batch"}
        />
        <OperationMetric
          label="Mailboxes processed"
          value={metric(latestSummary, "processed")}
          detail={latestSummary ? `${latestSummary.succeeded} succeeded · ${latestSummary.failed} failed` : "Latest recorded batch"}
        />
        <OperationMetric
          label="Messages read"
          value={metric(latestSummary, "messagesRead")}
          detail={latestSummary ? `${latestSummary.recordsWritten} CRM records written` : "Latest recorded batch"}
        />
        <OperationMetric
          label="Backlog"
          value={metric(latestSummary, "backlogPending")}
          detail={latestSummary ? `${latestSummary.deferred} mailbox${latestSummary.deferred === 1 ? "" : "es"} deferred` : "Continuation pages remaining"}
        />
      </div>

      <div className="mt-6 border-t border-gray-100 pt-5 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">Recent sync runs</h3>
        {runs.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Trigger</th>
                  <th className="py-2 pr-4">Processed</th>
                  <th className="py-2 pr-4">Messages</th>
                  <th className="py-2 pr-4">Started</th>
                  <th className="py-2">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {runs.map((run) => {
                  const summary = operationSummary(run);
                  return (
                    <tr key={run.id} className="text-sm text-gray-700 dark:text-gray-300">
                      <td className="py-3 pr-4">
                        <StatusBadge>{run.status}</StatusBadge>
                        {run.errorMessage || run.message ? (
                          <p className="mt-1 max-w-[360px] text-xs text-gray-500 dark:text-gray-400">
                            {run.errorMessage || run.message}
                          </p>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4 capitalize">{run.trigger}</td>
                      <td className="py-3 pr-4">
                        {summary ? `${summary.processed} (${summary.failed} failed)` : run.recordsRead}
                      </td>
                      <td className="py-3 pr-4">
                        {summary ? `${summary.messagesRead} read / ${summary.recordsWritten} written` : `${run.recordsRead} read / ${run.recordsWritten} written`}
                      </td>
                      <td className="py-3 pr-4">
                        <div>{formatRelativeDate(run.startedAt)}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {formatDateTime(run.startedAt)}
                        </div>
                      </td>
                      <td className="py-3">{duration(run.durationMs)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">
            {available
              ? "No Gmail sync operations have been recorded yet. The next scheduled or manual sync will appear here."
              : "Sync operation history is unavailable until the background-job schema is ready."}
          </p>
        )}
      </div>
    </section>
  );
}

function OperationMetric({ detail, label, value }: { detail: string; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">{label}</p>
      <p className="mt-2 text-xl font-semibold text-gray-800 dark:text-white/90">{value}</p>
      <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{detail}</p>
    </div>
  );
}
