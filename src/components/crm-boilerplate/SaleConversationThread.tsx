"use client";

import {
  ChevronDown,
  Download,
  ExternalLink,
  FileText,
  Globe2,
  Mail,
  MessageSquareText,
  Mic2,
  Paperclip,
  Phone,
  Play,
  Reply,
  Search,
  StickyNote,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import { replyToInboxMessage } from "@/lib/actions/inbox";
import { latestEmailReplyText, toEmailPlainText } from "@/lib/email/plain-text";
import {
  conversationItemMatchesQuery,
  saleConversationFilters,
  saleConversationPageSize,
  type SaleConversationFilter,
  type SaleConversationItem,
  type SaleConversationPage,
} from "@/lib/sales/conversation-types";

export type { SaleConversationItem } from "@/lib/sales/conversation-types";

export type SaleConversationThreadProps = {
  communications: SaleConversationItem[];
  description?: string;
  embedded?: boolean;
  emptyLabel?: string;
  helpText?: string;
  onReply?: () => void;
  saleId?: string;
  title?: string;
  totalCount?: number;
};

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

  if (channel === "FILE") {
    return {
      Icon: FileText,
      badgeClassName:
        "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
      iconClassName:
        "bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-900/40",
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

function metadataNumber(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metadataText(metadata: unknown, keys: string[]) {
  for (const key of keys) {
    const value = metadataValue(metadata, key);
    if (value?.trim()) return value.trim();
  }

  return null;
}

function emailAttachments(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }

  const value = (metadata as Record<string, unknown>).emailAttachments;
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];

    const record = item as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (!name) return [];

    return [
      {
        mimeType:
          typeof record.mimeType === "string" ? record.mimeType : null,
        name,
        sizeBytes:
          typeof record.sizeBytes === "number" ? record.sizeBytes : null,
      },
    ];
  });
}

function formatFileSize(value: number | null) {
  if (value === null || value < 0) return null;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
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
  if (channel === "FILE") return "Preview file";
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
  if (channel === "FILE") return "File";
  return channel.toLowerCase();
}

function directionLabel(direction: string) {
  if (direction === "OUTBOUND") return "Outbound";
  if (direction === "INBOUND") return "Inbound";
  return "Internal";
}

function isPipedriveFileActivity(communication: SaleConversationItem) {
  return (
    metadataValue(communication.metadata, "source") ===
    "pipedrive-file-import"
  );
}

function displayChannel(communication: SaleConversationItem) {
  return isPipedriveFileActivity(communication)
    ? "FILE"
    : communication.channel;
}

function directionRoute(communication: SaleConversationItem) {
  if (isPipedriveFileActivity(communication)) {
    return "Pipedrive file activity";
  }

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

function filterMatchesChannel(
  filter: SaleConversationFilter,
  communication: SaleConversationItem,
) {
  const channel = displayChannel(communication);
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

  if (channel === "FILE") {
    return "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300";
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
  saleId,
  title = "Conversation",
  totalCount,
}: SaleConversationThreadProps) {
  const router = useRouter();
  const [activeFilter, setActiveFilter] =
    useState<SaleConversationFilter>("ALL");
  const [searchText, setSearchText] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null | undefined>(
    undefined,
  );
  const [page, setPage] = useState(1);
  const [remotePage, setRemotePage] =
    useState<SaleConversationPage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replySuccess, setReplySuccess] = useState<string | null>(null);
  const [isGmailReplying, startGmailReplyTransition] = useTransition();

  function sendGmailReply(communication: SaleConversationItem) {
    if (!communication.gmailReply || !replyBody.trim()) return;

    setReplyError(null);
    setReplySuccess(null);
    startGmailReplyTransition(async () => {
      try {
        const result = await replyToInboxMessage(
          communication.gmailReply!.emailMessageId,
          replyBody,
        );
        if (!result.ok) {
          setReplyError(result.message);
          return;
        }

        setReplyBody("");
        setReplySuccess(result.message);
        router.refresh();
      } catch {
        setReplyError("The Gmail reply could not be sent. Please try again.");
      }
    });
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextQuery = searchText.trim().slice(0, 200);
      setActiveQuery(nextQuery);
      setRemotePage(null);
      setExpandedId(undefined);
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    if (!saleId) {
      setRemotePage(null);
      setLoadError(null);
      return;
    }

    const controller = new AbortController();
    const loadPage = async () => {
      setIsLoading(true);
      setLoadError(null);

      try {
        const searchParams = new URLSearchParams({
          filter: activeFilter,
          page: String(page),
        });
        if (activeQuery) searchParams.set("q", activeQuery);
        const response = await fetch(
          `/api/sales/${encodeURIComponent(saleId)}/conversation?${searchParams.toString()}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) {
          throw new Error("Conversation history could not be loaded.");
        }

        const result = (await response.json()) as SaleConversationPage;
        if (
          !Array.isArray(result.items) ||
          result.filter !== activeFilter ||
          result.query !== activeQuery
        ) {
          throw new Error("Conversation history returned an invalid response.");
        }

        setRemotePage(result);
        if (result.page !== page) setPage(result.page);
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadError(
          error instanceof Error
            ? error.message
            : "Conversation history could not be loaded.",
        );
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    void loadPage();
    return () => controller.abort();
  }, [activeFilter, activeQuery, communications, page, saleId, totalCount]);
  const orderedCommunications = useMemo(
    () =>
      [...communications].sort(
        (left, right) =>
          new Date(right.occurredAt).getTime() -
          new Date(left.occurredAt).getTime(),
      ),
    [communications],
  );
  const initialFilteredCommunications = useMemo(
    () =>
      orderedCommunications.filter(
        (communication) =>
          filterMatchesChannel(activeFilter, communication) &&
          conversationItemMatchesQuery(communication, activeQuery),
      ),
    [activeFilter, activeQuery, orderedCommunications],
  );
  const hasCurrentRemotePage =
    Boolean(saleId) &&
    remotePage?.filter === activeFilter &&
    remotePage.page === page;
  const visibleCommunications = hasCurrentRemotePage
    ? remotePage.items
    : initialFilteredCommunications;

  const remoteTotal = hasCurrentRemotePage ? remotePage.total : null;
  const totalPages = hasCurrentRemotePage
    ? remotePage.totalPages
    : Math.max(
        1,
        Math.ceil(initialFilteredCommunications.length / saleConversationPageSize),
      );
  const currentPage = saleId ? page : Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * saleConversationPageSize;
  const pageEnd = hasCurrentRemotePage
    ? pageStart + visibleCommunications.length
    : Math.min(
        pageStart + saleConversationPageSize,
        visibleCommunications.length,
      );
  const pagedCommunications = hasCurrentRemotePage
    ? visibleCommunications
    : visibleCommunications.slice(pageStart, pageEnd);
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
  const allItemsCount = activeQuery
    ? (remotePage?.counts.ALL ?? initialFilteredCommunications.length)
    : Math.max(
        remotePage?.counts.ALL ?? totalCount ?? loadedCount,
        loadedCount,
      );
  const hasPartialHistory = !saleId && allItemsCount > loadedCount;
  const filteredTotal = remoteTotal ?? initialFilteredCommunications.length;
  const countLabel = isLoading
    ? activeQuery
      ? "Searching history"
      : "Loading history"
    : `${activeFilter === "ALL" ? allItemsCount : filteredTotal} ${activeQuery ? "matches" : "items"}`;

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
            {hasPartialHistory && !activeQuery ? (
              <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                Showing the latest {loadedCount} loaded items from {allItemsCount} total.
              </p>
            ) : null}
            {saleId ? (
              <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                Complete history is loaded from the server one page at a time.
              </p>
            ) : null}
            {loadError ? (
              <p className="mt-1 text-xs font-medium text-error-600 dark:text-error-400">
                {loadError}
              </p>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
            <div className="relative min-w-[220px] flex-1 sm:flex-none">
              <label className="sr-only" htmlFor="conversation-search">
                Search conversation
              </label>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              />
              <input
                id="conversation-search"
                type="search"
                value={searchText}
                maxLength={200}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search conversation"
                className="h-9 w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-9 text-sm text-gray-800 shadow-theme-xs outline-none transition placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
              />
              {searchText ? (
                <button
                  type="button"
                  aria-label="Clear conversation search"
                  onClick={() => setSearchText("")}
                  className="absolute right-2 top-1/2 inline-grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <span className="inline-flex h-7 items-center rounded-md border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-600 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
              {countLabel}
            </span>
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1 dark:bg-white/[0.04]">
              {saleConversationFilters.map((filter) => {
                const selected = activeFilter === filter.value;

                return (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => {
                      setActiveFilter(filter.value);
                      setRemotePage(null);
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
        {pagedCommunications.length ? (
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
                const renderedChannel = displayChannel(communication);
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
                const attachments =
                  communication.channel === "EMAIL"
                    ? emailAttachments(communication.metadata)
                    : [];
                const attachmentCount = Math.max(
                  attachments.length,
                  metadataNumber(
                    communication.metadata,
                    "emailAttachmentCount",
                  ) ?? 0,
                );
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
                  renderedChannel === "FILE" ||
                  communication.channel === "WEBSITE"
                    ? "Activity"
                    : directionLabel(communication.direction);
                const isExpanded = visibleExpandedId === communication.id;
                const pageHref =
                  communication.channel === "WEBSITE"
                    ? firstUrl(plainBody || plainSummary)
                    : null;
                const filePreviewUrl = isPipedriveFileActivity(communication)
                  ? metadataValue(communication.metadata, "previewUrl")
                  : null;
                const fileDownloadUrl = isPipedriveFileActivity(communication)
                  ? metadataValue(communication.metadata, "downloadUrl")
                  : null;
                const ActionIcon = actionIcon(
                  renderedChannel,
                  Boolean(recordingUrl),
                );
                const externalHref =
                  recordingUrl || pageHref || filePreviewUrl;
                const showGmailReplyAction = Boolean(communication.gmailReply);
                const showReplyAction =
                  !showGmailReplyAction &&
                  Boolean(onReply) &&
                  canReplyToCommunication(communication);
                const hasFooterActions =
                  showGmailReplyAction ||
                  showReplyAction ||
                  Boolean(opportunityId) ||
                  Boolean(externalHref) ||
                  Boolean(fileDownloadUrl);
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
                        <CommunicationIcon channel={renderedChannel} />
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
                            <ChannelBadge channel={renderedChannel} />
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
                            {attachmentCount ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700 dark:bg-white/[0.06] dark:text-gray-300">
                                <Paperclip className="block h-3 w-3" />
                                {attachmentCount} attachment
                                {attachmentCount === 1 ? "" : "s"}
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
                            renderedChannel,
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
                          {attachmentCount ? (
                            <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.04]">
                              <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
                                Email attachments
                              </p>
                              <div className="mt-2 space-y-2">
                                {attachments.map((attachment, index) => (
                                  <div
                                    key={`${attachment.name}-${index}`}
                                    className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"
                                  >
                                    <Paperclip className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                                    <div className="min-w-0">
                                      <p className="break-all font-medium">
                                        {attachment.name}
                                      </p>
                                      {attachment.mimeType ||
                                      attachment.sizeBytes !== null ? (
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                          {[
                                            attachment.mimeType,
                                            formatFileSize(
                                              attachment.sizeBytes,
                                            ),
                                          ]
                                            .filter(Boolean)
                                            .join(" · ")}
                                        </p>
                                      ) : null}
                                    </div>
                                  </div>
                                ))}
                                {!attachments.length ? (
                                  <p className="text-sm text-gray-600 dark:text-gray-400">
                                    Pipedrive reported an attachment, but did not return its file details.
                                  </p>
                                ) : null}
                              </div>
                              <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                                Pipedrive reference only — copy the file into CRM storage before final cutover.
                              </p>
                            </div>
                          ) : null}
                        </div>

                        {hasFooterActions ? (
                          <div className="flex flex-wrap gap-2 border-t border-gray-200 bg-gray-50/80 px-4 py-3 dark:border-gray-800 dark:bg-white/[0.03]">
                            {showGmailReplyAction ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setReplyingToId((current) =>
                                    current === communication.id
                                      ? null
                                      : communication.id,
                                  );
                                  setReplyBody("");
                                  setReplyError(null);
                                  setReplySuccess(null);
                                }}
                                className="inline-flex h-9 items-center gap-2 rounded-lg border border-brand-200 bg-white px-3 text-sm font-semibold text-brand-600 shadow-theme-xs transition hover:bg-brand-50 dark:border-brand-900/60 dark:bg-gray-950 dark:text-brand-300 dark:hover:bg-brand-900/20"
                              >
                                <Reply className="h-4 w-4" />
                                Reply in Gmail
                              </button>
                            ) : null}
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
                                {externalActionLabel(renderedChannel, {
                                  hasRecording: Boolean(recordingUrl),
                                  hasTranscript,
                                })}
                              </a>
                            ) : null}
                            {fileDownloadUrl ? (
                              <a
                                href={fileDownloadUrl}
                                download
                                className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 shadow-theme-xs transition hover:border-brand-200 hover:text-brand-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:border-brand-900/60 dark:hover:text-brand-300"
                              >
                                <Download className="h-4 w-4" />
                                Download file
                              </a>
                            ) : null}
                          </div>
                        ) : null}

                        {replyingToId === communication.id &&
                        communication.gmailReply ? (
                          <form
                            className="border-t border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-950"
                            onSubmit={(event) => {
                              event.preventDefault();
                              sendGmailReply(communication);
                            }}
                          >
                            <div className="grid gap-3 text-sm sm:grid-cols-2">
                              <div>
                                <span className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
                                  To
                                </span>
                                <p className="mt-1 break-all text-gray-800 dark:text-white/90">
                                  {communication.gmailReply.recipient}
                                </p>
                              </div>
                              <div>
                                <span className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
                                  Subject
                                </span>
                                <p className="mt-1 text-gray-800 dark:text-white/90">
                                  {communication.gmailReply.subject}
                                </p>
                              </div>
                            </div>
                            <label
                              className="mt-4 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                              htmlFor={`sale-gmail-reply-${communication.id}`}
                            >
                              Reply
                            </label>
                            <textarea
                              autoFocus
                              className="mt-2 min-h-32 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm text-gray-800 outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-500/10 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                              disabled={isGmailReplying}
                              id={`sale-gmail-reply-${communication.id}`}
                              maxLength={20_000}
                              placeholder="Write your reply..."
                              required
                              value={replyBody}
                              onChange={(event) => {
                                setReplyBody(event.target.value);
                                setReplyError(null);
                                setReplySuccess(null);
                              }}
                            />
                            {replyError ? (
                              <p className="mt-2 text-sm font-medium text-error-600 dark:text-error-400">
                                {replyError}
                              </p>
                            ) : null}
                            {replySuccess ? (
                              <p className="mt-2 text-sm font-medium text-success-600 dark:text-success-400">
                                {replySuccess}
                              </p>
                            ) : null}
                            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                              <button
                                className="inline-flex h-10 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                                disabled={isGmailReplying}
                                type="button"
                                onClick={() => {
                                  setReplyingToId(null);
                                  setReplyBody("");
                                  setReplyError(null);
                                  setReplySuccess(null);
                                }}
                              >
                                Cancel
                              </button>
                              <button
                                className="inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={isGmailReplying || !replyBody.trim()}
                                type="submit"
                              >
                                {isGmailReplying
                                  ? "Sending..."
                                  : "Send Gmail reply"}
                              </button>
                            </div>
                          </form>
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
            {activeQuery
              ? `No conversation items match “${activeQuery}”.`
              : orderedCommunications.length
              ? "No conversation items match this filter."
              : emptyLabel}
          </div>
        )}
      </div>

      {(remoteTotal ?? visibleCommunications.length) >
      saleConversationPageSize ? (
        <div className="flex flex-col gap-3 border-t border-gray-200 bg-white px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between dark:border-gray-800 dark:bg-gray-900">
          <p className="text-gray-500 dark:text-gray-400">
            Showing{" "}
            <span className="font-semibold text-gray-700 dark:text-gray-200">
              {pageStart + 1}-{pageEnd}
            </span>{" "}
            of{" "}
            <span className="font-semibold text-gray-700 dark:text-gray-200">
              {remoteTotal ?? visibleCommunications.length}
            </span>
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={currentPage === 1 || isLoading}
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
              disabled={currentPage === totalPages || isLoading}
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
