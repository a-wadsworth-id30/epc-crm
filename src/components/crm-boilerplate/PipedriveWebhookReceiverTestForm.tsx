"use client";

import { useActionState, useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import {
  testPipedriveWebhookReceiverAction,
  type PipedriveWebhookReceiverTestState,
} from "@/lib/actions/integrations";

const initialState: PipedriveWebhookReceiverTestState = {
  ok: false,
  message: "",
  savedAt: null,
};

export default function PipedriveWebhookReceiverTestForm({
  disabled,
}: {
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    testPipedriveWebhookReceiverAction,
    initialState,
  );
  const { showToast } = useToast();

  useEffect(() => {
    if (state.ok && state.savedAt) showToast(state.message);
  }, [showToast, state]);

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <button
        type="submit"
        disabled={disabled || isPending}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.05]"
      >
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        {isPending ? "Testing..." : "Test receiver"}
      </button>
      {state.message ? (
        <div className="w-full sm:max-w-sm">
          <ActionStateMessage state={state} />
        </div>
      ) : null}
    </form>
  );
}
