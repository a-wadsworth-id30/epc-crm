"use client";

import { useActionState, useEffect } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import {
  AILabel,
  AISparkIcon,
} from "@/components/crm-boilerplate/AITheme";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import {
  updateCrmAIContextAction,
  type CrmAIContextSettingsState,
} from "@/lib/actions/settings";
import {
  crmAIToneOptions,
  type CrmAIContext,
} from "@/lib/ai/crm-context";

const initialState: CrmAIContextSettingsState = {
  ok: false,
  message: "",
  savedAt: null,
};

const contextFields: Array<{
  label: string;
  name: keyof CrmAIContext;
  placeholder: string;
}> = [
  {
    label: "Company profile",
    name: "profile",
    placeholder: "Who iD30 is, what the CRM should assume, market position, key facts.",
  },
  {
    label: "Products and services",
    name: "productsServices",
    placeholder: "Core services, packages, delivery model, pricing context if useful.",
  },
  {
    label: "Ideal customers",
    name: "idealCustomers",
    placeholder: "Best-fit customer types, sectors, company sizes, roles, and exclusions.",
  },
  {
    label: "Value proposition",
    name: "valueProposition",
    placeholder: "Why buyers choose us and what outcomes we can credibly promise.",
  },
  {
    label: "Proof points",
    name: "proofPoints",
    placeholder: "Case studies, results, credentials, testimonials, partnerships, differentiators.",
  },
  {
    label: "Competitors and alternatives",
    name: "competitors",
    placeholder: "Known competitors, substitutes, internal alternatives, platform/vendor options.",
  },
  {
    label: "Common objections",
    name: "objections",
    placeholder: "Reasons prospects hesitate and how the team normally handles them.",
  },
  {
    label: "Compliance notes",
    name: "complianceNotes",
    placeholder: "Claims to avoid, regulated wording, approval rules, unsubscribe/compliance notes.",
  },
];

export type CrmAIContextFormProps = {
  aiContext: CrmAIContext;
  canEdit: boolean;
};

export default function CrmAIContextForm({
  aiContext,
  canEdit,
}: CrmAIContextFormProps) {
  const [state, formAction, isPending] = useActionState(
    updateCrmAIContextAction,
    initialState,
  );
  const { showToast } = useToast();

  useEffect(() => {
    if (state.ok) {
      showToast(state.message || "AI context saved.");
    }
  }, [showToast, state.message, state.ok, state.savedAt]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <form
        action={formAction}
        className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <AILabel label="AI context" />
              <h2 className="mt-3 text-base font-semibold text-gray-800 dark:text-white/90">
                Sales AI framework
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
                This is prepended to Sales AI prompts so suggested replies stay aligned with the business.
              </p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
              <AISparkIcon wrapperClassName="size-3.5" />
              CRM-wide
            </span>
          </div>
        </div>

        <div className="space-y-5 p-5">
          <section className="grid gap-4 lg:grid-cols-2">
            {contextFields.map((field) => (
              <TextArea
                key={field.name}
                label={field.label}
                name={field.name}
                value={aiContext[field.name]}
                placeholder={field.placeholder}
                disabled={!canEdit || isPending}
              />
            ))}
          </section>

          <section className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Default tone of voice
                </span>
                <select
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-white/90 dark:focus:ring-brand-900/30"
                  name="tone"
                  defaultValue={aiContext.tone ?? "consultative"}
                  disabled={!canEdit || isPending}
                >
                  {crmAIToneOptions.map((tone) => (
                    <option key={tone} value={tone}>
                      {formatTone(tone)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Custom tone guidance
                </span>
                <input
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-white/90 dark:focus:ring-brand-900/30"
                  name="customTone"
                  defaultValue={aiContext.customTone ?? ""}
                  placeholder="Optional: house style or sales voice"
                  disabled={!canEdit || isPending}
                />
              </label>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <TextArea
                label="Language to use"
                name="doSay"
                value={aiContext.doSay}
                placeholder="Preferred phrases, claims, offers, proof language, sign-offs."
                disabled={!canEdit || isPending}
              />
              <TextArea
                label="Language to avoid"
                name="dontSay"
                value={aiContext.dontSay}
                placeholder="Banned phrases, risky claims, overused wording, tone problems."
                disabled={!canEdit || isPending}
              />
            </div>
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-5 py-4 dark:border-gray-800">
          <ActionStateMessage state={!state.ok ? state : undefined} />
          <button
            type="submit"
            disabled={!canEdit || isPending}
            className="inline-flex rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Save AI context"}
          </button>
        </div>
      </form>

      <aside className="space-y-4">
        <InfoCard
          title="How AI Uses This"
          lines={[
            "Sales AI receives this before lead-specific context.",
            "Suggested emails should inherit the tone, proof points, objections and words to avoid.",
            "Lead-specific facts still come from the conversation, attribution and lead scope.",
          ]}
        />
        <InfoCard
          title="Conversion Learning"
          lines={[
            "OpenAI does not automatically learn which CRM replies convert.",
            "Sales AI now reads recent CRM outcomes from sent emails, replies, stage movement and won/lost records.",
            "Keep this framework factual; the app adds performance signals separately when generating recommendations.",
          ]}
        />
      </aside>
    </div>
  );
}

function TextArea({
  disabled,
  label,
  name,
  placeholder,
  value,
}: {
  disabled: boolean;
  label: string;
  name: string;
  placeholder: string;
  value?: string;
}) {
  return (
    <label className="space-y-1">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </span>
      <textarea
        className="min-h-28 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-white/90 dark:focus:ring-brand-900/30"
        name={name}
        defaultValue={value ?? ""}
        placeholder={placeholder}
        disabled={disabled}
      />
    </label>
  );
}

function InfoCard({ lines, title }: { lines: string[]; title: string }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
        {title}
      </h3>
      <div className="mt-3 space-y-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </section>
  );
}

function formatTone(tone: string) {
  return tone
    .split("-")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}
