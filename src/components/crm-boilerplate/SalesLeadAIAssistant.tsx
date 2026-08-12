"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AIInsightCard,
  AILabel,
  AISparkIcon,
} from "@/components/crm-boilerplate/AITheme";
import StatusBadge from "@/components/crm-boilerplate/StatusBadge";

type ChannelKey = "email" | "sms" | "phone";

type SalesLeadAIResult = {
  summary: string;
  nextStep: {
    title: string;
    rationale: string;
    urgency: "low" | "medium" | "high";
    channel: "Email" | "SMS" | "Phone";
  };
  insights: string[];
  risks: string[];
  drafts: {
    email: { subject: string; body: string };
    sms: string;
    phoneScript: string;
  };
  generatedAt: string;
  mode: "fallback" | "openai";
  model?: string;
};

const channels: Array<{ key: ChannelKey; label: string }> = [
  { key: "email", label: "Email" },
  { key: "sms", label: "SMS" },
  { key: "phone", label: "Phone script" },
];

function fallbackText({
  title,
  communicationsCount,
}: {
  title: string;
  communicationsCount: number;
}) {
  return communicationsCount
    ? `${communicationsCount} conversation events are available for context on ${title}.`
    : "No conversation history yet. AI suggestions will improve once calls, emails or SMS are captured.";
}

export default function SalesLeadAIAssistant({
  initialResult,
  saleId,
  sale,
  communicationsCount,
}: {
  initialResult?: SalesLeadAIResult | null;
  saleId: string;
  sale: {
    nextStep: string | null;
    stage: string;
    title: string;
  };
  communicationsCount: number;
}) {
  const [selectedChannel, setSelectedChannel] = useState<ChannelKey>("email");
  const [result, setResult] = useState<SalesLeadAIResult | null>(
    initialResult ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!initialResult);

  useEffect(() => {
    setResult(initialResult ?? null);
    setIsLoading(!initialResult);
  }, [initialResult, saleId]);

  async function generate(
    channel = selectedChannel,
    forceRefresh = false,
    showLoading = true,
  ) {
    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = await fetch("/api/ai/sales-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleId,
          preferredChannel: channel,
          forceRefresh,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | SalesLeadAIResult
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          payload && "error" in payload && payload.error
            ? payload.error
            : "Sales AI could not generate guidance.",
        );
      }

      setResult(payload as SalesLeadAIResult);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Sales AI could not generate guidance.",
      );
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    if (initialResult) {
      void generate("email", false, false);
      return;
    }

    void generate("email");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialResult, saleId]);

  const draft = useMemo(() => {
    if (!result)
      return "Ready to draft a follow-up from the latest calls, emails and SMS.";
    if (selectedChannel === "sms") return result.drafts.sms;
    if (selectedChannel === "phone") return result.drafts.phoneScript;

    return `Subject: ${result.drafts.email.subject}\n\n${result.drafts.email.body}`;
  }, [result, selectedChannel]);

  return (
    <section className="space-y-2.5 rounded-2xl border border-purple-100 bg-white p-3 shadow-theme-xs dark:border-purple-900/40 dark:bg-white/[0.03]">
      <div className="rounded-xl bg-gradient-to-r from-purple-50 via-white to-cyan-50 p-3 ring-1 ring-purple-100 dark:from-purple-500/10 dark:via-white/[0.02] dark:to-cyan-500/10 dark:ring-purple-900/40">
        <div className="flex items-start justify-between gap-3">
          <div>
            <AILabel label="Sales AI" />
            <h2 className="mt-2 text-base font-semibold text-gray-800 dark:text-white/90">
              Assistant
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Uses the lead conversation, attribution and current stage.
            </p>
          </div>
          <StatusBadge>{sale.stage}</StatusBadge>
        </div>
      </div>

      <div className="grid gap-2.5">
        <AIInsightCard title="AI summary">
          {isLoading && !result
            ? "Analysing the lead conversation and attribution..."
            : result?.summary ||
              fallbackText({ title: sale.title, communicationsCount })}
        </AIInsightCard>

        <AIInsightCard title="Recommended next step">
          {result ? (
            <div className="space-y-2">
              <p className="font-semibold text-gray-800 dark:text-white/90">
                {result.nextStep.title}
              </p>
              <p>{result.nextStep.rationale}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-purple-700 ring-1 ring-purple-100 dark:bg-gray-950 dark:text-purple-300 dark:ring-purple-900/40">
                  {result.nextStep.channel}
                </span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-600 ring-1 ring-gray-200 dark:bg-gray-950 dark:text-gray-300 dark:ring-gray-800">
                  {result.nextStep.urgency} urgency
                </span>
              </div>
            </div>
          ) : (
            sale.nextStep ||
            "Review the lead and choose the next follow-up action."
          )}
        </AIInsightCard>
      </div>

      {result?.insights.length ? (
        <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
          <p className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
            Contextual insight
          </p>
          <ul className="mt-2 space-y-1.5 text-sm leading-5 text-gray-700 dark:text-gray-300">
            {result.insights.map((insight) => (
              <li key={insight}>- {insight}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-xl border border-gray-200 p-2.5 dark:border-gray-800">
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1 dark:bg-white/[0.04]">
          {channels.map((channel) => (
            <button
              key={channel.key}
              type="button"
              onClick={() => setSelectedChannel(channel.key)}
              className={`inline-flex h-8 min-w-0 items-center justify-center rounded-md px-2 text-xs font-semibold ${
                selectedChannel === channel.key
                  ? "bg-white text-gray-900 shadow-theme-xs dark:bg-gray-900 dark:text-white"
                  : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
              }`}
            >
              <span className="truncate">{channel.label}</span>
            </button>
          ))}
        </div>
        <div className="mt-2.5 rounded-lg bg-gray-50 p-3 text-sm leading-5 text-gray-700 dark:bg-white/[0.03] dark:text-gray-300">
          <p className="font-medium text-gray-800 dark:text-white/90">
            Draft response
          </p>
          <p className="mt-1 whitespace-pre-line">{draft}</p>
        </div>
        {result?.risks.length ? (
          <p className="mt-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
            {result.risks[0]}
          </p>
        ) : null}
        {error ? (
          <p className="mt-2 text-xs leading-5 text-error-600 dark:text-error-400">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => void generate(selectedChannel, true)}
          disabled={isLoading}
          className="ai-gradient-button mt-2.5 inline-flex w-full rounded-lg p-[2px] shadow-sm shadow-cyan-100 disabled:cursor-not-allowed disabled:opacity-60 dark:shadow-none"
        >
          <span className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-[6px] bg-white px-3 text-sm font-semibold text-gray-900 dark:bg-gray-950 dark:text-white">
            <AISparkIcon />
            {isLoading ? "Generating..." : "Refresh guidance"}
          </span>
        </button>
        {result ? (
          <p className="mt-2 text-center text-[11px] font-medium text-gray-400 dark:text-gray-500">
            {result.mode === "openai" ? result.model || "OpenAI" : "Fallback"} ·{" "}
            {new Date(result.generatedAt).toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        ) : null}
      </div>
    </section>
  );
}
