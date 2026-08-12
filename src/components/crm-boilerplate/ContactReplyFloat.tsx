"use client";

import {
  AILabel,
  AISparkIcon,
} from "@/components/crm-boilerplate/AITheme";
import { PhoneIcon } from "@/components/crm-boilerplate/SoftphoneIcons";
import { ChevronUpIcon, CloseIcon, MailIcon, PaperPlaneIcon } from "@/icons";

export type ContactReplyChannelKey = "email" | "sms" | "phone";
export type ContactReplyToneKey = "professional" | "friendly" | "direct";

export type ContactAIResult = {
  summary: string;
  nextStep: {
    title: string;
    rationale: string;
    urgency: "low" | "medium" | "high";
    channel: "Email" | "SMS" | "Phone";
  };
  stageRecommendation: {
    action: "stay" | "consider_move" | "ready_to_move";
    targetStage: string | null;
    rationale: string;
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

export type ContactReplyFloatProps = {
  contactName: string;
  draft: string;
  emailSubject: string;
  error: string | null;
  isFullScreen: boolean;
  isLoading: boolean;
  isOpen: boolean;
  isPending: boolean;
  onClose: () => void;
  onDraftChange: (value: string) => void;
  onEmailSubjectChange: (value: string) => void;
  onOpen: () => void;
  onRegenerate: () => void;
  onSubmit: () => void;
  onToggleFullScreen: () => void;
  recipientEmail: string | null;
  recipientPhone: string | null;
  result: ContactAIResult | null;
  selectedChannel: ContactReplyChannelKey;
  selectedTone: ContactReplyToneKey;
  setSelectedChannel: (channel: ContactReplyChannelKey) => void;
  setSelectedTone: (tone: ContactReplyToneKey) => void;
};

const channels: Array<{ key: ContactReplyChannelKey; label: string }> = [
  { key: "email", label: "Email" },
  { key: "sms", label: "SMS" },
  { key: "phone", label: "Phone script" },
];

const tones: Array<{ key: ContactReplyToneKey; label: string }> = [
  { key: "professional", label: "Professional" },
  { key: "friendly", label: "Friendly" },
  { key: "direct", label: "Direct" },
];

function AIGradientButton({
  children,
  className = "",
  disabled,
  onClick,
  type = "button",
}: {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`ai-gradient-button inline-flex rounded-lg p-[2px] shadow-sm shadow-cyan-100 transition disabled:cursor-not-allowed disabled:opacity-60 dark:shadow-none ${className}`}
    >
      <span className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[6px] bg-white px-3 text-sm font-semibold text-gray-900 dark:bg-gray-950 dark:text-white">
        {children}
      </span>
    </button>
  );
}

function ContactReplyComposer({
  contactName,
  draft,
  emailSubject,
  error,
  isFullScreen,
  isLoading,
  isPending,
  onClose,
  onDraftChange,
  onEmailSubjectChange,
  onRegenerate,
  onSubmit,
  onToggleFullScreen,
  recipientEmail,
  recipientPhone,
  result,
  selectedChannel,
  selectedTone,
  setSelectedChannel,
  setSelectedTone,
}: Omit<ContactReplyFloatProps, "isOpen" | "onOpen">) {
  const isPhone = selectedChannel === "phone";
  const isEmail = selectedChannel === "email";
  const primaryLabel = isPhone
    ? "Click to call"
    : isEmail
      ? "Send email"
      : "Send SMS";
  const primaryDisabled =
    isPending ||
    (selectedChannel === "sms" && !recipientPhone) ||
    (isPhone && !recipientPhone) ||
    (isEmail && !recipientEmail);
  const textareaClassName = isFullScreen
    ? "h-[min(54dvh,560px)]"
    : "h-48 sm:h-64";

  return (
    <section
      className={`flex min-h-0 flex-col border border-purple-100 bg-white shadow-2xl shadow-gray-950/10 dark:border-purple-900/40 dark:bg-gray-950 dark:shadow-black/40 ${
        isFullScreen
          ? "h-[calc(100dvh-1.5rem)] rounded-3xl p-3 sm:p-4"
          : "max-h-[min(86dvh,820px)] rounded-t-3xl p-3 sm:rounded-3xl sm:p-4"
      }`}
    >
      <div className="rounded-xl bg-gradient-to-r from-purple-50 via-white to-cyan-50 p-2.5 ring-1 ring-purple-100 dark:from-purple-500/10 dark:via-white/[0.02] dark:to-cyan-500/10 dark:ring-purple-900/40">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <AILabel label="AI reply" />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedTone}
              onChange={(event) =>
                setSelectedTone(event.target.value as ContactReplyToneKey)
              }
              className="h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-600 shadow-theme-xs outline-none focus:border-brand-300 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300"
              aria-label="AI reply tone"
            >
              {tones.map((tone) => (
                <option key={tone.key} value={tone.key}>
                  {tone.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onRegenerate}
              disabled={isLoading}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-purple-100 bg-white px-3 text-xs font-semibold text-purple-700 shadow-theme-xs transition hover:border-purple-200 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-purple-900/40 dark:bg-gray-950 dark:text-purple-300 dark:hover:bg-purple-900/20"
            >
              <AISparkIcon wrapperClassName="size-3.5" />
              {isLoading ? "Generating..." : "Regenerate"}
            </button>
            <button
              type="button"
              onClick={onToggleFullScreen}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 shadow-theme-xs transition hover:border-gray-300 hover:text-gray-800 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:text-white"
            >
              {isFullScreen ? "Compact" : "Full screen"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-theme-xs transition hover:border-gray-300 hover:text-gray-800 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400 dark:hover:text-white"
              aria-label="Close AI reply composer"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1 dark:bg-white/[0.04]">
        {channels.map((channel) => (
          <button
            key={channel.key}
            type="button"
            onClick={() => setSelectedChannel(channel.key)}
            className={`inline-flex h-8 min-w-0 items-center justify-center rounded-md px-2 text-xs font-semibold transition ${
              selectedChannel === channel.key
                ? "bg-white text-gray-900 shadow-theme-xs dark:bg-gray-900 dark:text-white"
                : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
            }`}
          >
            <span className="truncate">{channel.label}</span>
          </button>
        ))}
      </div>

      <div
        className={`mt-3 min-h-0 overflow-y-auto ${
          isFullScreen
            ? "grid flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_220px]"
            : "grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px]"
        }`}
      >
        <div className="min-w-0">
          {isEmail ? (
            <input
              value={emailSubject}
              onChange={(event) => onEmailSubjectChange(event.target.value)}
              placeholder="Email subject"
              className="mb-2 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-800 shadow-theme-xs outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-950 dark:text-white/90"
            />
          ) : null}
          {isPhone ? (
            <div className="mb-2 rounded-lg border border-purple-100 bg-purple-50/70 px-3 py-2 text-xs leading-5 text-purple-800 dark:border-purple-900/40 dark:bg-purple-500/10 dark:text-purple-200">
              <span className="font-semibold">Call objective:</span> recap the
              latest customer context and agree the next action.
            </div>
          ) : null}
          <textarea
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            rows={isPhone ? 7 : 6}
            className={`${textareaClassName} w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm leading-6 text-gray-800 shadow-theme-xs transition outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90`}
            placeholder="Generate or write a follow-up..."
          />
          {result?.risks.length ? (
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
              {result.risks[0]}
            </p>
          ) : null}
          {error ? (
            <p className="mt-2 text-xs leading-5 text-error-600 dark:text-error-400">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col justify-between gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2.5 sm:gap-3 sm:p-3 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="space-y-1 text-xs leading-5 text-gray-500 sm:space-y-2 dark:text-gray-400">
            <p className="font-semibold text-gray-700 dark:text-gray-200">
              {isPhone
                ? recipientPhone || "No phone number"
                : isEmail
                  ? recipientEmail || "No email address"
                  : recipientPhone || "No phone number"}
            </p>
            <p className="hidden sm:block">{contactName}</p>
            <p className="hidden sm:block">
              {result
                ? `${result.mode === "openai" ? result.model || "OpenAI" : "Fallback"} - ${new Date(result.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}`
                : "AI draft not generated yet"}
            </p>
          </div>
          <AIGradientButton
            className="w-full"
            disabled={primaryDisabled}
            onClick={onSubmit}
          >
            {isPhone ? (
              <PhoneIcon className="h-4 w-4" />
            ) : isEmail ? (
              <MailIcon className="h-4 w-4" />
            ) : (
              <PaperPlaneIcon className="h-4 w-4" />
            )}
            {isPending ? "Sending..." : primaryLabel}
          </AIGradientButton>
        </div>
      </div>
    </section>
  );
}

export function ContactReplyFloat({
  contactName,
  draft,
  emailSubject,
  error,
  isFullScreen,
  isLoading,
  isOpen,
  isPending,
  onClose,
  onDraftChange,
  onEmailSubjectChange,
  onOpen,
  onRegenerate,
  onSubmit,
  onToggleFullScreen,
  recipientEmail,
  recipientPhone,
  result,
  selectedChannel,
  selectedTone,
  setSelectedChannel,
  setSelectedTone,
}: ContactReplyFloatProps) {
  const channelLabel =
    channels.find((channel) => channel.key === selectedChannel)?.label ??
    "Reply";
  const actionLabel =
    selectedChannel === "phone"
      ? "Call"
      : selectedChannel === "sms"
        ? "SMS"
        : "Email";
  const preview = draft.trim() || "Generate or edit the next response";

  if (isOpen) {
    if (!isFullScreen) {
      return (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 z-40 bg-gray-950/15 backdrop-blur-[0.5px] dark:bg-black/35"
          />
          <div className="sticky bottom-0 z-50 mt-4">
            <div className="ai-bottom-sheet-enter">
              <ContactReplyComposer
                contactName={contactName}
                draft={draft}
                emailSubject={emailSubject}
                error={error}
                isFullScreen={isFullScreen}
                isLoading={isLoading}
                isPending={isPending}
                onClose={onClose}
                onDraftChange={onDraftChange}
                onEmailSubjectChange={onEmailSubjectChange}
                onRegenerate={onRegenerate}
                onSubmit={onSubmit}
                onToggleFullScreen={onToggleFullScreen}
                recipientEmail={recipientEmail}
                recipientPhone={recipientPhone}
                result={result}
                selectedChannel={selectedChannel}
                selectedTone={selectedTone}
                setSelectedChannel={setSelectedChannel}
                setSelectedTone={setSelectedTone}
              />
            </div>
          </div>
        </>
      );
    }

    return (
      <>
        <div
          className="fixed inset-0 z-[100000] bg-gray-950/20 backdrop-blur-[1.5px] dark:bg-black/45"
          onClick={onClose}
          aria-hidden="true"
        />
        <div className="fixed inset-x-0 bottom-0 top-0 z-[100001] px-3 pb-3 pt-3 sm:px-5 sm:pb-5 sm:pt-5">
          <div className="ai-bottom-sheet-enter mx-auto h-full w-full">
            <ContactReplyComposer
              contactName={contactName}
              draft={draft}
              emailSubject={emailSubject}
              error={error}
              isFullScreen={isFullScreen}
              isLoading={isLoading}
              isPending={isPending}
              onClose={onClose}
              onDraftChange={onDraftChange}
              onEmailSubjectChange={onEmailSubjectChange}
              onRegenerate={onRegenerate}
              onSubmit={onSubmit}
              onToggleFullScreen={onToggleFullScreen}
              recipientEmail={recipientEmail}
              recipientPhone={recipientPhone}
              result={result}
              selectedChannel={selectedChannel}
              selectedTone={selectedTone}
              setSelectedChannel={setSelectedChannel}
              setSelectedTone={setSelectedTone}
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="sticky bottom-4 z-40 mt-4">
      <div className="rounded-2xl bg-white/70 p-1 backdrop-blur-sm dark:bg-gray-950/70">
        <button
          type="button"
          onClick={onOpen}
          className="ai-gradient-button block w-full rounded-2xl p-[2px] text-left shadow-2xl shadow-gray-950/15 transition hover:-translate-y-0.5 dark:shadow-black/50"
          aria-label="Open AI reply composer"
        >
          <span className="flex min-h-[64px] items-center gap-3 rounded-[14px] bg-white px-3 py-2.5 sm:px-4 dark:bg-gray-950">
            <span className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-cyan-50 via-emerald-50 to-lime-50 ring-1 ring-cyan-100 dark:from-cyan-500/10 dark:via-emerald-500/10 dark:to-lime-500/10 dark:ring-cyan-900/40">
              <AISparkIcon wrapperClassName="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-gray-800 dark:text-white/90">
                  AI reply
                </span>
                <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700 ring-1 ring-purple-100 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-900/40">
                  {channelLabel}
                </span>
                {isLoading ? (
                  <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                    Generating...
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
                {preview}
              </span>
            </span>
            <span className="hidden shrink-0 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 sm:inline-flex dark:border-gray-800 dark:bg-white/[0.04] dark:text-gray-300">
              {actionLabel} draft
            </span>
            <ChevronUpIcon className="h-5 w-5 shrink-0 text-gray-400" />
          </span>
        </button>
      </div>
    </div>
  );
}
