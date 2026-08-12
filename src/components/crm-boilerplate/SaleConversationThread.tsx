"use client";

import {
  ChevronDown,
  ExternalLink,
  FileText,
  Globe2,
  Mail,
  MessageSquareText,
  Mic2,
  Phone,
  Play,
  Reply,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import { latestEmailReplyText, toEmailPlainText } from "@/lib/email/plain-text";

export type SaleConversationItem = {
  id: string;
  channel: string;
  direction: string;
  subject: string | null;
  summary: string;
  body: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  occurredAt: string;
  userName: string | null;
  contactName: string | null;
  metadata: unknown;
};

export type SaleConversationThreadProps = {
  communications: SaleConversationItem[];
  description?: string;
  embedded?: boolean;
  emptyLabel?: string;
  helpText?: string;
  onReply?: () => void;
  title?: string;
  totalCount?: number;
};

const conversationFilters = [
  { value: "ALL", label: "All" },
  { value: "PHONE", label: "Calls" },
  { value: "EMAIL", label: "Emails" },
  { value: "NOTE", label: "Notes" },
  { value: "SMS", label: "SMS" },
  { value: "WEBSITE", label: "Website" },
] as const;

const pageSize = 12;

type ConversationFilter = (typeof conversationFilters)[number]["value"];

function communicationVisual(channel: string): {
  Icon: LucideIcon;
  badgeClassName: string;
  iconClassName: string;
} {
  if (channel === "PHONE") {
    return {
      Icon: Phone,
      badgeClassName:
        "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
      iconClassName:
        "bg-sky-50 text-sky-700 ring-sky-100 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-900/40",
    };
  }

  if (channel === "EMAIL") {
    return {
      Icon: Mail,
      badgeClassName:
        "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
      iconClassName:
        "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-900/40",
    };
  }

  if (channel === "SMS" || channel === "WHATSAPP") {
    return {
      Icon: MessageSquareText,
      badgeClassName:
        "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300",
      iconClassName:
        "bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-900/40",
    };
  }

  if (channel === "NOTE") {
    return {
      Icon: StickyNote,
      badgeClassName:
        "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
      iconClassName:
        "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-900/40",
    };
  }

  if (channel === "WEBSITE") {
    return {
      Icon: Globe2,
      badgeClassName:
        "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300",
      iconClassName:
        "bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-900/40",
    };
  }

  return {
    Icon: FileText,
    badgeClassName:
      "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300",
    iconClassName:
      "bg-gray-100 text-gray-600 ring-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:ring-gray-800",
  };
}

function CommunicationIcon({ channel }: { channel: string }) {
  const visual = communicationVisual(channel);
  const Icon = visual.Icon;

  return (
    <span
      className={`inline-grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ring-inset ${visual.iconClassName}`}
    >
      <Icon className="block h-4 w-4" />
    </span>
  );
}

function ChannelBadge({ channel }: { channel: string }) {
  const visual = communicationVisual(channel);

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${visual.badgeClassName}`}
    >
      {channelLabel(channel)}
    </span>
  );
}

function compactUrlText(value: string | null) {
  if (!value?.trim()) return null;

  const match = value.match(/https?:\/\/[^\s)]+/i);
  const candidate = match?.[0] ?? value.trim();

  try {
    const parsed = new URL(candidate);
    return `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return candidate
      .replace(/^https?:\/\//i, "")
      .replace(/[?#].*$/, "")
      .trim();
  }
}

function firstUrl(value: string | null) {
  if (!value?.trim()) return null;
  return value.match(/https?:\/\/[^\s)]+/i)?.[0] ?? null;
}

function formatThreadTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(new Date(value));
}

function formatThreadDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "Europe/London",
    year: "numeric",
  }).format(new Date(value));
}

function londonDateStart(value: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/London",
    year: "numeric",
  }).formatToParts(value);
  const partValue = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return Date.UTC(partValue("year"), partValue("month") - 1, partValue("day"));
}

function threadDayLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const todayStart = londonDateStart(today);
  const dateStart = londonDateStart(date);
  const dayDelta = Math.round((todayStart - dateStart) / 86_400_000);

  if (dayDelta === 0) return "Today";
  if (dayDelta === 1) return "Yesterday";

  return formatThreadDate(value);
}

function metadataValue(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function metadataText(metadata: unknown, keys: string[]) {
  for (const key of keys) {
    const value = metadataValue(metadata, key);
    if (value?.trim()) return value.trim();
  }

  return null;
}

function recordingPlaybackUrl(
  recordingSid: string | null,
  recordingUrl: string | null,
) {
  if (recordingUrl?.startsWith("/api/twilio/voice/recordings/")) {
    return recordingUrl;
  }

  const sid =
    recordingSid || recordingUrl?.match(/\/Recordings\/([^/.]+)/)?.[1] || null;

  return sid ? `/api/twilio/voice/recordings/${sid}` : null;
}

function callDetailsLabel({
  hasRecording,
  hasTranscript,
}: {
  hasRecording: boolean;
  hasTranscript: boolean;
}) {
  if (hasRecording && hasTranscript) return "View recording and transcript";
  if (hasTranscript) return "View transcript";
  if (hasRecording) return "Play recording";
  return "View call details";
}

function externalActionLabel(
  channel: string,
  options: { hasRecording?: boolean; hasTranscript?: boolean } = {},
) {
  if (channel === "PHONE") {
    return callDetailsLabel({
      hasRecording: Boolean(options.hasRecording),
      hasTranscript: Boolean(options.hasTranscript),
    });
  }
  if (channel === "WEBSITE") return "Open page";
  return "Open";
}

function channelLabel(channel: string) {
  if (channel === "PHONE") return "Call";
  if (channel === "EMAIL") return "Email";
  if (channel === "SMS") return "SMS";
  if (channel === "WHATSAPP") return "WhatsApp";
  if (channel === "NOTE") return "Note";
  if (channel === "SYSTEM") return "System";
  if (channel === "WEBSITE") return "Website";
  return channel.toLowerCase();
}

function directionLabel(direction: string) {
  if (direction === "OUTBOUND") return "Outbound";
  if (direction === "INBOUND") return "Inbound";
  return "Internal";
}

function directionRoute(communication: SaleConversationItem) {
  if (communication.channel === "WEBSITE") {
    return communication.contactName
      ? `${communication.contactName} website activity`
      : "Website activity";
  }

  if (communication.direction === "OUTBOUND") {
    return `CRM → ${
      communication.contactName ||
      communication.toAddress ||
      communication.fromAddress ||
      "Customer"
    }`;
  }

  if (communication.direction === "INBOUND") {
    return `${
      communication.contactName ||
      communication.fromAddress ||
      communication.toAddress ||
      "Customer"
    } → CRM`;
  }

  return communication.userName
    ? `${communication.userName} added a note`
    : "Internal note";
}

function filterMatchesChannel(filter: ConversationFilter, channel: string) {
  if (filter === "ALL") return true;
  if (filter === "SMS") return channel === "SMS" || channel === "WHATSAPP";
  return channel === filter;
}

function statusClassName(status: string) {
  const normalisedStatus = status.toLowerCase();

  if (
    normalisedStatus.includes("fail") ||
    normalisedStatus.includes("error") ||
    normalisedStatus.includes("undelivered")
  ) {
    return "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400";
  }

  if (
    normalisedStatus.includes("complete") ||
    normalisedStatus.includes("sent") ||
    normalisedStatus.includes("delivered")
  ) {
    return "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400";
  }

  return "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300";
}

function directionPillClassName(direction: string, channel: string) {
  if (channel === "WEBSITE") {
    return "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300";
  }

  if (direction === "OUTBOUND") {
    return "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300";
  }

  if (direction === "INBOUND") {
    return "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-300";
  }

  return "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300";
}

function actionIcon(channel: string, hasRecording: boolean) {
  if (channel === "PHONE" && hasRecording) return Play;
  if (channel === "PHONE") return Phone;
  if (channel === "WEBSITE") return ExternalLink;
  return FileText;
}

function canReplyToCommunication(communication: SaleConversationItem) {
  if (communication.direction !== "INBOUND") return false;
  return ["EMAIL", "PHONE", "SMS", "WHATSAPP"].includes(communication.channel);
}

export default function SaleConversationThread({
  communications,
  description = "Calls, SMS, email and notes in one lead timeline.",
  embedded = false,
  emptyLabel = "No conversation yet. Calls, SMS and email will appear here.",
  helpText = "Shows the sales activity thread for this opportunity, including calls, SMS and email history in one timeline.",
  onReply,
  title = "Conversation",
  totalCount,
}: SaleConversationThreadProps) {
  const [activeFilter, setActiveFilter] = useState<ConversationFilter>("ALL");
  const [expandedId, setExpandedId] = useState<string | null | undefined>(
    undefined,
  );
  const [page, setPage] = useState(1);
  const orderedCommunications = useMemo(
    () =>
      [...communications].sort(
        (left, right) =>
          new Date(right.occurredAt).getTime() -
          new Date(left.occurredAt).getTime(),
      ),
    [communications],
  );
  const visibleCommunications = useMemo(
    () =>
      orderedCommunications.filter((communication) =>
        filterMatchesChannel(activeFilter, communication.channel),
      ),
    [activeFilter, orderedCommunications],
  );

  const totalPages = Math.max(
    1,
    Math.ceil(visibleCommunications.length / pageSize),
  );
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, visibleCommunications.length);
  const pagedCommunications = visibleCommunications.slice(pageStart, pageEnd);
  const groupedCommunications = pagedCommunications.reduce<
    Array<{ label: string; items: SaleConversationItem[] }>
  >((groups, communication) => {
    const label = threadDayLabel(communication.occurredAt);
    const existing = groups.find((group) => group.label === label);

    if (existing) {
      existing.items.push(communication);
      return groups;
    }

    groups.push({ label, items: [communication] });
    return groups;
  }, []);
  const visibleExpandedId =
    expandedId === undefined
      ? (visibleCommunications[0]?.id ?? null)
      : expandedId;
  const loadedCount = orderedCommunications.length;
  const allItemsCount = Math.max(totalCount ?? loadedCount, loadedCount);
  const hasPartialHistory = allItemsCount > loadedCount;
  const countLabel =
    hasPartialHistory && activeFilter === "ALL"
      ? `Latest ${loadedCount} of ${allItemsCount} items`
      : `${visibleCommunications.length} items`;

  return (
    <section
      className={
        embedded
          ? "overflow-hidden bg-white dark:bg-white/[0.03]"
          : "overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03]"
      }
    >
      <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
                {title}
              </h2>
              <LazyHelpTooltip content={helpText} />
            </div>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {description}
            </p>
            {hasPartialHistory ? (
              <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                Showing the latest {loadedCount} loaded items from {allItemsCount} total.
              </p>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
            <span className="inline-flex h-7 items-center rounded-md border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-600 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
              {countLabel}
            </span>
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1 dark:bg-white/[0.04]">
              {conversationFilters.map((filter) => {
                const selected = activeFilter === filter.value;

                return (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => {
                      setActiveFilter(filter.value);
                      setExpandedId(undefined);
                      setPage(1);
                    }}
                    className={`inline-flex h-7 shrink-0 items-center rounded-md px-2.5 text-xs font-semibold transition ${
                      selected
                        ? "bg-white text-gray-900 shadow-theme-xs dark:bg-gray-900 dark:text-white"
                        : "text-gray-500 hover:bg-white/70 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.05] dark:hover:text-gray-200"
                    }`}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="max-h-[calc(100dvh-220px)] min-h-[680px] space-y-5 overflow-y-auto bg-gray-50/70 px-3 py-4 dark:bg-black/10">
        {visibleCommunications.length ? (
          groupedCommunications.map((group) => (
            <div key={group.label} className="space-y-3">
              <div className="flex items-center gap-3 py-1">
                <span className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
                <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-500 shadow-theme-xs dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400">
                  {group.label}
                </span>
                <span className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
              </div>
              {group.items.map((communication) => {
                const index = orderedCommunications.findIndex(
                  (item) => item.id === communication.id,
                );
                const isLatest = index === 0;
                const status = metadataValue(communication.metadata, "status");
                const transcriptStatus = metadataValue(
                  communication.metadata,
                  "transcriptStatus",
                );
                const transcript = metadataText(communication.metadata, [
                  "transcript",
                  "transcription",
                  "transcriptText",
                ]);
                const recordingSid = metadataValue(
                  communication.metadata,
                  "recordingSid",
                );
                const directRecordingUrl =
                  metadataValue(communication.metadata, "recordingUrl") ||
                  (communication.channel === "PHONE" &&
                  (communication.body?.startsWith("http") ||
                    communication.body?.startsWith(
                      "/api/twilio/voice/recordings/",
                    ))
                    ? communication.body
                    : null);
                const recordingUrl =
                  metadataValue(communication.metadata, "playbackUrl") ||
                  recordingPlaybackUrl(recordingSid, directRecordingUrl);
                const opportunityId = metadataValue(
                  communication.metadata,
                  "opportunityId",
                );
                const opportunityTitle = metadataValue(
                  communication.metadata,
                  "opportunityTitle",
                );
                const normalizedBody = toEmailPlainText(communication.body);
                const plainBody =
                  communication.channel === "EMAIL"
                    ? latestEmailReplyText(normalizedBody)
                    : normalizedBody;
                const plainSummary = toEmailPlainText(communication.summary);
                const hasTranscript =
                  Boolean(transcript) ||
                  (communication.channel === "PHONE" &&
                    communication.subject
                      ?.toLowerCase()
                      .includes("transcript") === true &&
                    Boolean(communication.body));
                const detailBody =
                  communication.channel === "PHONE" &&
                  (recordingUrl || hasTranscript)
                    ? null
                    : plainBody;
                const displaySummary =
                  communication.channel === "WEBSITE"
                    ? compactUrlText(plainBody || plainSummary) || plainSummary
                    : plainSummary;
                const sourceLabel =
                  communication.channel === "WEBSITE"
                    ? status || compactUrlText(plainBody || plainSummary)
                    : null;
                const direction =
                  communication.channel === "WEBSITE"
                    ? "Activity"
                    : directionLabel(communication.direction);
                const isExpanded = visibleExpandedId === communication.id;
                const pageHref =
                  communication.channel === "WEBSITE"
                    ? firstUrl(plainBody || plainSummary)
                    : null;
                const ActionIcon = actionIcon(
                  communication.channel,
                  Boolean(recordingUrl),
                );
                const externalHref = recordingUrl || pageHref;
                const showReplyAction =
                  Boolean(onReply) && canReplyToCommunication(communication);
                const hasFooterActions =
                  showReplyAction || Boolean(opportunityId) || Boolean(externalHref);
                const cardClassName = [
                  "overflow-hidden rounded-xl border bg-white shadow-theme-xs transition dark:bg-gray-900",
                  isExpanded
                    ? "border-brand-200 ring-1 ring-brand-200/70 dark:border-brand-900/70 dark:ring-brand-900/40"
                    : "border-gray-200 hover:border-gray-300 hover:shadow-theme-sm dark:border-gray-800 dark:hover:border-gray-700",
                ].join(" ");

                return (
                  <article key={communication.id} className={cardClassName}>
                    <div
                      className={`grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start ${
                        isExpanded
                          ? "border-b border-gray-200 dark:border-gray-800"
                          : ""
                      }`}
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <CommunicationIcon channel={communication.channel} />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm leading-5 font-semibold text-gray-900 dark:text-white/90">
                              {communication.subject ??
                                channelLabel(communication.channel)}
                            </h3>
                            {isLatest && (
                              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                                Latest
                              </span>
                            )}
                            <ChannelBadge channel={communication.channel} />
                            {status && (
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClassName(status)}`}
                              >
                                {status}
                              </span>
                            )}
                            {recordingUrl ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                                <Mic2 className="block h-3 w-3" />
                                Recording
                              </span>
                            ) : null}
                            {transcriptStatus ? (
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClassName(transcriptStatus)}`}
                              >
                                Transcript {transcriptStatus.toLowerCase()}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-sm leading-5 text-gray-500 dark:text-gray-400">
                            {directionRoute(communication)}
                            {sourceLabel ? <span> | {sourceLabel}</span> : null}
                            {opportunityTitle ? (
                              <span> | {opportunityTitle}</span>
                            ) : null}
                          </p>
                          {!isExpanded ? (
                            <p className="mt-1 line-clamp-1 text-sm leading-5 text-gray-700 dark:text-gray-300">
                              {displaySummary}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                          {formatThreadTime(communication.occurredAt)}
                        </span>
                        <span
                          className={`hidden rounded-full px-2 py-0.5 text-[11px] font-semibold sm:inline-flex ${directionPillClassName(
                            communication.direction,
                            communication.channel,
                          )}`}
                        >
                          {direction}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId((current) =>
                              current === communication.id
                                ? null
                                : communication.id,
                            )
                          }
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-theme-xs transition hover:border-brand-200 hover:text-brand-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400 dark:hover:border-brand-900/60 dark:hover:text-brand-300"
                          aria-label={
                            isExpanded
                              ? "Collapse conversation item"
                              : "Expand conversation item"
                          }
                        >
                          <ChevronDown
                            className={`h-4 w-4 transition ${
                              isExpanded ? "rotate-180" : ""
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {isExpanded ? (
                      <div>
                        <div className="px-4 py-4">
                          {detailBody ? (
                            <p className="max-h-80 overflow-y-auto text-sm leading-6 whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                              {detailBody}
                            </p>
                          ) : (
                            <p className="text-sm leading-6 text-gray-700 dark:text-gray-300">
                              {displaySummary}
                            </p>
                          )}
                          {recordingUrl ? (
                            <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-800 dark:bg-white/[0.04]">
                              <audio
                                className="h-9 w-full"
                                controls
                                preload="none"
                                src={recordingUrl}
                              >
                                <a href={recordingUrl}>Download recording</a>
                              </audio>
                            </div>
                          ) : null}
                          {hasTranscript ? (
                            <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.04]">
                              <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
                                Transcript
                              </p>
                              <p className="mt-2 max-h-72 overflow-y-auto text-sm leading-6 whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                                {transcript || plainBody}
                              </p>
                            </div>
                          ) : null}
                        </div>

                        {hasFooterActions ? (
                          <div className="flex flex-wrap gap-2 border-t border-gray-200 bg-gray-50/80 px-4 py-3 dark:border-gray-800 dark:bg-white/[0.03]">
                            {showReplyAction ? (
                              <button
                                type="button"
                                onClick={onReply}
                                className="inline-flex h-9 items-center gap-2 rounded-lg border border-brand-200 bg-white px-3 text-sm font-semibold text-brand-600 shadow-theme-xs transition hover:bg-brand-50 dark:border-brand-900/60 dark:bg-gray-950 dark:text-brand-300 dark:hover:bg-brand-900/20"
                              >
                                <Reply className="h-4 w-4" />
                                Reply
                              </button>
                            ) : null}
                            {opportunityId ? (
                              <Link
                                href={`/sales/${opportunityId}`}
                                className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 shadow-theme-xs transition hover:border-brand-200 hover:text-brand-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:border-brand-900/60 dark:hover:text-brand-300"
                              >
                                <ExternalLink className="h-4 w-4" />
                                Open lead
                              </Link>
                            ) : null}
                            {externalHref ? (
                              <a
                                href={externalHref}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 shadow-theme-xs transition hover:border-brand-200 hover:text-brand-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:border-brand-900/60 dark:hover:text-brand-300"
                              >
                                <ActionIcon className="h-4 w-4" />
                                {externalActionLabel(communication.channel, {
                                  hasRecording: Boolean(recordingUrl),
                                  hasTranscript,
                                })}
                              </a>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
            {orderedCommunications.length
              ? "No conversation items match this filter."
              : emptyLabel}
          </div>
        )}
      </div>

      {visibleCommunications.length > pageSize ? (
        <div className="flex flex-col gap-3 border-t border-gray-200 bg-white px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between dark:border-gray-800 dark:bg-gray-900">
          <p className="text-gray-500 dark:text-gray-400">
            Showing{" "}
            <span className="font-semibold text-gray-700 dark:text-gray-200">
              {pageStart + 1}-{pageEnd}
            </span>{" "}
            of{" "}
            <span className="font-semibold text-gray-700 dark:text-gray-200">
              {visibleCommunications.length}
            </span>
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={currentPage === 1}
              className="inline-flex h-9 items-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 shadow-theme-xs transition hover:border-brand-200 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:border-brand-900/60 dark:hover:text-brand-300"
            >
              Previous
            </button>
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() =>
                setPage((value) => Math.min(totalPages, value + 1))
              }
              disabled={currentPage === totalPages}
              className="inline-flex h-9 items-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 shadow-theme-xs transition hover:border-brand-200 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:border-brand-900/60 dark:hover:text-brand-300"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
