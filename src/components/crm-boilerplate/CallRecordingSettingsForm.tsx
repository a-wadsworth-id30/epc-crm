"use client";

import { useActionState, useEffect } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import { updateCallRecordingSettingsAction } from "@/lib/actions/phone-system";

type RecordingSettings = {
  enabled: boolean;
  transcriptEnabled: boolean;
  aiAnalysisEnabled: boolean;
  retentionDays: number;
  notice: string;
};

export type CallRecordingSettingsFormProps = {
  settings: RecordingSettings;
};

export default function CallRecordingSettingsForm({
  settings,
}: CallRecordingSettingsFormProps) {
  const { showToast } = useToast();
  const [state, formAction, isPending] = useActionState(
    updateCallRecordingSettingsAction,
    {
      ok: false,
      message: "",
      savedAt: null,
    },
  );

  useEffect(() => {
    if (!state.message || state.savedAt === null) return;

    showToast(state.message, state.ok ? "success" : "error");
  }, [showToast, state.message, state.ok, state.savedAt]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <ToggleCard
          defaultChecked={settings.enabled}
          detail="Record conference-backed inbound and outbound calls."
          label="Call recording"
          name="enabled"
        />
        <ToggleCard
          defaultChecked={settings.transcriptEnabled}
          detail="Queue recordings for transcript generation."
          label="Transcripts"
          name="transcriptEnabled"
        />
        <ToggleCard
          defaultChecked={settings.aiAnalysisEnabled}
          detail="Allow transcripts to be analysed for summaries and next steps."
          label="AI analysis"
          name="aiAnalysisEnabled"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
            Retention days
          </span>
          <input
            name="retentionDays"
            type="number"
            min={1}
            max={3650}
            defaultValue={settings.retentionDays}
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
            Caller notice
          </span>
          <input
            name="notice"
            defaultValue={settings.notice}
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90"
          />
        </label>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ActionStateMessage state={state.savedAt ? state : undefined} />
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
        >
          {isPending ? "Saving..." : "Save recording settings"}
        </button>
      </div>
    </form>
  );
}

function ToggleCard({
  defaultChecked,
  detail,
  label,
  name,
}: {
  defaultChecked: boolean;
  detail: string;
  label: string;
  name: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <input
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="mt-1 h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
      />
      <span>
        <span className="block text-sm font-semibold text-gray-800 dark:text-white/90">
          {label}
        </span>
        <span className="mt-1 block text-xs leading-5 text-gray-500 dark:text-gray-400">
          {detail}
        </span>
      </span>
    </label>
  );
}
