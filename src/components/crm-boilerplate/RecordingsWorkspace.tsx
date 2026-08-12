"use client";

import { useState } from "react";
import CallRecordingActions from "@/components/crm-boilerplate/CallRecordingActions";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import ResponsiveDataList from "@/components/crm-boilerplate/ResponsiveDataList";
import StatusBadge from "@/components/crm-boilerplate/StatusBadge";
import {
  AppActionIcon,
  AppIconButton,
  type AppActionIconName,
} from "@/components/ui/action-icon/AppActionIcon";
import {
  defaultRecordingPageSize,
  recordingFilters,
  recordingPageSizeOptions,
  type RecordingEntry,
  type RecordingFilter,
  type RecordingPage,
} from "@/lib/telephony/recordings-shared";

type RecordingsWorkspaceProps = {
  initialData: RecordingPage;
  initialFilter: RecordingFilter;
  initialQuery: string;
};

function formatDate(value: string | null) {
  if (!value) return "Not recorded";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(new Date(value));
}

function formatDuration(seconds: number | null) {
  if (!seconds) return "0:00";

  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;

  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function formatSystemValue(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function recordingUrl({
  filter,
  page,
  pageSize,
  query,
}: {
  filter: RecordingFilter;
  page: number;
  pageSize: number;
  query: string;
}) {
  const params = new URLSearchParams();

  if (query) params.set("q", query);
  if (filter !== "ALL") params.set("filter", filter);
  if (page > 1) params.set("page", String(page));
  if (pageSize !== defaultRecordingPageSize) params.set("pageSize", String(pageSize));

  const queryString = params.toString();
  return queryString ? `/telephony/recordings?${queryString}` : "/telephony/recordings";
}

function apiUrl({
  cursor,
  filter,
  page,
  pageSize,
  query,
}: {
  cursor?: string | null;
  filter: RecordingFilter;
  page: number;
  pageSize: number;
  query: string;
}) {
  const params = new URLSearchParams({
    filter,
    page: String(page),
    pageSize: String(pageSize),
  });

  if (query) params.set("q", query);
  if (cursor) params.set("cursor", cursor);

  return `/api/telephony/recordings?${params.toString()}`;
}

export default function RecordingsWorkspace({
  initialData,
  initialFilter,
  initialQuery,
}: RecordingsWorkspaceProps) {
  const [data, setData] = useState(initialData);
  const [filter, setFilter] = useState<RecordingFilter>(initialFilter);
  const [query, setQuery] = useState(initialQuery);
  const [queryInput, setQueryInput] = useState(initialQuery);
  const [cursorByPage, setCursorByPage] = useState<Record<number, string | null>>(() => {
    const cursors: Record<number, string | null> = { 1: null };
    if (initialData.nextCursor) cursors[initialData.page + 1] = initialData.nextCursor;
    return cursors;
  });
  const [selectedTranscript, setSelectedTranscript] = useState<RecordingEntry | null>(null);
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadRecordings({
    cursor,
    nextFilter = filter,
    page = data.page,
    pageSize = data.pageSize,
    nextQuery = query,
    resetCursors = false,
  }: {
    cursor?: string | null;
    nextFilter?: RecordingFilter;
    page?: number;
    pageSize?: number;
    nextQuery?: string;
    resetCursors?: boolean;
  }) {
    setError(null);
    setLoadingLabel("Loading recordings...");

    try {
      const response = await fetch(
        apiUrl({ cursor, filter: nextFilter, page, pageSize, query: nextQuery }),
        { headers: { Accept: "application/json" } },
      );

      if (!response.ok) {
        throw new Error("Recordings could not be loaded.");
      }

      const nextData = (await response.json()) as RecordingPage;

      setData(nextData);
      setFilter(nextFilter);
      setQuery(nextQuery);
      setQueryInput(nextQuery);
      setCursorByPage((current) => {
        const next: Record<number, string | null> = resetCursors
          ? { 1: null }
          : { ...current };
        if (cursor !== undefined) next[nextData.page] = cursor;
        if (nextData.nextCursor) {
          next[nextData.page + 1] = nextData.nextCursor;
        } else {
          delete next[nextData.page + 1];
        }
        return next;
      });
      window.history.pushState(
        null,
        "",
        recordingUrl({
          filter: nextFilter,
          page: nextData.page,
          pageSize: nextData.pageSize,
          query: nextQuery,
        }),
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Recordings could not be loaded.");
    } finally {
      setLoadingLabel(null);
    }
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadRecordings({ page: 1, nextQuery: queryInput.trim(), resetCursors: true });
  }

  function changeFilter(nextFilter: RecordingFilter) {
    void loadRecordings({ nextFilter, page: 1, resetCursors: true });
  }

  function changePage(page: number) {
    const cursor = page === data.page + 1 ? data.nextCursor : cursorByPage[page];
    void loadRecordings({ cursor, page });
  }

  function changePageSize(pageSize: number) {
    void loadRecordings({ page: 1, pageSize, resetCursors: true });
  }

  const startRow = data.totalCount ? (data.page - 1) * data.pageSize + 1 : 0;
  const endRow = Math.min(data.totalCount, data.page * data.pageSize);

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800 sm:px-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
                Call recordings
              </h2>
              <LazyHelpTooltip content="Searches stored call logs by phone number, contact, agent, sale, call SID and recording SID. Page changes load without a full page refresh." />
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Replay calls, queue transcripts and review recording intelligence.
            </p>
          </div>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600 dark:bg-white/10 dark:text-gray-300">
            {data.totalCount} result{data.totalCount === 1 ? "" : "s"}
          </span>
        </div>

        <form onSubmit={submitSearch} className="mt-3 flex flex-col gap-2 lg:flex-row">
          <label className="sr-only" htmlFor="recording-search">
            Search recordings
          </label>
          <input
            id="recording-search"
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            placeholder="Search name, number, agent, sale, call SID or recording SID..."
            className="h-9 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs outline-none transition placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30"
          />
          <button
            type="submit"
            disabled={Boolean(loadingLabel)}
            className="inline-flex h-9 items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white shadow-theme-xs hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
          >
            Search
          </button>
        </form>

        <div className="mt-3 flex flex-wrap gap-2">
          {recordingFilters.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => changeFilter(item.value)}
              className={`inline-flex h-8 items-center rounded-lg border px-3 text-xs font-semibold ${
                item.value === filter
                  ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <p
          className={`mt-3 min-h-4 text-xs font-medium ${
            error ? "text-error-600 dark:text-error-300" : "text-gray-500 dark:text-gray-400"
          }`}
        >
          {error ?? loadingLabel}
        </p>

        <div className="mt-1 flex flex-wrap gap-2">
          <RecordingSummaryPill label="Filtered" value={data.totalCount} />
          <RecordingSummaryPill label="Recordings" value={data.summary.recordingCount} />
          <RecordingSummaryPill label="Transcripts" value={data.summary.transcriptReadyCount} />
          <RecordingSummaryPill label="AI ready" value={data.summary.aiReadyCount} />
          <RecordingSummaryPill label="Avg" value={formatDuration(data.summary.averageDurationSeconds)} />
        </div>
      </div>

      {data.calls.length ? (
        <ResponsiveDataList
          breakpoint="lg"
          cardListClassName="divide-y divide-gray-200 dark:divide-gray-800"
          getKey={(call) => call.id}
          items={data.calls}
          renderCard={(call) => (
            <RecordingMobileRow
              call={call}
              onReadTranscript={setSelectedTranscript}
            />
          )}
          tableClassName="overflow-x-auto"
          table={
            <table className="min-w-[860px] w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-white/[0.03]">
                <tr>
                  <RecordingHead>Call</RecordingHead>
                  <RecordingHead>When</RecordingHead>
                  <RecordingHead>Type</RecordingHead>
                  <RecordingHead align="center">Dur.</RecordingHead>
                  <RecordingHead align="center">
                    <span className="sr-only">AI analysis</span>
                    <AppActionIcon className="mx-auto h-3.5 w-3.5" name="ai" />
                  </RecordingHead>
                  <RecordingHead align="right">Actions</RecordingHead>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {data.calls.map((call) => (
                  <RecordingTableRow
                    key={call.id}
                    call={call}
                    onReadTranscript={setSelectedTranscript}
                  />
                ))}
              </tbody>
            </table>
          }
        />
      ) : (
        <div className="px-5 py-10 text-center">
          <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
            No recordings match this search
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Try a different number, contact, agent, sale or recording filter.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-gray-200 px-5 py-3 dark:border-gray-800 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Showing {startRow}-{endRow} of {data.totalCount}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400" htmlFor="recording-page-size">
            Rows
          </label>
          <select
            id="recording-page-size"
            value={data.pageSize}
            onChange={(event) => changePageSize(Number(event.target.value))}
            className="h-8 rounded-lg border border-gray-300 bg-white px-2 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
          >
            {recordingPageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <PaginationButton disabled={!data.hasPreviousPage || Boolean(loadingLabel)} onClick={() => changePage(data.page - 1)}>
            Prev
          </PaginationButton>
          {pageNumbers(data.page, data.totalPages).map((page) => (
            <PaginationButton
              key={page}
              active={page === data.page}
              disabled={Boolean(loadingLabel)}
              onClick={() => changePage(page)}
            >
              {page}
            </PaginationButton>
          ))}
          <PaginationButton disabled={!data.hasNextPage || Boolean(loadingLabel)} onClick={() => changePage(data.page + 1)}>
            Next
          </PaginationButton>
        </div>
      </div>
      {selectedTranscript && (
        <TranscriptModal
          call={selectedTranscript}
          onClose={() => setSelectedTranscript(null)}
        />
      )}
    </section>
  );
}

function pageNumbers(currentPage: number, totalPages: number) {
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, start + 4);

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function PaginationButton({
  active = false,
  children,
  disabled = false,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled || active}
      onClick={onClick}
      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
      }`}
    >
      {children}
    </button>
  );
}

function RecordingHead({
  align = "left",
  children,
}: {
  align?: "center" | "left" | "right";
  children: React.ReactNode;
}) {
  const alignClass =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

  return (
    <th className={`px-4 py-2 ${alignClass} text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400`}>
      {children}
    </th>
  );
}

function RecordingSummaryPill({ label, value }: { label: string; value: number | string }) {
  return (
    <span className="inline-flex h-8 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 text-xs font-semibold text-gray-600 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300">
      <span className="text-gray-400 dark:text-gray-500">{label}</span>
      <span className="text-gray-900 dark:text-white">{value}</span>
    </span>
  );
}

function callLabel(call: RecordingEntry) {
  const contactName = [call.contact?.firstName, call.contact?.lastName]
    .filter(Boolean)
    .join(" ");

  return (
    contactName ||
    call.opportunity?.title ||
    call.fromNumber ||
    call.toNumber ||
    `${call.direction.toLowerCase()} call`
  );
}

function RecordingTableRow({
  call,
  onReadTranscript,
}: {
  call: RecordingEntry;
  onReadTranscript: (call: RecordingEntry) => void;
}) {
  const label = callLabel(call);
  const aiAnalysisStatus = call.aiAnalysisStatus ?? "NOT REQUESTED";
  const hasTranscript = Boolean(call.transcript);

  return (
    <tr className="align-middle hover:bg-gray-50 dark:hover:bg-white/[0.03]">
      <td className="max-w-[340px] px-4 py-2">
        <p className="truncate font-semibold text-gray-800 dark:text-white/90">{label}</p>
        <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">
          {[call.opportunity?.title, call.user?.name].filter(Boolean).join(" / ") ||
            call.fromNumber ||
            call.toNumber ||
            "General call"}
        </p>
        {(call.summary || call.transcriptError) && (
          <p
            className={`mt-0.5 line-clamp-1 text-[11px] ${
              call.transcriptError
                ? "text-error-600 dark:text-error-300"
                : "text-gray-500 dark:text-gray-400"
            }`}
            title={call.transcriptError ?? call.summary ?? undefined}
          >
            {call.transcriptError ?? call.summary}
          </p>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-300">
        {formatDate(call.startedAt)}
      </td>
      <td className="whitespace-nowrap px-4 py-2">
        <div className="flex items-center gap-2">
          <span
            className={`h-6 w-1 rounded-full ${
              call.direction === "INBOUND" ? "bg-success-500" : "bg-brand-500"
            }`}
          />
          <div>
            <p className="text-xs font-semibold text-gray-800 dark:text-white/90">
              {formatSystemValue(call.direction)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {formatSystemValue(call.status)}
            </p>
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-2 text-center text-xs font-semibold text-gray-700 dark:text-gray-200">
        {formatDuration(call.durationSeconds)}
      </td>
      <td className="px-4 py-2 text-center">
        <RecordingStatusIcon
          icon="ai"
          label="AI"
          status={aiAnalysisStatus}
        />
      </td>
      <td className="px-4 py-2">
        <CallRecordingActions
          callLogId={call.id}
          density="compact"
          className="mt-0 flex-nowrap justify-end"
          hasTranscript={hasTranscript}
          onReadTranscript={() => onReadTranscript(call)}
          playbackUrl={call.playbackUrl}
          recordingSid={call.recordingSid}
          transcriptStatus={call.transcriptStatus}
        />
      </td>
    </tr>
  );
}

function RecordingMobileRow({
  call,
  onReadTranscript,
}: {
  call: RecordingEntry;
  onReadTranscript: (call: RecordingEntry) => void;
}) {
  const transcriptStatus = call.transcriptStatus ?? "NOT REQUESTED";
  const aiAnalysisStatus = call.aiAnalysisStatus ?? "NOT REQUESTED";
  const hasTranscript = Boolean(call.transcript);

  return (
    <div className="px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
            {callLabel(call)}
          </p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {formatSystemValue(call.direction)} / {formatDate(call.startedAt)}
          </p>
        </div>
        <StatusBadge>{call.recordingSid || call.recordingUrl ? "Ready" : call.recordingConsent || "Not recorded"}</StatusBadge>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <RecordingTinyPill label="Duration" value={formatDuration(call.durationSeconds)} />
        <RecordingTinyPill label="Status" value={formatSystemValue(call.status)} />
        <RecordingTinyPill label="Transcript" value={formatSystemValue(transcriptStatus)} />
        <RecordingTinyPill label="AI" value={formatSystemValue(aiAnalysisStatus)} />
      </div>
      {call.summary && (
        <p className="mt-3 line-clamp-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-white/[0.03] dark:text-gray-300">
          {call.summary}
        </p>
      )}
      {call.transcriptError && (
        <p className="mt-3 line-clamp-2 rounded-lg bg-error-50 px-3 py-2 text-xs text-error-700 dark:bg-error-900/20 dark:text-error-200">
          {call.transcriptError}
        </p>
      )}
      <CallRecordingActions
        callLogId={call.id}
        density="compact"
        hasTranscript={hasTranscript}
        onReadTranscript={() => onReadTranscript(call)}
        playbackUrl={call.playbackUrl}
        recordingSid={call.recordingSid}
        transcriptStatus={call.transcriptStatus}
      />
    </div>
  );
}

function TranscriptModal({
  call,
  onClose,
}: {
  call: RecordingEntry;
  onClose: () => void;
}) {
  const transcript = call.transcript?.trim() ?? "";
  const lines = transcript.split(/\r?\n/).filter(Boolean);

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-gray-950/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-950">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">
              Call transcript
            </p>
            <h3 className="mt-1 truncate text-base font-semibold text-gray-800 dark:text-white/90">
              {callLabel(call)}
            </h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {formatSystemValue(call.direction)} / {formatDate(call.startedAt)}
            </p>
          </div>
          <AppIconButton
            type="button"
            onClick={onClose}
            icon="close"
            label="Close transcript"
            size="md"
            variant="muted"
          />
        </div>
        {call.summary && (
          <div className="border-b border-gray-200 bg-gray-50 px-5 py-3 text-sm text-gray-600 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              AI summary
            </p>
            <p className="mt-1 leading-6">{call.summary}</p>
          </div>
        )}
        <div className="overflow-y-auto px-5 py-4">
          {lines.length ? (
            <div className="space-y-3">
              {lines.map((line, index) => (
                <p
                  key={`${index}-${line.slice(0, 20)}`}
                  className="whitespace-pre-wrap rounded-xl bg-gray-50 px-3 py-2 text-sm leading-6 text-gray-700 dark:bg-white/[0.04] dark:text-gray-200"
                >
                  {line}
                </p>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-gray-200 p-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
              No transcript text is stored for this recording yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function RecordingTinyPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-semibold text-gray-600 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300">
      <span className="text-gray-400 dark:text-gray-500">{label}</span>
      {value}
    </span>
  );
}

function shortStatusLabel(value: string) {
  const normalized = value.toUpperCase().replaceAll("_", " ");

  if (normalized === "COMPLETED" || normalized === "READY") return "Ready";
  if (normalized === "NOT REQUESTED") return "None";
  if (normalized === "FAILED" || normalized === "ERROR") return "Error";
  if (normalized === "CONFIG REQUIRED") return "Config";
  if (normalized === "PROCESSING" || normalized === "QUEUED" || normalized === "REQUESTED") {
    return "Queued";
  }

  return formatSystemValue(value);
}

function statusTone(value: string) {
  const normalized = value.toUpperCase().replaceAll("_", " ");

  if (normalized === "COMPLETED" || normalized === "READY") {
    return "border-success-100 bg-success-50 text-success-700 dark:border-success-900/40 dark:bg-success-900/20 dark:text-success-300";
  }

  if (normalized === "FAILED" || normalized === "ERROR") {
    return "border-error-100 bg-error-50 text-error-700 dark:border-error-900/40 dark:bg-error-900/20 dark:text-error-300";
  }

  if (normalized === "NOT REQUESTED") {
    return "border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-500";
  }

  return "border-warning-100 bg-warning-50 text-warning-700 dark:border-warning-900/40 dark:bg-warning-900/20 dark:text-warning-300";
}

function RecordingStatusIcon({
  icon,
  label,
  status,
}: {
  icon: AppActionIconName;
  label: string;
  status: string;
}) {
  const shortLabel = shortStatusLabel(status);
  const normalized = status.toUpperCase().replaceAll("_", " ");

  if (normalized === "NOT REQUESTED") {
    return (
      <span
        className="inline-flex h-7 min-w-[52px] items-center justify-center text-xs font-semibold text-gray-300 dark:text-gray-600"
        title={`${label}: ${formatSystemValue(status)}`}
      >
        -
      </span>
    );
  }

  return (
    <span
      className={`inline-flex h-7 min-w-[68px] items-center justify-center gap-1.5 rounded-lg border px-2 text-[11px] font-semibold ${statusTone(status)}`}
      title={`${label}: ${formatSystemValue(status)}`}
    >
      <AppActionIcon className="h-3.5 w-3.5" name={icon} />
      <span>{shortLabel}</span>
    </span>
  );
}
