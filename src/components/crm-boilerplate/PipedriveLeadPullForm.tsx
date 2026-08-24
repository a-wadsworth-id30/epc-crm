"use client";

import { useActionState, useEffect } from "react";
import { Download } from "lucide-react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import {
  pullPipedriveLeadsAction,
  type PipedriveLeadPullActionState,
} from "@/lib/actions/integrations";

const initialState: PipedriveLeadPullActionState = {
  ok: false,
  message: "",
  recordsRead: null,
  recordsWritten: null,
  savedAt: null,
  status: null,
};

export default function PipedriveLeadPullForm({
  disabled,
}: {
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    pullPipedriveLeadsAction,
    initialState,
  );
  const { showToast } = useToast();

  useEffect(() => {
    if (!state.savedAt) return;

    showToast(state.message, state.ok ? "success" : "error");
  }, [showToast, state]);

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <button
        type="submit"
        disabled={disabled || isPending}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.05]"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        {isPending ? "Pulling..." : "Pull latest leads"}
      </button>
      {state.message ? (
        <div className="w-full sm:max-w-md" aria-live="polite">
          <ActionStateMessage state={state} />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {state.recordsRead === null || state.recordsWritten === null
              ? state.status
              : `${state.status ?? "Completed"} - read ${state.recordsRead}, wrote ${state.recordsWritten}.`}
          </p>
        </div>
      ) : null}
    </form>
  );
}
