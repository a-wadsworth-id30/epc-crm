"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Save,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { AISparkIcon } from "@/components/crm-boilerplate/AITheme";
import { CloseIcon, PaperPlaneIcon } from "@/icons";
import { storeSidekickReportHandoff } from "@/lib/reports/sidekick-report-handoff";
import type { ReportResult } from "@/lib/reports/types";

const ReportVisualization = dynamic(
  () => import("@/components/reports/ReportVisualization"),
  {
    loading: () => (
      <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
        Loading report preview...
      </div>
    ),
    ssr: false,
  },
);

type ChatMessage = {
  feedback?: "positive" | "negative";
  id: string;
  prompt?: string;
  role: "user" | "assistant";
  content: string;
  blocked?: {
    reason: string;
    detail: string;
  };
  tools?: Array<{
    tool: string;
    label: string;
    summary: string;
    data?: unknown;
    links?: Array<{ label: string; href: string }>;
  }>;
  usage?: {
    estimatedInputTokens: number;
    estimatedOutputTokens: number;
    model?: string;
    mode: "openai" | "fallback" | "blocked";
  };
};

type SidekickResponse = {
  answer: string;
  tools: NonNullable<ChatMessage["tools"]>;
  blocked?: ChatMessage["blocked"];
  usage: NonNullable<ChatMessage["usage"]>;
};

const starterPrompts = [
  "What happened with leads this week?",
  "Which lead source is converting best this month?",
  "Show stale opportunities with no activity",
  "Find follow-up gaps",
  "Summarise call activity this week",
  "Search for recent sales records",
];

function messageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function SidekickAssistant() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [applyingPlanId, setApplyingPlanId] = useState<string | null>(null);
  const [savingReportKey, setSavingReportKey] = useState<string | null>(null);
  const [savedReportKeys, setSavedReportKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const hasResetSensitiveContent = useMemo(
    () =>
      messages.some((message) => {
        const tools = message.tools ?? [];
        return Boolean(firstReportResult(tools) || firstDiscoveryPlan(tools));
      }),
    [messages],
  );

  const history = useMemo(
    () =>
      messages
        .slice(-8)
        .map((message) => ({
          role: message.role,
          content: message.content,
        })),
    [messages],
  );

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isSending]);

  async function sendMessage(nextInput?: string) {
    const message = (nextInput ?? input).trim();
    if (!message || isSending) return;

    setError(null);
    setInput("");
    setIsSending(true);

    const userMessage: ChatMessage = {
      id: messageId(),
      role: "user",
      content: message,
    };

    setMessages((current) => [...current, userMessage]);

    try {
      const response = await fetch("/api/ai/sidekick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history,
          pageContext: {
            pathname,
            title:
              typeof document === "undefined" ? undefined : document.title,
          },
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | SidekickResponse
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          payload && "error" in payload && payload.error
            ? payload.error
            : "Sidekick could not answer that request.",
        );
      }

      const result = payload as SidekickResponse;
      setMessages((current) => [
        ...current,
        {
          id: messageId(),
          role: "assistant",
          content: result.answer,
          blocked: result.blocked,
          prompt: message,
          tools: result.tools,
          usage: result.usage,
        },
      ]);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Sidekick could not answer that request.";
      setError(message);
      setMessages((current) => [
        ...current,
        {
          id: messageId(),
          role: "assistant",
          content: message,
          prompt: userMessage.content,
          usage: {
            estimatedInputTokens: 0,
            estimatedOutputTokens: 0,
            mode: "blocked",
          },
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function startNewChat() {
    if (!messages.length || isSending || applyingPlanId || savingReportKey) {
      return;
    }

    if (
      hasResetSensitiveContent &&
      !window.confirm(
        "Start a new Sidekick chat? This clears the current drawer messages, including any report or write-plan preview.",
      )
    ) {
      return;
    }

    setMessages([]);
    setInput("");
    setError(null);
    setApplyingPlanId(null);
    setSavingReportKey(null);
    setSavedReportKeys(new Set());
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function applyWritePlan(planId: string) {
    if (applyingPlanId) return;
    setApplyingPlanId(planId);
    setError(null);

    try {
      const response = await fetch(`/api/ai/sidekick/write-plans/${planId}/apply`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Could not apply that write plan.");
      }

      setMessages((current) => [
        ...current,
        {
          id: messageId(),
          role: "assistant",
          content:
            "Applied the approved Discovery write plan. The Discovery setup has been updated.",
          prompt: "Apply Discovery write plan",
          usage: {
            estimatedInputTokens: 0,
            estimatedOutputTokens: 20,
            mode: "fallback",
          },
        },
      ]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not apply that write plan.",
      );
    } finally {
      setApplyingPlanId(null);
    }
  }

  function openReportInWorkspace(result: ReportResult, prompt?: string | null) {
    const stored = storeSidekickReportHandoff({ prompt, result });
    if (!stored) {
      setError("Could not open that report. Browser session storage is unavailable.");
      return;
    }

    setIsOpen(false);
    router.push("/reports?source=sidekick");
  }

  async function saveReportFromDrawer(result: ReportResult, reportKey: string) {
    if (savingReportKey) return;

    setSavingReportKey(reportKey);
    setError(null);

    try {
      const response = await fetch("/api/reports/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: result.plan,
          title: result.title,
          visibility: "PRIVATE",
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Report could not be saved.");
      }

      setSavedReportKeys((current) => {
        const next = new Set(current);
        next.add(reportKey);
        return next;
      });
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Report could not be saved.",
      );
    } finally {
      setSavingReportKey(null);
    }
  }

  async function submitFeedback(
    messageIdToUpdate: string,
    rating: "positive" | "negative",
  ) {
    const message = messages.find((item) => item.id === messageIdToUpdate);
    if (!message || message.role !== "assistant") return;

    const previousFeedback = message.feedback;
    const report = firstReportPreview(message.tools ?? []);

    setMessages((current) =>
      current.map((item) =>
        item.id === messageIdToUpdate ? { ...item, feedback: rating } : item,
      ),
    );

    try {
      const response = await fetch("/api/ai/sidekick/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answerMode: message.usage?.mode,
          answerPreview: message.content.slice(0, 1000),
          messageId: message.id,
          model: message.usage?.model ?? null,
          pagePath: pathname,
          promptPreview: message.prompt?.slice(0, 500),
          rating,
          report: report
            ? {
                dataset: report.result.plan.dataset,
                permissionScope: report.permissionScope ?? null,
                planner: report.planner ?? null,
                rowCount: report.result.rowCount,
                title: report.result.title,
              }
            : null,
          tools: (message.tools ?? []).map((tool) => tool.tool),
        }),
      });

      if (!response.ok) throw new Error("Feedback could not be recorded.");
    } catch (feedbackError) {
      setMessages((current) =>
        current.map((item) =>
          item.id === messageIdToUpdate
            ? { ...item, feedback: previousFeedback }
            : item,
        ),
      );
      setError(
        feedbackError instanceof Error
          ? feedbackError.message
          : "Feedback could not be recorded.",
      );
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Open Sidekick"
        className="ai-gradient-button inline-grid h-10 w-10 place-items-center rounded-full p-[2px] shadow-sm shadow-cyan-100 transition lg:h-11 lg:w-11 dark:shadow-none"
      >
        <span className="grid h-full w-full place-items-center rounded-full bg-white text-gray-900 dark:bg-gray-950 dark:text-white">
          <AISparkIcon />
        </span>
      </button>

      <div
        className={`fixed inset-0 z-[100000] transition ${
          isOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
        aria-hidden={!isOpen}
      >
        <button
          type="button"
          aria-label="Close Sidekick overlay"
          onClick={() => setIsOpen(false)}
          className={`absolute inset-0 bg-gray-950/25 transition-opacity dark:bg-black/45 ${
            isOpen ? "opacity-100" : "opacity-0"
          }`}
        />

        <aside
          className={`absolute top-0 right-0 flex h-full w-full max-w-[460px] flex-col border-l border-gray-200 bg-white shadow-2xl transition-transform duration-300 dark:border-gray-800 dark:bg-gray-950 ${
            isOpen ? "translate-x-0" : "translate-x-full"
          }`}
          aria-label="CRM Sidekick"
        >
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="ai-gradient-button inline-grid h-10 w-10 place-items-center rounded-full p-[2px] shadow-sm shadow-cyan-100 dark:shadow-none">
                  <span className="grid h-full w-full place-items-center rounded-full bg-white text-gray-900 dark:bg-gray-950 dark:text-white">
                    <AISparkIcon />
                  </span>
                </span>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    Sidekick
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    CRM assistant with approved write plans
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {messages.length ? (
                  <button
                    type="button"
                    onClick={startNewChat}
                    disabled={isSending || Boolean(applyingPlanId)}
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/10"
                  >
                    New chat
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close Sidekick"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <CloseIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          <div
            ref={scrollRef}
            className="flex-1 space-y-4 overflow-y-auto px-4 py-5"
          >
            {!messages.length ? (
              <SidekickEmptyState onPrompt={sendMessage} />
            ) : null}

            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                applyingPlanId={applyingPlanId}
                message={message}
                onApplyPlan={applyWritePlan}
                onFeedback={submitFeedback}
                onOpenReport={openReportInWorkspace}
                onPrompt={sendMessage}
                onSaveReport={saveReportFromDrawer}
                savedReportKeys={savedReportKeys}
                savingReportKey={savingReportKey}
              />
            ))}

            {isSending ? <ThinkingBubble /> : null}

            {error ? (
              <p className="rounded-xl border border-error-200 bg-error-50 px-3 py-2 text-xs text-error-700 dark:border-error-900/40 dark:bg-error-900/20 dark:text-error-300">
                {error}
              </p>
            ) : null}
          </div>

          <div className="border-t border-gray-200 p-4 dark:border-gray-800">
            <div className="rounded-2xl border border-gray-200 bg-white p-2 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Sidekick about leads, calls, source quality..."
                rows={3}
                maxLength={2000}
                className="min-h-[76px] w-full resize-none bg-transparent px-2 py-2 text-sm text-gray-800 outline-none placeholder:text-gray-400 dark:text-white/90 dark:placeholder:text-white/30"
              />
              <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-2 dark:border-gray-800">
                <p className="px-2 text-[11px] text-gray-400">
                  {input.length}/2000
                </p>
                <button
                  type="button"
                  onClick={() => void sendMessage()}
                  disabled={!input.trim() || isSending}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-gray-700"
                >
                  <PaperPlaneIcon className="h-4 w-4" />
                  Ask
                </button>
              </div>
            </div>
            <p className="mt-2 px-1 text-[11px] leading-4 text-gray-400">
              Sidekick can analyse CRM data. Discovery writes require preview
              and admin approval before anything changes.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}

function SidekickEmptyState({
  onPrompt,
}: {
  onPrompt: (prompt: string) => Promise<void>;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-start gap-3">
        <span className="ai-gradient-button inline-grid h-9 w-9 shrink-0 place-items-center rounded-full p-[2px] shadow-sm shadow-cyan-100 dark:shadow-none">
          <span className="grid h-full w-full place-items-center rounded-full bg-white text-gray-900 dark:bg-gray-950 dark:text-white">
            <AISparkIcon wrapperClassName="h-4 w-4" />
          </span>
        </span>
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            Ask a CRM question
          </p>
          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
            I can inspect sales, calls, lead sources, customer timelines and
            follow-up gaps. Discovery pack writes use an approval plan.
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2">
        {starterPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => void onPrompt(prompt)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-xs font-medium text-gray-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/10"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="mr-auto max-w-[86%] rounded-2xl rounded-bl-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300">
      <div className="flex items-center gap-3">
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-500 dark:bg-brand-500/10">
          <span className="absolute h-8 w-8 animate-ping rounded-full bg-brand-400/20" />
          <AISparkIcon wrapperClassName="relative h-4 w-4" />
        </span>
        <div>
          <p className="text-xs font-semibold text-gray-800 dark:text-white/90">
            Reading CRM data
          </p>
          <div className="mt-1 flex items-center gap-1">
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-500"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  applyingPlanId,
  message,
  onApplyPlan,
  onFeedback,
  onOpenReport,
  onPrompt,
  onSaveReport,
  savedReportKeys,
  savingReportKey,
}: {
  applyingPlanId: string | null;
  message: ChatMessage;
  onApplyPlan: (planId: string) => Promise<void>;
  onFeedback: (
    messageId: string,
    rating: "positive" | "negative",
  ) => Promise<void>;
  onOpenReport: (result: ReportResult, prompt?: string | null) => void;
  onPrompt: (prompt: string) => Promise<void>;
  onSaveReport: (result: ReportResult, reportKey: string) => Promise<void>;
  savedReportKeys: Set<string>;
  savingReportKey: string | null;
}) {
  const isUser = message.role === "user";
  const report = !isUser ? firstReportPreview(message.tools ?? []) : null;
  const reportResult = report?.result ?? null;
  const discoveryPlan = !isUser ? firstDiscoveryPlan(message.tools ?? []) : null;
  const reportKey = reportResult
    ? `${message.id}:${reportResult.generatedAt}:${reportResult.title}`
    : null;
  const followUps = !isUser ? sidekickFollowUps(message, report) : [];

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-theme-xs ${
          isUser
            ? "rounded-br-md bg-brand-500 text-white"
            : "rounded-bl-md border border-gray-200 bg-white text-gray-700 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-200"
        }`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>

        {!isUser && message.blocked ? (
          <div className="mt-3 rounded-xl border border-warning-200 bg-warning-50 px-3 py-2 text-xs text-warning-800 dark:border-warning-900/40 dark:bg-warning-900/20 dark:text-warning-200">
            <span className="font-semibold">Guardrail:</span>{" "}
            {message.blocked.detail}
          </div>
        ) : null}

        {!isUser && message.tools?.length ? (
          <div className="mt-3 space-y-2 border-t border-gray-100 pt-3 dark:border-gray-800">
            <p className="text-[11px] font-semibold tracking-wide text-gray-400 uppercase">
              Checked
            </p>
            <div className="flex flex-wrap gap-1.5">
              {message.tools.map((tool) => (
                <span
                  key={`${message.id}-${tool.tool}`}
                  className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600 dark:bg-white/10 dark:text-gray-300"
                >
                  {tool.label}
                </span>
              ))}
            </div>
            <SourceLinks tools={message.tools} />
          </div>
        ) : null}

        {reportResult ? (
          <>
            <OpenReportCard
              isSaved={reportKey ? savedReportKeys.has(reportKey) : false}
              isSaving={Boolean(reportKey && savingReportKey === reportKey)}
              prompt={report?.prompt}
              result={reportResult}
              onOpen={() => onOpenReport(reportResult, report?.prompt)}
              onSave={
                reportKey
                  ? () => onSaveReport(reportResult, reportKey)
                  : undefined
              }
            />
            <div className="mt-3 rounded-2xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950">
              <ReportVisualization compact result={reportResult} />
            </div>
          </>
        ) : null}

        {discoveryPlan ? (
          <DiscoveryPlanPreview
            applying={applyingPlanId === discoveryPlan.planId}
            plan={discoveryPlan}
            onApply={() => onApplyPlan(discoveryPlan.planId)}
          />
        ) : null}

        {!isUser && followUps.length ? (
          <SidekickFollowUpSuggestions
            onPrompt={onPrompt}
            suggestions={followUps}
          />
        ) : null}

        {!isUser && (message.usage || message.tools?.length) ? (
          <AnswerTransparency message={message} report={report} />
        ) : null}

        {!isUser ? (
          <SidekickFeedbackControls
            feedback={message.feedback}
            onFeedback={(rating) => onFeedback(message.id, rating)}
          />
        ) : null}
      </div>
    </div>
  );
}

type FollowUpSuggestion = {
  label: string;
  prompt: string;
};

function uniqueFollowUps(
  suggestions: FollowUpSuggestion[],
  currentPrompt?: string,
) {
  const seen = new Set<string>();
  const current = currentPrompt?.trim().toLowerCase();

  return suggestions
    .filter((suggestion) => {
      const key = suggestion.prompt.trim().toLowerCase();
      if (!key || key === current || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

function sidekickFollowUps(
  message: ChatMessage,
  report: ReportPreviewData | null,
) {
  const dataset = report?.result.plan.dataset;
  const toolNames = new Set((message.tools ?? []).map((tool) => tool.tool));
  const suggestions: FollowUpSuggestion[] = [];

  if (dataset === "sales_opportunities") {
    suggestions.push(
      {
        label: "Open-lead owners",
        prompt: "Which lead owner has the most open leads?",
      },
      {
        label: "Lead source quality",
        prompt: "Which lead source is converting best this month?",
      },
    );
  } else if (dataset === "marketing_attribution") {
    suggestions.push(
      {
        label: "Campaign performance",
        prompt: "Which campaign generated the most leads?",
      },
      {
        label: "Landing pages",
        prompt: "Which landing pages convert best?",
      },
    );
  } else if (dataset === "tasks") {
    suggestions.push(
      {
        label: "Overdue tasks",
        prompt: "Which tasks are overdue by assignee?",
      },
      {
        label: "Unassigned tasks",
        prompt: "Which tasks are unassigned?",
      },
    );
  } else if (dataset === "communications") {
    suggestions.push(
      {
        label: "Email activity",
        prompt: "Which users sent the most emails?",
      },
      {
        label: "Inbound replies",
        prompt: "Which lead owners get the most inbound replies?",
      },
    );
  } else if (dataset === "setup_readiness") {
    suggestions.push({
      label: "Setup gaps",
      prompt: "What setup items are outstanding?",
    });
  } else if (dataset === "calls") {
    suggestions.push(
      {
        label: "Call activity",
        prompt: "Summarise call activity this week",
      },
      {
        label: "Transcripts",
        prompt: "Which recordings are missing transcripts?",
      },
    );
  } else if (dataset === "opportunity_products") {
    suggestions.push(
      {
        label: "Product demand",
        prompt: "What products do I get asked for most on leads?",
      },
      {
        label: "Lead sources",
        prompt: "Which lead source creates the most product enquiries?",
      },
    );
  } else if (dataset === "form_submissions") {
    suggestions.push(
      {
        label: "Submitted fields",
        prompt: "Which submitted form fields are most common?",
      },
      {
        label: "Missing details",
        prompt: "Which submitted forms have missing phone or email details?",
      },
    );
  } else if (dataset === "users_security") {
    suggestions.push(
      {
        label: "2FA gaps",
        prompt: "Which admins do not have 2FA enabled?",
      },
      {
        label: "Inactive users",
        prompt: "Which users have not logged in recently?",
      },
    );
  }

  if (toolNames.has("crm_find_stale_leads")) {
    suggestions.push({
      label: "Follow-up gaps",
      prompt: "Find follow-up gaps",
    });
  }

  if (toolNames.has("crm_search_records")) {
    suggestions.push({
      label: "Recent leads",
      prompt: "Show recent sales records",
    });
  }

  if (!suggestions.length && message.tools?.length) {
    suggestions.push(
      {
        label: "Lead sources",
        prompt: "Which lead source is converting best this month?",
      },
      {
        label: "Follow-ups",
        prompt: "Find follow-up gaps",
      },
    );
  }

  return uniqueFollowUps(suggestions, message.prompt);
}

function SidekickFollowUpSuggestions({
  onPrompt,
  suggestions,
}: {
  onPrompt: (prompt: string) => Promise<void>;
  suggestions: FollowUpSuggestion[];
}) {
  return (
    <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
      <p className="text-[11px] font-semibold tracking-wide text-gray-400 uppercase">
        Suggested next checks
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.prompt}
            type="button"
            onClick={() => void onPrompt(suggestion.prompt)}
            className="rounded-full border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 dark:border-gray-800 dark:bg-white/[0.04] dark:text-gray-300 dark:hover:border-brand-500/30 dark:hover:bg-brand-500/10 dark:hover:text-brand-200"
          >
            {suggestion.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SidekickFeedbackControls({
  feedback,
  onFeedback,
}: {
  feedback?: "positive" | "negative";
  onFeedback: (rating: "positive" | "negative") => Promise<void>;
}) {
  return (
    <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
      <span className="text-[11px] font-medium text-gray-400">
        Was this useful?
      </span>
      <button
        type="button"
        onClick={() => void onFeedback("positive")}
        aria-pressed={feedback === "positive"}
        aria-label="Mark Sidekick answer as useful"
        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
          feedback === "positive"
            ? "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-300"
            : "border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/10"
        }`}
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => void onFeedback("negative")}
        aria-pressed={feedback === "negative"}
        aria-label="Mark Sidekick answer as not useful"
        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
          feedback === "negative"
            ? "border-error-200 bg-error-50 text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300"
            : "border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/10"
        }`}
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
      {feedback ? (
        <span className="text-[11px] text-gray-400">Feedback saved</span>
      ) : null}
    </div>
  );
}

type DiscoveryPlanPreviewData = {
  planId: string;
  summary: string;
  questions: Array<{ answerType: string; label: string; required: boolean }>;
};

function firstDiscoveryPlan(
  tools: NonNullable<ChatMessage["tools"]>,
): DiscoveryPlanPreviewData | null {
  const tool = tools.find((item) => item.tool === "crm_discovery_write_plan");
  const data =
    tool?.data && typeof tool.data === "object" && !Array.isArray(tool.data)
      ? (tool.data as Record<string, unknown>)
      : null;
  const plan =
    data?.plan && typeof data.plan === "object" && !Array.isArray(data.plan)
      ? (data.plan as Record<string, unknown>)
      : null;
  const planId = typeof data?.planId === "string" ? data.planId : null;
  const template =
    plan?.template && typeof plan.template === "object" && !Array.isArray(plan.template)
      ? (plan.template as Record<string, unknown>)
      : null;
  const rawQuestions = Array.isArray(plan?.questions) ? plan.questions : [];

  if (!planId || !template) return null;

  return {
    planId,
    questions: rawQuestions
      .map((question) =>
        question && typeof question === "object" && !Array.isArray(question)
          ? (question as Record<string, unknown>)
          : null,
      )
      .filter((question): question is Record<string, unknown> => Boolean(question))
      .map((question) => ({
        answerType:
          typeof question.answerType === "string" ? question.answerType : "TEXT",
        label: typeof question.label === "string" ? question.label : "Untitled question",
        required: question.required === true,
      })),
    summary:
      typeof tool?.summary === "string"
        ? tool.summary
        : `Create ${String(template.name ?? "Discovery pack")}`,
  };
}

function DiscoveryPlanPreview({
  applying,
  onApply,
  plan,
}: {
  applying: boolean;
  onApply: () => void;
  plan: DiscoveryPlanPreviewData;
}) {
  return (
    <div className="mt-3 rounded-2xl border border-brand-100 bg-brand-50/60 p-3 dark:border-brand-500/30 dark:bg-brand-500/10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-brand-800 dark:text-brand-200">
            Proposed Discovery write plan
          </p>
          <p className="mt-1 text-xs leading-5 text-brand-700 dark:text-brand-200/80">
            {plan.summary}
          </p>
        </div>
        <button
          type="button"
          onClick={onApply}
          disabled={applying}
          className="shrink-0 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {applying ? "Applying..." : "Apply"}
        </button>
      </div>
      <ul className="mt-3 space-y-1.5">
        {plan.questions.slice(0, 6).map((question) => (
          <li
            key={question.label}
            className="flex items-start justify-between gap-3 rounded-lg bg-white/70 px-2 py-1.5 text-xs text-gray-700 dark:bg-gray-950/40 dark:text-gray-200"
          >
            <span>{question.label}</span>
            <span className="shrink-0 font-semibold text-gray-400">
              {question.answerType.replaceAll("_", " ").toLowerCase()} ·{" "}
              {question.required ? "Required" : "Optional"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function firstReportResult(tools: NonNullable<ChatMessage["tools"]>) {
  return firstReportPreview(tools)?.result ?? null;
}

type ReportPreviewData = {
  permissionScope?: string | null;
  planner?: string | null;
  plannerNote?: string | null;
  prompt?: string | null;
  result: ReportResult;
};

function firstReportPreview(
  tools: NonNullable<ChatMessage["tools"]>,
): ReportPreviewData | null {
  for (const tool of tools) {
    const data = tool.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) continue;
    const reportResult = (data as { reportResult?: unknown }).reportResult;
    if (
      reportResult &&
      typeof reportResult === "object" &&
      !Array.isArray(reportResult) &&
      "rows" in reportResult &&
      "columns" in reportResult
    ) {
      const prompt = (data as { reportPrompt?: unknown }).reportPrompt;
      const planner = (data as { reportPlanner?: unknown }).reportPlanner;
      const plannerNote = (data as { reportPlannerNote?: unknown }).reportPlannerNote;
      const permissionScope = (data as { permissionScope?: unknown }).permissionScope;
      return {
        permissionScope:
          typeof permissionScope === "string" ? permissionScope : null,
        planner: typeof planner === "string" ? planner : null,
        plannerNote: typeof plannerNote === "string" ? plannerNote : null,
        prompt: typeof prompt === "string" ? prompt : null,
        result: reportResult as ReportResult,
      };
    }
  }
  return null;
}

function objectData(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function humaniseIdentifier(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function formatDateRange(result: ReportResult) {
  const { dateRange } = result.plan;
  if (dateRange.preset === "all") return "All available permitted data";
  if (dateRange.preset === "custom") {
    const from = dateRange.from ? new Date(dateRange.from) : null;
    const to = dateRange.to ? new Date(dateRange.to) : null;
    const fromText =
      from && Number.isFinite(from.getTime())
        ? from.toLocaleDateString("en-GB")
        : "start";
    const toText =
      to && Number.isFinite(to.getTime())
        ? to.toLocaleDateString("en-GB")
        : "now";
    return `${fromText} to ${toText}`;
  }
  return `Last ${dateRange.preset.replace("d", " days")}`;
}

function reportColumnLabel(result: ReportResult, field: string) {
  return (
    result.columns.find((column) => column.field === field)?.label ??
    humaniseIdentifier(field)
  );
}

function formatFilterValue(value: string | string[]) {
  return Array.isArray(value) ? value.join(", ") : value;
}

function formatFilters(result: ReportResult) {
  if (!result.plan.filters.length) return "None";
  return result.plan.filters
    .map(
      (filter) =>
        `${reportColumnLabel(result, filter.field)} ${filter.operator.replaceAll(
          "_",
          " ",
        )} ${formatFilterValue(filter.value)}`,
    )
    .join("; ");
}

function formatFieldList(result: ReportResult, fields: string[]) {
  if (!fields.length) return "None";
  return fields.map((field) => reportColumnLabel(result, field)).join(", ");
}

function plannerLabel(value?: string | null) {
  if (value === "openai") return "OpenAI planner";
  if (value === "heuristic") return "Deterministic planner";
  return "Not applicable";
}

function modeLabel(usage?: ChatMessage["usage"]) {
  if (!usage) return "Unknown";
  if (usage.mode === "openai") return usage.model ?? "OpenAI";
  if (usage.mode === "blocked") return "Blocked before model call";
  return "Fallback response";
}

function firstScope(tools: NonNullable<ChatMessage["tools"]>) {
  for (const tool of tools) {
    const data = objectData(tool.data);
    const scope = data?.permissionScope ?? data?.scope;
    if (typeof scope === "string" && scope.trim()) return scope;
  }
  return null;
}

function AnswerTransparency({
  message,
  report,
}: {
  message: ChatMessage;
  report: ReportPreviewData | null;
}) {
  const tools = message.tools ?? [];
  const scope = report?.permissionScope ?? firstScope(tools);
  const result = report?.result ?? null;
  const rows: Array<{ label: string; value: string | number }> = [
    {
      label: "Answer mode",
      value: modeLabel(message.usage),
    },
  ];

  if (tools.length) {
    rows.push({
      label: "Tools checked",
      value: tools.map((tool) => tool.label).join(", "),
    });
  }

  if (scope) {
    rows.push({
      label: "Permission scope",
      value: scope,
    });
  }

  if (result) {
    rows.push(
      { label: "Dataset", value: humaniseIdentifier(result.plan.dataset) },
      { label: "Date range", value: formatDateRange(result) },
      { label: "Rows returned", value: result.rowCount },
      { label: "Grouped by", value: formatFieldList(result, result.plan.dimensions) },
      { label: "Metrics", value: formatFieldList(result, result.plan.metrics) },
      { label: "Filters", value: formatFilters(result) },
      { label: "Chart", value: humaniseIdentifier(result.plan.chartType) },
      { label: "Planner", value: plannerLabel(report?.planner) },
    );
  }

  if (message.usage) {
    rows.push({
      label: "Token estimate",
      value: `${message.usage.estimatedInputTokens} in / ${message.usage.estimatedOutputTokens} out`,
    });
  }

  return (
    <details className="mt-3 rounded-xl border border-gray-200 bg-gray-50/70 dark:border-gray-800 dark:bg-gray-950/70">
      <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-semibold tracking-wide text-gray-500 uppercase marker:hidden dark:text-gray-400">
        How Sidekick answered this
      </summary>
      <div className="space-y-2 border-t border-gray-200 px-3 py-3 dark:border-gray-800">
        <dl className="grid grid-cols-1 gap-2">
          {rows.map((row) => (
            <div key={`${row.label}-${row.value}`} className="text-xs">
              <dt className="font-medium text-gray-500 dark:text-gray-400">
                {row.label}
              </dt>
              <dd className="mt-0.5 break-words text-gray-700 dark:text-gray-200">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
        {report?.plannerNote ? (
          <p className="rounded-lg bg-white px-2 py-1.5 text-xs leading-5 text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">
            {report.plannerNote}
          </p>
        ) : null}
      </div>
    </details>
  );
}

function OpenReportCard({
  isSaved,
  isSaving,
  onOpen,
  onSave,
  prompt,
  result,
}: {
  isSaved: boolean;
  isSaving: boolean;
  onOpen: () => void;
  onSave?: () => void;
  prompt?: string | null;
  result: ReportResult;
}) {
  const xColumn = result.columns.find(
    (column) => column.field === result.chart.xField,
  );
  const metricLabels = result.chart.yFields
    .map(
      (field) =>
        result.columns.find((column) => column.field === field)?.label ?? field,
    )
    .slice(0, 2)
    .join(", ");

  return (
    <div className="mt-3 rounded-2xl border border-brand-100 bg-brand-50/70 px-3 py-3 dark:border-brand-500/30 dark:bg-brand-500/10">
      <span className="flex min-w-0 items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-brand-600 shadow-theme-xs dark:bg-gray-950 dark:text-brand-300">
          <BarChart3 className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-semibold text-brand-800 dark:text-brand-100">
            Open generated report
          </span>
          <span className="mt-0.5 block truncate text-sm font-semibold text-gray-800 dark:text-white/90">
            {result.title}
          </span>
          <span className="mt-1 block text-xs leading-5 text-gray-500 dark:text-gray-400">
            {result.rowCount} row{result.rowCount === 1 ? "" : "s"}
            {xColumn ? ` by ${xColumn.label}` : ""}
            {metricLabels ? ` · ${metricLabels}` : ""}
          </span>
          {prompt ? (
            <span className="mt-1 block line-clamp-2 text-[11px] leading-4 text-gray-400">
              {prompt}
            </span>
          ) : null}
        </span>
      </span>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {onSave ? (
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving || isSaved}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-brand-100 bg-white px-2.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-70 dark:border-brand-500/30 dark:bg-gray-950 dark:text-brand-200 dark:hover:bg-brand-500/10"
          >
            <Save className="h-3.5 w-3.5" />
            {isSaved ? "Saved" : isSaving ? "Saving..." : "Save"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-brand-500 px-2.5 text-xs font-semibold text-white transition hover:bg-brand-600"
        >
          Open
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function SourceLinks({ tools }: { tools: NonNullable<ChatMessage["tools"]> }) {
  const links = tools.flatMap((tool) => tool.links ?? []);
  const uniqueLinks = Array.from(
    new Map(links.map((link) => [link.href, link])).values(),
  ).slice(0, 6);

  if (!uniqueLinks.length) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {uniqueLinks.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="rounded-full border border-brand-100 bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200"
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}
