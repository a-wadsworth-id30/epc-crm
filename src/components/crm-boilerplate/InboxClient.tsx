"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import StatusBadge from "@/components/crm-boilerplate/StatusBadge";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import {
  InboxAltIcon,
  MailIcon,
  MoreDotIcon,
  SearchIcon,
  StarLine,
} from "@/icons";
import {
  archiveInboxMessage,
  markInboxMessageRead,
  restoreInboxMessage,
} from "@/lib/actions/inbox";
import { latestInboundEmailPlainText } from "@/lib/email/plain-text";
import type { InboxMessageDetail, InboxMessageSummary } from "@/lib/inbox/types";

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
  const [selectedId, setSelectedId] = useState(
    selectedMessageId ?? messages[0]?.id ?? "",
  );
  const [messageDetails, setMessageDetails] = useState<
    Record<string, InboxMessageDetail>
  >({});
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const selectedSummary = useMemo(
    () => messages.find((message) => message.id === selectedId) ?? messages[0],
    [messages, selectedId],
  );
  const selectedDetail = selectedId ? messageDetails[selectedId] : undefined;
  const detailError = selectedId ? detailErrors[selectedId] : null;
  const isDetailLoading = Boolean(selectedId && !selectedDetail && !detailError);
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
        if (error instanceof DOMException && error.name === "AbortError") return;

        setDetailErrors((current) => ({
          ...current,
          [selectedId]:
            "Full email content could not be loaded. Showing the saved preview.",
        }));
      });

    return () => controller.abort();
  }, [detailError, selectedDetail, selectedId]);

  function selectMessage(messageId: string) {
    setSelectedId(messageId);
    router.replace(inboxHref({ lane, messageId, page, pageSize, query }), {
      scroll: false,
    });
  }

  function runMessageAction(action: () => Promise<void>, successMessage: string) {
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
          <aside className="flex min-h-0 flex-col border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.02] lg:border-r lg:border-b-0">
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
                                {message.opportunity ? "Matched lead" : "Unmatched"}
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
                          {selectedMessage.opportunity ? "Matched lead" : "Unmatched"}
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
                        label={selectedMessage.status === "ARCHIVED" ? "Restore" : "Archive"}
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
                            <p className="mt-0.5 break-all text-sm text-gray-500 dark:text-gray-400">
                              {selectedMessage.fromAddress ?? "No sender address"}
                            </p>
                            <p className="mt-0.5 break-all text-xs text-gray-400">
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
                      {selectedMessage.fromAddress ? (
                        <a
                          className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                          href={`mailto:${selectedMessage.fromAddress}?subject=${encodeURIComponent(
                            `Re: ${selectedMessage.subject ?? "Your email"}`,
                          )}`}
                        >
                          Reply
                        </a>
                      ) : null}
                    </div>
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
                            {selectedMessage.opportunity.stage.replaceAll("_", " ")}
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
                        <StateRow label="Provider" value="MailerSend" />
                        <StateRow label="Route" value={selectedMessage.inboundRouteId ?? "-"} />
                        <StateRow label="Direction" value={selectedMessage.direction} />
                        <StateRow label="Status" value={selectedMessage.status} />
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
