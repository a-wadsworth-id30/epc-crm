"use client";

import { useMemo, useState } from "react";
import CallRecordingActions from "@/components/crm-boilerplate/CallRecordingActions";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import StatusBadge from "@/components/crm-boilerplate/StatusBadge";
import {
  callLogPageSizeOptions,
  type CallDirectionFilter,
  type CallLogEntry,
  type CallLogPage,
  type CallStatusFilter,
} from "@/lib/telephony/call-log-shared";

type CallLogWorkspaceProps = {
  activeQueueCount: number;
  initialData: CallLogPage;
  initialFilters: {
    direction: CallDirectionFilter;
    query: string;
    status: CallStatusFilter;
  };
  routeAgentsCount: number;
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
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function callDisplayName(call: CallLogEntry) {
  const contactName = [call.contact?.firstName, call.contact?.lastName]
    .filter(Boolean)
    .join(" ");
  const identityName =
    call.direction === "OUTBOUND"
      ? call.toLabel || call.fromLabel
      : call.fromLabel || call.toLabel;

  return (
    contactName ||
    call.opportunity?.title ||
    identityName ||
    call.fromNumber ||
    call.toNumber ||
    `${call.direction.toLowerCase()} call`
  );
}

function participantDisplay({
  identity,
  label,
  number,
}: {
  identity: string | null;
  label: string | null;
  number: string | null;
}) {
  return label || number || identity || "Unknown";
}

function callLogUrl({
  callId,
  direction,
  page,
  pageSize,
  query,
  status,
}: {
  callId?: string | null;
  direction: CallDirectionFilter;
  page: number;
  pageSize: number;
  query: string;
  status: CallStatusFilter;
}) {
  const params = new URLSearchParams({ view: "logs" });

  if (query) params.set("q", query);
  if (direction !== "ALL") params.set("direction", direction);
  if (status !== "ALL") params.set("status", status);
  if (page > 1) params.set("page", String(page));
  if (pageSize !== 25) params.set("pageSize", String(pageSize));
  if (callId) params.set("call", callId);

  return `/telephony/live?${params.toString()}`;
}

function apiUrl({
  callId,
  cursor,
  direction,
  page,
  pageSize,
  query,
  status,
}: {
  callId?: string | null;
  cursor?: string | null;
  direction: CallDirectionFilter;
  page: number;
  pageSize: number;
  query: string;
  status: CallStatusFilter;
}) {
  const params = new URLSearchParams({
    direction,
    page: String(page),
    pageSize: String(pageSize),
    status,
  });

  if (query) params.set("q", query);
  if (callId) params.set("call", callId);
  if (cursor) params.set("cursor", cursor);

  return `/api/telephony/call-log?${params.toString()}`;
}

export default function CallLogWorkspace({
  activeQueueCount,
  initialData,
  initialFilters,
  routeAgentsCount,
}: CallLogWorkspaceProps) {
  const [data, setData] = useState(initialData);
  const [queryInput, setQueryInput] = useState(initialFilters.query);
  const [filters, setFilters] = useState(initialFilters);
  const [cursorByPage, setCursorByPage] = useState<Record<number, string | null>>(() => {
    const cursors: Record<number, string | null> = { 1: null };
    if (initialData.nextCursor) cursors[initialData.page + 1] = initialData.nextCursor;
    return cursors;
  });
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const missedCount = useMemo(
    () =>
      data.calls.filter((call) =>
        ["NO_ANSWER", "BUSY", "FAILED", "CANCELED"].includes(call.status),
      ).length,
    [data.calls],
  );

  async function loadLog({
    callId,
    cursor,
    direction = filters.direction,
    page = data.page,
    pageSize = data.pageSize,
    query = filters.query,
    resetCursors = false,
    status = filters.status,
    updateUrl = true,
    visibleLoading = true,
  }: {
    callId?: string | null;
    cursor?: string | null;
    direction?: CallDirectionFilter;
    page?: number;
    pageSize?: number;
    query?: string;
    resetCursors?: boolean;
    status?: CallStatusFilter;
    updateUrl?: boolean;
    visibleLoading?: boolean;
  }) {
    setError(null);
    setLoadingLabel(visibleLoading ? "Loading calls..." : null);

    try {
      const response = await fetch(
        apiUrl({ callId, cursor, direction, page, pageSize, query, status }),
        {
          headers: { Accept: "application/json" },
        },
      );

      if (!response.ok) {
        throw new Error("Call log could not be loaded.");
      }

      const nextData = (await response.json()) as CallLogPage;

      setData(nextData);
      setFilters({ direction, query, status });
      setQueryInput(query);
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

      if (updateUrl) {
        window.history.pushState(
          null,
          "",
          callLogUrl({
            callId: nextData.selectedCall?.id ?? null,
            direction,
            page: nextData.page,
            pageSize: nextData.pageSize,
            query,
            status,
          }),
        );
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Call log could not be loaded.");
    } finally {
      setLoadingLabel(null);
    }
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadLog({
      callId: null,
      page: 1,
      query: queryInput.trim(),
      resetCursors: true,
    });
  }

  function changeDirection(direction: CallDirectionFilter) {
    void loadLog({ callId: null, direction, page: 1, resetCursors: true });
  }

  function changeStatus(status: CallStatusFilter) {
    void loadLog({ callId: null, page: 1, resetCursors: true, status });
  }

  function changePage(page: number) {
    const cursor = page === data.page + 1 ? data.nextCursor : cursorByPage[page];
    void loadLog({ callId: null, cursor, page });
  }

  function changePageSize(pageSize: number) {
    void loadLog({ callId: null, page: 1, pageSize, resetCursors: true });
  }

  function selectCall(callId: string) {
    void loadLog({
      callId,
      cursor: cursorByPage[data.page],
      visibleLoading: false,
    });
  }

  const startRow = data.totalCount ? (data.page - 1) * data.pageSize + 1 : 0;
  const endRow = Math.min(data.totalCount, data.page * data.pageSize);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Call log
              </p>
              <div className="mt-1 flex items-center gap-2">
                <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
                  Search calls, callers and recordings
                </h3>
                <LazyHelpTooltip content="Searches existing call logs by phone number, contact, agent, opportunity and call SID. Page changes and selected-call updates load without a full page refresh." />
              </div>
            </div>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600 dark:bg-white/10 dark:text-gray-300">
              {data.totalCount} result{data.totalCount === 1 ? "" : "s"}
            </span>
          </div>
          <form onSubmit={submitSearch} className="mt-4 flex flex-col gap-3 lg:flex-row">
            <label className="sr-only" htmlFor="call-log-search">
              Search call log
            </label>
            <input
              id="call-log-search"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              placeholder="Search name, number, agent, sale or call SID..."
              className="h-11 flex-1 rounded-lg border border-gray-300 bg-white px-4 text-sm text-gray-800 shadow-theme-xs outline-none transition placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30"
            />
            <button
              type="submit"
              disabled={Boolean(loadingLabel)}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white shadow-theme-xs hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
            >
              Search
            </button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              { label: "All directions", value: "ALL" as CallDirectionFilter },
              { label: "Inbound", value: "INBOUND" as CallDirectionFilter },
              { label: "Outbound", value: "OUTBOUND" as CallDirectionFilter },
            ].map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => changeDirection(item.value)}
                className={`inline-flex h-8 items-center justify-center rounded-full px-3 text-xs font-semibold transition ${
                  item.value === filters.direction
                    ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/30"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/15"
                }`}
              >
                {item.label}
              </button>
            ))}
            {[
              { label: "All calls", value: "ALL" as CallStatusFilter },
              { label: "Completed", value: "COMPLETED" as CallStatusFilter },
              { label: "Missed", value: "MISSED" as CallStatusFilter },
              { label: "Recorded", value: "RECORDED" as CallStatusFilter },
            ].map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => changeStatus(item.value)}
                className={`inline-flex h-8 items-center justify-center rounded-full px-3 text-xs font-semibold transition ${
                  item.value === filters.status
                    ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/30"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/15"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {(loadingLabel || error) && (
            <p
              className={`mt-3 text-xs font-medium ${
                error ? "text-error-600 dark:text-error-300" : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {error ?? loadingLabel}
            </p>
          )}
        </div>

        <div className="overflow-x-auto">
          {data.calls.length ? (
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-white/[0.03]">
                <tr>
                  <CallLogHead>Caller</CallLogHead>
                  <CallLogHead>Number</CallLogHead>
                  <CallLogHead>Direction</CallLogHead>
                  <CallLogHead>Agent</CallLogHead>
                  <CallLogHead>Duration</CallLogHead>
                  <CallLogHead>Recording</CallLogHead>
                  <CallLogHead>Issue</CallLogHead>
                  <CallLogHead align="right">Status</CallLogHead>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {data.calls.map((call) => (
                  <CallLogRow
                    key={call.id}
                    call={call}
                    onSelect={selectCall}
                    selected={call.id === data.selectedCall?.id}
                  />
                ))}
              </tbody>
            </table>
          ) : (
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                No calls match this search
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Try a different phone number, contact name, agent or status filter.
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-200 px-5 py-3 dark:border-gray-800 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Showing {startRow}-{endRow} of {data.totalCount}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400" htmlFor="call-log-page-size">
              Rows
            </label>
            <select
              id="call-log-page-size"
              value={data.pageSize}
              onChange={(event) => changePageSize(Number(event.target.value))}
              className="h-8 rounded-lg border border-gray-300 bg-white px-2 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
            >
              {callLogPageSizeOptions.map((option) => (
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
      </section>

      <div className="space-y-5 xl:sticky xl:top-24 xl:self-start">
        <CallLogDetailPanel call={data.selectedCall} />
        <Panel
          title="Live queue"
          detail="A compact live status remains visible while reviewing call history."
          badge={`${activeQueueCount} LIVE`}
        >
          <div className="grid gap-3">
            <ConfigChip label="Waiting" value={activeQueueCount.toString()} />
            <ConfigChip label="Routable agents" value={routeAgentsCount.toString()} />
            <ConfigChip label="Missed in view" value={missedCount.toString()} />
          </div>
        </Panel>
      </div>
    </div>
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

function CallLogHead({
  align = "left",
  children,
}: {
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  const alignClass = align === "right" ? "text-right" : "text-left";

  return (
    <th
      className={`whitespace-nowrap px-4 py-2.5 ${alignClass} text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 first:px-5 last:px-5`}
    >
      {children}
    </th>
  );
}

function CallLogRow({
  call,
  onSelect,
  selected,
}: {
  call: CallLogEntry;
  onSelect: (callId: string) => void;
  selected: boolean;
}) {
  const label = callDisplayName(call);
  const number =
    call.direction === "OUTBOUND"
      ? participantDisplay({
          identity: call.toIdentity,
          label: call.toLabel,
          number: call.toNumber,
        })
      : participantDisplay({
          identity: call.fromIdentity,
          label: call.fromLabel,
          number: call.fromNumber,
        });

  return (
    <tr
      className={`transition ${
        selected
          ? "bg-brand-50/60 dark:bg-brand-500/10"
          : "hover:bg-gray-50 dark:hover:bg-white/[0.03]"
      }`}
    >
      <td className="max-w-[260px] px-5 py-3">
        <button type="button" onClick={() => onSelect(call.id)} className="block w-full text-left">
          <p className="truncate font-semibold text-gray-800 dark:text-white/90">
            {label}
          </p>
          <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
            {call.opportunity?.title || formatDate(call.startedAt)}
          </p>
        </button>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-gray-700 dark:text-gray-300">
        {number || "Unknown"}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <CallLogPill tone={call.direction === "INBOUND" ? "brand" : "neutral"}>
          {formatSystemValue(call.direction)}
        </CallLogPill>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
        {call.user?.name ?? "Unassigned"}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300">
        {formatDuration(call.durationSeconds)}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          <CallLogPill tone={call.playbackUrl ? "success" : "neutral"}>
            {call.playbackUrl ? "Replay" : "None"}
          </CallLogPill>
          {call.transcriptStatus && (
            <CallLogPill tone="brand">{formatSystemValue(call.transcriptStatus)}</CallLogPill>
          )}
        </div>
      </td>
      <td className="max-w-[190px] px-4 py-3">
        {call.failureInsight ? (
          <p className="truncate text-xs font-semibold text-error-600 dark:text-error-300">
            {call.failureInsight.title}
          </p>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-600">-</span>
        )}
      </td>
      <td className="whitespace-nowrap px-5 py-3 text-right">
        <StatusBadge>{formatSystemValue(call.status)}</StatusBadge>
      </td>
    </tr>
  );
}

function CallLogPill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "brand" | "neutral" | "success";
}) {
  const toneClass = {
    brand: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
    neutral: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300",
    success: "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300",
  }[tone];

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneClass}`}>
      {children}
    </span>
  );
}

function CallLogDetailPanel({ call }: { call: CallLogEntry | null }) {
  if (!call) {
    return (
      <Panel title="Call details" detail="Select a call from the log to inspect context, playback and AI output.">
        <p className="rounded-xl border border-dashed border-gray-200 p-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
          No call selected.
        </p>
      </Panel>
    );
  }

  const transcriptStatus = call.transcriptStatus ?? "NOT REQUESTED";

  return (
    <Panel title="Selected call" detail="Replay, transcript state and CRM context for the highlighted call.">
      <div className="space-y-4">
        <div>
          <p className="text-base font-semibold text-gray-800 dark:text-white/90">
            {callDisplayName(call)}
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {participantDisplay({
              identity: call.fromIdentity,
              label: call.fromLabel,
              number: call.fromNumber,
            })}{" "}
            →{" "}
            {participantDisplay({
              identity: call.toIdentity,
              label: call.toLabel,
              number: call.toNumber,
            })}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <RecordingMetric label="Direction" value={formatSystemValue(call.direction)} />
          <RecordingMetric label="Status" value={formatSystemValue(call.status)} />
          <RecordingMetric label="Date" value={formatDate(call.startedAt)} />
          <RecordingMetric label="Duration" value={formatDuration(call.durationSeconds)} />
          <RecordingMetric label="Agent" value={call.user?.name ?? "Unassigned"} />
          <RecordingMetric label="Transcript" value={formatSystemValue(transcriptStatus)} />
        </div>
        {call.failureInsight && (
          <div className="rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700 dark:border-error-900/50 dark:bg-error-900/15 dark:text-error-200">
            <p className="font-semibold">{call.failureInsight.title}</p>
            <p className="mt-1 text-xs leading-5">{call.failureInsight.detail}</p>
            <p className="mt-2 text-xs font-semibold">
              Next: {call.failureInsight.nextAction}
            </p>
          </div>
        )}
        {call.playbackUrl ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-800 dark:bg-white/[0.03]">
            <audio className="h-9 w-full" controls preload="none" src={call.playbackUrl}>
              <a href={call.playbackUrl}>Download recording</a>
            </audio>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-gray-200 p-3 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
            No recording is attached to this call.
          </p>
        )}
        {(call.summary || call.transcript) && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300">
            <p className="font-semibold text-gray-800 dark:text-white/90">
              {call.summary ? "AI summary" : "Transcript preview"}
            </p>
            <p className="mt-1 line-clamp-5">{call.summary || call.transcript}</p>
          </div>
        )}
        <CallRecordingActions
          callLogId={call.id}
          playbackUrl={call.playbackUrl}
          recordingSid={call.recordingSid}
        />
      </div>
    </Panel>
  );
}

function RecordingMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {label}
      </p>
      <p className="mt-1 truncate text-xs font-semibold text-gray-800 dark:text-white/90">
        {value}
      </p>
    </div>
  );
}

function Panel({
  badge,
  children,
  detail,
  title,
}: {
  badge?: string;
  children: React.ReactNode;
  detail?: string;
  title: string;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
                {title}
              </h2>
              {detail && <LazyHelpTooltip content={detail} />}
            </div>
            {detail && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{detail}</p>
            )}
          </div>
          {badge && <StatusBadge>{badge}</StatusBadge>}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function ConfigChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-gray-800 dark:text-white/90">
        {value}
      </p>
    </div>
  );
}
