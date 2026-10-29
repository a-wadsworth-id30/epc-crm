"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import StatusBadge from "@/components/crm-boilerplate/StatusBadge";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import { Modal } from "@/components/ui/modal";
import {
  InboxAltIcon,
  MailIcon,
  MoreDotIcon,
  SearchIcon,
  StarLine,
} from "@/icons";
import {
  assignInboxThreadToSale,
  archiveInboxMessage,
  markInboxMessageRead,
  replyToInboxMessage,
  restoreInboxMessage,
  searchInboxSales,
} from "@/lib/actions/inbox";
import type { InboxSaleOption } from "@/lib/actions/inbox";
import { latestInboundEmailPlainText } from "@/lib/email/plain-text";
import { inboxReplyRecipient, inboxReplySubject } from "@/lib/inbox/reply";
import type {
  InboxMessageDetail,
  InboxMessageSummary,
} from "@/lib/inbox/types";

export type InboxClientProps = {
  counts: {
    all: number;
    archived: number;
    matched: number;
    unmatched: number;
    unread: number;
  };
  lane: string;
  messages: InboxMessageSummary[];
  page: number;
  pageSize: number;
  pageSizeOptions: number[];
  query: string;
  selectedMessageId?: string;
  totalCount: number;
};

const lanes = [
  { key: "", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "matched", label: "Matched" },
  { key: "unmatched", label: "Unmatched" },
  { key: "archived", label: "Archived" },
] as const;

function inboxHref({
  lane,
  messageId,
  page,
  pageSize,
  query,
}: {
  lane?: string;
  messageId?: string;
  page?: number;
  pageSize?: number;
  query?: string;
}) {
  const params = new URLSearchParams();
  if (lane) params.set("lane", lane);
  if (messageId) params.set("message", messageId);
  if (page && page > 1) params.set("page", String(page));
  if (pageSize && pageSize !== 25) params.set("pageSize", String(pageSize));
  if (query) params.set("q", query);

  const suffix = params.toString();
  return suffix ? `/inbox?${suffix}` : "/inbox";
}

function initials(value: string) {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

function senderName(message: InboxMessageSummary) {
  if (message.fromName) return message.fromName;
  return message.fromAddress ?? "Unknown sender";
}

function contactName(contact: InboxMessageSummary["contact"]) {
  if (!contact) return null;
  return `${contact.firstName} ${contact.lastName}`.trim() || contact.email;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "Europe/London",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "Europe/London",
    year: "numeric",
  }).format(new Date(value));
}

function statusTone(message: InboxMessageSummary) {
  if (message.status === "ARCHIVED") {
    return "bg-gray-100 text-gray-700 ring-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:ring-gray-800";
  }

  if (message.opportunity) {
    return "bg-success-50 text-success-700 ring-success-200 dark:bg-success-900/20 dark:text-success-300 dark:ring-success-900/40";
  }

  return "bg-warning-50 text-warning-700 ring-warning-200 dark:bg-warning-900/20 dark:text-warning-300 dark:ring-warning-900/40";
}

function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${className}`}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}

export default function InboxClient({
  counts,
  lane,
  messages,
  page,
  pageSize,
  pageSizeOptions,
  query,
  selectedMessageId,
  totalCount,
}: InboxClientProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [isAssigning, startAssignmentTransition] = useTransition();
  const [isReplying, startReplyTransition] = useTransition();
  const [selectedId, setSelectedId] = useState(
    selectedMessageId ?? messages[0]?.id ?? "",
  );
  const [messageDetails, setMessageDetails] = useState<
    Record<string, InboxMessageDetail>
  >({});
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [assignmentQuery, setAssignmentQuery] = useState("");
  const [assignmentSales, setAssignmentSales] = useState<InboxSaleOption[]>([]);
  const [assignmentSaleId, setAssignmentSaleId] = useState("");
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [assignmentSearching, setAssignmentSearching] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const selectedSummary = useMemo(
    () => messages.find((message) => message.id === selectedId) ?? messages[0],
    [messages, selectedId],
  );
  const selectedDetail = selectedId ? messageDetails[selectedId] : undefined;
  const detailError = selectedId ? detailErrors[selectedId] : null;
  const isDetailLoading = Boolean(
    selectedId && !selectedDetail && !detailError,
  );
  const selectedMessage = selectedDetail ?? selectedSummary;
  const hasMessages = counts.all > 0 || messages.length > 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  useEffect(() => {
    if (!selectedId || selectedDetail || detailError) return;

    const controller = new AbortController();

    fetch(`/api/inbox/messages/${encodeURIComponent(selectedId)}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Message detail request failed.");
        }

        return (await response.json()) as { message?: InboxMessageDetail };
      })
      .then((payload) => {
        const detail = payload.message;

        if (!detail) {
          throw new Error("Message detail response was empty.");
        }

        setMessageDetails((current) => ({
          ...current,
          [detail.id]: detail,
        }));
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;

        setDetailErrors((current) => ({
          ...current,
          [selectedId]:
            "Full email content could not be loaded. Showing the saved preview.",
        }));
      });

    return () => controller.abort();
  }, [detailError, selectedDetail, selectedId]);

  function selectMessage(messageId: string) {
    setAssignmentOpen(false);
    setReplyOpen(false);
    setReplyBody("");
    setReplyError(null);
    setSelectedId(messageId);
    router.replace(inboxHref({ lane, messageId, page, pageSize, query }), {
      scroll: false,
    });
  }

  function sendReply() {
    if (!selectedMessage) return;

    setReplyError(null);
    startReplyTransition(async () => {
      try {
        const result = await replyToInboxMessage(
          selectedMessage.id,
          replyBody,
        );
        if (!result.ok) {
          setReplyError(result.message);
          return;
        }

        setReplyBody("");
        setReplyOpen(false);
        showToast(result.message);
        router.refresh();
      } catch {
        setReplyError("The Gmail reply could not be sent. Please try again.");
      }
    });
  }

  async function loadAssignmentSales(messageId: string, search: string) {
    setAssignmentSearching(true);
    setAssignmentError(null);
    try {
      const result = await searchInboxSales(messageId, search);
      if (!result.ok) {
        setAssignmentSales([]);
        setAssignmentError(result.message);
        return;
      }
      setAssignmentSales(result.sales);
      if (!result.sales.length) {
        setAssignmentError("No accessible sales matched this search.");
      }
    } catch {
      setAssignmentSales([]);
      setAssignmentError("Sales could not be loaded. Please try again.");
    } finally {
      setAssignmentSearching(false);
    }
  }

  function openAssignment() {
    if (!selectedMessage || selectedMessage.provider !== "gmail") return;
    setAssignmentQuery("");
    setAssignmentSaleId(selectedMessage.opportunity?.id ?? "");
    setAssignmentSales([]);
    setAssignmentError(null);
    setAssignmentOpen(true);
    void loadAssignmentSales(selectedMessage.id, "");
  }

  function assignThread() {
    if (!selectedMessage || !assignmentSaleId) return;

    startAssignmentTransition(async () => {
      try {
        const result = await assignInboxThreadToSale(
          selectedMessage.id,
          assignmentSaleId,
        );
        if (!result.ok) {
          setAssignmentError(result.message);
          return;
        }

        setMessageDetails((current) => {
          const next = { ...current };
          delete next[selectedMessage.id];
          return next;
        });
        setAssignmentOpen(false);
        showToast(result.message);
        router.refresh();
      } catch {
        setAssignmentError(
          "The Gmail thread could not be assigned. Please try again.",
        );
      }
    });
  }

  function runMessageAction(
    action: () => Promise<void>,
    successMessage: string,
  ) {
    startTransition(async () => {
      try {
        await action();
        showToast(successMessage);
        router.refresh();
      } catch {
        showToast("That inbox action failed. Please try again.", "error");
      }
    });
  }

  return (
    <>
      {hasMessages ? (
        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-3 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="grid gap-2 text-xs sm:grid-cols-5">
            {lanes.map((item) => (
              <MailboxLink
                key={item.key}
                active={lane === item.key}
                href={inboxHref({ lane: item.key, query })}
                label={item.label}
                value={counts[item.key || "all"]}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-dashed border-gray-300 bg-white px-5 py-4 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
          No inbound email has been captured yet.
        </div>
      )}

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="grid min-h-[680px] lg:grid-cols-[380px_1fr]">
          <aside className="flex min-h-0 flex-col border-b border-gray-200 bg-white lg:border-r lg:border-b-0 dark:border-gray-800 dark:bg-white/[0.02]">
            <div className="border-b border-gray-200 p-4 dark:border-gray-800">
              <form action="/inbox" className="relative">
                {lane ? <input name="lane" type="hidden" value={lane} /> : null}
                {pageSize !== 25 ? (
                  <input name="pageSize" type="hidden" value={pageSize} />
                ) : null}
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white pr-3 pl-9 text-sm text-gray-800 outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-950 dark:text-white/90"
                  defaultValue={query}
                  name="q"
                  placeholder="Search email, subject or lead"
                />
              </form>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {messages.length === 0 ? (
                <p className="px-5 py-8 text-sm text-gray-500 dark:text-gray-400">
                  No messages match this view.
                </p>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {messages.map((message) => {
                    const isSelected = message.id === selectedMessage?.id;
                    const displayName =
                      contactName(message.contact) ?? senderName(message);

                    return (
                      <button
                        key={message.id}
                        className={`block w-full px-4 py-4 text-left transition hover:bg-gray-50 dark:hover:bg-white/[0.04] ${
                          isSelected
                            ? "bg-brand-25 ring-1 ring-brand-100 ring-inset dark:bg-brand-500/10 dark:ring-brand-900/40"
                            : ""
                        }`}
                        type="button"
                        onClick={() => selectMessage(message.id)}
                      >
                        <div className="flex items-start gap-3">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                            {initials(displayName)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-semibold text-gray-900 dark:text-white/90">
                                {displayName}
                              </p>
                              <span className="shrink-0 text-xs text-gray-400">
                                {formatDate(message.receivedAt)}
                              </span>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                              {message.fromAddress ?? "No sender address"}
                            </p>
                            <p className="mt-2 truncate text-sm font-medium text-gray-800 dark:text-white/90">
                              {message.subject ?? "No subject"}
                            </p>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                              {message.summary}
                            </p>
                            <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
                              <Badge className={statusTone(message)}>
                                {message.opportunity
                                  ? "Matched lead"
                                  : "Unmatched"}
                              </Badge>
                              {message.status === "UNREAD" ? (
                                <Badge className="bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:ring-sky-900/40">
                                  Unread
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
              <select
                aria-label="Messages per page"
                value={pageSize}
                onChange={(event) => {
                  router.push(
                    inboxHref({
                      lane,
                      pageSize: Number(event.target.value),
                      query,
                    }),
                  );
                }}
                className="h-8 rounded-lg border border-gray-300 bg-white px-2 dark:border-gray-700 dark:bg-gray-950"
              >
                {pageSizeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option} rows
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <Link
                  aria-disabled={page <= 1}
                  className={`rounded-lg border px-3 py-1.5 font-medium ${
                    page <= 1
                      ? "pointer-events-none border-gray-200 text-gray-300 dark:border-gray-800 dark:text-gray-700"
                      : "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300"
                  }`}
                  href={inboxHref({ lane, page: page - 1, pageSize, query })}
                >
                  Prev
                </Link>
                <span>
                  {page} / {totalPages}
                </span>
                <Link
                  aria-disabled={page >= totalPages}
                  className={`rounded-lg border px-3 py-1.5 font-medium ${
                    page >= totalPages
                      ? "pointer-events-none border-gray-200 text-gray-300 dark:border-gray-800 dark:text-gray-700"
                      : "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300"
                  }`}
                  href={inboxHref({ lane, page: page + 1, pageSize, query })}
                >
                  Next
                </Link>
              </div>
            </div>
          </aside>

          <main className="min-w-0 bg-gray-50 dark:bg-black/10">
            {selectedMessage ? (
              <div className="flex min-h-full flex-col">
                <div className="border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-white/[0.02]">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge className={statusTone(selectedMessage)}>
                          {selectedMessage.opportunity
                            ? "Matched lead"
                            : "Unmatched"}
                        </Badge>
                        <StatusBadge>{selectedMessage.status}</StatusBadge>
                        <span className="text-xs text-gray-400">
                          {formatDateTime(selectedMessage.receivedAt)}
                        </span>
                      </div>
                      <h2 className="truncate text-xl font-semibold text-gray-900 dark:text-white/90">
                        {selectedMessage.subject ?? "No subject"}
                      </h2>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        From {senderName(selectedMessage)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {selectedMessage.status === "UNREAD" ? (
                        <IconButton
                          label="Mark read"
                          disabled={isPending}
                          onClick={() =>
                            runMessageAction(
                              () => markInboxMessageRead(selectedMessage.id),
                              "Message marked as read.",
                            )
                          }
                        >
                          <StarLine className="h-4 w-4" />
                        </IconButton>
                      ) : null}
                      <IconButton
                        label={
                          selectedMessage.status === "ARCHIVED"
                            ? "Restore"
                            : "Archive"
                        }
                        disabled={isPending}
                        onClick={() =>
                          runMessageAction(
                            () =>
                              selectedMessage.status === "ARCHIVED"
                                ? restoreInboxMessage(selectedMessage.id)
                                : archiveInboxMessage(selectedMessage.id),
                            selectedMessage.status === "ARCHIVED"
                              ? "Message restored."
                              : "Message archived.",
                          )
                        }
                      >
                        <MoreDotIcon className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </div>
                </div>

                <div className="flex-1 p-4 sm:p-6">
                  <div className="rounded-xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
                    <div className="flex items-start gap-4 border-b border-gray-100 px-5 py-5 dark:border-gray-800">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                        {initials(senderName(selectedMessage))}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 dark:text-white/90">
                              {senderName(selectedMessage)}
                            </p>
                            <p className="mt-0.5 text-sm break-all text-gray-500 dark:text-gray-400">
                              {selectedMessage.fromAddress ??
                                "No sender address"}
                            </p>
                            <p className="mt-0.5 text-xs break-all text-gray-400">
                              To {selectedMessage.toAddress ?? "CRM inbox"}
                            </p>
                          </div>
                          <p className="text-xs text-gray-400">
                            {formatDateTime(selectedMessage.receivedAt)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 px-5 py-6 text-sm leading-7 break-words text-gray-700 dark:text-gray-300">
                      {isDetailLoading && !selectedDetail ? (
                        <p className="text-xs font-medium text-gray-400 dark:text-gray-500">
                          Loading full email content...
                        </p>
                      ) : null}
                      {detailError && !selectedDetail ? (
                        <p className="text-xs font-medium text-error-600 dark:text-error-400">
                          {detailError}
                        </p>
                      ) : null}
                      {(selectedDetail
                        ? latestInboundEmailPlainText({
                            fallback: selectedDetail.summary,
                            html: selectedDetail.htmlBody,
                            text: selectedDetail.textBody,
                          })
                        : selectedMessage.summary
                      )
                        .split(/\n{2,}/)
                        .map((paragraph) => (
                          <p key={paragraph}>{paragraph}</p>
                        ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-5 py-4 dark:border-gray-800">
                      {selectedMessage.opportunity ? (
                        <Link
                          className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600"
                          href={`/sales/${selectedMessage.opportunity.id}`}
                        >
                          <MailIcon className="h-4 w-4" />
                          Open lead
                        </Link>
                      ) : null}
                      {selectedMessage.provider === "gmail" ? (
                        <button
                          className="inline-flex h-10 items-center gap-2 rounded-lg border border-brand-300 bg-white px-4 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-brand-800 dark:bg-gray-900 dark:text-brand-300 dark:hover:bg-brand-500/10"
                          disabled={isPending || isAssigning}
                          type="button"
                          onClick={openAssignment}
                        >
                          {selectedMessage.opportunity
                            ? "Move to another sale"
                            : "Assign to sale"}
                        </button>
                      ) : null}
                      {selectedMessage.provider === "gmail" &&
                      inboxReplyRecipient(selectedMessage) ? (
                        <button
                          className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                          disabled={!selectedMessage.opportunity || isReplying}
                          title={
                            selectedMessage.opportunity
                              ? "Reply from the connected Gmail mailbox"
                              : "Assign this Gmail conversation to a sale before replying"
                          }
                          type="button"
                          onClick={() => {
                            setReplyError(null);
                            setReplyOpen((current) => !current);
                          }}
                        >
                          {selectedMessage.opportunity
                            ? "Reply in CRM"
                            : "Assign to sale to reply"}
                        </button>
                      ) : null}
                    </div>

                    {replyOpen && selectedMessage.opportunity ? (
                      <form
                        className="border-t border-gray-100 bg-gray-50/70 px-5 py-5 dark:border-gray-800 dark:bg-white/[0.02]"
                        onSubmit={(event) => {
                          event.preventDefault();
                          sendReply();
                        }}
                      >
                        <div className="grid gap-3 text-sm sm:grid-cols-2">
                          <div>
                            <span className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
                              To
                            </span>
                            <p className="mt-1 break-all text-gray-800 dark:text-white/90">
                              {inboxReplyRecipient(selectedMessage)}
                            </p>
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
                              Subject
                            </span>
                            <p className="mt-1 text-gray-800 dark:text-white/90">
                              {inboxReplySubject(selectedMessage.subject)}
                            </p>
                          </div>
                        </div>
                        <label
                          className="mt-4 block text-sm font-semibold text-gray-700 dark:text-gray-300"
                          htmlFor={`inbox-reply-${selectedMessage.id}`}
                        >
                          Reply
                        </label>
                        <textarea
                          autoFocus
                          className="mt-2 min-h-36 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm text-gray-800 outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-500/10 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-950 dark:text-white/90"
                          disabled={isReplying}
                          id={`inbox-reply-${selectedMessage.id}`}
                          maxLength={20_000}
                          placeholder="Write your reply..."
                          required
                          value={replyBody}
                          onChange={(event) => setReplyBody(event.target.value)}
                        />
                        {replyError ? (
                          <p className="mt-2 text-sm font-medium text-error-600 dark:text-error-400">
                            {replyError}
                          </p>
                        ) : null}
                        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                          <button
                            className="inline-flex h-10 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                            disabled={isReplying}
                            type="button"
                            onClick={() => {
                              setReplyOpen(false);
                              setReplyError(null);
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            className="inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={isReplying || !replyBody.trim()}
                            type="submit"
                          >
                            {isReplying ? "Sending..." : "Send Gmail reply"}
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_320px]">
                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
                      <div className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
                        Lead routing
                      </div>
                      {selectedMessage.opportunity ? (
                        <div className="mt-3 space-y-2">
                          <Link
                            href={`/sales/${selectedMessage.opportunity.id}`}
                            className="block text-sm font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-300"
                          >
                            {selectedMessage.opportunity.title}
                          </Link>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Stage:{" "}
                            {selectedMessage.opportunity.stage.replaceAll(
                              "_",
                              " ",
                            )}
                          </p>
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                          No active lead matched this sender.
                        </p>
                      )}
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
                      <div className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
                        Message state
                      </div>
                      <div className="mt-3 space-y-3 text-gray-600 dark:text-gray-300">
                        <StateRow
                          label="Provider"
                          value={
                            selectedMessage.provider === "gmail"
                              ? "Gmail"
                              : selectedMessage.provider === "mailersend"
                                ? "MailerSend"
                                : selectedMessage.provider
                          }
                        />
                        <StateRow
                          label="Route"
                          value={selectedMessage.inboundRouteId ?? "-"}
                        />
                        <StateRow
                          label="Direction"
                          value={selectedMessage.direction}
                        />
                        <StateRow
                          label="Status"
                          value={selectedMessage.status}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid min-h-[680px] place-items-center p-8 text-center">
                <div>
                  <InboxAltIcon className="mx-auto h-10 w-10 text-gray-300" />
                  <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Select a message to review.
                  </p>
                </div>
              </div>
            )}
          </main>
        </div>
      </section>

      <Modal
        className="max-w-2xl p-6 sm:p-8"
        isOpen={assignmentOpen}
        onClose={() => {
          if (!isAssigning) setAssignmentOpen(false);
        }}
      >
        <div className="pr-10">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white/90">
            {selectedMessage?.opportunity
              ? "Move Gmail thread to another sale"
              : "Assign Gmail thread to a sale"}
          </h3>
          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
            Every imported email in this Gmail conversation will move together.
            Future replies will continue routing to the selected sale.
          </p>
        </div>

        <form
          className="mt-6 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (selectedMessage) {
              void loadAssignmentSales(selectedMessage.id, assignmentQuery);
            }
          }}
        >
          <input
            className="h-11 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-950 dark:text-white/90"
            placeholder="Search sale, contact, email, company or owner"
            value={assignmentQuery}
            onChange={(event) => setAssignmentQuery(event.target.value)}
          />
          <button
            className="h-11 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
            disabled={assignmentSearching}
            type="submit"
          >
            {assignmentSearching ? "Searching..." : "Search"}
          </button>
        </form>

        <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto pr-1">
          {assignmentSearching && assignmentSales.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              Loading accessible sales...
            </p>
          ) : null}
          {!assignmentSearching
            ? assignmentSales.map((sale) => {
                const selected = assignmentSaleId === sale.id;
                const isCurrent = selectedMessage?.opportunity?.id === sale.id;
                return (
                  <button
                    key={sale.id}
                    className={`w-full rounded-xl border p-4 text-left transition ${
                      selected
                        ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/10 dark:bg-brand-500/10"
                        : "border-gray-200 hover:border-brand-300 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.04]"
                    }`}
                    type="button"
                    onClick={() => {
                      setAssignmentSaleId(sale.id);
                      setAssignmentError(null);
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white/90">
                          {sale.title}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {[
                            sale.contactName,
                            sale.contactEmail,
                            sale.companyName,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "No linked contact"}
                        </p>
                        {sale.ownerName ? (
                          <p className="mt-1 text-xs text-gray-400">
                            Owner: {sale.ownerName}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <StatusBadge>{sale.stage}</StatusBadge>
                        {isCurrent ? (
                          <span className="text-xs font-semibold text-brand-600 dark:text-brand-300">
                            Current sale
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })
            : null}
        </div>

        {assignmentError ? (
          <p className="mt-4 text-sm font-medium text-error-600 dark:text-error-400">
            {assignmentError}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            className="h-11 rounded-lg border border-gray-300 bg-white px-5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
            disabled={isAssigning}
            type="button"
            onClick={() => setAssignmentOpen(false)}
          >
            Cancel
          </button>
          <button
            className="h-11 rounded-lg bg-brand-500 px-5 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={
              !assignmentSaleId ||
              isAssigning ||
              assignmentSaleId === selectedMessage?.opportunity?.id
            }
            type="button"
            onClick={assignThread}
          >
            {isAssigning ? "Assigning thread..." : "Assign Gmail thread"}
          </button>
        </div>
      </Modal>
    </>
  );
}

function MailboxLink({
  active,
  href,
  label,
  value,
}: {
  active: boolean;
  href: string;
  label: string;
  value: number;
}) {
  return (
    <Link
      className={`flex items-center justify-between rounded-lg px-3 py-2 font-semibold ${
        active
          ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
          : "bg-gray-50 text-gray-600 hover:bg-gray-100 dark:bg-white/[0.04] dark:text-gray-300 dark:hover:bg-white/[0.06]"
      }`}
      href={href}
    >
      <span>{label}</span>
      <span>{value}</span>
    </Link>
  );
}

function IconButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-theme-xs hover:border-gray-300 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:text-white"
    >
      {children}
    </button>
  );
}

function StateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="min-w-0 truncate font-medium text-gray-800 dark:text-white/90">
        {value}
      </span>
    </div>
  );
}
